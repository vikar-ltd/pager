// Package ingest writes pageviews and custom events from the tracker snippet
// into Mongo, upserting visitor and tracking_session rows along the way.
package ingest

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vikar-ltd/pager/api/internal/geo"
	"github.com/vikar-ltd/pager/api/internal/goals"
	"github.com/vikar-ltd/pager/api/internal/httpx"
	"github.com/vikar-ltd/pager/api/internal/properties"
)

const (
	VisitorsColl  = "visitors"
	SessionsColl  = "tracking_sessions"
	EventsColl    = "events"
)

type UTM struct {
	Source   string `bson:"source,omitempty"   json:"source,omitempty"`
	Medium   string `bson:"medium,omitempty"   json:"medium,omitempty"`
	Campaign string `bson:"campaign,omitempty" json:"campaign,omitempty"`
	Term     string `bson:"term,omitempty"     json:"term,omitempty"`
	Content  string `bson:"content,omitempty"  json:"content,omitempty"`
}

func (u UTM) IsEmpty() bool {
	return u.Source == "" && u.Medium == "" && u.Campaign == "" && u.Term == "" && u.Content == ""
}

type payload struct {
	SiteID  string         `json:"siteId"`
	V       string         `json:"v"`
	S       string         `json:"s"`
	Type    string         `json:"type"`
	Name    string         `json:"name,omitempty"`
	URL     string         `json:"url"`
	Path    string         `json:"path"`
	Ref     string         `json:"ref,omitempty"`
	UTM     UTM            `json:"utm,omitempty"`
	Screen  *screen        `json:"screen,omitempty"`
	Lang    string         `json:"lang,omitempty"`
	TZ      string         `json:"tz,omitempty"`
	Props   map[string]any `json:"props,omitempty"`
}

type screen struct {
	W int `json:"w" bson:"w"`
	H int `json:"h" bson:"h"`
}

type Ingester struct {
	DB         *mongo.Database
	Properties *properties.Store
	Goals      *goals.Store
	Geo        *geo.Resolver
}

func New(db *mongo.Database, props *properties.Store, gls *goals.Store, g *geo.Resolver) *Ingester {
	return &Ingester{DB: db, Properties: props, Goals: gls, Geo: g}
}

// Handler is POST /pub/collect. Open CORS, validates the body, resolves the
// property, then writes one event + upserts visitor and tracking_session.
func (i *Ingester) Handler(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		httpx.WriteErr(w, httpx.Errorf(http.StatusMethodNotAllowed, "method", "POST required"))
		return
	}

	var p payload
	if err := httpx.ReadJSON(r, &p); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := validate(&p); err != nil {
		httpx.WriteErr(w, err)
		return
	}

	prop, err := i.Properties.FindBySiteID(r.Context(), p.SiteID)
	if err != nil {
		if errors.Is(err, properties.ErrNotFound) {
			// Unknown siteId — return 204 so a misconfigured snippet doesn't show up in browser consoles.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		httpx.WriteErr(w, err)
		return
	}

	now := time.Now().UTC()
	country := i.Geo.Country(httpx.ClientIP(r))

	if err := i.upsertVisitor(r.Context(), prop.ID, p.V, now, country, p.UTM, p.Ref); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := i.upsertSession(r.Context(), prop.ID, p.V, p.S, now, country, p.UTM, p.URL, p.Ref); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := i.writeEvent(r.Context(), prop.ID, &p, now, country); err != nil {
		httpx.WriteErr(w, err)
		return
	}

	// Goal matching: any goal hits get added to the session's goalsHit set.
	if hits, err := i.Goals.Match(r.Context(), prop.ID, p.Type, p.Name, p.Path); err == nil && len(hits) > 0 {
		_, _ = i.DB.Collection(SessionsColl).UpdateOne(r.Context(),
			bson.M{"_id": p.S, "propertyId": prop.ID},
			bson.M{"$addToSet": bson.M{"goalsHit": bson.M{"$each": hits}}},
		)
	}

	w.WriteHeader(http.StatusNoContent)
}

func validate(p *payload) error {
	if p.SiteID == "" || p.V == "" || p.S == "" {
		return httpx.Errorf(http.StatusBadRequest, "missing_fields", "siteId, v, s required")
	}
	if p.Type != "pageview" && p.Type != "event" {
		return httpx.Errorf(http.StatusBadRequest, "bad_type", "type must be pageview or event")
	}
	if p.Type == "event" && strings.TrimSpace(p.Name) == "" {
		return httpx.Errorf(http.StatusBadRequest, "missing_name", "event name required")
	}
	if p.URL == "" || p.Path == "" {
		return httpx.Errorf(http.StatusBadRequest, "missing_url", "url and path required")
	}
	return nil
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

func (i *Ingester) upsertVisitor(ctx context.Context, propID primitive.ObjectID, visitorID string, now time.Time, country string, utm UTM, referrer string) error {
	setOnInsert := bson.M{
		"propertyId":     propID,
		"firstSeen":      now,
		"firstReferrer":  referrer,
		"country":        country,
	}
	if !utm.IsEmpty() {
		setOnInsert["firstUtm"] = utm
	}
	_, err := i.DB.Collection(VisitorsColl).UpdateOne(ctx,
		bson.M{"_id": visitorID, "propertyId": propID},
		bson.M{
			"$setOnInsert": setOnInsert,
			"$set":         bson.M{"lastSeen": now},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

func (i *Ingester) upsertSession(ctx context.Context, propID primitive.ObjectID, visitorID, sessionID string, now time.Time, country string, utm UTM, entryURL, referrer string) error {
	setOnInsert := bson.M{
		"propertyId":        propID,
		"visitorId":         visitorID,
		"startedAt":         now,
		"entryUrl":          entryURL,
		"country":           country,
		"firstReferrer":     referrer,
		"firstReferrerHost": referrerHost(referrer),
	}
	if !utm.IsEmpty() {
		setOnInsert["utm"] = utm
	}
	_, err := i.DB.Collection(SessionsColl).UpdateOne(ctx,
		bson.M{"_id": sessionID, "propertyId": propID},
		bson.M{
			"$setOnInsert": setOnInsert,
			"$set":         bson.M{"lastSeen": now, "exitUrl": entryURL},
			"$inc":         bson.M{"eventCount": 1},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

// referrerHost extracts the hostname so the sources report doesn't have to
// parse a URL per row at read time. Returns "" for empty / malformed input.
func referrerHost(ref string) string {
	if ref == "" {
		return ""
	}
	u, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

func (i *Ingester) writeEvent(ctx context.Context, propID primitive.ObjectID, p *payload, now time.Time, country string) error {
	doc := bson.M{
		"_id":        primitive.NewObjectID(),
		"propertyId": propID,
		"visitorId":  p.V,
		"sessionId":  p.S,
		"type":       p.Type,
		"url":        p.URL,
		"path":       p.Path,
		"ts":         now,
		"country":    country,
	}
	if p.Name != "" {
		doc["name"] = p.Name
	}
	if p.Ref != "" {
		doc["referrer"] = p.Ref
	}
	if !p.UTM.IsEmpty() {
		doc["utm"] = p.UTM
	}
	if p.Lang != "" {
		doc["lang"] = p.Lang
	}
	if p.TZ != "" {
		doc["tz"] = p.TZ
	}
	if p.Screen != nil {
		doc["screen"] = p.Screen
	}
	if len(p.Props) > 0 {
		doc["props"] = p.Props
	}
	_, err := i.DB.Collection(EventsColl).InsertOne(ctx, doc)
	return err
}

// Package reports owns the aggregation queries that back the admin dashboard.
// Each method maps to one HTTP endpoint and returns shapes the UI consumes
// directly — no further client-side reduction needed.
package reports

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Store struct{ DB *mongo.Database }

func NewStore(db *mongo.Database) *Store { return &Store{DB: db} }

// ---------------- Overview ----------------

type OverviewTotals struct {
	Visitors  int64 `json:"visitors"`
	Sessions  int64 `json:"sessions"`
	Pageviews int64 `json:"pageviews"`
	Events    int64 `json:"events"`
}

type OverviewBucket struct {
	T         time.Time `json:"t"`
	Visitors  int64     `json:"visitors"`
	Sessions  int64     `json:"sessions"`
	Pageviews int64     `json:"pageviews"`
}

type Overview struct {
	Range      Range            `json:"range"`
	Totals     OverviewTotals   `json:"totals"`
	Timeseries []OverviewBucket `json:"timeseries"`
}

type Range struct {
	From time.Time `json:"from"`
	To   time.Time `json:"to"`
	Unit string    `json:"unit"` // "hour" or "day"
}

func (s *Store) Overview(ctx context.Context, propID primitive.ObjectID, r Range) (Overview, error) {
	out := Overview{Range: r}

	// Totals — counts over events in range.
	matchRange := bson.M{
		"propertyId": propID,
		"ts":         bson.M{"$gte": r.From, "$lt": r.To},
	}
	pageviewsMatch := bson.M{}
	for k, v := range matchRange {
		pageviewsMatch[k] = v
	}
	pageviewsMatch["type"] = "pageview"

	eventsMatch := bson.M{}
	for k, v := range matchRange {
		eventsMatch[k] = v
	}
	eventsMatch["type"] = "event"

	// Counts via $countDocuments (cheap).
	if n, err := s.DB.Collection("events").CountDocuments(ctx, pageviewsMatch); err != nil {
		return out, err
	} else {
		out.Totals.Pageviews = n
	}
	if n, err := s.DB.Collection("events").CountDocuments(ctx, eventsMatch); err != nil {
		return out, err
	} else {
		out.Totals.Events = n
	}

	// Distinct visitor/session counts — single aggregation.
	type distinctRow struct {
		ID       int   `bson:"_id"`
		Visitors int64 `bson:"visitors"`
		Sessions int64 `bson:"sessions"`
	}
	cur, err := s.DB.Collection("events").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: matchRange}},
		{{Key: "$group", Value: bson.M{
			"_id":       0,
			"visitors":  bson.M{"$addToSet": "$visitorId"},
			"sessions":  bson.M{"$addToSet": "$sessionId"},
		}}},
		{{Key: "$project", Value: bson.M{
			"visitors": bson.M{"$size": "$visitors"},
			"sessions": bson.M{"$size": "$sessions"},
		}}},
	})
	if err != nil {
		return out, err
	}
	defer cur.Close(ctx)
	if cur.Next(ctx) {
		var row distinctRow
		if err := cur.Decode(&row); err == nil {
			out.Totals.Visitors = row.Visitors
			out.Totals.Sessions = row.Sessions
		}
	}

	// Timeseries.
	tsCur, err := s.DB.Collection("events").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: matchRange}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateTrunc": bson.M{"date": "$ts", "unit": r.Unit, "timezone": "UTC"},
			},
			"visitors":  bson.M{"$addToSet": "$visitorId"},
			"sessions":  bson.M{"$addToSet": "$sessionId"},
			"pageviews": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$type", "pageview"}}, 1, 0}}},
		}}},
		{{Key: "$project", Value: bson.M{
			"_id":       0,
			"t":         "$_id",
			"visitors":  bson.M{"$size": "$visitors"},
			"sessions":  bson.M{"$size": "$sessions"},
			"pageviews": "$pageviews",
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "t", Value: 1}}}},
	})
	if err != nil {
		return out, err
	}
	defer tsCur.Close(ctx)
	for tsCur.Next(ctx) {
		var b OverviewBucket
		if err := tsCur.Decode(&b); err == nil {
			out.Timeseries = append(out.Timeseries, b)
		}
	}
	if out.Timeseries == nil {
		out.Timeseries = []OverviewBucket{}
	}
	return out, nil
}

// ---------------- Campaigns ----------------

type CampaignRow struct {
	Key            string  `json:"key"`             // "" means "(none)"
	Sessions       int64   `json:"sessions"`
	Visitors       int64   `json:"visitors"`
	Conversions    int64   `json:"conversions"`     // sessions with >=1 goal hit
	ConversionRate float64 `json:"conversionRate"`  // 0..1
}

// Campaigns groups tracking_sessions by one of utm.source / medium / campaign.
// Sessions without that utm field roll into the "" bucket so users always see
// the "no utm" baseline.
func (s *Store) Campaigns(ctx context.Context, propID primitive.ObjectID, r Range, groupBy string) ([]CampaignRow, error) {
	field := "utm." + groupBy
	cur, err := s.DB.Collection("tracking_sessions").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"propertyId": propID,
			"startedAt":  bson.M{"$gte": r.From, "$lt": r.To},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":         bson.M{"$ifNull": bson.A{"$" + field, ""}},
			"sessions":    bson.M{"$sum": 1},
			"visitors":    bson.M{"$addToSet": "$visitorId"},
			"conversions": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$gt": bson.A{bson.M{"$size": bson.M{"$ifNull": bson.A{"$goalsHit", bson.A{}}}}, 0}},
				1, 0,
			}}},
		}}},
		{{Key: "$project", Value: bson.M{
			"_id":         0,
			"key":         "$_id",
			"sessions":    1,
			"visitors":    bson.M{"$size": "$visitors"},
			"conversions": 1,
			"conversionRate": bson.M{"$cond": bson.A{
				bson.M{"$gt": bson.A{"$sessions", 0}},
				bson.M{"$divide": bson.A{"$conversions", "$sessions"}},
				0,
			}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "sessions", Value: -1}}}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []CampaignRow
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	if out == nil {
		out = []CampaignRow{}
	}
	return out, nil
}

// ---------------- Sources ----------------

type SourceRow struct {
	Host           string  `json:"host"`
	Sessions       int64   `json:"sessions"`
	Visitors       int64   `json:"visitors"`
	Conversions    int64   `json:"conversions"`
	ConversionRate float64 `json:"conversionRate"`
}

func (s *Store) Sources(ctx context.Context, propID primitive.ObjectID, r Range) ([]SourceRow, error) {
	cur, err := s.DB.Collection("tracking_sessions").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"propertyId": propID,
			"startedAt":  bson.M{"$gte": r.From, "$lt": r.To},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":         bson.M{"$ifNull": bson.A{"$firstReferrerHost", ""}},
			"sessions":    bson.M{"$sum": 1},
			"visitors":    bson.M{"$addToSet": "$visitorId"},
			"conversions": bson.M{"$sum": bson.M{"$cond": bson.A{
				bson.M{"$gt": bson.A{bson.M{"$size": bson.M{"$ifNull": bson.A{"$goalsHit", bson.A{}}}}, 0}},
				1, 0,
			}}},
		}}},
		{{Key: "$project", Value: bson.M{
			"_id":         0,
			"host":        "$_id",
			"sessions":    1,
			"visitors":    bson.M{"$size": "$visitors"},
			"conversions": 1,
			"conversionRate": bson.M{"$cond": bson.A{
				bson.M{"$gt": bson.A{"$sessions", 0}},
				bson.M{"$divide": bson.A{"$conversions", "$sessions"}},
				0,
			}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "sessions", Value: -1}}}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []SourceRow
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	if out == nil {
		out = []SourceRow{}
	}
	return out, nil
}

// ---------------- Visitors ----------------

type VisitorRow struct {
	ID            string    `bson:"_id"          json:"id"`
	FirstSeen     time.Time `bson:"firstSeen"    json:"firstSeen"`
	LastSeen      time.Time `bson:"lastSeen"     json:"lastSeen"`
	Country       string    `bson:"country"      json:"country"`
	FirstReferrer string    `bson:"firstReferrer" json:"firstReferrer"`
	FirstUTM      *struct {
		Source   string `bson:"source,omitempty"   json:"source,omitempty"`
		Medium   string `bson:"medium,omitempty"   json:"medium,omitempty"`
		Campaign string `bson:"campaign,omitempty" json:"campaign,omitempty"`
	} `bson:"firstUtm,omitempty" json:"firstUtm,omitempty"`
	Sessions int64 `bson:"sessions" json:"sessions"`
}

func (s *Store) Visitors(ctx context.Context, propID primitive.ObjectID, r Range, limit int64) ([]VisitorRow, error) {
	if limit <= 0 {
		limit = 50
	}
	cur, err := s.DB.Collection("visitors").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"propertyId": propID,
			"lastSeen":   bson.M{"$gte": r.From, "$lt": r.To},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "lastSeen", Value: -1}}}},
		{{Key: "$limit", Value: limit}},
		{{Key: "$lookup", Value: bson.M{
			"from":         "tracking_sessions",
			"localField":   "_id",
			"foreignField": "visitorId",
			"as":           "_sessions",
		}}},
		{{Key: "$addFields", Value: bson.M{"sessions": bson.M{"$size": "$_sessions"}}}},
		{{Key: "$project", Value: bson.M{"_sessions": 0, "propertyId": 0}}},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []VisitorRow
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	if out == nil {
		out = []VisitorRow{}
	}
	return out, nil
}

// ---------------- Visitor timeline ----------------

type TimelineEvent struct {
	ID    primitive.ObjectID `bson:"_id"      json:"id"`
	Type  string             `bson:"type"     json:"type"`
	Name  string             `bson:"name,omitempty" json:"name,omitempty"`
	URL   string             `bson:"url"      json:"url"`
	Path  string             `bson:"path"     json:"path"`
	Ref   string             `bson:"referrer,omitempty" json:"ref,omitempty"`
	TS    time.Time          `bson:"ts"       json:"ts"`
	Props map[string]any     `bson:"props,omitempty" json:"props,omitempty"`
}

type TimelineSession struct {
	ID            string          `bson:"_id"           json:"id"`
	StartedAt     time.Time       `bson:"startedAt"     json:"startedAt"`
	LastSeen      time.Time       `bson:"lastSeen"      json:"lastSeen"`
	EntryUrl      string          `bson:"entryUrl"      json:"entryUrl"`
	ExitUrl       string          `bson:"exitUrl"       json:"exitUrl"`
	UTM           map[string]any  `bson:"utm,omitempty" json:"utm,omitempty"`
	Country       string          `bson:"country"       json:"country"`
	FirstReferrer string          `bson:"firstReferrer" json:"firstReferrer"`
	GoalsHit      []primitive.ObjectID `bson:"goalsHit,omitempty" json:"goalsHit,omitempty"`
	Events        []TimelineEvent `json:"events"`
}

type Timeline struct {
	VisitorID string            `json:"visitorId"`
	Sessions  []TimelineSession `json:"sessions"`
}

// VisitorTimeline returns all sessions for a visitor with their events nested.
// Cheap for v1 (single visitor) — no pagination yet.
func (s *Store) VisitorTimeline(ctx context.Context, propID primitive.ObjectID, visitorID string) (Timeline, error) {
	out := Timeline{VisitorID: visitorID, Sessions: []TimelineSession{}}

	cur, err := s.DB.Collection("tracking_sessions").Find(ctx,
		bson.M{"propertyId": propID, "visitorId": visitorID},
		options.Find().SetSort(bson.D{{Key: "startedAt", Value: -1}}),
	)
	if err != nil {
		return out, err
	}
	defer cur.Close(ctx)
	var sessions []TimelineSession
	if err := cur.All(ctx, &sessions); err != nil {
		return out, err
	}
	if len(sessions) == 0 {
		return out, nil
	}

	// Fetch events for these sessions in one query.
	sessionIDs := make([]string, len(sessions))
	for i, s := range sessions {
		sessionIDs[i] = s.ID
	}
	evCur, err := s.DB.Collection("events").Find(ctx,
		bson.M{"sessionId": bson.M{"$in": sessionIDs}},
		options.Find().SetSort(bson.D{{Key: "ts", Value: 1}}),
	)
	if err != nil {
		return out, err
	}
	defer evCur.Close(ctx)

	type rawEvent struct {
		TimelineEvent `bson:",inline"`
		SessionID     string `bson:"sessionId"`
	}
	byID := map[string][]TimelineEvent{}
	for evCur.Next(ctx) {
		var re rawEvent
		if err := evCur.Decode(&re); err != nil {
			continue
		}
		byID[re.SessionID] = append(byID[re.SessionID], re.TimelineEvent)
	}
	for i := range sessions {
		sessions[i].Events = byID[sessions[i].ID]
		if sessions[i].Events == nil {
			sessions[i].Events = []TimelineEvent{}
		}
	}
	out.Sessions = sessions
	return out, nil
}

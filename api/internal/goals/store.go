// Package goals owns conversion goals. A goal is either:
//   - kind="url"   — pattern is a regex matched against event.path
//   - kind="event" — pattern is the exact custom event name (event.name)
//
// The matcher is invoked from the ingest path so the tracking_session row
// accumulates the set of goal IDs hit during that session.
package goals

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const Collection = "goals"

var ErrNotFound = errors.New("goal not found")

const (
	KindURL   = "url"
	KindEvent = "event"
)

type Goal struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	PropertyID primitive.ObjectID `bson:"propertyId"    json:"propertyId"`
	Name       string             `bson:"name"          json:"name"`
	Kind       string             `bson:"kind"          json:"kind"`
	Pattern    string             `bson:"pattern"       json:"pattern"`
	CreatedAt  time.Time          `bson:"createdAt"     json:"createdAt"`
}

type Store struct {
	c *mongo.Collection

	// cache compiled URL regexes; keyed by goal ObjectID hex.
	mu    sync.RWMutex
	cache map[string]*regexp.Regexp
}

func NewStore(c *mongo.Collection) *Store {
	return &Store{c: c, cache: map[string]*regexp.Regexp{}}
}

func validateKindPattern(kind, pattern string) error {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return fmt.Errorf("pattern required")
	}
	switch kind {
	case KindURL:
		if _, err := regexp.Compile(pattern); err != nil {
			return fmt.Errorf("invalid regex: %w", err)
		}
	case KindEvent:
		// any non-empty string is fine
	default:
		return fmt.Errorf("kind must be 'url' or 'event'")
	}
	return nil
}

func (s *Store) Create(ctx context.Context, propID primitive.ObjectID, name, kind, pattern string) (Goal, error) {
	if err := validateKindPattern(kind, pattern); err != nil {
		return Goal{}, err
	}
	g := Goal{
		ID:         primitive.NewObjectID(),
		PropertyID: propID,
		Name:       strings.TrimSpace(name),
		Kind:       kind,
		Pattern:    pattern,
		CreatedAt:  time.Now().UTC(),
	}
	if g.Name == "" {
		return Goal{}, fmt.Errorf("name required")
	}
	if _, err := s.c.InsertOne(ctx, g); err != nil {
		return Goal{}, err
	}
	return g, nil
}

func (s *Store) ListForProperty(ctx context.Context, propID primitive.ObjectID) ([]Goal, error) {
	cur, err := s.c.Find(ctx, bson.M{"propertyId": propID})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []Goal
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) Update(ctx context.Context, id primitive.ObjectID, name, pattern *string) (Goal, error) {
	current, err := s.findByID(ctx, id)
	if err != nil {
		return Goal{}, err
	}
	set := bson.M{}
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" {
			return Goal{}, fmt.Errorf("name cannot be empty")
		}
		set["name"] = trimmed
	}
	if pattern != nil {
		if err := validateKindPattern(current.Kind, *pattern); err != nil {
			return Goal{}, err
		}
		set["pattern"] = *pattern
	}
	if len(set) == 0 {
		return current, nil
	}
	if _, err := s.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set}); err != nil {
		return Goal{}, err
	}
	s.invalidate(id)
	return s.findByID(ctx, id)
}

func (s *Store) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := s.c.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	s.invalidate(id)
	return nil
}

func (s *Store) findByID(ctx context.Context, id primitive.ObjectID) (Goal, error) {
	var out Goal
	err := s.c.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Goal{}, ErrNotFound
	}
	return out, err
}

func (s *Store) invalidate(id primitive.ObjectID) {
	s.mu.Lock()
	delete(s.cache, id.Hex())
	s.mu.Unlock()
}

func (s *Store) regex(g Goal) *regexp.Regexp {
	key := g.ID.Hex()
	s.mu.RLock()
	r := s.cache[key]
	s.mu.RUnlock()
	if r != nil {
		return r
	}
	compiled, err := regexp.Compile(g.Pattern)
	if err != nil {
		return nil
	}
	s.mu.Lock()
	s.cache[key] = compiled
	s.mu.Unlock()
	return compiled
}

// Match returns the goal IDs hit by an event. Cheap enough to call per-event
// for v1 (one Find by propertyId). If goal lists grow, cache per-property.
func (s *Store) Match(ctx context.Context, propID primitive.ObjectID, eventType, eventName, eventPath string) ([]primitive.ObjectID, error) {
	all, err := s.ListForProperty(ctx, propID)
	if err != nil {
		return nil, err
	}
	var hits []primitive.ObjectID
	for _, g := range all {
		switch g.Kind {
		case KindEvent:
			if eventType == "event" && eventName == g.Pattern {
				hits = append(hits, g.ID)
			}
		case KindURL:
			if r := s.regex(g); r != nil && r.MatchString(eventPath) {
				hits = append(hits, g.ID)
			}
		}
	}
	return hits, nil
}

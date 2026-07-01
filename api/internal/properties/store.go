// Package properties owns the "properties" collection — one document per
// tracked site. Phase 3 only needs Find/Resolve so the ingest path can map
// a public siteId to an internal propertyId; full CRUD lands in Phase 4.
package properties

import (
	"context"
	cryptorand "crypto/rand"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const Collection = "properties"

var ErrNotFound = errors.New("property not found")

type Property struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name"          json:"name"`
	Domain    string             `bson:"domain"        json:"domain"`
	SiteID    string             `bson:"siteId"        json:"siteId"`
	CreatedAt time.Time          `bson:"createdAt"     json:"createdAt"`
}

type Store struct {
	c *mongo.Collection
}

func NewStore(c *mongo.Collection) *Store { return &Store{c: c} }

func (s *Store) FindBySiteID(ctx context.Context, siteID string) (Property, error) {
	var out Property
	err := s.c.FindOne(ctx, bson.M{"siteId": siteID}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Property{}, ErrNotFound
	}
	return out, err
}

func (s *Store) FindByID(ctx context.Context, id primitive.ObjectID) (Property, error) {
	var out Property
	err := s.c.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Property{}, ErrNotFound
	}
	return out, err
}

func (s *Store) List(ctx context.Context) ([]Property, error) {
	cur, err := s.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []Property
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) Create(ctx context.Context, name, domain string) (Property, error) {
	p := Property{
		ID:        primitive.NewObjectID(),
		Name:      name,
		Domain:    domain,
		SiteID:    randSiteID(),
		CreatedAt: time.Now().UTC(),
	}
	if _, err := s.c.InsertOne(ctx, p); err != nil {
		return Property{}, err
	}
	return p, nil
}

func (s *Store) Update(ctx context.Context, id primitive.ObjectID, name, domain *string) (Property, error) {
	set := bson.M{}
	if name != nil {
		set["name"] = *name
	}
	if domain != nil {
		set["domain"] = *domain
	}
	if len(set) == 0 {
		return s.FindByID(ctx, id)
	}
	res := s.c.FindOneAndUpdate(ctx,
		bson.M{"_id": id},
		bson.M{"$set": set},
	)
	if res.Err() != nil {
		if errors.Is(res.Err(), mongo.ErrNoDocuments) {
			return Property{}, ErrNotFound
		}
		return Property{}, res.Err()
	}
	return s.FindByID(ctx, id)
}

func (s *Store) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := s.c.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func randSiteID() string {
	const alpha = "abcdefghijklmnopqrstuvwxyz0123456789"
	var buf [8]byte
	if _, err := cryptorand.Read(buf[:]); err != nil {
		return "0000pgr0" // best-effort fallback; uniqueness enforced by the unique index
	}
	for i := range buf {
		buf[i] = alpha[int(buf[i])%len(alpha)]
	}
	return string(buf[:])
}

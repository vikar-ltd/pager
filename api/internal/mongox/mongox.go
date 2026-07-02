// Package mongox wraps the mongo driver: connection, collections, index ensure.
//
// Named mongox to avoid colliding with the imported driver package name.
package mongox

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type DB struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func Connect(ctx context.Context, uri, name string) (*DB, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	c, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}
	if err := c.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}
	return &DB{Client: c, DB: c.Database(name)}, nil
}

func (d *DB) Disconnect(ctx context.Context) error {
	return d.Client.Disconnect(ctx)
}

func (d *DB) C(name string) *mongo.Collection { return d.DB.Collection(name) }

// EnsureIndexes idempotently creates the indexes the API depends on.
func (d *DB) EnsureIndexes(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	specs := []struct {
		coll  string
		model mongo.IndexModel
	}{
		{"events", mongo.IndexModel{Keys: bson.D{{Key: "propertyId", Value: 1}, {Key: "ts", Value: -1}}}},
		{"events", mongo.IndexModel{Keys: bson.D{{Key: "sessionId", Value: 1}}}},
		{"events", mongo.IndexModel{Keys: bson.D{{Key: "propertyId", Value: 1}, {Key: "type", Value: 1}, {Key: "ts", Value: -1}}}},
		{"tracking_sessions", mongo.IndexModel{Keys: bson.D{{Key: "propertyId", Value: 1}, {Key: "startedAt", Value: -1}}}},
		{"tracking_sessions", mongo.IndexModel{Keys: bson.D{{Key: "visitorId", Value: 1}}}},
		{"visitors", mongo.IndexModel{Keys: bson.D{{Key: "propertyId", Value: 1}, {Key: "lastSeen", Value: -1}}}},
		{"properties", mongo.IndexModel{Keys: bson.D{{Key: "siteId", Value: 1}}, Options: options.Index().SetUnique(true)}},
		{"goals", mongo.IndexModel{Keys: bson.D{{Key: "propertyId", Value: 1}}}},
		{"admin_sessions", mongo.IndexModel{Keys: bson.D{{Key: "lastSeenAt", Value: -1}}}},
		{"admin_sessions", mongo.IndexModel{Keys: bson.D{{Key: "userId", Value: 1}}}},
		{"users", mongo.IndexModel{Keys: bson.D{{Key: "username", Value: 1}}, Options: options.Index().SetUnique(true)}},
	}
	for _, s := range specs {
		if _, err := d.C(s.coll).Indexes().CreateOne(ctx, s.model); err != nil {
			return fmt.Errorf("ensure index on %s: %w", s.coll, err)
		}
	}
	return nil
}

// Package session manages opaque admin session tokens. Tokens are 32 random
// bytes, base64url-encoded; only their sha256+pepper hash is stored. Revoke
// history is retained (revokedAt) so the sessions UI can audit terminations.
package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vikar-ltd/pager/api/internal/ua"
)

const Collection = "admin_sessions"

var ErrNotFound = errors.New("session not found or revoked")

type Session struct {
	ID         string    `bson:"_id"        json:"id"`
	CreatedAt  time.Time `bson:"createdAt"  json:"createdAt"`
	LastSeenAt time.Time `bson:"lastSeenAt" json:"lastSeenAt"`
	RevokedAt  *time.Time `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	IP         string    `bson:"ip"         json:"ip"`
	Country    string    `bson:"country"    json:"country"`
	UA         ua.Info   `bson:"ua"         json:"ua"`
}

type Store struct {
	c      *mongo.Collection
	pepper []byte
}

func NewStore(c *mongo.Collection, pepper string) *Store {
	return &Store{c: c, pepper: []byte(pepper)}
}

func (s *Store) hash(token string) string {
	h := sha256.New()
	h.Write([]byte(token))
	h.Write(s.pepper)
	return hex.EncodeToString(h.Sum(nil))
}

// Create mints a new session, persists its hash, and returns both the raw token
// (caller puts it in the Set-Cookie) and the stored Session record.
func (s *Store) Create(ctx context.Context, ip net.IP, country string, agent ua.Info) (token string, sess Session, err error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", Session{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw[:])
	now := time.Now().UTC()
	sess = Session{
		ID:         s.hash(token),
		CreatedAt:  now,
		LastSeenAt: now,
		Country:    country,
		UA:         agent,
	}
	if ip != nil {
		sess.IP = ip.String()
	}
	if _, err := s.c.InsertOne(ctx, sess); err != nil {
		return "", Session{}, err
	}
	return token, sess, nil
}

// Lookup resolves a raw token to its Session, rejecting revoked rows.
// It also bumps lastSeenAt opportunistically.
func (s *Store) Lookup(ctx context.Context, token string) (Session, error) {
	id := s.hash(token)
	var out Session
	err := s.c.FindOne(ctx, bson.M{"_id": id, "revokedAt": bson.M{"$exists": false}}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, err
	}
	// Best-effort lastSeen bump; ignore errors since the auth answer is already known.
	_, _ = s.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"lastSeenAt": time.Now().UTC()}})
	return out, nil
}

// List returns every session ordered by lastSeenAt desc.
func (s *Store) List(ctx context.Context) ([]Session, error) {
	cur, err := s.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "lastSeenAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []Session
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Revoke marks a single session revoked. No-op if already revoked or missing.
func (s *Store) Revoke(ctx context.Context, id string) error {
	_, err := s.c.UpdateOne(ctx,
		bson.M{"_id": id, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": time.Now().UTC()}},
	)
	return err
}

// RevokeOthers revokes every active session except the given one.
func (s *Store) RevokeOthers(ctx context.Context, exceptID string) (int64, error) {
	res, err := s.c.UpdateMany(ctx,
		bson.M{"_id": bson.M{"$ne": exceptID}, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": time.Now().UTC()}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

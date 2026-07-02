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
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vikar-ltd/pager/api/internal/ua"
)

const Collection = "admin_sessions"

var (
	ErrNotFound         = errors.New("session not found or revoked")
	errNotFoundInternal = errors.New("session doc missing")
)

type Session struct {
	ID         string             `bson:"_id"                 json:"id"`
	UserID     primitive.ObjectID `bson:"userId"              json:"userId"`
	Username   string             `bson:"username"            json:"username"`
	CreatedAt  time.Time          `bson:"createdAt"           json:"createdAt"`
	LastSeenAt time.Time          `bson:"lastSeenAt"          json:"lastSeenAt"`
	RevokedAt  *time.Time         `bson:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	IP         string             `bson:"ip"                  json:"ip"`
	Country    string             `bson:"country"             json:"country"`
	UA         ua.Info            `bson:"ua"                  json:"ua"`
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

// Create mints a new session tied to a user, persists its hash, and returns
// both the raw token (caller puts it in the Set-Cookie) and the stored Session.
func (s *Store) Create(ctx context.Context, userID primitive.ObjectID, username string, ip net.IP, country string, agent ua.Info) (token string, sess Session, err error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", Session{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw[:])
	now := time.Now().UTC()
	sess = Session{
		ID:         s.hash(token),
		UserID:     userID,
		Username:   username,
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

// List returns every non-revoked session ordered by lastSeenAt desc.
// If filterUserID is non-zero, only sessions belonging to that user are returned
// (used to scope viewers to their own sessions).
func (s *Store) List(ctx context.Context, filterUserID primitive.ObjectID) ([]Session, error) {
	filter := bson.M{}
	if !filterUserID.IsZero() {
		filter["userId"] = filterUserID
	}
	cur, err := s.c.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "lastSeenAt", Value: -1}}))
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

// find is an internal lookup used by ownership checks — returns the raw doc
// including any revokedAt field so callers can enforce their own semantics.
func (s *Store) find(ctx context.Context, id string) (Session, error) {
	var out Session
	err := s.c.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Session{}, errNotFoundInternal
	}
	return out, err
}

// Revoke marks a single session revoked. No-op if already revoked or missing.
func (s *Store) Revoke(ctx context.Context, id string) error {
	_, err := s.c.UpdateOne(ctx,
		bson.M{"_id": id, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": time.Now().UTC()}},
	)
	return err
}

// RevokeOthers revokes every active session for `userID` except `exceptID`.
// Called from "Terminate all others" so a user can only wipe *their own* other
// sessions, never someone else's.
func (s *Store) RevokeOthers(ctx context.Context, userID primitive.ObjectID, exceptID string) (int64, error) {
	res, err := s.c.UpdateMany(ctx,
		bson.M{
			"_id":       bson.M{"$ne": exceptID},
			"userId":    userID,
			"revokedAt": bson.M{"$exists": false},
		},
		bson.M{"$set": bson.M{"revokedAt": time.Now().UTC()}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// RenameUser rewrites the cached username on every session belonging to a
// user. Kept in sync so the admin sessions list doesn't show stale identities
// after a rename. Not user-visible; called from the users package.
func (s *Store) RenameUser(ctx context.Context, userID primitive.ObjectID, newUsername string) error {
	_, err := s.c.UpdateMany(ctx,
		bson.M{"userId": userID},
		bson.M{"$set": bson.M{"username": newUsername}},
	)
	return err
}

// RevokeAllForUser terminates every non-revoked session belonging to a user.
// Called when a user's role changes or has their password reset — the change
// takes effect immediately, but the audit trail (revokedAt) sticks around.
func (s *Store) RevokeAllForUser(ctx context.Context, userID primitive.ObjectID) (int64, error) {
	res, err := s.c.UpdateMany(ctx,
		bson.M{"userId": userID, "revokedAt": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"revokedAt": time.Now().UTC()}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// DeleteAllForUser hard-deletes every session doc belonging to a user. Called
// from the user-delete flow: once the user is gone, retaining stale session
// docs pointing at a missing userId is only clutter — they can never
// authenticate anyone and no longer trace back to a person.
func (s *Store) DeleteAllForUser(ctx context.Context, userID primitive.ObjectID) (int64, error) {
	res, err := s.c.DeleteMany(ctx, bson.M{"userId": userID})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

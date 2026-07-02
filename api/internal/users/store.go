// Package users owns the users collection and password verification.
// The env-provided ADMIN_USERNAME/ADMIN_PASSWORD only seed the initial root
// on first boot; after that all user management is DB-backed and passwords
// are stored as bcrypt hashes per user.
package users

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

const Collection = "users"

var (
	ErrNotFound      = errors.New("user not found")
	ErrDuplicateName = errors.New("username already exists")
	ErrLastRoot      = errors.New("cannot remove the last root user")
	ErrBadPassword   = errors.New("password too short (min 8 chars)")
	ErrBadRole       = errors.New("invalid role")
	ErrBadUsername   = errors.New("username must be 2+ chars, letters/digits/._- only")
)

type User struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty"     json:"id"`
	Username     string              `bson:"username"          json:"username"`
	PasswordHash string              `bson:"passwordHash"      json:"-"`
	Role         Role                `bson:"role"              json:"role"`
	CreatedAt    time.Time           `bson:"createdAt"         json:"createdAt"`
	CreatedBy    *primitive.ObjectID `bson:"createdBy,omitempty" json:"createdBy,omitempty"`
}

type Store struct{ c *mongo.Collection }

func NewStore(c *mongo.Collection) *Store { return &Store{c: c} }

func hashPassword(pw string) (string, error) {
	if len(pw) < 8 {
		return "", ErrBadPassword
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

func validateUsername(u string) error {
	if len(u) < 2 {
		return ErrBadUsername
	}
	for _, r := range u {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '.' || r == '_' || r == '-'
		if !ok {
			return ErrBadUsername
		}
	}
	return nil
}

// EnsureRootExists seeds a root user only if *no* root exists in the DB. That
// way a root user who renames themselves via the UI isn't duplicated on the
// next boot. If every root ever gets deleted (guardrail should prevent this
// but the DB could be wiped by hand), the seed comes back with the env
// credentials — that's the intended recovery path.
func (s *Store) EnsureRootExists(ctx context.Context, seedUsername, seedPassword string) error {
	n, err := s.countRoots(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if err := validateUsername(seedUsername); err != nil {
		return err
	}
	hash, err := hashPassword(seedPassword)
	if err != nil {
		return err
	}
	_, err = s.c.InsertOne(ctx, User{
		ID:           primitive.NewObjectID(),
		Username:     seedUsername,
		PasswordHash: hash,
		Role:         RoleRoot,
		CreatedAt:    time.Now().UTC(),
	})
	if mongo.IsDuplicateKeyError(err) {
		// Someone booked the username but wasn't marked root — take it over.
		_, err2 := s.c.UpdateOne(ctx,
			bson.M{"username": seedUsername},
			bson.M{"$set": bson.M{"role": RoleRoot, "passwordHash": hash}},
		)
		return err2
	}
	return err
}

func (s *Store) FindByUsername(ctx context.Context, username string) (User, error) {
	var out User
	err := s.c.FindOne(ctx, bson.M{"username": username}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrNotFound
	}
	return out, err
}

func (s *Store) FindByID(ctx context.Context, id primitive.ObjectID) (User, error) {
	var out User
	err := s.c.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrNotFound
	}
	return out, err
}

// VerifyPassword performs a constant-time bcrypt compare.
func VerifyPassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func (s *Store) List(ctx context.Context) ([]User, error) {
	cur, err := s.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var out []User
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) countRoots(ctx context.Context) (int64, error) {
	return s.c.CountDocuments(ctx, bson.M{"role": RoleRoot})
}

// Create inserts a new user after uniqueness / role validity checks.
func (s *Store) Create(ctx context.Context, username, password string, role Role, createdBy primitive.ObjectID) (User, error) {
	username = strings.TrimSpace(username)
	if err := validateUsername(username); err != nil {
		return User{}, err
	}
	if !role.Valid() {
		return User{}, ErrBadRole
	}
	hash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	// Uniqueness check first to give a nice error; the unique index is the
	// backstop against races.
	if _, err := s.FindByUsername(ctx, username); err == nil {
		return User{}, ErrDuplicateName
	} else if !errors.Is(err, ErrNotFound) {
		return User{}, err
	}
	u := User{
		ID:           primitive.NewObjectID(),
		Username:     username,
		PasswordHash: hash,
		Role:         role,
		CreatedAt:    time.Now().UTC(),
		CreatedBy:    &createdBy,
	}
	if _, err := s.c.InsertOne(ctx, u); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return User{}, ErrDuplicateName
		}
		return User{}, err
	}
	return u, nil
}

// SetRole updates role, enforcing the "last root" guardrail. Returns the
// updated user so the caller can invalidate the target's sessions.
func (s *Store) SetRole(ctx context.Context, id primitive.ObjectID, newRole Role) (User, error) {
	if !newRole.Valid() {
		return User{}, ErrBadRole
	}
	target, err := s.FindByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if target.Role == RoleRoot && newRole != RoleRoot {
		n, err := s.countRoots(ctx)
		if err != nil {
			return User{}, err
		}
		if n <= 1 {
			return User{}, ErrLastRoot
		}
	}
	if _, err := s.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"role": newRole}}); err != nil {
		return User{}, err
	}
	target.Role = newRole
	return target, nil
}

// SetUsername renames a user. Uniqueness is enforced by the DB index; we
// translate the driver's duplicate-key error into ErrDuplicateName for a
// friendly response.
func (s *Store) SetUsername(ctx context.Context, id primitive.ObjectID, newUsername string) (User, error) {
	newUsername = strings.TrimSpace(newUsername)
	if err := validateUsername(newUsername); err != nil {
		return User{}, err
	}
	// Cheap pre-check for a nicer error (the unique index is the backstop).
	existing, err := s.FindByUsername(ctx, newUsername)
	if err == nil && existing.ID != id {
		return User{}, ErrDuplicateName
	} else if err != nil && !errors.Is(err, ErrNotFound) {
		return User{}, err
	}
	res, err := s.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"username": newUsername}})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return User{}, ErrDuplicateName
		}
		return User{}, err
	}
	if res.MatchedCount == 0 {
		return User{}, ErrNotFound
	}
	return s.FindByID(ctx, id)
}

// SetPassword replaces the password hash. No last-root check because password
// changes don't affect user existence.
func (s *Store) SetPassword(ctx context.Context, id primitive.ObjectID, password string) error {
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	res, err := s.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"passwordHash": hash}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes a user, enforcing the "last root" guardrail.
func (s *Store) Delete(ctx context.Context, id primitive.ObjectID) error {
	target, err := s.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if target.Role == RoleRoot {
		n, err := s.countRoots(ctx)
		if err != nil {
			return err
		}
		if n <= 1 {
			return ErrLastRoot
		}
	}
	res, err := s.c.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// Package auth handles DB-backed login, the cookie-based session middleware,
// and the login/logout/me HTTP handlers. Actor role is attached to the
// request context so downstream handlers can enforce permissions.
package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/geo"
	"github.com/vikar-ltd/pager/api/internal/httpx"
	"github.com/vikar-ltd/pager/api/internal/session"
	"github.com/vikar-ltd/pager/api/internal/ua"
	"github.com/vikar-ltd/pager/api/internal/users"
)

const CookieName = "pgr_admin"

// SessionSync is the small slice of the session store we use for keeping
// cached usernames on session docs in sync after a self-rename.
type SessionSync interface {
	RenameUser(ctx context.Context, userID primitive.ObjectID, newUsername string) error
}

type Authenticator struct {
	Users    *users.Store
	Sessions *session.Store
	Geo      *geo.Resolver
}

func NewAuthenticator(us *users.Store, sess *session.Store, g *geo.Resolver) *Authenticator {
	return &Authenticator{Users: us, Sessions: sess, Geo: g}
}

type ctxKey int

const (
	sessionKey ctxKey = 1
	userKey    ctxKey = 2
)

// Actor is the pair we thread through the request context: the session that
// authenticated the request plus the current DB state of the user (so role
// checks always see the latest role, not a snapshot from login time).
type Actor struct {
	Session session.Session
	User    users.User
}

func ActorFromContext(ctx context.Context) (Actor, bool) {
	a, ok := ctx.Value(userKey).(Actor)
	return a, ok
}

func SessionFromContext(ctx context.Context) (session.Session, bool) {
	s, ok := ctx.Value(sessionKey).(session.Session)
	return s, ok
}

func (a *Authenticator) Required(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(CookieName)
		if err != nil || cookie.Value == "" {
			httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
			return
		}
		sess, err := a.Sessions.Lookup(r.Context(), cookie.Value)
		if err != nil {
			httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "session invalid"))
			return
		}
		user, err := a.Users.FindByID(r.Context(), sess.UserID)
		if err != nil {
			// The user was deleted while the session existed. Treat like revoked.
			httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "user no longer exists"))
			return
		}
		ctx := context.WithValue(r.Context(), sessionKey, sess)
		ctx = context.WithValue(ctx, userKey, Actor{Session: sess, User: user})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireWrite wraps a handler so that only actors whose role can mutate data
// (root, admin) may reach it. Viewers hit 403.
func (a *Authenticator) RequireWrite(next http.Handler) http.Handler {
	return a.Required(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, _ := ActorFromContext(r.Context())
		if !actor.User.Role.CanWrite() {
			httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "write access required"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// RequireRoot wraps a handler that only root may reach — used for user role
// changes and admin-user creation/deletion.
func (a *Authenticator) RequireRoot(next http.Handler) http.Handler {
	return a.Required(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, _ := ActorFromContext(r.Context())
		if actor.User.Role != users.RoleRoot {
			httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "root role required"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// RequireManageUsers gates the /users listing and viewer-management endpoints.
func (a *Authenticator) RequireManageUsers(next http.Handler) http.Handler {
	return a.Required(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, _ := ActorFromContext(r.Context())
		if !actor.User.Role.CanManageUsers() {
			httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "user management not allowed"))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *Authenticator) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	u, err := a.Users.FindByUsername(r.Context(), strings.TrimSpace(req.Username))
	if err != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "bad_credentials", "invalid credentials"))
		return
	}
	if err := users.VerifyPassword(u.PasswordHash, req.Password); err != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "bad_credentials", "invalid credentials"))
		return
	}

	ip := httpx.ClientIP(r)
	country := a.Geo.Country(ip)
	agent := ua.Parse(r.Header.Get("User-Agent"))

	token, sess, err := a.Sessions.Create(r.Context(), u.ID, u.Username, ip, country, agent)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	setSessionCookie(w, r, token, 0)
	httpx.WriteJSON(w, http.StatusOK, meResponse(u, sess))
}

func (a *Authenticator) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(CookieName); err == nil && cookie.Value != "" {
		if sess, err := a.Sessions.Lookup(r.Context(), cookie.Value); err == nil {
			_ = a.Sessions.Revoke(r.Context(), sess.ID)
		}
	}
	setSessionCookie(w, r, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func (a *Authenticator) HandleMe(w http.ResponseWriter, r *http.Request) {
	actor, ok := ActorFromContext(r.Context())
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, meResponse(actor.User, actor.Session))
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// HandleChangeOwnPassword lets a signed-in user rotate their own password.
// Requires current password to guard against session hijack.
func (a *Authenticator) HandleChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	actor, ok := ActorFromContext(r.Context())
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	var req changePasswordRequest
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := users.VerifyPassword(actor.User.PasswordHash, req.CurrentPassword); err != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "bad_credentials", "current password is wrong"))
		return
	}
	if err := a.Users.SetPassword(r.Context(), actor.User.ID, req.NewPassword); err != nil {
		if errors.Is(err, users.ErrBadPassword) {
			httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "bad_password", err.Error()))
			return
		}
		httpx.WriteErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type changeUsernameRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewUsername     string `json:"newUsername"`
}

// HandleChangeOwnUsername lets a signed-in user rename themselves. Requires
// the current password to guard against session hijack, mirroring the
// password-change flow. Existing sessions stay valid; only their cached
// username field is refreshed.
func (a *Authenticator) HandleChangeOwnUsername(w http.ResponseWriter, r *http.Request) {
	actor, ok := ActorFromContext(r.Context())
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	var req changeUsernameRequest
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := users.VerifyPassword(actor.User.PasswordHash, req.CurrentPassword); err != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "bad_credentials", "current password is wrong"))
		return
	}
	updated, err := a.Users.SetUsername(r.Context(), actor.User.ID, req.NewUsername)
	if err != nil {
		httpx.WriteErr(w, translateUserErr(err))
		return
	}
	_ = a.Sessions.RenameUser(r.Context(), actor.User.ID, updated.Username)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"id":       updated.ID,
		"username": updated.Username,
		"role":     updated.Role,
	})
}

func translateUserErr(err error) error {
	switch {
	case errors.Is(err, users.ErrDuplicateName):
		return httpx.Errorf(http.StatusConflict, "duplicate", err.Error())
	case errors.Is(err, users.ErrBadUsername), errors.Is(err, users.ErrBadPassword):
		return httpx.Errorf(http.StatusBadRequest, "invalid", err.Error())
	case errors.Is(err, users.ErrNotFound):
		return httpx.Errorf(http.StatusNotFound, "not_found", "user not found")
	default:
		return err
	}
}

func meResponse(u users.User, sess session.Session) map[string]any {
	return map[string]any{
		"user": map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"role":     u.Role,
		},
		"session": sess,
	}
}

// setSessionCookie writes the auth cookie. ttlSeconds<0 clears it.
// The Secure flag is conditional on the request scheme so the dev compose
// stack (plain HTTP on :8080) still accepts the cookie.
func setSessionCookie(w http.ResponseWriter, r *http.Request, value string, ttlSeconds int) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	c := &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	}
	switch {
	case ttlSeconds < 0:
		c.MaxAge = -1
		c.Expires = time.Unix(0, 0)
	case ttlSeconds > 0:
		c.MaxAge = ttlSeconds
	}
	http.SetCookie(w, c)
}

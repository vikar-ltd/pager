// Package auth handles env-seeded password verification, the cookie-based
// session middleware, and the login/logout/me HTTP handlers.
package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/vikar-ltd/pager/api/internal/geo"
	"github.com/vikar-ltd/pager/api/internal/httpx"
	"github.com/vikar-ltd/pager/api/internal/session"
	"github.com/vikar-ltd/pager/api/internal/ua"
)

const CookieName = "pgr_admin"

type Authenticator struct {
	Username     []byte
	PasswordHash []byte
	Sessions     *session.Store
	Geo          *geo.Resolver
}

// NewAuthenticator pre-hashes the env-provided password so login() is a single
// bcrypt compare. The plaintext stays in env (not stored anywhere).
func NewAuthenticator(username, password string, sessions *session.Store, g *geo.Resolver) (*Authenticator, error) {
	if username == "" || password == "" {
		return nil, errors.New("auth: empty username or password")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	return &Authenticator{
		Username:     []byte(username),
		PasswordHash: hash,
		Sessions:     sessions,
		Geo:          g,
	}, nil
}

type ctxKey int

const sessionKey ctxKey = 1

// SessionFromContext returns the authenticated session for the current request,
// or false if the request isn't authenticated (which shouldn't happen behind
// the Required middleware).
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
		ctx := context.WithValue(r.Context(), sessionKey, sess)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
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
	// Constant-time username compare so timing doesn't reveal valid usernames.
	userOK := subtle.ConstantTimeCompare([]byte(req.Username), a.Username) == 1
	passErr := bcrypt.CompareHashAndPassword(a.PasswordHash, []byte(req.Password))
	if !userOK || passErr != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "bad_credentials", "invalid credentials"))
		return
	}

	ip := httpx.ClientIP(r)
	country := a.Geo.Country(ip)
	agent := ua.Parse(r.Header.Get("User-Agent"))

	token, sess, err := a.Sessions.Create(r.Context(), ip, country, agent)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	setSessionCookie(w, r, token, 0)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"username": string(a.Username),
		"session":  sess,
	})
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
	sess, ok := SessionFromContext(r.Context())
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"username": string(a.Username),
		"session":  sess,
	})
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

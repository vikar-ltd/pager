package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/auth"
	"github.com/vikar-ltd/pager/api/internal/config"
	"github.com/vikar-ltd/pager/api/internal/geo"
	"github.com/vikar-ltd/pager/api/internal/goals"
	"github.com/vikar-ltd/pager/api/internal/httpx"
	"github.com/vikar-ltd/pager/api/internal/ingest"
	"github.com/vikar-ltd/pager/api/internal/mongox"
	"github.com/vikar-ltd/pager/api/internal/properties"
	"github.com/vikar-ltd/pager/api/internal/reports"
	"github.com/vikar-ltd/pager/api/internal/session"
	"github.com/vikar-ltd/pager/api/internal/tracker"
	"github.com/vikar-ltd/pager/api/internal/users"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "run as a healthcheck client and exit")
	flag.Parse()
	if *healthcheck {
		os.Exit(runHealthcheck())
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config", "err", err)
		os.Exit(2)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		logger.Error("mongo", "err", err)
		os.Exit(2)
	}
	defer func() {
		shutdownCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = db.Disconnect(shutdownCtx)
	}()
	if err := db.EnsureIndexes(ctx); err != nil {
		logger.Error("ensure indexes", "err", err)
		os.Exit(2)
	}

	geoRes := geo.NewResolver()
	if loaded, err := geoRes.Load(cfg.GeoMMDBPath); err != nil {
		logger.Warn("geo load failed (continuing without geo)", "err", err)
	} else if loaded {
		logger.Info("geo db loaded", "path", cfg.GeoMMDBPath)
	} else {
		logger.Info("geo db not present (continuing without geo)", "path", cfg.GeoMMDBPath)
	}
	defer geoRes.Close()

	userStore := users.NewStore(db.C(users.Collection))
	if err := userStore.EnsureRootExists(ctx, cfg.RootUsername, cfg.RootPassword); err != nil {
		logger.Error("seed root user", "err", err)
		os.Exit(2)
	}
	logger.Info("root user seed check complete", "seed_username_if_needed", cfg.RootUsername)

	sessions := session.NewStore(db.C(session.Collection), cfg.SessionPepper)
	authn := auth.NewAuthenticator(userStore, sessions, geoRes)

	sessHandlers := &session.HandlerSet{
		Store: sessions,
		Actor: func(r *http.Request) (primitive.ObjectID, string, bool) {
			a, ok := auth.ActorFromContext(r.Context())
			if !ok {
				return primitive.NilObjectID, "", false
			}
			return a.User.ID, a.Session.ID, true
		},
	}

	usersHandler := &users.Handler{
		Store:    userStore,
		Sessions: sessions,
		Actor: func(r *http.Request) (primitive.ObjectID, users.Role, bool) {
			a, ok := auth.ActorFromContext(r.Context())
			if !ok {
				return primitive.NilObjectID, "", false
			}
			return a.User.ID, a.User.Role, true
		},
	}

	propStore := properties.NewStore(db.C(properties.Collection))
	goalStore := goals.NewStore(db.DB)
	ingester := ingest.New(db.DB, propStore, goalStore, geoRes)
	propHandler := &properties.Handler{Store: propStore}
	goalHandler := &goals.Handler{Store: goalStore}
	reportsHandler := &reports.Handler{Store: reports.NewStore(db.DB)}

	mux := http.NewServeMux()
	// Read auth: any signed-in role.
	read := func(h http.HandlerFunc) http.Handler { return authn.Required(h) }
	// Write auth: admin or root.
	write := func(h http.HandlerFunc) http.Handler { return authn.RequireWrite(h) }
	// User management: admin or root, but the handlers themselves reject
	// admin actions against non-viewer targets.
	manageUsers := func(h http.HandlerFunc) http.Handler { return authn.RequireManageUsers(h) }
	rootOnly := func(h http.HandlerFunc) http.Handler { return authn.RequireRoot(h) }

	// Health (unauthenticated) — used by the container healthcheck.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	// Public tracker endpoints — baked into snippets, must stay stable.
	mux.HandleFunc("GET /pub/p.js", tracker.Handler)
	mux.HandleFunc("/pub/collect", ingester.Handler) // accepts POST and OPTIONS (CORS)

	// Auth.
	mux.HandleFunc("POST /int/api/auth/login", authn.HandleLogin)
	mux.HandleFunc("POST /int/api/auth/logout", authn.HandleLogout)
	mux.Handle("GET /int/api/auth/me", read(authn.HandleMe))
	mux.Handle("POST /int/api/auth/change-password", read(authn.HandleChangeOwnPassword))
	mux.Handle("POST /int/api/auth/change-username", read(authn.HandleChangeOwnUsername))

	// Admin sessions.
	mux.Handle("GET /int/api/admin-sessions", read(sessHandlers.List))
	mux.Handle("POST /int/api/admin-sessions/terminate-others", read(sessHandlers.TerminateOthers))
	mux.Handle("DELETE /int/api/admin-sessions/{id}", read(sessHandlers.Terminate))

	// User management. Listing + delete/create are gated by manageUsers; role
	// change + password reset by rootOnly. The handlers themselves apply
	// per-target restrictions (admins can only create/delete viewers).
	mux.Handle("GET /int/api/users", manageUsers(usersHandler.List))
	mux.Handle("POST /int/api/users", manageUsers(usersHandler.Create))
	mux.Handle("DELETE /int/api/users/{id}", manageUsers(usersHandler.Delete))
	mux.Handle("PATCH /int/api/users/{id}/role", rootOnly(usersHandler.SetRole))
	mux.Handle("PATCH /int/api/users/{id}/password", rootOnly(usersHandler.SetPassword))
	mux.Handle("PATCH /int/api/users/{id}/username", rootOnly(usersHandler.SetUsername))

	// Properties — reads open, writes gated.
	mux.Handle("GET /int/api/properties", read(propHandler.List))
	mux.Handle("POST /int/api/properties", write(propHandler.Create))
	mux.Handle("GET /int/api/properties/{id}", read(propHandler.Get))
	mux.Handle("PATCH /int/api/properties/{id}", write(propHandler.Patch))
	mux.Handle("DELETE /int/api/properties/{id}", write(propHandler.Delete))

	// Goals — reads open, writes gated.
	mux.Handle("GET /int/api/properties/{id}/goals", read(goalHandler.ListForProperty))
	mux.Handle("POST /int/api/properties/{id}/goals", write(goalHandler.CreateForProperty))
	mux.Handle("PATCH /int/api/goals/{gid}", write(goalHandler.Patch))
	mux.Handle("DELETE /int/api/goals/{gid}", write(goalHandler.Delete))

	// Reports — all reads.
	mux.Handle("GET /int/api/properties/{id}/overview", read(reportsHandler.Overview))
	mux.Handle("GET /int/api/properties/{id}/campaigns", read(reportsHandler.Campaigns))
	mux.Handle("GET /int/api/properties/{id}/sources", read(reportsHandler.Sources))
	mux.Handle("GET /int/api/properties/{id}/visitors", read(reportsHandler.Visitors))
	mux.Handle("GET /int/api/properties/{id}/visitors/{vid}/timeline", read(reportsHandler.VisitorTimeline))

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("api listening", "addr", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	logger.Info("shutting down")

	shutdownCtx, c := context.WithTimeout(context.Background(), 10*time.Second)
	defer c()
	_ = srv.Shutdown(shutdownCtx)
}

func runHealthcheck() int {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	c := &http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get("http://127.0.0.1" + addr + "/health")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

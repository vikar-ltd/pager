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

	sessions := session.NewStore(db.C(session.Collection), cfg.SessionPepper)
	authn, err := auth.NewAuthenticator(cfg.AdminUsername, cfg.AdminPassword, sessions, geoRes)
	if err != nil {
		logger.Error("auth", "err", err)
		os.Exit(2)
	}

	propStore := properties.NewStore(db.C(properties.Collection))
	goalStore := goals.NewStore(db.C(goals.Collection))
	ingester := ingest.New(db.DB, propStore, goalStore, geoRes)
	propHandler := &properties.Handler{Store: propStore}
	goalHandler := &goals.Handler{Store: goalStore}
	reportsHandler := &reports.Handler{Store: reports.NewStore(db.DB)}

	sessHandlers := &session.HandlerSet{
		Store:   sessions,
		Current: func(r *http.Request) (session.Session, bool) { return auth.SessionFromContext(r.Context()) },
	}

	mux := http.NewServeMux()
	authed := func(h http.HandlerFunc) http.Handler { return authn.Required(h) }

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
	mux.Handle("GET /int/api/auth/me", authed(authn.HandleMe))

	// Admin sessions.
	mux.Handle("GET /int/api/admin-sessions", authed(sessHandlers.List))
	mux.Handle("POST /int/api/admin-sessions/terminate-others", authed(sessHandlers.TerminateOthers))
	mux.Handle("DELETE /int/api/admin-sessions/{id}", authed(sessHandlers.Terminate))

	// Properties.
	mux.Handle("GET /int/api/properties", authed(propHandler.List))
	mux.Handle("POST /int/api/properties", authed(propHandler.Create))
	mux.Handle("GET /int/api/properties/{id}", authed(propHandler.Get))
	mux.Handle("PATCH /int/api/properties/{id}", authed(propHandler.Patch))
	mux.Handle("DELETE /int/api/properties/{id}", authed(propHandler.Delete))

	// Goals (nested under property for create/list, direct for patch/delete).
	mux.Handle("GET /int/api/properties/{id}/goals", authed(goalHandler.ListForProperty))
	mux.Handle("POST /int/api/properties/{id}/goals", authed(goalHandler.CreateForProperty))
	mux.Handle("PATCH /int/api/goals/{gid}", authed(goalHandler.Patch))
	mux.Handle("DELETE /int/api/goals/{gid}", authed(goalHandler.Delete))

	// Reports.
	mux.Handle("GET /int/api/properties/{id}/overview",  authed(reportsHandler.Overview))
	mux.Handle("GET /int/api/properties/{id}/campaigns", authed(reportsHandler.Campaigns))
	mux.Handle("GET /int/api/properties/{id}/sources",   authed(reportsHandler.Sources))
	mux.Handle("GET /int/api/properties/{id}/visitors",  authed(reportsHandler.Visitors))
	mux.Handle("GET /int/api/properties/{id}/visitors/{vid}/timeline", authed(reportsHandler.VisitorTimeline))

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

package config

import (
	"fmt"
	"os"
)

type Config struct {
	ListenAddr    string
	MongoURI      string
	MongoDB       string
	RootUsername  string // initial root user seeded on first boot
	RootPassword  string // initial root user password
	SessionPepper string
	GeoMMDBPath   string
}

func Load() (Config, error) {
	// ROOT_* is the current name; ADMIN_* is honored as a fallback for
	// existing installations that predate the rename.
	rootUser := envDefault("ROOT_USERNAME", envDefault("ADMIN_USERNAME", "root"))
	rootPass := envDefault("ROOT_PASSWORD", os.Getenv("ADMIN_PASSWORD"))
	c := Config{
		ListenAddr:    envDefault("LISTEN_ADDR", ":8080"),
		MongoURI:      os.Getenv("MONGO_URI"),
		MongoDB:       envDefault("MONGO_DB", "pager"),
		RootUsername:  rootUser,
		RootPassword:  rootPass,
		SessionPepper: os.Getenv("SESSION_PEPPER"),
		GeoMMDBPath:   envDefault("GEO_MMDB_PATH", "/data/db-ip-country-lite.mmdb"),
	}
	var missing []string
	if c.MongoURI == "" {
		missing = append(missing, "MONGO_URI")
	}
	if c.RootPassword == "" {
		missing = append(missing, "ROOT_PASSWORD")
	}
	if c.SessionPepper == "" {
		missing = append(missing, "SESSION_PEPPER")
	}
	if len(missing) > 0 {
		return c, fmt.Errorf("missing required env: %v", missing)
	}
	return c, nil
}

func envDefault(key, dflt string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return dflt
}

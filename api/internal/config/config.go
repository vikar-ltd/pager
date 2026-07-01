package config

import (
	"fmt"
	"os"
)

type Config struct {
	ListenAddr     string
	MongoURI       string
	MongoDB        string
	AdminUsername  string
	AdminPassword  string
	SessionPepper  string
	GeoMMDBPath    string
}

func Load() (Config, error) {
	c := Config{
		ListenAddr:    envDefault("LISTEN_ADDR", ":8080"),
		MongoURI:      os.Getenv("MONGO_URI"),
		MongoDB:       envDefault("MONGO_DB", "pager"),
		AdminUsername: os.Getenv("ADMIN_USERNAME"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		SessionPepper: os.Getenv("SESSION_PEPPER"),
		GeoMMDBPath:   envDefault("GEO_MMDB_PATH", "/data/db-ip-country-lite.mmdb"),
	}
	var missing []string
	if c.MongoURI == "" {
		missing = append(missing, "MONGO_URI")
	}
	if c.AdminUsername == "" {
		missing = append(missing, "ADMIN_USERNAME")
	}
	if c.AdminPassword == "" {
		missing = append(missing, "ADMIN_PASSWORD")
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

// Package geo resolves IPs to ISO 3166-1 alpha-2 country codes via an
// embedded MaxMind-format DB (DB-IP Lite Country, CC BY 4.0). The package
// is safe to use without an MMDB file present — Country returns "" until
// one is loaded, so callers don't need to special-case startup ordering.
package geo

import (
	"errors"
	"net"
	"os"
	"sync"

	"github.com/oschwald/maxminddb-golang"
)

type Resolver struct {
	mu sync.RWMutex
	r  *maxminddb.Reader
}

func NewResolver() *Resolver { return &Resolver{} }

// Load opens the MMDB file at path. Missing files are tolerated and reported as
// (false, nil) so the API still boots before the geo db has been baked in.
func (g *Resolver) Load(path string) (bool, error) {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	r, err := maxminddb.Open(path)
	if err != nil {
		return false, err
	}
	g.mu.Lock()
	old := g.r
	g.r = r
	g.mu.Unlock()
	if old != nil {
		_ = old.Close()
	}
	return true, nil
}

func (g *Resolver) Close() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.r == nil {
		return nil
	}
	return g.r.Close()
}

type countryRecord struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
}

// Country returns "" if the resolver isn't loaded, the IP is nil, or no match.
func (g *Resolver) Country(ip net.IP) string {
	if ip == nil {
		return ""
	}
	g.mu.RLock()
	r := g.r
	g.mu.RUnlock()
	if r == nil {
		return ""
	}
	var rec countryRecord
	if err := r.Lookup(ip, &rec); err != nil {
		return ""
	}
	return rec.Country.ISOCode
}

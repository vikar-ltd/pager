// Package tracker embeds the JS snippet and serves it at /pub/p.js.
package tracker

import (
	_ "embed"
	"net/http"
)

//go:embed tracker.js
var Script []byte

// Handler serves the snippet with a short cache TTL so deployments propagate
// within minutes. CORS is irrelevant for a same-origin <script src> include.
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(Script)
}

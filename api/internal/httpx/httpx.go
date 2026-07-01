// Package httpx is a thin JSON/HTTP utility layer used across handlers.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
)

type Error struct {
	Status int    `json:"-"`
	Code   string `json:"code"`
	Msg    string `json:"message"`
}

func (e *Error) Error() string { return e.Msg }

func Errorf(status int, code, msg string) *Error {
	return &Error{Status: status, Code: code, Msg: msg}
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Default().Warn("write json", "err", err)
	}
}

func WriteErr(w http.ResponseWriter, err error) {
	var e *Error
	if errors.As(err, &e) {
		WriteJSON(w, e.Status, e)
		return
	}
	slog.Default().Error("unhandled", "err", err)
	WriteJSON(w, http.StatusInternalServerError, &Error{Code: "internal", Msg: "internal error"})
}

func ReadJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return Errorf(http.StatusBadRequest, "bad_json", "invalid request body: "+err.Error())
	}
	return nil
}

// ClientIP picks the closest hop client IP from X-Forwarded-For (set by Caddy)
// and falls back to RemoteAddr. The leftmost XFF entry is the original client.
func ClientIP(r *http.Request) net.IP {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first := strings.TrimSpace(strings.SplitN(xff, ",", 2)[0])
		if ip := net.ParseIP(first); ip != nil {
			return ip
		}
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		if ip := net.ParseIP(strings.TrimSpace(xr)); ip != nil {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

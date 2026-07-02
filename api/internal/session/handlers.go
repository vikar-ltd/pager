package session

import (
	"errors"
	"net/http"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

// HandlerSet wires admin-sessions endpoints. Every user only ever sees and
// manages their own sessions — role doesn't factor in.
type HandlerSet struct {
	Store *Store
	Actor func(*http.Request) (userID primitive.ObjectID, sessionID string, ok bool)
}

func (h *HandlerSet) List(w http.ResponseWriter, r *http.Request) {
	uid, currentID, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	sessions, err := h.Store.List(r.Context(), uid)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	type row struct {
		Session
		Current bool `json:"current"`
	}
	out := make([]row, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, row{Session: s, Current: s.ID == currentID})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *HandlerSet) Terminate(w http.ResponseWriter, r *http.Request) {
	uid, _, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	id := r.PathValue("id")
	if id == "" {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "bad_request", "session id required"))
		return
	}
	// Defense in depth: even though the listing hides other users' sessions,
	// verify ownership before revoking so a guessed id can't hit anyone else.
	s, err := h.Store.find(r.Context(), id)
	if err != nil {
		if errors.Is(err, errNotFoundInternal) {
			httpx.WriteErr(w, httpx.Errorf(http.StatusNotFound, "not_found", "session not found"))
			return
		}
		httpx.WriteErr(w, err)
		return
	}
	if s.UserID != uid {
		httpx.WriteErr(w, httpx.Errorf(http.StatusNotFound, "not_found", "session not found"))
		return
	}
	if err := h.Store.Revoke(r.Context(), id); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// TerminateOthers revokes every session owned by the current user except the
// one making the call. Applies to any role — you can always sign out your own
// other devices.
func (h *HandlerSet) TerminateOthers(w http.ResponseWriter, r *http.Request) {
	uid, curID, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	n, err := h.Store.RevokeOthers(r.Context(), uid, curID)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int64{"revoked": n})
}

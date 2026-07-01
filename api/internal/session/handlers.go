package session

import (
	"net/http"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

// HandlerSet wires admin-sessions endpoints. The auth package puts the current
// session into context; we read it here to mark the "current" row and to
// protect against a client revoking the in-flight session via the others=1 flag.
type HandlerSet struct {
	Store   *Store
	Current func(*http.Request) (Session, bool)
}

func (h *HandlerSet) List(w http.ResponseWriter, r *http.Request) {
	sessions, err := h.Store.List(r.Context())
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	currentID := ""
	if cur, ok := h.Current(r); ok {
		currentID = cur.ID
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
	id := r.PathValue("id")
	if id == "" {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "bad_request", "session id required"))
		return
	}
	if err := h.Store.Revoke(r.Context(), id); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// TerminateOthers revokes every session except the one making the call.
func (h *HandlerSet) TerminateOthers(w http.ResponseWriter, r *http.Request) {
	cur, ok := h.Current(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	n, err := h.Store.RevokeOthers(r.Context(), cur.ID)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int64{"revoked": n})
}

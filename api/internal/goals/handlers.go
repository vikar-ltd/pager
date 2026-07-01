package goals

import (
	"errors"
	"net/http"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

type Handler struct {
	Store *Store
}

func (h *Handler) ListForProperty(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	out, err := h.Store.ListForProperty(r.Context(), propID)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if out == nil {
		out = []Goal{}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type createReq struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Pattern string `json:"pattern"`
}

func (h *Handler) CreateForProperty(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req createReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	g, err := h.Store.Create(r.Context(), propID, req.Name, req.Kind, req.Pattern)
	if err != nil {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "invalid", err.Error()))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, g)
}

type patchReq struct {
	Name    *string `json:"name"`
	Pattern *string `json:"pattern"`
}

func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("gid"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req patchReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	g, err := h.Store.Update(r.Context(), id, req.Name, req.Pattern)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteErr(w, httpx.Errorf(http.StatusNotFound, "not_found", "goal not found"))
			return
		}
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "invalid", err.Error()))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, g)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("gid"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := h.Store.Delete(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteErr(w, httpx.Errorf(http.StatusNotFound, "not_found", "goal not found"))
			return
		}
		httpx.WriteErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseID(s string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(s)
	if err != nil {
		return primitive.NilObjectID, httpx.Errorf(http.StatusBadRequest, "bad_id", "invalid id")
	}
	return id, nil
}

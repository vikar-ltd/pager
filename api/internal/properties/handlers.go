package properties

import (
	"errors"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

type Handler struct {
	Store *Store
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	out, err := h.Store.List(r.Context())
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if out == nil {
		out = []Property{}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type createReq struct {
	Name   string `json:"name"`
	Domain string `json:"domain"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Domain = strings.TrimSpace(req.Domain)
	if req.Name == "" {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "missing_name", "name is required"))
		return
	}
	p, err := h.Store.Create(r.Context(), req.Name, req.Domain)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	p, err := h.Store.FindByID(r.Context(), id)
	if err != nil {
		httpx.WriteErr(w, notFoundOr(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

type patchReq struct {
	Name   *string `json:"name"`
	Domain *string `json:"domain"`
}

func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req patchReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	p, err := h.Store.Update(r.Context(), id, req.Name, req.Domain)
	if err != nil {
		httpx.WriteErr(w, notFoundOr(err))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := h.Store.Delete(r.Context(), id); err != nil {
		httpx.WriteErr(w, notFoundOr(err))
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

func notFoundOr(err error) error {
	if errors.Is(err, ErrNotFound) {
		return httpx.Errorf(http.StatusNotFound, "not_found", "not found")
	}
	return err
}

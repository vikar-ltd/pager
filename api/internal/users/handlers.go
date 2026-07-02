package users

import (
	"context"
	"errors"
	"net/http"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

// SessionSync is the small slice of the session store we need — declared
// here so we don't take a direct dependency on the session package and keep
// the coupling explicit and tiny.
type SessionSync interface {
	RevokeAllForUser(ctx context.Context, userID primitive.ObjectID) (int64, error)
	DeleteAllForUser(ctx context.Context, userID primitive.ObjectID) (int64, error)
	RenameUser(ctx context.Context, userID primitive.ObjectID, newUsername string) error
}

type Handler struct {
	Store    *Store
	Sessions SessionSync
	// Actor returns the calling user's id + role so we can enforce
	// per-target permissions without importing the auth package here.
	Actor func(r *http.Request) (id primitive.ObjectID, role Role, ok bool)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.List(r.Context())
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if users == nil {
		users = []User{}
	}
	httpx.WriteJSON(w, http.StatusOK, users)
}

type createReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     Role   `json:"role"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	actorID, actorRole, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	var req createReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if !actorRole.CanCreate(req.Role) {
		httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "your role cannot create a "+string(req.Role)))
		return
	}
	u, err := h.Store.Create(r.Context(), req.Username, req.Password, req.Role, actorID)
	if err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, u)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	actorID, actorRole, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	targetID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	target, err := h.Store.FindByID(r.Context(), targetID)
	if err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	// Actors can only delete users below their tier. Self-delete allowed for
	// non-root; blocking root self-delete forces "use another root" and rules
	// out lockout when someone accidentally kills themselves.
	if !actorRole.CanDelete(target.Role) {
		httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "your role cannot delete a "+string(target.Role)))
		return
	}
	if target.ID == actorID && target.Role == RoleRoot {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "cant_self_delete_root", "root users cannot delete themselves; ask another root or demote first"))
		return
	}
	if err := h.Store.Delete(r.Context(), targetID); err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	// User is gone → their session docs no longer trace to a person. Hard
	// delete instead of soft revoke.
	_, _ = h.Sessions.DeleteAllForUser(r.Context(), targetID)
	w.WriteHeader(http.StatusNoContent)
}

type roleChangeReq struct {
	Role Role `json:"role"`
}

func (h *Handler) SetRole(w http.ResponseWriter, r *http.Request) {
	_, actorRole, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	if !actorRole.CanChangeRole() {
		httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "root role required to change roles"))
		return
	}
	targetID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req roleChangeReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	u, err := h.Store.SetRole(r.Context(), targetID, req.Role)
	if err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	// Force the target to sign back in so the new role takes effect immediately.
	_, _ = h.Sessions.RevokeAllForUser(r.Context(), targetID)
	httpx.WriteJSON(w, http.StatusOK, u)
}

type renameReq struct {
	Username string `json:"username"`
}

// SetUsername allows root to rename any user. Symmetric with SetPassword.
// Self-rename goes through the auth package (which requires the current
// password).
func (h *Handler) SetUsername(w http.ResponseWriter, r *http.Request) {
	_, actorRole, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	if actorRole != RoleRoot {
		httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "root required to rename other users"))
		return
	}
	targetID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req renameReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	u, err := h.Store.SetUsername(r.Context(), targetID, req.Username)
	if err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	_ = h.Sessions.RenameUser(r.Context(), targetID, u.Username)
	httpx.WriteJSON(w, http.StatusOK, u)
}

type resetPasswordReq struct {
	Password string `json:"password"`
}

// SetPassword allows root to reset any user's password. Own-password change
// goes through the auth package (which requires the current password).
func (h *Handler) SetPassword(w http.ResponseWriter, r *http.Request) {
	_, actorRole, ok := h.Actor(r)
	if !ok {
		httpx.WriteErr(w, httpx.Errorf(http.StatusUnauthorized, "unauthenticated", "sign in required"))
		return
	}
	if actorRole != RoleRoot {
		httpx.WriteErr(w, httpx.Errorf(http.StatusForbidden, "forbidden", "root required to reset other users' passwords"))
		return
	}
	targetID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	var req resetPasswordReq
	if err := httpx.ReadJSON(r, &req); err != nil {
		httpx.WriteErr(w, err)
		return
	}
	if err := h.Store.SetPassword(r.Context(), targetID, req.Password); err != nil {
		httpx.WriteErr(w, translateStoreErr(err))
		return
	}
	// Kick the target off any active sessions so they must re-authenticate.
	_, _ = h.Sessions.RevokeAllForUser(r.Context(), targetID)
	w.WriteHeader(http.StatusNoContent)
}

func parseID(s string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(s)
	if err != nil {
		return primitive.NilObjectID, httpx.Errorf(http.StatusBadRequest, "bad_id", "invalid user id")
	}
	return id, nil
}

func translateStoreErr(err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return httpx.Errorf(http.StatusNotFound, "not_found", "user not found")
	case errors.Is(err, ErrDuplicateName):
		return httpx.Errorf(http.StatusConflict, "duplicate", err.Error())
	case errors.Is(err, ErrLastRoot):
		return httpx.Errorf(http.StatusBadRequest, "last_root", err.Error())
	case errors.Is(err, ErrBadPassword), errors.Is(err, ErrBadRole), errors.Is(err, ErrBadUsername):
		return httpx.Errorf(http.StatusBadRequest, "invalid", err.Error())
	default:
		return err
	}
}

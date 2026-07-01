package reports

import (
	"net/http"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/vikar-ltd/pager/api/internal/httpx"
)

type Handler struct {
	Store *Store
}

func parseRange(r *http.Request) (Range, error) {
	q := r.URL.Query()
	now := time.Now().UTC()

	if fromS, toS := q.Get("from"), q.Get("to"); fromS != "" && toS != "" {
		from, err := time.Parse(time.RFC3339, fromS)
		if err != nil {
			return Range{}, httpx.Errorf(http.StatusBadRequest, "bad_from", "from must be RFC3339")
		}
		to, err := time.Parse(time.RFC3339, toS)
		if err != nil {
			return Range{}, httpx.Errorf(http.StatusBadRequest, "bad_to", "to must be RFC3339")
		}
		return Range{From: from, To: to, Unit: pickUnit(to.Sub(from))}, nil
	}

	switch q.Get("range") {
	case "", "24h":
		return Range{From: now.Add(-24 * time.Hour), To: now, Unit: "hour"}, nil
	case "7d":
		return Range{From: now.Add(-7 * 24 * time.Hour), To: now, Unit: "day"}, nil
	case "30d":
		return Range{From: now.Add(-30 * 24 * time.Hour), To: now, Unit: "day"}, nil
	case "90d":
		return Range{From: now.Add(-90 * 24 * time.Hour), To: now, Unit: "day"}, nil
	default:
		return Range{}, httpx.Errorf(http.StatusBadRequest, "bad_range", "range must be 24h, 7d, 30d, or 90d")
	}
}

func pickUnit(d time.Duration) string {
	if d <= 36*time.Hour {
		return "hour"
	}
	return "day"
}

func parseID(s string) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(s)
	if err != nil {
		return primitive.NilObjectID, httpx.Errorf(http.StatusBadRequest, "bad_id", "invalid id")
	}
	return id, nil
}

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	rng, err := parseRange(r)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	out, err := h.Store.Overview(r.Context(), propID, rng)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) Campaigns(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	rng, err := parseRange(r)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	groupBy := r.URL.Query().Get("groupBy")
	switch groupBy {
	case "", "source":
		groupBy = "source"
	case "medium", "campaign":
	default:
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "bad_groupBy", "groupBy must be source, medium, or campaign"))
		return
	}
	out, err := h.Store.Campaigns(r.Context(), propID, rng, groupBy)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"range": rng, "groupBy": groupBy, "rows": out})
}

func (h *Handler) Sources(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	rng, err := parseRange(r)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	out, err := h.Store.Sources(r.Context(), propID, rng)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"range": rng, "rows": out})
}

func (h *Handler) Visitors(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	rng, err := parseRange(r)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	out, err := h.Store.Visitors(r.Context(), propID, rng, limit)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"range": rng, "rows": out})
}

func (h *Handler) VisitorTimeline(w http.ResponseWriter, r *http.Request) {
	propID, err := parseID(r.PathValue("id"))
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	visitorID := r.PathValue("vid")
	if visitorID == "" {
		httpx.WriteErr(w, httpx.Errorf(http.StatusBadRequest, "bad_vid", "visitor id required"))
		return
	}
	out, err := h.Store.VisitorTimeline(r.Context(), propID, visitorID)
	if err != nil {
		httpx.WriteErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

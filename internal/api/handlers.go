package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"flowern/config"
	"flowern/internal/joern"
	"flowern/internal/project"
	"flowern/internal/store"
)

const (
	cloneTimeout   = 2 * time.Minute
	maxUploadBytes = 200 << 20
)

type Handler struct {
	cfg   config.Config
	store *store.Store
}

func NewHandler(cfg config.Config, s *store.Store) *Handler {
	return &Handler{cfg: cfg, store: s}
}

type createProjectRequest struct {
	Type     string `json:"type"`
	GitURL   string `json:"gitUrl"`
	Language string `json:"language"`
}

type createProjectResponse struct {
	ProjectID string `json:"projectId"`
	Status    string `json:"status"`
}

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		h.createFromZip(w, r)
		return
	}
	h.createFromGit(w, r)
}

func (h *Handler) createFromGit(w http.ResponseWriter, r *http.Request) {
	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.GitURL) == "" {
		writeError(w, http.StatusBadRequest, "gitUrl is required")
		return
	}

	id := h.store.Create()
	go h.analyzeGit(id, req.GitURL, req.Language)

	writeJSON(w, http.StatusAccepted, createProjectResponse{ProjectID: id, Status: string(store.StatusQueued)})
}

func (h *Handler) createFromZip(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart upload: "+err.Error())
		return
	}
	language := r.FormValue("language")

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	srcDir, cleanup, err := project.PrepareFromZip(h.cfg.WorkDir, file, header.Size)
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not extract zip: "+err.Error())
		return
	}

	id := h.store.Create()
	go h.analyzeSrc(id, srcDir, cleanup, language)

	writeJSON(w, http.StatusAccepted, createProjectResponse{ProjectID: id, Status: string(store.StatusQueued)})
}

func (h *Handler) analyzeGit(id, gitURL, language string) {
	h.store.SetStatus(id, store.StatusPreparing)

	ctx, cancel := context.WithTimeout(context.Background(), cloneTimeout)
	defer cancel()

	srcDir, cleanup, err := project.PrepareFromGit(ctx, h.cfg.WorkDir, gitURL)
	if err != nil {
		h.store.SetError(id, err.Error())
		return
	}
	h.analyzeSrc(id, srcDir, cleanup, language)
}

func (h *Handler) analyzeSrc(id, srcDir string, cleanup func(), language string) {
	defer cleanup()

	if strings.TrimSpace(language) == "" {
		lang, err := project.DetectLanguage(srcDir)
		if err != nil {
			h.store.SetError(id, err.Error())
			return
		}
		language = lang
	}

	h.store.SetStatus(id, store.StatusAnalyzing)

	result, err := joern.Run(context.Background(), h.cfg, srcDir, language, "")
	if err != nil {
		log.Printf("[error] project %s: joern run failed: %v", id, err)
		h.store.SetError(id, err.Error())
		return
	}

	h.store.SetResult(id, result)
}

type projectStatusResponse struct {
	ProjectID string `json:"projectId"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	writeJSON(w, http.StatusOK, projectStatusResponse{ProjectID: p.ID, Status: string(p.Status), Error: p.Error})
}

func (h *Handler) GetProjectResult(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, ok := h.store.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	switch p.Status {
	case store.StatusDone:
		writeJSON(w, http.StatusOK, p.Result)
	case store.StatusError:
		writeError(w, http.StatusUnprocessableEntity, p.Error)
	default:
		writeError(w, http.StatusConflict, "analysis not finished yet, status="+string(p.Status))
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

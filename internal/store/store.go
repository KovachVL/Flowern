package store

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"flowern/internal/joern"
)

type Status string

const (
	StatusQueued    Status = "queued"
	StatusPreparing Status = "preparing"
	StatusAnalyzing Status = "analyzing"
	StatusDone      Status = "done"
	StatusError     Status = "error"
)

type Project struct {
	ID        string
	Status    Status
	Error     string
	Result    *joern.Result
	CreatedAt time.Time
}

type Store struct {
	mu       sync.RWMutex
	projects map[string]*Project
}

func New() *Store {
	return &Store{projects: make(map[string]*Project)}
}

func (s *Store) Create() string {
	id := randomID()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.projects[id] = &Project{ID: id, Status: StatusQueued, CreatedAt: time.Now()}
	return id
}

func (s *Store) Get(id string) (Project, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.projects[id]
	if !ok {
		return Project{}, false
	}
	return *p, true
}

func (s *Store) SetStatus(id string, status Status) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.projects[id]; ok {
		p.Status = status
	}
}

func (s *Store) SetError(id string, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.projects[id]; ok {
		p.Status = StatusError
		p.Error = errMsg
	}
}

func (s *Store) SetResult(id string, result joern.Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.projects[id]; ok {
		p.Status = StatusDone
		p.Result = &result
	}
}

func randomID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte(time.Now().String()))[:16]
	}
	return hex.EncodeToString(b)
}

package main

import (
	"log"
	"net/http"

	"flowern/config"
	"flowern/internal/api"
	"flowern/internal/store"
)

func main() {
	cfg := config.Load()
	log.Printf("starting flowern server: %s", cfg)

	s := store.New()
	router := api.NewRouter(cfg, s)

	addr := ":" + cfg.Port
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}

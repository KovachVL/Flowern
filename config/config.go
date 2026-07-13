package config

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"time"
)

type Config struct {
	Port                string
	JoernExecMode       string
	JoernBinary         string
	JoernContainerName  string
	JoernScript         string
	JoernTimeout        time.Duration
	JoernExtraSourcePat string
	WorkDir             string
}

func Load() Config {
	cfg := Config{
		Port:                envOr("PORT", "8080"),
		JoernExecMode:       envOr("JOERN_EXEC_MODE", "binary"),
		JoernBinary:         envOr("JOERN_BINARY", "joern"),
		JoernContainerName:  envOr("JOERN_CONTAINER_NAME", "joern"),
		JoernScript:         envOr("JOERN_SCRIPT", "scripts/joern/flow_all.sc"),
		JoernTimeout:        envDurationSeconds("JOERN_TIMEOUT", 600),
		JoernExtraSourcePat: os.Getenv("JOERN_EXTRA_SOURCE_PATTERN"),
		WorkDir:             envOr("WORKDIR", os.TempDir()),
	}

	if cfg.JoernExecMode == "docker" {
		if _, err := exec.LookPath("docker"); err != nil {
			log.Printf("[warn] docker CLI not found on PATH: %v (analysis requests will fail until this is fixed)", err)
		}
	} else if _, err := exec.LookPath(cfg.JoernBinary); err != nil {
		log.Printf("[warn] joern binary %q not found on PATH: %v (analysis requests will fail until this is fixed)", cfg.JoernBinary, err)
	}
	if _, err := os.Stat(cfg.JoernScript); err != nil {
		log.Printf("[warn] joern script %q not found: %v", cfg.JoernScript, err)
	}

	return cfg
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envDurationSeconds(key string, fallbackSeconds int) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return time.Duration(fallbackSeconds) * time.Second
	}
	seconds, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("[warn] invalid %s=%q, using default %ds: %v", key, v, fallbackSeconds, err)
		return time.Duration(fallbackSeconds) * time.Second
	}
	return time.Duration(seconds) * time.Second
}

func (c Config) String() string {
	return fmt.Sprintf("port=%s joernExecMode=%s joernBinary=%s joernContainer=%s joernScript=%s timeout=%s workDir=%s",
		c.Port, c.JoernExecMode, c.JoernBinary, c.JoernContainerName, c.JoernScript, c.JoernTimeout, c.WorkDir)
}

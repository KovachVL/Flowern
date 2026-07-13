package joern

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"flowern/config"
)

func Run(ctx context.Context, cfg config.Config, srcDir, language, extraSourcePattern string) (Result, error) {
	runID, err := randomHex(4)
	if err != nil {
		return Result{}, fmt.Errorf("generate run id: %w", err)
	}

	scratchDir := filepath.Join(cfg.WorkDir, "flowern-scratch", runID)
	if err := os.MkdirAll(scratchDir, 0o755); err != nil {
		return Result{}, fmt.Errorf("create scratch dir: %w", err)
	}
	defer os.RemoveAll(scratchDir)

	outPath := filepath.Join(scratchDir, "out.json")

	absSrcDir, err := filepath.Abs(srcDir)
	if err != nil {
		return Result{}, fmt.Errorf("resolve src dir: %w", err)
	}

	args := []string{
		"--script", cfg.JoernScript,
		"--param", "srcPath=" + absSrcDir,
		"--param", "outPath=" + outPath,
		"--param", "language=" + language,
		"--param", "runId=" + runID,
	}
	pattern := extraSourcePattern
	if pattern == "" {
		pattern = cfg.JoernExtraSourcePat
	}
	if pattern != "" {
		args = append(args, "--param", "extraSourcePattern="+pattern)
	}

	ctx, cancel := context.WithTimeout(ctx, cfg.JoernTimeout)
	defer cancel()

	cmd := buildCommand(ctx, cfg, args)
	cmd.Dir = scratchDir
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return Result{}, fmt.Errorf("joern timed out after %s", cfg.JoernTimeout)
	}
	if err != nil {
		return Result{}, fmt.Errorf("joern exited with error: %w\noutput: %s", err, truncate(out, 4000))
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		return Result{}, fmt.Errorf("read joern output: %w\njoern stdout/stderr: %s", err, truncate(out, 4000))
	}

	var result Result
	if err := json.Unmarshal(data, &result); err != nil {
		return Result{}, fmt.Errorf("parse joern output: %w", err)
	}
	return result, nil
}

func buildCommand(ctx context.Context, cfg config.Config, args []string) *exec.Cmd {
	if cfg.JoernExecMode == "docker" {
		dockerArgs := append([]string{"exec", cfg.JoernContainerName, "joern"}, args...)
		return exec.CommandContext(ctx, "docker", dockerArgs...)
	}
	return exec.CommandContext(ctx, cfg.JoernBinary, args...)
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "...(truncated)"
}

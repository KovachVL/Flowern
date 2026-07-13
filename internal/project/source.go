package project

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var ErrUnsupportedLanguage = errors.New("could not detect a supported language (python, javascript, java)")

var extToLanguage = map[string]string{
	".py":   "python",
	".js":   "javascript",
	".jsx":  "javascript",
	".ts":   "javascript",
	".tsx":  "javascript",
	".java": "java",
}

var skipDirs = map[string]bool{
	".git": true, "node_modules": true, "vendor": true,
	"venv": true, ".venv": true, "__pycache__": true, "dist": true, "build": true,
}

func PrepareFromGit(ctx context.Context, workDir, url string) (dir string, cleanup func(), err error) {
	if strings.HasPrefix(strings.TrimSpace(url), "-") {
		return "", nil, fmt.Errorf("invalid git url")
	}

	dir, err = os.MkdirTemp(workDir, "flowern-src-")
	if err != nil {
		return "", nil, fmt.Errorf("create temp dir: %w", err)
	}
	cleanup = func() { os.RemoveAll(dir) }

	cmd := exec.CommandContext(ctx, "git", "clone", "--depth", "1", "--", url, dir)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("git clone failed: %w\n%s", err, out)
	}
	return dir, cleanup, nil
}

func PrepareFromZip(workDir string, file multipart.File, size int64) (dir string, cleanup func(), err error) {
	dir, err = os.MkdirTemp(workDir, "flowern-src-")
	if err != nil {
		return "", nil, fmt.Errorf("create temp dir: %w", err)
	}
	cleanup = func() { os.RemoveAll(dir) }

	tmpZip, err := os.CreateTemp(workDir, "flowern-upload-*.zip")
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("create temp zip: %w", err)
	}
	defer os.Remove(tmpZip.Name())
	defer tmpZip.Close()

	if _, err := io.Copy(tmpZip, file); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("save upload: %w", err)
	}

	zr, err := zip.OpenReader(tmpZip.Name())
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("open zip: %w", err)
	}
	defer zr.Close()

	cleanDir := filepath.Clean(dir)
	for _, f := range zr.File {
		if f.Mode()&os.ModeSymlink != 0 {
			continue
		}
		target := filepath.Join(dir, f.Name)
		cleanTarget := filepath.Clean(target)
		if cleanTarget != cleanDir && !strings.HasPrefix(cleanTarget, cleanDir+string(os.PathSeparator)) {
			cleanup()
			return "", nil, fmt.Errorf("zip entry escapes target directory: %q", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTarget, 0o755); err != nil {
				cleanup()
				return "", nil, err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
			cleanup()
			return "", nil, err
		}
		if err := extractZipFile(f, cleanTarget); err != nil {
			cleanup()
			return "", nil, err
		}
	}

	return dir, cleanup, nil
}

func extractZipFile(f *zip.File, target string) error {
	src, err := f.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

var rootMarkers = []struct {
	file string
	lang string
}{
	{"requirements.txt", "python"},
	{"pyproject.toml", "python"},
	{"Pipfile", "python"},
	{"setup.py", "python"},
	{"manage.py", "python"},
	{"pom.xml", "java"},
	{"build.gradle", "java"},
	{"build.gradle.kts", "java"},
	{"package.json", "javascript"},
}

func DetectLanguage(dir string) (string, error) {
	for _, m := range rootMarkers {
		if _, err := os.Stat(filepath.Join(dir, m.file)); err == nil {
			return m.lang, nil
		}
	}

	counts := map[string]int{}

	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if skipDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if lang, ok := extToLanguage[strings.ToLower(filepath.Ext(path))]; ok {
			counts[lang]++
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("walk source dir: %w", err)
	}

	best, bestCount := "", 0
	for lang, count := range counts {
		if count > bestCount {
			best, bestCount = lang, count
		}
	}
	if best == "" {
		return "", ErrUnsupportedLanguage
	}
	return best, nil
}

package native

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// HERESY 2998: the lab, the engine's start.py and the install are each started with Python in UTF-8 mode (PYTHONUTF8=1 and
// PYTHONIOENCODING=utf-8), so no file, pipe or line of theirs falls back to the system's code page (cp1251 on a Russian Windows)
func TestPythonsStartInUTF8(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, true)
	f.install = func(l Layout) (int, error) {
		_ = os.MkdirAll(filepath.Dir(l.Python()), 0o755)
		return 0, os.WriteFile(l.Python(), nil, 0o755)
	}
	if err := s.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	lab, eng := s.services()
	for name, env := range map[string][]string{"the install": f.instEnv, "the lab": lab.Spec.Env, "the engine": eng.Spec.Env} {
		have := map[string]bool{}
		for _, e := range env {
			have[e] = true
		}
		if !have["PYTHONUTF8=1"] || !have["PYTHONIOENCODING=utf-8"] || !have["PYTHONUNBUFFERED=1"] {
			t.Fatalf("%s starts with %v", name, env)
		}
	}
	if len(PyEnv) != 3 {
		t.Fatalf("PyEnv %v", PyEnv)
	}
}

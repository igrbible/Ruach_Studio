package native

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// HERESY 2989: the programs the Windows package brings come first on the lab's and the engine's PATH, and nothing changes without them
func TestRuntimeFirstOnPath(t *testing.T) {
	s := studio(t, newFake(), &fakeUI{}, false)
	s.Cfg.Layout.Win = true
	l := s.Cfg.Layout
	for _, f := range []string{filepath.Join("runtime", "ffmpeg", "ffmpeg.exe"), filepath.Join("runtime", "fluidsynth", "fluidsynth.exe"),
		filepath.Join("runtime", "notes", "README.txt"), filepath.Join("runtime", "ffmpeg.part", "ffmpeg.exe")} {
		p := filepath.Join(l.Root, f)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, nil, 0o644)
	}
	dirs := l.RuntimeDirs()
	if len(dirs) != 2 || filepath.Base(dirs[0]) != "ffmpeg" || filepath.Base(dirs[1]) != "fluidsynth" {
		t.Fatalf("runtime folders with an .exe, by name, no half-made one: %v", dirs)
	}
	old := `C:\Windows\system32;C:\Tools\FFMPEG\;` + strings.ToUpper(dirs[0]) + `;C:\Windows`
	got := PathFirst(dirs, old, ";")
	want := dirs[0] + ";" + dirs[1] + `;C:\Windows\system32;C:\Tools\FFMPEG\;C:\Windows`
	if got != want {
		t.Fatalf("PATH:\n got %s\nwant %s", got, want)
	}
	if again := PathFirst(dirs, got, ";"); again != got {
		t.Fatalf("a second time changes nothing: %s", again)
	}
	lab, eng := s.services()
	for _, v := range []*Service{lab, eng} {
		var path string
		for _, e := range v.Spec.Env {
			if strings.HasPrefix(e, "PATH=") {
				path = e[len("PATH="):]
			}
		}
		if !strings.HasPrefix(path, dirs[0]+";"+dirs[1]+";") {
			t.Fatalf("the %s starts with PATH %q", v.Spec.Name, path)
		}
	}
	if env := runtimeEnv(Layout{Root: l.Root}, "/usr/bin"); env != nil {
		t.Fatalf("not a Windows layout: nothing added (%v)", env)
	}
	if env := runtimeEnv(Layout{Root: t.TempDir(), Win: true}, `C:\Windows`); env != nil {
		t.Fatalf("no runtime folder: nothing added (%v)", env)
	}
}

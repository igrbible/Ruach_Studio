package native

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// RuntimeDirs (HERESY 2989, Viktor 25.11.2026: «В Windows сборку включи самый стабильный ffmpeg.exe, чтобы не иметь лишней зависимости»):
// runtime\<name> of every program the Windows package brings beside the Studio (launcher\win_tools.py: ffmpeg and ffprobe, FluidSynth),
// each a folder holding its .exe, by name; none where there is no runtime folder.
func (l Layout) RuntimeDirs() []string {
	ents, err := os.ReadDir(l.at("runtime"))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range ents {
		if !e.IsDir() || strings.HasSuffix(e.Name(), ".part") {
			continue
		}
		d := l.at("runtime", e.Name())
		files, _ := os.ReadDir(d)
		for _, f := range files {
			if !f.IsDir() && strings.EqualFold(filepath.Ext(f.Name()), ".exe") {
				out = append(out, d)
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

// PathFirst puts dirs first on a PATH value (its items split by sep), each once: an older mention of one further down is taken out, so
// the package's ffmpeg comes before any other on the machine. Windows compares folder names without case.
func PathFirst(dirs []string, old, sep string) string {
	key := func(p string) string { return strings.ToLower(strings.TrimRight(p, `\/`)) }
	mine := map[string]bool{}
	for _, d := range dirs {
		mine[key(d)] = true
	}
	out := append([]string{}, dirs...)
	for _, p := range strings.Split(old, sep) {
		if p != "" && !mine[key(p)] {
			out = append(out, p)
		}
	}
	return strings.Join(out, sep)
}

// runtimeEnv is the PATH the lab and the engine start with on Windows: the package's programs first (lab/winx.runtime_path does the same
// from inside, for a lab started any other way); nothing to add where the package brings none.
func runtimeEnv(l Layout, path string) []string {
	if !l.Win {
		return nil
	}
	dirs := l.RuntimeDirs()
	if len(dirs) == 0 {
		return nil
	}
	return []string{"PATH=" + PathFirst(dirs, path, ";")}
}

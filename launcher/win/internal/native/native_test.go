package native

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igrbible/ruach-launcher/internal/app"
)

// fakeProc lives until its life ends (0: until stopped) and then reports its code.
type fakeProc struct {
	pid     int
	done    chan struct{}
	code    int
	once    sync.Once
	stopped *int
	mu      *sync.Mutex
}

func (p *fakeProc) Pid() int              { return p.pid }
func (p *fakeProc) Done() <-chan struct{} { return p.done }
func (p *fakeProc) ExitCode() int         { return p.code }
func (p *fakeProc) end()                  { p.once.Do(func() { close(p.done) }) }
func (p *fakeProc) Stop() error {
	p.mu.Lock()
	*p.stopped++
	p.mu.Unlock()
	p.end()
	return nil
}

// role is how a fake service behaves: what it prints, whether its health answers while it lives, how long it lives, its exit code.
type role struct {
	say  string
	up   bool
	life time.Duration
	code int
}

type fakePlat struct {
	mu      sync.Mutex
	roles   map[string]role
	spawns  map[string]int
	stopped int
	up      map[string]bool // health by service name while it lives
	install func(l Layout) (int, error)
	opened  []string
	outside map[string]bool // answering before anything is started
}

func newFake() *fakePlat {
	return &fakePlat{roles: map[string]role{"lab": {say: "lab listening", up: true}, "engine": {say: "  engine       engine\\cuda", up: true}},
		spawns: map[string]int{}, up: map[string]bool{}, outside: map[string]bool{}}
}

func (f *fakePlat) Spawn(s Spec, out *Log) (Proc, error) {
	f.mu.Lock()
	f.spawns[s.Name]++
	n := f.spawns[s.Name]
	r := f.roles[s.Name]
	f.up[s.Name] = r.up
	f.mu.Unlock()
	fmt.Fprintln(out, r.say)
	p := &fakeProc{pid: 100*n + len(s.Name), done: make(chan struct{}), code: r.code, stopped: &f.stopped, mu: &f.mu}
	go func() {
		if r.life > 0 {
			select {
			case <-time.After(r.life):
			case <-p.done:
			}
			p.end()
		}
		<-p.done
		f.mu.Lock()
		f.up[s.Name] = false
		f.mu.Unlock()
	}()
	return p, nil
}

func (f *fakePlat) RunInstall(l Layout, env []string) (int, error) {
	if f.install == nil {
		return -1, errors.New("no install")
	}
	return f.install(l)
}
func (f *fakePlat) OpenApp(url string) error {
	f.mu.Lock()
	f.opened = append(f.opened, url)
	f.mu.Unlock()
	return nil
}
func (f *fakePlat) OpenURL(string) error { return nil }
func (f *fakePlat) OpenFolder(string, string) error {
	return nil
}
func (f *fakePlat) Output(_ time.Duration, exe string, args ...string) (string, error) {
	switch {
	case exe == "nvidia-smi" && len(args) > 0:
		return "0, NVIDIA GeForce RTX 3090, 591.44, 24576 MiB, 1200 MiB, 8.6\n", nil
	case exe == "nvidia-smi":
		return "+---- the table ----+\n", nil
	case strings.HasSuffix(exe, "python") || strings.HasSuffix(exe, "python.exe"):
		return "Python 3.12.10\n", nil
	}
	return "", errors.New("not found")
}
func (f *fakePlat) Facts(string) []Fact {
	return []Fact{{"Windows", "Windows 11 Pro 23H2 · build 22631.4460"}}
}
func (f *fakePlat) ReportDir(l Layout) string { return l.Logs() }

func (f *fakePlat) get(_ context.Context, url string) (int, []byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	name := "engine"
	if strings.Contains(url, ":41870/") {
		name = "lab"
	}
	if f.up[name] || f.outside[name] {
		return 200, []byte(`{"status":"ok","name":"` + name + `"}`), nil
	}
	return 0, nil, errors.New("connection refused")
}

func (f *fakePlat) count(name string) int { f.mu.Lock(); defer f.mu.Unlock(); return f.spawns[name] }

// fakeUI answers each question from its list (yes when the list is used up) and keeps what was said.
type fakeUI struct {
	mu      sync.Mutex
	answers []bool
	asked   []string
	errs    []string
	status  []string
}

func (u *fakeUI) Status(m string)     { u.mu.Lock(); u.status = append(u.status, m); u.mu.Unlock() }
func (u *fakeUI) Info(string, string) {}
func (u *fakeUI) Error(t, m string)   { u.mu.Lock(); u.errs = append(u.errs, m); u.mu.Unlock() }
func (u *fakeUI) Ask(t, m string) bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.asked = append(u.asked, t)
	if len(u.answers) == 0 {
		return true
	}
	a := u.answers[0]
	u.answers = u.answers[1:]
	return a
}

// studio: a native folder in a temp dir (its Python there unless noPython), fast clocks.
func studio(t *testing.T, f *fakePlat, ui *fakeUI, noPython bool) *Studio {
	t.Helper()
	root := t.TempDir()
	l := Layout{Root: root}
	for _, p := range []string{l.Lab(), l.Start(), filepath.Join(root, "VERSION")} {
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte("2.1.0\n"), 0o644)
	}
	if !noPython {
		_ = os.MkdirAll(filepath.Dir(l.Python()), 0o755)
		_ = os.WriteFile(l.Python(), nil, 0o755)
	}
	cfg := Defaults(l, "test")
	cfg.EngineWait, cfg.LabWait, cfg.HealthEvery = 2*time.Second, 300*time.Millisecond, 5*time.Millisecond
	cfg.RestartDelay, cfg.QuickExit, cfg.QuickExits = 5*time.Millisecond, 200*time.Millisecond, 3
	s := &Studio{Cfg: cfg, UI: ui, P: f, Get: f.get}
	t.Cleanup(func() { s.Stop(); s.Close() })
	return s
}

func TestLayoutAndFound(t *testing.T) {
	w := Layout{Root: `C:\RuachStudio`, Win: true}
	if !strings.HasSuffix(w.Python(), filepath.Join(".venv", "Scripts", "python.exe")) || !strings.HasSuffix(w.Certifi(), "cacert.pem") {
		t.Fatalf("a Windows layout: %s %s", w.Python(), w.Certifi())
	}
	if p := (Layout{Root: "/x", Py: "/usr/bin/python3"}).Python(); p != "/usr/bin/python3" {
		t.Fatalf("Py overrides .venv: %s", p)
	}
	s := studio(t, newFake(), &fakeUI{}, false)
	if !Found(s.Cfg.Layout.Root) || Found(t.TempDir()) {
		t.Fatal("Found: the native folder yes, an empty one no")
	}
	if v := s.Cfg.Layout.Version(); v != "2.1.0" {
		t.Fatalf("VERSION read as %q", v)
	}
}

func TestPathLength(t *testing.T) {
	if n := PathLength(`C:\Users\Миша\Downloads\RuachStudio`); n != 35 {
		t.Fatalf("UTF-16 units of a Cyrillic path: %d", n)
	}
	if n := PathLength("😀"); n != 2 {
		t.Fatalf("a character past the BMP is two units: %d", n)
	}
	if PathBudget != 94 {
		t.Fatalf("the budget 260-166: %d", PathBudget)
	}
}

func TestEnsureFirstStartInstallsThenStartsBoth(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, true)
	installed := 0
	f.install = func(l Layout) (int, error) {
		installed++
		_ = os.MkdirAll(filepath.Dir(l.Python()), 0o755)
		return 0, os.WriteFile(l.Python(), nil, 0o755)
	}
	if err := s.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if installed != 1 || f.count("lab") != 1 || f.count("engine") != 1 {
		t.Fatalf("install %d, lab %d, engine %d", installed, f.count("lab"), f.count("engine"))
	}
	if len(ui.asked) != 1 || ui.asked[0] != "Ruach Studio's first start" {
		t.Fatalf("asked %v", ui.asked)
	}
	if err := s.Open(); err != nil || len(f.opened) != 1 || f.opened[0] != "http://127.0.0.1:7777/" {
		t.Fatalf("opened %v", f.opened)
	}
	// a second Ensure finds both running: nothing spawned again, nothing asked
	if err := s.Ensure(context.Background()); err != nil || f.count("lab") != 1 || f.count("engine") != 1 || len(ui.asked) != 1 {
		t.Fatalf("second Ensure: %v, lab %d engine %d, asked %v", err, f.count("lab"), f.count("engine"), ui.asked)
	}
}

func TestEnsureDeclinedAndFailedInstall(t *testing.T) {
	f, ui := newFake(), &fakeUI{answers: []bool{false}}
	s := studio(t, f, ui, true)
	called := false
	f.install = func(Layout) (int, error) { called = true; return 3, nil }
	if err := s.Ensure(context.Background()); !errors.Is(err, app.ErrDeclined) || called {
		t.Fatalf("a no: %v, install called %v", err, called)
	}
	ui.answers = nil
	err := s.Ensure(context.Background())
	if err == nil || !strings.Contains(err.Error(), "install stopped (exit 3)") || f.count("lab") != 0 {
		t.Fatalf("a failed install: %v, lab %d", err, f.count("lab"))
	}
}

func TestLongFolderAskedFirst(t *testing.T) {
	f, ui := newFake(), &fakeUI{answers: []bool{false}}
	s := studio(t, f, ui, true)
	s.Cfg.Layout.Win = true
	s.Cfg.Layout.Root = filepath.Join(t.TempDir(), strings.Repeat("я", 90), "RuachStudio")
	if err := s.Ensure(context.Background()); !errors.Is(err, app.ErrDeclined) || len(ui.asked) != 1 || ui.asked[0] != "A long folder" {
		t.Fatalf("%v, asked %v", err, ui.asked)
	}
}

func TestAnsweringServiceIsLeftAlone(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	f.outside["engine"], f.outside["lab"] = true, true
	s := studio(t, f, ui, false)
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if f.count("lab")+f.count("engine") != 0 {
		t.Fatal("a Studio started by RuachStudio.cmd got a second one")
	}
	if st := s.Services()[1].State(); !strings.Contains(st, "outside this launcher") {
		t.Fatalf("state %q", st)
	}
}

func TestEndedServiceStartsAgain(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	f.roles["lab"] = role{say: "lab up", up: true, life: 400 * time.Millisecond} // lives past QuickExit (200 ms): never given up
	s := studio(t, f, ui, false)
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for f.count("lab") < 3 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	lab := s.Services()[0]
	if f.count("lab") < 3 || lab.GaveUp() || lab.Restarts() < 2 {
		t.Fatalf("lab spawned %d times, gave up %v, restarts %d", f.count("lab"), lab.GaveUp(), lab.Restarts())
	}
	s.Stop()
	n := f.count("lab")
	time.Sleep(100 * time.Millisecond)
	if f.count("lab") != n || lab.Running() {
		t.Fatal("a stopped service started again")
	}
	if !strings.Contains(readFile(t, lab.Out().Path()), "started by the launcher") {
		t.Fatal("the launcher's own lines are not in lab.log")
	}
}

func TestFailingEngineGivenUpWithItsLastLines(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	f.roles["engine"] = role{say: "missing models\\engine\\yue2\\YuE2-3B-Q8_0.gguf", life: time.Millisecond, code: 1}
	s := studio(t, f, ui, false)
	err := s.Start(context.Background())
	if err == nil || !strings.Contains(err.Error(), "ended 3 times right after its start") || !strings.Contains(err.Error(), "missing models") {
		t.Fatalf("%v", err)
	}
	if f.count("engine") != 3 {
		t.Fatalf("spawned %d times, not 3", f.count("engine"))
	}
	if len(ui.errs) != 0 {
		t.Fatalf("the give-up was said twice (a box beside Ensure's error): %v", ui.errs)
	}
	if st := s.Services()[1].State(); !strings.Contains(st, "given up") || !strings.Contains(st, "exit 1") {
		t.Fatalf("state %q", st)
	}
	// a Restart starts it afresh
	f.roles["engine"] = role{say: "ok", up: true}
	if err := s.Restart(context.Background()); err != nil || f.count("engine") != 4 {
		t.Fatalf("restart: %v, spawned %d", err, f.count("engine"))
	}
}

func TestGiveUpWhileRunningIsSaidInABox(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, false)
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.mu.Lock()
	f.roles["engine"] = role{say: "CUDA error: out of memory", life: time.Millisecond, code: 3}
	f.mu.Unlock()
	_ = s.Services()[1].proc().Stop() // the engine dies under the Studio
	deadline := time.Now().Add(3 * time.Second)
	for !s.Services()[1].GaveUp() && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	ui.mu.Lock()
	defer ui.mu.Unlock()
	if len(ui.errs) != 1 || !strings.Contains(ui.errs[0], "out of memory") {
		t.Fatalf("errors said: %v", ui.errs)
	}
}

func TestStopEndsWhatTheLabLeftBehind(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	f.roles["lab"] = role{say: "lab", up: true, life: 50 * time.Millisecond}
	s := studio(t, f, ui, false)
	s.Cfg.QuickExits = 100
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	time.Sleep(200 * time.Millisecond)
	s.Stop()
	f.mu.Lock()
	defer f.mu.Unlock()
	// every lab that ended by itself is stopped once more (its job's leftovers), the running one once, the engine once
	if want := f.spawns["lab"] + 1; f.stopped < want {
		t.Fatalf("stopped %d of at least %d", f.stopped, want)
	}
}

func readFile(t *testing.T, p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestLogRotatesAndTails(t *testing.T) {
	p := filepath.Join(t.TempDir(), "logs", "engine.log")
	l := OpenLog(p, 100)
	for i := 0; i < 6; i++ {
		fmt.Fprintf(l, "line %d %s\n", i, strings.Repeat("x", 30))
	}
	fmt.Fprint(l, "progress 10%\rprogress 90%\n\n")
	l.Mark("it ended (exit 1)")
	l.Close()
	if _, err := os.Stat(Rotated(p)); err != nil || filepath.Base(Rotated(p)) != "engine.1.log" {
		t.Fatalf("no %s: %v", Rotated(p), err)
	}
	if st, _ := os.Stat(p); st.Size() > 100 {
		t.Fatalf("engine.log %d bytes past its 100", st.Size())
	}
	if tail := l.Tail(2); tail != "  line 5 "+strings.Repeat("x", 30)+"\n  progress 90%" {
		t.Fatalf("tail %q", tail)
	}
	l.Mark("started by the launcher (pid 7)")
	fmt.Fprintln(l, "missing models")
	l.Mark("it ended (exit 1)")
	if tail := l.Tail(5); tail != "  missing models" {
		t.Fatalf("the tail of the last start only: %q", tail)
	}
	if (&Log{}).Tail(3) != "  (nothing yet)" {
		t.Fatal("an empty tail")
	}
}

func TestEngineSaysTheLastStart(t *testing.T) {
	p := filepath.Join(t.TempDir(), "engine.log")
	_ = os.WriteFile(p, []byte("Ruach Studio 2.0.9 · RuachStudio  http://10.0.0.2:7777\n  gpu          old card\n"+
		"Ruach Studio 2.1.0 · RuachStudio  http://10.0.0.2:7777\nThe Studio's port: 7777\n  gpu          Quadro P5200 · 0.3 of 16.0 GiB in use · compute 6.1\n"+
		"  backbones    RS-TW-2.0x0.75-Q6_K 2.6G starts\n  engine       engine\\cuda · up to 2 songs per pass\nload_model: 4.1 s\n"), 0o644)
	got := engineSays(p)
	if strings.Contains(got, "old card") || !strings.Contains(got, "Quadro P5200") || !strings.Contains(got, `engine\cuda`) || strings.Contains(got, "load_model") {
		t.Fatalf("%q", got)
	}
}

func TestReport(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, false)
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	l := s.Cfg.Layout
	_ = os.WriteFile(filepath.Join(l.Root, "BUILD.txt"), []byte("Ruach Studio 2.1.0, the native Windows package (beta)\n"), 0o644)
	big := filepath.Join(l.Logs(), "lab.1.log")
	_ = os.WriteFile(big, []byte(strings.Repeat("an old lab line\n", ReportLogMax/16+1000)), 0o644)
	dir := filepath.Join(t.TempDir(), "Desktop")
	p, err := s.Report(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(filepath.Base(p), "RuachStudio-report-") || !strings.HasSuffix(p, ".zip") {
		t.Fatalf("named %s", p)
	}
	if left, _ := filepath.Glob(filepath.Join(dir, "*.part")); len(left) != 0 {
		t.Fatalf("a part file left: %v", left)
	}
	z, err := zip.OpenReader(p)
	if err != nil {
		t.Fatal(err)
	}
	defer z.Close()
	files := map[string]string{}
	for _, e := range z.File {
		r, _ := e.Open()
		b, _ := io.ReadAll(r)
		r.Close()
		files[e.Name] = string(b)
	}
	for _, n := range []string{"report.txt", "logs/launcher.log", "logs/lab.log", "logs/engine.log", "logs/lab.1.log", "BUILD.txt", "nvidia-smi.txt"} {
		if _, ok := files[n]; !ok && n != "logs/launcher.log" {
			t.Errorf("no %s in the report (%d files)", n, len(files))
		}
	}
	r := files["report.txt"]
	for _, want := range []string{"a tester's report", "nothing is sent anywhere", "Windows 11 Pro 23H2", "Python 3.12.10", "RTX 3090", "8.6",
		"http://127.0.0.1:41870/health → 200", "running, pid", "The lab's health", "\r\n"} {
		if !strings.Contains(r, want) {
			t.Errorf("report.txt lacks %q:\n%s", want, r)
		}
	}
	if old := files["logs/lab.1.log"]; len(old) > ReportLogMax+100 || !strings.HasPrefix(old, "[the first ") {
		t.Errorf("a long log is not cut to its last 4 MB with a note: %d bytes, %q", len(old), old[:40])
	}
}

// HERESY 2928b (the 2.1.0-rc1 Windows soak): an install that stopped before its models goes on at the next start; the models declined are
// said as such; the launcher's mark is set only by an install that ended whole, and then nothing is asked again.
// HERESY 2933: a folder that holds a new version (2928b's mark held a time, no version) installs once more, asked by the version's name, and
// is marked for it; the same version again starts at once
func TestNewVersionInstallsAgain(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, true)
	s.Cfg.Layout.Win = true
	l := s.Cfg.Layout
	_ = os.MkdirAll(filepath.Dir(l.Python()), 0o755)
	_ = os.WriteFile(l.Python(), nil, 0o755)
	_ = os.WriteFile(l.at("VERSION"), []byte("2.1.0-rc2\n"), 0o644)
	_ = os.WriteFile(l.InstallDone(), []byte("2026-11-21T14:25:05-08:00\n"), 0o644)
	n := 0
	f.install = func(Layout) (int, error) { n++; return 0, nil }
	if err := s.Ensure(context.Background()); err != nil || n != 1 || len(ui.asked) != 1 || ui.asked[0] != "Ruach Studio 2.1.0-rc2" {
		t.Fatalf("a new version: %v, installs %d, asked %v", err, n, ui.asked)
	}
	if got := l.InstalledFor(); got != "2.1.0-rc2" {
		t.Fatalf("the mark says %q", got)
	}
	if err := s.Ensure(context.Background()); err != nil || n != 1 || len(ui.asked) != 1 {
		t.Fatalf("installed again for the same version: %v, installs %d, asked %v", err, n, ui.asked)
	}
	if versionWord("2026-11-21T14:25:05-08:00") != "an earlier version" || versionWord("2.1.0-rc1") != "2.1.0-rc1" {
		t.Fatal("versionWord")
	}
}

func TestStoppedInstallGoesOn(t *testing.T) {
	f, ui := newFake(), &fakeUI{}
	s := studio(t, f, ui, true)
	s.Cfg.Layout.Win = true
	l := s.Cfg.Layout
	_ = os.MkdirAll(filepath.Dir(l.Python()), 0o755)
	_ = os.WriteFile(l.Python(), nil, 0o755) // .venv made, the models' step not done
	codes := []int{5, 0}
	f.install = func(Layout) (int, error) { c := codes[0]; codes = codes[1:]; return c, nil }
	err := s.Ensure(context.Background())
	if err == nil || !strings.Contains(err.Error(), "were not downloaded") || f.count("lab") != 0 || len(ui.asked) != 1 || ui.asked[0] != "Ruach Studio's install" {
		t.Fatalf("the models declined: %v, lab %d, asked %v", err, f.count("lab"), ui.asked)
	}
	if _, e := os.Stat(l.InstallDone()); e == nil {
		t.Fatal("the mark set by an install that stopped")
	}
	if err := s.Ensure(context.Background()); err != nil || f.count("lab") != 1 || f.count("engine") != 1 || len(ui.asked) != 2 {
		t.Fatalf("the install gone on: %v, lab %d engine %d, asked %v", err, f.count("lab"), f.count("engine"), ui.asked)
	}
	if _, e := os.Stat(l.InstallDone()); e != nil {
		t.Fatalf("no mark after an install that ended whole: %v", e)
	}
	if err := s.Ensure(context.Background()); err != nil || len(ui.asked) != 2 || len(codes) != 0 {
		t.Fatalf("asked again after the mark: %v, asked %v", err, ui.asked)
	}
}

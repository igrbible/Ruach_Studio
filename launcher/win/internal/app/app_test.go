package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igrbible/ruach-launcher/internal/wsl"
)

// fakeWSL is wsl.exe as a small state machine: installed or not, a version, a card or none.
type fakeWSL struct {
	version   string // "" = the stub of a Windows without WSL
	inbox     bool
	installed bool
	gpu       bool
	noModels  bool
	calls     []string
	alive     []*proc
}

type proc struct{ done chan struct{} }

func (p *proc) Stop() error {
	select {
	case <-p.done:
	default:
		close(p.done)
	}
	return nil
}
func (p *proc) Done() <-chan struct{} { return p.done }

func (f *fakeWSL) Run(_ context.Context, args ...string) (wsl.Result, error) {
	k := strings.Join(args, " ")
	f.calls = append(f.calls, k)
	switch {
	case k == "--version":
		if f.inbox {
			return wsl.Result{Code: -1, Stdout: "Invalid command line option: --version\n" + strings.Repeat("  --list\n", 40)}, nil
		}
		if f.version == "" {
			return wsl.Result{Code: 1, Stdout: "WSL is not installed. Run 'wsl.exe --install'.\n"}, nil
		}
		return wsl.Result{Stdout: "WSL version: " + f.version + "\nKernel version: 6.6.87.2-1\n"}, nil
	case k == "--list --quiet":
		if f.installed {
			return wsl.Result{Stdout: "Ubuntu\nRuachStudio\n"}, nil
		}
		return wsl.Result{Code: -1, Stdout: "no installed distributions\n"}, nil
	case strings.HasPrefix(k, "--install --from-file") || strings.HasPrefix(k, "--import"):
		f.installed = true
		return wsl.Result{}, nil
	case strings.HasSuffix(k, "nvidia-smi -L"):
		if f.gpu {
			return wsl.Result{Stdout: "GPU 0: NVIDIA GeForce RTX 4070 (UUID: GPU-x)\n"}, nil
		}
		return wsl.Result{Code: 127}, nil
	case strings.HasPrefix(k, "--terminate") || strings.HasPrefix(k, "--unregister"):
		if strings.HasPrefix(k, "--unregister") {
			f.installed = false
		}
		return wsl.Result{}, nil
	case strings.Contains(k, "--exec /bin/sh -c ls /opt/ruach-studio/models/engine/yue2/YuE2-3B-*.gguf"):   // HERESY 2330: models/<room>/
		if f.noModels {
			return wsl.Result{Code: 2}, nil
		}
		return wsl.Result{}, nil
	case strings.HasSuffix(k, "/bin/cat /opt/ruach-studio/VERSION"):
		return wsl.Result{Stdout: "2.0.6\n"}, nil
	}
	return wsl.Result{Code: 1, Stderr: "fake: " + k}, nil
}

func (f *fakeWSL) Start(args ...string) (wsl.Process, error) {
	f.calls = append(f.calls, "START "+strings.Join(args, " "))
	p := &proc{done: make(chan struct{})}
	f.alive = append(f.alive, p)
	return p, nil
}

type fakeOS struct {
	build     int
	elevated  []string
	elevCode  int
	opened    []string
	consoles  []string
	runs      []string
	runCode   int
	afterRun  func()
	resumes   int
	afterElev func()
}

func (o *fakeOS) WindowsBuild() int { return o.build }
func (o *fakeOS) RunElevated(exe string, args ...string) (int, error) {
	o.elevated = append(o.elevated, exe+" "+strings.Join(args, " "))
	if o.afterElev != nil {
		o.afterElev()
	}
	return o.elevCode, nil
}
func (o *fakeOS) OpenApp(url string) error { o.opened = append(o.opened, url); return nil }
func (o *fakeOS) OpenConsole(args ...string) error {
	o.consoles = append(o.consoles, strings.Join(args, " "))
	return nil
}
func (o *fakeOS) RunConsole(args ...string) (int, error) {
	o.runs = append(o.runs, strings.Join(args, " "))
	if o.afterRun != nil {
		o.afterRun()
	}
	return o.runCode, nil
}
func (o *fakeOS) ScheduleResume() error { o.resumes++; return nil }

type fakeUI struct {
	answer   bool
	asked    []string
	statuses []string
	infos    []string
}

func (u *fakeUI) Status(m string)      { u.statuses = append(u.statuses, m) }
func (u *fakeUI) Info(t, m string)     { u.infos = append(u.infos, t) }
func (u *fakeUI) Ask(t, m string) bool { u.asked = append(u.asked, t); return u.answer }
func (u *fakeUI) Error(t, m string)    {}

func newApp(t *testing.T, f *fakeWSL, o *fakeOS, u *fakeUI, healthyAfter int) *App {
	n := 0
	return &App{
		Cfg: Config{Distro: "RuachStudio", Port: 7777, Root: "/opt/ruach-studio", Location: `C:\L\RuachStudio\wsl`,
			MinBuild: 19044, HealthTimeout: 2 * time.Second, HealthEvery: 5 * time.Millisecond},
		WSL: &wsl.Client{R: f, Name: "RuachStudio"}, UI: u, OS: o,
		Get: func(ctx context.Context, url string) (int, []byte, error) {
			if !strings.HasSuffix(url, "/health") {
				t.Fatalf("health asked at %s", url)
			}
			n++
			if n > healthyAfter {
				return 200, []byte(`{"status":"ok"}`), nil
			}
			return 0, nil, errors.New("connection refused")
		},
	}
}

func wslFile(t *testing.T, body string, sha string) string {
	d := t.TempDir()
	p := filepath.Join(d, "RuachStudio-2.0.6.wsl")
	os.WriteFile(p, []byte(body), 0o644)
	if sha != "" {
		os.WriteFile(p+".sha256", []byte(sha+"  RuachStudio-2.0.6.wsl\n"), 0o644)
	}
	return p
}

func TestFreshInstallThenStart(t *testing.T) {
	f := &fakeWSL{version: "2.6.1.0", gpu: true}
	o, u := &fakeOS{build: 26100}, &fakeUI{answer: true}
	a := newApp(t, f, o, u, 3)
	// the file is checked against its .sha256 before it installs
	a.Cfg.WSLFile = wslFile(t, "tar", strings.Repeat("ab", 32))
	if err := a.Ensure(context.Background()); err == nil || !strings.Contains(err.Error(), "damaged") {
		t.Fatal("a wrong sha256 must stop the install:", err)
	}
	a.Cfg.WSLFile = wslFile(t, "tar", sha("tar"))
	if err := a.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := "--install --from-file " + a.Cfg.WSLFile + " --name RuachStudio --location " + a.Cfg.Location + " --no-launch"
	if !contains(f.calls, want) {
		t.Fatal("install call missing:", f.calls)
	}
	if !contains(f.calls, "START --distribution RuachStudio --exec /bin/sleep infinity") || a.NoGPU() {
		t.Fatal(f.calls, a.NoGPU())
	}
	a.Open()
	if len(o.opened) != 1 || o.opened[0] != "http://localhost:7777/" {
		t.Fatal(o.opened)
	}
}

func TestOldWSLImports(t *testing.T) {
	f := &fakeWSL{version: "2.3.26.0", gpu: false}
	a := newApp(t, f, &fakeOS{build: 22631}, &fakeUI{answer: true}, 0)
	a.Cfg.WSLFile = wslFile(t, "tar", "")
	if err := a.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !contains(f.calls, "--import RuachStudio "+a.Cfg.Location+" "+a.Cfg.WSLFile+" --version 2") || !a.NoGPU() {
		t.Fatal(f.calls)
	}
}

func TestMissingWSLAsksElevatesAndAsksForRestart(t *testing.T) {
	f := &fakeWSL{version: ""}
	o, u := &fakeOS{build: 26100}, &fakeUI{answer: true}
	a := newApp(t, f, o, u, 0)
	if err := a.Ensure(context.Background()); !errors.Is(err, ErrRestart) {
		t.Fatal(err)
	}
	if len(o.elevated) != 1 || o.elevated[0] != "wsl.exe --install --no-distribution" || o.resumes != 1 {
		t.Fatal(o.elevated, o.resumes)
	}
	u.answer = false
	if err := a.Ensure(context.Background()); !errors.Is(err, ErrDeclined) {
		t.Fatal("a no must stop it:", err)
	}
}

func TestInboxUpdates(t *testing.T) {
	f := &fakeWSL{inbox: true, installed: true, gpu: true}
	o := &fakeOS{build: 19045}
	o.afterElev = func() { f.inbox = false; f.version = "2.6.1.0" }
	a := newApp(t, f, o, &fakeUI{answer: true}, 0)
	if err := a.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(o.elevated) != 1 || o.elevated[0] != "wsl.exe --update" {
		t.Fatal(o.elevated)
	}
}

func TestOldWindowsAndMissingFile(t *testing.T) {
	a := newApp(t, &fakeWSL{version: "2.6.1.0"}, &fakeOS{build: 18363}, &fakeUI{}, 0)
	if err := a.Ensure(context.Background()); err == nil || !strings.Contains(err.Error(), "too old") {
		t.Fatal(err)
	}
	a = newApp(t, &fakeWSL{version: "2.6.1.0"}, &fakeOS{build: 26100}, &fakeUI{}, 0)
	if err := a.Ensure(context.Background()); err == nil || !strings.Contains(err.Error(), ".wsl") {
		t.Fatal(err)
	}
}

func TestHealthTimeoutAndDeadDistro(t *testing.T) {
	f := &fakeWSL{version: "2.6.1.0", installed: true, gpu: true}
	a := newApp(t, f, &fakeOS{build: 26100}, &fakeUI{}, 1<<30)
	a.Cfg.HealthTimeout = 50 * time.Millisecond
	if err := a.Ensure(context.Background()); err == nil || !strings.Contains(err.Error(), "did not answer") {
		t.Fatal(err)
	}
	a.Cfg.HealthTimeout = time.Hour
	go func() { time.Sleep(30 * time.Millisecond); f.alive[len(f.alive)-1].Stop() }()
	a.alive = nil
	if err := a.Start(context.Background()); err == nil || !strings.Contains(err.Error(), "stopped while") {
		t.Fatal(err)
	}
}

func TestStopUninstallLogsVersion(t *testing.T) {
	f := &fakeWSL{version: "2.6.1.0", installed: true, gpu: true}
	o, u := &fakeOS{build: 26100}, &fakeUI{answer: false}
	a := newApp(t, f, o, u, 0)
	if err := a.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := a.Uninstall(context.Background()); !errors.Is(err, ErrDeclined) || !f.installed {
		t.Fatal("a no must keep the distribution", err)
	}
	u.answer = true
	if err := a.Uninstall(context.Background()); err != nil || f.installed {
		t.Fatal(err, f.calls)
	}
	select {
	case <-f.alive[0].Done():
	default:
		t.Fatal("the keep-alive must stop before unregister")
	}
	a.Logs()
	if len(o.consoles) != 1 || !strings.Contains(o.consoles[0], "journalctl --user --follow --unit ruach-studio --unit heresy-lab") {
		t.Fatal(o.consoles)
	}
	f.installed = true
	if v, err := a.InstalledVersion(context.Background()); err != nil || v != "2.0.6" {
		t.Fatal(v, err)
	}
}

func TestModelsDownloadedOnFirstStart(t *testing.T) {
	f := &fakeWSL{version: "2.6.1.0", installed: true, gpu: true, noModels: true}
	o, u := &fakeOS{build: 26100}, &fakeUI{answer: true}
	o.afterRun = func() { f.noModels = false }
	a := newApp(t, f, o, u, 0)
	if err := a.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(o.runs) != 1 || o.runs[0] != "--distribution RuachStudio --exec /usr/local/bin/ruach-fetch-models" {
		t.Fatal(o.runs)
	}
	// models here: no question, no download
	o.runs, u.asked = nil, nil
	if err := a.Ensure(context.Background()); err != nil || len(o.runs) != 0 || len(u.asked) != 0 {
		t.Fatal(err, o.runs, u.asked)
	}
	// a failed download stops before the start, and says it goes on next time
	f.noModels, o.afterRun, o.runCode = true, nil, 1
	if err := a.Ensure(context.Background()); err == nil || !strings.Contains(err.Error(), "goes on where it stopped") {
		t.Fatal(err)
	}
	u.answer = false
	if err := a.Ensure(context.Background()); !errors.Is(err, ErrDeclined) {
		t.Fatal(err)
	}
}

func TestNewerAndLatest(t *testing.T) {
	cases := []struct {
		tag, have string
		want      bool
	}{{"2.0.7", "2.0.6", true}, {"v2.1.0", "2.0.9", true}, {"2.0.6", "2.0.6-rc9", true}, {"2.0.6-rc9", "2.0.6", false},
		{"2.0.6", "2.0.6", false}, {"nightly", "2.0.6", false}, {"2.0.5", "2.0.6", false}}
	for _, c := range cases {
		if got := Newer(c.tag, c.have); got != c.want {
			t.Errorf("Newer(%s, %s) = %v", c.tag, c.have, got)
		}
	}
	a := &App{Get: func(ctx context.Context, url string) (int, []byte, error) {
		return 200, []byte(`[{"tag_name":"2.0.8-rc1","prerelease":true,"html_url":"p1"},{"tag_name":"2.0.7","html_url":"p2"},{"tag_name":"2.0.6","html_url":"p3"}]`), nil
	}}
	tag, page, err := a.LatestRelease(context.Background(), "igrbible/Ruach_Studio")
	if err != nil || tag != "2.0.7" || page != "p2" {
		t.Fatal(tag, page, err)
	}
}

func sha(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

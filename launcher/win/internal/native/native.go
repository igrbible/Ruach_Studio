// Package native is the launcher of the native Windows package (HERESY 2685: one zip, no WSL), free of Windows itself: it finds
// the Studio's folder beside the exe, brings the Studio's Python on the first start (launcher\install.ps1, in a console of its
// own), runs the lab and the engine as two services (each restarted when it ends, as the Linux units' Restart=always), waits for
// the engine and opens the page, keeps every line they print in logs\, and gathers a tester's report into one zip. Windows (the
// processes' job objects, Edge, Explorer, the console) comes in through Platform and Spawn, so all of it is tested on Linux.
package native

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"github.com/igrbible/ruach-launcher/internal/app"
)

// Layout is the Studio's folder as the Windows zip lays it out: the exe at its top beside RuachStudio.cmd.
type Layout struct {
	Root string
	Win  bool   // the Python of a Windows .venv (Scripts\python.exe), else bin/python
	Py   string // another Python instead of .venv's (the builder's self-test, which has no .venv)
}

func (l Layout) at(p ...string) string { return filepath.Join(append([]string{l.Root}, p...)...) }

func (l Layout) Python() string {
	if l.Py != "" {
		return l.Py
	}
	if l.Win {
		return l.at(".venv", "Scripts", "python.exe")
	}
	return l.at(".venv", "bin", "python")
}
func (l Layout) Lab() string     { return l.at("lab", "lab.py") }
func (l Layout) Start() string   { return l.at("launcher", "start.py") }
func (l Layout) Install() string { return l.at("launcher", "install.ps1") }
func (l Layout) Logs() string    { return l.at("logs") }

// InstallDone: the launcher's mark that install.ps1 ended whole, the models a song needs among it (HERESY 2928b): .venv alone is no install
func (l Layout) InstallDone() string { return l.at(".venv", "ruach-install-done") }

// InstalledFor is the version the last whole install was for, the mark's first line (HERESY 2933); "" with no mark. 2928b's mark held only
// a time: such a folder installs once more and is marked anew.
func (l Layout) InstalledFor() string {
	b, err := os.ReadFile(l.InstallDone())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.SplitN(string(b), "\n", 2)[0])
}

// versionWord says a mark's version, or «an earlier version» for none or 2928b's time
func versionWord(v string) string {
	if v == "" || strings.ContainsAny(v, "T:") {
		return "an earlier version"
	}
	return v
}

// Certifi: uv's Python on a fresh Windows trusts no root yet, so every Python of the Studio takes certifi's bundle (RuachStudio.cmd, 2649).
func (l Layout) Certifi() string {
	if l.Win {
		return l.at(".venv", "Lib", "site-packages", "certifi", "cacert.pem")
	}
	return ""
}

func isFile(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }

// Found: dir holds the native Studio (its lab and its engine's starter).
func Found(dir string) bool {
	l := Layout{Root: dir}
	return isFile(l.Lab()) && isFile(l.Start())
}

// Version is the Studio's VERSION, "" when it cannot be read.
func (l Layout) Version() string {
	b, err := os.ReadFile(l.at("VERSION"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// PathBudget: the deepest file of the install lies 166 characters below the Studio's folder (2685: 235 of Windows' 260 from a
// folder of 69), so a folder longer than this leaves .venv's deepest files past MAX_PATH and the install breaks halfway.
const PathBudget = 260 - 166

// PathLength counts the folder as Windows does, in UTF-16 units.
func PathLength(p string) int { return len(utf16.Encode([]rune(p))) }

// Spec is one service's process: its program, arguments, folder, the environment added to the launcher's, and where its output goes.
type Spec struct {
	Name string
	Exe  string
	Args []string
	Dir  string
	Env  []string
	// KeepChildren: what the process started outlives its own end (the lab's workers, as the lab's unit keeps them with
	// KillMode=process, 2367); otherwise its end takes them along (the engine under start.py). A Stop ends them either way.
	KeepChildren bool
}

// Proc is a running service: Stop ends it and everything it started (a job object on Windows, the process group elsewhere).
type Proc interface {
	Pid() int
	Done() <-chan struct{}
	ExitCode() int // valid once Done is closed
	Stop() error
}

// Platform is what only the system can do.
type Platform interface {
	Spawn(s Spec, out *Log) (Proc, error)                                     // the process hidden, its stdout and stderr into out
	RunInstall(l Layout, env []string) (int, error)                           // install.ps1 in a console of its own, waited for
	OpenApp(url string) error                                                 // the page in Edge's app window, else the default browser
	OpenURL(url string) error                                                 // a web page in the default browser
	OpenFolder(dir, selected string) error                                    // Explorer at dir, selected chosen when not ""
	Output(timeout time.Duration, exe string, args ...string) (string, error) // a small tool's output (nvidia-smi, python --version)
	Facts(root string) []Fact                                                 // Windows, the processor, the memory, the free disk
	ReportDir(l Layout) string                                                // where a tester finds the report: the Desktop
}

// Fact is one line of the report's summary.
type Fact struct{ Name, Value string }

type Config struct {
	Layout       Layout
	Version      string        // the launcher's own
	Port         int           // the engine's (and the page's), 7777
	LabPort      int           // the lab's, 41870 (the page calls it there: other ports are for tests)
	EngineWait   time.Duration // the engine's first model load: 8 minutes
	LabWait      time.Duration // the lab, once the engine answers: 2 minutes more at most
	HealthEvery  time.Duration
	RestartDelay time.Duration // 5 s, the units' RestartSec
	QuickExit    time.Duration // an end sooner than this after its start is a failed start
	QuickExits   int           // so many failed starts in a row and the service is given up, said with its log's last lines
	LogMax       int64         // a log longer than this goes to <name>.1.log
}

func (c Config) URL() string    { return fmt.Sprintf("http://127.0.0.1:%d/", c.Port) }
func (c Config) LabURL() string { return fmt.Sprintf("http://127.0.0.1:%d/", c.LabPort) }

// Defaults: the units' and RuachStudio.cmd's numbers.
func Defaults(l Layout, version string) Config {
	return Config{Layout: l, Version: version, Port: 7777, LabPort: 41870, EngineWait: 8 * time.Minute, LabWait: 2 * time.Minute,
		HealthEvery: 2 * time.Second, RestartDelay: 5 * time.Second, QuickExit: 30 * time.Second, QuickExits: 5, LogMax: 16 << 20}
}

// Studio is the native launcher's whole decision path.
type Studio struct {
	Cfg Config
	UI  app.UI
	P   Platform
	Get func(ctx context.Context, url string) (status int, body []byte, err error)
	Say func(format string, a ...any) // launcher.log

	once        sync.Once
	lab, engine *Service
}

func (s *Studio) say(format string, a ...any) {
	if s.Say != nil {
		s.Say(format, a...)
	}
}

func (s *Studio) services() (*Service, *Service) {
	s.once.Do(func() {
		l := s.Cfg.Layout
		env := []string{"PYTHONUTF8=1", "PYTHONUNBUFFERED=1", "RUACH_LAUNCHER=native"} // HERESY 2930: the lab's updater says the tray's way
		if c := l.Certifi(); c != "" && isFile(c) {
			env = append(env, "SSL_CERT_FILE="+c)
		}
		labEnv, engEnv := append([]string{}, env...), append([]string{}, env...)
		if s.Cfg.LabPort != 41870 {
			labEnv = append(labEnv, fmt.Sprintf("LAB_PORT=%d", s.Cfg.LabPort))
		}
		if s.Cfg.Port != 7777 {
			engEnv = append(engEnv, fmt.Sprintf("YUE2CPP_PORT=%d", s.Cfg.Port))
		}
		s.lab = s.newService(Spec{Name: "lab", Exe: l.Python(), Args: []string{l.Lab()}, Dir: l.Root, Env: labEnv, KeepChildren: true}, s.Cfg.LabURL()+"health")
		s.engine = s.newService(Spec{Name: "engine", Exe: l.Python(), Args: []string{l.Start()}, Dir: l.Root, Env: engEnv}, s.Cfg.URL()+"health")
	})
	return s.lab, s.engine
}

// Ensure brings the Studio up from whatever state it is in and returns when the engine answers.
func (s *Studio) Ensure(ctx context.Context) error {
	l := s.Cfg.Layout
	first := !isFile(l.Python())
	done, had := isFile(l.InstallDone()), l.InstalledFor()
	// HERESY 2928b: an install that stopped before its models goes on; 2933: a folder that holds a new version brings its packages first
	if first || (l.Win && l.Py == "" && (!done || had != l.Version())) {
		if n := PathLength(l.Root); first && l.Win && n > PathBudget {
			if !s.UI.Ask("A long folder", fmt.Sprintf("This folder's path is %d characters long:\n%s\n\nWindows stops at 260 characters, and the Studio's Python lies up to 166 below its folder, so its install may break halfway. Move the RuachStudio folder somewhere short, such as C:\\RuachStudio, and start it from there.\n\nInstall here all the same?", n, l.Root)) {
				return app.ErrDeclined
			}
		}
		if first {
			if !s.UI.Ask("Ruach Studio's first start", "The first start brings the Studio's own Python and packages into this folder (5 to 15 minutes), then the models a song needs. Nothing is installed for the whole computer.\n\nA console window shows each step and asks about the models. Go on?") {
				return app.ErrDeclined
			}
		} else if !done {
			if !s.UI.Ask("Ruach Studio's install", "The install stopped before its end: the models a song needs are not all here yet, and the Studio cannot sing without them.\n\nGo on with it now? A console window shows each step and asks about the models.") {
				return app.ErrDeclined
			}
		} else if !s.UI.Ask("Ruach Studio "+l.Version(), "This folder now holds Ruach Studio "+l.Version()+" (the last install was for "+versionWord(had)+"). Its packages and the models it needs are brought up to date first, in a console window: a minute or two, longer when something new comes down.\n\nGo on?") {
			return app.ErrDeclined
		}
		s.UI.Status("installing (a console window shows how far)")
		s.say("install: %s", l.Install())
		code, err := s.P.RunInstall(l, []string{"PYTHONUTF8=1", "PYTHONUNBUFFERED=1"})
		s.say("install: exit %d %v", code, err)
		if err == nil && code == 5 { // fetch_models.py: the models not downloaded, as asked
			return errors.New("the models a song needs were not downloaded, and the Studio cannot sing without them. Start Ruach Studio again when you want them: it goes on from there")
		}
		if err != nil || code != 0 {
			return fmt.Errorf("the install stopped (exit %d%s): its window said why. Start Ruach Studio again and it goes on where it stopped", code, errText(err))
		}
		if !isFile(l.Python()) {
			return errors.New("the install ended, but the Studio's Python is not in .venv: start Ruach Studio again")
		}
		if l.Win && l.Py == "" {
			_ = os.WriteFile(l.InstallDone(), []byte(l.Version()+"\n"+time.Now().Format(time.RFC3339)+"\n"), 0o644) // HERESY 2928b: ended whole; 2933: for this version
		}
	}
	return s.Start(ctx)
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return ", " + err.Error()
}

// Answers: the service's health says 200.
func (s *Studio) Answers(ctx context.Context, url string) bool { return s.answers(ctx, url) }

func (s *Studio) answers(ctx context.Context, url string) bool {
	code, _, err := s.Get(ctx, url)
	return err == nil && code == 200
}

// Start runs the lab and the engine (each one that does not answer already) and waits for the engine.
func (s *Studio) Start(ctx context.Context) error {
	lab, engine := s.services()
	for _, v := range []*Service{lab, engine} { // a failure while this start watches is said by its error, not in a box of its own
		v.waiting.Store(true)
		defer v.waiting.Store(false)
	}
	for _, v := range []*Service{lab, engine} {
		if v.Running() {
			continue
		}
		if s.answers(ctx, v.Health) {
			v.markExternal(true)
			s.say("%s already answers at %s: it runs outside this launcher (RuachStudio.cmd?), left as it is", v.Spec.Name, v.Health)
			continue
		}
		v.markExternal(false)
		v.Start()
	}
	s.UI.Status("starting the Studio (the first model load takes a minute or more)")
	if err := s.wait(ctx, engine, s.Cfg.EngineWait); err != nil {
		return err
	}
	if err := s.wait(ctx, lab, s.Cfg.LabWait); err != nil {
		s.UI.Status("the Studio runs, but its lab does not answer: the tray's Logs and Tester's report show why")
		s.UI.Error("Ruach Studio", "The page opens, but the Studio's lab does not answer (the library, the rooms' jobs and the settings live there). "+err.Error())
		return nil
	}
	s.UI.Status("running at " + s.Cfg.URL())
	return nil
}

func (s *Studio) wait(ctx context.Context, v *Service, limit time.Duration) error {
	deadline := time.Now().Add(limit)
	for {
		if s.answers(ctx, v.Health) {
			return nil
		}
		if v.GaveUp() {
			return fmt.Errorf("the %s ended %d times right after its start, and the launcher stopped trying. The last lines of logs\\%s.log:\n\n%s",
				v.Spec.Name, s.Cfg.QuickExits, v.Spec.Name, v.Out().Tail(8))
		}
		if !v.Running() && !v.External() {
			return fmt.Errorf("the %s is stopped", v.Spec.Name)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the %s did not answer at %s in %s. The last lines of logs\\%s.log:\n\n%s",
				v.Spec.Name, v.Health, limit, v.Spec.Name, v.Out().Tail(8))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(s.Cfg.HealthEvery):
		}
	}
}

// Stop ends both services and everything they started; the ones running outside the launcher are left.
func (s *Studio) Stop() {
	lab, engine := s.services()
	engine.Stop()
	lab.Stop()
	s.UI.Status("stopped (Open starts it again)")
}

// Restart: both ended, both started again, the engine waited for.
func (s *Studio) Restart(ctx context.Context) error {
	s.Stop()
	return s.Start(ctx)
}

// Open shows the page.
func (s *Studio) Open() error { return s.P.OpenApp(s.Cfg.URL()) }

// Services: the lab and the engine, for the status and the report.
func (s *Studio) Services() []*Service {
	lab, engine := s.services()
	return []*Service{lab, engine}
}

// Close lets the logs go (after Stop).
func (s *Studio) Close() {
	for _, v := range s.Services() {
		v.Out().Close()
	}
}

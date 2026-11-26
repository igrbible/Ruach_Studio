// RuachStudio.exe: the Windows launcher of Ruach Studio, the page (the PWA) staying the Studio's only face. One package, the native
// zip (HERESY 2685): the exe lies in the RuachStudio folder beside lab\ and launcher\. The first start installs (launcher\install.ps1
// in a console window), every start runs the lab and the engine hidden as two services (each started again when it ends,
// everything they start ended with them), waits for the engine and opens the page as an app window; their output goes to logs\,
// and the tray menu gives the logs, a tester's report in one .zip, a restart, stop and quit. Without that folder beside it the exe
// says so in words and ends. (The WSL package, frozen since 16.11.2026 and never in a release, went out: HERESY 2999.)
//
//	RuachStudio.exe              start, open; then the tray icon
//	RuachStudio.exe --status     what is installed and running
//	RuachStudio.exe --report     the tester's report on the Desktop (--report-dir another folder), its path printed
package main

import (
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"time"

	"github.com/igrbible/ruach-launcher/internal/app"
	"github.com/igrbible/ruach-launcher/internal/native"
	"github.com/igrbible/ruach-launcher/internal/tray"
	"github.com/igrbible/ruach-launcher/internal/winos"
)

//go:embed ruach.ico
var icon []byte

var version = "dev" // build.sh VERSION sets it: -ldflags "-X main.version=2.0.7"

const repo = "igrbible/Ruach_Studio"

func httpGet(ctx context.Context, url string) (int, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("User-Agent", "RuachStudio-launcher/"+version)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	return res.StatusCode, body, err
}

type opts struct {
	root, reportDir, python           string
	port, labPort                     int
	console, status, report, selftest bool
	noOpen, forceNative               bool
	restartDelay                      time.Duration
}

func main() {
	var o opts
	flag.IntVar(&o.port, "port", 7777, "the Studio's port")
	flag.BoolVar(&o.console, "console", runtime.GOOS != "windows", "no tray: print, and stop on Ctrl-C")
	flag.BoolVar(&o.status, "status", false, "say what is installed and running")
	flag.BoolVar(&o.forceNative, "native", false, "the native package, even when the folder does not look like one")
	flag.StringVar(&o.root, "root", "", "the Studio's folder (default: the launcher's own)")
	flag.BoolVar(&o.report, "report", false, "make the tester's report and print its path")
	flag.StringVar(&o.reportDir, "report-dir", "", "where the report goes (default: the Desktop)")
	flag.IntVar(&o.labPort, "lab-port", 41870, "the lab's port (the page calls 41870: another one is for tests)")
	flag.StringVar(&o.python, "python", "", "this Python instead of .venv's (the builder's self-test)")
	flag.BoolVar(&o.selftest, "selftest", false, "start the lab and the engine, wait for the lab, stop both, check they ended")
	flag.DurationVar(&o.restartDelay, "restart-delay", 0, "the pause before a service starts again (default 5s; tests)")
	flag.BoolVar(&o.noOpen, "no-open", false, "do not open the page (tests)")
	flag.Parse()

	exeDir := "."
	if exe, err := os.Executable(); err == nil {
		exeDir = filepath.Dir(exe)
	}
	root := o.root
	if root == "" {
		root = exeDir
	}
	if abs, err := filepath.Abs(root); err == nil {
		root = abs
	}
	if !o.forceNative && !native.Found(root) {
		msg := "Ruach Studio does not find its folder beside RuachStudio.exe (lab\\lab.py and launcher\\start.py).\n\nUnpack the whole zip first (right-click it, Extract All…), then start RuachStudio.exe inside the unpacked RuachStudio folder."
		if o.console {
			fmt.Fprintln(os.Stderr, msg)
		} else {
			newBoxUI().Error("Ruach Studio", msg)
		}
		os.Exit(1)
	}
	runNative(root, o)
}

// checkUpdates asks GitHub for the newest release and offers its page.
func checkUpdates(ctx context.Context, ui app.UI, have string, open func(string) error) {
	tag, page, err := app.LatestRelease(ctx, httpGet, repo)
	switch {
	case err != nil:
		ui.Error("Updates", "GitHub did not answer: "+err.Error())
	case app.Newer(tag, have):
		if ui.Ask("Ruach Studio "+tag, "Ruach Studio "+tag+" is out (this one is "+have+"). Open its page to download it?") {
			_ = open(page)
		}
	default:
		ui.Info("Updates", "Ruach Studio "+have+" is the newest.")
	}
}

func runNative(root string, o opts) {
	lay := native.Layout{Root: root, Win: runtime.GOOS == "windows", Py: o.python}
	lf := native.OpenLog(filepath.Join(lay.Logs(), "launcher.log"), 4<<20)
	log.SetOutput(lf)
	log.Printf("RuachStudio launcher %s · %s/%s · native · %s", version, runtime.GOOS, runtime.GOARCH, root)
	cfg := native.Defaults(lay, version)
	cfg.Port, cfg.LabPort = o.port, o.labPort
	if o.restartDelay > 0 {
		cfg.RestartDelay = o.restartDelay
	}
	var ui app.UI
	if o.console || o.status || o.report || o.selftest {
		ui = winos.ConsoleUI{}
	} else {
		ui = newBoxUI()
	}
	plat := winos.NativePlatform{}
	st := &native.Studio{Cfg: cfg, UI: logged{ui}, P: plat, Get: httpGet, Say: log.Printf}
	ctx := context.Background()

	switch {
	case o.status:
		fmt.Print(st.Summary(ctx))
		return
	case o.report:
		dir := o.reportDir
		if dir == "" {
			dir = plat.ReportDir(lay)
		}
		p, err := st.Report(ctx, dir)
		if err == nil {
			fmt.Println(p)
		}
		exit(err)
	case o.selftest:
		exit(selftest(ctx, st))
	}

	open := func() {
		if o.noOpen {
			fmt.Println("[no-open]", cfg.URL())
			return
		}
		_ = st.Open()
	}
	release, already := winos.SingleInstance("RuachStudioLauncher")
	if already { // one launcher holds the Studio; a second start only shows the page
		open()
		return
	}
	defer release()

	start := func() {
		err := st.Ensure(ctx)
		switch {
		case err == nil:
			open()
		case errors.Is(err, app.ErrDeclined):
		default:
			ui.Error("Ruach Studio", err.Error())
		}
		if err != nil && o.console {
			st.Stop()
			exit(err)
		}
	}
	if o.console {
		start()
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt)
		fmt.Println("Ruach Studio is up at", cfg.URL(), "· Ctrl-C ends it")
		<-sig
		st.Stop()
		st.Close()
		return
	}
	tray.Run(tray.Menu{
		Icon:  icon,
		Ready: start,
		Open: func() {
			if err := st.Start(ctx); err != nil {
				ui.Error("Ruach Studio", err.Error())
				return
			}
			open()
		},
		Logs:    func() { _ = plat.OpenFolder(lay.Logs(), "") },
		LogsTip: "the logs folder: launcher.log, lab.log and engine.log",
		Report: func() {
			if !ui.Ask("Tester's report", native.ReportNotice+"\n\nMake it now?") {
				return
			}
			p, err := st.Report(ctx, plat.ReportDir(lay))
			if err != nil {
				ui.Error("Tester's report", "The report was not made: "+err.Error())
				return
			}
			_ = plat.OpenFolder(filepath.Dir(p), p)
			ui.Info("Tester's report", "Saved:\n"+p+"\n\nSend this file to whoever asked you to test the Studio, or attach it to an issue at github.com/"+repo+"/issues.")
		},
		Update: func() { checkUpdates(ctx, ui, lay.Version(), plat.OpenURL) },
		Restart: func() {
			if err := st.Restart(ctx); err != nil {
				ui.Error("Ruach Studio", err.Error())
			}
		},
		Stop: func() { st.Stop() },
		Quit: func() {
			st.Stop()
			st.Close()
		},
	})
}

// selftest is the services' Windows half without a model or a card, for the builder's check of the package: the lab and the
// engine started under the launcher, the lab's health waited for (90 s), the engine given 20 s (without models start.py says what
// is missing and ends, and is started again), both stopped, and the lab's port must then be free and the engine's log not empty.
func selftest(ctx context.Context, st *native.Studio) error {
	vs := st.Services()
	lab, engine := vs[0], vs[1]
	for _, v := range vs {
		if st.Answers(ctx, v.Health) {
			return fmt.Errorf("the %s already answers at %s: the self-test needs both ports free", v.Spec.Name, v.Health)
		}
		v.Start()
	}
	labUp := false
	for t := time.Now(); time.Since(t) < 90*time.Second; time.Sleep(time.Second) {
		if labUp = st.Answers(ctx, lab.Health); labUp {
			break
		}
	}
	for t := time.Now(); time.Since(t) < 20*time.Second && !engine.GaveUp() && !st.Answers(ctx, engine.Health); {
		time.Sleep(time.Second)
	}
	fmt.Printf("lab      %s · answered: %v\n%s\n", lab.State(), labUp, lab.Out().Tail(6))
	fmt.Printf("engine   %s · started %d times more\n%s\n", engine.State(), engine.Restarts(), engine.Out().Tail(6))
	st.Stop()
	time.Sleep(2 * time.Second)
	labLeft := st.Answers(ctx, lab.Health)
	st.Close()
	st.Say("self-test: lab answered %v, left after the stop %v", labUp, labLeft)
	info, err := os.Stat(engine.Out().Path())
	switch {
	case !labUp:
		return errors.New("self-test: the lab did not answer in 90 s")
	case labLeft:
		return errors.New("self-test: the lab still answers after the stop: its process outlived the launcher's job")
	case err != nil || info.Size() == 0:
		return errors.New("self-test: the engine's log is empty: its output did not reach logs\\engine.log")
	}
	fmt.Println("self-test: passed (the lab answered, the engine's lines reached its log, both ended at the stop)")
	return nil
}

// logged writes every status, notice and question into launcher.log as well.
type logged struct{ app.UI }

func (l logged) Status(m string)   { log.Print("status: ", m); l.UI.Status(m) }
func (l logged) Info(t, m string)  { log.Printf("info: %s: %s", t, m); l.UI.Info(t, m) }
func (l logged) Error(t, m string) { log.Printf("error: %s: %s", t, m); l.UI.Error(t, m) }
func (l logged) Ask(t, m string) bool {
	ok := l.UI.Ask(t, m)
	log.Printf("ask: %s → %v", t, ok)
	return ok
}

func exit(err error) {
	if err != nil && !errors.Is(err, app.ErrDeclined) {
		fmt.Fprintln(os.Stderr, err)
		log.Print(err)
		os.Exit(1)
	}
	os.Exit(0)
}

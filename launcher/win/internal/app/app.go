// Package app is the launcher's whole decision path, free of Windows: is Windows new enough, is WSL there and new
// enough, is our distribution installed, then the keep-alive, the wait for the Studio's health and the page opened as
// an app. Windows itself (UAC, Edge, message boxes, the tray) comes in through Platform and UI.
package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/igrbible/ruach-launcher/internal/wsl"
)

// UI is how the launcher speaks: a status line (the tray's tooltip), a notice, a yes/no question, an error.
type UI interface {
	Status(msg string)
	Info(title, msg string)
	Ask(title, msg string) bool
	Error(title, msg string)
}

// Platform is what only Windows can do.
type Platform interface {
	WindowsBuild() int                                   // 22631 for Windows 11 23H2; 0 when unknown
	RunElevated(exe string, args ...string) (int, error) // through UAC, waiting for the exit code
	OpenApp(url string) error                            // Edge --app=url, else the default browser
	OpenConsole(args ...string) error                    // a console window running wsl.exe args (the logs)
	RunConsole(args ...string) (int, error)              // the same, waited for: its exit code (the models' download)
	ScheduleResume() error                               // start the launcher once after the next sign-in (RunOnce)
}

type Config struct {
	Distro        string        // RuachStudio
	Port          int           // the Studio's port, 7777
	Root          string        // where the Studio lies inside the distribution, /opt/ruach-studio
	WSLFile       string        // the .wsl beside the launcher, "" when there is none
	Location      string        // where the distribution's disk goes: %LOCALAPPDATA%\RuachStudio\wsl
	MinBuild      int           // 19044: Windows 10 21H2, the oldest NVIDIA's CUDA on WSL names
	HealthTimeout time.Duration // the first start of a fresh install takes longest
	HealthEvery   time.Duration
}

type App struct {
	Cfg Config
	WSL *wsl.Client
	UI  UI
	OS  Platform
	Get func(ctx context.Context, url string) (status int, body []byte, err error)

	mu    sync.Mutex
	alive wsl.Process
	noGPU bool
}

var (
	ErrRestart  = errors.New("Windows must restart to finish installing WSL; Ruach Studio starts again by itself after the sign-in")
	ErrDeclined = errors.New("declined")
)

func (a *App) URL() string { return fmt.Sprintf("http://localhost:%d/", a.Cfg.Port) }

// Ensure brings everything up and returns when the Studio answers its health.
func (a *App) Ensure(ctx context.Context) error {
	if b := a.OS.WindowsBuild(); b > 0 && b < a.Cfg.MinBuild {
		return fmt.Errorf("this Windows (build %d) is too old: Ruach Studio needs Windows 11, or Windows 10 21H2 (build %d) and newer", b, a.Cfg.MinBuild)
	}
	a.UI.Status("checking WSL")
	v, st, err := a.WSL.Version(ctx)
	if err != nil {
		return err
	}
	switch st {
	case wsl.Missing:
		if !a.UI.Ask("Ruach Studio needs WSL", "Ruach Studio runs inside WSL, Windows' own Linux, which is not on this computer yet.\n\nInstall it now? Windows asks for administrator rights, and a restart follows.") {
			return ErrDeclined
		}
		if code, err := a.OS.RunElevated("wsl.exe", "--install", "--no-distribution"); err != nil || code != 0 {
			return fmt.Errorf("WSL did not install (exit %d, %v): run «wsl --install --no-distribution» in an administrator terminal to see why", code, err)
		}
		_ = a.OS.ScheduleResume()
		a.UI.Info("Restart Windows", "WSL is installed. Restart Windows: Ruach Studio goes on by itself after you sign in.")
		return ErrRestart
	case wsl.Inbox:
		if !a.UI.Ask("WSL needs an update", "This computer has an old WSL. Update it now? Windows asks for administrator rights.") {
			return ErrDeclined
		}
		if code, err := a.OS.RunElevated("wsl.exe", "--update"); err != nil || code != 0 {
			return fmt.Errorf("WSL did not update (exit %d, %v): run «wsl --update» to see why", code, err)
		}
		if v, st, _ = a.WSL.Version(ctx); st != wsl.Ready {
			return errors.New("WSL still does not report its version after the update: restart Windows and start Ruach Studio again")
		}
	}
	installed, err := a.WSL.Installed(ctx)
	if err != nil {
		return err
	}
	if !installed {
		if a.Cfg.WSLFile == "" {
			return errors.New("the Studio's system file (RuachStudio-<version>.wsl) is not beside this launcher: download both into one folder")
		}
		a.UI.Status("checking " + a.Cfg.WSLFile)
		if err := VerifySHA256(a.Cfg.WSLFile); err != nil {
			return err
		}
		a.UI.Status("installing the Studio's Linux (a few minutes)")
		if err := a.WSL.Install(ctx, v, a.Cfg.WSLFile, a.Cfg.Location); err != nil {
			return err
		}
	}
	if err := a.ensureModels(ctx); err != nil {
		return err
	}
	return a.Start(ctx)
}

// ensureModels: the .wsl brings no weights. Without them start.sh stops at once and systemd starts it again every
// five seconds, so the health would never come: the first start downloads them, in a console that shows each size
// (ruach-fetch-models: fetch-models.sh with the backbone's quant by the card's memory, as launcher/install.sh does).
func (a *App) ensureModels(ctx context.Context) error {
	// HERESY 2330: every weight in models/<room>/ (lab/paths.py): a backbone under engine/yue2/ or a merge's folder, the decoder in engine/vae/;
	// a Studio of 2.0.6 not started since its update keeps them in models/ itself until its first start moves them
	m := a.Cfg.Root + "/models"
	r, err := a.WSL.Exec(ctx, "", "/bin/sh", "-c", "ls "+m+"/engine/yue2/YuE2-3B-*.gguf "+m+"/engine/finetunes/*/YuE2-3B-*.gguf 2>/dev/null | grep -q . && test -s "+m+"/engine/vae/YuE2-Vae-F32.gguf"+
		" || { ls "+m+"/YuE2-3B-*.gguf >/dev/null 2>&1 && test -s "+m+"/YuE2-Vae-F32.gguf; }")
	if err != nil {
		return err
	}
	if r.Code == 0 {
		return nil
	}
	if !a.UI.Ask("Ruach Studio needs its models", "The Studio's models are not here yet. A console window names each file with its size, the total and the free disk, then asks: a song needs 3 to 8 GB by your card's memory; Whisper, the LoRAs and the rest come later, from Engine -> Models, when you want them.\n\nOpen it now? An interrupted download goes on where it stopped.") {
		return ErrDeclined
	}
	a.UI.Status("downloading the models (a console window shows how far)")
	code, err := a.OS.RunConsole("--distribution", a.Cfg.Distro, "--exec", "/usr/local/bin/ruach-fetch-models")
	if err == nil && code == 5 { // fetch-models.sh: the plan was declined in the console (08.11.2026)
		return ErrDeclined
	}
	if err != nil || code != 0 {
		return fmt.Errorf("the models did not all download (exit %d, %v): start Ruach Studio again and the download goes on where it stopped", code, err)
	}
	return nil
}

// Start holds the distribution up (its systemd starts the Studio's two services) and waits for the Studio.
func (a *App) Start(ctx context.Context) error {
	a.mu.Lock()
	if a.alive != nil {
		select {
		case <-a.alive.Done():
			a.alive = nil // it ended (the distribution was terminated from outside): start another
		default:
		}
	}
	if a.alive == nil {
		p, err := a.WSL.KeepAlive()
		if err != nil {
			a.mu.Unlock()
			return fmt.Errorf("the Studio's Linux did not start: %w", err)
		}
		a.alive = p
	}
	alive := a.alive
	a.mu.Unlock()
	a.UI.Status("starting the Studio")
	// the card comes from the Windows driver, mapped into WSL at /usr/lib/wsl/lib: no Linux driver inside, ever
	if r, err := a.WSL.Exec(ctx, "", "/usr/lib/wsl/lib/nvidia-smi", "-L"); err != nil || r.Code != 0 || !strings.Contains(r.Stdout, "GPU") {
		a.noGPU = true
		a.UI.Status("no NVIDIA card is visible in WSL: the Studio runs on the processor (slow); a current NVIDIA driver for Windows brings the card in")
	}
	return a.waitHealthy(ctx, alive)
}

func (a *App) waitHealthy(ctx context.Context, alive wsl.Process) error {
	deadline := time.Now().Add(a.Cfg.HealthTimeout)
	for {
		if code, _, err := a.Get(ctx, a.URL()+"health"); err == nil && code == 200 {
			a.UI.Status("Ruach Studio is running at " + a.URL())
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the Studio did not answer at %s in %s: the tray menu's Logs show why", a.URL(), a.Cfg.HealthTimeout)
		}
		select {
		case <-alive.Done():
			return errors.New("the Studio's Linux stopped while it was starting: the tray menu's Logs show why")
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(a.Cfg.HealthEvery):
		}
	}
}

// NoGPU: the last start saw no NVIDIA card inside WSL.
func (a *App) NoGPU() bool { return a.noGPU }

// Open shows the page as an app window.
func (a *App) Open() error { return a.OS.OpenApp(a.URL()) }

// Release lets the distribution go without stopping it: WSL stops it once it is idle ([general] instanceIdleTimeout).
func (a *App) Release() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.alive == nil {
		return nil
	}
	err := a.alive.Stop()
	a.alive = nil
	return err
}

// Stop lets the distribution go and stops it now (its services end cleanly: systemd's shutdown).
func (a *App) Stop(ctx context.Context) error {
	a.mu.Lock()
	if a.alive != nil {
		_ = a.alive.Stop()
		a.alive = nil
	}
	a.mu.Unlock()
	return a.WSL.Terminate(ctx)
}

// Uninstall deletes the distribution with everything inside it, after a question that says so.
func (a *App) Uninstall(ctx context.Context) error {
	if !a.UI.Ask("Uninstall Ruach Studio", "This deletes the Studio's Linux and EVERYTHING inside it: the models and your songs.\n\nCopy your songs out first (\\\\wsl.localhost\\"+a.Cfg.Distro+a.winPath(a.Cfg.Root+"/outputs")+").\n\nDelete it now?") {
		return ErrDeclined
	}
	_ = a.Stop(ctx)
	return a.WSL.Unregister(ctx)
}

func (a *App) winPath(p string) string { return strings.ReplaceAll(p, "/", `\`) }

// Logs opens a console that follows the two services' journals.
func (a *App) Logs() error {
	return a.OS.OpenConsole("--distribution", a.Cfg.Distro, "--exec", "journalctl", "--user", "--follow", "--unit", "ruach-studio", "--unit", "heresy-lab")
}

// InstalledVersion is the Studio's VERSION inside the distribution.
func (a *App) InstalledVersion(ctx context.Context) (string, error) {
	r, err := a.WSL.Exec(ctx, "", "/bin/cat", a.Cfg.Root+"/VERSION")
	if err != nil {
		return "", err
	}
	if r.Code != 0 {
		return "", fmt.Errorf("no VERSION in %s", a.Cfg.Root)
	}
	return strings.TrimSpace(r.Stdout), nil
}

// releaseTag: the tags the Studio's own updater takes, X.Y.Z and X.Y.Z-rcN (lab/updates.py)
var releaseTag = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$`)

// tagKey orders release tags: 2.0.6 > 2.0.6-rc9 > 2.0.5; ok is false for any other tag.
func tagKey(tag string) (k [4]int, ok bool) {
	m := releaseTag.FindStringSubmatch(strings.TrimSpace(tag))
	if m == nil {
		return k, false
	}
	for i := 0; i < 3; i++ {
		fmt.Sscan(m[i+1], &k[i])
	}
	k[3] = 1 << 30 // a final outranks its candidates
	if m[4] != "" {
		fmt.Sscan(m[4], &k[3])
	}
	return k, true
}

// Newer: is tag a later release than have?
func Newer(tag, have string) bool {
	a, ok1 := tagKey(tag)
	b, ok2 := tagKey(have)
	if !ok1 || !ok2 {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

// LatestRelease reads GitHub's releases of repo and returns the newest final tag and its page.
func (a *App) LatestRelease(ctx context.Context, repo string) (tag, page string, err error) {
	code, body, err := a.Get(ctx, "https://api.github.com/repos/"+repo+"/releases?per_page=20")
	if err != nil {
		return "", "", err
	}
	if code != 200 {
		return "", "", fmt.Errorf("GitHub answered %d", code)
	}
	var rels []struct {
		Tag        string `json:"tag_name"`
		URL        string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.Unmarshal(body, &rels); err != nil {
		return "", "", err
	}
	for _, r := range rels {
		if r.Draft || r.Prerelease {
			continue
		}
		if _, ok := tagKey(r.Tag); ok && (tag == "" || Newer(r.Tag, tag)) {
			tag, page = r.Tag, r.URL
		}
	}
	if tag == "" {
		return "", "", errors.New("no release found")
	}
	return tag, page, nil
}

// VerifySHA256 checks file against file.sha256 beside it («<hex>  <name>», as sha256sum writes it) when that is there.
func VerifySHA256(file string) error {
	want, err := os.ReadFile(file + ".sha256")
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	f := strings.Fields(string(want))
	if len(f) == 0 || len(f[0]) != 64 {
		return fmt.Errorf("%s.sha256 holds no sha256", file)
	}
	h := sha256.New()
	in, err := os.Open(file)
	if err != nil {
		return err
	}
	defer in.Close()
	if _, err := io.Copy(h, in); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); !strings.EqualFold(got, f[0]) {
		return fmt.Errorf("%s is damaged (sha256 %s, expected %s): download it again", file, got[:12], f[0][:12])
	}
	return nil
}

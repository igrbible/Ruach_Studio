package wsl

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"unicode/utf16"
)

func u16(s string, bom bool) []byte {
	var b []byte
	if bom {
		b = append(b, 0xFF, 0xFE)
	}
	for _, r := range utf16.Encode([]rune(s)) {
		b = append(b, byte(r), byte(r>>8))
	}
	return b
}

func TestDecode(t *testing.T) {
	for _, s := range []string{"WSL version: 2.6.1.0\r\nKernel version: 6.6.87.2-1\r\n", "Версия WSL: 2.4.13.0\r\n", "RuachStudio\r\nUbuntu-24.04\r\n"} {
		if got := Decode(u16(s, false)); got != s {
			t.Errorf("utf16 no BOM: %q", got)
		}
		if got := Decode(u16(s, true)); got != s {
			t.Errorf("utf16 BOM: %q", got)
		}
		if got := Decode([]byte(s)); got != s {
			t.Errorf("utf8: %q", got)
		}
	}
}

func TestParseVersion(t *testing.T) {
	v, ok := ParseVersion("Версия WSL: 2.4.13.0")
	if !ok || v != (Version{2, 4, 13, 0}) {
		t.Fatal(v, ok)
	}
	if !v.Less(Version{2, 6, 1, 0}) || (Version{2, 4, 4, 0}).Less(Version{2, 4, 4, 0}) || MinFromFile.Less(Version{2, 4, 3, 9}) {
		t.Fatal("Less")
	}
	if _, ok := ParseVersion("no version here"); ok {
		t.Fatal("found a version in nothing")
	}
}

// fake is wsl.exe as a table: the joined arguments → the answer; every call is recorded.
type fake struct {
	answers map[string]Result
	missing bool
	calls   []string
}

func (f *fake) Run(_ context.Context, args ...string) (Result, error) {
	k := strings.Join(args, " ")
	f.calls = append(f.calls, k)
	if f.missing {
		return Result{}, ErrNotStarted
	}
	if r, ok := f.answers[k]; ok {
		return r, nil
	}
	return Result{Code: 1, Stderr: "fake: no answer for " + k}, nil
}

type proc struct{ done chan struct{} }

func (p *proc) Stop() error           { close(p.done); return nil }
func (p *proc) Done() <-chan struct{} { return p.done }

func (f *fake) Start(args ...string) (Process, error) {
	f.calls = append(f.calls, "START "+strings.Join(args, " "))
	return &proc{done: make(chan struct{})}, nil
}

func TestVersionStates(t *testing.T) {
	ctx := context.Background()
	c := &Client{R: &fake{answers: map[string]Result{"--version": {Stdout: "WSL version: 2.6.1.0\nKernel version: 6.6.87.2-1\nWindows version: 10.0.26100.4652\n"}}}, Name: "RuachStudio"}
	if v, st, _ := c.Version(ctx); st != Ready || v != (Version{2, 6, 1, 0}) {
		t.Fatal(v, st)
	}
	c.R = &fake{answers: map[string]Result{"--version": {Code: 1, Stdout: "The Windows Subsystem for Linux is not installed. You can install by running 'wsl.exe --install'.\nFor more information please visit https://aka.ms/wslinstall\n"}}}
	if _, st, _ := c.Version(ctx); st != Missing {
		t.Fatal("stub not seen as Missing", st)
	}
	usage := "Invalid command line option: --version\n" + strings.Repeat("    --list, -l [Options]\n", 30) + "    --install\n"
	c.R = &fake{answers: map[string]Result{"--version": {Code: -1, Stdout: usage}}}
	if _, st, _ := c.Version(ctx); st != Inbox {
		t.Fatal("old usage not seen as Inbox", st)
	}
	c.R = &fake{missing: true}
	if _, st, _ := c.Version(ctx); st != Missing {
		t.Fatal("no wsl.exe not seen as Missing", st)
	}
}

func TestDistrosAndInstalled(t *testing.T) {
	ctx := context.Background()
	f := &fake{answers: map[string]Result{"--list --quiet": {Stdout: "Ubuntu-24.04\r\nruachstudio\r\n\r\n"}}}
	c := &Client{R: f, Name: "RuachStudio"}
	ds, _ := c.Distros(ctx)
	if !reflect.DeepEqual(ds, []string{"Ubuntu-24.04", "ruachstudio"}) {
		t.Fatal(ds)
	}
	if ok, _ := c.Installed(ctx); !ok {
		t.Fatal("case-insensitive match failed")
	}
	f.answers["--list --quiet"] = Result{Code: -1, Stdout: "Windows Subsystem for Linux has no installed distributions.\n"}
	if ds, err := c.Distros(ctx); err != nil || len(ds) != 0 {
		t.Fatal("no distributions is an empty list", ds, err)
	}
}

func TestInstallArgs(t *testing.T) {
	c := &Client{Name: "RuachStudio"}
	got := c.InstallArgs(Version{2, 6, 1, 0}, `C:\RS\RuachStudio-2.0.6.wsl`, `C:\Users\v\AppData\Local\RuachStudio\wsl`)
	want := []string{"--install", "--from-file", `C:\RS\RuachStudio-2.0.6.wsl`, "--name", "RuachStudio", "--location", `C:\Users\v\AppData\Local\RuachStudio\wsl`, "--no-launch"}
	if !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	got = c.InstallArgs(Version{2, 3, 26, 0}, "f.wsl", "loc")
	if !reflect.DeepEqual(got, []string{"--import", "RuachStudio", "loc", "f.wsl", "--version", "2"}) {
		t.Fatal(got)
	}
}

func TestExecAndKeepAlive(t *testing.T) {
	f := &fake{answers: map[string]Result{}}
	c := &Client{R: f, Name: "RuachStudio"}
	c.Exec(context.Background(), "root", "systemctl", "is-system-running")
	p, _ := c.KeepAlive()
	p.Stop()
	want := []string{"--distribution RuachStudio --user root --exec systemctl is-system-running", "START --distribution RuachStudio --exec /bin/sleep infinity"}
	if !reflect.DeepEqual(f.calls, want) {
		t.Fatal(f.calls)
	}
}

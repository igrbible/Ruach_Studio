// Package wsl speaks to wsl.exe: its version, the distributions it holds, installing ours from a .wsl file,
// commands inside it and the process that keeps it alive. Everything goes through a Runner, so the logic is
// tested on Linux with a fake wsl.exe and only the Runner itself is Windows code.
package wsl

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

// Result is what one wsl.exe call left: its output decoded, its exit code.
type Result struct {
	Stdout, Stderr string
	Code           int
}

// Runner runs wsl.exe. Run returns an error only when wsl.exe could not be started at all (not found, not allowed);
// a non-zero exit code is a Result. Start begins a long-lived wsl.exe (the keep-alive) and returns at once.
type Runner interface {
	Run(ctx context.Context, args ...string) (Result, error)
	Start(args ...string) (Process, error)
}

// Process is a wsl.exe that keeps running until stopped.
type Process interface {
	Stop() error
	Done() <-chan struct{}
}

// ErrNotStarted: wsl.exe is not on this machine, or Windows would not start it.
var ErrNotStarted = errors.New("wsl.exe could not be started")

// Decode turns wsl.exe's bytes into a string. wsl.exe writes its own messages in UTF-16LE (with or without a BOM)
// unless WSL_UTF8=1 is set, and the output of a Linux command run through it is that command's own bytes (UTF-8).
// UTF-8 text never holds a NUL byte and UTF-16 text of any language does (ASCII spaces, digits, line ends), so a NUL
// anywhere means UTF-16LE.
func Decode(b []byte) string {
	if len(b) >= 2 && b[0] == 0xFF && b[1] == 0xFE {
		return utf16le(b[2:])
	}
	if bytes.IndexByte(b, 0) >= 0 {
		return utf16le(b)
	}
	return string(bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF}))
}

func utf16le(b []byte) string {
	if len(b)%2 == 1 {
		b = b[:len(b)-1]
	}
	u := make([]uint16, len(b)/2)
	for i := range u {
		u[i] = uint16(b[2*i]) | uint16(b[2*i+1])<<8
	}
	return string(utf16.Decode(u))
}

// Version is a dotted version, a.b.c.d (missing parts are 0).
type Version [4]int

var versionRe = regexp.MustCompile(`\d+\.\d+\.\d+(?:\.\d+)?`)

// ParseVersion takes the first dotted version found in s.
func ParseVersion(s string) (Version, bool) {
	m := versionRe.FindString(s)
	if m == "" {
		return Version{}, false
	}
	var v Version
	for i, p := range strings.Split(m, ".") {
		v[i], _ = strconv.Atoi(p)
	}
	return v, true
}

func (v Version) Less(o Version) bool {
	for i := range v {
		if v[i] != o[i] {
			return v[i] < o[i]
		}
	}
	return false
}

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d.%d", v[0], v[1], v[2], v[3]) }

// MinFromFile is the first WSL that installs a .wsl file (wsl --install --from-file): learn.microsoft.com,
// «Build a Custom Linux Distro for WSL». Older ones take the same tar through wsl --import.
var MinFromFile = Version{2, 4, 4, 0}

// State of WSL on this machine.
type State int

const (
	Missing State = iota // no wsl.exe, or the stub that says WSL is not installed
	Inbox                // an old WSL without --version (the Windows component): wsl --update brings the current one
	Ready                // a WSL that reports its version
)

// Client is wsl.exe for one distribution.
type Client struct {
	R    Runner
	Name string // the distribution's name, e.g. RuachStudio
}

// Version reads `wsl --version`. Its first line is WSL's own version, in the user's language
// («WSL version: 2.6.1.0», «Версия WSL: 2.6.1.0»); the lines after it are the kernel's, WSLg's, Windows'.
func (c *Client) Version(ctx context.Context) (Version, State, error) {
	r, err := c.R.Run(ctx, "--version")
	if err != nil {
		return Version{}, Missing, nil
	}
	first := strings.TrimSpace(strings.SplitN(strings.TrimSpace(r.Stdout), "\n", 2)[0])
	if r.Code == 0 {
		if v, ok := ParseVersion(first); ok {
			return v, Ready, nil
		}
	}
	all := strings.TrimSpace(r.Stdout + "\n" + r.Stderr)
	// an old inbox wsl.exe answers --version with «invalid option» and its whole usage, dozens of lines; the stub of a
	// Windows without WSL says in a line or two that WSL is not installed and names «wsl.exe --install», in any language
	if strings.Count(all, "\n") < 10 && strings.Contains(all, "--install") {
		return Version{}, Missing, nil
	}
	return Version{}, Inbox, nil
}

// Distros lists the installed distributions (`wsl --list --quiet`). With none, wsl.exe says so and exits non-zero:
// that is an empty list, not a failure.
func (c *Client) Distros(ctx context.Context) ([]string, error) {
	r, err := c.R.Run(ctx, "--list", "--quiet")
	if err != nil {
		return nil, err
	}
	if r.Code != 0 {
		return nil, nil
	}
	var out []string
	for _, l := range strings.Split(r.Stdout, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out, nil
}

// Installed: is our distribution registered? Names compare without case, as WSL compares them.
func (c *Client) Installed(ctx context.Context) (bool, error) {
	ds, err := c.Distros(ctx)
	if err != nil {
		return false, err
	}
	for _, d := range ds {
		if strings.EqualFold(d, c.Name) {
			return true, nil
		}
	}
	return false, nil
}

// InstallArgs: a WSL that knows .wsl files installs it under our name into our folder without launching it (no OOBE);
// an older WSL imports the same tar (a .wsl is a tar.gz) as a WSL 2 distribution.
func (c *Client) InstallArgs(v Version, file, location string) []string {
	if !v.Less(MinFromFile) {
		return []string{"--install", "--from-file", file, "--name", c.Name, "--location", location, "--no-launch"}
	}
	return []string{"--import", c.Name, location, file, "--version", "2"}
}

func (c *Client) Install(ctx context.Context, v Version, file, location string) error {
	r, err := c.R.Run(ctx, c.InstallArgs(v, file, location)...)
	if err != nil {
		return err
	}
	if r.Code != 0 {
		return fmt.Errorf("wsl %s failed (exit %d): %s", c.InstallArgs(v, file, location)[0], r.Code, oneLine(r.Stdout+" "+r.Stderr))
	}
	return nil
}

// Exec runs a command inside the distribution, as user ("" for its default user), without a shell in between.
func (c *Client) Exec(ctx context.Context, user string, cmd ...string) (Result, error) {
	return c.R.Run(ctx, c.execArgs(user, cmd)...)
}

func (c *Client) execArgs(user string, cmd []string) []string {
	a := []string{"--distribution", c.Name}
	if user != "" {
		a = append(a, "--user", user)
	}
	return append(append(a, "--exec"), cmd...)
}

// KeepAlive starts the process that holds the distribution up. WSL stops an idle distribution some seconds after its
// last wsl.exe client ends ([general] instanceIdleTimeout, 15 000 ms), and systemd's services do not count as clients
// (learn.microsoft.com wsl-config; microsoft/WSL#8854). Holding one client open while the Studio is in use keeps it,
// without touching the user's .wslconfig, which every other distribution shares.
func (c *Client) KeepAlive() (Process, error) {
	return c.R.Start(c.execArgs("", []string{"/bin/sleep", "infinity"})...)
}

func (c *Client) Terminate(ctx context.Context) error {
	return c.simple(ctx, "--terminate", c.Name)
}

// Unregister deletes the distribution and everything inside it (the models, the songs): callers ask first.
func (c *Client) Unregister(ctx context.Context) error {
	return c.simple(ctx, "--unregister", c.Name)
}

func (c *Client) simple(ctx context.Context, args ...string) error {
	r, err := c.R.Run(ctx, args...)
	if err != nil {
		return err
	}
	if r.Code != 0 {
		return fmt.Errorf("wsl %s failed (exit %d): %s", args[0], r.Code, oneLine(r.Stdout+" "+r.Stderr))
	}
	return nil
}

func oneLine(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}

//go:build !windows

package winos

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"syscall"

	"github.com/igrbible/ruach-launcher/internal/native"
)

// Off Windows the native launcher runs in console mode for its tests: a service is a process group, the rest is printed.

type treeKill struct {
	mu       sync.Mutex
	pgid     int
	released bool
}

func startTree(c *exec.Cmd) (*treeKill, error) {
	c.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := c.Start(); err != nil {
		return nil, err
	}
	return &treeKill{pgid: c.Process.Pid}, nil
}

// kill signals the whole group (its leader gone or not: a group's id is not given to another process while any member lives).
func (t *treeKill) kill(hard, _ bool) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.released {
		return nil
	}
	sig := syscall.SIGTERM
	if hard {
		sig = syscall.SIGKILL
	}
	if err := syscall.Kill(-t.pgid, sig); err != nil && !errors.Is(err, syscall.ESRCH) {
		return err
	}
	return nil
}

func (t *treeKill) release() { t.mu.Lock(); t.released = true; t.mu.Unlock() }

func tool(exe string) string { return exe }

// RunInstall runs what RUACH_INSTALL_EXE names with the Studio's folder (a test's stand-in for install.ps1).
func (NativePlatform) RunInstall(l native.Layout, env []string) (int, error) {
	exe := os.Getenv("RUACH_INSTALL_EXE")
	fmt.Println("[install]", l.Install())
	if exe == "" {
		return -1, errors.New("the native install is Windows' own (launcher\\install.ps1); RUACH_INSTALL_EXE names a stand-in")
	}
	c := exec.Command(exe, l.Root)
	c.Dir, c.Env, c.Stdout, c.Stderr = l.Root, append(os.Environ(), env...), os.Stdout, os.Stderr
	err := c.Run()
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode(), nil
	}
	if err != nil {
		return -1, err
	}
	return 0, nil
}

func (NativePlatform) OpenURL(url string) error { fmt.Println("[open url]", url); return nil }

func (NativePlatform) OpenFolder(dir, selected string) error {
	fmt.Println("[open folder]", dir, selected)
	return nil
}

func readKey(path, key string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		k, v, ok := strings.Cut(s.Text(), ":")
		if !ok {
			k, v, ok = strings.Cut(s.Text(), "=")
		}
		if ok && strings.TrimSpace(k) == key {
			return strings.Trim(strings.TrimSpace(v), `"`)
		}
	}
	return ""
}

func (NativePlatform) Facts(root string) []native.Fact {
	out := []native.Fact{{Name: "system", Value: strings.TrimSpace(runtime.GOOS + " " + readKey("/etc/os-release", "PRETTY_NAME"))},
		{Name: "processor", Value: fmt.Sprintf("%s · %d threads", readKey("/proc/cpuinfo", "model name"), runtime.NumCPU())}}
	var tot, avail uint64
	fmt.Sscan(readKey("/proc/meminfo", "MemTotal"), &tot)
	fmt.Sscan(readKey("/proc/meminfo", "MemAvailable"), &avail)
	if tot > 0 {
		out = append(out, native.Fact{Name: "memory", Value: fmt.Sprintf("%.1f GB, %.1f GB free", float64(tot)/(1<<20), float64(avail)/(1<<20))})
	}
	var st syscall.Statfs_t
	if syscall.Statfs(root, &st) == nil {
		bs := uint64(st.Bsize)
		out = append(out, native.Fact{Name: "disk", Value: fmt.Sprintf("%.1f GB free of %.1f GB", float64(uint64(st.Bavail)*bs)/(1<<30), float64(uint64(st.Blocks)*bs)/(1<<30))})
	}
	return out
}

// ReportDir: RUACH_REPORT_DIR, else the Studio's logs/.
func (NativePlatform) ReportDir(l native.Layout) string {
	if d := os.Getenv("RUACH_REPORT_DIR"); d != "" {
		return d
	}
	return l.Logs()
}

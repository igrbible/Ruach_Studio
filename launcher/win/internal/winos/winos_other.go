//go:build !windows

package winos

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Off Windows the launcher runs in console mode against a fake wsl.exe: the same decisions, printed.

func hideWindow(*exec.Cmd) {}

type Platform struct{}

func (Platform) WindowsBuild() int { return 0 }

func (Platform) RunElevated(exe string, args ...string) (int, error) {
	fmt.Println("[elevated]", exe, strings.Join(args, " "))
	c := exec.Command(WSLExe(), args...)
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	if err := c.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return ee.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}

func (Platform) OpenApp(url string) error { fmt.Println("[open app]", url); return nil }
func (Platform) OpenConsole(a ...string) error {
	fmt.Println("[console] wsl.exe", strings.Join(a, " "))
	return nil
}
func (Platform) RunConsole(a ...string) (int, error) {
	fmt.Println("[console, waited] wsl.exe", strings.Join(a, " "))
	c := exec.Command(WSLExe(), a...)
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	if err := c.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return ee.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}
func (Platform) ScheduleResume() error {
	fmt.Println("[RunOnce] the launcher, after the next sign-in")
	return nil
}

// SingleInstance is a no-op off Windows.
func SingleInstance(string) (release func(), already bool) { return func() {}, false }

// DataDir: where the launcher keeps its log and the distribution's disk.
func DataDir() string {
	if d := os.Getenv("RUACH_LAUNCHER_DATA"); d != "" {
		return d
	}
	h, _ := os.UserCacheDir()
	return h + "/RuachStudio"
}

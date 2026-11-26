//go:build !windows

package winos

import (
	"fmt"
	"os/exec"
)

// Off Windows the launcher runs in console mode for its tests (testdata/e2e-native.sh): what Windows would show is printed.

func hideWindow(*exec.Cmd) {}

func (NativePlatform) OpenApp(url string) error { fmt.Println("[open app]", url); return nil }

// SingleInstance is a no-op off Windows.
func SingleInstance(string) (release func(), already bool) { return func() {}, false }

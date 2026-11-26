// Package winos is the native launcher's Windows: services started hidden in a job object, the install in a console of its own,
// Edge's app window, Explorer, message boxes, one instance at a time. The files without a build tag build everywhere, so the
// decisions run on Linux in tests (testdata/e2e-native.sh); the *_windows.go files are Windows-only.
package winos

import (
	"fmt"
	"os"
	"strings"
)

// Console UI: questions are answered by RUACH_LAUNCHER_ANSWER (yes/no, default yes), so a scripted run decides.
type ConsoleUI struct{}

func (ConsoleUI) Status(m string)   { fmt.Println("[status]", m) }
func (ConsoleUI) Info(t, m string)  { fmt.Printf("[info] %s: %s\n", t, oneline(m)) }
func (ConsoleUI) Error(t, m string) { fmt.Printf("[error] %s: %s\n", t, oneline(m)) }
func (ConsoleUI) Ask(t, m string) bool {
	yes := os.Getenv("RUACH_LAUNCHER_ANSWER") != "no"
	fmt.Printf("[ask] %s: %s → %v\n", t, oneline(m), yes)
	return yes
}

func oneline(s string) string { return strings.Join(strings.Fields(s), " ") }

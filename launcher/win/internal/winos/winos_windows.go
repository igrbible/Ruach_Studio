//go:build windows

package winos

// winos_windows.go: the launcher's Windows beside native_windows.go: a console program started hidden, Edge's app window, one instance at a time,
// message boxes. (The WSL package's UAC elevation, RunOnce resume and wsl.exe consoles went out with it: HERESY 2990.)

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	createNoWindow   = 0x08000000
	createNewConsole = 0x00000010
	mbOK             = 0x0
	mbYesNo          = 0x4
	mbIconError      = 0x10
	mbIconQuestion   = 0x20
	mbIconInfo       = 0x40
	idYes            = 6
)

var (
	user32         = windows.NewLazySystemDLL("user32.dll")
	procMessageBox = user32.NewProc("MessageBoxW")
)

// hideWindow: the launcher is a GUI program; a console program it starts would flash a console window without this.
func hideWindow(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

// edgePath: Edge's App Paths entry, else its usual places.
func edgePath() string {
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		if k, err := registry.OpenKey(root, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`, registry.QUERY_VALUE); err == nil {
			p, _, err := k.GetStringValue("")
			k.Close()
			if err == nil && fileExists(p) {
				return p
			}
		}
	}
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		p := filepath.Join(os.Getenv(env), `Microsoft\Edge\Application\msedge.exe`)
		if fileExists(p) {
			return p
		}
	}
	return ""
}

func fileExists(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }

// OpenApp shows the page in Edge's app window (no tabs, no address bar: the PWA's own look); without Edge, the default browser.
func (NativePlatform) OpenApp(url string) error {
	if e := edgePath(); e != "" {
		c := exec.Command(e, "--app="+url)
		if err := c.Start(); err == nil {
			return c.Process.Release()
		}
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// SingleInstance holds a named mutex; already is true when another launcher holds it.
func SingleInstance(name string) (release func(), already bool) {
	n, _ := windows.UTF16PtrFromString(`Local\` + name)
	h, err := windows.CreateMutex(nil, false, n)
	if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		if h != 0 {
			windows.CloseHandle(h)
		}
		return func() {}, true
	}
	return func() { windows.CloseHandle(h) }, false
}

func messageBox(title, text string, flags uintptr) int {
	t, _ := windows.UTF16PtrFromString(title)
	m, _ := windows.UTF16PtrFromString(text)
	r, _, _ := procMessageBox.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags)
	return int(r)
}

// BoxUI: questions and notices in message boxes; the status line goes to a callback (the tray's tooltip).
type BoxUI struct{ OnStatus func(string) }

func (u BoxUI) Status(m string) {
	if u.OnStatus != nil {
		u.OnStatus(m)
	}
}
func (BoxUI) Info(t, m string)  { messageBox(t, m, mbOK|mbIconInfo) }
func (BoxUI) Error(t, m string) { messageBox(t, m, mbOK|mbIconError) }
func (BoxUI) Ask(t, m string) bool {
	return messageBox(t, m, mbYesNo|mbIconQuestion) == idYes
}

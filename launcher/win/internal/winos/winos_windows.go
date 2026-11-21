//go:build windows

package winos

import (
	"errors"
	"fmt"
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
	seeMaskNoClose   = 0x00000040
	seeMaskNoAsync   = 0x00000100
	swShow           = 5
	mbOK             = 0x0
	mbYesNo          = 0x4
	mbIconError      = 0x10
	mbIconQuestion   = 0x20
	mbIconInfo       = 0x40
	idYes            = 6
)

var (
	shell32         = windows.NewLazySystemDLL("shell32.dll")
	user32          = windows.NewLazySystemDLL("user32.dll")
	procShellExecEx = shell32.NewProc("ShellExecuteExW")
	procMessageBox  = user32.NewProc("MessageBoxW")
)

// hideWindow: the launcher is a GUI program; a console program it starts would flash a console window without this.
func hideWindow(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

type Platform struct{}

// WindowsBuild reads the real build (RtlGetVersion is not shimmed by the compatibility layer, unlike GetVersionEx).
func (Platform) WindowsBuild() int { return int(windows.RtlGetVersion().BuildNumber) }

// SHELLEXECUTEINFOW, 112 bytes on amd64: Go pads the same way the C compiler does.
type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIcon        uintptr
	hProcess     windows.Handle
}

// RunElevated starts exe through UAC («runas») and waits for its exit code. Its console stays visible: wsl --install
// shows its own progress there.
func (Platform) RunElevated(exe string, args ...string) (int, error) {
	verb, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString(exe)
	params, _ := windows.UTF16PtrFromString(windows.ComposeCommandLine(args))
	info := shellExecuteInfo{fMask: seeMaskNoClose | seeMaskNoAsync, lpVerb: verb, lpFile: file, lpParameters: params, nShow: swShow}
	info.cbSize = uint32(unsafe.Sizeof(info))
	if r, _, err := procShellExecEx.Call(uintptr(unsafe.Pointer(&info))); r == 0 {
		return -1, fmt.Errorf("UAC: %v", err) // ERROR_CANCELLED when the user says no
	}
	if info.hProcess == 0 {
		return -1, errors.New("no process handle from ShellExecuteEx")
	}
	defer windows.CloseHandle(info.hProcess)
	if _, err := windows.WaitForSingleObject(info.hProcess, windows.INFINITE); err != nil {
		return -1, err
	}
	var code uint32
	if err := windows.GetExitCodeProcess(info.hProcess, &code); err != nil {
		return -1, err
	}
	return int(int32(code)), nil
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
func (Platform) OpenApp(url string) error {
	if e := edgePath(); e != "" {
		c := exec.Command(e, "--app="+url)
		if err := c.Start(); err == nil {
			return c.Process.Release()
		}
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// OpenConsole runs wsl.exe in a console window of its own (the logs, followed).
func (Platform) OpenConsole(args ...string) error {
	h, err := newConsole("", nil, WSLExe(), args...) // HERESY 2928: the console's own input and output, not NUL
	if err != nil {
		return err
	}
	return syscall.CloseHandle(h)
}

// RunConsole runs wsl.exe in a console window of its own and waits for it (the models' download shows its progress there).
func (Platform) RunConsole(args ...string) (int, error) {
	h, err := newConsole("", nil, WSLExe(), args...) // HERESY 2928: its questions read the console, not NUL
	if err != nil {
		return -1, err
	}
	code, err := waitExit(h)
	if err != nil {
		return -1, err
	}
	return code, nil
}

// ScheduleResume: RunOnce starts the launcher once at the next sign-in, after the restart WSL's install asks for.
func (Platform) ScheduleResume() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	k, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\RunOnce`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue("RuachStudio", `"`+exe+`" --resume`)
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

// DataDir: %LOCALAPPDATA%\RuachStudio (the log, and the distribution's disk under wsl\).
func DataDir() string {
	if d := os.Getenv("RUACH_LAUNCHER_DATA"); d != "" {
		return d
	}
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "RuachStudio")
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

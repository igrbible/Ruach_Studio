//go:build windows

package winos

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"

	"github.com/igrbible/ruach-launcher/internal/native"
)

// treeKill holds a job object with KILL_ON_JOB_CLOSE around a service: everything the service starts is in it, a Stop ends them
// all at once, and if the launcher itself dies (Task Manager, a crash) Windows closes the handle and ends them too, so no engine is
// left holding the port. Without a job (Windows refused one) taskkill /T ends the tree by its parent links.
type treeKill struct {
	mu       sync.Mutex
	job      windows.Handle
	pid      int
	released bool
}

func newKillJob() windows.Handle {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		windows.CloseHandle(job)
		return 0
	}
	return job
}

// startTree starts c hidden (no console window flashes) and puts it into a job of its own. The few microseconds between the start
// and the assignment are long before Python has started anything of its own.
func startTree(c *exec.Cmd) (*treeKill, error) {
	job := newKillJob()
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	if err := c.Start(); err != nil {
		if job != 0 {
			windows.CloseHandle(job)
		}
		return nil, err
	}
	t := &treeKill{job: job, pid: c.Process.Pid}
	if job != 0 {
		h, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(t.pid))
		if err == nil {
			if windows.AssignProcessToJobObject(job, h) != nil {
				windows.CloseHandle(job)
				t.job = 0
			}
			windows.CloseHandle(h)
		} else {
			windows.CloseHandle(job)
			t.job = 0
		}
	}
	return t, nil
}

// kill ends the tree; ended says the service's own process is gone already (then only its job's leftovers can be ended: its pid
// may be another program's by now). A job's end is always hard; hard matters only to the process group elsewhere.
func (t *treeKill) kill(hard, ended bool) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.released {
		return nil
	}
	if t.job != 0 {
		return windows.TerminateJobObject(t.job, 1)
	}
	if ended {
		return nil
	}
	c := exec.Command("taskkill", "/PID", strconv.Itoa(t.pid), "/T", "/F")
	hideWindow(c)
	return c.Run()
}

func (t *treeKill) release() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !t.released && t.job != 0 {
		windows.CloseHandle(t.job)
		t.job = 0
	}
	t.released = true
}

// tool: nvidia-smi from the PATH, else from System32 where NVIDIA's driver puts it.
func tool(exe string) string {
	if p, err := exec.LookPath(exe); err == nil {
		return p
	}
	if p := filepath.Join(os.Getenv("SystemRoot"), "System32", exe+".exe"); fileExists(p) {
		return p
	}
	return exe
}

func powershell() string {
	if p := filepath.Join(os.Getenv("SystemRoot"), `System32\WindowsPowerShell\v1.0\powershell.exe`); fileExists(p) {
		return p
	}
	return "powershell.exe"
}

// RunInstall runs launcher\install.ps1 in a console window of its own and waits for it, as RuachStudio.cmd runs it: the window shows
// each step and asks about the models; when the install stops, the window stays until Enter, so its last lines can be read.
func (NativePlatform) RunInstall(l native.Layout, env []string) (int, error) {
	script := strings.ReplaceAll(l.Install(), "'", "''")
	cmd := "$Host.UI.RawUI.WindowTitle = 'Ruach Studio - install'; " +
		"try { & '" + script + "'; $c = $LASTEXITCODE } catch { Write-Host $_; $c = 1 }; " +
		"if ($c) { Write-Host ''; Write-Host 'Ruach Studio: the install stopped. The lines above say why. Press Enter to close this window, then start Ruach Studio again: it goes on where it stopped.'; [void](Read-Host) }; " +
		"exit $c"
	// HERESY 2928: started in its console with that console's input and output (os/exec would hand it NUL: an empty window, the
	// models' question and the closing «Press Enter» reading end-of-file)
	h, err := newConsole(l.Root, append(os.Environ(), env...), powershell(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd)
	if err != nil {
		return -1, err
	}
	return waitExit(h)
}

// OpenURL: a web page (GitHub's release) in the default browser.
func (NativePlatform) OpenURL(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// OpenFolder shows dir in Explorer, the file selected chosen when one is given. Explorer reads its own command line («/select,"…"»),
// so the line is given as it wants it, not as Go would quote it.
func (NativePlatform) OpenFolder(dir, selected string) error {
	exe := filepath.Join(os.Getenv("SystemRoot"), "explorer.exe")
	c := exec.Command(exe)
	if selected != "" {
		c.SysProcAttr = &syscall.SysProcAttr{CmdLine: `"` + exe + `" /select,"` + selected + `"`}
	} else {
		c.SysProcAttr = &syscall.SysProcAttr{CmdLine: `"` + exe + `" "` + dir + `"`}
	}
	return c.Start() // explorer.exe answers with exit 1 even when it opened the folder: not waited for
}

func regString(root registry.Key, path, name string) string {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer k.Close()
	s, _, err := k.GetStringValue(name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(s)
}

func regInt(root registry.Key, path, name string) uint64 {
	k, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if err != nil {
		return 0
	}
	defer k.Close()
	n, _, err := k.GetIntegerValue(name)
	if err != nil {
		return 0
	}
	return n
}

// memoryStatusEx is MEMORYSTATUSEX (64 bytes), which golang.org/x/sys does not carry.
type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

var procGlobalMemoryStatusEx = windows.NewLazySystemDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx")

func gb(n uint64) string { return fmt.Sprintf("%.1f GB", float64(n)/(1<<30)) }

// Facts: Windows (its name, release and build: Windows 11 still calls itself «Windows 10» in the registry, so the build decides),
// the code pages (a Cyrillic Windows reads a .cmd in 866 or 1251), the processor, the memory and the Studio drive's free space.
func (NativePlatform) Facts(root string) []native.Fact {
	const cv = `SOFTWARE\Microsoft\Windows NT\CurrentVersion`
	v := windows.RtlGetVersion()
	name := regString(registry.LOCAL_MACHINE, cv, "ProductName")
	if name == "" {
		name = "Windows"
	}
	if v.BuildNumber >= 22000 {
		name = strings.Replace(name, "Windows 10", "Windows 11", 1)
	}
	win := fmt.Sprintf("%s %s · build %d.%d", name, regString(registry.LOCAL_MACHINE, cv, "DisplayVersion"), v.BuildNumber, regInt(registry.LOCAL_MACHINE, cv, "UBR"))
	out := []native.Fact{{Name: "Windows", Value: strings.Join(strings.Fields(win), " ")},
		{Name: "code pages", Value: fmt.Sprintf("ANSI %d · console %d", windows.GetACP(), getOEMCP())}}
	cpu := regString(registry.LOCAL_MACHINE, `HARDWARE\DESCRIPTION\System\CentralProcessor\0`, "ProcessorNameString")
	if cpu == "" {
		cpu = os.Getenv("PROCESSOR_IDENTIFIER")
	}
	out = append(out, native.Fact{Name: "processor", Value: fmt.Sprintf("%s · %d threads", cpu, runtime.NumCPU())})
	m := memoryStatusEx{}
	m.Length = uint32(unsafe.Sizeof(m))
	if r, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m))); r != 0 {
		out = append(out, native.Fact{Name: "memory", Value: gb(m.TotalPhys) + ", " + gb(m.AvailPhys) + " free"})
	}
	if p, err := windows.UTF16PtrFromString(root); err == nil {
		var free, total, totalFree uint64
		if windows.GetDiskFreeSpaceEx(p, &free, &total, &totalFree) == nil {
			out = append(out, native.Fact{Name: "disk", Value: fmt.Sprintf("%s %s free of %s", filepath.VolumeName(root), gb(free), gb(total))})
		}
	}
	return out
}

var procGetOEMCP = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetOEMCP")

func getOEMCP() uint32 {
	r, _, _ := procGetOEMCP.Call()
	return uint32(r)
}

// ReportDir: the Desktop (wherever it lives, OneDrive's too); the Studio's logs\ when Windows names none.
func (NativePlatform) ReportDir(l native.Layout) string {
	if d, err := windows.KnownFolderPath(windows.FOLDERID_Desktop, 0); err == nil {
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			return d
		}
	}
	return l.Logs()
}

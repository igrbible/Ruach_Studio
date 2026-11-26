//go:build windows

package winos

import (
	"os/exec"
	"syscall"
	"unsafe"
)

// HERESY 2928 (the 2.1.0-rc1 Windows soak, Viktor's Win11 in VirtualBox, 21.11.2026): os/exec gives a child the NUL device for every standard
// handle it is not handed (STARTF_USESTDHANDLES), a new console window or not. So install.ps1, started by RuachStudio.exe in a console of its
// own, printed into nothing (the window stood empty), the models' question «Download them now?» read end-of-file (fetch_models.py: exit 5),
// and the «Press Enter to close this window» that should have kept its last lines up read end-of-file too: the window closed at once and the
// launcher said «its window said why». newConsole starts the
// program with CreateProcess itself, in a console of its own and with no standard handles given, so its input and its output are that
// console's, as a program started from Explorer or by `start` has them.
func newConsole(dir string, env []string, name string, args ...string) (syscall.Handle, error) {
	path, err := exec.LookPath(name)
	if err != nil {
		return 0, err
	}
	line := syscall.EscapeArg(path)
	for _, a := range args {
		line += " " + syscall.EscapeArg(a)
	}
	cl, err := syscall.UTF16PtrFromString(line)
	if err != nil {
		return 0, err
	}
	var dirp *uint16
	if dir != "" {
		if dirp, err = syscall.UTF16PtrFromString(dir); err != nil {
			return 0, err
		}
	}
	flags := uint32(createNewConsole)
	var envp *uint16
	if env != nil {
		var block []uint16
		for _, kv := range env {
			u, err := syscall.UTF16FromString(kv) // its own terminating zero
			if err != nil {
				return 0, err
			}
			block = append(block, u...)
		}
		block = append(block, 0) // the block's end
		envp = &block[0]
		flags |= syscall.CREATE_UNICODE_ENVIRONMENT
	}
	si := &syscall.StartupInfo{}
	si.Cb = uint32(unsafe.Sizeof(*si))
	pi := &syscall.ProcessInformation{}
	if err := syscall.CreateProcess(nil, cl, nil, nil, false, flags, envp, dirp, si, pi); err != nil {
		return 0, err
	}
	syscall.CloseHandle(pi.Thread)
	return pi.Process, nil
}

// waitExit waits for a process started by newConsole and gives its exit code.
func waitExit(h syscall.Handle) (int, error) {
	defer syscall.CloseHandle(h)
	if _, err := syscall.WaitForSingleObject(h, syscall.INFINITE); err != nil {
		return -1, err
	}
	var code uint32
	if err := syscall.GetExitCodeProcess(h, &code); err != nil {
		return -1, err
	}
	return int(code), nil
}

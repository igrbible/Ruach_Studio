// Package winos is the launcher's Windows: wsl.exe started without a console window, UAC, Edge, message boxes,
// RunOnce, one instance at a time. The files without a build tag build everywhere, so the Runner is tested on Linux
// against a fake wsl.exe (WSL_EXE names it); the *_windows.go files are Windows-only.
package winos

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/igrbible/ruach-launcher/internal/wsl"
)

// WSLExe is wsl.exe, or what WSL_EXE names (a fake one, for tests).
func WSLExe() string {
	if e := os.Getenv("WSL_EXE"); e != "" {
		return e
	}
	return "wsl.exe"
}

// Runner runs wsl.exe hidden, with WSL_UTF8=1 (its own messages in UTF-8; Decode still takes UTF-16 from older ones).
type Runner struct{}

func command(ctx context.Context, args ...string) *exec.Cmd {
	var c *exec.Cmd
	if ctx != nil {
		c = exec.CommandContext(ctx, WSLExe(), args...)
	} else {
		c = exec.Command(WSLExe(), args...)
	}
	c.Env = append(os.Environ(), "WSL_UTF8=1")
	hideWindow(c)
	return c
}

func (Runner) Run(ctx context.Context, args ...string) (wsl.Result, error) {
	c := command(ctx, args...)
	var out, errb bytes.Buffer
	c.Stdout, c.Stderr = &out, &errb
	err := c.Run()
	r := wsl.Result{Stdout: wsl.Decode(out.Bytes()), Stderr: wsl.Decode(errb.Bytes())}
	var ee *exec.ExitError
	switch {
	case err == nil:
	case errors.As(err, &ee):
		r.Code = ee.ExitCode()
	default:
		return r, fmt.Errorf("%w: %v", wsl.ErrNotStarted, err)
	}
	return r, nil
}

type proc struct {
	cmd  *exec.Cmd
	done chan struct{}
	once sync.Once
}

func (Runner) Start(args ...string) (wsl.Process, error) {
	c := command(nil, args...)
	if err := c.Start(); err != nil {
		return nil, fmt.Errorf("%w: %v", wsl.ErrNotStarted, err)
	}
	p := &proc{cmd: c, done: make(chan struct{})}
	go func() { _ = c.Wait(); close(p.done) }()
	return p, nil
}

func (p *proc) Stop() error {
	var err error
	p.once.Do(func() { err = p.cmd.Process.Kill() })
	<-p.done
	return err
}

func (p *proc) Done() <-chan struct{} { return p.done }

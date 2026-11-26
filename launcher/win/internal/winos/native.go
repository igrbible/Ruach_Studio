package winos

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/igrbible/ruach-launcher/internal/native"
)

// NativePlatform is the system under the native package's launcher (internal/native): on Windows the real one (job objects,
// Edge, Explorer, a console for the install); elsewhere a printed stand-in, so the launcher's decisions run in tests.
type NativePlatform struct{}

// Output runs a small tool hidden (nvidia-smi, python --version) and returns what it printed.
func (NativePlatform) Output(timeout time.Duration, exe string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	c := exec.CommandContext(ctx, tool(exe), args...)
	hideWindow(c)
	out, err := c.CombinedOutput()
	if ctx.Err() != nil {
		return string(out), errors.New("no answer in " + timeout.String())
	}
	return string(out), err
}

// svcProc is a service's process: its own output pipe copied into its log, its end seen by the process itself (not by the pipe, which
// a child it started may hold open), and how it is ended (a job object on Windows, the process group elsewhere: tree).
type svcProc struct {
	cmd  *exec.Cmd
	done chan struct{}
	code int
	once sync.Once
	tree *treeKill
}

func closed(c chan struct{}) bool {
	select {
	case <-c:
		return true
	default:
		return false
	}
}

func (p *svcProc) Pid() int              { return p.cmd.Process.Pid }
func (p *svcProc) Done() <-chan struct{} { return p.done }
func (p *svcProc) ExitCode() int         { <-p.done; return p.code }

// Stop ends the process with everything it started and waits for it (15 s at most).
func (p *svcProc) Stop() error {
	var err error
	p.once.Do(func() {
		ended := closed(p.done)
		err = p.tree.kill(false, ended)
		if ended {
			return
		}
		select {
		case <-p.done:
		case <-time.After(10 * time.Second):
			_ = p.tree.kill(true, false)
			select {
			case <-p.done:
			case <-time.After(5 * time.Second):
				err = errors.New("it did not end in 15 s")
			}
		}
	})
	p.tree.release()
	return err
}

// spawn starts s with its output into out; keep says whether its children outlive its own end.
func spawn(s native.Spec, out io.Writer) (native.Proc, error) {
	pr, pw, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	c := exec.Command(s.Exe, s.Args...)
	c.Dir = s.Dir
	c.Env = append(os.Environ(), s.Env...)
	c.Stdout, c.Stderr = pw, pw
	t, err := startTree(c)
	pw.Close() // the child holds its own copy; the pipe ends when the last writer is gone
	if err != nil {
		pr.Close()
		return nil, err
	}
	p := &svcProc{cmd: c, done: make(chan struct{}), tree: t}
	go func() { _, _ = io.Copy(out, pr); pr.Close() }()
	go func() {
		st, err := c.Process.Wait()
		p.code = -1
		if err == nil {
			p.code = st.ExitCode()
		}
		close(p.done)
		if !s.KeepChildren { // what it left behind would hold the port the next start needs
			p.once.Do(func() { _ = p.tree.kill(true, true) })
			p.tree.release()
		}
	}()
	return p, nil
}

// Spawn runs a service hidden, its output into its log.
func (NativePlatform) Spawn(s native.Spec, out *native.Log) (native.Proc, error) {
	return spawn(s, out)
}

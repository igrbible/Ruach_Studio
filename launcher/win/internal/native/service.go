package native

import (
	"fmt"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Service is the lab or the engine kept running as the Linux units keep them (Restart=always, RestartSec=5): an end is followed by a
// new start after RestartDelay; QuickExits failed starts in a row (each ending sooner than QuickExit) give the service up, so a
// missing model is said once with its log's last lines instead of a start every five seconds forever.
type Service struct {
	Spec   Spec
	Health string

	spawn    func(Spec, *Log) (Proc, error)
	cfg      Config
	say      func(string, ...any)
	out      *Log
	onGiveUp func(*Service)
	waiting  atomic.Bool // Studio.wait is watching it: the failure is said there, not in a box of its own

	mu       sync.Mutex
	running  bool
	external bool
	gaveUp   bool
	stopc    chan struct{}
	donec    chan struct{}
	pid      int
	since    time.Time
	restarts int
	quick    int
	lastExit int
	exited   bool
	left     []Proc // ended processes whose children may live on (KeepChildren): a Stop ends those too
	cur      Proc
}

func (v *Service) proc() Proc { v.mu.Lock(); defer v.mu.Unlock(); return v.cur }

func (s *Studio) newService(spec Spec, health string) *Service {
	return &Service{Spec: spec, Health: health, spawn: s.P.Spawn, cfg: s.Cfg, say: s.say,
		out: OpenLog(filepath.Join(s.Cfg.Layout.Logs(), spec.Name+".log"), s.Cfg.LogMax),
		onGiveUp: func(v *Service) {
			if !v.waiting.Load() {
				s.UI.Error("Ruach Studio", fmt.Sprintf("The %s ended %d times right after its start, and the launcher stopped trying. Its last lines:\n\n%s\n\nThe tray's Tester's report gathers its whole log.",
					v.Spec.Name, s.Cfg.QuickExits, v.out.Tail(8)))
			}
			s.UI.Status("the " + v.Spec.Name + " stopped: Restart the Studio from this menu, or send a Tester's report")
		}}
}

// Out is the service's log.
func (v *Service) Out() *Log { return v.out }

func (v *Service) Running() bool  { v.mu.Lock(); defer v.mu.Unlock(); return v.running }
func (v *Service) GaveUp() bool   { v.mu.Lock(); defer v.mu.Unlock(); return v.gaveUp }
func (v *Service) External() bool { v.mu.Lock(); defer v.mu.Unlock(); return v.external }
func (v *Service) Pid() int       { v.mu.Lock(); defer v.mu.Unlock(); return v.pid }
func (v *Service) Restarts() int  { v.mu.Lock(); defer v.mu.Unlock(); return v.restarts }

func (v *Service) markExternal(b bool) { v.mu.Lock(); v.external = b; v.mu.Unlock() }

// Start begins the keeping; a running service is left as it is.
func (v *Service) Start() {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.running {
		return
	}
	v.running, v.gaveUp, v.quick, v.restarts = true, false, 0, 0
	v.stopc, v.donec = make(chan struct{}), make(chan struct{})
	go v.loop(v.stopc, v.donec)
}

func (v *Service) loop(stopc, donec chan struct{}) {
	defer close(donec)
	for {
		started := time.Now()
		p, err := v.spawn(v.Spec, v.out)
		if err != nil {
			v.say("%s did not start: %v", v.Spec.Name, err)
			v.out.Mark("the launcher could not start it: %v", err)
		} else {
			v.mu.Lock()
			v.pid, v.since, v.cur = p.Pid(), started, p
			v.mu.Unlock()
			v.say("%s started (pid %d)", v.Spec.Name, p.Pid())
			v.out.Mark("started by the launcher (pid %d)", p.Pid())
			select {
			case <-stopc:
				err := p.Stop()
				v.mu.Lock()
				v.pid, v.cur = 0, nil
				v.mu.Unlock()
				v.say("%s stopped (pid %d) %v", v.Spec.Name, p.Pid(), errOrEmpty(err))
				v.out.Mark("stopped by the launcher")
				return
			case <-p.Done():
			}
			code := p.ExitCode()
			v.mu.Lock()
			v.pid, v.lastExit, v.exited, v.cur = 0, code, true, nil
			if v.Spec.KeepChildren {
				v.left = append(v.left, p)
			}
			v.mu.Unlock()
			v.say("%s ended (pid %d, exit %d) after %s", v.Spec.Name, p.Pid(), code, time.Since(started).Round(time.Second))
			v.out.Mark("it ended (exit %d) after %s", code, time.Since(started).Round(time.Second))
		}
		v.mu.Lock()
		if err != nil || time.Since(started) < v.cfg.QuickExit {
			v.quick++
		} else {
			v.quick = 0
		}
		giveUp := v.quick >= v.cfg.QuickExits
		if giveUp {
			v.gaveUp, v.running = true, false
		}
		v.mu.Unlock()
		if giveUp {
			v.say("%s given up after %d failed starts in a row", v.Spec.Name, v.cfg.QuickExits)
			v.out.Mark("given up after %d failed starts in a row", v.cfg.QuickExits)
			if v.onGiveUp != nil {
				v.onGiveUp(v)
			}
			return
		}
		select {
		case <-stopc:
			return
		case <-time.After(v.cfg.RestartDelay):
		}
		v.mu.Lock()
		v.restarts++
		v.mu.Unlock()
	}
}

func errOrEmpty(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// Stop ends the service and everything it started, and waits for it.
func (v *Service) Stop() {
	v.mu.Lock()
	running := v.running
	v.running = false
	stopc, donec := v.stopc, v.donec
	v.mu.Unlock()
	if running {
		close(stopc)
		<-donec
	}
	v.mu.Lock()
	left := v.left
	v.left = nil
	v.mu.Unlock()
	for _, p := range left {
		_ = p.Stop()
	}
}

// State says the service in a few words: running (its pid, how long, its restarts), stopped, given up, or outside the launcher.
func (v *Service) State() string {
	v.mu.Lock()
	defer v.mu.Unlock()
	switch {
	case v.external:
		return "runs outside this launcher (it answered before the launcher started it)"
	case v.gaveUp:
		return fmt.Sprintf("given up after %d failed starts in a row (the last exit %d)", v.cfg.QuickExits, v.lastExit)
	case v.running && v.pid != 0:
		s := fmt.Sprintf("running, pid %d, for %s", v.pid, time.Since(v.since).Round(time.Second))
		if v.restarts > 0 {
			s += fmt.Sprintf(", restarted %d times", v.restarts)
		}
		return s
	case v.running:
		return fmt.Sprintf("starting again (the last exit %d)", v.lastExit)
	case v.exited:
		return fmt.Sprintf("stopped (the last exit %d)", v.lastExit)
	}
	return "not started by this launcher"
}

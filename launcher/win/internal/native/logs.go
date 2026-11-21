package native

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Log is a service's log file in logs\: what the process prints, as it prints it, and a line of the launcher's own at each start
// and end. Past its limit the file goes to <name>.1.log (the one before it gone) and a new one begins; the last 16 KB stay in memory
// too, so an error can quote the last lines. A log never stops its writer: a file that cannot be written loses the line, not the Studio.
type Log struct {
	mu   sync.Mutex
	path string
	max  int64
	f    *os.File
	size int64
	ring []byte
}

const ringMax = 16 << 10

// OpenLog opens path for appending (its folder made); a log that cannot be opened keeps its lines in memory only.
func OpenLog(path string, max int64) *Log {
	l := &Log{path: path, max: max}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	l.open()
	return l
}

func (l *Log) open() {
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		l.f = nil
		return
	}
	l.f = f
	if st, err := f.Stat(); err == nil {
		l.size = st.Size()
	}
}

// Rotated is the previous log's file: engine.log → engine.1.log.
func Rotated(path string) string {
	ext := filepath.Ext(path)
	return strings.TrimSuffix(path, ext) + ".1" + ext
}

func (l *Log) Path() string { return l.path }

func (l *Log) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.ring = append(l.ring, p...)
	if len(l.ring) > ringMax {
		l.ring = append([]byte(nil), l.ring[len(l.ring)-ringMax:]...)
	}
	if l.f != nil && l.max > 0 && l.size+int64(len(p)) > l.max && l.size > 0 {
		_ = l.f.Close()
		if err := os.Rename(l.path, Rotated(l.path)); err != nil {
			// a reader holds it (a report being made): the same file goes on, the next line tries again
			l.open()
		} else {
			l.size = 0
			l.open()
		}
	}
	if l.f != nil {
		if n, err := l.f.Write(p); err == nil {
			l.size += int64(n)
		}
	}
	return len(p), nil
}

// Mark writes one line of the launcher's own into the log, with the time.
func (l *Log) Mark(format string, a ...any) {
	fmt.Fprintf(l, "── %s · %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, a...))
}

// Tail is the process's last n lines kept in memory, of its last start (the launcher's own marks left out), each indented, a
// progress bar's carriage returns kept to their last state.
func (l *Log) Tail(n int) string {
	l.mu.Lock()
	b := append([]byte(nil), l.ring...)
	l.mu.Unlock()
	lines := strings.Split(strings.TrimRight(string(bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n"))), "\n"), "\n")
	out := make([]string, 0, n)
	for i := len(lines) - 1; i >= 0 && len(out) < n; i-- {
		s := lines[i]
		if k := strings.LastIndexByte(s, '\r'); k >= 0 {
			s = s[k+1:]
		}
		if strings.HasPrefix(s, "── ") { // the launcher's own marks: the process's lines are wanted, of its last start only
			if strings.Contains(s, "started by the launcher") && len(out) > 0 {
				break
			}
			continue
		}
		if strings.TrimSpace(s) == "" {
			continue
		}
		out = append(out, "  "+s)
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	if len(out) == 0 {
		return "  (nothing yet)"
	}
	return strings.Join(out, "\n")
}

func (l *Log) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.f != nil {
		_ = l.f.Close()
		l.f = nil
	}
}

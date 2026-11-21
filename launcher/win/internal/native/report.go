package native

import (
	"archive/zip"
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ReportLogMax: each log goes into the report as its last 4 MB (a day's engine log is far less; a month's is not).
const ReportLogMax = 4 << 20

// ReportNotice is what the tester reads before the report is made, and what report.txt says of itself.
const ReportNotice = "The report gathers the Studio's logs (the launcher's, the lab's and the engine's, the last 4 MB of each), the package's BUILD.txt, and this computer's Windows version, processor, memory, free disk and NVIDIA card. No songs, no lyrics files, no models; the logs may name your takes and their titles. It is saved as one .zip and nothing is sent anywhere: you send it yourself."

// Summary is report.txt's text: what runs where, as one page a person reads first. --status prints it too.
func (s *Studio) Summary(ctx context.Context) string {
	l := s.Cfg.Layout
	var b strings.Builder
	row := func(k, v string) { fmt.Fprintf(&b, "%-12s %s\n", k, v) }
	ver := l.Version()
	if ver == "" {
		ver = "? (no VERSION)"
	}
	n := PathLength(l.Root)
	room := fmt.Sprintf("%d characters", n)
	if l.Win && n > PathBudget {
		room += fmt.Sprintf(", over the %d that leave the install room under Windows' 260", PathBudget)
	}
	row("launcher", s.Cfg.Version+" · "+runtime.GOOS+"/"+runtime.GOARCH+" · native")
	row("Studio", ver+" · "+l.Root+" ("+room+")")
	for _, f := range s.P.Facts(l.Root) {
		row(f.Name, f.Value)
	}
	if isFile(l.Python()) {
		v, err := s.P.Output(15*time.Second, l.Python(), "--version")
		if err != nil {
			v = "does not start: " + err.Error()
		}
		row("Python", rel(l, l.Python())+" · "+firstLine(v))
	} else {
		row("Python", "not installed yet (the first start brings it into .venv)")
	}
	var eng []string
	for _, k := range []string{"cuda", "cpu"} {
		p := filepath.Join(l.Root, "engine", k, "yue-server.exe")
		if st, err := os.Stat(p); err == nil {
			eng = append(eng, fmt.Sprintf("%s %.1f MB", rel(l, p), float64(st.Size())/(1<<20)))
		}
	}
	if len(eng) == 0 {
		eng = []string{"none in engine\\cuda or engine\\cpu"}
	}
	row("engines", strings.Join(eng, " · "))
	if out, err := s.P.Output(20*time.Second, "nvidia-smi", "--query-gpu=index,name,driver_version,memory.total,memory.used,compute_cap", "--format=csv,noheader"); err == nil && strings.TrimSpace(out) != "" {
		for i, line := range strings.Split(strings.TrimSpace(out), "\n") {
			k := ""
			if i == 0 {
				k = "card"
			}
			row(k, strings.TrimSpace(line))
		}
	} else {
		row("card", "nvidia-smi does not answer ("+errOrEmpty(err)+"): no NVIDIA card or driver, so the engine runs on the processor")
	}
	for _, v := range s.Services() {
		code, body, err := s.Get(ctx, v.Health)
		h := fmt.Sprintf("%s → %d", v.Health, code)
		if err != nil {
			h = v.Health + " does not answer"
		}
		row(v.Spec.Name, h+" · "+v.State())
		_ = body
	}
	if said := engineSays(filepath.Join(l.Logs(), "engine.log")); said != "" {
		b.WriteString("\nThe engine's last start said:\n" + said)
	}
	for _, p := range []struct{ name, url string }{{"The lab's health", s.Cfg.LabURL() + "health"}, {"The engine's hardware", s.Cfg.URL() + "hardware"}} {
		if code, body, err := s.Get(ctx, p.url); err == nil && code == 200 {
			t := strings.TrimSpace(string(body))
			if len(t) > 3000 {
				t = t[:3000] + " …"
			}
			fmt.Fprintf(&b, "\n%s (%s):\n%s\n", p.name, p.url, t)
		}
	}
	return b.String()
}

func rel(l Layout, p string) string {
	if r, err := filepath.Rel(l.Root, p); err == nil && !strings.HasPrefix(r, "..") {
		return r
	}
	return p
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}

// engineSays: start.py's own lines from the engine's last start (the card, the backbones, the engine it picked, a model missing).
func engineSays(path string) string {
	b, _, err := tailFile(path, 512<<10)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n")
	start := 0
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(lines[i], "Ruach Studio ") && strings.Contains(lines[i], "http://") {
			start = i
			break
		}
	}
	var out []string
	for _, s := range lines[start:] {
		for _, p := range []string{"Ruach Studio ", "  gpu", "  matmul", "  backbones", "  engine", "guard ", "missing ", "no ", "the engine comes", "the page is missing"} {
			if strings.HasPrefix(s, p) {
				out = append(out, "  "+strings.TrimSpace(s))
				break
			}
		}
		if len(out) >= 12 {
			break
		}
	}
	if len(out) == 0 {
		return ""
	}
	return strings.Join(out, "\n") + "\n"
}

// tailFile reads the last max bytes of path from a line's start; skipped is how many bytes were left out before them.
func tailFile(path string, max int64) ([]byte, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, 0, err
	}
	off := int64(0)
	if st.Size() > max {
		off = st.Size() - max
	}
	if _, err := f.Seek(off, io.SeekStart); err != nil {
		return nil, 0, err
	}
	r := bufio.NewReader(f)
	if off > 0 {
		skip, _ := r.ReadBytes('\n')
		off += int64(len(skip))
	}
	b, err := io.ReadAll(r)
	return b, off, err
}

// Report gathers the tester's report into dir as RuachStudio-report-<date>-<time>.zip (whole or not at all) and returns its path.
func (s *Studio) Report(ctx context.Context, dir string) (string, error) {
	l := s.Cfg.Layout
	now := time.Now()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := filepath.Join(dir, "RuachStudio-report-"+now.Format("20060102-150405")+".zip")
	part := name + ".part"
	f, err := os.Create(part)
	if err != nil {
		return "", err
	}
	z := zip.NewWriter(f)
	put := func(n string, b []byte) error {
		w, err := z.CreateHeader(&zip.FileHeader{Name: n, Method: zip.Deflate, Modified: now})
		if err != nil {
			return err
		}
		_, err = w.Write(b)
		return err
	}
	head := fmt.Sprintf("Ruach Studio · a tester's report · %s\n%s\n\n", now.Format("2006-01-02 15:04:05 -0700"), ReportNotice)
	werr := put("report.txt", []byte(strings.ReplaceAll(head+s.Summary(ctx), "\n", "\r\n")))
	var logs []string
	for _, n := range []string{"launcher", "lab", "engine"} {
		p := filepath.Join(l.Logs(), n+".log")
		logs = append(logs, Rotated(p), p)
	}
	for _, p := range logs {
		if werr != nil {
			break
		}
		b, skipped, err := tailFile(p, ReportLogMax)
		if err != nil {
			continue
		}
		if skipped > 0 {
			b = append([]byte(fmt.Sprintf("[the first %.1f MB of this log left out]\n", float64(skipped)/(1<<20))), b...)
		}
		werr = put("logs/"+filepath.Base(p), b)
	}
	if b, err := os.ReadFile(filepath.Join(l.Root, "BUILD.txt")); err == nil && werr == nil {
		werr = put("BUILD.txt", b)
	}
	if out, err := s.P.Output(20*time.Second, "nvidia-smi"); err == nil && werr == nil {
		werr = put("nvidia-smi.txt", []byte(out))
	}
	if err := z.Close(); werr == nil {
		werr = err
	}
	if err := f.Close(); werr == nil {
		werr = err
	}
	if werr != nil {
		_ = os.Remove(part)
		return "", werr
	}
	if err := os.Rename(part, name); err != nil {
		return "", err
	}
	s.say("tester's report: %s", name)
	return name, nil
}

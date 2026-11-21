// fakepy stands in for the Studio's Python where there is none (the launcher's self-test under Wine, a Windows builder without the
// Studio's packages): «fakepy …\lab\lab.py» serves the lab's /health on LAB_PORT; «fakepy …\launcher\start.py» prints start.py's
// lines, starts a child of itself (yue-server under start.py) whose pid goes to child.pid in the Studio's folder, and serves the
// engine's /health on YUE2CPP_PORT; «fakepy --sleep» only sleeps; «fakepy --version» answers as Python does.
package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func port(env string, def int) int {
	if n, err := strconv.Atoi(os.Getenv(env)); err == nil {
		return n
	}
	return def
}

func main() {
	if len(os.Args) < 2 {
		os.Exit(2)
	}
	switch os.Args[1] {
	case "--version":
		fmt.Println("Python 3.12.10 (fakepy)")
		return
	case "--sleep":
		time.Sleep(10 * time.Minute)
		return
	}
	script := strings.ReplaceAll(os.Args[1], `\`, "/")
	root := filepath.Dir(filepath.Dir(os.Args[1]))
	p := port("LAB_PORT", 41870)
	if filepath.Base(script) == "start.py" {
		p = port("YUE2CPP_PORT", 7777)
		fmt.Printf("Ruach Studio 2.1.0 · RuachStudio  http://127.0.0.1:%d\n  engine       engine\\cpu · up to 2 songs per pass\n", p)
		c := exec.Command(os.Args[0], "--sleep")
		if err := c.Start(); err == nil {
			_ = os.WriteFile(filepath.Join(root, "child.pid"), []byte(strconv.Itoa(c.Process.Pid)), 0o644)
		}
	} else {
		fmt.Printf("lab: listening on %d · PYTHONUTF8 %s\n", p, os.Getenv("PYTHONUTF8"))
	}
	http.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, `{"status":"ok"}`) })
	fmt.Fprintln(os.Stderr, http.ListenAndServe(fmt.Sprintf("127.0.0.1:%d", p), nil))
	os.Exit(1)
}

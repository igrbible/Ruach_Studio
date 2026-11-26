//go:build !windows

package tray

// Off Windows there is no tray: the launcher runs in console mode (main.go), and Run only starts Ready.
type Menu struct {
	Icon                                            []byte
	Ready                                           func()
	Open, Logs, Report, Update, Restart, Stop, Quit func()
	LogsTip                                         string
}

func Run(m Menu) {
	if m.Ready != nil {
		m.Ready()
	}
}

func Status(string) {}

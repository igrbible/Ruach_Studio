//go:build windows

// Package tray is the launcher's place in the notification area (fyne.io/systray: pure Go on Windows, no cgo).
package tray

import "fyne.io/systray"

// Menu: what each item does; Ready runs once the icon is up (the start of the Studio). An item without its func is not shown.
// No Uninstall: the native Studio is one folder, removed by deleting it (the WSL package's Uninstall went out with it, HERESY 2990).
type Menu struct {
	Icon                                            []byte
	Ready                                           func()
	Open, Logs, Report, Update, Restart, Stop, Quit func()
	LogsTip                                         string
}

// Run holds the calling goroutine (the main one) until Quit.
func Run(m Menu) {
	systray.Run(func() {
		systray.SetIcon(m.Icon)
		systray.SetTitle("Ruach Studio")
		systray.SetTooltip("Ruach Studio: starting")
		item := func(f func(), title, tip string) {
			if f == nil {
				return
			}
			it := systray.AddMenuItem(title, tip)
			go func() {
				for range it.ClickedCh {
					go f()
				}
			}()
		}
		item(m.Open, "Open Ruach Studio", "the page, in its own window")
		systray.AddSeparator()
		item(m.Logs, "Logs", m.LogsTip)
		item(m.Report, "Tester's report…", "the logs and this computer's card, memory and Windows in one .zip on the Desktop; nothing is sent")
		item(m.Update, "Check for updates", "")
		item(m.Restart, "Restart the Studio", "the lab and the engine ended and started again")
		item(m.Stop, "Stop the Studio", "Open starts it again")
		systray.AddSeparator()
		quit := systray.AddMenuItem("Quit", "")
		go func() {
			<-quit.ClickedCh
			m.Quit()
			systray.Quit()
		}()
		if m.Ready != nil {
			go m.Ready()
		}
	}, func() {})
}

// Status shows s in the icon's tooltip (Windows keeps 127 characters of it).
func Status(s string) {
	s = "Ruach Studio: " + s
	if r := []rune(s); len(r) > 127 {
		s = string(r[:126]) + "…"
	}
	systray.SetTooltip(s)
}

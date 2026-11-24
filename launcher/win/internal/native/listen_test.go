package native

import (
	"strings"
	"testing"
)

// HERESY 2936 (Viktor 21.11.2026: «Для Windows по умолчанию только этот компьютер… Тогда запроса нет»): the launcher names no address
// to listen on (launcher/start.py chooses this computer alone from user/access.json, the lab listens on 127.0.0.1 by itself) and asks and
// opens the Studio on 127.0.0.1 only, so nothing the launcher does makes Windows' firewall ask.
func TestStudioOnThisComputer(t *testing.T) {
	s := studio(t, newFake(), &fakeUI{}, false)
	if !strings.HasPrefix(s.Cfg.URL(), "http://127.0.0.1:") || !strings.HasPrefix(s.Cfg.LabURL(), "http://127.0.0.1:") {
		t.Fatalf("the page and the lab asked at %s and %s", s.Cfg.URL(), s.Cfg.LabURL())
	}
	for _, v := range s.Services() {
		if !strings.HasPrefix(v.Health, "http://127.0.0.1:") {
			t.Fatalf("%s's health asked at %s", v.Spec.Name, v.Health)
		}
		for _, e := range v.Spec.Env {
			if strings.HasPrefix(e, "YUE2CPP_HOST=") || strings.HasPrefix(e, "LAB_HOST=") || strings.Contains(e, "0.0.0.0") {
				t.Fatalf("%s started with %q: the launcher names no address to listen on", v.Spec.Name, e)
			}
		}
	}
}

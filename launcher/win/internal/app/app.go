// Package app is what the launcher's native path shares beyond internal/native, free of Windows: how the launcher speaks (UI),
// a question answered no, and the release tags its «Check for updates» compares. Windows itself (message boxes, the tray) comes
// in through UI. Its WSL decision path went out with the WSL package (HERESY 2990, the launcher's part): the native zip is the
// Windows port.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// UI is how the launcher speaks: a status line (the tray's tooltip), a notice, a yes/no question, an error.
type UI interface {
	Status(msg string)
	Info(title, msg string)
	Ask(title, msg string) bool
	Error(title, msg string)
}

// ErrDeclined: the person answered no to a question that had to be yes; nothing more is said.
var ErrDeclined = errors.New("declined")

// Getter fetches url and returns its status and body (main.go's httpGet; a stand-in in tests).
type Getter func(ctx context.Context, url string) (status int, body []byte, err error)

// releaseTag: the tags the Studio's own updater takes, X.Y.Z and X.Y.Z-rcN (lab/updates.py)
var releaseTag = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$`)

// tagKey orders release tags: 2.0.6 > 2.0.6-rc9 > 2.0.5; ok is false for any other tag.
func tagKey(tag string) (k [4]int, ok bool) {
	m := releaseTag.FindStringSubmatch(strings.TrimSpace(tag))
	if m == nil {
		return k, false
	}
	for i := 0; i < 3; i++ {
		fmt.Sscan(m[i+1], &k[i])
	}
	k[3] = 1 << 30 // a final outranks its candidates
	if m[4] != "" {
		fmt.Sscan(m[4], &k[3])
	}
	return k, true
}

// Newer: is tag a later release than have?
func Newer(tag, have string) bool {
	a, ok1 := tagKey(tag)
	b, ok2 := tagKey(have)
	if !ok1 || !ok2 {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

// LatestRelease reads GitHub's releases of repo and returns the newest final tag and its page.
func LatestRelease(ctx context.Context, get Getter, repo string) (tag, page string, err error) {
	code, body, err := get(ctx, "https://api.github.com/repos/"+repo+"/releases?per_page=20")
	if err != nil {
		return "", "", err
	}
	if code != 200 {
		return "", "", fmt.Errorf("GitHub answered %d", code)
	}
	var rels []struct {
		Tag        string `json:"tag_name"`
		URL        string `json:"html_url"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.Unmarshal(body, &rels); err != nil {
		return "", "", err
	}
	for _, r := range rels {
		if r.Draft || r.Prerelease {
			continue
		}
		if _, ok := tagKey(r.Tag); ok && (tag == "" || Newer(r.Tag, tag)) {
			tag, page = r.Tag, r.URL
		}
	}
	if tag == "" {
		return "", "", errors.New("no release found")
	}
	return tag, page, nil
}

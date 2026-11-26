package app

import (
	"context"
	"errors"
	"testing"
)

func TestNewerAndLatest(t *testing.T) {
	cases := []struct {
		tag, have string
		want      bool
	}{{"2.0.7", "2.0.6", true}, {"v2.1.0", "2.0.9", true}, {"2.0.6", "2.0.6-rc9", true}, {"2.0.6-rc9", "2.0.6", false},
		{"2.0.6", "2.0.6", false}, {"nightly", "2.0.6", false}, {"2.0.5", "2.0.6", false}}
	for _, c := range cases {
		if got := Newer(c.tag, c.have); got != c.want {
			t.Errorf("Newer(%s, %s) = %v", c.tag, c.have, got)
		}
	}
	get := func(ctx context.Context, url string) (int, []byte, error) {
		return 200, []byte(`[{"tag_name":"2.0.8-rc1","prerelease":true,"html_url":"p1"},{"tag_name":"2.0.7","html_url":"p2"},{"tag_name":"2.0.6","html_url":"p3"}]`), nil
	}
	tag, page, err := LatestRelease(context.Background(), get, "igrbible/Ruach_Studio")
	if err != nil || tag != "2.0.7" || page != "p2" {
		t.Fatal(tag, page, err)
	}
}

// TestLatestReleaseSaysWhy: GitHub's refusal, a draft-only list and a dead network each come back as an error, never as a tag.
func TestLatestReleaseSaysWhy(t *testing.T) {
	for name, get := range map[string]Getter{
		"403": func(context.Context, string) (int, []byte, error) { return 403, nil, nil },
		"drafts": func(context.Context, string) (int, []byte, error) {
			return 200, []byte(`[{"tag_name":"2.1.0","draft":true}]`), nil
		},
		"network": func(context.Context, string) (int, []byte, error) { return 0, nil, errors.New("no route") },
	} {
		if tag, _, err := LatestRelease(context.Background(), get, "igrbible/Ruach_Studio"); err == nil || tag != "" {
			t.Errorf("%s: tag %q, err %v", name, tag, err)
		}
	}
}

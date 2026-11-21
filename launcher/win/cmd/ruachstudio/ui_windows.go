//go:build windows

package main

import (
	"github.com/igrbible/ruach-launcher/internal/app"
	"github.com/igrbible/ruach-launcher/internal/tray"
	"github.com/igrbible/ruach-launcher/internal/winos"
)

func newBoxUI() app.UI { return winos.BoxUI{OnStatus: tray.Status} }

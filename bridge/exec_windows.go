//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// على ويندوز: البرنامجُ بلا نافذة طرفية (windowsgui)، فأيُّ أداةِ سطر أوامر نشغّلها (schtasks · netsh) تفتح نافذةً
// سوداء تومض لحظةً — نُخفيها (v1.1.1، بلاغُ المالك بفيديو 18/10).
func hideConsole(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }

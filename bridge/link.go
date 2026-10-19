package main

// v1.3.0 — two clicks instead of six (owner's request, 19/10/2026):
//   • one file: SyDentBridge.exe run from Downloads installs itself to %LOCALAPPDATA%\SyDent Bridge,
//     registers the logon task, starts the installed copy and exits (an older running copy is asked to quit first).
//   • no pairing code to type: the SyDent settings page, opened by the user on the same computer, asks this
//     program for its state and hands it a fresh one-time pairing code itself.
// The /link/* endpoints are the only ones a web page may call, and only from SyDent's own origins. They stay
// bound to 127.0.0.1 with the Host check (DNS rebinding), they expose the state and pairing only, and pairing
// is refused while the program is already paired (a page cannot move a paired computer to another clinic).

import (
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const SiteURL = "https://www.sydent.app"

var linkOrigins = map[string]bool{"https://www.sydent.app": true, "https://sydent.app": true}

func (b *Bridge) linkRoutes(mux *http.ServeMux) {
	guard := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			o := r.Header.Get("Origin")
			if !linkOrigins[o] {
				http.Error(w, "forbidden", 403)
				return
			}
			host, _, _ := net.SplitHostPort(r.RemoteAddr)
			if host != "127.0.0.1" && host != "::1" {
				http.Error(w, "forbidden", 403)
				return
			}
			if hh := strings.ToLower(r.Host); hh != "127.0.0.1:"+UIPort && hh != "localhost:"+UIPort {
				http.Error(w, "forbidden", 403)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Cache-Control", "no-store")
			if r.Method == "OPTIONS" { // preflight, incl. Chrome's Private Network Access
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(204)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("/link/state", guard(func(w http.ResponseWriter, r *http.Request) {
		b.mu.Lock()
		st := map[string]any{"version": Version, "paired": b.cfg.DeviceID != "", "device_name": b.cfg.DeviceName}
		b.mu.Unlock()
		writeJSON(w, st)
	}))
	mux.HandleFunc("/link/pair", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		b.mu.Lock()
		paired := b.cfg.DeviceID != ""
		b.mu.Unlock()
		if paired {
			writeJSON(w, map[string]any{"ok": false, "error": "already_paired"})
			return
		}
		var in struct{ Code string }
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&in)
		if err := b.pair(in.Code); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	}))
}

func installDir() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return ""
	}
	return filepath.Join(base, "SyDent Bridge")
}

// selfInstall copies the running exe into installDir and starts that copy. It reports true when this process
// should exit (the installed copy takes over).
func selfInstall() bool {
	dest := installDir()
	if dest == "" {
		return false
	}
	me, err := os.Executable()
	if err != nil {
		return false
	}
	if real, err := filepath.EvalSymlinks(me); err == nil {
		me = real
	}
	if strings.EqualFold(filepath.Clean(filepath.Dir(me)), filepath.Clean(dest)) {
		return false
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		log.Println("install:", err)
		return false
	}
	target := filepath.Join(dest, "SyDentBridge.exe")
	quitRunning()
	if err := copyFile(me, target); err != nil {
		log.Println("install copy:", err)
		return false
	}
	if err := setAutostartPath(true, target); err != nil {
		log.Println("install autostart:", err)
	}
	c := exec.Command(target)
	c.Dir = dest
	if err := c.Start(); err != nil {
		log.Println("install start:", err)
		return false
	}
	return true
}

// quitRunning asks an already running copy (an update) to exit and waits for the port to free.
func quitRunning() {
	cl := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("POST", "http://127.0.0.1:"+UIPort+"/api/quit", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	if resp, err := cl.Do(req); err == nil {
		resp.Body.Close()
	} else {
		return
	}
	for i := 0; i < 50; i++ {
		ln, err := net.Listen("tcp", "127.0.0.1:"+UIPort)
		if err == nil {
			ln.Close()
			time.Sleep(300 * time.Millisecond) // the exe handle closes just after the socket
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

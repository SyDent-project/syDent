// SyDent Bridge — جسرُ الأجهزة (ربط الأجهزة ٣ · v644)
//
// برنامجٌ صغير يعمل بالخلفية على كمبيوتر العيادة الموصول بحساس الأشعة أو جهاز البانوراما:
//   - يقترن مرةً برمزٍ من إعدادات SyDent (8 أحرف · 10 دقائق) ويحتفظ بمفتاح الجهاز محلياً (الخادمُ لا يخزّن إلا تجزئته).
//   - يسحب كلَّ 3 ثوانٍ طلباتِ الالتقاط المفتوحة لعيادته (المريض · الأسنان · النوع).
//   - يراقب مجلداتِ حفظ برنامج الجهاز: كلُّ صورةٍ جديدة (jpg/png/webp/dcm) تستقرّ على القرص تُرفع إلى SyDent —
//     إلى المريض صاحب أقدم طلبٍ مفتوح، وإلا إلى «وارد الأجهزة» بالمنصة ليوزّعها الطبيب.
//   - واجهتُه المحلية http://127.0.0.1:4816 (عربية): الحالة · الاقتران · المجلدات · السجل · التشغيل مع ويندوز.
//
// مكتبةُ Go القياسية وحدها — لا تبعيات. المراقبةُ بالاستطلاع (كل ثانيتين) لا بأحداث النظام: أبسطُ وأثبت مع برامج
// الأجهزة التي تكتب الملفَّ على دفعات (نرفع بعد أن يستقرّ حجمُه عبر مسحين متتاليين).
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	Version     = "1.3.0"
	UIPort      = "4816"
	DefaultAPI  = "https://nxkalpjrqvpglphmiuui.supabase.co/functions/v1/bridge"
	PollEvery   = 3 * time.Second
	ScanEvery   = 2 * time.Second
	MaxBytes    = 31457280
	UploadTries = 4
)

var mimeByExt = map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".dcm": "application/dicom", ".dicom": "application/dicom"}

// ── الإعدادات والحالة ──────────────────────────────────────────────
type Config struct {
	API        string   `json:"api"`
	DeviceID   string   `json:"device_id"`
	Key        string   `json:"key"`
	DeviceName string   `json:"device_name"`
	WatchDirs  []string `json:"watch_dirs"`
	MoveDone   bool     `json:"move_done"` // نقلُ الملف المرفوع إلى مجلدٍ فرعي _sydent-uploaded
	PairedAt   string   `json:"paired_at"`
	// v1.1.0: مستقبِلُ DICOM للبانوراما/CBCT عبر الشبكة
	DicomEnabled bool   `json:"dicom_enabled"`
	DicomPort    int    `json:"dicom_port"`
	DicomAE      string `json:"dicom_ae"`
	// v1.2.0: TWAIN — الحساسُ مباشرةً عبر تعريفه
	TwainSource  string `json:"twain_source"`   // اسمُ منتج TWAIN المختار
	TwainShowUI  bool   `json:"twain_show_ui"`  // إظهارُ واجهة التعريف
	TwainAuto    bool   `json:"twain_auto"`     // تسليحُ الحساس تلقائياً عند طلبٍ من SyDent
	TwainWaitSec int    `json:"twain_wait_sec"` // مهلةُ انتظار التصوير (ثوانٍ)
}

type Request struct {
	ID          string   `json:"id"`
	PatientID   string   `json:"patient_id"`
	PatientName string   `json:"patient_name"`
	Teeth       []string `json:"teeth"`
	Category    string   `json:"category"`
	XrayType    string   `json:"xray_type"`
	ExpiresAt   string   `json:"expires_at"`
}

type LogItem struct {
	At   string `json:"at"`
	Kind string `json:"kind"` // ok · warn · err · info
	Text string `json:"text"`
}

type Bridge struct {
	mu        sync.Mutex
	cfg       Config
	dir       string // مجلدُ الإعدادات
	requests  []Request
	polledAt  time.Time
	lastErr   string
	logs      []LogItem
	seen      map[string]fileSig // مسارٌ ⇒ بصمةُ آخر مسح (حجم + وقت) لمعرفة الاستقرار
	processed map[string]string  // مسارٌ ⇒ بصمةٌ رُفعت (لا تُرفع مرتين)
	client    *http.Client
	paused    bool
	dcm       *dicomServer // v1.1.0
	dcmMu     sync.Mutex
	tw        *twainState // v1.2.0
}

type fileSig struct {
	Size  int64
	Mod   int64
	Seen  int // عددُ المسحات التي بقي فيها الحجمُ ثابتاً
	First time.Time
}

func main() {
	b := &Bridge{seen: map[string]fileSig{}, processed: map[string]string{}, client: &http.Client{Timeout: 60 * time.Second}}
	b.dir = configDir()
	_ = os.MkdirAll(b.dir, 0o700)
	lf, err := os.OpenFile(filepath.Join(b.dir, "bridge.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err == nil {
		log.SetOutput(io.MultiWriter(os.Stderr, lf))
	}
	b.load()
	b.loadProcessed()
	if b.cfg.API == "" {
		b.cfg.API = DefaultAPI
	}
	if b.cfg.DeviceName == "" {
		h, _ := os.Hostname()
		b.cfg.DeviceName = h
	}
	b.info("تشغيل SyDent Bridge v" + Version)

	// v1.3.0: run from anywhere (Downloads) ⇒ install into %LOCALAPPDATA% and hand over to the installed copy
	if selfInstall() {
		b.info("ثُبّت البرنامج في " + installDir())
		return
	}

	ln, err := net.Listen("tcp", "127.0.0.1:"+UIPort)
	if err != nil {
		// نسخةٌ أخرى تعمل: نفتح واجهتها ونخرج
		openBrowser("http://127.0.0.1:" + UIPort + "/")
		return
	}
	if b.cfg.DicomPort == 0 {
		b.cfg.DicomPort = dcmDefaultPort
	}
	if b.cfg.DicomAE == "" {
		b.cfg.DicomAE = dcmDefaultAE
	}
	b.dicomApply()
	b.twainStart()
	go b.pollLoop()
	go b.scanLoop()
	if b.cfg.DeviceID == "" {
		// v1.3.0: SyDent's settings page pairs this computer by itself (no code to type)
		openBrowser(SiteURL + "/settings.html#bridge-link")
	}
	srv := &http.Server{Handler: b.routes(), ReadHeaderTimeout: 5 * time.Second}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func configDir() string {
	if runtime.GOOS == "windows" {
		if a := os.Getenv("APPDATA"); a != "" {
			return filepath.Join(a, "SyDent Bridge")
		}
	}
	if d := os.Getenv("SYDENT_BRIDGE_DIR"); d != "" {
		return d
	}
	h, _ := os.UserHomeDir()
	return filepath.Join(h, ".sydent-bridge")
}

func (b *Bridge) load() {
	data, err := os.ReadFile(filepath.Join(b.dir, "config.json"))
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &b.cfg)
}
func (b *Bridge) save() {
	data, _ := json.MarshalIndent(b.cfg, "", "  ")
	_ = os.WriteFile(filepath.Join(b.dir, "config.json"), data, 0o600)
}
func (b *Bridge) loadProcessed() {
	data, err := os.ReadFile(filepath.Join(b.dir, "processed.json"))
	if err == nil {
		_ = json.Unmarshal(data, &b.processed)
	}
}
func (b *Bridge) saveProcessed() {
	// نحتفظ بآخر 5000 فقط
	if len(b.processed) > 5000 {
		keys := make([]string, 0, len(b.processed))
		for k := range b.processed {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys[:len(keys)-4000] {
			delete(b.processed, k)
		}
	}
	data, _ := json.Marshal(b.processed)
	_ = os.WriteFile(filepath.Join(b.dir, "processed.json"), data, 0o600)
}

func (b *Bridge) addLog(kind, text string) {
	b.logs = append([]LogItem{{At: time.Now().Format("15:04:05"), Kind: kind, Text: text}}, b.logs...)
	if len(b.logs) > 200 {
		b.logs = b.logs[:200]
	}
	log.Println(kind + ": " + text)
}
func (b *Bridge) info(t string) { b.mu.Lock(); b.addLog("info", t); b.mu.Unlock() }
func (b *Bridge) warn(t string) { b.mu.Lock(); b.addLog("warn", t); b.mu.Unlock() }

// ── الخادم ───────────────────────────────────────────────────────
func (b *Bridge) call(action string, body map[string]any) (map[string]any, error) {
	b.mu.Lock()
	api, id, key := b.cfg.API, b.cfg.DeviceID, b.cfg.Key
	b.mu.Unlock()
	body["action"] = action
	body["version"] = Version
	if action != "pair" {
		body["device_id"] = id
		body["key"] = key
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", api, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "SyDentBridge/"+Version)
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("ردٌّ غير مفهوم من الخادم (%d)", resp.StatusCode)
	}
	if resp.StatusCode == 401 {
		return out, errUnauthorized
	}
	return out, nil
}

var errUnauthorized = errors.New("unauthorized")

func (b *Bridge) pair(code string) error {
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, code)
	out, err := b.call("pair", map[string]any{"code": strings.ToUpper(clean), "mode": "folder"})
	if err != nil {
		return err
	}
	if ok, _ := out["ok"].(bool); !ok {
		switch out["reason"] {
		case "subscription":
			return errors.New("اشتراكُ العيادة للقراءة فقط — جدّده ثم أعد الاقتران")
		default:
			return errors.New("الرمز غير صحيح أو انتهت صلاحيته (10 دقائق) — اطلب رمزاً جديداً من الإعدادات")
		}
	}
	b.mu.Lock()
	b.cfg.DeviceID, _ = out["device_id"].(string)
	b.cfg.Key, _ = out["key"].(string)
	if n, _ := out["device_name"].(string); n != "" {
		b.cfg.DeviceName = n
	}
	b.cfg.PairedAt = time.Now().Format(time.RFC3339)
	b.save()
	b.addLog("ok", "تمّ الاقتران: "+b.cfg.DeviceName)
	b.mu.Unlock()
	return nil
}

func (b *Bridge) pollLoop() {
	for {
		b.mu.Lock()
		paired := b.cfg.DeviceID != "" && b.cfg.Key != ""
		b.mu.Unlock()
		if paired {
			b.pollOnce()
		}
		time.Sleep(PollEvery)
	}
}
func (b *Bridge) pollOnce() {
	out, err := b.call("poll", map[string]any{})
	b.mu.Lock()
	defer b.mu.Unlock()
	if err != nil {
		if errors.Is(err, errUnauthorized) {
			if b.lastErr != "unauthorized" {
				b.addLog("err", "رُفض مفتاحُ الجهاز — أُوقف من الإعدادات؟ اقرن من جديد برمزٍ جديد")
			}
			b.lastErr = "unauthorized"
			b.cfg.DeviceID, b.cfg.Key = "", ""
			b.save()
			return
		}
		if b.lastErr == "" {
			b.addLog("warn", "تعذّر الاتصال بالخادم — سنعيد المحاولة")
		}
		b.lastErr = err.Error()
		return
	}
	if b.lastErr != "" {
		b.addLog("ok", "عاد الاتصال بالخادم")
		b.lastErr = ""
	}
	b.polledAt = time.Now()
	b.requests = nil
	if arr, ok := out["requests"].([]any); ok {
		for _, it := range arr {
			j, _ := json.Marshal(it)
			var r Request
			if json.Unmarshal(j, &r) == nil {
				b.requests = append(b.requests, r)
			}
		}
	}
	reqs := append([]Request(nil), b.requests...)
	b.mu.Unlock()
	b.twainOnRequests(reqs) // v1.2.0: طلبٌ جديد ⇒ تسليحُ الحساس (إن كان التلقائيُّ مفعّلاً)
	b.mu.Lock()
}

// أقدمُ طلبٍ مفتوح (الخادمُ يرتّبها بالأقدم) إن كان الاستطلاعُ حديثاً
func (b *Bridge) currentRequest() *Request {
	if time.Since(b.polledAt) > 30*time.Second || len(b.requests) == 0 {
		return nil
	}
	r := b.requests[0]
	return &r
}

// ── مراقبةُ المجلدات ─────────────────────────────────────────────
func (b *Bridge) scanLoop() {
	first := true
	for {
		b.mu.Lock()
		dirs := append([]string(nil), b.cfg.WatchDirs...)
		paused := b.paused
		paired := b.cfg.DeviceID != ""
		b.mu.Unlock()
		for _, d := range dirs {
			b.scanDir(d, first)
		}
		first = false
		if paired && !paused {
			b.uploadReady()
		}
		time.Sleep(ScanEvery)
	}
}

func sigOf(fi os.FileInfo) string { return fmt.Sprintf("%d:%d", fi.Size(), fi.ModTime().Unix()) }

func (b *Bridge) scanDir(dir string, first bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if _, ok := mimeByExt[ext]; !ok {
			continue
		}
		fi, err := e.Info()
		if err != nil || fi.Size() == 0 {
			continue
		}
		p := filepath.Join(dir, e.Name())
		sig := sigOf(fi)
		if b.processed[p] == sig {
			continue
		}
		if first {
			// ما كان موجوداً عند التشغيل لا يُرفع — نسجّله كمعالَج (الطبيبُ يرفع القديمَ يدوياً إن أراد)
			b.processed[p] = sig
			continue
		}
		prev, ok := b.seen[p]
		if !ok {
			b.seen[p] = fileSig{Size: fi.Size(), Mod: fi.ModTime().Unix(), Seen: 0, First: time.Now()}
			continue
		}
		if prev.Size == fi.Size() && prev.Mod == fi.ModTime().Unix() {
			prev.Seen++
		} else {
			prev.Size, prev.Mod, prev.Seen = fi.Size(), fi.ModTime().Unix(), 0
		}
		b.seen[p] = prev
	}
	if first {
		b.saveProcessed()
	}
}

// ملفٌّ استقرّ (حجمٌ ثابت عبر مسحين وعمرُه ≥ ثانيتان) ⇒ يُرفع
func (b *Bridge) uploadReady() {
	b.mu.Lock()
	var ready []string
	for p, s := range b.seen {
		if s.Seen >= 2 && time.Since(s.First) >= 2*time.Second {
			ready = append(ready, p)
		}
	}
	sort.Strings(ready)
	b.mu.Unlock()
	for _, p := range ready {
		b.uploadFile(p)
	}
}

func (b *Bridge) uploadFile(p string) {
	fi, err := os.Stat(p)
	if err != nil {
		b.mu.Lock()
		delete(b.seen, p)
		b.mu.Unlock()
		return
	}
	sig := sigOf(fi)
	mime := mimeByExt[strings.ToLower(filepath.Ext(p))]
	if fi.Size() > MaxBytes {
		b.mu.Lock()
		b.addLog("err", "تخطّى الملفُّ 30 ميغابايت ولم يُرفع: "+filepath.Base(p))
		b.processed[p] = sig
		delete(b.seen, p)
		b.saveProcessed()
		b.mu.Unlock()
		return
	}
	// الملفُ قد يكون مقفولاً لحظةَ الكتابة ⇒ نحاول لاحقاً
	data, err := os.ReadFile(p)
	if err != nil {
		return
	}
	if mime == "application/dicom" && !(len(data) > 132 && string(data[128:132]) == "DICM") {
		b.mu.Lock()
		b.addLog("warn", "ملفٌّ بامتداد .dcm لكنه ليس DICOM صالحاً — تُرك: "+filepath.Base(p))
		b.processed[p] = sig
		delete(b.seen, p)
		b.saveProcessed()
		b.mu.Unlock()
		return
	}
	b.mu.Lock()
	req := b.currentRequest()
	b.mu.Unlock()

	body := map[string]any{"mime": mime, "name": filepath.Base(p), "size": fi.Size()}
	if req != nil {
		body["request_id"] = req.ID
	}
	var lastErr error
	for attempt := 1; attempt <= UploadTries; attempt++ {
		lastErr = b.uploadOnce(p, data, mime, body, req)
		if lastErr == nil {
			break
		}
		if isFinal(lastErr) {
			break
		}
		time.Sleep(time.Duration(attempt*attempt) * time.Second)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if lastErr != nil {
		b.addLog("err", "لم تُرفع "+filepath.Base(p)+": "+lastErr.Error())
		if isFinal(lastErr) {
			b.processed[p] = sig
			delete(b.seen, p)
			b.saveProcessed()
		}
		return
	}
	b.processed[p] = sig
	delete(b.seen, p)
	b.saveProcessed()
	if b.cfg.MoveDone {
		dst := filepath.Join(filepath.Dir(p), "_sydent-uploaded")
		_ = os.MkdirAll(dst, 0o755)
		_ = os.Rename(p, filepath.Join(dst, filepath.Base(p)))
	}
}

type finalErr struct{ msg string }

func (e finalErr) Error() string { return e.msg }
func isFinal(err error) bool     { var f finalErr; return errors.As(err, &f) }
func reasonText(reason any) string {
	switch reason {
	case "quota":
		return "امتلأت مساحةُ تخزين العيادة — احذف ملفات أو رقِّ الخطة"
	case "subscription":
		return "اشتراكُ العيادة للقراءة فقط"
	case "type":
		return "صيغةُ الملف غير مدعومة"
	case "size":
		return "الملفُّ أكبر من 30 ميغابايت"
	case "path":
		return "رفض الخادمُ مسارَ الملف"
	}
	return "رفضها الخادم"
}

func (b *Bridge) uploadOnce(p string, data []byte, mime string, body map[string]any, req *Request) error {
	out, err := b.call("upload", cloneMap(body))
	if err != nil {
		if errors.Is(err, errUnauthorized) {
			return finalErr{"رُفض مفتاحُ الجهاز — اقرن من جديد"}
		}
		return err
	}
	if ok, _ := out["ok"].(bool); !ok {
		return finalErr{reasonText(out["reason"])}
	}
	url, _ := out["url"].(string)
	path, _ := out["path"].(string)
	reqID, _ := out["request_id"].(string)
	if url == "" || path == "" {
		return errors.New("ردٌّ ناقص من الخادم")
	}
	put, err := http.NewRequest("PUT", url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	put.Header.Set("Content-Type", mime)
	put.Header.Set("x-upsert", "false")
	resp, err := b.client.Do(put)
	if err != nil {
		return err
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("رفعُ الملف فشل (%d)", resp.StatusCode)
	}
	done := map[string]any{"path": path, "name": filepath.Base(p), "mime": mime, "size": len(data)}
	if reqID != "" {
		done["request_id"] = reqID
	}
	out2, err := b.call("complete", done)
	if err != nil {
		return err
	}
	if ok, _ := out2["ok"].(bool); !ok {
		return finalErr{reasonText(out2["reason"])}
	}
	b.mu.Lock()
	if reqID != "" && req != nil {
		b.addLog("ok", "رُفعت "+filepath.Base(p)+" → "+req.PatientName+describeReq(req))
		// أزل الطلبَ المنجَز محلياً كي لا تذهب الصورةُ التالية إليه قبل الاستطلاع التالي
		var rest []Request
		for _, r := range b.requests {
			if r.ID != reqID {
				rest = append(rest, r)
			}
		}
		b.requests = rest
	} else {
		b.addLog("ok", "رُفعت "+filepath.Base(p)+" → وارد الأجهزة (بلا طلبٍ مفتوح)")
	}
	b.mu.Unlock()
	return nil
}

func describeReq(r *Request) string {
	s := ""
	if len(r.Teeth) > 0 {
		s += " · السن " + strings.Join(r.Teeth, "،")
	}
	return s
}
func cloneMap(m map[string]any) map[string]any {
	c := map[string]any{}
	for k, v := range m {
		c[k] = v
	}
	return c
}

// ── التشغيلُ مع ويندوز والمتصفح ─────────────────────────────────
func exePath() string { p, _ := os.Executable(); return p }

// حالةُ التشغيل التلقائي تُسأل من ويندوز مرةً كل دقيقة لا مع كل تحديثٍ للصفحة (v1.1.1)
var autoMu sync.Mutex
var autoVal bool
var autoAt time.Time

func autostartEnabled() bool {
	if runtime.GOOS != "windows" {
		return false
	}
	autoMu.Lock()
	defer autoMu.Unlock()
	if time.Since(autoAt) < time.Minute {
		return autoVal
	}
	c := exec.Command("schtasks", "/Query", "/TN", "SyDentBridge")
	hideConsole(c)
	out, err := c.CombinedOutput()
	autoVal = err == nil && len(out) > 0
	autoAt = time.Now()
	return autoVal
}
func setAutostart(on bool) error { return setAutostartPath(on, exePath()) }
func setAutostartPath(on bool, path string) error {
	if runtime.GOOS != "windows" {
		return errors.New("التشغيلُ التلقائي خاصٌّ بويندوز")
	}
	var c *exec.Cmd
	if on {
		c = exec.Command("schtasks", "/Create", "/F", "/TN", "SyDentBridge", "/SC", "ONLOGON", "/RL", "LIMITED", "/TR", `"`+path+`"`)
	} else {
		c = exec.Command("schtasks", "/Delete", "/F", "/TN", "SyDentBridge")
	}
	hideConsole(c)
	err := c.Run()
	autoMu.Lock()
	autoAt = time.Time{}
	autoMu.Unlock()
	return err
}
func openBrowser(u string) {
	switch runtime.GOOS {
	case "windows":
		c := exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
		hideConsole(c)
		_ = c.Start()
	case "darwin":
		_ = exec.Command("open", u).Start()
	default:
		_ = exec.Command("xdg-open", u).Start()
	}
}

// مجلداتٌ مرشّحة: مجلداتُ المستخدم المعتادة وما يحوي صوراً حديثة بمستوىً واحد
func suggestDirs() []string {
	h, _ := os.UserHomeDir()
	roots := []string{filepath.Join(h, "Pictures"), filepath.Join(h, "Documents"), filepath.Join(h, "Desktop"), filepath.Join(h, "Downloads")}
	if runtime.GOOS == "windows" {
		roots = append(roots, `C:\ProgramData`, `C:\`, `D:\`)
	}
	cut := time.Now().Add(-45 * 24 * time.Hour)
	seen := map[string]bool{}
	var out []string
	consider := func(dir string) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		n := 0
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if _, ok := mimeByExt[strings.ToLower(filepath.Ext(e.Name()))]; !ok {
				continue
			}
			if fi, err := e.Info(); err == nil && fi.ModTime().After(cut) {
				n++
			}
		}
		if n > 0 && !seen[dir] {
			seen[dir] = true
			out = append(out, dir)
		}
	}
	for _, r := range roots {
		consider(r)
		entries, err := os.ReadDir(r)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), "$") && !strings.EqualFold(e.Name(), "Windows") {
				consider(filepath.Join(r, e.Name()))
			}
		}
	}
	sort.Strings(out)
	if len(out) > 25 {
		out = out[:25]
	}
	return out
}

// ── الواجهةُ المحلية ─────────────────────────────────────────────
func (b *Bridge) routes() http.Handler {
	mux := http.NewServeMux()
	b.linkRoutes(mux) // v1.3.0: the only endpoints a web page (SyDent's own origin) may call
	guard := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// الواجهةُ محليةٌ فقط: لا طلباتٍ من صفحاتٍ أخرى (Origin) ولا من غير 127.0.0.1
			if o := r.Header.Get("Origin"); o != "" && !strings.HasPrefix(o, "http://127.0.0.1:"+UIPort) && !strings.HasPrefix(o, "http://localhost:"+UIPort) {
				http.Error(w, "forbidden", 403)
				return
			}
			host, _, _ := net.SplitHostPort(r.RemoteAddr)
			if host != "127.0.0.1" && host != "::1" {
				http.Error(w, "forbidden", 403)
				return
			}
			// ضدّ DNS rebinding: اسمُ المضيف بالطلب يجب أن يكون المحليَّ نفسه (v1.0.1)
			if hh := strings.ToLower(r.Host); hh != "127.0.0.1:"+UIPort && hh != "localhost:"+UIPort && hh != "[::1]:"+UIPort {
				http.Error(w, "forbidden", 403)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			h(w, r)
		}
	}
	mux.HandleFunc("/", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, uiHTML)
	}))
	mux.HandleFunc("/api/state", guard(func(w http.ResponseWriter, r *http.Request) {
		b.mu.Lock()
		st := map[string]any{
			"version": Version, "paired": b.cfg.DeviceID != "", "device_name": b.cfg.DeviceName, "paired_at": b.cfg.PairedAt,
			"watch_dirs": b.cfg.WatchDirs, "move_done": b.cfg.MoveDone, "requests": b.requests, "polled_ago": func() int {
				if b.polledAt.IsZero() {
					return -1
				}
				return int(time.Since(b.polledAt).Seconds())
			}(),
			"last_err": b.lastErr, "logs": b.logs, "paused": b.paused, "autostart": autostartEnabled(), "config_dir": b.dir, "os": runtime.GOOS,
			"dicom": map[string]any{"enabled": b.cfg.DicomEnabled, "port": b.cfg.DicomPort, "ae": b.cfg.DicomAE, "dir": b.dicomInDir(), "ips": localIPs()},
			"twain": map[string]any{"source": b.cfg.TwainSource, "show_ui": b.cfg.TwainShowUI, "auto": b.cfg.TwainAuto, "wait_sec": b.cfg.TwainWaitSec, "dir": b.twainInDir(), "supported": runtime.GOOS == "windows"},
		}
		b.mu.Unlock()
		if b.tw != nil {
			b.tw.mu.Lock()
			tw := st["twain"].(map[string]any)
			tw["busy"] = b.tw.busy
			tw["sources"] = b.tw.sources
			tw["last_err"] = b.tw.lastErr
			tw["last_at"] = b.tw.lastAt
			tw["last_ok"] = b.tw.lastOK
			b.tw.mu.Unlock()
		}
		b.dcmMu.Lock()
		if b.dcm != nil {
			b.dcm.mu.Lock()
			st["dicom"].(map[string]any)["running"] = true
			st["dicom"].(map[string]any)["received"] = b.dcm.stats.Received
			st["dicom"].(map[string]any)["last_from"] = b.dcm.stats.LastFrom
			st["dicom"].(map[string]any)["last_at"] = b.dcm.stats.LastAt
			b.dcm.mu.Unlock()
		} else {
			st["dicom"].(map[string]any)["running"] = false
		}
		b.dcmMu.Unlock()
		writeJSON(w, st)
	}))
	mux.HandleFunc("/api/pair", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var in struct{ Code, Name string }
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		if err := b.pair(in.Code); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/unpair", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		b.mu.Lock()
		b.cfg.DeviceID, b.cfg.Key, b.cfg.PairedAt = "", "", ""
		b.requests = nil
		b.save()
		b.addLog("info", "أُلغي الاقتران محلياً — أوقف الجهازَ أيضاً من إعدادات SyDent")
		b.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/dirs", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var in struct {
			Add, Remove string
			MoveDone    *bool `json:"move_done"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		b.mu.Lock()
		defer b.mu.Unlock()
		if in.Add != "" {
			p := filepath.Clean(strings.TrimSpace(in.Add))
			fi, err := os.Stat(p)
			if err != nil || !fi.IsDir() {
				writeJSON(w, map[string]any{"ok": false, "error": "المجلد غير موجود: " + p})
				return
			}
			dup := false
			for _, d := range b.cfg.WatchDirs {
				if strings.EqualFold(d, p) {
					dup = true
				}
			}
			if !dup {
				b.cfg.WatchDirs = append(b.cfg.WatchDirs, p)
				// ما بالمجلد الآن يُعدّ قديماً
				if entries, err := os.ReadDir(p); err == nil {
					for _, e := range entries {
						if fi, err := e.Info(); err == nil && !e.IsDir() {
							b.processed[filepath.Join(p, e.Name())] = sigOf(fi)
						}
					}
					b.saveProcessed()
				}
				b.addLog("info", "تُراقَب الآن: "+p)
			}
		}
		if in.Remove != "" {
			var rest []string
			for _, d := range b.cfg.WatchDirs {
				if !strings.EqualFold(d, in.Remove) {
					rest = append(rest, d)
				}
			}
			b.cfg.WatchDirs = rest
			b.addLog("info", "لم يعد يُراقَب: "+in.Remove)
		}
		if in.MoveDone != nil {
			b.cfg.MoveDone = *in.MoveDone
		}
		b.save()
		writeJSON(w, map[string]any{"ok": true})
	}))
	mux.HandleFunc("/api/suggest", guard(func(w http.ResponseWriter, r *http.Request) { writeJSON(w, map[string]any{"dirs": suggestDirs()}) }))
	mux.HandleFunc("/api/pause", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		b.mu.Lock()
		b.paused = !b.paused
		if b.paused {
			b.addLog("info", "أُوقف الرفعُ مؤقتاً")
		} else {
			b.addLog("info", "استُؤنف الرفع")
		}
		p := b.paused
		b.mu.Unlock()
		writeJSON(w, map[string]any{"ok": true, "paused": p})
	}))
	mux.HandleFunc("/api/autostart", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var in struct{ On bool }
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		if err := setAutostart(in.On); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "autostart": autostartEnabled()})
	}))
	// v1.1.0: إعداداتُ مستقبِل DICOM (تفعيل · منفذ · AE) + قاعدةُ جدار ويندوز
	mux.HandleFunc("/api/dicom", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var in struct {
			Enabled  *bool  `json:"enabled"`
			Port     *int   `json:"port"`
			AE       string `json:"ae"`
			Firewall bool   `json:"firewall"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		b.mu.Lock()
		if in.Enabled != nil {
			b.cfg.DicomEnabled = *in.Enabled
		}
		if in.Port != nil && *in.Port > 0 && *in.Port <= 65535 {
			b.cfg.DicomPort = *in.Port
		}
		ae := strings.ToUpper(strings.TrimSpace(in.AE))
		if ae != "" && len(ae) <= 16 && strings.IndexFunc(ae, func(r rune) bool { return r > 126 || r < 32 || r == '\\' }) < 0 {
			b.cfg.DicomAE = ae
		}
		b.save()
		port := b.cfg.DicomPort
		b.mu.Unlock()
		b.dicomApply()
		fw := ""
		if in.Firewall && runtime.GOOS == "windows" {
			fc := exec.Command("netsh", "advfirewall", "firewall", "add", "rule", "name=SyDent Bridge DICOM", "dir=in", "action=allow", "protocol=TCP", fmt.Sprintf("localport=%d", port))
			hideConsole(fc)
			if err := fc.Run(); err != nil {
				fw = "تعذّرت إضافة قاعدة الجدار (يحتاج صلاحيات مسؤول) — أضفها يدوياً أو شغّل البرنامج كمسؤول مرةً واحدة"
			} else {
				fw = "أُضيفت قاعدةُ جدار ويندوز للمنفذ"
			}
		}
		writeJSON(w, map[string]any{"ok": true, "firewall": fw})
	}))
	// v1.2.0: TWAIN — اكتشاف · اختيارُ الحساس · التقاطٌ الآن · التلقائي · الواجهة · المهلة
	mux.HandleFunc("/api/twain", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var in struct {
			Discover bool    `json:"discover"`
			Acquire  bool    `json:"acquire"`
			Source   *string `json:"source"`
			ShowUI   *bool   `json:"show_ui"`
			Auto     *bool   `json:"auto"`
			WaitSec  *int    `json:"wait_sec"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		b.mu.Lock()
		if in.Source != nil {
			b.cfg.TwainSource = strings.TrimSpace(*in.Source)
		}
		if in.ShowUI != nil {
			b.cfg.TwainShowUI = *in.ShowUI
		}
		if in.Auto != nil {
			b.cfg.TwainAuto = *in.Auto
		}
		if in.WaitSec != nil && *in.WaitSec >= 10 && *in.WaitSec <= 900 {
			b.cfg.TwainWaitSec = *in.WaitSec
		}
		b.save()
		b.mu.Unlock()
		if in.Discover {
			src, err := b.twainDiscover()
			if err != nil {
				writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			writeJSON(w, map[string]any{"ok": true, "sources": src})
			return
		}
		if in.Acquire {
			if !b.twainAcquireAsync("زرُّ التقاط الآن") {
				writeJSON(w, map[string]any{"ok": false, "error": "الحساسُ مشغول الآن"})
				return
			}
		}
		writeJSON(w, map[string]any{"ok": true})
	}))
	// v1.2.1: اختبارُ الوصول إلى الخادم (تشخيصُ VPN/جدار/إنترنت قبل الاقتران)
	mux.HandleFunc("/api/ping", guard(func(w http.ResponseWriter, r *http.Request) {
		b.mu.Lock()
		api := b.cfg.API
		b.mu.Unlock()
		start := time.Now()
		req, _ := http.NewRequest("POST", api, strings.NewReader(`{"action":"ping"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "SyDentBridge/"+Version)
		cl := &http.Client{Timeout: 12 * time.Second}
		resp, err := cl.Do(req)
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "لا يصل البرنامجُ إلى خادم SyDent: " + err.Error() + " — تحقّق من الإنترنت، وأوقف VPN (مثل Hotspot Shield) ومضادَّ الفيروسات مؤقتاً"})
			return
		}
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
		resp.Body.Close()
		writeJSON(w, map[string]any{"ok": true, "status": resp.StatusCode, "ms": time.Since(start).Milliseconds()})
	}))
	mux.HandleFunc("/api/quit", guard(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		writeJSON(w, map[string]any{"ok": true})
		go func() { time.Sleep(300 * time.Millisecond); os.Exit(0) }()
	}))
	return mux
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

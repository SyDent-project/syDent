/* v644 — مثبتُ برنامج «SyDent Bridge» لويندوز (ربط الأجهزة ٣).
   لا Go بالـCI ⇒ يُثبَّت المصدرُ (bridge/*.go) والحزمةُ المنشورة:
   (١) الملفُّ يُرفع بعد استقرار حجمه (مسحان + عمرٌ ≥ ثانيتين) · ما كان موجوداً عند التشغيل أو عند إضافة المجلد لا يُرفع ·
       بصمةُ (حجم:وقت) تمنع الرفعَ مرتين · DICM يُتحقَّق · > 30MB لا يُرفع · 4 محاولات والرفضُ النهائي لا يُعاد;
   (٢) الاتصالُ: المفتاحُ لا يُطبع بالسجل ولا بالواجهة · 401 يمسح المفتاحَ محلياً · الوجهةُ أقدمُ طلب إن كان الاستطلاع حديثاً ·
       complete يحمل المسارَ الذي أعطاه الخادم · الطلبُ المنجَز يُزال محلياً قبل الاستطلاع التالي;
   (٣) الواجهةُ محلية فقط (127.0.0.1 ورفضُ Origin غريب) · التشغيلُ مع ويندوز بـschtasks · الرمزُ يُنقّى ويُكبَّر;
   (٤) الحزمة: downloads/SyDentBridge-<v>.zip موجودةٌ وSHA-256 يطابق bridge/README.md · رابطُ التنزيل بالإعدادات · SW لا يلمس /downloads/.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function suite(F) {
  const G = F['bridge/main.go'], U = F['bridge/ui.go'], R = F['bridge/README.md'];
  ok(/if s\.Seen >= 2 && time\.Since\(s\.First\) >= 2\*time\.Second \{/.test(G) && /if prev\.Size == fi\.Size\(\) && prev\.Mod == fi\.ModTime\(\)\.Unix\(\) \{\n\t\t\tprev\.Seen\+\+/.test(G), 'agent: a file is uploaded only after its size held across two scans and it is at least 2s old');
  ok(/if first \{\n\t\t\t\/\/ ما كان موجوداً عند التشغيل لا يُرفع/.test(G) && /b\.processed\[filepath\.Join\(p, e\.Name\(\)\)\] = sigOf\(fi\)/.test(G), 'agent: files already there at startup or when a folder is added are never uploaded');
  ok(/func sigOf\(fi os\.FileInfo\) string \{ return fmt\.Sprintf\("%d:%d", fi\.Size\(\), fi\.ModTime\(\)\.Unix\(\)\) \}/.test(G) && /if b\.processed\[p\] == sig \{\n\t\t\tcontinue\n\t\t\}/.test(G) && /b\.saveProcessed\(\)/.test(G), 'agent: (size:mtime) signature persisted — never uploaded twice');
  ok(/string\(data\[128:132\]\) == "DICM"/.test(G) && /if fi\.Size\(\) > MaxBytes \{/.test(G) && /MaxBytes    = 31457280/.test(G), 'agent: DICM magic checked, 30MB cap');
  ok(/UploadTries = 4/.test(G) && /for attempt := 1; attempt <= UploadTries; attempt\+\+ \{/.test(G) && /if isFinal\(lastErr\) \{\n\t\t\tbreak\n\t\t\}/.test(G) && /time\.Sleep\(time\.Duration\(attempt\*attempt\) \* time\.Second\)/.test(G) && /return finalErr\{reasonText\(out\["reason"\]\)\}/.test(G),
     'agent: 4 attempts with quadratic backoff; a server refusal (quota/subscription/type/size) is final');
  ok(!/log\.(Print|Println|Printf)\([^\n]*(\.Key|key)/i.test(G.replace(/"key"/g, '')) && !/cfg\.Key/.test(U) && !/"key": b\.cfg\.Key|"key":\s*b\.cfg\.Key/.test(G.split('/api/state')[1] || ''), 'agent: the device key is never logged nor exposed by the local UI');
  ok(/if errors\.Is\(err, errUnauthorized\) \{[\s\S]{0,400}b\.cfg\.DeviceID, b\.cfg\.Key = "", ""\n\t\t\tb\.save\(\)/.test(G) && /if resp\.StatusCode == 401 \{\n\t\treturn out, errUnauthorized/.test(G), 'agent: a 401 (device revoked) wipes the local key and asks to pair again');
  ok(/if time\.Since\(b\.polledAt\) > 30\*time\.Second \|\| len\(b\.requests\) == 0 \{\n\t\treturn nil/.test(G) && /r := b\.requests\[0\]/.test(G), 'agent: target = the oldest open request only when the poll is fresh (≤30s), else the inbox');
  ok(/done := map\[string\]any\{"path": path, "name": filepath\.Base\(p\), "mime": mime, "size": len\(data\)\}/.test(G) && /put\.Header\.Set\("x-upsert", "false"\)/.test(G) && /if resp\.StatusCode >= 300 \{\n\t\treturn fmt\.Errorf\("رفعُ الملف فشل/.test(G),
     'agent: PUT to the signed URL (no upsert), then complete with the server-given path');
  ok(/if r\.ID != reqID \{\n\t\t\t\trest = append\(rest, r\)/.test(G), 'agent: a fulfilled request is dropped locally so the next shot does not reuse it before the next poll');
  ok(/net\.Listen\("tcp", "127\.0\.0\.1:"\+UIPort\)/.test(G) && /if host != "127\.0\.0\.1" && host != "::1" \{\n\t\t\t\thttp\.Error\(w, "forbidden", 403\)/.test(G) && /if o := r\.Header\.Get\("Origin"\); o != "" && !strings\.HasPrefix\(o, "http:\/\/127\.0\.0\.1:"\+UIPort\)/.test(G),
     'agent UI: loopback only, foreign Origin refused');
  ok(/exec\.Command\("schtasks", "\/Create", "\/F", "\/TN", "SyDentBridge", "\/SC", "ONLOGON"/.test(G) && /\/\/ نسخةٌ أخرى تعمل: نفتح واجهتها ونخرج/.test(G), 'agent: autostart via a logon task; a second instance just opens the running UI');
  ok(/strings\.ToUpper\(clean\)/.test(G) && /\(r >= '0' && r <= '9'\)/.test(G), 'agent: the pairing code is cleaned (spaces/dashes) and uppercased');
  ok(/mimeByExt = map\[string\]string\{"\.jpg": "image\/jpeg", "\.jpeg": "image\/jpeg", "\.png": "image\/png", "\.webp": "image\/webp", "\.dcm": "application\/dicom"/.test(G), 'agent: only the server-accepted formats are watched');
  { const js = U.slice(U.indexOf('<script>') + 8, U.indexOf('</script>')); let okJS = true; try { new Function(js); } catch (e) { okJS = false; }
    ok(okJS, 'agent UI: the inline script parses (a stray quote/paren here blanks the whole page)');
    ok(/var typing=!S\.paired&&document\.getElementById\('code'\)&&document\.activeElement===document\.getElementById\('code'\);/.test(U) && /if\(!typing\)document\.getElementById\('cardPair'\)\.innerHTML=pairHTML;/.test(U) && /value="'\+esc\(prevCode\)\+'"/.test(U),
       'agent UI: the pairing card is not re-rendered while the code is being typed, and the typed code/message survive the 2s refresh (v1.2.1)'); }
  ok(/<html lang="ar" dir="rtl">/.test(U) && /function esc\(s\)/.test(U) && /esc\(r\.patient_name\)/.test(U) && /esc\(l\.text\)/.test(U), 'agent UI: Arabic RTL, every dynamic text escaped');
  /* (٣ب) مستقبِلُ DICOM — v1.1.0 */
  const D = F['bridge/dicom.go'];
  ok(/calledAE: strings\.TrimSpace\(string\(b\[4:20\]\)\), callingAE: strings\.TrimSpace\(string\(b\[20:36\]\)\)/.test(D) && /p := 68/.test(D), 'dicom: A-ASSOCIATE-RQ parsed at the right offsets (version·reserved·called·calling·reserved)');
  ok(/_ = writePDU\(c, pduAssocRJ, \[\]byte\{0, 1, 1, 7\}\)/.test(D) && /!strings\.EqualFold\(a\.calledAE, ae\)/.test(D), 'dicom: a foreign called-AE is rejected (permanent · called AE not recognized)');
  ok(/if cs\.field == dimseCEcho \{/.test(D) && /buildResponse\(cs, 0x8030, 0\)/.test(D) && /buildResponse\(\*pending, 0x8001, status\)/.test(D), 'dicom: C-ECHO answered; C-STORE answered after the dataset is stored');
  ok(/out\.Write\(make\(\[\]byte, 128\)\)\n\tout\.WriteString\("DICM"\)/.test(D) && /exp\(0x0002, 0x0010, "UI", \[\]byte\(ts\)\)/.test(D) && /exp\(0x0002, 0x0003, "UI", \[\]byte\(c\.sopInstance\)\)/.test(D), 'dicom: a full Part 10 file (preamble · DICM · group 0002 with the negotiated transfer syntax)');
  ok(/os\.Rename\(tmp, final\)/.test(D) && /tmp := filepath\.Join\(dir, "\."\+safe\+"\.part"\)/.test(D) && /if f\.data\.Len\(\)\+len\(data\) > dcmMaxDataset \{/.test(D), 'dicom: written atomically (temp then rename) so the watcher never uploads a half file; dataset capped');
  ok(/b\.cfg\.WatchDirs = append\(b\.cfg\.WatchDirs, b\.dicomInDir\(\)\)/.test(D) && /"1\.2\.840\.10008\.1\.2\.4\.50", \/\/ JPEG Baseline/.test(D) && /"1\.2\.840\.10008\.5\.1\.4\.1\.1\.1\.3":\s+"Intra-oral \(presentation\)"/.test(D),
     'dicom: the inbox folder is always watched; compressed syntaxes and intra-oral/DX classes accepted');
  ok(/exec\.Command\("netsh", "advfirewall", "firewall", "add", "rule", "name=SyDent Bridge DICOM", "dir=in", "action=allow", "protocol=TCP"/.test(G) && /b\.dicomApply\(\)/.test(G) && /DicomEnabled bool/.test(G), 'dicom: firewall rule button, applied from settings at startup');
  const W = F['bridge/exec_windows.go'];
  ok(/\/\/go:build windows/.test(W) && /c\.SysProcAttr = &syscall\.SysProcAttr\{HideWindow: true\}/.test(W) && (G.match(/hideConsole\(/g) || []).length >= 4 && /if time\.Since\(autoAt\) < time\.Minute \{\n\t\treturn autoVal/.test(G),
     'windows: every console tool (schtasks · netsh · rundll32) runs hidden and the autostart query is cached a minute (v1.1.1 — flashing black windows)');
  /* (٣ج) TWAIN — v1.2.0 */
  const TW = F['bridge/twain.go'], TWW = F['bridge/twain_worker.go'], TWT = F['bridge/twain_test.go'];
  ok(/binary\.LittleEndian\.PutUint32\(b\[50:\], twDGControl\|twDGImage\)/.test(TW) && /twIdentitySize = 156/.test(TW) && /binary\.LittleEndian\.PutUint32\(b\[4:\], uint32\(parent\)\)/.test(TW), 'twain: TW_IDENTITY/TW_USERINTERFACE encoded by hand at pack(2) offsets (SupportedGroups at 50, hParent at 4)');
  ok(/twMSGOpenDSM/.test(TW) && /twMSGOpenDS, ds\)/.test(TW) && /twCapOneValueU16\(dsm, twICAPXferMech, twSXNative\)/.test(TW) && /twMSGEnableDS, ui\)/.test(TW) && /twMSGProcessEvent, ev\)/.test(TW) && /twDATImageNativeXfer, twMSGGet, &hDIB\)/.test(TW) && /twMSGEndXfer, pend\)/.test(TW),
     'twain: the full acquisition sequence (open DSM → open DS → native xfer → enable → pump events → native transfer → end xfer)');
  ok(/defer disable\(\)/.test(TW) && /defer closeDS\(\)/.test(TW) && /twMSGCloseDSM, &hwnd\)/.test(TW) && /انتهت المهلة بلا صورة/.test(TW), 'twain: every exit path disables/closes the source and the DSM; a timeout is named');
  ok(/tmp := filepath\.Join\(o\.OutDir, "\."\+name\+"\.part"\)/.test(TW) && /os\.Rename\(tmp, final\)/.test(TW) && /case 16:/.test(TW) && /maxv < 4096/.test(TW), 'twain: PNG written atomically into the watched folder; 16-bit sensors with 12-bit data stretched');
  ok(/runtime\.LockOSThread\(\)/.test(TWW) && /if fresh != nil && !busy \{\n\t\tb\.twainAcquireAsync/.test(TWW) && /auto := b\.cfg\.TwainAuto && b\.cfg\.TwainSource != ""/.test(TWW), 'twain worker: one OS-locked thread; a new open request arms the sensor only when auto is on, a source is chosen and nothing is running');
  ok(/func TestAcquireSequence/.test(TWT) && /want := \[\]string\{"OPENDSM", "GETFIRST", "GETNEXT", "GETNEXT", "GETNEXT", "OPENDS:RVG 6200", "SETCAP:XFERMECH", "ENABLEDS", "NATIVEXFER", "ENDXFER", "DISABLEDS", "CLOSEDS", "CLOSEDSM"\}/.test(TWT) && /HGLOBAL leaked/.test(TWT),
     'twain: the simulated DSM test pins the exact 13-call order and the HGLOBAL release');
  ok((F['bridge/twain_windows.go'].match(/runtime\.KeepAlive\(/g) || []).length >= 7 && /if comp == 3 && hdr < 52 \{/.test(TW) && /BITMAPV4HEADER/.test(TWT), 'twain: buffers handed to Win32 as uintptr are kept alive across the call; BITFIELDS masks located per header version (v1.2.2)');
  ok(/GOOS=windows GOARCH=386 go build/.test(R) && /pRtlMoveMemory/.test(F['bridge/twain_windows.go']) && /syscall\.LoadDLL\(n\)/.test(F['bridge/twain_windows.go']), 'twain: 32-bit build documented; Windows memory copied via RtlMoveMemory (vet-clean); DSM DLL loaded at runtime only');
  /* (٤) الحزمة */
  const m = R.match(/\| (\d+\.\d+\.\d+) \| `downloads\/(SyDentBridge-[\d.]+\.zip)` \| `([0-9a-f]{64})` \| `([0-9a-f]{64})` \|/);
  ok(!!m && m && m[1] === G.match(/Version     = "([\d.]+)"/)[1] && m[2] === 'SyDentBridge-' + m[1] + '.zip', 'release: the first README table row (current) matches the binary version constant and the zip name');
  ok(/if hh := strings\.ToLower\(r\.Host\); hh != "127\.0\.0\.1:"\+UIPort && hh != "localhost:"\+UIPort/.test(G), 'agent UI: Host header checked (DNS rebinding)');
  if (m) {
    const zipPath = path.join(ROOT, 'downloads', m[2]);
    ok(fs.existsSync(zipPath) && crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex') === m[3], 'release: the published zip exists and its SHA-256 matches the README');
    ok(new RegExp('href="/downloads/' + m[2].replace('.', '\\.') + '" download').test(F['settings.html']), 'settings: the download link points at the published zip');
  }
  ok(/if \(url\.pathname\.indexOf\('\/downloads\/'\) === 0\) return;/.test(F['sw.js']), 'service worker: /downloads/ passes straight to the network');
  ok(/schtasks \/Create \/F \/TN SyDentBridge \/SC ONLOGON/.test(F['bridge/install.bat']) && /copy \/Y "%~dp0SyDentBridge\.exe"/.test(F['bridge/install.bat']), 'installer: copies the exe to the user profile and registers the logon task');
}

const FILES = ['bridge/main.go', 'bridge/ui.go', 'bridge/dicom.go', 'bridge/exec_windows.go', 'bridge/twain.go', 'bridge/twain_worker.go', 'bridge/twain_windows.go', 'bridge/twain_test.go', 'bridge/README.md', 'bridge/install.bat', 'settings.html', 'sw.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MUTANTS = [
  ['uploads before the file settles', rep('bridge/main.go', 'if s.Seen >= 2 && time.Since(s.First) >= 2*time.Second {', 'if true {')],
  ['old files uploaded at startup', rep('bridge/main.go', '\t\tif first {\n\t\t\t// ما كان موجوداً عند التشغيل لا يُرفع', '\t\tif false {\n\t\t\t// ما كان موجوداً عند التشغيل لا يُرفع')],
  ['no retry backoff', rep('bridge/main.go', 'time.Sleep(time.Duration(attempt*attempt) * time.Second)', 'time.Sleep(time.Second)')],
  ['key kept after 401', rep('bridge/main.go', '\t\t\tb.cfg.DeviceID, b.cfg.Key = "", ""\n\t\t\tb.save()\n', '')],
  ['stale poll still targets a patient', rep('bridge/main.go', 'if time.Since(b.polledAt) > 30*time.Second || len(b.requests) == 0 {\n\t\treturn nil', 'if len(b.requests) == 0 {\n\t\treturn nil')],
  ['UI open to the network', rep('bridge/main.go', 'net.Listen("tcp", "127.0.0.1:"+UIPort)', 'net.Listen("tcp", ":"+UIPort)')],
  ['foreign origin accepted', rep('bridge/main.go', 'if o := r.Header.Get("Origin"); o != "" && !strings.HasPrefix(o, "http://127.0.0.1:"+UIPort) && !strings.HasPrefix(o, "http://localhost:"+UIPort) {\n\t\t\t\thttp.Error(w, "forbidden", 403)\n\t\t\t\treturn\n\t\t\t}\n', '')],
  ['DICM not checked', rep('bridge/main.go', 'if mime == "application/dicom" && !(len(data) > 132 && string(data[128:132]) == "DICM") {', 'if false {')],
  ['zip hash drifted', rep('bridge/README.md', '3b86bcb8bd52390a11b2edfec8d152d546e2b579f75db4661c2fafdf3537e1c6', '0000000000000000000000000000000000000000000000000000000000000000')],
  ['source left enabled on error', rep('bridge/twain.go', '\tdefer disable()\n', '')],
  ['sensor armed while busy', rep('bridge/twain_worker.go', 'if fresh != nil && !busy {', 'if fresh != nil {')],
  ['pairing card wiped while typing', rep('bridge/ui.go', "if(!typing)document.getElementById('cardPair').innerHTML=pairHTML;", "document.getElementById('cardPair').innerHTML=pairHTML;")],
  ['buffers not kept alive', rep('bridge/twain_windows.go', '\truntime.KeepAlive(data)\n', '')],
  ['console windows visible', rep('bridge/exec_windows.go', 'c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}', '')],
  ['any AE accepted', rep('bridge/dicom.go', 'if a.calledAE != "" && !strings.EqualFold(a.calledAE, ae) && !strings.EqualFold(a.calledAE, "ANY-SCP") {', 'if false {')],
  ['half file visible to the watcher', rep('bridge/dicom.go', 'tmp := filepath.Join(dir, "."+safe+".part")', 'tmp := final')],
  ['Host not checked', rep('bridge/main.go', 'if hh := strings.ToLower(r.Host); hh != "127.0.0.1:"+UIPort && hh != "localhost:"+UIPort && hh != "[::1]:"+UIPort {', 'if false {')],
  ['SW caches downloads', rep('sw.js', "  if (url.pathname.indexOf('/downloads/') === 0) return;", '')]
];
suite(base);
const bp = [pass, fail];
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  [pass, fail] = bp;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-bridge-agent: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-bridge-agent: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

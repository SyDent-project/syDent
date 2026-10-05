/* v534 — مثبتُ «غير مؤكد» (بلاغ المالك بصورتين 29/9: موعدُ ياسر أصفر بنبض اليوم، ومودالُ التعديل بلا حالة).
   الجذر: أفرادُ الأسرة وأخوةُ السلسلة يُنشأون status='scheduled' عن قصد، لكن:
   (١) قائمتا الحالة (التقويم + ملف المريض) بلا خيار له ⇒ حالةٌ فارغة، والحفظ يرسل '' (التقويم) أو «مؤكد» صامتاً (ملف المريض)؛
   (٢) الاسم «مجدول» بثلاثة مواضع؛ (٣) الدفعاتُ التابعة بلا أثرٍ بسجل النشاطات؛
   (٤) نبضُ اليوم يرسم غير المؤكد أصفرَ «بانتظار» كالواصل فعلاً، و«جاري الآن» أخضرَ كـ«مؤكد».
   --self-test: كل طفرة يجب أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function run(F) {
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (!F.__quiet) console.log('FAIL', m); } };
  const AP = F['appointments.html'], PP = F['patient-profile.html'], PA = F['pp-appt.js'], PT = F['pp-timeline.js'], IX = F['index.html'];
  const selOf = (src, id) => { const i = src.indexOf('<select id="' + id + '">'); return i < 0 ? '' : src.slice(i, src.indexOf('</select>', i)); };
  ok(/<option value="scheduled">غير مؤكد<\/option>/.test(selOf(AP, 'fStatus')), 'calendar modal: «غير مؤكد» option');
  ok(/<option value="scheduled">غير مؤكد<\/option>/.test(selOf(PP, 'aStatus')), 'patient-profile modal: «غير مؤكد» option');
  ok(/if \(s === 'scheduled'\) return 'غير مؤكد';/.test(AP) && /scheduled: 'غير مؤكد'/.test(PA) && /scheduled: 'غير مؤكد'/.test(PT), 'one name everywhere: «غير مؤكد» (calendar · profile · timeline)');
  ok(!/scheduled: 'مجدول'|return 'مجدول'/.test(AP + PA + PT), 'no «مجدول» status label left');
  ok(/status:\s+\(document\.getElementById\('fStatus'\)\.value \|\| document\.getElementById\('fStatus'\)\.dataset\.orig \|\| 'confirmed'\)/.test(AP)
     && /document\.getElementById\('fStatus'\)\.dataset\.orig = _statusForUi \|\| '';/.test(AP) && /document\.getElementById\('fStatus'\)\.dataset\.orig = '';/.test(AP), 'calendar save: never an empty status (falls back to the original, new → confirmed)');
  ok(/\(\(statusEl && statusEl\.dataset\.orig\) \|\| 'confirmed'\)/.test(PA) && (PA.match(/getElementById\('aStatus'\)\.dataset\.orig = _statusForUi[12];/g) || []).length === 2, 'profile save: unmatched status keeps the original — never silently «confirmed»');
  ok(/insert\(rows\)\.select\('id, patient_id, patient_name, date, time, status'\)/.test(AP) && /_apptAuditBatch\(r\.data, 'ضمن سلسلة/.test(AP), 'series siblings: returned and audit-logged');
  ok(/insert\(F\.rows\(saved, use\)\)\.select\('id, patient_id, patient_name, date, time, status'\)/.test(AP) && /_apptAuditBatch\(r\.data, 'حجز أسرة/.test(AP), 'family members: returned and audit-logged');
  ok(/window\.logAudit\('appointment\.create', \{\s*entityId: a\.id/.test(AP.slice(AP.indexOf('function _apptAuditBatch'))), 'audit batch: one appointment.create per row');
  ok(/\(st==='confirmed'\) \? 'dp-conf' : 'dp-unc';/.test(IX) && /\(a\.arrived_at\) \? 'dp-wait'/.test(IX), 'pulse: unconfirmed → dp-unc, arrived → dp-wait (no longer the same yellow)');
  ok(/\.dp-unc\{[^}]*border:1\.5px dashed var\(--dp-unc-bd\)/.test(IX) && /--dp-unc:var\(--blue-bg\);--dp-unc-fg:var\(--blue-fg\);--dp-unc-bd:var\(--blue-bd\)/.test(IX), 'pulse: unconfirmed = pale blue, dashed (calendar status-scheduled)');
  ok(/--dp-conf:var\(--green-bg\);--dp-conf-fg:var\(--green-fg\);--dp-conf-bd:var\(--green-bd\)/.test(IX) && /--dp-live:#ea580c;--dp-live-fg:#1c0a00\}/.test(IX) && /\{--dp-done:#aab6c9;--dp-done-fg:#0a1628;--dp-live:#f97316;--dp-live-fg:#1c0a00\}/.test(IX) && /\.dp-pill\.dp-live\{animation:dpLive/.test(IX) && /prefers-reduced-motion: reduce\)\{\.dp-pill\.dp-live\{animation:none\}/.test(IX), 'pulse (v537): confirmed = pale green; in-chair = vivid orange in both themes (not red-looking in light, not yellow-looking in dark) + a live ring, motion-safe');
  const leg = IX.slice(IX.indexOf('<div class="dp-legend">'), IX.indexOf('</div>', IX.indexOf('<div class="dp-legend">')));
  ok(['مكتمل', 'جاري الآن', 'بغرفة الانتظار', 'مؤكد', 'غير مؤكد'].every(t => leg.indexOf('</i>' + t + '</span>') > 0) && !/بانتظار<\/span>/.test(leg.replace('بغرفة الانتظار', '')), 'pulse legend: five unambiguous states');
  ok(/key: 'seated_at',\s+label: '🪑 جلس', color: 'var\(--orange\)', tone: 'orange'/.test(IX), 'dashboard seated button: orange like the calendar');
  return { pass, fail };
}
const FILES = ['appointments.html', 'patient-profile.html', 'pp-appt.js', 'pp-timeline.js', 'index.html'];
const F = {}; FILES.forEach(f => { F[f] = read(f); });
const r = run(F);
if (process.argv.includes('--self-test')) {
  const M = [
    ['appointments.html', '<option value="scheduled">غير مؤكد</option>', ''],
    ['patient-profile.html', '<option value="scheduled">غير مؤكد</option>', ''],
    ['appointments.html', "document.getElementById('fStatus').dataset.orig || 'confirmed'", "'confirmed'"],
    ['pp-appt.js', "((statusEl && statusEl.dataset.orig) || 'confirmed')", "'confirmed'"],
    ['appointments.html', "_apptAuditBatch(r.data, 'حجز أسرة", "void(r.data, 'حجز أسرة"],
    ['index.html', ": 'dp-unc';", ": 'dp-wait';"],
    ['pp-timeline.js', "scheduled: 'غير مؤكد'", "scheduled: 'مجدول'"],
  ];
  let red = 0;
  M.forEach(([f, a, b]) => { const G = Object.assign({}, F, { __quiet: true }); if (G[f].indexOf(a) < 0) { console.log('MUTANT ANCHOR MISSING', f, a); return; } G[f] = G[f].replace(a, b); if (run(G).fail > 0) red++; else console.log('MUTANT SURVIVED', f, a); });
  if (red !== M.length) { console.log('❌ مثبت «غير مؤكد»: طفراتٌ نجت ' + (M.length - red) + '/' + M.length); process.exit(1); }
}
console.log((r.fail ? '❌' : '✅') + ' مثبت «غير مؤكد»: ' + r.pass + '/' + (r.pass + r.fail));
process.exit(r.fail ? 1 : 0);

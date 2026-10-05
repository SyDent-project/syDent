/* v504 — مثبتُ قائمة «غابوا ولم يعيدوا الحجز» (patients.html · PRM) وقاعدةِ M156 للبوابة — مستقل، على الملفات الحيّة.
   (١) prmNoShowCompute: آخرُ موعدٍ منتهٍ للمريض هو الحَكَم — غيابٌ/broken ⇒ بالقائمة؛ إلغاءٌ بلا موعدٍ آخر بنفس اليوم ⇒ بالقائمة؛
       إلغاءٌ مع إعادةِ جدولةٍ بنفس اليوم أو مكتملٌ لاحقاً ⇒ لا؛ المخطّطُ وبلا مريض يُتجاهلان؛ الترتيبُ بالتاريخ ثم الوقت.
   (٢) prmNoShowList: يستثني من عاد وحجز (prmUpcomingApptPatients) ومن تواصلنا معه ضمن التهدئة (prmRecentRecalls)؛ الأحدثُ أولاً.
   (٣) الرسالة: قالبٌ بحوامل المنصة + {last_date}، وحذفُ سطر الحجز عند تعطيل البوابة (prmStripBookingIfDisabled).
   (٤) الربط: التبويب والعرض وخريطةُ prmSwitchTab والشارة وopenPrmModal وإعادةُ الرسم بعد «تم التواصل» والاستعلامُ المحصور.
   (٥) M156: البوابةُ تُغلق الفترةَ حين تشملها فترةٌ عامّة أو كلُّ الأطباء النشطين أو كلُّ الكراسي النشطة.
   --self-test: 4 طفرات على (١)/(٢) لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('patients.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function ext(src, name) { const i = src.indexOf(name); if (i < 0) throw new Error('missing ' + name); let j = src.indexOf('{', i), d = 0, k = j; for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } } return src.slice(i, k + 1); }
const A = (pid, date, status, extra) => Object.assign({ id: pid + date + status, patient_id: pid, date, status }, extra || {});

function load(src, env) {
  const ctx = Object.assign({ Object, Array, String, Date, Math, parseInt, console }, env || {});
  vm.createContext(ctx);
  const tpl = /var DEFAULT_NOSHOW_TPL = '((?:[^'\\]|\\.)*)';/.exec(src);
  vm.runInContext('var PRM_NOSHOW_DAYS = 90; var PRM_COOLDOWN_DAYS = 30; var DEFAULT_NOSHOW_TPL = \'' + (tpl ? tpl[1] : '') + '\';\n' + ext(src, 'function prmNoShowCompute') + '\n' + ext(src, 'function prmNoShowList') + '\n' + ext(src, 'function prmNoShowMsg') + '\nthis.C = prmNoShowCompute; this.L = prmNoShowList; this.M = prmNoShowMsg;', ctx);
  return ctx;
}
function suite(src) {
  const c = load(src).C;
  ok(c([A('p', '2026-09-20', 'no_show')]).p && c([A('p', '2026-09-20', 'no_show')]).p.status === 'no_show', 'compute: last = no_show → listed');
  ok(c([A('p', '2026-09-20', 'broken')]).p && c([A('p', '2026-09-20', 'broken')]).p.status === 'broken', 'compute: legacy broken → listed');
  ok(!('p' in c([A('p', '2026-09-10', 'no_show'), A('p', '2026-09-20', 'completed')])), 'compute: came back and completed later → not listed');
  ok(c([A('p', '2026-09-10', 'completed'), A('p', '2026-09-20', 'no_show')]).p.date === '2026-09-20', 'compute: latest by date decides');
  ok(c([A('p', '2026-09-20', 'completed', { time: '09:00' }), A('p', '2026-09-20', 'no_show', { time: '15:00' })]).p, 'compute: same day, later time decides');
  ok(c([A('p', '2026-09-20', 'cancelled')]).p && c([A('p', '2026-09-20', 'cancelled')]).p.status === 'cancelled', 'compute: cancelled without rebook → listed');
  ok(!('p' in c([A('p', '2026-09-20', 'cancelled', { time: '09:00' }), A('p', '2026-09-20', 'completed', { time: '08:00' })])), 'compute: cancelled but another non-cancelled same day (reschedule) → not listed');
  ok(!('p' in c([A('p', '2026-09-20', 'no_show', { is_planned: true })])) && !('x' in c([A(null, '2026-09-20', 'no_show')])), 'compute: planned / no patient ignored');
  const m = c([A('a', '2026-09-20', 'no_show'), A('b', '2026-09-20', 'completed')]);
  ok(m.a && !m.b, 'compute: patients independent');
  // list
  const env = { _prmFind: id => ({ id, name: 'N ' + id, phone: '09' }), prmUpcomingApptPatients: { b: true }, prmRecentRecalls: { c: Date.now() - 5 * 86400000, d: Date.now() - 40 * 86400000 },
    prmNoShowLast: { a: { date: '2026-09-01' }, b: { date: '2026-09-02' }, c: { date: '2026-09-03' }, d: { date: '2026-09-04' }, z: { date: '2026-09-05' } } };
  env._prmFind = id => id === 'z' ? null : { id, name: 'N ' + id, phone: '09' };
  const L = load(src, env).L();
  ok(L.map(r => r.p.id).join() === 'd,a', 'list: excludes rebooked (b), within-cooldown (c), unknown patient (z); keeps expired-cooldown (d); newest first');
  // message
  const env2 = { prmNoShowLast: { p: { date: '2026-09-20' } }, prmApplyPlaceholders: (t, d) => t.replace('{patient_first_name}', d.patient_first_name).replace('{clinic_name}', d.clinic_name).replace('{booking_link}', d.booking_link),
    prmStripBookingIfDisabled: t => t, prmMsgData: p => ({ patient_first_name: 'سامر', clinic_name: 'العيادة', booking_link: 'https://x' }), prmFmtNum: d => '20/9/2026' };
  const msg = load(src, env2).M({ id: 'p', name: 'سامر س' });
  ok(/مرحباً سامر/.test(msg) && /يوم 20\/9\/2026 لم يتم/.test(msg) && /https:\/\/x/.test(msg) && /العيادة/.test(msg) && !/\{/.test(msg), 'message: placeholders + last_date resolved, nothing left unfilled');
}
suite(SRC);

/* (٤) الربط */
ok(/<button id="prmTabNoShow" onclick="prmSwitchTab\('noshow'\)"/.test(SRC) && /<div id="prmNoShowView" style="display:none;"><\/div>/.test(SRC) && /id="prmNoShowCount"/.test(SRC), 'wiring: tab + view + count');
ok(/noshow:'prmNoShowView'/.test(SRC) && /noshow:'prmTabNoShow'/.test(SRC), 'wiring: prmSwitchTab knows the tab');
ok(/renderPrmNoShow\(\);\s*\/\* v504 \*\//.test(ext(SRC, 'function openPrmModal')), 'wiring: rendered on modal open');
ok(/var noShow = prmNoShowList\(\)\.length;/.test(SRC) && /var total = recalls \+ bdayToday \+ instDue \+ noShow;/.test(SRC), 'wiring: badge counts the list');
ok(/renderPrmRecall\(\); renderPrmNoShow\(\); updatePrmBadge\(\);/.test(ext(SRC, 'async function prmMarkRecalled')), 'wiring: «تم التواصل» re-renders the tab (cooldown hides the row)');
ok(/\.select\('id, patient_id, date, time, status, is_planned'\)\s*\.eq\('doctor_id', currentUser\.id\)\s*\.gte\('date', prmYmdLocal\(_nsFrom\)\)\.lte\('date', prmYmdLocal\(\)\)\s*\.in\('status', \['completed', 'no_show', 'broken', 'cancelled'\]\)/.test(SRC), 'wiring: one doctor-scoped 90-day query of finished appointments');
const view = ext(SRC, 'function renderPrmNoShow');
ok(/prmDoWaNoShow\(/.test(view) && /prmDoCopyNoShow\(/.test(view) && /prmMarkRecalled\(/.test(view) && /SySlots\.finalize\(/.test(view) && /prmRowHtml\(/.test(view), 'view: WhatsApp / copy / done on the kit rows');
ok(/prmEsc\(prmFmtNum\(r\.last\.date\)\)/.test(view) && !/\+ p\.name \+/.test(view), 'view: dates escaped, name goes through prmRowHtml');
ok(/function prmDoWaNoShow\(id\)\{ var p=_prmFind\(id\); if\(p\) prmWa\(p\.phone, prmNoShowMsg\(p\)\); \}/.test(SRC), 'send: through the shared prmWa (mirrored wa.me builder), no new sender');

/* (٥) M156 */
const M = read('migrations/156_booking_blocks_all_providers.sql');
ok(/provs AS \(SELECT id FROM public\.clinic_doctors WHERE owner_id = p_clinic AND is_active IS NOT FALSE\)/.test(M) && /ops\s+AS \(SELECT id FROM public\.operatories\s+WHERE doctor_id = p_clinic AND is_active IS NOT FALSE\)/.test(M), 'M156: active providers and chairs');
ok(/\(SELECT count\(\*\) FROM provs\) > 0 AND NOT EXISTS \(\s*SELECT 1 FROM provs p WHERE NOT EXISTS/.test(M) && /\(SELECT count\(\*\) FROM ops\) > 0 AND NOT EXISTS \(\s*SELECT 1 FROM ops o WHERE NOT EXISTS/.test(M), 'M156: closed only when EVERY active provider / chair is blocked (double NOT EXISTS), never with zero providers');
ok(/i\.operatory_id IS NULL AND i\.provider_id IS NULL/.test(M) && /i\.provider_id = p\.id AND i\.operatory_id IS NULL/.test(M) && /i\.operatory_id = o\.id AND i\.provider_id IS NULL/.test(M), 'M156: general / provider-only / chair-only scopes kept apart');
ok(/b\.date_to IS NULL OR dd\.d <= b\.date_to/.test(M) && /CASE WHEN b\.end_time IS NULL THEN '24:00'::interval/.test(M), 'M156: open-ended rows and all-day blocks expanded');
ok(/CREATE OR REPLACE FUNCTION public\.booking_blocked_slots\(p_clinic uuid, p_from date, p_to date\)/.test(M) && /RETURNS TABLE\(d date, t time without time zone, dur integer\)/.test(M), 'M156: same signature as M154 (busy_slots + create_request unchanged)');

if (process.argv.includes('--self-test')) {
  const muts = [
    ["if (last.status === 'no_show' || last.status === 'broken')", "if (last.status === 'no_show')", 'broken dropped'],
    ["var rebooked = list.some(function(b){ return b !== last && b.date === last.date && b.status !== 'cancelled'; });", 'var rebooked = false;', 'reschedule counted'],
    ["if (prmUpcomingApptPatients[pid]) return;                    /* عاد وحجز ⇒ خارج القائمة */", '', 'rebooked patients listed'],
    ["var rr = prmRecentRecalls[pid]; if (rr && (now - rr) < cooldownMs) return;   /* تواصلنا مؤخراً */", '', 'cooldown ignored']
  ];
  let red = 0;
  for (const [a, b, n] of muts) {
    if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + n); continue; }
    const f0 = fail, p0 = pass, lg = console.log; console.log = () => {};
    suite(SRC.replace(a, b));
    console.log = lg;
    if (fail > f0) red++; else console.log('MUTANT SURVIVED:', n);
    fail = f0; pass = p0;
  }
  ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
}
console.log((fail ? '❌' : '✅') + ' مثبت قائمة «غابوا» + M156: ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);

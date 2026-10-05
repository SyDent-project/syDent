/* v523 — مثبتُ دورة إعادة العمل للمخبر (lab-redo.js · Migration 160) — مستقل، على الملفات الحيّة.
   (١) الوحدة: اقتراحُ الاستحقاق من مدّة الدورة السابقة (1..60 يوماً) · نصُّ السبب (الشرائحُ المعروفة فقط + التفاصيل، ≤300) ·
       عدُّ «مرة/مرتين/n مرات» · سطرُ العرض مُهرَّب وبعنوانٍ لكل الدورات · التحميلُ بمقاطع 150 ويتابع بعد خطأ (#691/#240) · markResent;
   (٢) run: حوارٌ مُلغى ⇒ لا RPC · وسائطُ RPC (الاستحقاقُ الفارغ ⇒ null) · خطأ الحالة ⇒ رسالتُه · النجاح يسجّل الدورة ويكتب lab.redo;
   (٣) السطحان الحيّان (labs.html · pp-clinical.js) مُنفَّذان فعلاً: «إرسال» بعد «إعادة» بلا date_sent وmarkResent،
       و«إرسال» المسودّة يختم date_sent كما كان؛ الإعادةُ عبر SyLabRedo.run وحده — صفرُ كتابةٍ مباشرة لـstatus:'redo';
   (٤) القاعدة (ملف M160): التريغر يحفظ date_sent ويفرّغ تواريخ الدورة ويختم resent_at · RPC من استُلم/فُحص فقط · SECURITY INVOKER ·
       نوافذُ الكلفة بالمحاسبة وتقارير الأطباء ما زالت date_sent (لا معادلة ثانية — #684);
   (٥) الربط: وسمُ السكربت بالصفحتين قبل مستهلكه · cache-bust · theme.css · تفرّدُ بادئة lrd- · سجلُّ النشاطات.
   --self-test: 8 طفرات لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function loadMod(src) {
  const win = { SyDT: { numDate: iso => { const d = new Date(iso); return d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); } } };
  const ctx = { window: win, console: { warn() { win.__warned = (win.__warned || 0) + 1; } }, Number, String, Date, Array, Object, Promise, Math, RegExp, JSON, isNaN };
  vm.createContext(ctx); vm.runInContext(src, ctx); return { win, ctx };
}
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2);
}
function blockSrc(src, head) {
  const i = src.indexOf(head); if (i < 0) return null;
  const j = src.indexOf('\n};', i); return src.slice(i, j + 3);
}

async function suite(F) {
  /* ── (١) الوحدة ── */
  const { win, ctx: modCtx } = loadMod(F['lab-redo.js']);
  const R = win.SyLabRedo;
  ok(!!R, 'module: window.SyLabRedo exported');
  ok(R.suggestDue({ date_sent: '2026-09-01T00:00:00+00:00', date_due: '2026-09-08T00:00:00+00:00' }, '2026-09-29') === '2026-10-06', 'suggestDue: sent→due 7 days ⇒ today + 7');
  ok(R.suggestDue({ date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-11T10:00:00+00:00' }, '2026-09-29') === '2026-10-09', 'suggestDue: no due ⇒ sent→received (10 days)');
  ok(R.suggestDue({ date_sent: '2026-06-01T00:00:00+00:00', date_due: '2026-09-01T00:00:00+00:00' }, '2026-09-29') === '' &&
     R.suggestDue({ date_sent: '2026-09-01T00:00:00+00:00' }, '2026-09-29') === '' && R.suggestDue({ date_due: '2026-09-01' }, '2026-09-29') === '',
     'suggestDue: >60 days, no end, no sent ⇒ no suggestion');
  ok(R.reasonText(['اللون غير مطابق', '<b>x</b>', 'إطباق عالٍ'], '  أغمق  درجة ') === 'اللون غير مطابق · إطباق عالٍ — أغمق درجة', 'reasonText: known chips only, joined, note trimmed/collapsed');
  ok(R.reasonText([], '') === '' && R.reasonText([], 'x'.repeat(400)).length === 300, 'reasonText: empty ⇒ "" · capped at 300');
  ok(R.countAr(1) === 'مرة' && R.countAr(2) === 'مرتين' && R.countAr(3) === '3 مرات' && R.countAr(11) === '11 مرة', 'countAr: Arabic count forms');
  /* التحميل */
  const calls = [];
  const sbLoad = { from(t) { const q = { t, ids: null, select() { return q; }, in(c, ids) { q.ids = ids; return q; },
    order() { calls.push(q.ids.length); if (calls.length === 2) return Promise.resolve({ data: null, error: { message: 'boom' } });
      return Promise.resolve({ data: q.ids.filter(id => id === 'o1' || id === 'o300').map((id, k) => ({ id: 'r' + id + k, lab_order_id: id, reason: id === 'o1' ? '<img onerror=x>' : null, redo_at: '2026-09-10T08:00:00Z', resent_at: id === 'o1' ? '2026-09-12T08:00:00Z' : null })), error: null }); } }; return q; } };
  const ids = []; for (let i = 0; i < 320; i++) ids.push('o' + i);
  await R.load(sbLoad, ids);
  ok(JSON.stringify(calls) === '[150,150,20]', 'load: .in() chunked by 150 (#691)');
  ok(R.count('o1') === 1 && R.count('o300') === 1 && win.__warned >= 1, 'load: a failed chunk warns and the rest still load (#240)');
  const ln = R.line('o1');
  ok(ln.indexOf('<img') === -1 && ln.indexOf('&lt;img') !== -1 && /🔄 أُعيد مرة/.test(ln) && /أُعيد إرساله 12\/9\/2026/.test(ln), 'line: escaped reason, count, resend date');
  ok(R.line('o5') === '' && /title="1\) /.test(ln), 'line: nothing without cycles · title lists every cycle');
  R.markResent('o300', '2026-09-20T09:00:00Z');
  ok(R.list('o300')[0].resent_at === '2026-09-20T09:00:00Z', 'markResent: closes the open cycle');
  /* ── (٢) run ── */
  let rpcArgs = null, audit = null, toast = null;
  win.logAudit = (a, o) => { audit = { a, o }; };
  modCtx.showToast = m => { toast = m; };
  const lo = { id: 'o7', status: 'checked', work_type: 'تاج زيركون', patient_id: 'p1', date_due: null };
  const mkSb = (resp) => ({ rpc(fn, a) { rpcArgs = { fn, a }; return Promise.resolve(resp); } });
  R.open = () => Promise.resolve(null);
  rpcArgs = null;
  ok(await R.run(mkSb({ data: null, error: null }), lo, {}) === null && rpcArgs === null, 'run: cancelled dialog ⇒ no RPC');
  R.open = () => Promise.resolve({ reason: 'اللون غير مطابق', due: '' });
  const got = await R.run(mkSb({ data: { order: Object.assign({}, lo, { status: 'redo' }), redo: { id: 'rr', lab_order_id: 'o7', reason: 'اللون غير مطابق', redo_at: '2026-09-29T08:00:00Z' } }, error: null }), lo, { workType: 'تاج زيركون', patientName: 'سامي' });
  ok(rpcArgs && rpcArgs.fn === 'lab_order_redo' && rpcArgs.a.p_order === 'o7' && rpcArgs.a.p_reason === 'اللون غير مطابق' && rpcArgs.a.p_new_due === null, 'run: RPC lab_order_redo with order, reason, empty due ⇒ null');
  ok(got && got.status === 'redo' && R.count('o7') === 1, 'run: success returns the order and records the cycle locally');
  ok(audit && audit.a === 'lab.redo' && /اللون غير مطابق/.test(audit.o.description) && audit.o.newValue.status === 'redo', 'run: audit lab.redo with reason');
  toast = null;
  const bad = await R.run(mkSb({ data: null, error: { message: 'lab_redo_not_allowed' } }), lo, {});
  ok(bad === null && /المستلَمة/.test(toast || ''), 'run: state refusal ⇒ null + explicit message');

  /* ── (٣) السطحان الحيّان ── */
  const statusBlock = src => blockSrc(src, 'var LAB_NEXT_STATUS = {');
  async function runAdvance(file, src, arrName, status, statusFrom) {
    let payload = null, resent = null;
    const orders = [{ id: 'x1', status, date_sent: status === 'draft' ? null : '2026-07-30T00:00:00+00:00' }];
    const sb = { from() { const q = { update(p) { payload = p; return q; }, eq() { return q; }, select() { return q; }, single() { return Promise.resolve({ data: Object.assign({}, orders[0], payload), error: null }); } }; return q; } };
    const ctx = { window: { sb, SyLabRedo: { markResent: (id, iso) => { resent = { id, iso }; } } }, console: { warn() {} }, Date, Object, JSON, Promise,
      currentUser: { id: 'd1' }, showToast() {}, renderStats() {}, renderTable() {}, renderLabOrders() {}, renderTimeline() {},
      LAB_STATUSES: { sent: { ar: 'أُرسل' }, received: { ar: 'استُلم' } } };
    ctx[arrName] = orders; ctx.SyLabRedo = ctx.window.SyLabRedo;
    vm.createContext(ctx);
    vm.runInContext(statusBlock(statusFrom) + '\n' + fnSrc(src, 'async function _advanceLabOrder_inner(id) {'), ctx);
    await vm.runInContext("_advanceLabOrder_inner('x1')", ctx);
    return { payload, resent };
  }
  for (const [file, arr] of [['labs.html', 'allOrders'], ['pp-clinical.js', 'labOrders']]) {
    const src = F[file];
    const sf = file === 'labs.html' ? src : F['pp-core.js'];
    const r1 = await runAdvance(file, src, arr, 'redo', sf);
    ok(r1.payload && r1.payload.status === 'sent' && !('date_sent' in r1.payload) && r1.resent && r1.resent.id === 'x1', file + ': resend after redo writes no date_sent + marks the cycle resent');
    const r2 = await runAdvance(file, src, arr, 'draft', sf);
    ok(r2.payload && r2.payload.status === 'sent' && typeof r2.payload.date_sent === 'string' && r2.resent === null, file + ': first send of a draft still stamps date_sent');
    const redo = fnSrc(src, 'async function _redoLabOrder_inner(id) {') || '';
    ok(/SyLabRedo\.run\(window\.sb, lo,/.test(redo) && !/status:\s*'redo'/.test(src), file + ': redo goes through SyLabRedo.run only — no direct status:\'redo\' write');
    ok(/SyLabRedo\.line\(lo\.id\)/.test(src), file + ': row shows the redo line');
  }
  const L = F['labs.html'];
  ok((L.match(/redoLine/g) || []).length >= 3 && /grid-column:1\/-1;">' \+ redoLine/.test(L), 'labs.html: redo line in the table cell and the mobile card');

  /* ── (٤) القاعدة ── */
  const M = F['migrations/160_lab_order_redos.sql'];
  ok(/NEW\.date_sent\s*:=\s*COALESCE\(OLD\.date_sent, NEW\.date_sent\)/.test(M) && /NEW\.date_received\s*:=\s*NULL/.test(M) && /NEW\.date_checked\s*:=\s*NULL/.test(M) && /SET resent_at = now\(\)/.test(M),
     'M160: trigger keeps date_sent, clears the cycle dates, stamps resent_at');
  ok(/NEW\.status = 'redo' AND OLD\.status IS DISTINCT FROM 'redo'[\s\S]*INSERT INTO public\.lab_order_redos/.test(M), 'M160: every entry into redo (any path) records a cycle row');
  ok(/status IN \('received', 'checked'\)/.test(M) && /SECURITY INVOKER/.test(M) && /_sub_guard_table\('public\.lab_order_redos'\)/.test(M) && /REVOKE ALL ON FUNCTION public\.lab_order_redo[^;]*anon/.test(M),
     'M160: RPC only from received/checked · invoker (RLS) · subscription gate · no anon');
  ok(/\.gte\('date_sent', lo\)/.test(F['accounting.html']) && /date_sent/.test(F['provider-reports.html']), 'finance: lab cost windows still anchored on date_sent (no second formula)');

  /* ── (٥) الربط ── */
  for (const page of ['labs.html', 'patient-profile.html']) {
    const P = F[page], a = P.indexOf('<script src="lab-redo.js?v='), b = P.indexOf('<script src="sy-modal.js?v=');
    const consumer = page === 'labs.html' ? P.indexOf('function _redoLabOrder_inner') : P.indexOf('<script src="pp-clinical.js?v=');
    ok(a > b && b > -1 && a < consumer, page + ': lab-redo.js loaded after sy-modal.js and before its consumer');
    ok(!/id="lrd/.test(P), page + ': lrd- ids unique to the module');
  }
  ok(/lab-redo\\\.js/.test(F['scripts/cache-bust.sh']), 'cache-bust: lab-redo.js in the fleet allow-list');
  ok(/\.lrd-dialog \.lrd-chip\.on/.test(F['theme.css']) && /\.lrd-line \{/.test(F['theme.css']), 'theme.css: dialog + line kit');
  ok(/'lab\.redo'/.test(F['audit-log.html']) && /'lab\.redo'/.test(F['pp-extras.js']), 'audit: lab.redo in the filter family and the patient activity labels');
}

const FILES = ['lab-redo.js', 'labs.html', 'pp-clinical.js', 'pp-core.js', 'patient-profile.html', 'migrations/160_lab_order_redos.sql', 'accounting.html', 'provider-reports.html', 'scripts/cache-bust.sh', 'theme.css', 'audit-log.html', 'pp-extras.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });

const MUTANTS = [
  ['labs.html: resend stamps date_sent again', F => Object.assign({}, F, { 'labs.html': F['labs.html'].replace("if (nx.next === 'sent' && !wasRedo) update.date_sent = nowIso;", "if (nx.next === 'sent') update.date_sent = nowIso;") })],
  ['pp-clinical.js: resend stamps date_sent again', F => Object.assign({}, F, { 'pp-clinical.js': F['pp-clinical.js'].replace("if (nx.next === 'sent' && !wasRedo) update.date_sent = nowIso;", "if (nx.next === 'sent') update.date_sent = nowIso;") })],
  ['line: reason unescaped', F => Object.assign({}, F, { 'lab-redo.js': F['lab-redo.js'].replace('if (last.reason) parts.push(esc(last.reason));', 'if (last.reason) parts.push(last.reason);') })],
  ['suggestDue: no 60-day cap', F => Object.assign({}, F, { 'lab-redo.js': F['lab-redo.js'].replace('days > 60', 'days > 600') })],
  ['load: chunk 1000', F => Object.assign({}, F, { 'lab-redo.js': F['lab-redo.js'].replace('var CHUNK = 150;', 'var CHUNK = 1000;') })],
  ['run: cycle not recorded locally', F => Object.assign({}, F, { 'lab-redo.js': F['lab-redo.js'].replace('if (res.data.redo) (byOrder[lo.id] = byOrder[lo.id] || []).push(res.data.redo);', '') })],
  ['M160: trigger lets date_sent move', F => Object.assign({}, F, { 'migrations/160_lab_order_redos.sql': F['migrations/160_lab_order_redos.sql'].replace('NEW.date_sent      := COALESCE(OLD.date_sent, NEW.date_sent);', '') })],
  ['profile: script tag missing', F => Object.assign({}, F, { 'patient-profile.html': F['patient-profile.html'].replace(/<script src="lab-redo\.js\?v=[^"]+"><\/script>\n/, '') })]
];

(async () => {
  await suite(base);
  const basePass = pass, baseFail = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0;
      const log = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = log;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = basePass; fail = baseFail;
    const allBit = bit === MUTANTS.length;
    console.log((fail === 0 && allBit ? '✅' : '❌') + ' prove-lab-redo: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && allBit ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-redo: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();

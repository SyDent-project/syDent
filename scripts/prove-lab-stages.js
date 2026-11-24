/* ج3-أ — مثبتُ مراحل طلب المخبر (lab-stages.js · Migration 206) — مستقل، على الملفات الحيّة.
   (١) الوحدة: القوالب واقتراحُها من العلاج · قراءةُ الطلب (المرحلة الحالية · الأخيرة · التالية) · زرُّ الخطوة · سطرُ العرض مُهرَّب ·
       اقتراحُ الاستحقاق من مدّة المرحلة المنتهية (1..60) · منتقي المراحل (حذف · إضافة · قالب · المغلقةُ والحالية لا تُحذف · 2..8);
   (٢) run/undo: حوارٌ مُلغى ⇒ لا RPC · وسائطُ RPC (الفارغ ⇒ null) · رسائلُ الخطأ · سجلُّ النشاطات · التراجعُ بتأكيد;
   (٣) الحوار: الموعدُ يحكم الاستحقاق · استحقاقٌ بعد الموعد أو بتاريخٍ مضى مرفوض;
   (٤) السطحان الحيّان (labs.html · pp-clinical.js): زرُّ المرحلة يسبق سلّم الحالات · الانتقالُ عبر SyLabStages.run وحده ·
       التراجع · منتقي المراحل يُركَّب بالفتح والتعديل · المراحلُ تُلحق بالحمولة قبل الكتابة;
   (٥) إكمالُ الموعد لا يسلّم طلباً لم يبلغ مرحلتَه الأخيرة (المواعيد · لوحة التحكم) — واستعلامُ المواعيد يحمل id;
   (٦) القاعدة (ملف M206): date_sent لا يتحرّك بالانتقال ولا بالتراجع · تواريخُ الدورة تُفرَّغ · «تم التركيب» للأخيرة ·
       المغلقةُ تاريخٌ · RPC من استُلم/فُحص فقط · SECURITY INVOKER · بلا anon · نوافذُ الكلفة ما زالت date_sent;
   (٧) الربط: وسمُ السكربت قبل مستهلكه · cache-bust · theme.css · وضعُ القراءة · سجلُّ النشاطات · خطةُ الإقلاع.
   --self-test: الطفراتُ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت مراحل المخبر (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function loadMod(src) {
  const dom = new JSDOM('<body><div id="b"></div></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.console.warn = () => {};   /* تحذيراتُ الوحدة المتوقَّعة (RPC فاشل) لا تلوّث المخرجات */
  w.SyDT = { numDate: iso => { const d = new Date(iso); return d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); } };
  w.SyLabDue = { prevWorkDay: ymd => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); } };
  w.eval(src);
  return w;
}
function fnSrc(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2);
}
/* المحرّكُ الحقيقي للواجهة الإنجليزية (theme.js + i18n-en.js) — كما بـprove-denture */
function i18nEngine(F) {
  const store = { 'sydent.lang': 'en' }, el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/labs.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(), write() {}, querySelector: () => null, getElementById: () => null,
      addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {}; vm.createContext(ctx);
  const theme = F['theme.js'], start = theme.indexOf('/* ── SyI18n'), end = theme.indexOf('})();', start) + 5;
  vm.runInContext(F['i18n-en.js'], ctx); vm.runInContext(theme.slice(start, end), ctx);
  return { t: s => String(ctx.window.SyI18n.t(s)), dict: ctx.window.SyI18nDict };
}
const ymdLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymdLocal(d); };

async function suite(F) {
  /* ── (١) الوحدة ── */
  const w = loadMod(F['lab-stages.js']);
  const S = w.SyLabStages, box = w.document.getElementById('b');
  ok(!!S, 'module: window.SyLabStages exported');
  const keysOf = id => (S.template(id) || { keys: [] }).keys.join(',');
  ok(keysOf('full') === 'imp2,bite,tryin,fit' && keysOf('rpd_metal') === 'frame,tryin,fit' && keysOf('rpd_acr') === 'bite,tryin,fit' && keysOf('immediate') === 'bite,fit' && keysOf('fixed') === 'trial,fit'
    && S.TEMPLATES.every(t => t.keys.length >= S.MIN && t.keys.every(k => typeof S.NAMES[k] === 'string' && S.NAMES[k].length > 0) && t.keys[t.keys.length - 1] === 'fit'),
    'templates: the five built-ins, every key named, each ends at delivery');
  ok(S.suggest({ target_part: 'denture_full', name: 'جهاز متحرك كامل' }) === 'full' && S.suggest({ target_part: 'denture_partial', name: 'جهاز متحرك جزئي (هيكل معدني)' }) === 'rpd_metal'
    && S.suggest({ target_part: 'denture_partial', name: 'جهاز متحرك جزئي (أكريل)' }) === 'rpd_acr' && S.suggest({ target_part: 'denture_full' }, { immediate: true }) === 'immediate'
    && S.suggest({ target_part: 'crown', name: 'تاج زيركون' }) === '' && S.suggest(null) === '',
    'suggest: dentures get a template (immediate when the session is), everything else stays single-trip');
  const st4 = () => [{ k: 'imp2', n: 'طبعة نهائية', sent: '2026-10-20T00:00:00Z', due: '2026-10-25T00:00:00Z', received: '2026-10-25T00:00:00Z' }, { k: 'bite', n: 'تسجيل العضة', sent: '2026-11-01T00:00:00Z' }, { k: 'tryin', n: 'تجربة الأسنان' }, { k: 'fit', n: 'تسليم' }];
  const mk = (o) => Object.assign({ id: 'o1', patient_id: 'p1', work_type: 'جهاز', status: 'received', date_sent: '2026-10-20T00:00:00Z', date_due: '2026-11-06T00:00:00Z', date_received: '2026-11-05T10:00:00Z', stage_idx: 1, stages: st4() }, o || {});
  const lo = mk();
  ok(S.has(lo) && S.idx(lo) === 1 && S.cur(lo).k === 'bite' && !S.isFinal(lo) && S.nextStage(lo).k === 'tryin' && S.canAdvance(lo) && !S.canUndo(lo)
    && !S.has({ id: 'x', status: 'received' }) && S.isFinal({ id: 'x', status: 'received' }) && !S.has({ stages: [{ n: 'a' }], stage_idx: 0 }),
    'read: current/next/final from the order · an order without stages is final (single trip)');
  ok(JSON.stringify(S.next(lo)) === JSON.stringify({ next: 'stage', label: '📤 للمخبر: تجربة الأسنان' }) && JSON.stringify(S.next(mk({ status: 'checked' }))) === JSON.stringify(S.next(lo))
    && S.next(mk({ status: 'sent' })) === null && S.next(mk({ status: 'redo' })) === null && S.next(mk({ stage_idx: 3 })) === null && S.next({ status: 'received' }) === null,
    'next: after receipt a non-final stage sends the next one — never while at the lab, on the last stage, or without stages');
  ok(S.canUndo(mk({ status: 'sent' })) && !S.canUndo(mk({ status: 'sent', stage_idx: 0 })) && !S.canUndo(mk({ status: 'received' })) && !S.canUndo({ status: 'sent' }), 'canUndo: only at the lab, only past the first stage');
  const UNDO = '<button type="button" class="lst-undo" onclick="undoLabStage(\'o1\')">↩️ تراجع عن المرحلة</button>';
  const ln = S.line(mk({ stages: [{ n: '<img src=x onerror=1>' }, { n: 'تسليم' }], stage_idx: 0, status: 'sent' }), { tail: UNDO });
  ok(ln.indexOf('<img') === -1 && ln.indexOf('&lt;img') !== -1 && /lst-cur/.test(ln) && /عند المخبر/.test(ln) && !/lst-undo/.test(ln), 'line: stage names escaped · current stage carries its state · no undo on the first stage');
  const ln2 = S.line(mk({ status: 'sent' }), { tail: UNDO });
  ok((ln2.match(/lst-done/g) || []).length === 1 && (ln2.match(/lst-cur/g) || []).length === 1 && (ln2.match(/lst-todo/g) || []).length === 2 && /onclick="undoLabStage\('o1'\)"/.test(ln2)
    && /title="1\) طبعة نهائية — أُرسلت 20\/10\/2026 · استُلمت 25\/10\/2026/.test(ln2) && !/lst-undo/.test(S.line(mk({ status: 'sent' }))) && S.line({ id: 'z', status: 'sent' }) === '',
    'line: done ✓ · current · pending — title lists every stage with its dates · undo only where asked · nothing without stages');
  ok(/lst-done/.test(S.line(mk({ stage_idx: 3, status: 'delivered' }))) && !/lst-cur/.test(S.line(mk({ stage_idx: 3, status: 'delivered' }))), 'line: a delivered order shows every stage done');
  ok(S.suggestDue(mk(), '2026-11-15') === '2026-11-20' && S.suggestDue(mk({ date_due: null }), '2026-11-15') === '2026-11-19' && S.suggestDue(mk({ date_due: '2027-03-01T00:00:00Z' }), '2026-11-15') === ''
    && S.suggestDue(mk({ stage_idx: 0, date_due: '2026-10-27T00:00:00Z' }), '2026-11-15') === '2026-11-22',
    'suggestDue: the finished stage\'s own duration (its send → due, else → received), first stage from date_sent, capped at 60 days');
  /* المنتقي */
  S.mount(box, { suggest: 'full' });
  ok(JSON.stringify(S.read(box).stages) === JSON.stringify([{ k: 'imp2', n: 'طبعة نهائية' }, { k: 'bite', n: 'تسجيل العضة' }, { k: 'tryin', n: 'تجربة الأسنان' }, { k: 'fit', n: 'تسليم' }]) && box.querySelector('.lst-tpl').value === 'full',
    'picker: a suggested template fills the stages');
  box.querySelector('[data-lst-act="del"][data-lst-i="0"]').click();
  box.querySelector('.lst-new').value = '  <b>تجربة</b>   ثانية '; box.querySelector('[data-lst-act="add"]').click();
  const r1 = S.read(box).stages;
  ok(r1.length === 4 && r1[0].k === 'bite' && r1[3].n === '<b>تجربة</b> ثانية' && !('k' in r1[3]) && box.querySelector('.lst-tpl').value === 'custom' && !box.querySelector('.lst-edit b'),
    'picker: delete and add — custom names trimmed, kept as text (never markup), template becomes custom');
  for (let i = 0; i < 9; i++) { box.querySelector('.lst-new').value = 'م' + i; box.querySelector('[data-lst-act="add"]').click(); }
  ok(S.read(box).stages.length === S.MAX, 'picker: never more than eight stages');
  S.mount(box, { suggest: 'fixed' }); box.querySelector('[data-lst-act="del"][data-lst-i="0"]').click();
  ok(/مرحلتين على الأقل/.test(S.read(box).error || ''), 'picker: one stage is refused — two at least, or none');
  const selT = box.querySelector('.lst-tpl'); selT.value = ''; selT.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(S.read(box).stages === null && !box.querySelector('.lst-edit'), 'picker: «بلا مراحل» clears them');
  S.mount(box, { suggest: '' }); S.resuggest(box, 'rpd_acr');
  const sug = S.read(box).stages.length; box.querySelector('[data-lst-act="del"][data-lst-i="0"]').click(); S.resuggest(box, 'full');
  ok(sug === 3 && S.read(box).stages.length === 2, 'picker: changing the work type re-suggests — but never over a manual choice');
  S.mount(box, { order: lo });
  ok(JSON.stringify(S.read(box).stages) === JSON.stringify(lo.stages) && box.querySelectorAll('.lst-fixed').length === 2 && box.querySelectorAll('[data-lst-act="del"]').length === 2
    && box.querySelector('.lst-tpl option[value=""]').disabled === true, 'picker (edit): closed and current stages are locked, the rest removable, «بلا مراحل» disabled past the first stage');
  const pl = {}; ok(S.applyToPayload(box, pl, lo) === '' && !('stages' in pl), 'payload (edit): untouched stages are not written');
  box.querySelector('[data-lst-act="del"][data-lst-i="3"]').click();
  const pl2 = {}; S.applyToPayload(box, pl2, lo);
  ok(Array.isArray(pl2.stages) && pl2.stages.length === 3 && pl2.stages[0] === lo.stages[0] && pl2.stages[0].received === '2026-10-25T00:00:00Z', 'payload (edit): a changed list is written, closed stages byte-identical');
  S.mount(box, { suggest: 'full' }); const pl3 = {}; S.applyToPayload(box, pl3, null);
  S.mount(box, { suggest: '' }); const pl4 = {}; S.applyToPayload(box, pl4, null);
  ok(Array.isArray(pl3.stages) && pl3.stages.length === 4 && !('stage_idx' in pl3) && !('stages' in pl4), 'payload (create): stages only when chosen — the server starts them at the first');
  S.mount(box, { order: mk({ stage_idx: 0, status: 'sent' }) }); const selN = box.querySelector('.lst-tpl'); selN.value = ''; selN.dispatchEvent(new w.Event('change', { bubbles: true }));
  const pl5 = {}; S.applyToPayload(box, pl5, mk({ stage_idx: 0 }));
  ok(pl5.stages === null, 'payload (edit): stages can be dropped while still on the first stage');

  /* ── (٢) run / undo ── */
  let rpc = [], audit = [], toast = [];
  w.showToast = m => toast.push(m); w.logAudit = (a, d) => audit.push([a, d]);
  const sb = (resp) => ({ rpc: (n, a) => { rpc.push([n, a]); return Promise.resolve(typeof resp === 'function' ? resp(n, a) : resp); } });
  const realOpen = S.open;
  S.open = () => Promise.resolve(null);
  ok(await S.run(sb({ data: { id: 'o1' } }), lo, {}) === null && rpc.length === 0, 'run: a cancelled dialog writes nothing');
  ok(await S.run(sb({ data: { id: 'o1' } }), mk({ status: 'sent' }), {}) === null && rpc.length === 0, 'run: nothing to advance ⇒ no dialog, no RPC');
  S.open = () => Promise.resolve({ due: '', appt: '' });
  const row = Object.assign(mk({ status: 'sent', stage_idx: 2 }), { date_due: null });
  const out = await S.run(sb({ data: row }), lo, { workType: 'جهاز كامل', patientName: 'سامر' });
  ok(out === row && rpc.length === 1 && rpc[0][0] === 'lab_order_next_stage' && rpc[0][1].p_order === 'o1' && rpc[0][1].p_new_due === null && rpc[0][1].p_appt === null,
    'run: RPC lab_order_next_stage — empty due and appointment go as null');
  ok(audit.length === 1 && audit[0][0] === 'lab.stage' && audit[0][1].entityId === 'o1' && /تسجيل العضة ← تجربة الأسنان/.test(audit[0][1].description) && audit[0][1].newValue.status === 'sent', 'run: audit lab.stage names both stages');
  S.open = () => Promise.resolve({ due: '2026-12-01', appt: 'a9' }); rpc = [];
  await S.run(sb({ data: row }), lo, {});
  ok(rpc[0][1].p_new_due === '2026-12-01' && rpc[0][1].p_appt === 'a9', 'run: the chosen due date and appointment are passed');
  toast = []; audit = [];
  ok(await S.run(sb({ data: null, error: { message: 'lab_stage_bad_appt' } }), lo, {}) === null && /لا يعود لهذا المريض/.test(toast[0]) && audit.length === 0, 'run: a foreign appointment is named — nothing logged');
  toast = [];
  ok(await S.run(sb({ data: null, error: { message: 'lab_stage_not_allowed' } }), lo, {}) === null && /حالة الطلب تغيّرت/.test(toast[0]), 'run: a stale order asks for a refresh');
  toast = [];
  ok(await S.run(sb({ data: null, error: { message: 'boom' } }), lo, {}) === null && /فشل إرسال المرحلة التالية/.test(toast[0]), 'run: any other failure is said');
  S.open = realOpen;
  let asked = null; w.SyDialog = { confirm: o => { asked = o; return Promise.resolve(false); } }; rpc = [];
  ok(await S.undo(sb({ data: { id: 'o1' } }), mk({ status: 'sent' }), {}) === null && rpc.length === 0 && /«تسجيل العضة»/.test(asked.message) && /«طبعة نهائية»/.test(asked.message), 'undo: asks first, naming both stages — a refusal writes nothing');
  w.SyDialog = { confirm: () => Promise.resolve(true) }; audit = [];
  const back = Object.assign(mk({ status: 'received', stage_idx: 0 }));
  ok(await S.undo(sb({ data: back }), mk({ status: 'sent' }), {}) === back && rpc[0][0] === 'lab_order_prev_stage' && rpc[0][1].p_order === 'o1' && audit.length === 1 && /تراجع عن مرحلة مخبر/.test(audit[0][1].description), 'undo: RPC lab_order_prev_stage, logged');
  rpc = [];
  ok(await S.undo(sb({ data: back }), mk({ status: 'received' }), {}) === null && rpc.length === 0, 'undo: refused client-side once something was received');

  /* ── (٣) الحوار ── */
  const today = addDays(0), a5 = addDays(5), a9 = addDays(9);
  const p1 = S.open(mk({ date_due: null, date_received: null }), { workType: 'جهاز <كامل>', patientName: 'سامر', appts: [{ id: 'A1', date: a5 + 'T00:00:00', label: 'موعد <1>' }, { id: 'A2', date: a9, label: 'موعد 2' }] });
  const dlg = w.document.querySelector('.lst-dialog');
  ok(!!dlg && dlg.querySelector('.lst-next-n').textContent === 'تجربة الأسنان' && dlg.querySelector('.lst-next-lbl').textContent === 'المرحلة التالية' && /3 \/ 4/.test(dlg.querySelector('.lst-next-of').textContent) && !dlg.querySelector('.sy-dialog-msg b') && dlg.querySelectorAll('.lst-appt option').length === 3
    && dlg.querySelector('.lst-appt option[value="A1"]').textContent === 'موعد <1>', 'dialog: names the next stage and its position · labels are text');
  const dsel = dlg.querySelector('.lst-appt'), ddue = dlg.querySelector('.lst-due');
  dsel.value = 'A1'; dsel.dispatchEvent(new w.Event('change'));
  ok(ddue.value === addDays(4), 'dialog: picking the visit sets the due date to the working day before it');
  ddue.value = addDays(6); dlg.querySelector('[data-lst-act="ok"]').click();
  ok(!dlg.querySelector('.lst-err').hidden && /لا يكون بعد موعد المريض/.test(dlg.querySelector('.lst-err').textContent) && !!w.document.querySelector('.lst-dialog'), 'dialog: a due date after the visit is refused');
  ddue.value = addDays(-1); dlg.querySelector('[data-lst-act="ok"]').click();
  ok(/بتاريخٍ مضى/.test(dlg.querySelector('.lst-err').textContent), 'dialog: a past due date is refused');
  ddue.value = addDays(3); dlg.querySelector('[data-lst-act="ok"]').click();
  const picked = await p1;
  ok(picked && picked.due === addDays(3) && picked.appt === 'A1' && !w.document.querySelector('.lst-dialog'), 'dialog: confirm returns the due date and the appointment');
  const p2 = S.open(mk(), {}); const dlg2 = w.document.querySelector('.lst-dialog');
  ok(!dlg2.querySelector('.lst-appt') && dlg2.querySelector('.lst-due').value >= today, 'dialog: no appointment list when the patient has none · due suggested from the last stage');
  dlg2.querySelector('[data-lst-act="cancel"]').click();
  ok(await p2 === null, 'dialog: cancel resolves null');

  /* ── (٤) السطحان الحيّان ── */
  for (const file of ['labs.html', 'pp-clinical.js']) {
    const src = F[file], adv = fnSrc(src, 'async function _advanceLabOrder_inner(id) {') || '', und = fnSrc(src, 'async function _undoLabStage_inner(id) {') || '';
    ok(src.indexOf("var nx = (window.SyLabStages && SyLabStages.next(lo)) || LAB_NEXT_STATUS[lo.status];") > -1, file + ': the row asks the stage module before the status ladder');
    /* v737: اسمُ المرحلة التالية نصُّ العيادة (مرحلةٌ مخصّصة) — السطرُ الحيّ لزرّ الخطوة يُنفَّذ باسمٍ فيه HTML: يصل مهرَّباً، لا عنصرَ منه */
    const mBtn = src.match(/actions \+= ('<button class="sy-act sy-act-primary" data-slot="1"'[^\n]*?'<\/button>');/);
    const escH = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let btnHtml = '';
    const loX = mk({ status: 'received', stage_idx: 0, stages: [{ k: 'bite', n: 'تسجيل العضة' }, { n: '<img src=x onerror=alert(1)>' }] });
    if (mBtn) { try { btnHtml = new Function('lo', 'nx', 'canRedo', 'escapeHtml', 'return ' + mBtn[1] + ';')(loX, S.next(mk({ status: 'received', stage_idx: 0, stages: [{ k: 'bite', n: 'تسجيل العضة' }, { n: '<img src=x onerror=alert(1)>' }] })), true, escH); } catch (e) { btnHtml = ''; } }
    ok(!!btnHtml && btnHtml.indexOf('<img') === -1 && btnHtml.indexOf('📤 للمخبر: &lt;img src=x onerror=alert(1)&gt;</button>') > -1 && /onclick="advanceLabOrder\('o1'\)"/.test(btnHtml),
      file + ': the next stage name reaches the step button escaped — clinic text never becomes HTML');
    const iS = adv.indexOf('if (window.SyLabStages && SyLabStages.next(lo)) {'), iL = adv.indexOf('var nx = LAB_NEXT_STATUS[lo.status];');
    ok(iS > -1 && iS < iL && /SyLabStages\.run\(window\.sb, lo, \{/.test(adv) && /appts: labStageAppts\(/.test(adv) && /if \(!_stRow\) return;/.test(adv), file + ': advance goes through SyLabStages.run before any status write');
    ok(!/stage_idx\s*:/.test(src) && !/lab_order_next_stage|lab_order_prev_stage/.test(src), file + ': no direct stage write — the module and its RPCs only');
    ok(/SyLabStages\.undo\(window\.sb, lo,/.test(und) && /if \(!data\) return;/.test(und), file + ': undo goes through SyLabStages.undo');
    ok(src.indexOf("SyLabStages.line(lo, { tail: (SyLabStages.canUndo(lo) ? '<button type=\"button\" class=\"lst-undo\" onclick=\"undoLabStage(\\'' + lo.id + '\\')\"") > -1, file + ': the row shows the stage line with its own undo button');
    ok(/workSelect: document\.getElementById\('labOrderWorkType'\), suggestFn: /.test(src) && !/_lstWired/.test(src), file + ': re-suggestion on work-type change is wired by the module');
    ok(/labStagesMount\(null\);   \/\* ج3-أ \*\/\n  labStatusMount\(null\);   \/\* M207 \*\/\n  openModal\('labOrderModal'\);/.test(src) && /labStagesMount\(lo\);   \/\* ج3-أ \*\/\n  labStatusMount\(lo\);   \/\* M207 \*\/\n  openModal\('labOrderModal'\);/.test(src), file + ': the picker is mounted on new and on edit');
    const iP = src.indexOf("SyLabStages.applyToPayload(document.getElementById('labStagesBox'), payload, _prevLo);"), iW = src.indexOf(".update(payload).eq('id', id)");
    ok(iP > -1 && iW > iP && /if \(_stErr\) \{ showToast\('⚠️ ' \+ _stErr\); return; \}/.test(src), file + ': stages join the payload before the write · an invalid list stops the save');
  }
  ok(/window\.SyDenture\.isImmediate\(s\)/.test(F['pp-clinical.js']) && /isImmediate: function \(s\) \{ return dentOpenExtractions\(dentSessTeeth\(s\)\)\.length > 0; \}/.test(F['pp-denture.js']), 'profile: an immediate denture session suggests the immediate template');

  /* ── (٥) إكمالُ الموعد ── */
  const AP = F['appointments.html'], AT = F['appt-time.js'], IX = F['index.html'];
  ok(/var _labSel = 'id, patient_id, appointment_id, status, date_due, work_type, lab_name, lab_id, tooth_num, stages, stage_idx';/.test(AP), 'appointments: the lab query carries id and the stage columns');
  const auto = fnSrc(AT, 'async function autoDeliverLinkedLabs(apptId) {') || '';
  ok(/if \(!lo\.id \|\| labStageOpen\(lo\)\) continue;/.test(auto) && auto.indexOf('labStageOpen(lo)) continue;') < auto.indexOf(".update({ status: 'delivered'"), 'appointments: completing a visit never delivers an order that is not on its last stage');
  ok(/function labStageOpen\(o\) \{\n  return !!\(o && Array\.isArray\(o\.stages\) && o\.stage_idx != null && o\.stage_idx < o\.stages\.length - 1\);\n\}/.test(AT)
    && (AT.match(/&& !labStageOpen\(o\)/g) || []).length === 1 && (AP.match(/&& !labStageOpen\(o\)/g) || []).length === 1, 'appointments: the completion lists leave those orders out');
  ok(/\.select\('id, status, work_type, tooth_num, stages, stage_idx'\)/.test(IX) && /labsList = labsList\.filter\(function \(o\) \{ return !\(Array\.isArray\(o\.stages\) && o\.stage_idx != null && o\.stage_idx < o\.stages\.length - 1\); \}\);/.test(IX), 'dashboard: same rule on check-out');

  /* ── (٦) القاعدة ── */
  const M = F['migrations/206_lab_order_stages.sql'];
  const adv = M.slice(M.indexOf('IF NEW.stage_idx = OLD.stage_idx + 1 THEN'), M.indexOf('ELSIF NEW.stage_idx = OLD.stage_idx - 1 THEN'));
  const bck = M.slice(M.indexOf('ELSIF NEW.stage_idx = OLD.stage_idx - 1 THEN'), M.indexOf('ELSIF NEW.stage_idx <> OLD.stage_idx THEN'));
  ok(/OLD\.status NOT IN \('received', 'checked'\) OR NEW\.status <> 'sent'/.test(adv) && /NEW\.date_sent\s+:= OLD\.date_sent;/.test(adv) && /NEW\.date_received\s+:= NULL;/.test(adv) && /NEW\.date_checked\s+:= NULL;/.test(adv) && /NEW\.date_delivered := NULL;/.test(adv),
    'M206: next stage only from received/checked to sent — date_sent pinned, cycle dates cleared');
  ok(/'received', to_char\(OLD\.date_received/.test(adv) && /'appt',\s+OLD\.appointment_id/.test(adv) && /jsonb_build_object\('sent', to_char\(now\(\)/.test(adv), 'M206: the closed stage is stamped with its dates and visit, the new one with its send time');
  ok(/IF OLD\.status <> 'sent' THEN RAISE EXCEPTION 'lab_stage_not_allowed'/.test(bck) && /NEW\.date_sent\s+:= OLD\.date_sent;/.test(bck) && /NEW\.date_received\s+:= \(prv ->> 'received'\)::timestamptz;/.test(bck)
    && /NEW\.status\s+:= CASE WHEN prv ->> 'checked' IS NOT NULL THEN 'checked' ELSE 'received' END;/.test(bck), 'M206: undo only while at the lab — restores the previous stage, date_sent pinned');
  ok(/ELSIF NEW\.stage_idx <> OLD\.stage_idx THEN\s+RAISE EXCEPTION 'lab_stage_not_allowed'/.test(M) && /NEW\.status = 'delivered' AND OLD\.status IS DISTINCT FROM 'delivered' AND NEW\.stage_idx < n - 1 THEN\s+RAISE EXCEPTION 'lab_stage_not_final'/.test(M),
    'M206: no stage jumps · delivered only on the last stage');
  ok(/COALESCE\(OLD\.stage_idx, 0\) > 0 THEN\s+RAISE EXCEPTION 'lab_stage_history_locked'/.test(M) && /NEW\.stages := jsonb_set\(NEW\.stages, ARRAY\[i::text\], OLD\.stages -> i\);/.test(M), 'M206: closed stages are history — not dropped, not rewritten');
  ok(/jsonb_array_length\(stages\) BETWEEN 2 AND 8/.test(M) && /char_length\(btrim\(e ->> 'n'\)\) NOT BETWEEN 1 AND 40/.test(M) && /\(stages IS NULL AND stage_idx IS NULL\)/.test(M), 'M206: shape — none, or 2..8 named stages with a valid index');
  ok(/WHERE id = p_order AND stages IS NOT NULL AND status IN \('received', 'checked'\)\s+AND stage_idx < jsonb_array_length\(stages\) - 1/.test(M) && (M.match(/RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public/g) || []).length === 2 && !/SECURITY DEFINER/.test(M)
    && /a\.doctor_id = l\.doctor_id AND a\.patient_id = l\.patient_id/.test(M) && /REVOKE ALL ON FUNCTION public\.lab_order_next_stage\(uuid, timestamptz, uuid\) FROM PUBLIC, anon;/.test(M)
    && /REVOKE ALL ON FUNCTION public\.lab_order_prev_stage\(uuid\) FROM PUBLIC, anon;/.test(M) && /REVOKE ALL ON FUNCTION public\.lab_orders_stage_cycle\(\) FROM PUBLIC, anon, authenticated;/.test(M),
    'M206: RPCs are invoker (RLS and the subscription gate apply), same-patient appointment only, no anon');
  ok(/CREATE TRIGGER trg_lab_orders_stage_cycle\s+BEFORE INSERT OR UPDATE ON public\.lab_orders/.test(M) && 'trg_lab_orders_redo_cycle' < 'trg_lab_orders_stage_cycle' && !/lab_orders_redo_cycle\(\)\s+RETURNS/.test(M) && !/cost|currency|payment/i.test(M.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'M206: its own trigger, firing after the redo one, the redo function untouched — no money column anywhere');
  ok(/\.gte\('date_sent', lo\)/.test(F['accounting.html']) && /date_sent/.test(F['provider-reports.html']), 'finance: lab cost windows still anchored on date_sent (no second formula)');
  ok(/"stages" "jsonb",\n    "stage_idx" smallint,/.test(F['db/schema.sql']) && /CONSTRAINT "lab_orders_stages_shape" CHECK/.test(F['db/schema.sql'])
    && /'migrations\/205_portal_info_arch_teeth\.sql',[^\n]*\n    'migrations\/206_lab_order_stages\.sql',/.test(F['scripts/db-bootstrap.py']), 'M206: mirrored in the schema snapshot and registered in the bootstrap plan after M205');

  /* ── (٧) الربط ── */
  for (const page of ['labs.html', 'patient-profile.html']) {
    const P = F[page], a = P.indexOf('<script src="lab-stages.js?v='), b = P.indexOf('<script src="sy-modal.js?v='), r = P.indexOf('<script src="lab-redo.js?v=');
    const consumer = page === 'labs.html' ? P.indexOf('function _advanceLabOrder_inner') : P.indexOf('<script src="pp-clinical.js?v=');
    ok(a > b && b > -1 && a > r && a < consumer, page + ': lab-stages.js loaded after sy-modal.js and before its consumer');
    ok(!/id="lst[A-Z]/.test(P) && (P.match(/id="labStagesBox"/g) || []).length === 1, page + ': one picker box · lst- ids unique to the module');
  }
  ok(/lab-redo\\\.js\|lab-stages\\\.js\|lab-due\\\.js/.test(F['scripts/cache-bust.sh']) && (F['scripts/cache-bust.sh'].match(/lab-stages\\\.js/g) || []).length === 2, 'cache-bust: lab-stages.js in the fleet allow-list (scan and rewrite)');
  ok(/\.lst-line \.lst-st\.lst-cur \{/.test(F['theme.css']) && /\.lst-dialog \.lst-err \{/.test(F['theme.css']) && /\.lst-box \.lst-chip\.lst-fixed \{/.test(F['theme.css']), 'theme.css: line + picker + dialog kit');
  ok(/\[onclick\*="undoLabStage\("\]/.test(F['labs.html']) && /\[onclick\*="undoLabStage\("\]/.test(F['patient-profile.css']) && (F['scripts/check-mirrors.js'].match(/undoLabStage/g) || []).length === 2, 'read-only mode: the undo button is a write on both pages');
  ok(/'lab\.stage'/.test(F['audit-log.html']) && /'lab\.stage': '📤 مرحلة مخبر'/.test(F['pp-extras.js']), 'audit: lab.stage in the filter family and the patient activity labels');

  /* ── (٨) الواجهة الإنجليزية: كلُّ نصٍّ تبنيه الوحدة يمرّ بالمحرّك الحقيقي — لا حرفَ عربياً إلا اسمَ مرحلةٍ كتبه الطبيب ── */
  const E = i18nEngine(F), AR = /[\u0600-\u06FF]/, CUSTOM = 'تجربة ثانية';
  const w2 = loadMod(F['lab-stages.js']); w2.SyI18n = { lang: 'en' };
  const S2 = w2.SyLabStages, box2 = w2.document.getElementById('b'), seen = {};
  const add = s => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (s && AR.test(s)) seen[s] = 1; };
  const grab = root => { [root].concat(Array.from(root.querySelectorAll('*'))).forEach(el => {
    ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v) add(v); });
    for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) add(c.nodeValue); }); };
  const stC = st4().concat([{ n: CUSTOM }]);
  const holder = w2.document.createElement('div');
  ['draft', 'sent', 'redo', 'received', 'checked'].forEach(s => { holder.innerHTML = S2.line(mk({ status: s, stages: stC, date_sent: s === 'draft' ? null : '2026-10-20T00:00:00Z' }), { tail: UNDO }); grab(holder); });
  holder.innerHTML = S2.line(mk({ status: 'delivered', stage_idx: 4, stages: stC })); grab(holder);
  const enLine = S2.line(mk({ status: 'sent' }), { tail: UNDO });
  ok(/Final impression/.test(enLine) && /Bite registration/.test(enLine) && /Teeth try-in/.test(enLine) && />Fit</.test(enLine) && !/طبعة نهائية<|تسليم</.test(enLine), 'i18n: built-in stages are shown in English by their key');
  ok(S2.disp({ k: 'fit', n: 'تسليم الجهاز' }) === 'تسليم الجهاز' && S2.disp({ n: CUSTOM }) === CUSTOM && S.disp({ k: 'fit', n: 'تسليم' }) === 'تسليم', 'i18n: a renamed or custom stage stays as written · Arabic UI unchanged');
  S2.mount(box2, { suggest: 'full' }); grab(box2);
  S2.mount(box2, { order: mk({ stages: stC }) }); grab(box2);
  S2.mount(box2, { suggest: '' }); grab(box2);
  ['full', 'rpd_metal', 'rpd_acr', 'immediate', 'fixed'].forEach(id => add(S2.template(id).name));
  const pE = S2.open(mk({ stages: stC }), { workType: 'W', appts: [{ id: 'A', date: addDays(3), label: 'L' }] }); const dE = w2.document.querySelector('.lst-dialog');
  dE.querySelector('.lst-due').value = addDays(-1); dE.querySelector('[data-lst-act="ok"]').click(); grab(dE);
  dE.querySelector('.lst-appt').value = 'A'; dE.querySelector('.lst-due').value = addDays(5); dE.querySelector('[data-lst-act="ok"]').click(); grab(dE);
  dE.querySelector('[data-lst-act="cancel"]').click(); await pE;
  const tE = []; w2.showToast = m => tE.push(m); w2.logAudit = () => {};
  S2.open = () => Promise.resolve({ due: '', appt: '' });
  for (const msg of ['lab_stage_bad_appt', 'lab_stage_not_allowed', 'boom']) await S2.run({ rpc: () => Promise.resolve({ data: null, error: { message: msg } }) }, mk(), {});
  let dlgE = null; w2.SyDialog = { confirm: o => { dlgE = o; return Promise.resolve(true); } };
  await S2.undo({ rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }, mk({ status: 'sent' }), {});
  await S2.undo({ rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }, mk({ status: 'sent', stage_idx: 4, stages: stC }), {});
  tE.forEach(add); [dlgE.title, dlgE.confirmText, dlgE.cancelText].forEach(add); String(dlgE.message).split('\n').forEach(add);
  ['لا تُحذف المراحل بعد إنجاز أولاها', 'العمل بمراحل يحتاج مرحلتين على الأقل — أو اختر «بلا مراحل»', 'ثماني مراحل على الأكثر'].forEach(m => add('⚠️ ' + m));
  [S2.next(mk()).label, S2.next(mk({ stage_idx: 3, stages: stC })).label, '📤 أُرسلت مرحلة «تجربة الأسنان» للمخبر', '📤 أُرسلت مرحلة «' + CUSTOM + '» للمخبر', '↩️ عاد الطلب إلى مرحلة «تسجيل العضة»', '📤 مرحلة مخبر'].forEach(add);
  /* مصدرا رسالتَي الصفحتين كما بالكود */
  for (const file of ['labs.html', 'pp-clinical.js']) ok(F[file].indexOf("showToast('📤 أُرسلت مرحلة «' + SyLabStages.cur(_stRow).n + '» للمخبر');") > -1 && F[file].indexOf("showToast('↩️ عاد الطلب إلى مرحلة «' + SyLabStages.cur(data).n + '»');") > -1, file + ': stage toasts as the translator expects them');
  const all = Object.keys(seen), left = all.filter(s => AR.test(E.t(s).split(CUSTOM).join('')));
  ok(all.length >= 40 && left.length === 0, 'i18n: ' + all.length + ' stage texts through the real engine — no Arabic left outside a custom stage name' + (left.length ? ' → ' + left.slice(0, 4).join(' | ') : ''));
  ok(all.every(s => { const a = (s.match(/\d+/g) || []).sort().join(','), b = (E.t(s).match(/\d+/g) || []).sort().join(','); return a === b; }), 'i18n: every number survives');
  ok(E.t('📤 للمخبر: ' + CUSTOM) === '📤 To lab: ' + CUSTOM && E.t('↩️ عاد الطلب إلى مرحلة «تسليم»') === '↩️ The order is back on stage «Fit»'
    && E.t('1) طبعة نهائية — أُرسلت 20/10/2026 · استُلمت 25/10/2026 2) ' + CUSTOM + ' — أُرسلت 1/11/2026 3) تسليم') === '1) Final impression — sent 20/10/2026 · received 25/10/2026 2) ' + CUSTOM + ' — sent 1/11/2026 3) Fit',
    'i18n: wording — button, toast and the stage tooltip');
  ok(E.dict['تجربة'] === undefined && E.dict['تسليم'] === undefined && E.dict['المرحلة'] === undefined, 'i18n: no ambiguous single word («تجربة» is also a plan name) leaks into the shared dictionary');

  /* ── (٩) ج3-ب: ورقةُ المخبر (المرحلة + موضعُ الجهاز) · خانةُ السن لطلب الجهاز · تنبيهُ الموعد · لوحةُ التحكم ── */
  const ws = loadMod(F['lab-slip.js'] + '\n' + F['lab-stages.js']);
  const L = ws.SyLabSlip, S3 = ws.SyLabStages, box3 = ws.document.getElementById('b');
  const fullU = '17,16,15,14,13,12,11,21,22,23,24,25,26,27';
  ok(L.area({ arch: 'U', unit_teeth: fullU }).text === 'الفك العلوي — كامل' && L.area({ arch: 'L', unit_teeth: '36,34,35' }).text === 'الفك السفلي — الأسنان 34، 35، 36'
    && L.area({ arch: 'L', unit_teeth: '34' }).text === 'الفك السفلي — السن 34' && L.area({ arch: 'L', unit_teeth: '36,34' }).teeth.join(',') === '34,36',
    'slip area: complete arch · sorted teeth · single tooth');
  ok(L.area({ arch: 'U', unit_teeth: fullU, tooth_num: 14 }) === null && L.area({ arch: 'U', unit_teeth: '' }) === null && L.area({ arch: 'X', unit_teeth: '14' }) === null && L.area(null) === null
    && L.area({ arch: 'U', unit_teeth: 'abc,99' }) === null, 'slip area: only a jaw session with unit teeth — anything else is null');
  /* مرآةُ dentAreaText بـpp-denture.js: الدالةُ الأصل تُستخرج من ملفها الحيّ وتُقارَن */
  const pd = F['pp-denture.js'], dctx = {}; vm.createContext(dctx);
  vm.runInContext(pd.slice(pd.indexOf('var DENT_FULL_TEETH = {'), pd.indexOf('};', pd.indexOf('var DENT_FULL_TEETH = {')) + 2) + '\n'
    + pd.match(/function dentArchLabel\(arch\) \{[^\n]*\}/)[0] + '\n' + fnSrc(pd, 'function dentIsFullSet(teeth, arch) {') + '\n' + fnSrc(pd, 'function dentAreaText(arch, teeth) {'), dctx);
  ok([['U', fullU], ['L', '47,46,45,44,43,42,41,31,32,33,34,35,36,37'], ['U', '14,15,16'], ['L', '36'], ['U', '27,11'], ['U', fullU.replace('17,', '')]]
    .every(([a, t]) => L.area({ arch: a, unit_teeth: t }).text === dctx.dentAreaText(a, t.split(','))), 'slip area: the same text as dentAreaText in pp-denture.js (mirror)');
  const slipA = L.build({ patientName: 'P', workType: 'W', teeth: [34, 35], area: 'الفك السفلي — الأسنان 34، 35', stage: { name: 'تسجيل <b>', pos: 2, total: 4, all: ['طبعة نهائية', 'تسجيل <b>', 'تجربة الأسنان', 'تسليم'] } });
  ok(/<th>الأسنان<\/th><td colspan="3">الفك السفلي — الأسنان 34، 35<\/td>/.test(slipA) && /<th>المرحلة المطلوبة<\/th><td colspan="3"><strong>تسجيل &lt;b&gt;<\/strong> <span class="lsl-muted">\(2 من 4\)<\/span>/.test(slipA)
    && /طبعة نهائية ← تسجيل &lt;b&gt; ← تجربة الأسنان ← تسليم/.test(slipA) && slipA.indexOf('<b>') === -1 && (slipA.match(/lsl-t on/g) || []).length === 2,
    'slip: the denture location replaces the bare numbers, its teeth are shaded, the requested stage and the sequence are printed — escaped');
  const slipB = L.build({ patientName: 'P', workType: 'W', teeth: [14] });
  ok(!/المرحلة المطلوبة/.test(slipB) && /<th>الأسنان<\/th><td colspan="3">14<\/td>/.test(slipB), 'slip: an order without stages or a denture prints exactly as before');
  ws.document.body.insertAdjacentHTML('beforeend', '<select id="labOrderWorkType"><option value="k" selected>W</option></select><input id="labOrderTooth" value=""><input id="labOrderShade"><input id="labOrderDateSent"><input id="labOrderDateDue"><textarea id="labOrderNotes"></textarea>');
  const ff = L.fromForm({ patientName: 'P', area: { text: 'الفك العلوي — كامل', teeth: [11, 12] }, stage: { name: 'x', pos: 1, total: 2 } });
  ws.document.getElementById('labOrderTooth').value = '21';
  const ff2 = L.fromForm({ patientName: 'P', area: { text: 'الفك العلوي — كامل', teeth: [11, 12] } });
  ok(ff.area === 'الفك العلوي — كامل' && ff.teeth.join(',') === '11,12' && ff.stage.name === 'x' && ff2.area === '' && ff2.teeth.join(',') === '21' && ff2.stage === null,
    'slip form: the session location is used only when the order has no tooth number');
  const calls = [];
  const fakeSb = { from: t => ({ select: c => ({ eq: (k, v) => ({ in: (k2, ids) => { calls.push([t, c, k, v, ids.slice()]); return Promise.resolve({ data: [{ id: 's1', arch: 'U', unit_teeth: fullU, tooth_num: null }, { id: 's2', arch: 'U', unit_teeth: null, tooth_num: null }], error: null }); } }) }) }) };
  const ords = [{ id: 'a', session_id: 's1' }, { id: 'b', session_id: 's2' }, { id: 'c', session_id: 's3', tooth_num: 14 }, { id: 'd' }];
  const got = await L.loadAreas(fakeSb, 'u1', ords), again = await L.loadAreas(fakeSb, 'u1', ords);
  ok(got === true && again === false && calls.length === 1 && calls[0][0] === 'ledger_sessions' && calls[0][2] === 'doctor_id' && calls[0][3] === 'u1' && calls[0][4].join(',') === 's1,s2'
    && L.areaOf(ords[0]).text === 'الفك العلوي — كامل' && L.areaOf(ords[1]) === null && L.areaOf(ords[2]) === null && L.areaOf(ords[3]) === null,
    'slip areas: one tenant-scoped read for toothless session orders only · asked once · a normal jaw session gives nothing');
  S3.mount(box3, { suggest: 'full' });
  const fsNew = S3.forSlip(box3, null);
  S3.mount(box3, { order: mk({ stage_idx: 2 }) });
  const fsCur = S3.forSlip(box3, mk({ stage_idx: 2 }));
  S3.mount(box3, { suggest: '' });
  ok(fsNew.name === 'طبعة نهائية' && fsNew.pos === 1 && fsNew.total === 4 && fsNew.all.length === 4 && fsCur.name === 'تجربة الأسنان' && fsCur.pos === 3 && fsCur.total === 4 && S3.forSlip(box3, null) === null, 'slip stage: the first stage of a new order · the current one of a saved order · none without stages');
  for (const [file, arr] of [['labs.html', 'allOrders'], ['pp-clinical.js', 'labOrders']]) {
    const sp = fnSrc(F[file], 'function labSlipPrint() {') || '';
    ok(/area: /.test(sp) && sp.indexOf("stage: window.SyLabStages ? SyLabStages.forSlip(document.getElementById('labStagesBox'), id ? " + arr + ".find(function (x) { return x.id === id; }) : null) : null") > -1, file + ': the slip gets the location and the requested stage');
  }
  ok(/SyLabSlip\.loadAreas\(window\.sb, currentUser\.id, allOrders\)\s+\.then\(function\(got\)\{ if \(got\) \{ try \{ renderTable\(\); \}/.test(F['labs.html'])
    && F['labs.html'].indexOf("(labArea ? '<span class=\"tooth-badge lab-area\">' + escapeHtml(labArea.text) + '</span>' : '—')") > -1 && F['labs.html'].indexOf("(lo.tooth_num ? escapeHtml(((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.num(lo.tooth_num) : String(lo.tooth_num))) : (labArea ? escapeHtml(labArea.text) : '—'))") > -1   /* ج2: السنُّ الزائد باسمه */,
    'labs.html: denture orders show their jaw and teeth in the tooth cell (table and card) — loaded after the table, escaped');
  ok(/function labOrderArea\(lo\) \{\n  if \(!lo \|\| lo\.tooth_num \|\| !lo\.session_id/.test(F['pp-clinical.js']) && F['pp-clinical.js'].indexOf("var _labAr = toothChip ? null : labOrderArea(lo);") > -1
    && F['pp-clinical.js'].indexOf("' + escapeHtml(_labAr.text) + '</span>';") > -1, 'pp-clinical.js: the same location from the loaded session, in place of the tooth chip — escaped');
  /* تنبيهُ المخبر على الموعد: الدالةُ الحيّة تُشغَّل على حالات */
  const bctx = { labOrdersByAppt: {}, labOrdersByPatient: {}, dateStr: d => ymdLocal(d), escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  vm.createContext(bctx);
  vm.runInContext(fnSrc(F['appt-time.js'], 'function labStageOpen(o) {') + '\n' + fnSrc(F['appt-time.js'], 'function labStageName(o) {') + '\n' + fnSrc(F['appointments.html'], 'function labApptState(o, apptDate, linkedDirectly) {') + '\n' + fnSrc(F['appointments.html'], 'function getApptLabBadge(appt) {'), bctx);
  const badge = (orders, direct) => { bctx.labOrdersByAppt = direct === false ? {} : { A: orders }; bctx.labOrdersByPatient = direct === false ? { p1: orders } : {}; return bctx.getApptLabBadge({ id: 'A', patient_id: 'p1', date: addDays(2) }); };
  const s3 = [{ n: 'تسجيل العضة' }, { n: 'تجربة <i>' }, { n: 'تسليم' }];
  const bMid = badge([{ status: 'received', stages: s3, stage_idx: 1 }]), bFit = badge([{ status: 'checked', stages: s3, stage_idx: 2 }]), bOld = badge([{ status: 'checked' }]), bOldU = badge([{ status: 'checked' }], false);
  ok(bMid.tone === 'green' && bMid.title === 'شغل المخبر جاهز لهذا الموعد — تجربة &lt;i&gt;' && bFit.title === 'شغل المخبر جاهز للتركيب في هذا الموعد — تسليم'
    && bOld.title === 'شغل المخبر جاهز للتركيب في هذا الموعد' && bOldU.title === 'يوجد شغل جاهز للتركيب من المخبر',
    'appointment badge: a received mid stage is ready for its visit (not «to fit») and named — escaped · the last stage and plain orders read as before');
  /* بلاغ المالك (19 تشرين الثاني): استحقاقٌ قبل الموعد لم يفت = سليم (كان «متأخر» لحظة الإنشاء) · فات = متأخر · بعد الموعد = برتقالي */
  const bLate = badge([{ status: 'sent', date_due: addDays(-1), stages: s3, stage_idx: 0 }]), bPend = badge([{ status: 'sent', date_due: addDays(1), stages: s3, stage_idx: 0 }]),
    bRisk = badge([{ status: 'sent', date_due: addDays(9), stages: s3, stage_idx: 0 }]), bRedo = badge([{ status: 'redo', date_due: addDays(-2) }]), bPendOld = badge([{ status: 'received' }]),
    bMix = badge([{ status: 'received', stages: s3, stage_idx: 0 }, { status: 'checked' }]);
  ok(bLate.tone === 'red' && bLate.title === 'متأخر: عمل المخبر المرتبط بهذا الموعد لم يصل، وفات تاريخ استحقاقه أو حلّ يوم الموعد — تسجيل العضة'
    && bPend.tone === 'blue' && bPend.title === 'طلب مخبر مرتبط بهذا الموعد — تسجيل العضة'
    && bRisk.tone === 'orange' && bRisk.title === 'الاستحقاق بعد الموعد: تاريخ استحقاق طلب المخبر بعد يوم هذا الموعد — قد لا يصل العمل في وقته — تسجيل العضة'
    && bRedo.tone === 'red' && bPendOld.tone === 'blue' && bPendOld.title === 'طلب مخبر مرتبط بهذا الموعد' && bMix.title === 'شغل المخبر جاهز للتركيب في هذا الموعد — تسجيل العضة',
    'appointment badge: due before the appointment and not passed is fine (not «late» at creation) · passed = late · due after the appointment = orange · a redo back at the lab counts · stages named');
  ok((F['appt-views.js'].match(/اسمُ مرحلةٍ مهرَّب بالمصدر/g) || []).length === 4 && !/عناوين ثابتة \*\//.test(F['appt-views.js']), 'appt-views.js: the xss notes state the escaped stage name at every badge site');
  ok(F['index.html'].indexOf("((Array.isArray(lo.stages) && lo.stage_idx != null && lo.stages[lo.stage_idx] && lo.stages[lo.stage_idx].n) ? ' · ' + labEsc(lo.stages[lo.stage_idx].n) : '')") > -1, 'dashboard: the active lab list names the current stage — escaped');
  [bMid, bFit, bOld, bOldU, bLate, bPend, bRisk, bRedo, bPendOld, bMix].forEach(b => { const tt = b.title.replace('&lt;i&gt;', '<i>'); add(tt); add(b.icon + ' ' + tt.split(':')[0]); });
  ['الفك العلوي — كامل', 'الفك السفلي — الأسنان 34، 35، 36', 'الفك السفلي — السن 34'].forEach(add);
  const all9 = Object.keys(seen), left9 = all9.filter(s => AR.test(E.t(s).split(CUSTOM).join('').split('تجربة <i>').join('')));
  ok(left9.length === 0 && E.t('🥽 شغل المخبر جاهز لهذا الموعد — تجربة الأسنان، تسليم') === '🥽 Lab work is ready for this appointment — Teeth try-in, Fit'
    && E.t('طلب مخبر نشط') === 'Active lab order' && E.t('سن 14') === 'Tooth 14' && E.t('سن 14 سنة') === 'سن 14 سنة' && E.t('سن 9') === 'سن 9' && E.t('الفك السفلي — الأسنان 34، 35') === 'Lower jaw — teeth 34, 35' && E.t('الفك العلوي — كامل') === 'Upper jaw — complete',
    'i18n (3b): badge titles with their stage tail and the bare denture location go through the real engine' + (left9.length ? ' → ' + left9.slice(0, 4).join(' | ') : ''));

  /* ── (١٠) v727 (صور المالك): سطرُ المراحل صفٌّ تابع بعرض الجدول — لا ينضغط بخلية «نوع العمل»؛ شريحةٌ لا تنكسر؛ موضعُ الجهاز صندوقٌ واحد ── */
  const ln10 = S.line(mk({ status: 'sent' }), { tail: UNDO });
  ok((ln10.match(/<span class="lst-g">/g) || []).length === 4 && (ln10.match(/<span class="lst-sep">›<\/span><\/span>/g) || []).length === 3 && !/<\/span><span class="lst-sep">›<\/span><span class="lst-g">/.test(ln10)
    && /\.lst-line \.lst-g \{[^}]*white-space: nowrap;/.test(F['theme.css']) && /\.lst-undo \{ white-space: nowrap;/.test(F['theme.css']),
    'line: every stage and its arrow are one unbreakable group — the line wraps between stages only');
  const pc = F['pp-clinical.js'], rl = fnSrc(pc, 'function renderLabOrders() {') || '';
  ok(rl.indexOf("+ (_stLine ? '<tr class=\"lst-row' + _zCls + '\"><td colspan=\"2\"></td><td colspan=\"6\">' + _stLine + '</td></tr>' : '');") > -1
    && rl.indexOf("+ (_stLine ? '<td class=\"mc-full lst-cell\">' + _stLine + '</td>' : '')") > -1 && rl.indexOf("<td class=\"mc-full lst-cell\">") < rl.indexOf("<td class=\"mc-actions\"")
    && rl.indexOf("rows += '<tr class=\"lab-row' + (_stLine ? ' has-lst' : '') + _zCls + '\">'") > -1 && (rl.match(/SyLabStages\.line\(/g) || []).length === 1 && !/<td class="mc-title">[^\n]*_stLine/.test(rl)
    && rl.indexOf('<table class="data-table m-cards lab-pairs">') > -1 && (rl.match(/<th[ >]/g) || []).length === 8,
    'pp-clinical.js: the stage line is a follower row under «work type» (table) and a full-width cell above the buttons (cards) — not inside the title cell');
  const lh = F['labs.html'];
  ok(lh.indexOf("+ (stLine ? '<tr class=\"lst-row ' + rowClass + '\"><td colspan=\"2\"></td><td colspan=\"8\">' + stLine + '</td></tr>' : '');") > -1 && lh.indexOf("rows += '<tr class=\"' + rowClass + (stLine ? ' has-lst' : '') + '\">'") > -1
    && lh.indexOf("+ (window.SyLabFiles ? ' ' + SyLabFiles.badge(lo.id) : '') + redoLine + (window.SyLabStatus ? SyLabStatus.note(lo) : '') + '</td>'") > -1 && lh.indexOf("(stLine ? '<div style=\"grid-column:1/-1;\">' + stLine + '</div>' : '')") > -1
    && (lh.match(/<th[ >]/g) || []).length >= 10 && /tbody tr\.has-lst \{ border-bottom: none; \}/.test(lh) && /#ordersTable \.lab-area \{ min-width: 0; \}/.test(lh),
    'labs.html: the same follower row (it carries the overdue tint of its order) · the card keeps the line at full width · the redo line stays in the cell');
  const pcss = F['patient-profile.css'], tcss = F['theme.css'];
  ok(/tr\.lst-row > td \{ padding-top: 0 !important;/.test(tcss) && /tr\.has-lst > td \{ border-bottom: none !important;/.test(tcss)
    && /\.data-table td\.lst-cell\{display:none;\}/.test(pcss) && /\.data-table\.m-cards tbody tr\.lst-row\{display:none;\}/.test(pcss)
    && /\.data-table\.lab-pairs tbody tr\.lab-z td\{background:/.test(pcss) && /\.data-table\.m-cards\.lab-pairs tbody tr\.lab-z\{background:/.test(pcss)
    && /\.data-table\.m-cards\.lab-pairs tbody tr:nth-child\(even\)\{background:transparent;\}/.test(pcss) && /tr\.has-lst:hover \+ tr\.lst-row td/.test(pcss),
    'css: the follower row belongs to its order — one separator, zebra and hover by order; hidden in cards where the cell shows instead');
  ok(/\.lab-area \{ display: inline-block; min-width: 86px; max-width: 190px;[^}]*white-space: normal;/.test(tcss) && pc.indexOf("toothChip = '<span class=\"tone tone-lime lab-area\">' + escapeHtml(_labAr.text) + '</span>';") > -1
    && lh.indexOf("'<span class=\"tooth-badge lab-area\">' + escapeHtml(labArea.text) + '</span>'") > -1, 'denture location: one box that wraps inside (no chip broken across lines) on both pages — escaped');
  ok(/@container mc \(max-width:1020px\)\{/.test(pcss) && !/@container mc \(max-width:880px\)/.test(pcss) && /\.data-table\.lab-pairs th,\.data-table\.lab-pairs td\{padding-inline:8px;\}/.test(pcss),
    'patient lab table: cards below its real width (1020px, four-button row) — no clipped buttons behind a hidden scroll');
}

const FILES = ['theme.js', 'i18n-en.js', 'lab-stages.js', 'labs.html', 'pp-clinical.js', 'pp-denture.js', 'patient-profile.html', 'patient-profile.css', 'appointments.html', 'appt-time.js', 'index.html', 'migrations/206_lab_order_stages.sql',
  'accounting.html', 'provider-reports.html', 'lab-slip.js', 'appt-views.js', 'scripts/cache-bust.sh', 'scripts/check-mirrors.js', 'scripts/db-bootstrap.py', 'db/schema.sql', 'theme.css', 'audit-log.html', 'pp-extras.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (file, a, b) => F => { const o = Object.assign({}, F); o[file] = F[file].replace(a, b); return o; };

const MUTANTS = [
  ['labs.html: the status ladder wins over the stage', rep('labs.html', "var nx = (window.SyLabStages && SyLabStages.next(lo)) || LAB_NEXT_STATUS[lo.status];", "var nx = LAB_NEXT_STATUS[lo.status];")],
  ['pp-clinical.js: advance skips the stage branch', rep('pp-clinical.js', "  if (window.SyLabStages && SyLabStages.next(lo)) {\n    var _stRow", "  if (false) {\n    var _stRow")],
  ['labs.html: stages never reach the payload', rep('labs.html', "var _stErr = SyLabStages.applyToPayload(document.getElementById('labStagesBox'), payload, _prevLo);", "var _stErr = '';")],
  ['pp-clinical.js: picker not mounted on edit', rep('pp-clinical.js', "  labStagesMount(lo);   /* ج3-أ */\n", "")],
  ['next: offered while still at the lab', rep('lab-stages.js', "function canAdvance(lo) { return !!nextStage(lo) && (lo.status === 'received' || lo.status === 'checked'); }", "function canAdvance(lo) { return !!nextStage(lo); }")],
  ['line: stage name unescaped', rep('lab-stages.js', "var name = esc(disp(st));", "var name = disp(st);")],
  ['picker: closed stages deletable', rep('lab-stages.js', "keep: s, fixed: k <= i };", "keep: s, fixed: false };")],
  ['picker: one stage accepted', rep('lab-stages.js', "if (s.items.length < MIN) return { error:", "if (false) return { error:")],
  ['payload: edit always rewrites stages', rep('lab-stages.js', "if (JSON.stringify(before) === JSON.stringify(r.stages)) return '';", "")],
  ['run: writes although the dialog was cancelled', rep('lab-stages.js', "    if (!pick) return null;\n    var nx = nextStage(lo);", "    pick = pick || { due: '', appt: '' };\n    var nx = nextStage(lo);")],
  ['undo: no confirmation', rep('lab-stages.js', "    if (!okGo) return null;\n", "")],
  ['dialog: due after the visit accepted', rep('lab-stages.js', "if (v && ad && v > ad) { fail(", "if (false) { fail(")],
  ['suggestDue: no 60-day cap', rep('lab-stages.js', "if (!(days >= 1) || days > 60) return '';\n    var t = today", "if (!(days >= 1)) return '';\n    var t = today")],
  ['appointments: a stage visit delivers the order', rep('appt-time.js', "if (!lo.id || labStageOpen(lo)) continue;", "if (!lo.id) continue;")],
  ['appointments: lab query loses id', rep('appointments.html', "var _labSel = 'id, patient_id,", "var _labSel = 'patient_id,")],
  ['dashboard: a stage visit offers delivery', rep('index.html', "labsList = labsList.filter(function (o) { return !(Array.isArray(o.stages) && o.stage_idx != null && o.stage_idx < o.stages.length - 1); });", "")],
  ['M206: next stage lets date_sent move', rep('migrations/206_lab_order_stages.sql', "    NEW.date_sent      := OLD.date_sent;      -- المرساةُ المالية لا تتحرّك\n", "")],
  ['M206: delivered on any stage', rep('migrations/206_lab_order_stages.sql', "AND NEW.stage_idx < n - 1 THEN\n      RAISE EXCEPTION 'lab_stage_not_final'", "AND false THEN\n      RAISE EXCEPTION 'lab_stage_not_final'")],
  ['M206: advance from any status', rep('migrations/206_lab_order_stages.sql', "WHERE id = p_order AND stages IS NOT NULL AND status IN ('received', 'checked')\n     AND stage_idx", "WHERE id = p_order AND stages IS NOT NULL\n     AND stage_idx")],
  ['M206: RPC callable by anon', rep('migrations/206_lab_order_stages.sql', "REVOKE ALL ON FUNCTION public.lab_order_next_stage(uuid, timestamptz, uuid) FROM PUBLIC, anon;", "")],
  ['i18n: built-in stage left Arabic in the English UI', rep('lab-stages.js', "&& n === NAMES[st.k]) ? EN[st.k] : n;", "&& false) ? EN[st.k] : n;")],
  ['i18n: a renamed stage shown under its old English name', rep('lab-stages.js', "&& EN[st.k] && n === NAMES[st.k]) ? EN[st.k] : n;", "&& EN[st.k]) ? EN[st.k] : n;")],
  ['i18n: a dialog text loses its entry', rep('i18n-en.js', "    'موعد الاستلام من المخبر لا يكون بعد موعد المريض.': 'The lab due date cannot be after the patient\\'s visit.',\n", "")],
  ['i18n: stage toast pattern dropped', rep('i18n-en.js', "    [/^📤 أُرسلت مرحلة «(.+)» للمخبر$/, function (m, n) { return '📤 Stage «' + nm(n) + '» sent to the lab'; }],\n", "")],
  ['i18n: «تجربة» added to the shared dictionary', rep('i18n-en.js', "    'عند المخبر': 'at the lab',", "    'تجربة': 'Try-in', 'عند المخبر': 'at the lab',")],
  ['profile: script tag missing', F => Object.assign({}, F, { 'patient-profile.html': F['patient-profile.html'].replace(/<script src="lab-stages\.js\?v=[^"]+"><\/script>\n/, '') })],
  ['read-only mode: undo left clickable', rep('labs.html', '[onclick*="undoLabStage("],', '')],
  /* ج3-ب */
  ['owner report: an order due before its appointment reads «late» at once', rep('appointments.html', "if (due && due < today) return 'late';", "if (due && apptDate && due <= apptDate) return 'late';")],
  ['due after the appointment: no orange warning', rep('appointments.html', "if (due && apptDate && due > apptDate && apptDate >= today) return 'risk';", "")],
  ['3b slip: stage name unescaped', rep('lab-slip.js', "<strong>' + esc(d.stage.name) + '</strong>'", "<strong>' + d.stage.name + '</strong>'")],
  ['3b slip area: a tooth session read as a denture', rep('lab-slip.js', "if (!sess || sess.tooth_num || (sess.arch !== 'U' && sess.arch !== 'L')) return null;", "if (!sess || (sess.arch !== 'U' && sess.arch !== 'L')) return null;")],   /* v733: السطرُ انقسم (خدمةُ الجهاز قبل فحص unit_teeth) */
  ['3b slip area: complete arch not recognised (mirror drift)', rep('lab-slip.js', "(full ? 'كامل' : ", "(false ? 'كامل' : ")],
  ['3b slip areas: read without the tenant filter', rep('lab-slip.js', ".eq('doctor_id', uid).in('id', ids.slice(i, i + 100))", ".in('id', ids.slice(i, i + 100))")],
  ['3b slip form: the location overrides a typed tooth', rep('lab-slip.js', "(!teeth.length && p.area && p.area.text)", "(p.area && p.area.text)")],
  ['3b slip stage: always the first stage', rep('lab-stages.js', "var i = has(lo) ? Math.min(idx(lo), L.length - 1) : 0;", "var i = 0;")],
  ['3b badge: a received mid stage still pending', rep('appointments.html', "if (o.status === 'checked' || (o.status === 'received' && mid)) {", "if (o.status === 'checked') {")],
  ['3b badge: a mid stage announced as ready to fit', rep('appointments.html', "      if (!mid) readyFit = true;", "      readyFit = true;")],
  ['3b badge: stage name unescaped', rep('appointments.html', "' — ' + escapeHtml(arr.join('، '))", "' — ' + arr.join('، ')")],
  ['3b labs.html: location cell unescaped', rep('labs.html', "'<span class=\"tooth-badge lab-area\">' + escapeHtml(labArea.text) + '</span>'", "'<span class=\"tooth-badge lab-area\">' + labArea.text + '</span>'")],
  ['3b pp-clinical.js: slip printed without the stage', rep('pp-clinical.js', "stage: window.SyLabStages ? SyLabStages.forSlip(document.getElementById('labStagesBox'), id ? labOrders.find(function (x) { return x.id === id; }) : null) : null", "stage: null")],
  ['3b dashboard: stage name unescaped', rep('index.html', "' · ' + labEsc(lo.stages[lo.stage_idx].n)", "' · ' + lo.stages[lo.stage_idx].n")],
  ['3b i18n: badge stage-tail pattern dropped', rep('i18n-en.js', "+ ') — (.+)$'), function (m, ic, base, names)", "+ ') — NEVER(.+)$'), function (m, ic, base, names)")],
  ['3b i18n: bare location pattern dropped', rep('i18n-en.js', "    [R('^(' + A1 + ')$'), function (m, a) { return area(a); }],\n", "")],
  /* v727 */
  ['v727 line: the arrow is a loose item again', rep('lab-stages.js', "+ (k < L.length - 1 ? '<span class=\"lst-sep\">›</span>' : '') + '</span>');", "+ '</span>' + (k < L.length - 1 ? '<span class=\"lst-sep\">›</span>' : ''));")],
  ['v727 css: stage chips may break inside', rep('theme.css', ".lst-line .lst-g { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }", ".lst-line .lst-g { display: inline-flex; align-items: center; gap: 4px; }")],
  ['v727 pp-clinical.js: the line back inside the title cell', rep('pp-clinical.js', "      + (_stLine ? '<tr class=\"lst-row' + _zCls + '\"><td colspan=\"2\"></td><td colspan=\"6\">' + _stLine + '</td></tr>' : '');", ";")],
  ['v727 pp-clinical.js: cards lose the stage line', rep('pp-clinical.js', "      + (_stLine ? '<td class=\"mc-full lst-cell\">' + _stLine + '</td>' : '')", "")],
  ['v727 labs.html: no follower row', rep('labs.html', "      + (stLine ? '<tr class=\"lst-row ' + rowClass + '\"><td colspan=\"2\"></td><td colspan=\"8\">' + stLine + '</td></tr>' : '');", ";")],
  ['v727 labs.html: the card drops the stage line', rep('labs.html', "      +   (stLine ? '<div style=\"grid-column:1/-1;\">' + stLine + '</div>' : '')\n", "")],
  ['v727 css: the follower row shows twice in cards', rep('patient-profile.css', "  .data-table.m-cards tbody tr.lst-row{display:none;}\n", "")],
  ['v727 css: the card cell shows in the table too', rep('patient-profile.css', ".data-table td.lst-cell{display:none;}", ".data-table td.lst-cell{}")],
  ['v727 css: the location chip breaks across lines again', rep('theme.css', ".lab-area { display: inline-block; min-width: 86px;", ".lab-area { display: inline; min-width: 86px;")],
  ['v737: the stage name enters the step button unescaped', rep('lab-stages.js', "label: '📤 للمخبر: ' + esc(cleanName(nextStage(lo).n)) };", "label: '📤 للمخبر: ' + cleanName(nextStage(lo).n) };")],
  ['v737 labs.html: the step button no longer comes from the stage module', rep('labs.html', "' onclick=\"advanceLabOrder(\\'' + lo.id + '\\')\">' + nx.label + '</button>';", "' onclick=\"advanceLabOrder(\\'' + lo.id + '\\')\">' + lo.stages[lo.stage_idx + 1].n + '</button>';")],
  ['v727 css: table kept below its real width', rep('patient-profile.css', "@container mc (max-width:1020px){", "@container mc (max-width:880px){")]
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
    console.log((fail === 0 && allBit ? '✅' : '❌') + ' prove-lab-stages: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && allBit ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-stages: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ prove-lab-stages:', e && e.stack || e); process.exit(1); });

/* M207 — مثبتُ حالة طلب المخبر من نافذته (lab-status.js) + دليل الألوان (lab-shade.js) + قياس المخبر بالمرحلة — مستقل، على الملفات الحيّة.
   (١) القائمة: ما يُتاح لكل حالة (مرآةُ الدالة بالقاعدة) · المسودّةُ والطلبُ الجديد بلا قائمة · «تم التركيب» للمرحلة الأخيرة ·
       سببُ الإلغاء يظهر عند الإلغاء وحده · التلميحات · ما اختاره الطبيب (pending);
   (٢) apply: لا RPC بلا تغيير ولا لطلبٍ صار مسودّة · وسائطُ RPC · رسائلُ الخطأ · سجلُّ النشاطات · سطرُ الطلب الملغى مُهرَّب;
   (٣) السطحان (labs.html · pp-clinical.js): الصندوقُ بالنافذة · يُركَّب بالفتح والتعديل · التطبيقُ بعد الحفظ لا بالحمولة ·
       «ملغى» اسماً للحالة المستثناة مالياً · فلترُ الملغى · سطرُ الملغى بالصف والبطاقة;
   (٤) القاعدة (ملف M207): الإلغاءُ من المُرسَل فصاعداً لا من مسودّة ولا من مركَّب · الاستعادةُ للحالة السابقة وحدها ·
       التواريخ · date_sent لا يُمسّ · استعادةُ «إعادة» لا تفتح دورةً ثانية · SECURITY INVOKER · بلا anon · المالُ يستثني rejected;
   (٥) دليل الألوان: الأعداد (16 · 29 · 20) بلا تكرار · ما يُكتب بالحقل · إيجادُ القيمة الحالية · النافذة (تبويبات · اختيار · مسح) ·
       زرٌّ واحد للحقل · نصٌّ حرٌّ يبقى;
   (٦) قياسُ المخبر: دوراتُ المراحل بتواريخها (SyLabStages.cycles) بأداء المخبر واقتراح الاستحقاق — لا خلطَ مراحل;
   (٧) الربط والواجهة الإنجليزية.
   --self-test: الطفراتُ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت حالة المخبر (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function loadMod(src) {
  const dom = new JSDOM('<body><div id="b"></div><input id="labOrderShade" value=""></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.console.warn = () => {};
  w.SyDT = { numDate: iso => { const d = new Date(iso); return d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); } };
  w.eval(src);
  return w;
}
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
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
const LABELS = { draft: { ar: 'مسودة — لم تُرسل' }, sent: { ar: 'تم التسليم للمخبر' }, received: { ar: 'تم الاستلام من المخبر' }, checked: { ar: 'تم الفحص' }, delivered: { ar: 'تم التركيب' }, redo: { ar: 'إعادة' }, rejected: { ar: 'ملغى' } };

async function suite(F) {
  /* ── (١) القائمة ── */
  const w = loadMod(F['lab-status.js']);
  const S = w.SyLabStatus, box = w.document.getElementById('b');
  ok(!!S && S.CANCEL === 'rejected', 'module: window.SyLabStatus exported · cancelling is the existing «rejected» status');
  const ch = (st, fin, extra) => { const c = S.choices(Object.assign({ id: 'o', status: st }, extra || {}), fin); return c ? c.join(',') : null; };
  ok(ch('sent') === 'sent,received,checked,delivered,rejected' && ch('received') === 'sent,received,checked,delivered,rejected' && ch('checked') === 'sent,received,checked,delivered,rejected',
    'choices: an order at the lab or back from it can step both ways or be cancelled');
  ok(ch('delivered') === 'sent,received,checked,delivered', 'choices: fitted work steps back — it is never cancelled');
  ok(ch('sent', false) === 'sent,received,checked,rejected' && ch('received', false) === 'sent,received,checked,rejected', 'choices: «fitted» is not offered before the last stage');
  ok(ch('redo') === 'redo,rejected' && ch('rejected', true, { cancel_prev_status: 'checked' }) === 'rejected,checked' && ch('rejected') === 'rejected,sent',
    'choices: a redo can only be cancelled here · a cancelled order restores to where it was (sent when unknown)');
  ok(ch('draft') === null && S.choices(null) === null && S.choices({ status: 'sent' }) === null && ch('bogus') === null, 'choices: no list for a draft, a new order or an unknown status');
  S.mount(box, { order: { id: 'o', status: 'draft' }, labels: LABELS });
  ok(box.innerHTML === '' && box.style.display === 'none' && S.pending(box) === null, 'mount: hidden for a draft');
  S.mount(box, { order: null, labels: LABELS });
  ok(box.innerHTML === '' && box.style.display === 'none', 'mount: hidden for a new order');
  const lo = { id: 'o1', patient_id: 'p1', work_type: 'تاج', status: 'received' };
  S.mount(box, { order: lo, labels: LABELS, isFinal: true });
  const sel = () => box.querySelector('.lsx-sel'), rs = () => box.querySelector('.lsx-reason'), hint = () => box.querySelector('.lsx-hint').textContent;
  const pick = v => { sel().value = v; sel().dispatchEvent(new w.Event('change', { bubbles: true })); };
  ok(box.style.display === '' && sel().value === 'received' && Array.from(sel().options).map(o => o.textContent).join('|') === 'تم التسليم للمخبر|تم الاستلام من المخبر|تم الفحص|تم التركيب|ملغى'
    && rs().hidden === true && hint() === '' && S.pending(box) === null, 'mount: the current status is selected, labels come from the page, nothing is pending');
  pick('sent');
  ok(/رجوع عن خطوة/.test(hint()) && rs().hidden === true && JSON.stringify(S.pending(box)) === JSON.stringify({ status: 'sent', reason: '' }), 'step back: says the later dates are cleared · pending without a reason');
  pick('delivered');
  ok(/يُسجَّل تاريخ اليوم/.test(hint()) && S.pending(box).status === 'delivered', 'step forward: says today is recorded for the missing steps');
  pick('rejected'); rs().value = '  المريض   لم يعد  ';
  ok(rs().hidden === false && /لا تُحتسب كلفته على العيادة/.test(hint()) && /فلا تُلغِه/.test(hint()) && box.querySelector('.lsx-hint').classList.contains('lsx-warn')
    && JSON.stringify(S.pending(box)) === JSON.stringify({ status: 'rejected', reason: 'المريض لم يعد' }), 'cancel: the reason field appears, the cost consequence is stated, the reason is trimmed');
  pick('checked');
  ok(rs().hidden === true && rs().value === '' && S.pending(box).reason === '', 'cancel reason: cleared when another status is chosen');
  pick('received');
  ok(S.pending(box) === null, 'pending: back on the current status = nothing to apply');
  S.mount(box, { order: { id: 'o2', status: 'rejected', cancel_prev_status: 'checked', date_cancelled: '2026-11-15T08:00:00Z', cancel_reason: '<b>سبب</b>' }, labels: LABELS });
  ok(hint() === 'أُلغي 15/11/2026 — <b>سبب</b>. لا تُحتسب كلفته على العيادة.' && box.querySelector('.lsx-hint').innerHTML.indexOf('<b>') === -1 && Array.from(sel().options).map(o => o.value).join(',') === 'rejected,checked',
    'cancelled order: shows when and why (as text, not markup) and offers its previous status only');
  pick('checked');
  ok(/يعود الطلب كما كان قبل الإلغاء/.test(hint()) && S.pending(box).status === 'checked', 'restore: says the cost is counted again');

  /* ── (٢) apply ── */
  const toasts = [], audit = []; w.showToast = m => toasts.push(m); w.logAudit = (a, o) => audit.push([a, o]);
  const calls = []; const sbOk = st => ({ rpc: (fn, args) => { calls.push([fn, args]); return Promise.resolve({ data: { id: 'o1', status: args.p_status }, error: null }); } });
  ok(await S.apply(sbOk(), lo, null, {}) === null && await S.apply(sbOk(), lo, { status: 'received' }, {}) === null && calls.length === 0, 'apply: nothing chosen or the same status ⇒ no RPC');
  ok(await S.apply(sbOk(), Object.assign({}, lo, { status: 'draft' }), { status: 'received' }, {}) === null && calls.length === 0 && /صار مسودة/.test(toasts[0]), 'apply: the save turned the order into a draft ⇒ no RPC, the user is told');
  const r1 = await S.apply(sbOk(), lo, { status: 'rejected', reason: 'سبب' }, { labels: LABELS, workType: 'تاج زركون', patientName: 'سامر' });
  ok(r1 && r1.status === 'rejected' && calls.length === 1 && calls[0][0] === 'lab_order_set_status' && JSON.stringify(calls[0][1]) === JSON.stringify({ p_order: 'o1', p_status: 'rejected', p_reason: 'سبب' }),
    'apply: one call to lab_order_set_status with the order, the status and the reason');
  ok(audit.length === 1 && audit[0][0] === 'lab.status' && audit[0][1].entityId === 'o1' && audit[0][1].patientId === 'p1' && /^إلغاء طلب مخبر: تاج زركون — تم الاستلام من المخبر ← ملغى — سبب$/.test(audit[0][1].description)
    && audit[0][1].oldValue.status === 'received' && audit[0][1].newValue.status === 'rejected', 'audit: lab.status with the transition and the reason');
  await S.apply(sbOk(), lo, { status: 'sent', reason: '' }, { labels: LABELS });
  await S.apply(sbOk(), { id: 'o1', status: 'rejected', work_type: 'تاج' }, { status: 'checked' }, { labels: LABELS });
  ok(calls[1][1].p_reason === null && /^تصحيح حالة طلب مخبر: تاج — تم الاستلام من المخبر ← تم التسليم للمخبر$/.test(audit[1][1].description) && /^استعادة طلب مخبر ملغى: تاج — ملغى ← تم الفحص$/.test(audit[2][1].description),
    'audit: a correction and a restore are named as such · an empty reason is sent as null');
  toasts.length = 0; const before = audit.length;
  const sbErr = msg => ({ rpc: () => Promise.resolve({ data: null, error: { message: msg } }) });
  ok(await S.apply(sbErr('lab_stage_not_final'), lo, { status: 'delivered' }, {}) === null && await S.apply(sbErr('lab_status_not_allowed'), lo, { status: 'sent' }, {}) === null
    && await S.apply(sbErr('boom'), lo, { status: 'sent' }, {}) === null && /للمرحلة الأخيرة فقط/.test(toasts[0]) && /حالة الطلب تغيّرت/.test(toasts[1]) && /فشل تغيير حالة الطلب/.test(toasts[2]) && audit.length === before,
    'apply: each failure has its own message and writes no audit entry');
  const nt = S.note({ status: 'rejected', date_cancelled: '2026-11-15T08:00:00Z', cancel_reason: '<img src=x onerror=1>' });
  ok(nt.indexOf('<img') === -1 && /🚫 أُلغي 15\/11\/2026 — &lt;img/.test(nt) && S.note({ status: 'rejected' }) === '<div class="lsx-note">🚫 أُلغي</div>' && S.note({ status: 'sent', cancel_reason: 'x' }) === '' && S.note(null) === '',
    'note: a cancelled row says when and why — escaped · nothing for any other order');

  /* ── (٣) السطحان ── */
  for (const [file, page, arr] of [['labs.html', 'labs.html', 'allOrders'], ['pp-clinical.js', 'patient-profile.html', 'labOrders']]) {
    const src = F[file], P = F[page];
    ok((P.match(/<div class="form-group lsx-box" id="labStatusBox" style="display:none;"><\/div>/g) || []).length === 1 && P.indexOf('id="labStatusBox"') < P.indexOf('id="labStagesBox"') && !/id="lsx[A-Z]/.test(P),
      page + ': one hidden status box in the order modal, before the stages');
    const mnt = fnSrc(src, 'function labStatusMount(lo) {');
    ok(/SyLabStatus\.mount\(document\.getElementById\('labStatusBox'\), \{\n    order: lo, labels: LAB_STATUSES, isFinal: !window\.SyLabStages \|\| SyLabStages\.isFinal\(lo\)\n  \}\);/.test(mnt) && /SyLabShade\.attach\(document\.getElementById\('labOrderShade'\)\);/.test(mnt)
      && /labStatusMount\(null\);   \/\* M207 \*\/\n  openModal\('labOrderModal'\);/.test(src) && /labStatusMount\(lo\);   \/\* M207 \*\/\n  openModal\('labOrderModal'\);/.test(src),
      file + ': the status list and the shade button are mounted on new and on edit');
    const sv = src.slice(src.indexOf('var _stPick = (window.SyLabStatus && res.data)'), src.indexOf('var _stPick = (window.SyLabStatus && res.data)') + 900);
    ok(/SyLabStatus\.pending\(document\.getElementById\('labStatusBox'\)\) : null;/.test(sv) && /var _stRow = _stPick \? await SyLabStatus\.apply\(window\.sb, res\.data, _stPick, \{ labels: LAB_STATUSES,/.test(sv)
      && sv.indexOf(arr + '[_stI] = _stRow;') > -1 && /else if \(!_stPick\) showToast\('✅ تم تحديث الطلب'\);/.test(sv) && src.indexOf('var _stPick') > src.indexOf(".update(payload).eq('id', id).eq('doctor_id', currentUser.id).select().single();"),
      file + ': the chosen status is applied after the save, on the saved row, and the list is refreshed');
    ok(!/payload\.status\s*=\s*_stPick/.test(src) && !/lab_order_set_status/.test(src) && !/cancel_prev_status|cancel_reason\s*:/.test(src), file + ': the save payload never carries the chosen status — the module and its RPC only');
    ok(/SyLabStatus\.note\(lo\)/.test(src), file + ': the cancelled note is shown on the row');
  }
  ok(/'rejected':\s+\{ ar: 'ملغى',/.test(F['labs.html']) && /'rejected':\s+\{ ar: 'ملغى',/.test(F['pp-core.js']) && !/ar: 'مرفوض'/.test(F['labs.html']) && !/'rejected':\s+\{ ar: 'مرفوض'/.test(F['pp-core.js']),
    'label: the financially excluded status reads «ملغى» on both surfaces');
  ok(/<button class="filter-btn" data-filter="rejected" onclick="applyFilter\('rejected', this\)">ملغى<\/button>/.test(F['labs.html']) && /lo\.status !== currentFilter/.test(F['labs.html'])
    && F['labs.html'].indexOf("((window.SyLabStatus && SyLabStatus.note(lo)) ? '<div style=\"grid-column:1/-1;\">' + SyLabStatus.note(lo) + '</div>' : '')") > -1, 'labs.html: a «cancelled» filter · the note also on the card');
  ok(/if \(s === 'rejected'\) return 'ملغى';/.test(F['lab-stages.js']), 'stage line: the current stage of a cancelled order says so');
  /* كتاباتُ الحالة المباشرة مشروطةٌ بالحالة التي رآها المستخدم — قائمةٌ قديمة لا تُحيي طلباً أُلغي */
  ok(['labs.html', 'pp-clinical.js'].every(f => F[f].indexOf(".update(update).eq('id', id).eq('doctor_id', currentUser.id).eq('status', lo.status).select().single();") > -1 && F[f].indexOf(".update(update).eq('id', id).eq('doctor_id', currentUser.id).select().single();") === -1),
    'row step: the write is conditional on the status the user saw (both surfaces)');
  ok(/\.eq\('id', lo\.id\)\.eq\('doctor_id', currentUser\.id\)\s+\.in\('status', \['sent', 'received', 'checked'\]\);/.test(F['appt-time.js']) && /\.eq\('id', lab\.id\)\s+\.in\('status', \['sent', 'received', 'checked'\]\);/.test(F['index.html']),
    'appointment completion: auto-delivery only touches an order that is still sent/received/checked (appointments page · dashboard)');

  /* ── (٤) القاعدة ── */
  const M = F['migrations/207_lab_order_status_control.sql'], fn = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.lab_order_set_status'), M.indexOf('REVOKE ALL ON FUNCTION public.lab_order_set_status'));
  ok(/IF o\.status NOT IN \('sent', 'received', 'checked', 'redo'\) THEN\s+RAISE EXCEPTION 'lab_status_not_allowed'/.test(fn) && /SET status = 'rejected', cancel_prev_status = o\.status,/.test(fn)
    && /cancel_reason = NULLIF\(btrim\(left\(COALESCE\(p_reason, ''\), 300\)\), ''\), date_cancelled = now\(\)/.test(fn), 'M207: cancel only from sent/received/checked/redo — remembers the status, trims the reason');
  ok(/prev := COALESCE\(o\.cancel_prev_status, 'sent'\);\s+IF p_status IS DISTINCT FROM prev THEN RAISE EXCEPTION 'lab_status_not_allowed'/.test(fn) && /SET status = prev, cancel_prev_status = NULL, cancel_reason = NULL, date_cancelled = NULL/.test(fn),
    'M207: a cancelled order restores to its previous status only, and the cancel fields are cleared');
  ok(/ELSIF o\.status IN \('sent', 'received', 'checked', 'delivered'\) AND p_status IN \('sent', 'received', 'checked', 'delivered'\) THEN/.test(fn)
    && /date_received\s+= CASE WHEN p_status = 'sent' THEN NULL\s+WHEN p_status IN \('received', 'checked'\) THEN COALESCE\(date_received, now\(\)\)\s+ELSE date_received END,/.test(fn)
    && /date_checked\s+= CASE WHEN p_status IN \('sent', 'received'\) THEN NULL\s+WHEN p_status = 'checked' THEN COALESCE\(date_checked, now\(\)\)\s+ELSE date_checked END,/.test(fn)
    && /date_delivered = CASE WHEN p_status = 'delivered' THEN COALESCE\(date_delivered, now\(\)\) ELSE NULL END/.test(fn) && !/date_sent\s*=/.test(fn),
    'M207: stepping back clears the later dates, stepping forward stamps the missing ones — date_sent is never written');
  ok(/SELECT \* INTO o FROM public\.lab_orders WHERE id = p_order FOR UPDATE;/.test(fn) && /IF p_status IS NOT DISTINCT FROM o\.status THEN RETURN to_jsonb\(o\); END IF;/.test(fn) && /ELSE\s+\/\*[^*]*\*\/\s+RAISE EXCEPTION 'lab_status_not_allowed'/.test(fn),
    'M207: row locked · same status is a no-op · draft, redo and unknown targets are refused');
  ok(/RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public/.test(fn) && !/SECURITY DEFINER/.test(M) && /REVOKE ALL ON FUNCTION public\.lab_order_set_status\(uuid, text, text\) FROM PUBLIC, anon;/.test(M)
    && /GRANT EXECUTE ON FUNCTION public\.lab_order_set_status\(uuid, text, text\) TO authenticated;/.test(M), 'M207: the RPC is invoker (RLS and the subscription gate apply) and not callable by anon');
  const m160 = F['migrations/160_lab_order_redos.sql'], body = s => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.lab_orders_redo_cycle()'), s.indexOf('END $$;', s.indexOf('CREATE OR REPLACE FUNCTION public.lab_orders_redo_cycle()')));
  ok(body(M).replace(" AND OLD.status IS DISTINCT FROM 'rejected'", '') === body(m160) && body(M) !== body(m160), 'M207: the redo trigger is M160 verbatim plus one condition — restoring a cancelled redo opens no second cycle');
  ok(/cancel_prev_status IS NULL OR cancel_prev_status IN \('sent', 'received', 'checked', 'redo'\)/.test(M) && /char_length\(cancel_reason\) <= 300/.test(M) && !/cost|currency|payment/i.test(M.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'M207: cancel fields are constrained — no money column anywhere');
  ok(/if \(o\.status === 'rejected' \|\| _labIsDraft\(o\)\) return;/.test(F['accounting.html']) && /\.neq\('status', 'rejected'\)/.test(F['provider-reports.html']) && /o\.status !== 'rejected' && !_labIsDraft\(o\)/.test(F['labs.html']),
    'finance: a cancelled order is excluded from lab cost, lab balance and provider reports by the rules that were already there');
  ok(/"cancel_prev_status" "text",\n    "cancel_reason" "text",\n    "date_cancelled" timestamp with time zone,/.test(F['db/schema.sql']) && /CONSTRAINT "lab_orders_cancel_shape" CHECK/.test(F['db/schema.sql'])
    && /'migrations\/206_lab_order_stages\.sql',[^\n]*\n    'migrations\/207_lab_order_status_control\.sql',/.test(F['scripts/db-bootstrap.py']), 'M207: mirrored in the schema snapshot and registered in the bootstrap plan after M206');

  /* ── (٥) دليل الألوان ── */
  const ws = loadMod(F['lab-shade.js']);
  const H = ws.SyLabShade, inp = ws.document.getElementById('labOrderShade');
  const items = g => { const o = []; g.rows.forEach(r => r.forEach(x => { if (x) o.push(x); })); return o; };
  const G = {}; H.GUIDES.forEach(g => { G[g.id] = items(g); });
  const codes = id => G[id].map(x => x.c);
  ok(H.GUIDES.map(g => g.id).join(',') === 'classical,master,chroma' && codes('classical').length === 16 && codes('master').length === 29 && codes('chroma').length === 20
    && Object.keys(G).every(id => new Set(codes(id)).size === codes(id).length), 'shade guides: classical 16 · 3D-MASTER 29 · Chromascop 20 — no duplicates');
  ok(codes('classical').join(',') === 'A1,A2,A3,A3.5,A4,B1,B2,B3,B4,C1,C2,C3,C4,D2,D3,D4'
    && ['0M1', '0M2', '0M3', '1M1', '1M2', '2L1.5', '2R2.5', '3M2', '4L2.5', '5M1', '5M3'].every(c => codes('master').indexOf(c) > -1) && codes('master').indexOf('1M3') === -1 && codes('master').indexOf('5L1.5') === -1
    && codes('chroma').join(',') === '110,120,130,140,210,220,230,240,310,320,330,340,410,420,430,440,510,520,530,540', 'shade guides: the exact code sets of the three guides');
  ok(G.classical.every(x => x.v === x.c) && G.master.every(x => x.v === x.c) && G.chroma.every(x => x.v === 'Chromascop ' + x.c) && H.GUIDES.every(g => items(g).every(x => /^(#[0-9a-f]{6}|hsl\(\d+,\d+%,\d+%\))$/.test(x.bg))),
    'shade value: the code as written by labs — Chromascop carries its guide name (a bare number is ambiguous) · every swatch has a colour');
  ok(H.find('A2').guide.id === 'classical' && H.find(' 3m2 ').item.c === '3M2' && H.find('chromascop  210').guide.id === 'chroma' && H.find('A2/A3') === null && H.find('') === null && H.find('210') === null,
    'shade find: the current value selects its guide — free text matches nothing');
  H.attach(inp); H.attach(inp);
  const fld = inp.parentNode;
  ok(fld.className === 'lsh-field' && ws.document.querySelectorAll('.lsh-btn').length === 1 && ws.document.querySelectorAll('.lsh-field').length === 1 && fld.querySelector('.lsh-btn').type === 'button' && inp.id === 'labOrderShade', 'shade button: attached once, beside the same input');
  /* v729: الحقلُ بعمودين يضيق ⇒ الزرُّ أيقونةٌ فقط (استعلامُ حاوية) — النصُّ بصنفه ليُخفى، والاسمُ بـaria-label ليبقى */
  const sbt = fld.querySelector('.lsh-btn'), css = F['theme.css'];
  ok(sbt.querySelectorAll('.lsh-btn-t').length === 1 && sbt.querySelector('.lsh-btn-t').textContent === 'دليل الألوان' && sbt.getAttribute('aria-label') === 'اختيار اللون من دليل الألوان' && sbt.title === sbt.getAttribute('aria-label'),
    'shade button: its text carries the hideable class and its name stays in aria-label');
  ok(/\.lsh-field \{[^}]*container: lshf \/ inline-size;/.test(css) && /@container lshf \(max-width: 300px\) \{[^@]*\.lsh-btn \.lsh-btn-t \{ display: none; \} \}/.test(css) && /\.lsh-field > input \{ flex: 1 1 auto; min-width: 0; \}/.test(css),
    'theme.css: a narrow shade field shows an icon-only button — the width goes back to the value');
  let evs = 0; inp.addEventListener('input', () => evs++);
  inp.value = '3M2'; fld.querySelector('.lsh-btn').click();
  const dlg = () => ws.document.querySelector('.lsh-dialog');
  ok(!!dlg() && dlg().querySelectorAll('.lsh-tab').length === 3 && dlg().querySelector('.lsh-tab-on').getAttribute('data-lsh-tab') === 'master' && dlg().querySelector('.lsh-on').getAttribute('data-lsh-v') === '3M2'
    && dlg().querySelectorAll('.lsh-sw').length === 29 && /تقريبية/.test(dlg().querySelector('.lsh-note').textContent), 'shade dialog: opens on the guide of the current value with it marked · states that screen colours are approximate');
  fld.querySelector('.lsh-btn').click();
  ok(ws.document.querySelectorAll('.lsh-dialog').length === 1, 'shade dialog: a second click does not stack another dialog');
  dlg().querySelector('[data-lsh-tab="chroma"]').click();
  ok(dlg().querySelectorAll('.lsh-sw').length === 20 && dlg().querySelector('.lsh-tab-on').getAttribute('data-lsh-tab') === 'chroma', 'shade dialog: tabs switch the guide');
  dlg().querySelector('[data-lsh-v="Chromascop 210"]').click();
  ok(inp.value === 'Chromascop 210' && evs === 1 && !dlg(), 'shade pick: writes the field, fires input (templates and the assistant read it) and closes');
  fld.querySelector('.lsh-btn').click(); dlg().querySelector('[data-lsh-act="clear"]').click();
  ok(inp.value === '' && !dlg(), 'shade clear: «no shade» empties the field');
  inp.value = 'A2 عنق A3'; fld.querySelector('.lsh-btn').click();
  ok(dlg().querySelector('.lsh-tab-on').getAttribute('data-lsh-tab') === 'classical' && !dlg().querySelector('.lsh-on'), 'shade free text: nothing is marked and the dialog opens on the first guide');
  dlg().querySelector('.modal-close').click();
  ok(inp.value === 'A2 عنق A3' && !dlg(), 'shade close: closing keeps the typed text');

  /* ── (٦) قياسُ المخبر بالمرحلة ── */
  const wt = loadMod(F['lab-stages.js']), T = wt.SyLabStages;
  const st3 = [{ n: 'a', sent: '2026-09-01T00:00:00Z', due: '2026-09-04T00:00:00Z', received: '2026-09-03T10:00:00Z' }, { n: 'b', sent: '2026-09-10T00:00:00Z' }, { n: 'c' }];
  const cy = T.cycles({ id: 'x', status: 'received', date_sent: '2026-09-01T00:00:00Z', date_due: '2026-09-15T00:00:00Z', date_received: '2026-09-12T10:00:00Z', stage_idx: 1, stages: st3 });
  ok(cy.length === 2 && cy[0].sent === '2026-09-01T00:00:00Z' && cy[0].received === '2026-09-03T10:00:00Z' && cy[0].due === '2026-09-04T00:00:00Z' && cy[1].sent === '2026-09-10T00:00:00Z' && cy[1].received === '2026-09-12T10:00:00Z' && cy[1].due === '2026-09-15T00:00:00Z',
    'cycles: every stage is a lab round trip with its own dates — the current one starts at its own send, not the order first send');
  ok(T.cycles({ id: 'y', status: 'sent', date_sent: '2026-09-01T00:00:00Z', stage_idx: 1, stages: st3 }).length === 1 && T.cycles({ id: 'z', status: 'received', date_sent: '2026-09-01T00:00:00Z', date_received: '2026-09-02T00:00:00Z' }) === null
    && T.cycles({ id: 'q', status: 'received', date_sent: '2026-09-01T00:00:00Z', date_received: '2026-09-02T00:00:00Z', stage_idx: 0, stages: [{ n: 'a' }, { n: 'b' }] })[0].sent === '2026-09-01T00:00:00Z',
    'cycles: a stage still at the lab is not a cycle yet · no stages ⇒ null · the first stage starts at the order send date');
  const L = F['labs.html'], ctx = { console: { warn() {} }, Date, String, Number, Object, Array, Math, JSON, parseInt, document: { getElementById: () => null }, allOrders: [] };
  vm.createContext(ctx); vm.runInContext('window = this;', ctx); vm.runInContext(F['lab-due.js'], ctx); vm.runInContext(F['lab-stages.js'].replace("if (window.SyLabStages) return;", ''), ctx);
  ctx.SyLabRedo = { list: () => [] };
  vm.runInContext([fnSrc(L, 'function _labIsDraft('), L.slice(L.indexOf('var LAB_PERF_MIN = '), L.indexOf('\n', L.indexOf('var LAB_PERF_MIN = '))), fnSrc(L, 'function labPerfOf(labId) {')].join('\n'), ctx);
  const O = (id, x) => Object.assign({ id, lab_id: 'L1', status: 'received', work_type: 'جهاز' }, x);
  ctx.allOrders = [
    /* مرحلتان منتهيتان: 2 يوم و2 يوم — بالحساب القديم كانت المرحلةُ الثانية تُقاس من الإرسال الأول (9 أيام عمل) */
    O('s1', { date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-12T10:00:00Z', date_due: '2026-09-15T00:00:00+00:00', stage_idx: 1, stages: st3 }),
    O('p1', { date_sent: '2026-09-07T00:00:00+00:00', date_received: '2026-09-09T10:00:00Z', date_due: '2026-09-09T00:00:00+00:00' })];
  const Pf = vm.runInContext("labPerfOf('L1')", ctx);
  ok(Pf.n === 2 && Pf.tatN === 3 && Pf.tat === 2 && Pf.dueN === 3 && Pf.onTime === 100, 'lab performance: a staged order contributes one cycle per received stage, each with its own duration and due date (was one inflated cycle)');
  const hd = vm.runInContext('SyLabDue.histDays', ctx);
  const rowsH = [1, 2, 3].map(() => ({ lab_id: 'L1', treatment_key: 'k', date_sent: '2026-09-01T00:00:00+00:00', date_received: '2026-09-12T10:00:00Z', stage_idx: 1, stages: st3 }))
    .concat([{ lab_id: 'L1', treatment_key: 'k', date_sent: '2026-09-07T00:00:00+00:00', date_received: '2026-09-09T10:00:00Z' }]);
  const hres = hd(rowsH, 'L1', 'k', [0, 1, 2, 3, 4, 6]);
  ok(hres && hres.n === 4 && hres.days === 2 && /select\('lab_id, treatment_key, date_sent, date_received, stages, stage_idx'\)/.test(F['lab-due.js']), 'due suggestion: a staged order past its first stage counts with its first stage duration — the history query carries the stages');

  /* ── (٧) الربط ── */
  for (const page of ['labs.html', 'patient-profile.html']) {
    const P = F[page], a = P.indexOf('<script src="lab-status.js?v='), b = P.indexOf('<script src="lab-shade.js?v='), s = P.indexOf('<script src="lab-stages.js?v='), m = P.indexOf('<script src="sy-modal.js?v=');
    const consumer = page === 'labs.html' ? P.indexOf('function labStatusMount(lo)') : P.indexOf('<script src="pp-clinical.js?v=');
    ok(a > s && b > a && s > m && m > -1 && b < consumer, page + ': lab-status.js and lab-shade.js are loaded after the modal kit and before their consumer');
  }
  ok((F['scripts/cache-bust.sh'].match(/lab-status\\\.js\|lab-shade\\\.js\|lab-redo\\\.js/g) || []).length === 2, 'cache-bust: both new files are in the fleet allow-list (scan and rewrite)');
  ok(/\.lsx-box \.lsx-hint\.lsx-warn \{/.test(F['theme.css']) && /\.lsx-note \{/.test(F['theme.css']) && /\.lsh-dialog \.lsh-sw\.lsh-on \{/.test(F['theme.css']) && /\.lsh-field \{ display: flex;/.test(F['theme.css']), 'theme.css: status and shade kits');
  ok(/'lab\.stage', 'lab\.status', 'lab\.delete'/.test(F['audit-log.html']) && /'lab\.status': '🔁 حالة طلب مخبر'/.test(F['pp-extras.js']), 'audit: lab.status in the filter family and the patient activity labels');

  /* الواجهة الإنجليزية: كلُّ نصٍّ تبنيه الوحدتان يمرّ بالمحرّك الحقيقي */
  const E = i18nEngine(F), AR = /[؀-ۿ]/, seen = {};
  const add = s => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (s && AR.test(s)) seen[s] = 1; };
  const grab = root => { [root].concat(Array.from(root.querySelectorAll('*'))).forEach(el => {
    ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v) add(v); });
    for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) add(c.nodeValue); }); };
  const REASON = 'المريض لم يعد';
  S.mount(box, { order: lo, labels: LABELS, isFinal: true }); grab(box);
  ['sent', 'delivered', 'rejected'].forEach(v => { pick(v); add(hint()); });
  S.mount(box, { order: { id: 'o2', status: 'rejected', cancel_prev_status: 'checked', date_cancelled: '2026-11-15T08:00:00Z', cancel_reason: REASON }, labels: LABELS }); grab(box); pick('checked'); add(hint());
  S.mount(box, { order: { id: 'o3', status: 'rejected' }, labels: LABELS }); add(hint());
  S.mount(box, { order: { id: 'o4', status: 'redo' }, labels: LABELS }); grab(box);
  const hold = w.document.createElement('div');
  hold.innerHTML = S.note({ status: 'rejected', date_cancelled: '2026-11-15T08:00:00Z', cancel_reason: REASON }) + S.note({ status: 'rejected' }); grab(hold);
  ['⚠️ «تم التركيب» للمرحلة الأخيرة فقط', '⚠️ حالة الطلب تغيّرت — حدّث الصفحة وأعد المحاولة', '⚠️ فشل تغيير حالة الطلب — حاول مجدداً', '⚠️ الطلب صار مسودة — حالته يحددها تاريخ الإرسال',
    '🚫 أُلغي الطلب — لا تُحتسب كلفته', '🔁 حالة طلب مخبر', 'ملغى'].forEach(add);
  Object.keys(LABELS).forEach(k => add('✅ تم تحديث الحالة إلى: ' + LABELS[k].ar));
  inp.value = ''; fld.querySelector('.lsh-btn').click(); grab(dlg()); grab(fld); dlg().querySelector('.modal-close').click();
  const allS = Object.keys(seen), left = allS.filter(s => AR.test(E.t(s).split(REASON).join('')));
  ok(allS.length >= 28 && left.length === 0, 'i18n: ' + allS.length + ' status and shade texts through the real engine — no Arabic left outside the typed reason' + (left.length ? ' → ' + left.slice(0, 4).join(' | ') : ''));
  ok(allS.every(s => { const a = (s.match(/\d+/g) || []).sort().join(','), b = (E.t(s).match(/\d+/g) || []).sort().join(','); return a === b; }), 'i18n: every number survives');
  ok(E.t('🚫 أُلغي 15/11/2026 — ' + REASON) === '🚫 Cancelled 15/11/2026 — ' + REASON && E.t('✅ تم تحديث الحالة إلى: ملغى') === '✅ Status updated to: Cancelled'
    && E.t('✅ تم تحديث الحالة إلى: شيء آخر') === '✅ تم تحديث الحالة إلى: شيء آخر' && E.t('دليل الألوان') === 'Shade guide', 'i18n: wording — cancelled note, status toast (closed table), shade guide');
}

const FILES = ['appt-time.js', 'index.html', 'theme.js', 'i18n-en.js', 'lab-status.js', 'lab-shade.js', 'lab-stages.js', 'lab-due.js', 'labs.html', 'pp-clinical.js', 'pp-core.js', 'patient-profile.html', 'migrations/207_lab_order_status_control.sql',
  'migrations/160_lab_order_redos.sql', 'accounting.html', 'provider-reports.html', 'scripts/cache-bust.sh', 'scripts/db-bootstrap.py', 'db/schema.sql', 'theme.css', 'audit-log.html', 'pp-extras.js'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (file, a, b) => F => { const o = Object.assign({}, F); o[file] = F[file].replace(a, b); return o; };
const MUTANTS = [
  ['status: fitted work can be cancelled', rep('lab-status.js', "    if (lo.status !== 'delivered') out.push(CANCEL);", "    out.push(CANCEL);")],
  ['status: «fitted» offered on a middle stage', rep('lab-status.js', "return s !== 'delivered' || isFinal !== false || lo.status === 'delivered';", "return true;")],
  ['status: a cancelled order restores anywhere', rep('lab-status.js', "if (lo.status === CANCEL) return [CANCEL, prevOf(lo)];", "if (lo.status === CANCEL) return [CANCEL].concat(LADDER);")],
  ['status: the cancel reason is always visible', rep('lab-status.js', "      rs.hidden = !cancel;", "      rs.hidden = false;")],
  ['status: the hint is written as markup', rep('lab-status.js', "      hint.textContent = hintFor(lo, to);", "      hint.innerHTML = hintFor(lo, to);")],
  ['status: RPC although nothing changed', rep('lab-status.js', "if (!sb || !row || !row.id || !pick || !pick.status || pick.status === row.status) return null;", "if (!sb || !row || !row.id || !pick || !pick.status) return null;")],
  ['status: RPC on a row that became a draft', rep('lab-status.js', "    if (row.status === 'draft') { toast('⚠️ الطلب صار مسودة — حالته يحددها تاريخ الإرسال'); return null; }\n", "")],
  ['status: the reason is not sent', rep('lab-status.js', "p_reason: pick.reason || null });", "p_reason: null });")],
  ['status: a failed change is audited', rep('lab-status.js', "      if (res.error) console.warn('lab_order_set_status:', res.error);\n      return null;", "      if (res.error) console.warn('lab_order_set_status:', res.error);")],
  ['status: cancelled note unescaped', rep('lab-status.js', "+ (lo.cancel_reason ? ' — ' + esc(lo.cancel_reason) : '') + '</div>';", "+ (lo.cancel_reason ? ' — ' + lo.cancel_reason : '') + '</div>';")],
  ['labs.html: the chosen status is never applied', rep('labs.html', "var _stRow = _stPick ? await SyLabStatus.apply(window.sb, res.data, _stPick,", "var _stRow = false ? await SyLabStatus.apply(window.sb, res.data, _stPick,")],
  ['pp-clinical.js: the status list is not mounted on edit', rep('pp-clinical.js', "  labStatusMount(lo);   /* M207 */\n", "")],
  ['pp-clinical.js: the list keeps the old row after a change', rep('pp-clinical.js', "      if (_stI !== -1) labOrders[_stI] = _stRow;", "")],
  ['row step: a stale tab overwrites a changed status', rep('pp-clinical.js', ".eq('doctor_id', currentUser.id).eq('status', lo.status).select().single();", ".eq('doctor_id', currentUser.id).select().single();")],
  ['auto-delivery revives a cancelled order', rep('appt-time.js', "          .in('status', ['sent', 'received', 'checked']);", "          ;")],
  ['dashboard delivery revives a cancelled order', rep('index.html', "                .in('status', ['sent', 'received', 'checked']);", "                ;")],
  ['label: the status still reads «rejected»', rep('pp-core.js', "'rejected':  { ar: 'ملغى',                   tone: 'red',", "'rejected':  { ar: 'مرفوض',                  tone: 'red',")],
  ['labs.html: no cancelled filter', rep('labs.html', "      <button class=\"filter-btn\" data-filter=\"rejected\" onclick=\"applyFilter('rejected', this)\">ملغى</button>\n", "")],
  ['M207: a draft can be cancelled', rep('migrations/207_lab_order_status_control.sql', "IF o.status NOT IN ('sent', 'received', 'checked', 'redo') THEN", "IF o.status NOT IN ('draft', 'sent', 'received', 'checked', 'redo') THEN")],
  ['M207: restore to any status', rep('migrations/207_lab_order_status_control.sql', "    IF p_status IS DISTINCT FROM prev THEN RAISE EXCEPTION 'lab_status_not_allowed' USING ERRCODE = 'P0001'; END IF;\n", "")],
  ['M207: stepping back keeps the receive date', rep('migrations/207_lab_order_status_control.sql', "date_received  = CASE WHEN p_status = 'sent' THEN NULL", "date_received  = CASE WHEN false THEN NULL")],
  ['M207: RPC callable by anon', rep('migrations/207_lab_order_status_control.sql', "REVOKE ALL ON FUNCTION public.lab_order_set_status(uuid, text, text) FROM PUBLIC, anon;", "")],
  ['M207: restoring a cancelled redo opens a second cycle', rep('migrations/207_lab_order_status_control.sql', " AND OLD.status IS DISTINCT FROM 'rejected'", "")],
  ['M207: the redo trigger body drifted from M160', rep('migrations/207_lab_order_status_control.sql', "    NEW.date_sent      := COALESCE(OLD.date_sent, NEW.date_sent);\n", "")],
  ['shade: a classical shade is missing', rep('lab-shade.js', "['C1', 'C2', 'C3', 'C4', null]", "['C1', 'C2', 'C3', null, null]")],
  ['shade: 3D-MASTER loses its bleach row', rep('lab-shade.js', "    rows.push(cols.map(function (c) { return c.charAt(0) === 'M' ? m3('0' + c) : null; }));\n", "")],
  ['shade: Chromascop written as a bare number', rep('lab-shade.js', "v: 'Chromascop ' + code,", "v: code,")],
  ['shade: the pick does not notify the form', rep('lab-shade.js', "input.dispatchEvent(new Event('input', { bubbles: true })); ", "")],
  ['shade: the button is attached twice', rep('lab-shade.js', "    if (!input || input._lsh) return;", "    if (!input) return;")],
  ['shade: the button text cannot be hidden in a narrow field', rep('lab-shade.js', '<span class="lsh-btn-t">', '<span>')],
  ['shade: the icon-only button has no name', rep('lab-shade.js', "    b.setAttribute('aria-label', b.title);", "    void 0;")],
  ['shade: the narrow-field rule watches no container', rep('theme.css', 'container: lshf / inline-size; }', '}')],
  ['shade: dialogs stack', rep('lab-shade.js', "if (!input || document.querySelector('.lsh-dialog')) return;", "if (!input) return;")],
  ['shade: free text marked as a guide shade', rep('lab-shade.js', "if (norm(items[k].v) === v) return", "if (v.indexOf(norm(items[k].v)) === 0) return")],
  ['perf: staged orders measured from the first send again', rep('labs.html', "    if (cyc) { cyc.forEach(function (c) { addCycle(o, c.sent, c.received, c.due); }); return; }\n", "")],
  ['cycles: the current stage starts at the order first send', rep('lab-stages.js', "      var sent = k === 0 ? (st.sent || lo.date_sent) : st.sent;\n      if (k < i) {", "      var sent = st.sent || lo.date_sent; if (k === i) sent = lo.date_sent;\n      if (k < i) {")],
  ['due history: later stages pollute the first-trip duration', rep('lab-due.js', "if (Array.isArray(r.stages) && r.stage_idx > 0) { var f0 = r.stages[0] || {}; snt = f0.sent || r.date_sent; rec = f0.received || null; }", "")],
  ['i18n: a status text loses its entry', rep('i18n-en.js', "    'رجوع عن خطوة: يُمسح تاريخ ما بعدها.': 'Stepping back: the dates of the later steps are cleared.',\n", "")],
  ['i18n: the cancelled-note pattern is dropped', rep('i18n-en.js', "    [/^🚫 أُلغي(?: ([\\d\\/]+))?(?: — (.+))?$/, function (m, d, why) { return '🚫 Cancelled' + (d ? ' ' + d : '') + (why ? ' — ' + why : ''); }],\n", "")],
  ['i18n: the status toast translates an unknown status halfway', rep('i18n-en.js', "[new RegExp('^✅ تم تحديث الحالة إلى: (' + LST.join('|') + ')$'), function (m, s) { return '✅ Status updated to: ' + D[s]; }],", "[/^✅ تم تحديث الحالة إلى: (.+)$/, function (m, s) { return '✅ Status updated to: ' + (D[s] || s); }],")],
  ['profile: a script tag is missing', F => Object.assign({}, F, { 'patient-profile.html': F['patient-profile.html'].replace(/<script src="lab-shade\.js\?v=[^"]+"><\/script>\n/, '') })]
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
    console.log((fail === 0 && allBit ? '✅' : '❌') + ' prove-lab-status: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && allBit ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-lab-status: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ prove-lab-status:', e && e.stack || e); process.exit(1); });

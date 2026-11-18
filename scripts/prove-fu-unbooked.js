/* prove-fu-unbooked — ج3-ج: «علاجٌ قيد الإنجاز بلا موعد قادم» (fu-unbooked.js) على الملفات الحيّة.
   (١) compute — دالةٌ محضة بـSyDentApptDead الحقيقية: علاجٌ مفتوح (followup_state = 'open') بلا موعدٍ حيّ قادم ⇒ يُعلَّم.
       اللوحة (strict = false): موعدُ اليوم الذي لم ينتهِ يكفي · الهدل (strict = true): لا يكفي إلا موعدٌ بعد يوم الهدل.
       الموعدُ الميت (ملغى · لم يحضر · مكسور · مكتمل · خرج) والمخطّطُ بلا تاريخ لا يُعدّان. المغلقُ وصفُّ المتابعة لا يُعلَّمان.
   (٢) load — قراءتان محصورتان (الطبيب · الحالة · المرضى · من اليوم) بالجالب المشترك SyDentFetchAll، مقسّمتان بـ150،
       وأيُّ فشلٍ ⇒ null (لا تنبيهَ كاذب).
   (٣) تنبيهُ اللوحة الحيّ (renderDashAlerts من index.html): صفٌّ لكل مريض، الأقدمُ علاجاً أولاً، 5 ثم صفُّ «و N غيرهم»،
       اسمٌ مُهرَّب، وصلةُ البطاقة — وكلُّ عربيٍّ ليس بياناتٍ يُترجم بالمحرّك الحقيقي.
   (٤) رقاقةُ الهدل (huddle-flags.js الحيّ): compute/chipsHtml/load، والعنوانُ بالإنجليزية.
   (٥) الأسلاك: التحميلُ قبل huddle-flags.js · cache-bust · البوابة.
   --self-test: طفراتٌ لا بدّ أن تحمّر كلُّها. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const NAMES = ['fu-unbooked.js', 'huddle-flags.js', 'dash-gaps.js', 'index.html', 'supabase-init.js', 'i18n-en.js', 'theme.js', 'scripts/cache-bust.sh', 'scripts/validate.sh'];
const LIVE = {}; NAMES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
const AR = /[؀-ۿ]/;
const tick = () => new Promise(r => setImmediate(r));

function braces(src, at, what) {   /* مرآةُ extractFunction بـprove-followup: تعليقاتٌ ونصوصٌ وتعابيرُ نمطية لا تعدّ أقواساً */
  if (at < 0) throw new Error('لم أجد ' + what);
  let i = src.indexOf('{', at), depth = 0, inS = null, inLC = false, inBC = false, inRe = false, prev = '';
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && n === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === '\\') { i++; continue; } if (c === inS) inS = null; continue; }
    if (inRe) { if (c === '\\') { i++; continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { inLC = true; i++; continue; }
    if (c === '/' && n === '*') { inBC = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '/' && /[=(,:[!&|?;{}\n]/.test(prev)) { inRe = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('أقواس غير متوازنة: ' + what);
}
const piece = (src, a, what) => braces(src, src.indexOf(a), what);

/* قاعدةٌ مزيّفة تطبّق المرشّحات فعلاً — ما لا يُرشَّح يتسرّب فيحمّر الفحص */
function fakeSb(db, log, fail) {
  return { from(t) {
    const st = { t, f: [], sel: '' };
    const q = {
      select(s) { st.sel = s; return q; },
      eq(k, v) { st.f.push(['eq', k, v]); return q; }, is(k, v) { st.f.push(['is', k, v]); return q; },
      in(k, v) { st.f.push(['in', k, v]); return q; }, gte(k, v) { st.f.push(['gte', k, v]); return q; },
      order() { return q; }, limit() { return q; },
      range(a, b) { return run(a, b); }, then(res, rej) { return run(null, null).then(res, rej); }
    };
    function run(a, b) {
      log.push({ t, f: st.f.slice(), sel: st.sel, a, b });
      if (fail && fail(t)) return Promise.resolve({ data: null, error: { message: 'boom' } });
      const rows = (db[t] || []).filter(r => st.f.every(([op, k, v]) => op === 'eq' ? r[k] === v : op === 'is' ? (r[k] == null) === (v === null) : op === 'in' ? v.indexOf(r[k]) > -1 : String(r[k] || '') >= v));
      return Promise.resolve({ data: (a == null ? rows : rows.slice(a, b + 1)).map(r => Object.assign({}, r)), error: null });
    }
    return q;
  } };
}
function sliceDecl(src, start, endMark) { const i = src.indexOf(start), j = src.indexOf(endMark, i); return src.slice(i, j + endMark.length); }
function boot(F, win) {
  const ctx = { window: win, console: { warn() { win.__warned = (win.__warned || 0) + 1; } }, Promise, setTimeout, String, Object, Array, Math, Number, JSON, Date, parseInt, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(sliceDecl(F['supabase-init.js'], 'window.SyDentApptDead = function', '\n};'), ctx);
  vm.runInContext(sliceDecl(F['supabase-init.js'], 'window.SyDentFetchAll = async function', '\n  };'), ctx);
  vm.runInContext(F['fu-unbooked.js'], ctx);
  return ctx;
}
function engine(F) {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const ctx = { console, setTimeout: () => 0, localStorage: { getItem: k => store[k] || null, setItem() {} }, location: { search: '', pathname: '/index.html', reload() {} },
    document: { readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(), write() {}, querySelector: () => null, getElementById: () => null,
      addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} }) },
    MutationObserver: function () { this.observe = () => {}; } };
  ctx.window = ctx; ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  const t = F['theme.js'], a = t.indexOf('/* ── SyI18n'), b = t.indexOf('})();', a) + 5;
  vm.runInContext(F['i18n-en.js'], ctx); vm.runInContext(t.slice(a, b), ctx);
  return s => ctx.window.SyI18n.t(s);
}
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const texts = html => html.split(/<[^>]+>/).map(x => unesc(x).replace(/\s+/g, ' ').trim()).filter(Boolean);

const DAY = '2026-11-18';
const B = (id, pid, extra) => Object.assign({ id, patient_id: pid, type: 'Implant', tooth_num: null, quadrant: null, arch: null, date: '2026-11-01', parent_id: null, followup_state: 'open', status: 'completed', doctor_id: 'D' }, extra || {});
const A = (id, pid, extra) => Object.assign({ id, patient_id: pid, date: DAY, status: 'confirmed', is_planned: false, doctor_id: 'D' }, extra || {});

async function run(F) {
  const out = [], ok = (c, m) => out.push([!!c, m]);
  const guard = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' — threw: ' + (e && e.message)); } };

  /* ═══ (١) compute ═══ */
  await guard('compute', () => {
    const U = boot(F, {}).window.SyFuUnbooked;
    const k = (appts, strict, bases) => Object.keys(U.compute(bases || [B('b', 'p')], appts, DAY, strict));
    ok(k([], false).join() === 'p' && k([], true).join() === 'p', 'an open treatment with no appointment at all is flagged on both surfaces');
    ok(k([A('a', 'p')], false).length === 0 && k([A('a', 'p')], true).join() === 'p', 'today\'s live appointment covers the dashboard, not the huddle (the next visit is still unbooked)');
    ok(k([A('a', 'p', { date: '2026-11-19' })], false).length === 0 && k([A('a', 'p', { date: '2026-12-02', status: 'pending' })], true).length === 0, 'a live appointment after the day covers both');
    const deadOnes = [{ status: 'cancelled' }, { status: 'no_show' }, { status: 'broken' }, { status: 'completed' }, { dismissed_at: '2026-11-18T10:00:00Z' }];
    ok(deadOnes.every(x => k([A('a', 'p', Object.assign({ date: '2026-11-25' }, x))], false).join() === 'p'), 'a dead appointment (cancelled · no-show · broken · completed · dismissed) is not an upcoming one');
    ok(k([A('a', 'p', { date: '2026-11-25', is_planned: true })], false).join() === 'p' && k([A('a', 'p', { date: null })], false).join() === 'p' && k([A('a', 'p', { date: '2026-11-10' })], false).join() === 'p',
      'a planned-undated or past appointment does not count');
    ok(k([A('a', 'q', { date: '2026-11-25' })], false).join() === 'p', 'another patient\'s appointment does not cover this one');
    ok(k([], false, [B('b', 'p', { followup_state: 'closed' }), B('k', 'p', { parent_id: 'x' }), B('n', 'p', { followup_state: null })]).length === 0, 'closed, plain and follow-up rows are never flagged');
    const m = U.compute([B('b2', 'p', { date: '2026-11-09' }), B('b1', 'p', { date: '2026-10-01' })], [], DAY, false);
    ok(m.p.map(x => x.id).join() === 'b1,b2', 'a patient\'s open treatments come oldest first');
    ok(U.label(B('x', 'p', { tooth_num: '36' })) === 'Implant — سن 36' && U.label(B('x', 'p', { quadrant: 'UR', type: 'Scaling' })) === 'Scaling — الربع العلوي الأيمن'
      && U.label(B('x', 'p', { arch: 'L', type: 'Denture' })) === 'Denture — الفك السفلي' && U.label({}) === 'علاج' && U.dmy('2026-11-05') === '05/11/2026', 'label and date read like the follow-up prompt');
  });

  /* ═══ (٢) load ═══ */
  await guard('load', async () => {
    const db = { ledger_sessions: [B('b1', 'p1'), B('b2', 'p2', { date: '2026-10-01' }), B('c', 'p3', { followup_state: 'closed' }), B('k', 'p1', { parent_id: 'b1', followup_state: null }),
      B('other', 'p4', { doctor_id: 'E' })],
      appointments: [A('a1', 'p1', { date: '2026-11-20' }), A('a0', 'p2', { date: '2026-11-10' }), A('ax', 'p2', { date: '2026-11-25', doctor_id: 'E' })] };
    const log = [], W = { sb: fakeSb(db, log) };
    W.SyDentFetchAll = null; const c = boot(F, W);
    const m = await c.window.SyFuUnbooked.load('D', { day: DAY, strict: false });
    ok(m && Object.keys(m).join() === 'p2', 'load: only the open treatment whose patient has no upcoming appointment of this clinic');
    const qs = log.filter(x => x.t === 'ledger_sessions')[0], qa = log.filter(x => x.t === 'appointments')[0], has = (q, op, k, v) => q.f.some(x => x[0] === op && x[1] === k && (v === undefined || JSON.stringify(x[2]) === JSON.stringify(v)));
    ok(qs && has(qs, 'eq', 'followup_state', 'open') && has(qs, 'is', 'parent_id', null) && has(qs, 'eq', 'status', 'completed') && has(qs, 'eq', 'doctor_id', 'D') && /patients\(name\)/.test(qs.sel),
      'load: the treatments read is scoped to open bases of this clinic, with the patient name');
    ok(qa && has(qa, 'gte', 'date', DAY) && has(qa, 'eq', 'doctor_id', 'D') && has(qa, 'in', 'patient_id') && qa.f.find(x => x[1] === 'patient_id')[2].slice().sort().join() === 'p1,p2' && qs.a === 0 && qs.b === 999,
      'load: appointments only for those patients, from the day on, paged by SyDentFetchAll');
    const log2 = [], db2 = { ledger_sessions: [], appointments: [] };
    for (let i = 0; i < 320; i++) db2.ledger_sessions.push(B('b' + i, 'p' + i));
    const c2 = boot(F, { sb: fakeSb(db2, log2) }), m2 = await c2.window.SyFuUnbooked.load('D', { day: DAY });
    ok(Object.keys(m2).length === 320 && log2.filter(x => x.t === 'appointments').map(x => x.f.find(y => y[1] === 'patient_id')[2].length).join() === '150,150,20', 'load: patients go in chunks of 150');
    const log3 = [], c3 = boot(F, { sb: fakeSb(db, log3) }), m3 = await c3.window.SyFuUnbooked.load('D', { day: DAY, strict: true, patientIds: ['p1', 'p9'] });
    const q3 = log3.filter(x => x.t === 'ledger_sessions')[0];
    ok(m3 && Object.keys(m3).length === 0 && q3 && has(q3, 'in', 'patient_id', ['p1', 'p9']), 'load (huddle): the read is limited to the day\'s patients; a later appointment covers p1');
    const log4 = [], c4 = boot(F, { sb: fakeSb(db, log4) });
    ok(JSON.stringify(await c4.window.SyFuUnbooked.load('D', { day: DAY, patientIds: [] })) === '{}' && log4.length === 0, 'load: no patients ⇒ {} without a query');
    const log5 = [], c5 = boot(F, { sb: fakeSb({ ledger_sessions: [], appointments: [] }, log5) });
    ok(JSON.stringify(await c5.window.SyFuUnbooked.load('D', { day: DAY })) === '{}' && log5.filter(x => x.t === 'appointments').length === 0, 'load: no open treatment ⇒ {} and no appointments read');
    for (const t of ['ledger_sessions', 'appointments']) {
      const c6 = boot(F, { sb: fakeSb(db, [], x => x === t) });
      ok(await c6.window.SyFuUnbooked.load('D', { day: DAY }) === null, 'load: a failed ' + t + ' read ⇒ null (no false alert)');
    }
    const c7 = boot(F, {}); ok(await c7.window.SyFuUnbooked.load('D', { day: DAY }) === null, 'load: no client ⇒ null');
    const log8 = [], c8 = boot(F, { sb: fakeSb(db, log8) }); await c8.window.SyFuUnbooked.load(null, { day: DAY });
    ok(log8.every(x => !x.f.some(y => y[1] === 'doctor_id')), 'load: without a uid the reads lean on RLS (no doctor filter invented)');
  });

  /* ═══ (٣) تنبيهُ اللوحة الحيّ ═══ */
  await guard('dashboard', async () => {
    const IX = F['index.html'];
    const fn = piece(IX, 'function renderDashAlerts(){', 'renderDashAlerts'), esc = piece(IX, 'function dpEsc(s){', 'dpEsc');
    const els = { alCard: { style: { display: 'none' } }, alList: { innerHTML: '' }, alTotal: { textContent: '' } };
    const mk = (n, extra) => B('b' + n, 'p' + n, Object.assign({ date: '2026-10-' + String(10 + n).padStart(2, '0'), patients: { name: 'Pt' + n } }, extra || {}));
    const db = { ledger_sessions: [mk(3, { tooth_num: '36' }), mk(1), mk(2, { patients: { name: '<img src=x onerror=1>' } }), mk(4), mk(5), mk(6), mk(7), B('x1', 'p1', { date: '2026-11-15', type: 'Crown', arch: 'U' }),
      B('bk', 'pk', { patients: { name: 'Booked' } }), B('bt', 'pt', { patients: { name: 'Today' } })],
      appointments: [A('ak', 'pk', { date: '2026-11-30' }), A('at', 'pt')], inventory_items: [], patient_intakes: [] };
    const W = { sb: fakeSb(db, []), SyDentInvOrder: { isLow: () => false } };
    const c = boot(F, W);
    Object.assign(c, { document: { getElementById: id => els[id] || null }, todayStr: () => DAY, _dashUid: 'D' });
    vm.runInContext(esc + '\n' + fn, c);
    c.renderDashAlerts(); for (let i = 0; i < 12; i++) await tick();
    const html = els.alList.innerHTML, items = html.split('<a class="al-item"').slice(1);
    ok(els.alCard.style.display === '' && items.length === 6 && els.alTotal.textContent === 7, 'dashboard: five patient rows then «و N غيرهم» — the card counts all seven');
    const hrefs = items.map(x => (x.match(/href="([^"]*)"/) || [])[1]);
    ok(hrefs.slice(0, 5).join() === ['p1', 'p2', 'p3', 'p4', 'p5'].map(p => 'patient-profile.html?id=' + p).join() && hrefs[5] === 'patients.html' && !html.includes('pk') && !html.includes('Today'), 'dashboard: oldest treatment first, each row opens its patient; a patient booked later — or still due today — is not listed');
    ok(/🔁/.test(items[0]) && /var\(--orange-bg\)/.test(items[0]) && /<div class="al-tt">علاج قيد الإنجاز بلا موعد قادم<\/div>/.test(items[0]) && /<bdi>Pt1<\/bdi> · <span>Implant · Crown — الفك العلوي · منذ 11\/10\/2026<\/span>/.test(items[0])
      && /<span>Implant — سن\u00A036 · منذ 13\/10\/2026<\/span>/.test(items[2]) && /و2 غيرهم بعلاجٍ قيد الإنجاز بلا موعد قادم/.test(items[5]),
      'dashboard: the row names the patient, every open treatment with its place, and since when');
    ok(!/<img/.test(html) && /&lt;img src=x onerror=1&gt;/.test(items[1]), 'dashboard: a patient name with markup is escaped');
    const t = engine(F), left = texts(html).filter(x => AR.test(t(x)));
    ok(texts(html).length > 15 && left.length === 0, 'English: the alert rows are translated (' + texts(html).length + ' pieces)' + (left.length ? ' — ' + left.slice(0, 4).join(' | ') : ''));
    /* فشلُ القراءة ⇒ لا صفّ، والبقيةُ كما هي */
    const els2 = { alCard: { style: { display: 'none' } }, alList: { innerHTML: '' }, alTotal: { textContent: '' } };
    const c2 = boot(F, { sb: fakeSb(db, [], x => x === 'appointments'), SyDentInvOrder: { isLow: () => false } });
    Object.assign(c2, { document: { getElementById: id => els2[id] || null }, todayStr: () => DAY, _dashUid: 'D' });
    vm.runInContext(esc + '\n' + fn, c2); c2.renderDashAlerts(); for (let i = 0; i < 12; i++) await tick();
    ok(els2.alCard.style.display === 'none' && !/قيد الإنجاز/.test(els2.alList.innerHTML), 'dashboard: a failed read shows nothing (no false alert)');
  });

  /* ═══ (٤) رقاقةُ الهدل ═══ */
  await guard('huddle', async () => {
    const db = { ledger_sessions: [B('b1', 'p1', { tooth_num: '36' }), B('b2', 'p1', { type: 'Crown', quadrant: 'UR', date: '2026-11-02' }), B('b3', 'p2'), B('b4', 'p3')],
      appointments: [A('t1', 'p1'), A('t2', 'p2'), A('n2', 'p2', { date: '2026-11-26' }), A('t3', 'p3'), A('c3', 'p3', { date: '2026-11-27', status: 'cancelled' })] };
    const log = [], c = boot(F, { sb: fakeSb(db, log) });
    vm.runInContext(F['huddle-flags.js'], c);
    const H = c.window.SyDentHuddle;
    const r = await H.load('D', { today: DAY, appts: [A('t1', 'p1'), A('t2', 'p2'), A('t3', 'p3')], patients: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
    ok(r.p1.inprog.map(x => x.id).join() === 'b1,b2' && r.p2.inprog.length === 0 && r.p3.inprog.length === 1, 'huddle: today\'s visit does not count; a later live appointment does; a cancelled one does not');
    const fu = log.filter(x => x.t === 'ledger_sessions' && x.f.some(y => y[1] === 'followup_state'))[0];
    ok(fu && fu.f.some(y => y[0] === 'in' && y[1] === 'patient_id' && y[2].join() === 'p1,p2,p3'), 'huddle: the read is limited to the day\'s patients');
    const h1 = H.chipsHtml(r.p1, 'p1', null), h2 = H.chipsHtml(r.p2, 'p2', null);
    const title = unesc((h1.match(/title="([^"]*قيد الإنجاز بلا موعدٍ[^"]*)"/) || [])[1] || '');
    ok(/class="pt-flag cbadge tone tone-orange pt-flag-sm hud-chip" href="patient-profile\.html\?id=p1"/.test(h1) && />🔁 قيد الإنجاز بلا موعد</.test(h1)
      && title === 'علاجٌ قيد الإنجاز بلا موعدٍ بعد هذه الزيارة: «Implant — سن 36» · «Crown — الربع العلوي الأيمن» — احجز زيارته التالية قبل أن يغادر' && !/قيد الإنجاز بلا موعد/.test(h2),
      'huddle: an orange chip that opens the patient file and names the open treatments; none when the next visit is booked');
    const t = engine(F), en = t(title), chipEn = t('🔁 قيد الإنجاز بلا موعد');
    ok(!AR.test(en) && /^A treatment in progress with no appointment after this visit: «Implant — tooth 36» · «Crown — Upper right quadrant» — book its next visit/.test(en) && chipEn === '🔁 In progress, not booked',
      'English: the chip and its title');
    const c2 = boot(F, { sb: fakeSb(db, [], x => x === 'appointments') }); vm.runInContext(F['huddle-flags.js'], c2);
    const r2 = await c2.window.SyDentHuddle.load('D', { today: DAY, appts: [A('t1', 'p1')], patients: [{ id: 'p1' }] });
    ok(r2.p1 && r2.p1.inprog.length === 0, 'huddle: a failed read ⇒ no chip');
    const db4 = { ledger_sessions: [{ id: 's1', patient_id: 'p1', status: 'planned', appointment_id: null, plan_option: null, doctor_id: 'D' }], appointments: [], teeth_status: [] };
    const c4 = boot(F, { sb: fakeSb(db4, []) }); vm.runInContext(F['huddle-flags.js'], c4);
    c4.window.SyFuUnbooked.load = () => { throw new Error('boom'); };
    const r4 = await c4.window.SyDentHuddle.load('D', { today: DAY, appts: [A('t1', 'p1')], patients: [{ id: 'p1' }] });
    ok(r4.p1 && r4.p1.planned === 1 && r4.p1.inprog.length === 0, 'huddle: a throwing module never takes the other flags down');
    const c3 = { window: {}, console: { warn() {} }, Promise, String, Object, Array, Math, Number, JSON, Date, parseInt, encodeURIComponent }; vm.createContext(c3); vm.runInContext(F['huddle-flags.js'], c3);
    const r3 = c3.window.SyDentHuddle.compute({ today: DAY, appts: [A('t1', 'p1')], patients: [{ id: 'p1' }] });
    ok(r3.p1.inprog.length === 0 && c3.window.SyDentHuddle.chipsHtml(r3.p1, 'p1', null) === '', 'huddle: without the module nothing changes');
  });

  /* ═══ (٤ب) مراجعة ج3: زيارةُ المتابعة المخطّطة ليست «بنداً معتمداً بلا موعد» (🦷) — تحملها 🔁 وحدها ═══ */
  await guard('planned follow-ups', async () => {
    const c = { window: {}, console: { warn() {} }, Promise, String, Object, Array, Math, Number, JSON, Date, parseInt, encodeURIComponent }; vm.createContext(c);
    vm.runInContext(sliceDecl(F['supabase-init.js'], 'window.SyDentApptDead = function', '\n};'), c); vm.runInContext(F['huddle-flags.js'], c);
    const r = c.window.SyDentHuddle.compute({ today: DAY, appts: [A('t1', 'p1')], patients: [{ id: 'p1' }],
      planned: [{ id: 'k', patient_id: 'p1', status: 'planned', appointment_id: null, plan_option: null, parent_id: 'b1' }, { id: 'x', patient_id: 'p1', status: 'planned', appointment_id: null, plan_option: null }] });
    ok(r.p1.planned === 1, 'huddle 🦷: a planned follow-up visit is not counted as an approved plan item (the real item still is)');
    const log = [], c2 = boot(F, { sb: fakeSb({ ledger_sessions: [{ id: 'k', patient_id: 'p1', status: 'planned', parent_id: 'b1', doctor_id: 'D' }], appointments: [] }, log) });
    vm.runInContext(F['huddle-flags.js'], c2);
    const r2 = await c2.window.SyDentHuddle.load('D', { today: DAY, appts: [A('t1', 'p1')], patients: [{ id: 'p1' }] });
    const q = log.filter(x => x.t === 'ledger_sessions' && x.f.some(y => y[0] === 'eq' && y[1] === 'status' && y[2] === 'planned'))[0];
    ok(r2.p1.planned === 0 && q && q.f.some(y => y[0] === 'is' && y[1] === 'parent_id' && y[2] === null), 'huddle 🦷: the planned read leaves follow-up visits out');
    const gz = { window: {}, console: { warn() {} }, Promise, String, Object, Array, Math, Number, JSON, Date, parseInt, encodeURIComponent, isFinite }; vm.createContext(gz);
    vm.runInContext(sliceDecl(F['supabase-init.js'], 'window.SyDentApptDead = function', '\n};'), gz); vm.runInContext(F['dash-gaps.js'], gz);
    const CS = { booking_work_start: '09:00:00', booking_work_end: '17:00:00', booking_work_days: '0,1,2,3,4,5,6', booking_slot_minutes: 30 };
    const g = gz.window.SyDentGaps.compute({ today: DAY, nowMin: 8 * 60, cs: CS, appts: [], asap: [], linkedAppts: {}, upcoming: {},
      planned: [{ patient_id: 'f1', status: 'planned', parent_id: 'b1' }, { patient_id: 'u1', status: 'planned' }], patients: [{ id: 'f1', name: 'F' }, { id: 'u1', name: 'U' }] });
    ok(g.unscheduled.map(x => x.patient_id).join() === 'u1' && /\.eq\('status', 'planned'\)\.is\('parent_id', null\); \}\),/.test(F['dash-gaps.js']),
      'gaps 🦷 «علاج معتمد بلا موعد»: a planned follow-up visit is not an approved plan item (compute and read)');
  });

  /* ═══ (٥) الأسلاك ═══ */
  await guard('wiring', () => {
    const IX = F['index.html'], iF = IX.indexOf('<script src="fu-unbooked.js?v='), iH = IX.indexOf('<script src="huddle-flags.js?v=');
    ok(iF > -1 && iH > iF && (IX.match(/fu-unbooked\.js\?v=/g) || []).length === 1, 'the dashboard loads fu-unbooked.js once, before huddle-flags.js');
    const cb = F['scripts/cache-bust.sh'];
    ok((cb.match(/fu-unbooked\\\.js\|/g) || []).length === 2 && /fu-unbooked\.js · /.test(cb), 'cache-bust stamps fu-unbooked.js');
    ok(/prove-fu-unbooked\.js" --self-test/.test(F['scripts/validate.sh']), 'the prover is in the gate with its mutants');
    ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(F['fu-unbooked.js']), 'fu-unbooked.js only reads');
  });
  return out;
}

const rep = (f, a, b) => F => { if (F[f].indexOf(a) < 0) throw new Error('طفرةٌ بلا مرساة: ' + a.slice(0, 50)); return Object.assign({}, F, { [f]: F[f].split(a).join(b) }); };
const MUT = [
  ['huddle counts today\'s visit', rep('fu-unbooked.js', 'if (strict ? d <= day : d < day) return false;', 'if (d < day) return false;')],
  ['dashboard ignores today\'s visit', rep('fu-unbooked.js', 'if (strict ? d <= day : d < day) return false;', 'if (d <= day) return false;')],
  ['dead appointment counts', rep('fu-unbooked.js', '    return !dead(a, day);\n', '    return true;\n')],
  ['planned undated appointment counts', rep('fu-unbooked.js', "if (!a || !a.date || a.is_planned === true) return false;", "if (!a || !a.date) return false;")],
  ['closed treatment flagged', rep('fu-unbooked.js', " || b.followup_state !== 'open' ||", ' ||')],
  ['booked patient flagged', rep('fu-unbooked.js', ' || booked[b.patient_id]) return;', ') return;')],
  ['newest first', rep('fu-unbooked.js', "String(x.date || '').localeCompare(String(y.date || ''))", "String(y.date || '').localeCompare(String(x.date || ''))")],
  ['treatments read unscoped by state', rep('fu-unbooked.js', ".eq('followup_state', 'open').is('parent_id', null)", ".is('parent_id', null)")],
  ['treatments read not scoped to the clinic', rep('fu-unbooked.js', '          if (uid) q = q.eq(\'doctor_id\', uid);\n', '')],
  ['appointments read not scoped to the clinic', rep('fu-unbooked.js', "return uid ? q.eq('doctor_id', uid) : q;", 'return q;')],
  ['huddle read not limited to the day\'s patients', rep('fu-unbooked.js', "return ids ? q.in('patient_id', ids) : q;", 'return q;')],
  ['failed read ⇒ everyone flagged', rep('fu-unbooked.js', '        if (!ra || ra.error) return null;', '        if (!ra || ra.error) ra = { data: [] };')],
  ['unpaged read', rep('fu-unbooked.js', "if (typeof window.SyDentFetchAll === 'function') return window.SyDentFetchAll(build);", '')],
  ['no chunking', rep('fu-unbooked.js', 'var part = pids.slice(j, j + CHUNK);', 'var part = pids; j = pids.length;')],
  ['dashboard name unescaped', rep('index.html', "sub:'<bdi>'+dpEsc(nm)+'</bdi>", "sub:'<bdi>'+nm+'</bdi>")],
  ['tooth number can wrap away from «سن»', rep('index.html', ".replace(/سن (\\d+)/g, 'سن\\u00A0$1')", '')],
  ['dashboard shows every patient', rep('index.html', 'pts.slice(0, FU_MAX).forEach', 'pts.forEach')],
  ['dashboard overflow row dropped', rep('index.html', "if(pts.length>FU_MAX) rows.push(", "if(false) rows.push(")],
  ['dashboard rows not sorted', rep('index.html', "    .sort(function(x,y){ return String(x.b[0].date||'').localeCompare(String(y.b[0].date||'')) || String(x.pid).localeCompare(String(y.pid)); });", ';')],
  ['dashboard strict like the huddle', rep('index.html', '{ day: todayStr(), strict: false }', '{ day: todayStr(), strict: true }')],
  ['huddle not strict', rep('huddle-flags.js', 'strict: true, patientIds: todayIds', 'strict: false, patientIds: todayIds')],
  ['huddle chip not rendered', rep('huddle-flags.js', '    if (e.inprog && e.inprog.length)   /* ج3-ج */', '    if (false)')],
  ['huddle loses the map', rep('huddle-flags.js', 'extractionKeys: extractionKeys, inprog: inprog });', 'extractionKeys: extractionKeys });')],
  ['huddle failure throws everything away', rep('huddle-flags.js', '          catch (eFu) { inprog = null; }', '          catch (eFu) { throw eFu; }')],
  ['loaded after huddle-flags', F => { const re = /(<script src="fu-unbooked\.js\?v=[A-Za-z0-9]+"><\/script>)\n(<script src="huddle-flags\.js\?v=[A-Za-z0-9]+"><\/script>)/;
    if (!re.test(F['index.html'])) throw new Error('طفرةٌ بلا مرساة: script order'); return Object.assign({}, F, { 'index.html': F['index.html'].replace(re, '$2\n$1') }); }],
  ['cache-bust forgets the file', rep('scripts/cache-bust.sh', 'huddle-flags\\.js|fu-unbooked\\.js|', 'huddle-flags\\.js|')],
  ['alert untranslated', rep('i18n-en.js', "    'علاج قيد الإنجاز بلا موعد قادم': 'Treatment in progress, no upcoming appointment',\n", '')],
  ['chip title untranslated', rep('i18n-en.js', "    [/^علاجٌ قيد الإنجاز بلا موعدٍ بعد هذه الزيارة:", "    [/^XX:")],
  ['huddle 🦷 counts planned follow-ups', rep('huddle-flags.js', "if (!s || !s.patient_id || s.parent_id || (s.status || 'planned') !== 'planned') return;", "if (!s || !s.patient_id || (s.status || 'planned') !== 'planned') return;")],
  ['huddle planned read keeps follow-ups', rep('huddle-flags.js', ".eq('status', 'planned').is('parent_id', null).in('patient_id', list);", ".eq('status', 'planned').in('patient_id', list);")],
  ['gaps 🦷 counts planned follow-ups', rep('dash-gaps.js', "if (!s || !s.patient_id || s.parent_id || (s.status || 'planned') !== 'planned') return;", "if (!s || !s.patient_id || (s.status || 'planned') !== 'planned') return;")],
  ['gaps planned read keeps follow-ups', rep('dash-gaps.js', ".eq('status', 'planned').is('parent_id', null); }),", ".eq('status', 'planned'); }),")],
  ['overflow row untranslated', rep('i18n-en.js', "    [/^و(\\d+) غيرهم بعلاجٍ", "    [/^XX(\\d+) غيرهم بعلاجٍ")]
];

(async () => {
  const { runMutants } = require('./mutant-pool');
  const res = await run(LIVE), bad = res.filter(x => !x[0]);
  if (bad.length) { bad.forEach(x => console.error('  ✗ ' + x[1])); console.error('prove-fu-unbooked ❌ ' + bad.length + '/' + res.length + ' توكيداً سقط'); process.exit(1); }
  if (process.argv.indexOf('--self-test') < 0) { console.log('prove-fu-unbooked ✅ ' + res.length + ' توكيداً'); return; }
  const anchorless = [];
  MUT.forEach(([name, mut]) => { try { mut(LIVE); } catch (e) { anchorless.push(name + ' (' + e.message + ')'); } });
  const pool = await runMutants(MUT, async ([, mut]) => { let F2; try { F2 = mut(LIVE); } catch (e) { return false; } const r = await run(F2); return r.some(x => !x[0]); });
  const dull = pool.dull.map(i => MUT[i][0]).filter(n => !anchorless.some(a => a.indexOf(n + ' (') === 0)).concat(anchorless);
  if (pool.failed.length) console.error('  ✗ عاملٌ مات بلا تقرير: ' + pool.failed.join());
  if (dull.length || pool.failed.length) { dull.forEach(n => console.error('  ✗ طفرةٌ لم تعضّ: ' + n)); console.error('prove-fu-unbooked ❌ ' + pool.bit + '/' + MUT.length + ' طفرات تعضّ'); process.exit(1); }
  console.log('prove-fu-unbooked ✅ ' + res.length + ' توكيداً · ' + pool.bit + '/' + MUT.length + ' طفرات تعضّ');
})();

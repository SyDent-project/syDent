/* v517 — مثبتُ ملخّص أمس (dash-yesterday.js) — مستقل، على الملفات الحيّة مع SyDentDaySheet وSyDentPayMethods الحقيقيين.
   (١) آخرُ يوم عمل من booking_work_days (الجمعةُ مغلقة ⇒ الخميس صباحَ السبت · بلا إعداد ⇒ أمس · مصفوفة/نص)؛
   (٢) الأرقامُ = ناتجُ SyDentDaySheet.compute رقماً برقم (إنتاج · مقبوضات · حسب الطريقة بتسميات pay-methods · الخارج · الدرج)؛
   (٣) الإقفال: يُنبَّه فقط حين تحرّك مال · المُقفَل بفرقه · طبقةُ الدولار فقط إن نشطت؛
   (٤) المواعيد (منتهٍ/غياب+broken/ملغى/لم تُختم) والمرضى الجدد باليوم المحلي؛
   (٥) العرض: هروبُ الأسماء · روابطُ المحاسبة للمالك فقط · الحالةُ الفارغة؛ (٦) load: استعلامُ المواعيد بنطاق الطبيب واليوم؛
   (٧) الربط باللوحة (ترتيبُ الوسوم · البطاقة · booking_work_days) و?ds= بالمحاسبة (مُتحقَّقٌ منه) وقائمةُ سماح cache-bust.
   --self-test: 6 طفرات لا بدّ أن تحمّر. */
'use strict';
process.env.TZ = 'Asia/Damascus';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const SRC = read('dash-yesterday.js'), DS = read('acc-daysheet.js'), PM = read('pay-methods.js');

function load(src, sb) {
  const win = {}; if (sb) win.sb = sb;
  const ctx = { window: win, console: { warn() { win.__warned = true; } }, Number, parseInt, String, Date, Array, Object, Promise, Math, RegExp, encodeURIComponent, JSON, isNaN };
  vm.createContext(ctx);
  vm.runInContext(PM, ctx); vm.runInContext(DS, ctx); vm.runInContext(src, ctx);
  return win;
}
const DAY = '2026-09-27';
const DATA = {
  sessions: [{ id: 's1', cost: 150000, status: 'completed', currency: 'SYP', date: DAY }, { id: 's2', cost: 200000, status: 'completed', currency: 'SYP', date: DAY }, { id: 's3', cost: 50, status: 'completed', currency: 'USD', date: DAY }, { id: 's4', cost: 9, status: 'planned', currency: 'SYP', date: DAY }],
  payments: [{ id: 'y1', amount: 200000, method: 'نقداً', currency: 'SYP', date: DAY }, { id: 'y2', amount: 100000, method: 'شام كاش', currency: 'SYP', date: DAY }, { id: 'y3', amount: 20, method: 'cash', currency: 'USD', date: DAY }],
  adjustments: [], expenses: [{ id: 'e1', amount: 30000, payment_method: 'cash', currency: 'SYP', date: DAY }], labPayments: [], payouts: [], closings: []
};
const APPTS = [{ id: 'a1', patient_name: 'س', status: 'confirmed', dismissed_at: 'x' }, { id: 'a2', patient_name: 'ع', status: 'completed', dismissed_at: null },
               { id: 'a3', patient_name: '<b>غائب</b>', status: 'no_show' }, { id: 'a4', patient_name: 'ق', status: 'broken' }, { id: 'a5', patient_name: 'م', status: 'cancelled' }, { id: 'a6', patient_name: 'ن', status: 'confirmed' }];
const PATS = [{ id: 'p1', created_at: '2026-09-26T22:30:00Z' } /* 01:30 دمشق 27/9 */, { id: 'p2', created_at: '2026-09-27T21:30:00Z' } /* 00:30 دمشق 28/9 */, { id: 'p3', created_at: '2026-09-27T09:00:00Z' }, { id: 'p4', created_at: '2026-09-26T22:00:00Z' } /* 01:00 دمشق 27/9 */];

function suite(src) {
  const W = load(src), Y = W.SyDentYesterday, DSh = W.SyDentDaySheet;
  /* (١) */
  let w = Y.lastWorkDay('2026-09-26', '0,1,2,3,4,6');
  ok(w.day === '2026-09-24' && w.isYesterday === false && /^آخر يوم عمل — الخميس 24\/9\/2026$/.test(w.label), 'workday: Saturday with Friday closed → Thursday, labelled as last work day');
  w = Y.lastWorkDay('2026-09-28', '0,1,2,3,4,6');
  ok(w.day === '2026-09-27' && w.isYesterday && /^أمس — الأحد 27\/9\/2026$/.test(w.label), 'workday: Monday → Sunday = yesterday');
  ok(Y.lastWorkDay('2026-09-26', null).day === '2026-09-25' && Y.lastWorkDay('2026-09-26', '').day === '2026-09-25', 'workday: no setting → plain yesterday');
  ok(Y.lastWorkDay('2026-09-26', [0, 1, 2, 3, 4]).day === '2026-09-24', 'workday: array input, Fri+Sat closed → Thursday');
  ok(Y.lastWorkDay('2026-10-01', 'x,y').day === '2026-09-30' && Y.lastWorkDay('2026-01-01', '0,1,2,3,4,6').day === '2025-12-31', 'workday: invalid setting → yesterday; month/year boundary');
  /* (٢) */
  const sheet = DSh.compute(DATA, DAY);
  let s = Y.compute({ day: DAY, label: 'أمس — الأحد 27/9/2026', sheet, appts: APPTS, patients: PATS });
  const L = s.layers.find(x => x.cur === 'SYP'), U = s.layers.find(x => x.cur === 'USD');
  ok(L && L.production === sheet.SYP.production.total && L.production === 350000 && L.sessions === 2, 'numbers: production = day-sheet production (planned excluded)');
  ok(L.collected === sheet.SYP.collected.total && L.collected === 300000 && L.payments === 2, 'numbers: collected = day-sheet collected');
  ok(L.byMethod.length === 2 && L.byMethod[0].label === 'نقداً' && L.byMethod[0].total === 200000 && L.byMethod[1].label === 'شام كاش' && L.byMethod[1].total === 100000, 'numbers: by-method list with real pay-methods labels, largest first');
  ok(L.outflow === sheet.SYP.outflow.total && L.outflow === 30000 && L.cash === sheet.SYP.net.cash && L.cash === 170000, 'numbers: outflow and cash drawer copied from the day sheet');
  ok(U && U.production === 50 && U.collected === 20 && s.layers.length === 2, 'numbers: USD layer present when active');
  const s2 = Y.compute({ day: DAY, sheet: DSh.compute(Object.assign({}, DATA, { sessions: DATA.sessions.filter(x => x.currency === 'SYP'), payments: DATA.payments.filter(x => x.currency === 'SYP') }), DAY), appts: [], patients: [] });
  ok(s2.layers.length === 1 && s2.layers[0].cur === 'SYP', 'numbers: inactive USD layer omitted');
  /* (٣) */
  ok(L.needsClosing === true && L.closing === null, 'closing: money moved and no closing row → alert');
  const closed = DSh.compute(Object.assign({}, DATA, { closings: [{ id: 'c1', day: DAY, currency: 'SYP', expected: 170000, counted: 165000, note: '', closed_at: 'x' }] }), DAY);
  const s3 = Y.compute({ day: DAY, sheet: closed, appts: [], patients: [] }).layers.find(x => x.cur === 'SYP');
  ok(s3.needsClosing === false && s3.closing && s3.closing.variance === -5000, 'closing: closed → no alert, variance carried (-5000)');
  const prodOnly = DSh.compute(Object.assign({}, DATA, { payments: [], expenses: [] }), DAY);
  const s4 = Y.compute({ day: DAY, sheet: prodOnly, appts: [], patients: [] }).layers.find(x => x.cur === 'SYP');
  ok(s4 && s4.moved === false && s4.needsClosing === false, 'closing: production without any payment or cash outflow → no closing needed');
  const outOnly = DSh.compute(Object.assign({}, DATA, { sessions: [], payments: [] }), DAY);
  ok(Y.compute({ day: DAY, sheet: outOnly, appts: [], patients: [] }).layers.find(x => x.cur === 'SYP').needsClosing === true, 'closing: cash went out (expense) → closing needed even with no income');
  /* (٤) */
  ok(s.appts.total === 6 && s.appts.done === 2 && s.appts.missed === 2 && s.appts.cancelled === 1 && s.appts.open === 1, 'appts: done (dismissed or completed) / missed (no_show + broken) / cancelled / open');
  ok(s.appts.missedNames.join('|') === '<b>غائب</b>|ق', 'appts: missed names collected raw (escaped at render)');
  ok(s.newPatients === 3, 'new patients: counted by local (Damascus) day — 01:30 and 01:00 count for the 27th, 00:30 of the 28th does not');
  ok(Y.compute({ day: DAY, sheet: {}, appts: [], patients: [] }).empty === true && s.empty === false, 'empty flag only when nothing at all');
  /* (٥) */
  const h = Y.render(s, { owner: true });
  ok(/💎 الإنتاج/.test(h) && /\u2066350,000 ل\.س\u2069/.test(h) && /\u206650 \$\u2069/.test(h) && /yd-cur/.test(h), 'render: production per currency with LTR amounts and currency tags when two layers');
  ok(/نقداً \u2066200,000 ل\.س\u2069/.test(h) && /شام كاش \u2066100,000 ل\.س\u2069/.test(h), 'render: method chips');
  ok(/tone-red[^>]*href="accounting\.html\?ds=2026-09-27"[^>]*>⚠️ الصندوق أمس غير مُقفَل — أقفله/.test(h), 'render: unclosed drawer → red chip linking to that day\'s sheet (owner)');
  ok(/&lt;b&gt;غائب&lt;\/b&gt;، ق/.test(h) && !/<b>غائب<\/b>/.test(h) && /🚫 غاب \u20662\u2069/.test(h) && /أُنجز \u20662\u2069/.test(h) && /أُلغي \u20661\u2069/.test(h) && /لم تُختم \u20661\u2069/.test(h), 'render: appointment line with escaped missed names in the title');
  ok(/🆕 مرضى جدد<\/span><span class="yd-v">\u20663\u2069/.test(h) && /class="card-action yd-link" href="accounting\.html\?ds=2026-09-27"/.test(h), 'render: new patients + full-sheet link for the owner');
  const hs = Y.render(s, { owner: false });
  ok(!/href=/.test(hs) && /غير مُقفَل<\/span>/.test(hs) && !/أقفله/.test(hs), 'render: staff sees the state but no accounting links');
  const hc = Y.render(Y.compute({ day: DAY, label: 'أمس — x', sheet: closed, appts: [], patients: [] }), { owner: true });
  ok(/tone-orange[^>]*>⚠️ الصندوق مُقفَل — فرق \u2066-5,000 ل\.س\u2069/.test(hc), 'render: closed with variance → orange chip');
  const hm = Y.render(Y.compute({ day: DAY, label: 'أمس — x', sheet: DSh.compute(Object.assign({}, DATA, { closings: [{ id: 'c1', day: DAY, currency: 'SYP', expected: 170000, counted: 170000 }], sessions: DATA.sessions.filter(x => x.currency === 'SYP'), payments: DATA.payments.filter(x => x.currency === 'SYP') }), DAY), appts: [], patients: [] }), {});
  ok(/tone-green[^>]*>✅ الصندوق مُقفَل — مطابق/.test(hm) && !/yd-cur/.test(hm), 'render: matched closing → green; single layer → no currency tag');
  ok(/yd-empty/.test(Y.render(Y.compute({ day: DAY, sheet: {}, appts: [], patients: [] }), { owner: true })), 'render: empty state');
  const hl = Y.render(Y.compute({ day: DAY, label: 'آخر يوم عمل — الخميس', sheet, appts: [], patients: [] }), { owner: true });
  ok(/الصندوق ذلك اليوم غير مُقفَل/.test(hl), 'render: alert wording follows the label (last work day vs yesterday)');
  ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')) && /if \(window\.SyDentYesterday\) return;/.test(src) && !/\.update\(|\.insert\(|\.delete\(|\.upsert\(|innerHTML/.test(src), 'module: idempotent, read-only, no DOM writes, tones only');
}
suite(SRC);

(async () => {
  /* (٦) load */
  const calls = [];
  const sb = { from(t) { const rec = { table: t, eq: [] }; calls.push(rec); const o = { select(c) { rec.select = c; return o; }, eq(k, v) { rec.eq.push([k, v]); return o; }, gte() { return o; }, lte() { return o; },
    then(res) { const dayQ = (rec.eq.find(x => x[0] === 'date') || [])[1]; const reDate = rows => rows.map(x => Object.assign({}, x, { date: dayQ || x.date }));
    const d = t === 'appointments' ? APPTS : (t === 'ledger_sessions' ? reDate(DATA.sessions) : (t === 'ledger_payments' ? reDate(DATA.payments) : [])); return Promise.resolve({ data: d, error: null }).then(res); } }; return o; } };
  const W = load(SRC, sb);
  const r = await W.SyDentYesterday.load(sb, 'DOC', { today: '2026-09-26', workDays: '0,1,2,3,4,6', patients: PATS });
  ok(r.day === '2026-09-24' && /آخر يوم عمل/.test(r.label), 'load: resolves the last work day before building');
  const aq = calls.find(c => c.table === 'appointments');
  ok(aq && aq.eq.some(x => x[0] === 'doctor_id' && x[1] === 'DOC') && aq.eq.some(x => x[0] === 'date' && x[1] === '2026-09-24') && /dismissed_at/.test(aq.select) && /patient_name/.test(aq.select), 'load: appointments query scoped to doctor + that day');
  ok(calls.some(c => c.table === 'ledger_sessions' && c.eq.some(x => x[0] === 'date' && x[1] === '2026-09-24')) && calls.some(c => c.table === 'day_closings'), 'load: day sheet loaded through SyDentDaySheet for that day (incl. closings)');
  ok(r.appts.total === 6 && r.layers.length === 2 && !calls.some(c => c.table === 'patients'), 'load: appointments classified, layers computed, patients never re-fetched');
  /* (٧) الربط */
  const IX = read('index.html'), AC = read('accounting.html'), CB = read('scripts/cache-bust.sh');
  const iPm = IX.indexOf('<script src="pay-methods.js?v='), iDs = IX.indexOf('<script src="acc-daysheet.js?v='), iYd = IX.indexOf('<script src="dash-yesterday.js?v=');
  ok(iPm > 0 && iDs > iPm && iYd > iDs && (IX.match(/dash-yesterday\.js\?v=/g) || []).length === 1, 'dashboard: pay-methods → acc-daysheet → dash-yesterday, single tag each');
  ok(/id="ydCard"/.test(IX) && /id="ydBody"/.test(IX) && /id="ydDay"/.test(IX) && IX.indexOf('id="actPatientsCard"') > 0 && IX.indexOf('id="actPatientsCard"') < IX.indexOf('id="ydCard"') && IX.indexOf('id="ydCard"') < IX.indexOf('id="glCard"') && IX.indexOf('id="glCard"') < IX.indexOf('id="alCard"') && IX.indexOf('id="alCard"') < IX.indexOf('id="dashLabsCard"'), 'dashboard (v529): most-active → yesterday → goal, then alerts and lab orders full width below the grid');
  // v530: the most-active list follows the right column's height (owner: no empty gap under a column)
  ok(/function adjustActivePatientsFill\(/.test(IX) && /_dashNaturalColH\(cols\[0\]\)/.test(IX) && /\n  initActivePatientsAutoFill\(\);\n/.test(IX) && /#recentPatients\[data-settled\] \.patient-item\{animation:none;\}/.test(IX) && /\.dash-grid \.col > #todayApptsCard,\.dash-grid \.col > #actPatientsCard\{flex:1;\}/.test(IX), 'dashboard (v530): most-active row count is dynamic, wired at boot, no replayed animation, both long lists absorb the leftover');
  ok(/booking_work_days/.test(IX.slice(IX.indexOf("select('whatsapp_reminders_enabled"), IX.indexOf("select('whatsapp_reminders_enabled") + 260)), 'dashboard: booking_work_days read in the existing settings query');
  ok(/window\.SyDentYesterday\.load\(window\.sb, uid, \{ today: today, workDays: _dashCfgWa && _dashCfgWa\.booking_work_days, patients: list \}\)/.test(IX) && /window\.SyDentYesterday\.render\(_yd, \{ owner: nlIsOwner\(\) \}\)/.test(IX), 'dashboard: one load with work days + loaded patients; owner-gated links');
  /* v554 (DeepCode #1): تنطلق بعد الإعدادات (أيامُ العمل) وقبل الهدل — لا تعتمد عليه، وكانت بعده بجولتين */
  ok(IX.indexOf('window.SyDentYesterday.load(') > IX.indexOf('  await _waP;') && IX.indexOf('window.SyDentYesterday.load(') < IX.indexOf('_dashHuddle = await window.SyDentHuddle.load') && IX.indexOf('window.SyDentYesterday.load(') < IX.indexOf('_dashUid = uid;'), 'dashboard: runs once the settings are in, before the huddle and the rest of the page');
  ok(/get\('ds'\)/.test(AC) && /if \(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(_dsQ\)\) _dsQ = '';/.test(AC) && /SyDentDaySheet\.pick\(_dsQ\)/.test(AC), 'accounting: ?ds= validated as YYYY-MM-DD before picking that day');
  ok((CB.match(/dash-yesterday/g) || []).length === 3, 'cache-bust.sh: allow-listed (3 places)');

  if (process.argv.includes('--self-test')) {
    const muts = [
      ['var c = new Date(d.getFullYear(), d.getMonth(), d.getDate() - k);', 'var c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);', 'work day walks forward'],
      ['needsClosing: moved && !L.closing', 'needsClosing: !L.closing', 'closing demanded with no money movement'],
      ["else if (st === 'no_show' || st === 'broken') {", "else if (st === 'no_show') {", 'broken not counted as missed'],
      ['if (ymdLocal(d) === day) newPts++;', 'if (String(p.created_at).slice(0, 10) === day) newPts++;', 'new patients by UTC day'],
      ["var t = title ? ' title=\"' + esc(title) + '\"' : '';", "var t = title ? ' title=\"' + title + '\"' : '';", 'missed names unescaped'],
      ['var moved = !!((L.collected && L.collected.count) || (L.net && L.net.cashOut > 0));', 'var moved = !!(L.collected && L.collected.count);', 'expense-only day skips closing']
    ];
    let red = 0;
    for (const [a, b, name] of muts) {
      if (!SRC.includes(a)) { ok(false, 'mutation anchor missing: ' + name); continue; }
      const f0 = fail, p0 = pass, log = console.log; console.log = () => {};
      try { suite(SRC.replace(a, b)); } catch (e) { fail++; }
      console.log = log;
      if (fail > f0) red++; else console.log('MUTANT SURVIVED:', name);
      fail = f0; pass = p0;
    }
    ok(red === muts.length, 'self-test: all ' + muts.length + ' mutants caught (' + red + ')');
  }
  console.log((fail ? '❌' : '✅') + ' مثبت ملخّص أمس: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL exception', e); process.exit(1); });

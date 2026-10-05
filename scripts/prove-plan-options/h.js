/* SyDent M145 end-to-end harness — real code (pp-dental.js, pp-plan.js, patient-profile.html functions
   extracted by acorn) running against an in-memory Supabase with the live schema and its unique keys. */
const fs = require('fs'), vm = require('vm'), ext = require('./extract.js');
const REPO = require('path').resolve(__dirname, '../..') + '/';
let SEQ = 0; const uid = p => p + '-' + (++SEQ);

function makeDB() {
  const T = { teeth_status: [], ledger_sessions: [], appointments: [] }, log = [];
  const TS_KEY = r => [r.doctor_id, r.patient_id, String(r.tooth_num), r.surface].join('|');
  function uniqueCheck(table, rows) {
    if (table !== 'teeth_status') return null;
    const seen = {};
    for (const r of rows) { const k = TS_KEY(r); if (seen[k]) return { code: '23505', message: 'duplicate key teeth_status ' + k }; seen[k] = 1; }
    return null;
  }
  function from(table) {
    const st = { op: 'select', v: null, f: [], opts: null, single: false, returning: false };
    const api = {
      select() { if (st.op !== 'select') st.returning = true; return api; },
      insert(v) { st.op = 'insert'; st.v = v; return api; },
      update(v) { st.op = 'update'; st.v = v; return api; },
      delete() { st.op = 'delete'; return api; },
      upsert(v, o) { st.op = 'upsert'; st.v = v; st.opts = o || {}; return api; },
      eq(k, v) { st.f.push(r => r[k] !== null && r[k] !== undefined && String(r[k]) === String(v)); return api; },
      neq(k, v) { st.f.push(r => String(r[k]) !== String(v)); return api; },
      in(k, a) { st.f.push(r => a.map(String).includes(String(r[k]))); return api; },
      is(k, v) { st.f.push(r => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return api; },
      not(k, op, v) { if (op === 'is' && v === null) st.f.push(r => r[k] !== null && r[k] !== undefined); else throw new Error('not() unsupported ' + op); return api; },
      order() { return api; }, limit() { return api; },
      single() { st.single = true; return api; }, maybeSingle() { st.single = true; return api; },
      then(res, rej) { try { res(exec()); } catch (e) { rej(e); } }
    };
    function match(r) { return st.f.every(fn => fn(r)); }
    function exec() {
      const rows = T[table] || (T[table] = []);
      log.push({ table, op: st.op, v: st.v });
      if (st.op === 'select') { const d = rows.filter(match).map(r => ({ ...r })); return { data: st.single ? (d[0] || null) : d, error: null }; }
      if (st.op === 'insert') {
        const list = (Array.isArray(st.v) ? st.v : [st.v]).map(r => ({ id: uid(table), created_at: new Date(Date.now() + SEQ * 1000).toISOString(), ...r }));
        const e = uniqueCheck(table, rows.concat(list)); if (e) return { data: null, error: e };
        rows.push(...list); const d = list.map(r => ({ ...r }));
        return { data: st.single ? d[0] : d, error: null };
      }
      if (st.op === 'update') {
        const hit = rows.filter(match); const after = rows.map(r => hit.includes(r) ? { ...r, ...st.v } : r);
        const e = uniqueCheck(table, after); if (e) return { data: null, error: e };
        hit.forEach(r => Object.assign(r, st.v)); return { data: hit.map(r => ({ ...r })), error: null };
      }
      if (st.op === 'delete') { const keep = rows.filter(r => !match(r)); const n = rows.length - keep.length; T[table] = keep; return { data: null, error: null, count: n }; }
      if (st.op === 'upsert') {
        const list = Array.isArray(st.v) ? st.v : [st.v];
        const keys = String(st.opts.onConflict || 'id').split(',');
        for (const r of list) {
          const ex = rows.find(x => keys.every(k => String(x[k]) === String(r[k])));
          if (ex) Object.assign(ex, r); else rows.push({ ...r });
        }
        const e = uniqueCheck(table, rows); if (e) return { data: null, error: e };
        return { data: list, error: null };
      }
      throw new Error('op ' + st.op);
    }
    return api;
  }
  return { T, log, from };
}

const permissiveEl = () => new Proxy({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, dataset: {},
  value: '', innerHTML: '', textContent: '', checked: false, children: [], options: [] }, {
  get(t, k) { if (k in t) return t[k]; if (k === 'querySelector') return () => null; if (k === 'querySelectorAll') return () => [];
    if (k === 'closest') return () => null; if (k === 'getAttribute') return () => null; if (k === 'appendChild' || k === 'insertAdjacentHTML' || k === 'setAttribute' || k === 'addEventListener' || k === 'removeAttribute' || k === 'focus' || k === 'select' || k === 'scrollIntoView' || k === 'remove') return () => {};
    return undefined; },
  set(t, k, v) { t[k] = v; return true; } });

function boot(opts = {}) {
  const db = makeDB(), toasts = [], dialogs = [], els = {};
  const ctx = {
    console: { log() {}, warn: (...a) => ctx._warns.push(a.map(String).join(' ')), error: (...a) => ctx._warns.push('ERR ' + a.map(String).join(' ')) },
    _warns: [], setTimeout: (f) => { ctx._timers.push(f); return 0; }, _timers: [], clearTimeout() {},
    Date, Math, JSON, Promise, Array, Object, String, Number, RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent,
    navigator: { clipboard: { writeText: async () => {} } }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: id => els[id] || (els[id] = permissiveEl()), querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, createElement: () => permissiveEl(), body: permissiveEl(), documentElement: permissiveEl(), activeElement: null },
    ppGuarded: (n, f) => f,
    showToast: m => toasts.push(String(m)),
    SyDialog: { confirm: async o => { dialogs.push(o); if (ctx._answers && ctx._answers.length) return ctx._answers.shift(); return opts.confirm === undefined ? true : opts.confirm; },
                alert: async o => { dialogs.push(o); }, prompt: async () => null },
    logAudit() {}, reallocatePatientFunds: async () => {}, syncPaymentStatus: async () => {},
    renderStats() {}, renderInfo() {}, renderRecentSessions() {}, renderPayments() {}, renderTimeline() {},
    maybePromptMaterialDeduction: async () => {}, closeModal() {}, openModal() {},
    fmt: n => Number(n || 0).toLocaleString('en-US'), escapeHtml: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    curLblOf: c => c === 'USD' ? '$' : 'ل.س',
    QUADRANT_LABELS: {}, ARCH_LABELS: {},
    patient: { name: 'تجريبي', dob: '1990-01-01' }, patientId: 'P1', currentUser: { id: 'D1' },
    sessions: [], teethMap: {}, payments: [], appointments: [],
    SyDentCurPick: { read: () => ctx._cur || 'SYP', set() {}, mount() {} }, _cur: 'SYP',
    rxClinicInfo: () => ({ clinic_name: 'عيادة', clinic_phone: '099', license_no: '' }), calcAge: () => '',
    loadTreatmentsFromSupabase: async () => {}, renderSessions: (function(){ var f=function(){ return undefined; }; return f; })(), addLabBadges: (function(){ var f=function(){ return undefined; }; return f; })(), addPhotoBadges: (function(){ var f=function(){ return undefined; }; return f; })(), _chartStatusFilter: 'all', populateProviderPicker: (function(){ var f=function(){ return undefined; }; return f; })(), snTplRefresh: (function(){ var f=function(){ return undefined; }; return f; })(), providers: [], doctorsList: [], clinicProviders: [],
  };
  ctx.window = ctx; ctx.sb = { from: db.from }; ctx.self = ctx;
  vm.createContext(ctx);
  const run = (code, name) => vm.runInContext(code, ctx, { filename: name || 'inline' });
  { const acorn = require(REPO + 'node_modules/acorn'); const si = fs.readFileSync(REPO + 'supabase-init.js', 'utf8');
    const at = si.indexOf('window.SyDentCurBag = (function'); const st = si.indexOf('(function', at);
    const node = acorn.parseExpressionAt(si, st, { ecmaVersion: 'latest' });
    ctx.SyDentCurrency = { code: () => 'SYP', labelOf: c => c === 'USD' ? '$' : 'ل.س' };
    run('window.SyDentCurBag = ' + si.slice(st, node.end) + ';', 'supabase-init.js:SyDentCurBag'); }
  run(fs.readFileSync(REPO + 'pp-core.js', 'utf8'), 'pp-core.js');
  run(fs.readFileSync(REPO + 'pp-dental.js', 'utf8'), 'pp-dental.js');
  run(fs.readFileSync(REPO + 'pp-plan.js', 'utf8'), 'pp-plan.js');
  for (const n of ['_rowCur', '_curLblOf', '_rowLbl', 'syncUnitRowsOnComplete', '_delSession_inner', 'delSession', 'syncToothStatusOnComplete',
                   '_completeSessionFromProfile_inner', 'completeSessionFromProfile', 'completeToothPlannedFromModal']) {
    if (!ext[n]) throw new Error('extract missing ' + n); run(ext[n], 'pp.html:' + n);
  }
  const CAT = [
    ['bridge','جسر','bridge','#dc2626','#991b1b'], ['c_zr','جسر (زركون)','bridge','#a855f7','#6b21a8'],
    ['implant','زراعة','implant','#9ca3af','#4b5563'], ['extracted','قلع','extraction','#ef4444','#991b1b'],
    ['czr','تاج زركون','crown_full','#e5e7eb','#6b7280'], ['crown','تاج خزف على معدن','crown_full','#f97316','#9a3412'],
    ['comp','حشوة كومبوزت','crown','#2563eb','#1e3a8a']];
  db.T.treatments = CAT.map((c, i) => ({ id: 'T' + i, treatment_key: c[0], name: c[1], label: c[1], target_part: c[2], fill: c[3], stroke: c[4],
    is_active: true, builtin: true, is_favorite: false, needs_lab: false, price: 0, sort_order: i, category: 'restorative', post_extraction: false }));
  ctx.__bootCatalog = async () => { await vm.runInContext('loadTreatmentsFromSupabase()', ctx); vm.runInContext('var _T = rebuildToothMaps(); var T_FILL = _T.fill, T_STROKE = _T.stroke, T_LABEL = _T.label;', ctx); };
  return { ctx, db, run, toasts, dialogs, els };
}

/* The real page's loader, verbatim semantics (patient-profile.html ~L2783). */
function mapFromDB(db) {
  const m = {};
  for (const t of db.T.teeth_status) {
    const n = String(t.tooth_num), s = t.surface || 'O';
    if (!m[n]) m[n] = {};
    m[n][s] = t.treatment_key;
    (m[n].__status || (m[n].__status = {}))[s] = t.status || 'completed';
    if (t.review_at) (m[n].__review || (m[n].__review = {}))[s] = t.review_at;
    if (t.unit_id) (m[n].__unit || (m[n].__unit = {}))[s] = t.unit_id;
  }
  return m;
}
function norm(m) {
  const o = {};
  for (const n of Object.keys(m).sort()) {
    const sm = m[n] || {}, r = {};
    for (const k of Object.keys(sm).sort()) {
      if (k.startsWith('__')) { const sub = sm[k] || {}; const ks = Object.keys(sub).filter(x => sm[x] !== undefined).sort(); if (ks.length) { r[k] = {}; ks.forEach(x => r[k][x] = sub[x]); } }
      else if (sm[k] !== undefined && sm[k] !== null) r[k] = sm[k];
    }
    if (Object.keys(r).some(k => !k.startsWith('__'))) o[n] = r;
  }
  return JSON.stringify(o);
}
async function bootAsync(o){ const b = boot(o); await b.ctx.__bootCatalog(); return b; }
module.exports = { boot, bootAsync, mapFromDB, norm, uid };

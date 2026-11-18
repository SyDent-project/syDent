#!/usr/bin/env node
/* prove-followup-e2e — «يحتاج جلسات متابعة» (ج2-أ · M211) على مسار الحفظ الحقيقي.
   عُدّةُ dom-smoke (بطاقةُ المريض الحقيقية) + pp-dental.js وpp-followup.js الحيّان، وزرُّ الحفظ الحقيقي المغلَّف
   (saveToothTreatment ← fuNeedRun ← _saveToothTreatment_inner) على stub قاعدةٍ يلتقط الإدراجَ ونداءَ الحالة:
   تاجٌ منجز ⇒ مفتاحٌ ظاهرٌ مفعَّل · جلسةٌ واحدة تُدرج وتُعلَّم هي «قيد الإنجاز» · حشوةٌ ⇒ مطفأ ولا نداء · تشغيلُ الطبيب له ⇒ يُعلَّم ·
   مخطّط ⇒ مخفيٌّ ولا نداء · إطفاؤه ⇒ لا نداء · فشلُ القاعدة ⇒ الجلسةُ محفوظة والطبيبُ يُبلَّغ.
   --self-test: طفراتٌ يجب أن تعضّ. بلا jsdom ⇒ يتخطّى بـ0. */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت «يحتاج جلسات متابعة» (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const DENTAL = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8'), FOLLOW = fs.readFileSync(path.join(ROOT, 'pp-followup.js'), 'utf8');

function boot(dentalSrc, label) {
  const tmp = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.' + label + '.js');
  fs.writeFileSync(tmp, dentalSrc);
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmp)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}
function installDb(w) {
  const log = [];
  w.sb = { from: (table) => {
    const st = { table, op: null, payload: null, eq: {}, in: {} };
    const api = {
      delete() { st.op = 'delete'; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p) { st.op = 'upsert'; st.payload = p; log.push(st); return Promise.resolve({ data: [p], error: null }); },
      insert(p) { st.op = 'insert'; st.payload = p; log.push(st); return { select: () => ({ single: () => Promise.resolve({ data: Object.assign({ id: 'sess-' + log.length }, p), error: null }) }) }; },
      select() { return api; }, eq(k, v) { st.eq[k] = v; return api; }, neq() { return api; }, in(k, v) { st.in[k] = v.slice(); return api; },
      order() { return api; }, limit() { return api; }, not() { return api; }, or() { return api; },
      single() { return Promise.resolve({ data: null, error: null }); },
      then(res) { log.push(st); return Promise.resolve({ data: [], error: null }).then(res); }
    };
    return api;
  }, rpc: (fn, a) => { log.push({ table: 'rpc:' + fn, op: 'rpc', payload: a }); return Promise.resolve(w.__rpcFail ? { data: null, error: { message: 'boom' } } : { data: { id: a.p_session, state: a.p_state }, error: null }); } };
  return log;
}
function prep(w) {
  ['reallocatePatientFunds', 'logAudit', 'maybePromptMaterialDeduction', 'followUpRemovedSessions'].forEach(n => { w[n] = async () => {}; });
  w.renderAll = () => {}; w.renderPlanVisits = () => {}; w._rowLbl = () => 'ل.س'; w._rowCur = () => 'SYP'; w.fmt = n => String(n);
  w.SyDialog = { confirm: () => Promise.resolve(true), alert: () => Promise.resolve(), prompt: () => Promise.resolve(null) };
  w.TREATMENTS.push({ id: 'implant', name: 'زراعة', target_part: 'implant', is_active: true, fill: '#999', stroke: '#666' });
  w.TREATMENTS.push({ id: 'bridge_x', name: 'جسر', target_part: 'bridge', is_active: true, fill: '#999', stroke: '#666' });
  w.document.getElementById('toothDate').value = '2026-10-11';
  const cat = w.TREATMENTS;
  const comp = cat.find(t => /كومبوزت/.test(t.name)) || cat.find(t => (t.target_part || 'crown') === 'crown');
  const crown = cat.find(t => t.target_part === 'crown_full');
  return { comp, crown };
}
async function save(w, tooth, surface, key, status) {
  w.currentTooth = tooth; w.currentSurface = surface; w.pendingToothStatus = key; w.pendingToothLabel = key; w.pendingTreatStatus = status;
  w.pendingRegionalType = null; w.toothEntryMode = false; w.pendingBridgeExtra = { mesial: 0, distal: 0 };
  w.document.getElementById('toothCost').value = '1000';
  const log = installDb(w); await w._saveToothTreatment_inner(); return log;
}

async function scenario(dental, follow, label, quiet) {
  const fails = []; const T = (n, ok, x) => { if (!quiet) console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok ? '' : ' :: ' + JSON.stringify(x).slice(0, 300))); if (!ok) fails.push(n); };
  const w = await boot(dental, label);
  w.eval(follow);
  const { comp } = prep(w);
  w.renderSessions = () => {}; w.renderRecentSessions = () => {}; w.renderTimeline = () => {}; w.renderInfo = () => {};
  const toasts = []; w.showToast = m => toasts.push(String(m));
  const rct = w.TREATMENTS.find(t => t.category === 'prosthodontics' && t.target_part === 'crown_full');
  T('catalog has a full crown (prosthodontics) and a filling', !!rct && !!comp, [rct && rct.id, comp && comp.id]);
  if (!rct || !comp) return fails;
  const run = async (key, status, tooth, surface, checkedOverride) => {
    w.teethMap = {}; w.teethDx = {}; w.sessions = [];
    w.currentTooth = tooth; w.currentSurface = surface; w.pendingToothStatus = key; w.pendingToothLabel = key; w.pendingTreatStatus = status;
    w.pendingRegionalType = null; w.toothEntryMode = false; w.pendingBridgeExtra = { mesial: 0, distal: 0 };
    w.document.getElementById('toothCost').value = '1000';
    w.fuNeedSync(true);
    const box = w.document.getElementById('fuNeedBox'), cb = w.document.getElementById('fuNeed');
    const shown = box.style.display !== 'none', def = cb.checked;
    if (checkedOverride !== undefined) cb.checked = checkedOverride;
    const log = installDb(w); await w.saveToothTreatment();
    const ins = log.filter(e => e.table === 'ledger_sessions' && e.op === 'insert'), rpc = log.filter(e => e.op === 'rpc');
    return { shown, def, ins, rpc, sessions: w.sessions.map(s => ({ id: s.id, status: s.status, st: s.followup_state })) };
  };
  let r = await run(rct.id, 'completed', 36, 'CROWN_FULL');
  T('crown completed: switch shown and on by default', r.shown && r.def, r);
  T('crown completed: the real save inserts one session and marks exactly it «قيد الإنجاز»', r.ins.length === 1 && r.rpc.length === 1 && r.rpc[0].table === 'rpc:session_followup_set_state'
    && r.rpc[0].payload.p_state === 'open' && r.sessions.length === 1 && r.rpc[0].payload.p_session === r.sessions[0].id && r.sessions[0].st === 'open', r);
  T('…and tells the doctor', /قيد الإنجاز/.test(toasts.slice(-1)[0]), toasts.slice(-1));
  r = await run(comp.id, 'completed', 16, 'O');
  T('filling completed: switch shown, off by default, nothing marked', r.shown && !r.def && r.ins.length === 1 && r.rpc.length === 0 && !r.sessions[0].st, r);
  r = await run(comp.id, 'completed', 17, 'O', true);
  T('filling with the switch turned on by the doctor: marked', r.rpc.length === 1 && r.sessions[0].st === 'open', r);
  r = await run(rct.id, 'planned', 37, 'CROWN_FULL');
  T('crown planned: switch hidden, planned session saved, nothing marked', !r.shown && r.ins.length === 1 && r.rpc.length === 0, r);
  r = await run(rct.id, 'completed', 46, 'CROWN_FULL', false);
  T('crown with the switch turned off: saved, nothing marked', r.ins.length === 1 && r.rpc.length === 0 && !r.sessions[0].st, r);
  w.__rpcFail = true; r = await run(rct.id, 'completed', 47, 'CROWN_FULL'); w.__rpcFail = false;
  T('the mark fails on the server: the session stays saved and the doctor is told', r.ins.length === 1 && r.sessions.length === 1 && !r.sessions[0].st && /تعذّر تعليمها/.test(toasts.slice(-1)[0]), [r, toasts.slice(-1)]);
  w.close();
  return fails;
}
const MUTANTS = [
  ['tooth save not wrapped', 'd', "  return (typeof fuNeedRun === 'function') ? fuNeedRun(_saveToothTreatment_inner, this, arguments) : _saveToothTreatment_inner.apply(this, arguments);", "  return _saveToothTreatment_inner.apply(this, arguments);"],
  ['switch ignored (always on)', 'f', "  return !!(e.box && e.cb && e.box.style.display !== 'none' && e.cb.checked);", "  return true;"],
  ['default ignores the treatment', 'f', "cb.checked = fuMultiVisit(t);", "cb.checked = false;"],
  ['failed mark claims success', 'f', "    if (res && !res.error && res.data) { list[i].followup_state = 'open'; ok++; }", "    list[i].followup_state = 'open'; ok++;"]
];
(async () => {
  const base = await scenario(DENTAL, FOLLOW, 'e2e-need', false);
  if (base.length) { console.log('❌ prove-followup-e2e: ' + base.length + ' failed'); process.exit(1); }
  if (process.argv.indexOf('--self-test') < 0) { console.log('✅ prove-followup-e2e: the real tooth save with «يحتاج جلسات متابعة» (8 checks)'); process.exit(0); }
  let bit = 0; const dull = [];
  for (const [name, where, a, b] of MUTANTS) {
    const src = where === 'd' ? DENTAL : FOLLOW;
    if (src.split(a).length !== 2) { dull.push(name + ' (anchor)'); continue; }
    const f = await scenario(where === 'd' ? src.replace(a, b) : DENTAL, where === 'f' ? src.replace(a, b) : FOLLOW, 'e2e-mut', true).catch(() => ['threw']);
    if (f.length) bit++; else dull.push(name);
  }
  dull.forEach(n => console.log('  ✗ mutant survived: ' + n));
  console.log((dull.length ? '❌' : '✅') + ' prove-followup-e2e: 8 checks · ' + bit + '/' + MUTANTS.length + ' mutants bite');
  process.exit(dull.length ? 1 : 0);
})().catch(e => { console.error('❌ prove-followup-e2e:', e && e.stack || e); process.exit(1); });

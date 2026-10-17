#!/usr/bin/env node
/* v579 — مثبتُ الرسائل الداخلية: الوصولُ اللحظي (Realtime · M175) وصوتُ التنبيه (بلاغ المالك، 5 تشرين الأول 2026:
   «الرسالة عم تاخد ~22 ثانية» · «ضيف صوت بسيط»).
   يشغّل وحدةَ الرسائل الحيّة من sidebar.js (بين علامتيها) داخل jsdom بعميل Supabase مصطنع وAudioContext مصطنع:
   (1) الاشتراكُ بقناةٍ واحدة بحدثَي INSERT/UPDATE ومرشّح owner_id=eq.<uid>
   (2) رسالةٌ واردة عبر القناة تظهر فوراً (شارة + قائمة) وتُعلَن مرةً واحدة (توست + نغمة) — والمكرّرُ لا يُعاد إعلانُه
   (3) صفُّ عيادةٍ أخرى يُتجاهل · رسالتي أنا بلا نغمة · «تم ✓» من جهازٍ آخر يُطفئ الشارة لحظياً
   (4) لا AudioContext قبل لمسة مستخدم (سياسةُ المتصفحات) · 🔕 يكتم ويُحفظ · وضعُ القراءة/الحجب بلا صوت
   (5) الاستطلاعُ أرضيةُ الوصول (v585: لا يُوقَف أبداً بحالة القناة)، ويلحق بالفائت عند (إعادة) الانضمام
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. بلا jsdom ⇒ يتخطّى بـ0 (نمطُ prove-chart-conditions). */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت الرسائل الداخلية (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'sidebar.js'), 'utf8');
const modOf = (src) => {
  const a = src.indexOf('/* SYDENT_MSGS_MODULE_START */'), b = src.indexOf('/* SYDENT_MSGS_MODULE_END */');
  return (a < 0 || b < 0) ? '' : src.slice(a, b);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

async function run(mod, opts) {
  opts = opts || {};
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  const w = dom.window;
  const log = { toasts: [], ctx: 0, notes: 0, selects: 0, channels: [], removed: 0 };
  if (opts.level) w.document.documentElement.setAttribute('data-sub-level', opts.level);
  if (opts.soundOff) w.localStorage.setItem('sydent_msgs_sound', '0');
  w.AudioContext = function () {
    log.ctx++;
    this.state = 'running'; this.currentTime = 0; this.destination = {};
    this.resume = () => Promise.resolve();
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    this.createOscillator = () => ({ type: '', frequency: param(), connect() {}, start() { log.notes++; }, stop() {} });
    this.createGain = () => ({ gain: param(), connect() {} });
  };
  w.showToast = (m) => log.toasts.push(m);
  w.sbGetUser = () => Promise.resolve({ id: 'u1' });
  w.SyDentLock = { getRole: () => 'doctor', getCurrentEmployee: () => Promise.resolve(null) };
  const q = (res) => {
    const o = {}; ['select', 'order', 'limit', 'eq', 'not', 'lt', 'is', 'in', 'delete', 'update', 'insert'].forEach(k => { o[k] = () => o; });
    o.maybeSingle = () => Promise.resolve(res); o.then = (a, b) => Promise.resolve(res).then(a, b); return o;
  };
  w.sb = {
    from: (t) => { if (t === 'staff_messages') log.selects++; return q({ data: t === 'staff_messages' ? [] : null, error: null }); },
    channel: (name) => {
      const ch = { name, on: [], status: null };
      ch.on = function (kind, cfg, cb) { ch.handlers = (ch.handlers || []).concat([{ kind, cfg, cb }]); return ch; };
      ch.subscribe = function (cb) { ch.cb = cb; setTimeout(() => cb && cb('SUBSCRIBED'), 5); return ch; };
      log.channels.push(ch); return ch;
    },
    removeChannel: () => { log.removed++; }
  };
  w.eval(mod);
  await sleep(700);   // boot: setTimeout(400) + async getUser + subscribe
  return { w, log };
}
const emit = (env, ev, row) => {
  const ch = env.log.channels[0]; if (!ch) return;
  (ch.handlers || []).filter(h => h.cfg && h.cfg.event === ev).forEach(h => h.cb({ new: row }));
};
const gesture = (w) => w.document.dispatchEvent(new w.Event('pointerup', { bubbles: true }));
const badge = (w) => { const b = w.document.getElementById('syMsgBadge'); return b && !b.hidden ? b.textContent : ''; };
const msg = (o) => Object.assign({ id: 'm1', owner_id: 'u1', sender_name: 'سلمى', sender_role: 'secretary', target_role: null, body: 'المريض وصل', created_at: new Date().toISOString(), acked_at: null }, o || {});

async function suite(src) {
  const mod = modOf(src);
  ok(mod.length > 5000, 'messages module found between its markers');
  /* ── (1) الاشتراك ── */
  const A = await run(mod);
  const ch = A.log.channels[0];
  ok(A.log.channels.length === 1, 'boot subscribes exactly one realtime channel');
  const evs = ch && ch.handlers ? ch.handlers.filter(h => h.kind === 'postgres_changes' && h.cfg.table === 'staff_messages' && h.cfg.schema === 'public') : [];
  ok(evs.some(h => h.cfg.event === 'INSERT') && evs.some(h => h.cfg.event === 'UPDATE'), 'channel listens to INSERT and UPDATE on public.staff_messages');
  ok(evs.length >= 2 && evs.every(h => h.cfg.filter === 'owner_id=eq.u1'), 'every listener is filtered to this clinic (owner_id=eq.<uid>)');
  ok(A.log.ctx === 0, 'no AudioContext is created before a user gesture (autoplay policy — no console warning)');
  /* ── (2) رسالةٌ واردة قبل أي لمسة: تظهر وتُعلن بتوست، بلا صوتٍ ممكن ── */
  emit(A, 'INSERT', msg({ id: 'pre' }));
  ok(badge(A.w) === '1' && A.log.toasts.length === 1 && A.log.notes === 0, 'incoming before any gesture: badge + toast at once, silently (no context yet)');
  gesture(A.w);
  ok(A.log.ctx === 1, 'the first gesture creates the AudioContext');
  emit(A, 'INSERT', msg({ id: 'm1' }));
  ok(badge(A.w) === '2', 'a realtime INSERT updates the badge instantly');
  ok(A.log.toasts.length === 2 && /سلمى/.test(A.log.toasts[1]) && A.log.notes === 2, 'it is announced once: toast + a two-note chime');
  emit(A, 'INSERT', msg({ id: 'm1' }));
  ok(A.log.toasts.length === 2 && A.log.notes === 2 && badge(A.w) === '2', 'the same message again (poll/realtime overlap) is neither duplicated nor re-announced');
  A.w.document.getElementById('syMsgFab').click();
  ok(A.w.document.querySelectorAll('#syMsgList .sy-msg-row').length === 2, 'the open panel lists the realtime rows');
  /* ── (3) عزلٌ · رسالتي · التأكيدُ اللحظي ── */
  emit(A, 'INSERT', msg({ id: 'x9', owner_id: 'u2' }));
  ok(badge(A.w) === '2' && A.log.toasts.length === 2, 'a row of another clinic is ignored');
  emit(A, 'INSERT', msg({ id: 'mine', sender_role: 'doctor', sender_name: 'أنا' }));
  ok(A.log.notes === 2 && A.log.toasts.length === 2, 'my own message makes no sound and no toast');
  emit(A, 'UPDATE', msg({ id: 'm1', acked_at: new Date().toISOString(), acked_by_name: 'ريم' }));
  emit(A, 'UPDATE', msg({ id: 'pre', acked_at: new Date().toISOString(), acked_by_name: 'ريم' }));
  ok(badge(A.w) === '', '«تم ✓» from another device clears the badge instantly');
  /* ── (4) زرّ الصوت ── */
  const sb = A.w.document.getElementById('syMsgSound');
  ok(sb && sb.textContent === '🔔' && sb.getAttribute('aria-pressed') === 'true', 'panel header shows 🔔 (on by default)');
  sb.click();
  ok(sb.textContent === '🔕' && A.w.localStorage.getItem('sydent_msgs_sound') === '0', '🔕 mutes and is saved per device');
  emit(A, 'INSERT', msg({ id: 'm2' }));
  ok(A.log.notes === 2 && A.log.toasts.length === 3, 'muted: still announced by toast, no sound');
  const n0 = A.log.notes; sb.click();
  ok(sb.textContent === '🔔' && A.log.notes === n0 + 2, 'unmuting previews the chime (the click is a gesture)');
  /* ── (5) الاستطلاعُ احتياط ── */
  const pollFn = mod.slice(mod.indexOf('function startPolling'), mod.indexOf('function boot'));
  ok(pollFn.length > 50 && !/_rtLive|RESYNC_MS|_lastLoadAt/.test(pollFn), 'v585: the 30s poll is never suppressed by the realtime status (delivery floor)');
  ok(!/RESYNC_MS/.test(mod), 'v585: no realtime-based resync throttle left in the module');
  const s0 = A.log.selects; ch.cb('CLOSED'); ch.cb('SUBSCRIBED'); await sleep(30);
  ok(A.log.selects > s0, 're-joining the channel triggers a catch-up load');
  ok(/visibilitychange/.test(mod) && /addEventListener\('online'/.test(mod), 'catch-up on tab visible and network back');
  /* ── المكتومُ مسبقاً · وضعُ القراءة ── */
  const B = await run(mod, { soundOff: true }); gesture(B.w); emit(B, 'INSERT', msg({ id: 'b1' }));
  ok(B.log.notes === 0 && B.log.toasts.length === 1 && B.w.document.getElementById('syMsgSound').textContent === '🔕', 'a device muted earlier stays silent (toast only)');
  const R = await run(mod, { level: 'read' }); gesture(R.w); emit(R, 'INSERT', msg({ id: 'r1' }));
  ok(R.log.notes === 0, 'read-only subscription (widget hidden): no sound');
  [A, B, R].forEach(e => e.w.close());
}

const rep = (a, b) => src => src.split(a).join(b);
const MUTANTS = [
  ['realtime never subscribed', rep('      startPolling();\n      subscribeRealtime();', '      startPolling();')],
  ['filter dropped', rep("{ event: 'INSERT', schema: 'public', table: 'staff_messages', filter: f }", "{ event: 'INSERT', schema: 'public', table: 'staff_messages' }")],
  ['other clinic accepted', rep("if (_dead || !r || !r.id || r.owner_id !== _uid) return;\n    var i = findIdx(r.id);\n    if (i >= 0) {", "if (_dead || !r || !r.id) return;\n    var i = findIdx(r.id);\n    if (i >= 0) {")],
  ['announced every time', rep('    if (!r || !r.id || _notified[r.id]) return;', '    if (!r || !r.id) return;')],
  ['sound ignores mute', rep('    if (!soundOn() || !_ac || subBlocked()) return;', '    if (!_ac || subBlocked()) return;')],
  ['sound in read-only', rep('    if (!soundOn() || !_ac || subBlocked()) return;', '    if (!soundOn() || !_ac) return;')],
  ['context created at boot', rep('      subscribeRealtime();\n', '      subscribeRealtime();\n      unlockAudio();\n')],
  ['no chime at all', rep("    if (window.showToast) window.showToast('💬 رسالة جديدة من ' + (r.sender_name || ''));\n    chime();", "    if (window.showToast) window.showToast('💬 رسالة جديدة من ' + (r.sender_name || ''));")],
  ['update ignored', rep("        .on('postgres_changes', { event: 'UPDATE'", "        .on('postgres_changes', { event: 'NONE'")],
  ['no catch-up on rejoin', rep('          if (_rtLive && !was) load(true);', '')],
  ['poll suppressed by realtime again', rep("      if (document.hidden) return; // visible-tab-only (index waiting-room pattern)\n", "      if (document.hidden) return; // visible-tab-only (index waiting-room pattern)\n      if (_rtLive) return;\n")],
  ['no touch unlock', rep("['pointerdown', 'pointerup', 'touchend', 'keydown']", "['pointerdown', 'keydown']")]
];

(async () => {
  await suite(SIDEBAR);
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const S2 = mut(SIDEBAR);
      if (S2 === SIDEBAR) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(S2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-staff-msgs: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-staff-msgs: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();

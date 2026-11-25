#!/usr/bin/env node
/* prove-staff-perms.js — M228: صلاحياتُ كل موظف فوق صلاحيات دوره.
   (١) منطقُ SyDentLock (كتلة M228 من supabase-init.js مع guardPage) على نوافذ وتخزينٍ وهميين:
       المالكُ لا يُقلَب أبداً · التخصيصُ لصاحبه فقط · المفاتيحُ خارج القائمة المغلقة تُهمَل (الإعدادات لا تُفتح) ·
       القائمةُ الجانبية تتبع التخصيص (الأشعة عنصران) · guardPage يفتح ويغلق · الحجبُ المبكر قبل سكربتات الصفحة ·
       التغيّرُ الحيّ يعيد تحميل الصفحة مرةً واحدة فقط.
   (٢) نافذةُ الصفحة (employees.html · empPermsJs) على DOM وقاعدةٍ وهميين: تبدأ من الدور · العودةُ للافتراضي تمحو
       التخصيص · الحفظُ بنطاق المالك و NULL بلا تخصيص · السجلّ · لا نافذة للمالك ولا لمن لا يدخل النظام.
   (٣) التوصيل: القائمةُ المغلقة نفسُها بالعميل والصفحة والقاعدة · الشريط · الصفحاتُ المالية · حذفُ المريض · القاموس.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['supabase-init.js', 'sidebar.js', 'employees.html', 'patients.html', 'patient-profile.html', 'accounting.html',
  'expenses.html', 'payouts.html', 'audit-log.html', 'i18n-en.js', 'migrations/228_staff_permissions.sql'];
const base = {};
FILES.forEach(f => { base[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } }

function lockBlock(F) {
  const s = F['supabase-init.js'];
  const a = s.indexOf('  // ── M228: per-employee permissions over the role defaults'), b = s.indexOf('  // ── M228 end ──');
  const g0 = s.indexOf('  function guardPage(allowedRoles) {'), g1 = s.indexOf('  function showBlockedScreen(role) {');
  if (a < 0 || b < 0 || g0 < 0 || g1 < 0) throw new Error('M228 block or guardPage not found');
  return s.slice(a, b) + '\n' + s.slice(g0, g1);
}
function lockCtx(F, o) {
  const store = Object.assign({}, o.store || {});
  const ctx = {
    console, JSON, Object, Array, String,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: { location: { pathname: o.path || '/index.html', reload: () => { ctx.reloads++; } }, addEventListener: (ev, fn, cap) => { ctx.listeners.push([ev, cap]); } },
    document: { readyState: 'loading', head: null, documentElement: { cls: [], classList: { add(c) { ctx.document.documentElement.cls.push(c); } }, appendChild() {} },
                createElement: () => ({}), addEventListener: (ev, fn) => { ctx.listeners.push([ev, 'document']); } },
    reloads: 0, listeners: [], blocked: 0,
    _role: o.role || 'owner', _emp: o.emp || null, _allEmployeesListCache: o.list || null
  };
  vm.createContext(ctx);
  vm.runInContext("var LS_PERMS = '" + ((F['supabase-init.js'].match(/const LS_PERMS += '([^']+)'/) || [])[1] || '') + "';" + 'function getRole(){return _role;} function getEmployeeId(){return _emp;} function showBlockedScreen(){blocked++;}' +
    'function invalidateEmployeesCache(){} async function loadEmployees(){}\n' + lockBlock(F) +
    '\nthis.api={can,permOverride,getPermOverrides,applyPermsToNav,syncPermsFromList,enforcePagePermEarly,guardPage,cleanPerms,PERM_KEYS,currentPageKey};', ctx);
  ctx.store = store;
  return ctx;
}
const cache = (e, p) => ({ 'sydent.lock.perms': JSON.stringify({ e, p }) });

function empCtx(F, o) {
  const H = F['employees.html'];
  const m = H.match(/<script id="empPermsJs">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('empPermsJs missing');
  const els = {};
  const el = id => els[id] || (els[id] = { id, textContent: '', innerHTML: '', disabled: false, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } } });
  const calls = [];
  const ctx = {
    console: { log: console.log, warn() {}, error() {} }, Object, Array, String, JSON, Promise,
    document: { getElementById: el },
    employees: o.employees, currentUser: { id: 'OWNER' }, toasts: [], audits: [], renders: 0,
    roleLabelExt: (r) => ({ doctor: 'طبيب', secretary: 'سكرتيرة' }[r] || r),
    renderList: () => { ctx.renders++; },
    showToast: (m, e) => { ctx.toasts.push([m, !!e]); },
    logAudit: async (t, op) => { ctx.audits.push([t, op]); },
    calls
  };
  ctx.window = ctx;
  ctx.SyDentNavBlocked = o.nav;
  ctx.sb = { from: (t) => { const q = { t, ops: [] }; calls.push(q); const ch = { update: (v) => { q.ops.push(['update', v]); return ch; }, eq: (c, v) => { q.ops.push(['eq', c, v]); return ch; },
    then: (res) => res({ error: o.err || null }) }; return ch; } };
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx);
  ctx.els = els;
  return ctx;
}
function navOf(F) {
  const m = F['sidebar.js'].match(/const SB_ROLE_BLOCKED = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error('SB_ROLE_BLOCKED missing');
  return vm.runInNewContext('(' + m[1] + ')');
}

async function suite(F) {
  /* ═══ (١) SyDentLock ═══ */
  let c = lockCtx(F, { role: 'owner', emp: 'E1', store: cache('E1', { expenses: false }) });
  ok(c.api.can('act.delete-patient', false) === true, 'owner can delete regardless');
  ok(JSON.stringify(c.api.applyPermsToNav([])) === '[]', 'owner nav untouched by a stale cache');

  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', { expenses: true, settings: true, 'act.delete-patient': true }) });
  ok(c.api.permOverride('expenses') === true, 'secretary override read');
  ok(c.api.permOverride('settings') === null, 'settings is never a key (closed list)');
  ok(c.api.can('act.delete-patient', false) === true, 'granted delete honoured');
  const nav = navOf(F);
  const sec = c.api.applyPermsToNav(nav.secretary);
  ok(sec.indexOf('expenses') < 0 && sec.indexOf('settings') >= 0 && sec.indexOf('employees') >= 0 && sec.indexOf('subscription') >= 0, 'nav: expenses opened, owner-only pages stay hidden');

  c = lockCtx(F, { role: 'secretary', emp: 'E2', store: cache('E1', { expenses: true }) });
  ok(c.api.permOverride('expenses') === null, 'another employee\'s cache is ignored');
  ok(c.api.can('act.delete-patient', false) === false, 'secretary delete default off');

  c = lockCtx(F, { role: 'doctor', emp: 'E1', store: cache('E1', { radiology: false, patients: false }) });
  const doc = c.api.applyPermsToNav(nav.doctor);
  ok(doc.indexOf('radiology') >= 0 && doc.indexOf('radiology-photos') >= 0 && doc.indexOf('patients') >= 0, 'nav: radiology closes both items, patients closed');

  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/expenses.html', store: cache('E1', { expenses: true }) });
  ok(c.api.guardPage(['owner']) === true && c.blocked === 0, 'guardPage opens an owner page for a granted employee');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/expenses.html' });
  ok(c.api.guardPage(['owner']) === false && c.blocked === 1, 'guardPage keeps the role default');
  c = lockCtx(F, { role: 'doctor', emp: 'E1', path: '/provider-reports.html', store: cache('E1', { 'provider-reports': false }) });
  ok(c.api.guardPage(['owner', 'doctor']) === false, 'guardPage closes an allowed page when revoked');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/settings.html', store: cache('E1', { settings: true }) });
  ok(c.api.guardPage(['owner']) === false, 'settings stays owner-only even with a forged cache');
  c = lockCtx(F, { role: 'owner', emp: null, path: '/expenses.html' });
  ok(c.api.guardPage(['owner']) === true, 'owner passes');

  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/patient-profile.html', store: cache('E1', { patients: false }) });
  c.api.enforcePagePermEarly();
  ok(c.window.__sydentBlocked === true && c.listeners.some(l => l[0] === 'DOMContentLoaded') && c.document.documentElement.cls.indexOf('sd-perm-blocked') > -1, 'early block: page hidden from the head on, cover at DOMContentLoaded (patient card follows patients)');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/index.html', store: cache('E1', { patients: false }) });
  c.api.enforcePagePermEarly();
  ok(!c.window.__sydentBlocked && c.listeners.length === 0, 'early block leaves other pages alone');
  c = lockCtx(F, { role: 'owner', emp: 'E1', path: '/patients.html', store: cache('E1', { patients: false }) });
  c.api.enforcePagePermEarly();
  ok(!c.window.__sydentBlocked, 'early block never touches the owner');

  c = lockCtx(F, { role: 'secretary', emp: 'E1', list: [{ id: 'E1', permissions: { expenses: true } }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 1 && JSON.parse(c.store['sydent.lock.perms']).p.expenses === true, 'sync: change → cache + one reload');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', { expenses: true }), list: [{ id: 'E1', permissions: { expenses: true } }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 0, 'sync: no change → no reload (no loop)');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', { expenses: true }), list: [{ id: 'E1' }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 0 && JSON.parse(c.store['sydent.lock.perms']).p.expenses === true, 'sync: column missing keeps the cache');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', list: [{ id: 'E1', permissions: null }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 0, 'sync: first run on NULL = role defaults, no reload');

  /* ═══ (٢) نافذة الصفحة ═══ */
  const emps = [{ id: 'S1', name: 'ريم', role: 'secretary', has_system_access: true, permissions: null },
    { id: 'O', name: 'المالك', role: 'owner', has_system_access: true, permissions: null },
    { id: 'H', name: 'موظف', role: 'secretary', has_system_access: false, permissions: null }];
  let e = empCtx(F, { employees: emps, nav });
  e.openPermModal('O'); ok(!e.els.permModal || !e.els.permModal.classList.contains('show'), 'no window for the owner');
  e.openPermModal('H'); ok(!e.els.permModal || !e.els.permModal.classList.contains('show'), 'no window for an HR-only employee');
  e.openPermModal('S1');
  ok(e.els.permModal.classList.contains('show') && /aria-checked="true" aria-label="المرضى"/.test(e.els.pmList.innerHTML) && /aria-checked="false" aria-label="المصاريف"/.test(e.els.pmList.innerHTML), 'window starts from the role');
  ok((e.els.pmList.innerHTML.match(/🔒 للمالك فقط/g) || []).length === 3 && !/permToggle\('settings'\)/.test(e.els.pmList.innerHTML), 'three owner-only rows without a switch');
  e.permToggle('expenses');
  ok(/المصاريف<span class="pm-custom">/.test(e.els.pmList.innerHTML), 'flipped key marked custom');
  e.permToggle('expenses');
  ok(Object.keys(e.SyEmpPerms._state.draft).length === 0, 'flipping back to the role default removes the override');
  e.permToggle('patients'); e.permToggle('settings');
  ok(JSON.stringify(e.SyEmpPerms._state.draft) === '{"patients":false}', 'unknown key ignored, revoke kept');
  await e.savePerms();
  const up = e.calls.find(q => q.t === 'clinic_employees');
  ok(up && JSON.stringify(up.ops[0]) === '["update",{"permissions":{"patients":false}}]' && up.ops.some(o => o[1] === 'owner_id' && o[2] === 'OWNER') && up.ops.some(o => o[1] === 'id' && o[2] === 'S1'), 'save: owner-scoped update of the overrides');
  ok(e.audits.length === 1 && e.audits[0][0] === 'employee.permissions', 'save: audited');
  ok(emps[0].permissions && emps[0].permissions.patients === false && e.renders === 1 && !e.els.permModal.classList.contains('show'), 'save: list updated, window closed');
  e = empCtx(F, { employees: emps, nav });
  e.openPermModal('S1'); e.permReset(); await e.savePerms();
  const up2 = e.calls.find(q => q.t === 'clinic_employees');
  ok(up2 && JSON.stringify(up2.ops[0]) === '["update",{"permissions":null}]', 'reset → NULL (role defaults)');
  e = empCtx(F, { employees: [{ id: 'S1', name: 'ريم', role: 'secretary', has_system_access: true, permissions: null }], nav, err: { message: 'boom' } });
  e.openPermModal('S1'); e.permToggle('expenses'); await e.savePerms();
  ok(e.els.permModal.classList.contains('show') && /تعذّر الحفظ/.test(e.els.pmErr.textContent) && e.audits.length === 0, 'failed save: stays open, nothing audited');
  ok(e.SyEmpPerms.countOverrides({ expenses: true, settings: true }) === 1, 'card count ignores unknown keys');
  ok(e.SyEmpPerms.countOverrides({ expenses: true, patients: true }, 'secretary') === 1, 'an override equal to the role (after a role change) is not counted');
  e = empCtx(F, { employees: [{ id: 'D1', name: 'سامر', role: 'doctor', has_system_access: true, permissions: { 'provider-reports': true, expenses: true } }], nav });
  e.openPermModal('D1');
  ok(JSON.stringify(e.SyEmpPerms._state.draft) === '{"expenses":true}', 'window drops overrides that now equal the role');

  /* ═══ (٣) التوصيل ═══ */
  const lk = lockCtx(F, { role: 'owner' });
  const sqlKeys = ((F['migrations/228_staff_permissions.sql'].match(/k NOT IN \(([\s\S]*?)\)/) || [])[1] || '').match(/'[^']+'/g) || [];
  const clientKeys = Array.from(lk.api.PERM_KEYS).slice().sort().join();
  ok(sqlKeys.map(x => x.slice(1, -1)).sort().join() === clientKeys, 'DB validator keys = SyDentLock.PERM_KEYS');
  ok(empCtx(F, { employees: [], nav }).SyEmpPerms.KEYS.slice().sort().join() === clientKeys, 'employees window keys = SyDentLock.PERM_KEYS');
  ok(/role <> 'owner' OR permissions IS NULL/.test(F['migrations/228_staff_permissions.sql']), 'DB: owner row never overridden');
  ok(/blocked = window\.SyDentLock\.applyPermsToNav\(blocked\)/.test(F['sidebar.js']) && /var BLOCKED = SB_ROLE_BLOCKED;/.test(F['sidebar.js']), 'sidebar applies the overrides on its role map');
  ['accounting', 'expenses', 'payouts'].forEach(k => ok(new RegExp("permOverride\\('" + k + "'\\) === true\\);\\n    if \\(role !== 'owner' && !_permOpen\\)").test(F[k + '.html']), k + ': manual owner check honours the grant'));
  ok(/SyDentLock\.can\('act\.delete-patient', false\)/.test(F['patients.html']) && /data-perm="act\.delete-patient"/.test(F['patients.html']), 'patients: delete follows the permission');
  ok(/data-role-block="doctor secretary" data-perm="treatments"/.test(F['patient-profile.html']), 'patient card treatments link follows the permission');
  ok(/var hideIt = permKey \? !can\(permKey, blocked\.indexOf\(role\) < 0\)/.test(F['supabase-init.js']), 'applyRoleGuards reads data-perm');
  ok(/writePermCache\(newEmployeeId, _pe \? _pe\.permissions : null\)/.test(F['supabase-init.js']) && /writePermCache\(null\);   \/\/ M228/.test(F['supabase-init.js']), 'role switch carries the new person\'s overrides');
  ok(/enforcePagePermEarly\(\);\n  \/\/ Fire-and-forget init/.test(F['supabase-init.js']), 'early block runs before autoInit');
  ok(/new MutationObserver\(cover\)\.observe\(document\.body, \{ childList: true \}\)/.test(F['supabase-init.js']) && /html\.sd-perm-blocked body > :not\(#sdPermBlocked\)\{display:none !important;\}/.test(F['supabase-init.js']), 'cover survives a page that rewrites its body');
  ok(/'employee\.delete', 'employee\.permissions', /.test(F['audit-log.html']) && /permissions:'تعديل صلاحيات'/.test(F['audit-log.html']), 'audit log knows the action');
  ok(/onclick="openPermModal\(\\'' \+ e\.id \+ '\\'\)">🛡️ الصلاحيات<\/button>/.test(F['employees.html']) && /\(e\.role !== 'owner' && hasAccess\)/.test(F['employees.html']), 'card button only for staff who sign in');
  ok(/\[onclick\*="openPermModal\("\],\[onclick\*="savePerms\("\]/.test(F['employees.html']), 'read-only mode hides open + save');
  const D = F['i18n-en.js'];
  ['الصلاحيات', 'للمالك فقط', 'إجراءات حساسة', 'أرشيف الأشعة والصور السريرية', 'حذف مريض', 'العودة لصلاحيات الدور', 'صلاحية واحدة مخصّصة عن دوره', 'مخصّص']
    .forEach(k => ok(D.indexOf("'" + k + "': ") > -1, 'dictionary: ' + k));
  ok(/\[\/\^تبدأ من صلاحيات دوره \\\(\(\.\+\?\)\\\)\$\//.test(D) && /'🛡️ \$1 permissions customised from their role'/.test(D), 'dictionary patterns for runtime text');
}

const rep = (f, a, b) => F => { const o = Object.assign({}, F); o[f] = F[f].split(a).join(b); return o; };
const MUTANTS = [
  ['owner overridden', rep('supabase-init.js', "  function can(key, roleDefault) {\n    if (getRole() === 'owner') return true;\n", "  function can(key, roleDefault) {\n")],
  ['closed list bypassed', rep('supabase-init.js', "PERM_KEYS.forEach(function(k){ if (typeof p[k] === 'boolean') out[k] = p[k]; });", "Object.keys(p).forEach(function(k){ if (typeof p[k] === 'boolean') out[k] = p[k]; });")],
  ['someone else\'s cache applies', rep('supabase-init.js', "(eid && c && c.e === eid)", "(c)")],
  ['radiology photos left open', rep('supabase-init.js', "var PERM_NAV = { 'radiology': ['radiology', 'radiology-photos'] };", "var PERM_NAV = {};")],
  ['guardPage ignores the grant', rep('supabase-init.js', "var allowed = ov !== null ? ov : allowedRoles.indexOf(role) >= 0;", "var allowed = allowedRoles.indexOf(role) >= 0;")],
  ['cover removable by the page', rep('supabase-init.js', "      try { new MutationObserver(cover).observe(document.body, { childList: true }); } catch(e) {}\n", '')],
  ['page not hidden under the cover', rep('supabase-init.js', "      document.documentElement.classList.add('sd-perm-blocked');\n", '')],
  ['patient card not covered', rep('supabase-init.js', "'patient-profile': 'patients', ", '')],
  ['reload loop', rep('supabase-init.js', "if (!permsEqual(before, emp.permissions)) window.location.reload();", "window.location.reload();")],
  ['DB key list drifts', rep('migrations/228_staff_permissions.sql', "'audit-log','act.delete-patient'", "'audit-log','settings','act.delete-patient'")],
  ['owner row may be overridden', rep('migrations/228_staff_permissions.sql', " AND (role <> 'owner' OR permissions IS NULL)", '')],
  ['sidebar ignores overrides', rep('sidebar.js', "blocked = window.SyDentLock.applyPermsToNav(blocked);", "blocked = blocked;")],
  ['window lets the owner in', rep('employees.html', "if (!emp || emp.role === 'owner' || emp.has_system_access !== true) return;", "if (!emp) return;")],
  ['back-to-default kept as override', rep('employees.html', "if (next === roleDefault(S.emp.role, key)) delete S.draft[key]; else S.draft[key] = next;", "S.draft[key] = next;")],
  ['save not owner-scoped', rep('employees.html', ".eq('id', emp.id).eq('owner_id', u);", ".eq('id', emp.id);")],
  ['empty save not NULL', rep('employees.html', "var value = Object.keys(after).length ? after : null;", "var value = after;")],
  ['delete still owner-only', rep('patients.html', "window.SyDentLock.can('act.delete-patient', false)", "window.SyDentLock.isOwner()")],
  ['payouts ignores the grant', rep('payouts.html', "if (role !== 'owner' && !_permOpen) {", "if (role !== 'owner') {")],
  ['stale override kept', rep('employees.html', "S.draft = realOverrides(emp.permissions, emp.role);", "S.draft = clean(emp.permissions);")],
  ['dictionary misses a string', rep('i18n-en.js', "'العودة لصلاحيات الدور': ", "'العودة للدور': ")]
];

(async () => {
  try { await suite(base); } catch (e) { fail++; console.log('  ✗ suite crashed: ' + e.message); }
  const bp = pass, bf = fail;
  if (process.argv.includes('--self-test')) {
    let bit = 0;
    for (const [name, mut] of MUTANTS) {
      const F2 = mut(base);
      if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
      pass = 0; fail = 0; const lg = console.log; console.log = () => {};
      try { await suite(F2); } catch (e) { fail++; }
      console.log = lg;
      if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
    }
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-staff-perms: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-staff-perms: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();

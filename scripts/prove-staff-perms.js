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
const FILES = ['supabase-init.js', 'payouts.html', 'migrations/230_accountant_employee_type.sql', 'migrations/232_perm_dash_income.sql', 'index.html', 'dash-goal.js', 'sidebar.js', 'employees.html', 'patients.html', 'patient-profile.html', 'accounting.html',
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
    'function invalidateEmployeesCache(){} async function loadEmployees(){} var ROLE_LABELS={owner:"المالك",doctor:"الطبيب",secretary:"السكرتيرة"};\n' + lockBlock(F) +
    '\nthis.api={isAccountant,roleLabelNow,can,permOverride,getPermOverrides,applyPermsToNav,syncPermsFromList,enforcePagePermEarly,guardPage,cleanPerms,PERM_KEYS,currentPageKey};', ctx);
  ctx.store = store;
  return ctx;
}
const cache = (e, p, t) => ({ 'sydent.lock.perms': JSON.stringify({ e, p, t: t || null }) });

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
  const sqlKeys = ((F['migrations/232_perm_dash_income.sql'].match(/k NOT IN \(([\s\S]*?)\)/) || [])[1] || '').match(/'[^']+'/g) || [];
  const clientKeys = Array.from(lk.api.PERM_KEYS).slice().sort().join();
  ok(sqlKeys.map(x => x.slice(1, -1)).sort().join() === clientKeys, 'DB validator keys = SyDentLock.PERM_KEYS');
  ok(empCtx(F, { employees: [], nav }).SyEmpPerms.KEYS.slice().sort().join() === clientKeys, 'employees window keys = SyDentLock.PERM_KEYS');
  ok(/role <> 'owner' OR permissions IS NULL/.test(F['migrations/228_staff_permissions.sql']), 'DB: owner row never overridden');
  ok(/blocked = window\.SyDentLock\.applyPermsToNav\(blocked\)/.test(F['sidebar.js']) && /var BLOCKED = SB_ROLE_BLOCKED;/.test(F['sidebar.js']), 'sidebar applies the overrides on its role map');
  ['accounting', 'expenses', 'payouts'].forEach(k => ok(F[k + '.html'].indexOf("window.SyDentLock.can('" + k + "', false));   /* M230: the accountant's default too */\n    if (role !== 'owner' && !_permOpen) {") > -1, k + ': manual owner check honours the grant and the accountant'));
  ok(/SyDentLock\.can\('act\.delete-patient', false\)/.test(F['patients.html']) && /data-perm="act\.delete-patient"/.test(F['patients.html']), 'patients: delete follows the permission');
  ok(/data-role-block="doctor secretary" data-perm="treatments"/.test(F['patient-profile.html']), 'patient card treatments link follows the permission');
  ok(/var hideIt = permKey \? !can\(permKey, blocked\.indexOf\(role\) < 0\)/.test(F['supabase-init.js']), 'applyRoleGuards reads data-perm');
  ok(/writePermCache\(newEmployeeId, _pe \? _pe\.permissions : null, _pe \? _pe\.provider_type : null\)/.test(F['supabase-init.js']) && /writePermCache\(null\);   \/\/ M228/.test(F['supabase-init.js']), 'role switch carries the new person\'s overrides');
  ok(/enforcePagePermEarly\(\);\n  \/\/ Fire-and-forget init/.test(F['supabase-init.js']), 'early block runs before autoInit');
  ok(/new MutationObserver\(cover\)\.observe\(document\.body, \{ childList: true \}\)/.test(F['supabase-init.js']) && /html\.sd-perm-blocked body > :not\(#sdPermBlocked\)\{display:none !important;\}/.test(F['supabase-init.js']), 'cover survives a page that rewrites its body');
  ok(/'employee\.delete', 'employee\.permissions', /.test(F['audit-log.html']) && /permissions:'تعديل صلاحيات'/.test(F['audit-log.html']), 'audit log knows the action');
  ok(/onclick="openPermModal\(\\'' \+ e\.id \+ '\\'\)">🛡️ الصلاحيات<\/button>/.test(F['employees.html']) && /\(e\.role !== 'owner' && hasAccess\)/.test(F['employees.html']), 'card button only for staff who sign in');
  ok(/\[onclick\*="openPermModal\("\],\[onclick\*="savePerms\("\]/.test(F['employees.html']), 'read-only mode hides open + save');
  const D = F['i18n-en.js'];
  ['الصلاحيات', 'للمالك فقط', 'إجراءات حساسة', 'أرشيف الأشعة والصور السريرية', 'حذف مريض', 'استعادة الافتراضي', 'صلاحية واحدة مخصّصة عن الدور', 'مخصّص']
    .forEach(k => ok(D.indexOf("'" + k + "': ") > -1 || D.indexOf('"' + k + '": ') > -1, 'dictionary: ' + k));
  ok(/\[\/\^تبدأ من صلاحيات الدور \\\(\(\.\+\?\)\\\)\$\//.test(D) && /'🛡️ \$1 permissions customised from the role'/.test(D), 'dictionary patterns for runtime text');
  /* ═══ (٤) الرواتب للطبيب: دفعاتُه هو فقط، عرضاً ═══ */
  const P = F['payouts.html'];
  const a = P.indexOf('var _selfScope = null;'), b = P.indexOf('function _isMeEntry(d) {');
  const pc = { console };
  vm.createContext(pc);
  vm.runInContext(P.slice(a, P.indexOf('\n}\n', b) + 3) + '\nthis.api={_payScope,_isMine,_isMeEntry,payIsSelfOnly,set:function(v){_selfScope=v;}};', pc);
  const q = () => { const o = { calls: [] }; o.or = (x) => { o.calls.push(['or', x]); return o; }; o.is = (c, v) => { o.calls.push(['is', c, v]); return o; }; return o; };
  pc.api.set(null);
  ok(pc.api._payScope(q(), true).calls.length === 0 && pc.api._isMine({ provider_id: 'x' }) && !pc.api.payIsSelfOnly(), 'payouts: owner/accountant see the page as before');
  pc.api.set({ doctorId: 'D1', employeeId: 'E1' });
  ok(JSON.stringify(pc.api._payScope(q(), true).calls) === '[["or","provider_id.eq.D1,employee_id.eq.E1"]]', 'payouts: the query itself is scoped to the doctor');
  ok(JSON.stringify(pc.api._payScope(q(), false).calls) === '[["or","provider_id.eq.D1"]]', 'payouts: legacy query without employee_id stays valid');
  ok(pc.api._isMine({ provider_id: 'D1' }) && pc.api._isMine({ employee_id: 'E1' }) && !pc.api._isMine({ provider_id: 'D2' }) && !pc.api._isMine({ employee_id: 'E2' }), 'payouts: client filter keeps only his rows');
  ok(pc.api._isMeEntry({ doctorId: 'D1' }) && !pc.api._isMeEntry({ doctorId: 'D2', employeeId: 'E2' }), 'payouts: staff list reduced to himself');
  pc.api.set({ doctorId: null, employeeId: null });
  ok(JSON.stringify(pc.api._payScope(q(), true).calls) === '[["is","id",null]]' && !pc.api._isMine({ provider_id: null, employee_id: null }), 'payouts: unknown doctor identity ⇒ nothing (fail closed)');
  ok(/await resolveSelfScope\(\);   \/\* M228 \*\/\n    if \(payIsSelfOnly\(\)\) document\.documentElement\.classList\.add\('pay-self'\);\n\n    await loadAll\(\);/.test(P), 'payouts: scope resolved before the first load');
  ok(/if \(payIsSelfOnly\(\)\) \{[^]*?doctors = doctors\.filter\(_isMeEntry\);\n    payouts = payouts\.filter\(_isMine\);/.test(P), 'payouts: self mode filters after loading too');
  ['function openModal(prefillProviderId, prefillFrom, prefillTo) {\n  if (payIsSelfOnly()) return;', "if (window.SyDentSub && window.SyDentSub.blockReadOnly()) return;\n  if (payIsSelfOnly()) return;", 'async function savePayout() {\n  if (payIsSelfOnly()) return;', 'async function _deleteCurrent_inner() {\n  if (payIsSelfOnly()) return;']
    .forEach(x => ok(P.indexOf(x) > -1, 'payouts: write path closed for the doctor — ' + x.slice(0, 30)));
  ok((P.match(/_payScope\(window\.sb\.from\('provider_payouts'\)/g) || []).length === 3, 'payouts: all three query shapes scoped');
  ok(/html\.pay-self \.sd-page-head__actions \[onclick\*="openModal\("\]\{display:none !important;\}/.test(P) && /class="info-box pay-self-note"/.test(P), 'payouts: new-payout button hidden + note shown');
  ok(D.indexOf("'تعرض هذه الصفحة دفعاتك أنت فقط.': ") > -1, 'dictionary: payouts note');
  ok(/onclick="permReset\(\)">استعادة الافتراضي<\/button>/.test(F['employees.html']) && !/عن دوره|صلاحيات دوره \(|من قائمته الجانبية/.test(F['employees.html'].replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, '')), 'wording: «استعادة الافتراضي» and neutral role phrases (no he/she)');
  /* ═══ (٥) M230 — المحاسب، وما لا يُمنح لغيره ═══ */
  c = lockCtx(F, { role: 'secretary', emp: 'A1', store: cache('A1', {}, 'accountant') });
  ok(c.api.isAccountant() && c.api.roleLabelNow() === 'المحاسب', 'accountant recognised from the locked employee\'s type');
  ok(c.api.can('accounting', false) && c.api.can('payouts', false) && c.api.can('expenses', false) && !c.api.can('act.delete-patient', false) && !c.api.can('treatments', false), 'accountant: money pages open by default, the rest like a secretary');
  const accNav = c.api.applyPermsToNav(nav.secretary);
  ok(['accounting', 'expenses', 'payouts', 'provider-reports'].every(k => accNav.indexOf(k) < 0) && accNav.indexOf('settings') >= 0 && accNav.indexOf('employees') >= 0 && accNav.indexOf('treatments') >= 0, 'accountant nav: money pages shown, owner-only pages still hidden');
  c = lockCtx(F, { role: 'secretary', emp: 'A1', path: '/accounting.html', store: cache('A1', {}, 'accountant') });
  ok(c.api.guardPage(['owner']) === true, 'accountant passes the accounting page guard');
  c = lockCtx(F, { role: 'secretary', emp: 'A1', path: '/provider-reports.html', store: cache('A1', {}, 'accountant') });
  ok(c.api.guardPage(['owner', 'doctor']) === true, 'accountant passes the reports guard');
  c = lockCtx(F, { role: 'secretary', emp: 'A1', path: '/payouts.html', store: cache('A1', { payouts: false }, 'accountant') });
  ok(c.api.guardPage(['owner']) === false && c.api.applyPermsToNav(nav.secretary).indexOf('payouts') >= 0, 'the owner can still close a page for the accountant');
  c = lockCtx(F, { role: 'secretary', emp: 'A2', store: cache('A1', {}, 'accountant') });
  ok(!c.api.isAccountant() && !c.api.can('accounting', false), 'another employee on the device is not the accountant');
  c = lockCtx(F, { role: 'doctor', emp: 'A1', store: cache('A1', {}, 'accountant') });
  ok(!c.api.isAccountant(), 'doctor role is never the accountant');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', path: '/accounting.html', store: cache('E1', { accounting: true, 'provider-reports': true, expenses: true }, 'secretary') });
  ok(c.api.permOverride('accounting') === null && c.api.permOverride('provider-reports') === null && c.api.permOverride('expenses') === true, 'secretary: accounting and reports are never grantable, expenses still is');
  ok(c.api.guardPage(['owner']) === false && c.api.applyPermsToNav(nav.secretary).indexOf('accounting') >= 0 && c.api.applyPermsToNav(nav.secretary).indexOf('provider-reports') >= 0, 'secretary with a stale accounting grant stays out (guard + nav)');
  c = lockCtx(F, { role: 'doctor', emp: 'E1', path: '/accounting.html', store: cache('E1', { accounting: true, 'provider-reports': false }, 'doctor') });
  ok(c.api.permOverride('accounting') === null && c.api.guardPage(['owner']) === false && c.api.permOverride('provider-reports') === false, 'doctor: accounting never, reports can still be closed');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', {}, 'secretary'), list: [{ id: 'E1', permissions: null, provider_type: 'accountant' }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 1 && JSON.parse(c.store['sydent.lock.perms']).t === 'accountant', 'sync: becoming the accountant re-applies the page');
  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', {}), list: [{ id: 'E1', permissions: null, provider_type: 'secretary' }] });
  c.api.syncPermsFromList();
  ok(c.reloads === 0, 'sync: an old cache without a type does not reload a secretary');

  /* نافذة الصفحة */
  const emps3 = [{ id: 'A1', name: 'سمير', role: 'secretary', provider_type: 'accountant', has_system_access: true, permissions: null },
    { id: 'S2', name: 'علا', role: 'secretary', provider_type: 'secretary', has_system_access: true, permissions: { accounting: true, 'provider-reports': true, payouts: true } },
    { id: 'D2', name: 'مجد', role: 'doctor', provider_type: 'doctor', has_system_access: true, permissions: null }];
  e = empCtx(F, { employees: emps3, nav });
  e.openPermModal('A1');
  ok(['المحاسبة', 'المصاريف', 'الرواتب والدفعات', 'التقارير'].every(l => e.els.pmList.innerHTML.indexOf('aria-checked="true" aria-label="' + l + '"') > -1) && e.els.pmList.innerHTML.indexOf('🔒 للمالك والمحاسب') < 0, 'window: accountant starts with the money pages on, nothing locked for him');
  e.permToggle('payouts'); await e.savePerms();
  ok(JSON.stringify(e.calls.find(q => q.t === 'clinic_employees').ops[0]) === '["update",{"permissions":{"payouts":false}}]', 'window: closing a page for the accountant is an override');
  e = empCtx(F, { employees: emps3, nav });
  e.openPermModal('S2');
  ok((e.els.pmList.innerHTML.match(/🔒 للمالك والمحاسب/g) || []).length === 2 && !/permToggle\('accounting'\)|permToggle\('provider-reports'\)/.test(e.els.pmList.innerHTML), 'window: accounting and reports are locked rows for a secretary');
  ok(JSON.stringify(e.SyEmpPerms._state.draft) === '{"payouts":true}' && e.SyEmpPerms.countOverrides(emps3[1].permissions, 'secretary', 'secretary') === 1, 'window: stale non-grantable overrides are dropped and not counted');
  e.permToggle('accounting');
  ok(JSON.stringify(e.SyEmpPerms._state.draft) === '{"payouts":true}', 'window: a locked row cannot be toggled');
  await e.savePerms();
  ok(JSON.stringify(e.calls.find(q => q.t === 'clinic_employees').ops[0]) === '["update",{"permissions":{"payouts":true}}]', 'window: saving cleans the stale keys out of the row');
  e = empCtx(F, { employees: emps3, nav });
  e.openPermModal('D2');
  ok((e.els.pmList.innerHTML.match(/🔒 للمالك والمحاسب/g) || []).length === 1 && /aria-checked="true" aria-label="التقارير"/.test(e.els.pmList.innerHTML), 'window: a doctor keeps the reports switch, accounting is locked');

  /* الرواتب: من يُحصَر بنفسه */
  const scopeOf = async (lock) => {
    const x = { console, window: { SyDentLock: lock } }; vm.createContext(x);
    vm.runInContext(P.slice(a, P.indexOf('\n}\n', b) + 3) + '\nthis.run=async function(){await resolveSelfScope();return _selfScope;};', x);
    return JSON.stringify(await x.run());
  };
  const LK = (o) => Object.assign({ isOwner: () => false, isAccountant: () => false, getEffectiveDoctorId: () => null, getEmployeeId: () => 'E9', getCurrentEmployee: async () => ({ id: 'E9', doctor_id: null }) }, o);
  ok(await scopeOf(LK({ isOwner: () => true })) === 'null' && await scopeOf(LK({ isAccountant: () => true })) === 'null' && await scopeOf(undefined) === 'null', 'payouts: owner and accountant are not scoped');
  ok(await scopeOf(LK({})) === '{"doctorId":null,"employeeId":"E9"}', 'payouts: a secretary is scoped to her own employee id');
  ok(await scopeOf(LK({ getEffectiveDoctorId: () => 'D7' })) === '{"doctorId":"D7","employeeId":"E9"}', 'payouts: a doctor is scoped to his doctor card and employee id');
  ok(await scopeOf(LK({ getCurrentEmployee: async () => ({ id: 'E9', doctor_id: 'D5' }) })) === '{"doctorId":"D5","employeeId":"E9"}', 'payouts: a linked doctor card counts for any role');
  ok(await scopeOf(LK({ getEmployeeId: () => null, getCurrentEmployee: async () => null })) === '{"doctorId":null,"employeeId":null}', 'payouts: unknown identity is scoped to nothing');

  /* التوصيل */
  const M2 = F['migrations/230_accountant_employee_type.sql'];
  ok(/ADD CONSTRAINT ce_provider_type_valid\s+CHECK \(provider_type IS NULL OR provider_type IN \('doctor','hygienist','assistant','secretary','other','accountant'\)\);/.test(M2) && !/clinic_doctors\s+(DROP|ADD)/.test(M2), 'M230: the employees check gains accountant, doctors table untouched');
  const EH = F['employees.html'];
  ok(/<option value="secretary:accountant">محاسب<\/option>/.test(EH) && /\['secretary','other','accountant'\]\.indexOf\(docProviderTypeField\)/.test(EH) && /providerType === 'other' \|\| providerType === 'accountant'\) \? providerType : 'secretary'/.test(EH), 'employee form: «محاسب» can be picked, saved and re-opened');
  ok(/docProviderTypeField === 'other' \|\|\n\s+docProviderTypeField === 'accountant';/.test(EH), 'employee form: accountant is non-clinical (no doctor card)');
  ok(D.indexOf("'محاسب': 'Accountant'") > -1 && D.indexOf("'للمالك والمحاسب': ") > -1 && D.indexOf('"آخر (عامل/إلخ)": ') > -1, 'dictionary: accountant strings');
  ok(/typeof _L\.roleLabelNow === 'function' \? _L\.roleLabelNow\(\)/.test(F['sidebar.js']), 'sidebar footer names the accountant');
  /* ═══ (٦) M232 — «إيراد اليوم» بلوحة التحكم ═══ */
  c = lockCtx(F, { role: 'secretary', emp: 'E1', store: cache('E1', {}, 'secretary') });
  ok(c.api.can('dash.income', false) === false, 'dashboard income: off for staff by default');
  c = lockCtx(F, { role: 'doctor', emp: 'E1', store: cache('E1', { 'dash.income': true }, 'doctor') });
  ok(c.api.can('dash.income', false) === true && JSON.stringify(c.api.applyPermsToNav(nav.doctor)) === JSON.stringify(nav.doctor), 'dashboard income: a grant shows it and never touches the sidebar');
  c = lockCtx(F, { role: 'secretary', emp: 'A1', store: cache('A1', {}, 'accountant') });
  ok(c.api.can('dash.income', false) === true, 'dashboard income: on for the accountant by default');
  c = lockCtx(F, { role: 'secretary', emp: 'A1', store: cache('A1', { 'dash.income': false }, 'accountant') });
  ok(c.api.can('dash.income', false) === false, 'dashboard income: the owner can switch it off for the accountant');
  ok(c.api.applyPermsToNav(nav.secretary).indexOf('dash.income') < 0, 'dashboard income: switching it off adds nothing to the sidebar list');
  c = lockCtx(F, { role: 'owner', emp: null });
  ok(c.api.can('dash.income', false) === true, 'dashboard income: the owner always sees it');
  e = empCtx(F, { employees: emps3, nav });
  e.openPermModal('S2');
  ok(/aria-checked="false" aria-label="إيراد اليوم وملخّص أمس"/.test(e.els.pmList.innerHTML), 'window: «إيراد اليوم» row, off for a secretary');
  e.permToggle('dash.income');
  ok(e.SyEmpPerms._state.draft['dash.income'] === true, 'window: granting it is an override');
  e = empCtx(F, { employees: emps3, nav });
  e.openPermModal('A1');
  ok(/aria-checked="true" aria-label="إيراد اليوم وملخّص أمس"/.test(e.els.pmList.innerHTML), 'window: on for the accountant');
  const IX = F['index.html'];
  ok(/const _incOk = !window\.SyDentLock \|\| typeof window\.SyDentLock\.can !== 'function' \|\| window\.SyDentLock\.can\('dash\.income', false\);/.test(IX)
    && /const _pfPays = _dashSettle\(!_incOk \? Promise\.resolve\(\{ data: \[\], error: null \}\) : window\.sb\.from\('ledger_payments'\)/.test(IX), 'dashboard: without the permission today\'s payments are not even read');
  ok(/if \(!_incOk\) \{ var _incCard = document\.getElementById\('kpiIncome'\); if \(_incCard\) _incCard\.remove\(\);/.test(IX) && /<a class="kpi" id="kpiIncome" href="accounting\.html">/.test(IX), 'dashboard: the card is removed, not just emptied');
  ok(/noCollected: !\(!window\.SyDentLock \|\| typeof window\.SyDentLock\.can !== 'function' \|\| window\.SyDentLock\.can\('dash\.income', false\)\)/.test(IX)
    && /if \(!ctx\.noCollected\) qs\.push\(sb\.from\('ledger_payments'\)/.test(F['dash-goal.js']), 'goal card: «المقبوض اليوم» follows the same permission');
  ok(/if \(!_incOk\) \{ var _ydCardEl = document\.getElementById\('ydCard'\); if \(_ydCardEl\) _ydCardEl\.remove\(\); \}/.test(IX) && IX.indexOf("getElementById('ydCard'); if (_ydCardEl)") < IX.indexOf('window.SyDentYesterday.load(') && /if \(_ydBody && window\.SyDentYesterday\) \{/.test(IX), 'dashboard: «ملخّص أمس» is removed before its loader, which then reads nothing');
  ok(D.indexOf("'إيراد اليوم وملخّص أمس': ") > -1, 'dictionary: the switch label');
  ok(/'بعد تغيير دوره إلى ' \+ _newTypeLbl \+ '،/.test(EH) && /providerTypeFromRole === 'accountant'\) \? 'محاسب'/.test(EH), 'doctor→accountant confirm names the chosen type');
}

const rep = (f, a, b) => F => { const o = Object.assign({}, F); o[f] = F[f].split(a).join(b); return o; };
const MUTANTS = [
  ['owner overridden', rep('supabase-init.js', "  function can(key, roleDefault) {\n    if (getRole() === 'owner') return true;\n", "  function can(key, roleDefault) {\n")],
  ['closed list bypassed', rep('supabase-init.js', "PERM_KEYS.forEach(function(k){ if (typeof p[k] === 'boolean') out[k] = p[k]; });", "Object.keys(p).forEach(function(k){ if (typeof p[k] === 'boolean') out[k] = p[k]; });")],
  ['someone else\'s cache applies', rep('supabase-init.js', "(eid && c && c.e === eid)", "(c)")],
  ['radiology photos left open', rep('supabase-init.js', "var PERM_NAV = { 'radiology': ['radiology', 'radiology-photos'] };", "var PERM_NAV = {};")],
  ['guardPage ignores the grant', rep('supabase-init.js', "var allowed = ov !== null ? ov : permDefault(key, allowedRoles.indexOf(role) >= 0);", "var allowed = permDefault(key, allowedRoles.indexOf(role) >= 0);")],
  ['cover removable by the page', rep('supabase-init.js', "      try { new MutationObserver(cover).observe(document.body, { childList: true }); } catch(e) {}\n", '')],
  ['page not hidden under the cover', rep('supabase-init.js', "      document.documentElement.classList.add('sd-perm-blocked');\n", '')],
  ['patient card not covered', rep('supabase-init.js', "'patient-profile': 'patients', ", '')],
  ['reload loop', rep('supabase-init.js', "    if (!same) window.location.reload();", "    window.location.reload();")],
  ['DB key list drifts', rep('migrations/232_perm_dash_income.sql', "'audit-log','act.delete-patient'", "'audit-log','settings','act.delete-patient'")],
  ['owner row may be overridden', rep('migrations/228_staff_permissions.sql', " AND (role <> 'owner' OR permissions IS NULL)", '')],
  ['sidebar ignores overrides', rep('sidebar.js', "blocked = window.SyDentLock.applyPermsToNav(blocked);", "blocked = blocked;")],
  ['window lets the owner in', rep('employees.html', "if (!emp || emp.role === 'owner' || emp.has_system_access !== true) return;", "if (!emp) return;")],
  ['back-to-default kept as override', rep('employees.html', "if (next === roleDefault(S.emp.role, key, S.emp.provider_type)) delete S.draft[key]; else S.draft[key] = next;", "S.draft[key] = next;")],
  ['save not owner-scoped', rep('employees.html', ".eq('id', emp.id).eq('owner_id', u);", ".eq('id', emp.id);")],
  ['empty save not NULL', rep('employees.html', "var value = Object.keys(after).length ? after : null;", "var value = after;")],
  ['delete still owner-only', rep('patients.html', "window.SyDentLock.can('act.delete-patient', false)", "window.SyDentLock.isOwner()")],
  ['payouts ignores the grant', rep('payouts.html', "if (role !== 'owner' && !_permOpen) {", "if (role !== 'owner') {")],
  ['stale override kept', rep('employees.html', "S.draft = realOverrides(emp.permissions, emp.role, emp.provider_type);", "S.draft = clean(emp.permissions);")],
  ['payouts query not scoped', rep('payouts.html', "  if (!_selfScope) return q;\n  var parts = [];", "  return q;\n  var parts = [];")],
  ['payouts unknown identity sees all', rep('payouts.html', "  if (!parts.length) return q.is('id', null);", "  if (!parts.length) return q;")],
  ['payouts client filter dropped', rep('payouts.html', "    payouts = payouts.filter(_isMine);\n", '')],
  ['payouts doctor can still delete', rep('payouts.html', "async function _deleteCurrent_inner() {\n  if (payIsSelfOnly()) return;   /* M228 */\n", "async function _deleteCurrent_inner() {\n")],
  ['anyone can be granted accounting', rep('supabase-init.js', "    if (key === 'accounting') return isAccountant();\n", '')],
  ['secretary can be granted reports', rep('supabase-init.js', "    if (key === 'provider-reports') return getRole() === 'doctor' || isAccountant();\n", '')],
  ['accountant from another employee\'s cache', rep('supabase-init.js', "return !!(eid && c && c.e === eid && c.t === 'accountant');", "return !!(c && c.t === 'accountant');")],
  ['accountant defaults missing', rep('supabase-init.js', "    if (isAccountant() && ACCT_OPEN.indexOf(key) >= 0) return true;\n", '')],
  ['accountant nav not opened', rep('supabase-init.js', "    if (isAccountant()) out = out.filter(function(id){ return ACCT_OPEN.indexOf(id) < 0; });   // M230\n", '')],
  ['type change not synced', rep('supabase-init.js', " && (c0.t === 'accountant') === (emp.provider_type === 'accountant');", ';')],
  ['window lets a secretary toggle accounting', rep('employees.html', "    if (!grantable(S.emp.role, key, S.emp.provider_type)) return;\n", '')],
  ['window keeps stale accounting grant', rep('employees.html', "if (grantable(role, k, ptype) && c[k] !== roleDefault(role, k, ptype)) out[k] = c[k];", "if (c[k] !== roleDefault(role, k, ptype)) out[k] = c[k];")],
  ['secretary sees all payouts', rep('payouts.html', "  if (!L || typeof L.isOwner !== 'function' || L.isOwner()) { _selfScope = null; return; }", "  if (!L || !L.isDoctor || !L.isDoctor()) { _selfScope = null; return; }")],
  ['accountant scoped to himself', rep('payouts.html', "  if (typeof L.isAccountant === 'function' && L.isAccountant()) { _selfScope = null; return; }\n", '')],
  ['linked card ignored', rep('payouts.html', "  if (!did && emp && emp.doctor_id) did = emp.doctor_id;", '')],
  ['migration without accountant', rep('migrations/230_accountant_employee_type.sql', "'other','accountant'));", "'other'));")],
  ['dashboard income on by default', rep('employees.html', "if (key === 'act.delete-patient' || key === 'dash.income') return false;", "if (key === 'act.delete-patient') return false;")],
  ['dashboard income read without permission', rep('index.html', "const _pfPays = _dashSettle(!_incOk ? Promise.resolve({ data: [], error: null }) : window.sb", "const _pfPays = _dashSettle(window.sb")],
  ['dashboard card left in place', rep('index.html', " if (_incCard) _incCard.remove();", '')],
  ['goal card still reads the collected', rep('dash-goal.js', "if (!ctx.noCollected) qs.push(sb.from('ledger_payments')", "qs.push(sb.from('ledger_payments')")],
  ['accountant without dashboard income', rep('supabase-init.js', "'provider-reports', 'dash.income'];\n  function isAccountant() {", "'provider-reports'];\n  function isAccountant() {")],
  ['dash key leaks into the sidebar', rep('supabase-init.js', "      if (k.indexOf('.') >= 0) return;   // act.* / dash.* are not pages\n", '')],
  ['yesterday card left for staff', rep('index.html', " if (_ydCardEl) _ydCardEl.remove();", '')],
  ['dictionary misses a string', rep('i18n-en.js', "'صلاحية واحدة مخصّصة عن الدور': ", "'صلاحية واحدة': ")],
  ['old wording back', rep('employees.html', "'تبدأ من صلاحيات الدور ('", "'تبدأ من صلاحيات دوره ('")]
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

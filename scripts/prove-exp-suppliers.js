/* prove-exp-suppliers — M201: «مواد سنية» تصنيفٌ أساسي لا يُحذف + المورّدُ بالمصروف من مورّدي المخزون.
   مستقلّ، على الملفات الحيّة:
   (١) الهجرة 201: العلامةُ وقيدُها وفهرسُها الفريد · حارسُ الحذف ونزعِ العلامة (ويمرّ حذفُ الحساب كاملاً) ·
       الربطُ expenses.supplier_id بحارس ملكية · صفرُ كتابةٍ على صفوف المصاريف · مرآةُ db/schema.sql حرفياً · خطةُ البناء.
   (٢) دوالُّ expenses.html نفسُها تُشغَّل بـvm (سكربتُ الصفحة كاملاً بوثيقةٍ مزيّفة): شكلُ حقل المورّد لكل حالة،
       ما يُحفظ، بطاقةُ التصنيف الأساسي بلا «حذف»، deleteCategory لا يكتب، البذرُ يحمل العلامة ويتدهور برشاقة،
       والعيادةُ القديمة تُعلَّم أو يُضاف لها التصنيف.
   (٣) الأسلاك: سجلُّ وضع القراءة · القاموسُ الإنجليزي · مثبتُ أزرار الصفوف · زرُّ «الطلبيات والموردون» بالمخزون.
   --self-test: طفراتٌ يجب أن تُكشف كلُّها. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = ['expenses.html', 'inventory.html', 'i18n-en.js', 'db/schema.sql', 'scripts/db-bootstrap.py', 'scripts/check-mirrors.js',
  'scripts/dom-smoke/row-actions/build-harness.js', 'migrations/201_expense_system_category_supplier_link.sql'];
const load = () => { const F = {}; FILES.forEach(f => { F[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); }); return F; };

function fnSrc(src, head) {
  const a = src.indexOf(head); if (a < 0) return '';
  let i = src.indexOf('{', a + head.length - 1), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(a, i + 1); } }
  return '';
}
const sqlBody = (sql, name) => { const a = sql.indexOf(name); if (a < 0) return ''; const b = sql.indexOf('$$', a), c = sql.indexOf('$$', b + 2); return sql.slice(b + 2, c).trim(); };

/* ── الصفحةُ بـvm: سكربتُها الرئيسي كاملاً، بوثيقةٍ مزيّفة وقاعدةٍ مبرمَجة الردود ── */
function boot(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = blocks.find(b => b.indexOf('var DEFAULT_CATEGORIES') > -1);
  if (!main) throw new Error('main script not found');
  const SELECTS = { eSupplier: 1, eCategory: 1, ePaymentMethod: 1, eCashSource: 1 };
  const els = {}; const state = { active: null, toasts: [], calls: [], audits: [] };
  const mkEl = (id) => {
    const el = { id, _v: '', _h: '', _t: '', style: {}, children: [], className: '', dataset: {}, isSelect: !!SELECTS[id],
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); },
        toggle(c, on) { if (on === undefined) on = !this.s.has(c); if (on) this.s.add(c); else this.s.delete(c); return on; } },
      appendChild(c) { this.children.push(c); if (this.isSelect && this.children.length === 1) this._v = c.value; return c; },
      insertBefore() {}, focus() { state.active = id; }, addEventListener() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
    Object.defineProperty(el, 'innerHTML', { get() { return this._h; }, set(v) { this._h = String(v); if (v === '') { this.children = []; if (this.isSelect) this._v = ''; } } });
    Object.defineProperty(el, 'value', { get() { return this._v; }, set(v) { v = v == null ? '' : String(v); this._v = this.isSelect ? (this.children.some(c => c.value === v) ? v : '') : v; } });
    Object.defineProperty(el, 'textContent', { get() { return this._t; }, set(v) { this._t = String(v); } });
    Object.defineProperty(el, 'options', { get() { return this.children; } });
    return el;
  };
  const $ = (id) => els[id] || (els[id] = mkEl(id));
  let reply = () => ({ data: [], error: null });
  const from = (t) => {
    const call = { t, op: 'select', row: null, f: [] }; state.calls.push(call);
    const q = { select() { return q; }, insert(r) { call.op = 'insert'; call.row = JSON.parse(JSON.stringify(r)); return q; },
      update(r) { call.op = 'update'; call.row = JSON.parse(JSON.stringify(r)); return q; }, delete() { call.op = 'delete'; return q; },
      eq(k, v) { call.f.push(k + '=' + v); return q; }, is() { return q; }, order() { return q; }, range() { return q; }, single() { return q; }, maybeSingle() { return q; },
      then(ok, no) { return Promise.resolve(reply(call)).then(ok, no); } };
    return q;
  };
  const win = { sb: { from }, sbGetUser: () => Promise.resolve(null), location: { href: '', search: '' },
    SyDT: { nowHM: () => '10:00', cell: () => '' },
    SyDentPayMethods: { sourceOptionsHtml: () => '', isCash: () => true, sourceForStore: () => 'drawer', normSource: () => 'drawer', label: () => '' },
    SyDentCurPick: { mount() {}, pin() {}, read: () => 'SYP' },
    SyDentCurBag: { make: () => ({ SYP: 0, USD: 0 }), text: () => '0', lblOf: () => 'ل.س', defCur: () => 'SYP' },
    SyDentFetchAll: (b) => b(), logAudit: (a, o) => state.audits.push([a, o]), SyDentInvPO: { expensePrefill: () => ({ amount: 1, vendor: 'مورّد الطلبية', description: 'd', date: '2026-01-01' }) } };
  const ctx = { window: win, document: { getElementById: $, createElement: () => mkEl('_'), addEventListener() {}, querySelector: () => null, activeElement: null },
    console: { log() {}, warn() {}, error() {} }, setTimeout: () => 0, URLSearchParams, history: { replaceState() {} }, location: win.location, Promise, JSON, Math, Date, String, Number, Object, Array,
    SyDialog: { confirm: () => Promise.resolve(true) }, SyDT: win.SyDT, SyDentCurBag: win.SyDentCurBag, showToast: (m, e) => state.toasts.push([m, !!e]) };
  win.SyDialog = ctx.SyDialog; win.showToast = ctx.showToast;
  vm.createContext(ctx);
  vm.runInContext(main, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("currentUser = { id: 'u1' };");
  return { run, $, state, setReply: (f) => { reply = f; }, ctx };
}

async function suite(F) {
  let pass = 0; const fails = [];
  const ok = (c, m) => { if (c) pass++; else fails.push(m); };
  const M = F['migrations/201_expense_system_category_supplier_link.sql'], SCH = F['db/schema.sql'], EXH = F['expenses.html'];

  /* ── (١) الهجرة ومرآتُها ── */
  ok(/ADD COLUMN IF NOT EXISTS system_key text;/.test(M) && /CHECK \(system_key IS NULL OR system_key IN \('dental_materials'\)\)/.test(M), 'M201: system_key column with a closed set of keys');
  ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_owner_system_key\s+ON public\.expense_categories \(owner_id, system_key\) WHERE system_key IS NOT NULL;/.test(M), 'M201: one system category per clinic (unique index)');
  const g1 = sqlBody(M, 'FUNCTION public.expense_categories_system_guard()');
  ok(/IF OLD\.system_key IS NOT NULL AND NEW\.system_key IS DISTINCT FROM OLD\.system_key THEN\s+RAISE EXCEPTION 'system_category_key_locked'/.test(g1), 'M201: the key can be granted once, never cleared or changed');
  ok(/IF OLD\.system_key IS NOT NULL\s+AND EXISTS \(SELECT 1 FROM auth\.users u WHERE u\.id = OLD\.owner_id\) THEN\s+RAISE EXCEPTION 'system_category_protected'/.test(g1) && /RETURN OLD;/.test(g1), 'M201: delete refused while the owner exists; the account-delete cascade passes');
  ok(/SECURITY DEFINER\s+SET search_path = public, auth/.test(M) && /BEFORE UPDATE OF system_key OR DELETE ON public\.expense_categories\s+FOR EACH ROW EXECUTE FUNCTION public\.expense_categories_system_guard\(\);/.test(M), 'M201: guard trigger covers DELETE and key updates');
  ok(/REVOKE ALL ON FUNCTION public\.expense_categories_system_guard\(\) FROM PUBLIC, anon, authenticated;/.test(M) && /REVOKE ALL ON FUNCTION public\.expenses_supplier_guard\(\) FROM PUBLIC, anon, authenticated;/.test(M), 'M201: both functions revoked by name (#764)');
  ok(/ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public\.inventory_suppliers\(id\) ON DELETE SET NULL;/.test(M) && /CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON public\.expenses \(supplier_id\) WHERE supplier_id IS NOT NULL;/.test(M), 'M201: optional supplier link, indexed, cleared when the supplier goes');
  const g2 = sqlBody(M, 'FUNCTION public.expenses_supplier_guard()');
  ok(/NEW\.supplier_id IS NOT NULL AND NOT EXISTS\s+\(SELECT 1 FROM public\.inventory_suppliers s WHERE s\.id = NEW\.supplier_id AND s\.owner_id = NEW\.owner_id\)/.test(g2) && /BEFORE INSERT OR UPDATE OF owner_id, supplier_id ON public\.expenses/.test(M), 'M201: ownership guard on the link (#694)');
  ok(!/UPDATE\s+public\.expenses\b/.test(M) && !/DELETE\s+FROM/.test(M), 'M201: no write on existing expense rows, nothing deleted');
  ok(/btrim\(y\.name\) = 'مواد سنية'/.test(M) && /INSERT INTO public\.expense_categories \(owner_id, name, icon, color, sort_order, system_key\)/.test(M), 'M201: existing clinics are tagged by name, or get the category');
  const sBody = (name) => { const a = SCH.indexOf('FUNCTION "public"."' + name + '"()'); if (a < 0) return ''; const b = SCH.indexOf('$$', a), c = SCH.indexOf('$$', b + 2); return SCH.slice(b + 2, c).trim(); };
  ok(g1 !== '' && sBody('expense_categories_system_guard') === g1 && g2 !== '' && sBody('expenses_supplier_guard') === g2.replace(/\s+$/, ''), 'schema.sql mirrors both function bodies verbatim');
  ok(/"system_key" "text",\s+CONSTRAINT "expense_categories_system_key_valid"/.test(SCH) && /"supplier_id" "uuid",/.test(SCH.slice(SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."expenses"'), SCH.indexOf('CREATE TABLE IF NOT EXISTS "public"."expenses"') + 900))
    && /CREATE UNIQUE INDEX "uq_expense_categories_owner_system_key"/.test(SCH) && /CREATE INDEX "idx_expenses_supplier"/.test(SCH)
    && /TRIGGER "trg_expense_categories_system_guard" BEFORE DELETE OR UPDATE OF "system_key"/.test(SCH) && /TRIGGER "trg_expenses_supplier_guard" BEFORE INSERT OR UPDATE OF "owner_id", "supplier_id"/.test(SCH)
    && /"expenses_supplier_id_fkey" FOREIGN KEY \("supplier_id"\) REFERENCES "public"\."inventory_suppliers"\("id"\) ON DELETE SET NULL/.test(SCH), 'schema.sql mirrors columns, indexes, triggers and the foreign key');
  ok(/'migrations\/201_expense_system_category_supplier_link\.sql'/.test(F['scripts/db-bootstrap.py']), 'bootstrap plan lists migration 201');

  /* ── (٢) دوالُّ الصفحة نفسُها ── */
  const CATS = "[{id:'c1',name:'مواد سنية',icon:'🦷',color:'#63b3ed',is_active:true,system_key:'dental_materials'},{id:'c2',name:'أدوات',is_active:true,system_key:null},{id:'c3',name:'كهرباء',is_active:false,system_key:null}]";
  const SUPS = "[{id:'s1',name:'مستودع ديما',is_active:true},{id:'s2',name:'الرازي',is_active:true},{id:'s3',name:'مورّد قديم',is_active:false}]";
  let P;
  try { P = boot(EXH); } catch (e) { ok(false, 'expenses.html main script runs in the harness: ' + e.message); return { pass, fails }; }
  const { run, $, state } = P;
  const J = (code) => JSON.parse(run('JSON.stringify(' + code + ')'));
  run('categories = ' + CATS + '; suppliers = ' + SUPS + '; expenses = [];');

  // الخطة (صرفة)
  let p = J("expVendorPlan(categories[0], suppliers, null)");
  ok(p.mode === 'pick' && p.materials === true && p.options.map(s => s.id).join() === 's1,s2', 'plan: materials + suppliers ⇒ list of the active ones');
  p = J("expVendorPlan(categories[0], suppliers, 's3')");
  ok(p.options.map(s => s.id).join() === 's1,s2,s3', 'plan: the removed supplier of the edited expense stays selectable');
  p = J("expVendorPlan(categories[1], suppliers, 's3')");
  ok(p.mode === 'text' && p.materials === false, 'plan: any other category ⇒ free text');
  p = J("expVendorPlan(categories[0], [], null)"); const p2 = J("expVendorPlan(categories[0], [{id:'x',name:'n',is_active:false}], null)"), p3 = J("expVendorPlan(null, suppliers, null)");
  ok(p.mode === 'text' && p.materials === true && p2.mode === 'text' && p3.mode === 'text' && p3.materials === false, 'plan: no active supplier, or no category ⇒ free text');
  // الاختيار (صرفة)
  const pick = (cur, keep) => run("expVendorPick(expVendorPlan(categories[0], suppliers, " + JSON.stringify(keep || null) + "), " + JSON.stringify(cur) + ")");
  ok(pick({ supplier_id: 's2', vendor: 'أي اسم' }) === 's2' && pick({ supplier_id: 's3', vendor: '' }, 's3') === 's3', 'pick: the saved link wins');
  ok(pick({ supplier_id: null, vendor: '  مستودع ديما ' }) === 's1' && pick({ supplier_id: 's3', vendor: 'الرازي' }) === 's2', 'pick: a name equal to a listed supplier selects it');
  ok(pick({ supplier_id: null, vendor: 'صيدلية' }) === '__other' && pick({ supplier_id: null, vendor: '', other: true }) === '__other' && pick({ supplier_id: null, vendor: '' }) === '', 'pick: other text ⇒ «مورّد آخر»; nothing ⇒ none');

  // النموذج: إضافة
  const shown = (id) => $(id).style.display !== 'none';
  $('eCategory')._v = 'c1'; run("expVendorInit(null, '')");
  ok(shown('eSupplier') && !shown('eVendor') && $('eSupplier').value === '' && $('eSupplier').options.map(o => o.value).join() === ',s1,s2,__other' && shown('eVendorHint') && /المخزون/.test($('eVendorHint').textContent), 'form: new expense on materials opens the list, none selected, hint shown');
  $('eSupplier').value = 's1'; run('pickExpSupplier()');
  let r = J('readExpVendor()');
  ok(r.supplier_id === 's1' && r.vendor === 'مستودع ديما' && !shown('eVendor'), 'form: a picked supplier saves id + name');
  $('eCategory')._v = 'c2'; run('syncExpVendor()'); r = J('readExpVendor()');
  ok(!shown('eSupplier') && shown('eVendor') && $('eVendor').value === 'مستودع ديما' && r.supplier_id === null && r.vendor === 'مستودع ديما' && !shown('eVendorHint'), 'form: another category ⇒ text with the name, no link, no hint');
  $('eCategory')._v = 'c1'; run('syncExpVendor()');
  ok($('eSupplier').value === 's1' && !shown('eVendor'), 'form: back on materials the same supplier is selected');
  $('eSupplier').value = '__other'; run('pickExpSupplier()');
  ok(shown('eVendor') && $('eVendor').value === '' && state.active === 'eVendor' && $('eVendorGroup').classList.contains('exp-sup-other'), 'form: «مورّد آخر» opens an empty focused text');
  $('eVendor').value = ' صيدلية الشام  '; r = J('readExpVendor()');
  ok(r.supplier_id === null && r.vendor === 'صيدلية الشام', 'form: «مورّد آخر» saves the trimmed text without a link');
  run('syncExpVendor()');
  ok($('eSupplier').value === '__other' && $('eVendor').value === ' صيدلية الشام  ', 'form: a redraw keeps what is being typed, untouched');
  $('eSupplier').value = ''; run('pickExpSupplier()'); r = J('readExpVendor()');
  ok(r.supplier_id === null && r.vendor === null && !shown('eVendor') && !$('eVendorGroup').classList.contains('exp-sup-other'), 'form: «بدون مورّد» saves neither');
  // النموذج: تعديل
  run("expVendorInit('s3', 'مورّد قديم')"); r = J('readExpVendor()');
  ok($('eSupplier').value === 's3' && r.supplier_id === 's3' && r.vendor === 'مورّد قديم', 'edit: a link to a removed supplier survives opening and saving');
  $('eCategory')._v = 'c2'; run('syncExpVendor()'); r = J('readExpVendor()');
  ok(r.supplier_id === null && r.vendor === 'مورّد قديم' && shown('eVendor'), 'edit: moving a linked expense to another category keeps the name and drops the link');
  $('eCategory')._v = 'c1'; run('syncExpVendor()');
  ok($('eSupplier').value === 's3', 'edit: …and moving it back finds the same supplier');
  run("expVendorInit(null, 'مستودع ديما')");
  ok($('eSupplier').value === 's1' && $('eSupplier').options.every(o => o.value !== 's3'), 'edit: an old text equal to a supplier opens on it; removed suppliers are not offered');
  run("expVendorInit(null, 'صيدلية الحي')"); r = J('readExpVendor()');
  ok($('eSupplier').value === '__other' && shown('eVendor') && r.vendor === 'صيدلية الحي' && r.supplier_id === null, 'edit: any other old text opens as «مورّد آخر»');
  run('suppliers = [];'); run("expVendorInit(null, '')");
  ok(!shown('eSupplier') && shown('eVendor') && shown('eVendorHint') && /سجّل/.test($('eVendorHint').textContent), 'form: materials with no supplier ⇒ text + where to add them');
  run('suppliers = ' + SUPS + ';');

  // البطاقات
  run('renderCategories()');
  const cards = $('catsGrid').innerHTML.split('<div class="cat-card').slice(1);
  ok(cards.length === 3 && /🔒 أساسي/.test(cards[0]) && !/deleteCategory\(/.test(cards[0]) && /toggleCategoryActive\('c1', false\)" data-span="2">/.test(cards[0]), 'cards: the system category has the chip, no delete, and a toggle over two slots');
  ok(/deleteCategory\('c2'\)/.test(cards[1]) && !/data-span/.test(cards[1]) && !/🔒/.test(cards[1]) && /deleteCategory\('c3'\)/.test(cards[2]) && /sy-act-primary/.test(cards[2]), 'cards: every other category is unchanged (edit · toggle · delete)');
  ok(cards.every(c => /class="cat-actions sy-acts sy-acts-grid"/.test(c)) && /\.cat-actions \{\s+display: grid;\s+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(EXH) && /\.cat-actions > \[data-span="2"\] \{ grid-column: span 2; \}/.test(EXH), 'cards: three fixed columns on the kit grid, span for the missing slot');

  // الحذف
  state.calls.length = 0; state.toasts.length = 0;
  await run("deleteCategory('c1')");
  ok(state.calls.length === 0 && state.toasts.length === 1 && /تصنيف أساسي/.test(state.toasts[0][0]), 'delete: the system category is refused before any dialog or write');
  P.setReply((c) => c.op === 'delete' ? { data: null, error: { code: '23514', message: 'system_category_protected' } } : { data: J('categories'), error: null });
  run("categories[0].system_key = null;"); state.calls.length = 0; state.toasts.length = 0;
  await run("deleteCategory('c1')");
  ok(state.calls.some(c => c.op === 'delete') && state.toasts.length === 1 && /تصنيف أساسي/.test(state.toasts[0][0]) && !state.audits.some(a => a[0] === 'expense_category.delete'), 'delete: a database refusal reads as the same message, nothing logged');
  run('categories = ' + CATS + ';');
  P.setReply((c) => ({ data: c.op === 'select' ? (c.t === 'expense_categories' ? J('categories') : []) : null, error: null }));
  state.calls.length = 0; state.audits.length = 0;
  await run("deleteCategory('c2')");
  ok(state.calls.some(c => c.t === 'expense_categories' && c.op === 'delete' && c.f.indexOf('id=c2') > -1) && state.audits.some(a => a[0] === 'expense_category.delete'), 'delete: a normal category is still deleted and logged');

  // الحفظ
  const sv = fnSrc(EXH, 'async function saveExpense() {');
  ok(/var _ven = readExpVendor\(\);/.test(sv) && /var vendor = _ven\.vendor;/.test(sv) && /vendor: vendor,\s+supplier_id: _ven\.supplier_id,/.test(sv), 'save: vendor text + supplier link come from one reader');
  ok(/_expColMissing\(res\.error, 'supplier_id'\)\) \{[\s\S]{0,260}delete row\.supplier_id;/.test(sv), 'save: a database without M201 still saves (no link)');
  $('eCategory')._v = 'c1'; run("categories = " + CATS + "; expVendorInit(null, ''); editingExpId = null;"); $('eSupplier').value = 's2'; run('pickExpSupplier()');
  $('eDate').value = '2026-11-11'; $('eAmount').value = '5000'; $('eTime').value = '';
  let n = 0; P.setReply((c) => { if (c.t === 'expenses' && c.op === 'insert') { n++; return n === 1 ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'supplier_id' column of 'expenses'" } } : { data: Object.assign({ id: 'new' }, c.row), error: null }; } return { data: [], error: null }; });
  state.calls.length = 0; await run('saveExpense()');
  const ins = state.calls.filter(c => c.t === 'expenses' && c.op === 'insert');
  ok(ins.length === 2 && ins[0].row.supplier_id === 's2' && ins[0].row.vendor === 'الرازي' && !('supplier_id' in ins[1].row) && ins[1].row.vendor === 'الرازي' && ins[1].row.amount === 5000, 'save: first write carries the link; the retry drops only the link');

  // البذرُ والعياداتُ القديمة
  ok(J('DEFAULT_CATEGORIES').filter(c => c.system_key).length === 1 && J('DEFAULT_CATEGORIES')[0].system_key === 'dental_materials' && J('DEFAULT_CATEGORIES')[0].name === 'مواد سنية', 'seed: exactly «مواد سنية» carries the system key');
  run('categories = [];'); n = 0; state.calls.length = 0;
  P.setReply((c) => { if (c.op === 'insert') { n++; return n === 1 ? { data: null, error: { code: '42703', message: 'column "system_key" does not exist' } } : { data: c.row, error: null }; } return { data: [], error: null }; });
  await run('maybeBootstrapDefaults()');
  let seeds = state.calls.filter(c => c.op === 'insert');
  ok(seeds.length === 2 && seeds[0].row[0].system_key === 'dental_materials' && seeds[1].row.every(x => !('system_key' in x)) && seeds[1].row.length === seeds[0].row.length && J('categories').length === seeds[0].row.length, 'seed: carries the key; a database without the column is seeded as before');
  run('categories = [];'); state.calls.length = 0;
  P.setReply((c) => c.op === 'insert' ? { data: null, error: { code: '23505', message: 'duplicate key' } } : { data: [{ id: 'c1', name: 'مواد سنية', system_key: 'dental_materials' }], error: null });
  await run('maybeBootstrapDefaults()');
  ok(J('categories').length === 1 && state.calls.filter(c => c.op === 'insert').length === 1, 'seed: a second tab seeding at the same moment reads what the first one wrote');
  const ens = async (cats, level) => { run('categories = ' + cats + ';'); P.ctx.window.SyDentSub = level ? { level: () => level } : undefined; state.calls.length = 0;
    P.setReply((c) => ({ data: c.op === 'select' ? J('categories') : null, error: null })); await run('ensureMaterialsCategory()'); return state.calls.filter(c => c.op !== 'select'); };
  let w = await ens("[{id:'a',name:' مواد سنية ',system_key:null},{id:'b',name:'x',system_key:null}]");
  ok(w.length === 1 && w[0].op === 'update' && w[0].row.system_key === 'dental_materials' && w[0].f.indexOf('id=a') > -1 && Object.keys(w[0].row).length === 1, 'old clinic: an untagged «مواد سنية» is tagged, nothing else touched');
  w = await ens("[{id:'b',name:'x',system_key:null}]");
  ok(w.length === 1 && w[0].op === 'insert' && w[0].row.system_key === 'dental_materials' && w[0].row.name === 'مواد سنية' && w[0].row.owner_id === 'u1', 'old clinic: a missing «مواد سنية» is added');
  ok((await ens(CATS)).length === 0 && (await ens('[]')).length === 0 && (await ens("[{id:'b',name:'مواد سنية'}]")).length === 0 && (await ens("[{id:'b',name:'x',system_key:null}]", 'read')).length === 0, 'old clinic: nothing written when tagged, empty, on a database without M201, or read-only');
  P.ctx.window.SyDentSub = undefined;
  const ini = fnSrc(EXH, 'async function init() {');
  ok(/await loadCategories\(\);\s+await maybeBootstrapDefaults\(\);\s+await ensureMaterialsCategory\(\);[^\n]*\n\s+await Promise\.all\(\[loadExpenses\(\), loadSuppliers\(\)\]\);/.test(ini), 'init: categories → seed → system category → expenses + suppliers');
  // استلامُ الطلبية
  const oe = fnSrc(EXH, 'async function openInvReceiptExpense(receiptId, cur) {');
  ok(/var mat = materialsCat\(\);/.test(oe) && /expVendorInit\(r\.data\.supplier_id \|\| null, pre\.vendor\);/.test(oe) && /'id, received_at, supplier_id, /.test(oe) && oe.indexOf('expVendorInit(') > oe.indexOf("$('eCategory').value = mat.id"), 'receipt → expense: system category by key, the order supplier preselected after the category');
  ok(/expVendorInit\(null, ''\);/.test(fnSrc(EXH, 'function openExpenseModal() {')) && /expVendorInit\(e\.supplier_id \|\| null, e\.vendor \|\| ''\);/.test(fnSrc(EXH, 'function editExpense(id) {')) && /_expSupplierId = null;/.test(fnSrc(EXH, 'function closeExpModal() {')), 'modal: opens through one initialiser; closing forgets the edited supplier');

  /* ── (٣) الأسلاك ── */
  ok(/<select id="eCategory" onchange="syncExpVendor\(\)"><\/select>/.test(EXH) && /<select id="eSupplier" onchange="pickExpSupplier\(\)" aria-label="اختيار المورّد" style="display:none;"><\/select>\s+<input type="text" id="eVendor"/.test(EXH), 'markup: the list sits above the text field, hidden until needed');
  ok(/"inert": \["openCatColorPicker", "syncExpSource", "syncExpVendor", "pickExpSupplier"\]/.test(F['scripts/check-mirrors.js']), 'read-mode registry classifies the two form-only handlers');
  const D = F['i18n-en.js'];
  ok(['اختيار المورّد', '— بدون مورّد —', '✏️ مورّد آخر (اكتب الاسم)', 'القائمة من مورّدي المخزون.', 'سجّل مورّديك في المخزون («الطلبيات والموردون») لتختارهم من قائمة.', '🔒 أساسي',
    'تصنيف أساسي يرتبط به مورّدو المخزون — لا يمكن حذفه', '🔒 هذا تصنيف أساسي لا يمكن حذفه — يمكنك تعديله أو تعطيله', 'طلبيات الشراء من المورّدين، وقائمة المورّدين وأرقامهم']
    .every(s => D.indexOf('"' + s + '": "') > -1 && EXH.concat(F['inventory.html']).indexOf(s) > -1), 'every new string exists on the page and in the English dictionary');
  const H = F['scripts/dom-smoke/row-actions/build-harness.js'];
  ok(/data-row="cat-system"/.test(H) && /<button class="sy-act sy-act-warn" data-span="2">⏸️ تعطيل<\/button><\/div><\/div>\n<div class="cat-card" data-row="cat">/.test(H) && (H.match(/cat-actions sy-acts sy-acts-grid/g) || []).length === 4, 'row-actions harness measures the system card beside the normal ones');
  ok(/<button type="button" class="sd-btn sd-btn--secondary" onclick="openPoModal\(\)"[^>]*>🚚 الطلبيات والموردون<\/button>/.test(F['inventory.html']) && !/class="sd-btn" onclick=/.test(F['inventory.html']), 'inventory: «الطلبيات والموردون» is a bordered secondary button');
  return { pass, fails };
}

const rep = (f, a, b) => (F) => { if (F[f].indexOf(a) < 0) throw new Error('mutant anchor missing: ' + f + ' — ' + a.slice(0, 50)); F[f] = F[f].split(a).join(b); };
const MUTANTS = [
  ['system card shows «حذف» again', rep('expenses.html', "(sys ? '' : '<button class=\"sy-act sy-act-danger\" onclick=\"deleteCategory(", "('<button class=\"sy-act sy-act-danger\" onclick=\"deleteCategory(")],
  ['deleteCategory guard removed', rep('expenses.html', "if (isSystemCat(c)) { showToast(", "if (false) { showToast(")],
  ['database refusal shown raw', rep('expenses.html', "/system_category_protected/.test(String(res.error.message || ''))", "false")],
  ['removed suppliers offered to everyone', rep('expenses.html', "return s.is_active !== false || (!!keepId && s.id === keepId);", "return true;")],
  ['list shown for every category', rep('expenses.html', "mode: (isMat && list.length) ? 'pick' : 'text'", "mode: list.length ? 'pick' : 'text'")],
  ['name no longer matched to a supplier', rep('expenses.html', "return m ? m.id : SUP_OTHER;", "return SUP_OTHER;")],
  ['link saved outside the list', rep('expenses.html', "if (!sel || sel.style.display === 'none') return { supplier_id: null,", "if (!sel || sel.style.display === 'none') return { supplier_id: _expSupplierId,")],
  ['vendor text not trimmed', rep('expenses.html', "vendor: String(cur.vendor || '').trim() || null };", "vendor: cur.vendor || null };")],
  ['save drops the link', rep('expenses.html', "      supplier_id: _ven.supplier_id,   // M201\n", "")],
  ['no fallback without M201', rep('expenses.html', "if (res.error && _expColMissing(res.error, 'supplier_id')) {", "if (false) {")],
  ['seed without the key', rep('expenses.html', "sort_order: 1, system_key: MATERIALS_KEY };", "sort_order: 1 };")],
  ['old clinic never healed', rep('expenses.html', "    await ensureMaterialsCategory();   // M201\n", "")],
  ['read-only account writes', rep('expenses.html', "if (lvl && lvl !== 'full') return;", "")],
  ['redraw wipes typed text', rep('expenses.html', "txt.value = isOther ? (cur.vendor || '') : (pick ? supplierName(pick) : '');", "txt.value = pick && !isOther ? supplierName(pick) : '';")],
  ['toggle no longer spans', rep('expenses.html', "var span = sys ? ' data-span=\"2\"' : '';", "var span = '';")],
  ['receipt finds the category by name only', rep('expenses.html', "var mat = materialsCat();\n", "var mat = null;\n")],
  ['M201: delete guard ignores the cascade', rep('migrations/201_expense_system_category_supplier_link.sql', "     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.owner_id) THEN", "     THEN")],
  ['M201: trigger misses DELETE', rep('migrations/201_expense_system_category_supplier_link.sql', "BEFORE UPDATE OF system_key OR DELETE ON", "BEFORE UPDATE OF system_key ON")],
  ['M201: ownership guard without owner', rep('migrations/201_expense_system_category_supplier_link.sql', "WHERE s.id = NEW.supplier_id AND s.owner_id = NEW.owner_id)", "WHERE s.id = NEW.supplier_id)")],
  ['M201: backfill rewrites expenses', rep('migrations/201_expense_system_category_supplier_link.sql', "-- حارسُ الملكية (#694)", "UPDATE public.expenses SET supplier_id = NULL;\n-- حارسُ الملكية (#694)")],
  ['schema.sql drifts from the migration', rep('db/schema.sql', "RAISE EXCEPTION 'system_category_protected' USING ERRCODE = '23514';", "RAISE EXCEPTION 'protected' USING ERRCODE = '23514';")],
  ['registry misses a handler', rep('scripts/check-mirrors.js', ', "pickExpSupplier"]', ']')],
  ['dictionary misses a string', rep('i18n-en.js', '"— بدون مورّد —": ', '"— بدون —": ')],
  ['inventory button plain again', rep('inventory.html', 'class="sd-btn sd-btn--secondary" onclick="openPoModal()"', 'class="sd-btn" onclick="openPoModal()"')]
];

(async () => {
  const base = await suite(load());
  base.fails.forEach(f => console.log('FAIL', f));
  if (!process.argv.includes('--self-test')) {
    console.log((base.fails.length ? '❌' : '✅') + ' prove-exp-suppliers: ' + base.pass + '/' + (base.pass + base.fails.length));
    process.exit(base.fails.length ? 1 : 0);
  }
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F = load(); let res;
    try { mut(F); } catch (e) { console.log('MUTANT BROKEN', name, '—', e.message); continue; }
    try { res = await suite(F); } catch (e) { res = { pass: 0, fails: ['suite stopped: ' + e.message] }; }   // توقّفُ المثبت على ملفٍّ مطفَّر = كشف
    if (res.fails.length) bit++; else console.log('MUTANT SURVIVED', name);
  }
  const good = !base.fails.length && bit === MUTANTS.length;
  console.log((good ? '✅' : '❌') + ' prove-exp-suppliers: ' + base.pass + '/' + (base.pass + base.fails.length) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(good ? 0 : 1);
})().catch(e => { console.log('❌ prove-exp-suppliers crashed: ' + (e && e.stack || e)); process.exit(1); });

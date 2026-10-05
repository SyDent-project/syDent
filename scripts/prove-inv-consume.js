/* v568 — مثبتُ الخصم الذرّي للمواد (M169 + inv-consume.js + النافذتان + شاشة المخزون) — مستقل، على الملفات الحيّة.
   (١) الهجرة: أعمدةُ الربط بـSET NULL · حرّاسُ الملكية (#694) على الأحداث الصحيحة · ترتيبُ FEFO (السارية ⇒ الرصيد ⇒ المنتهية) ·
       قفلُ الصنف بترتيبٍ ثابت · المريضُ والطبيبُ من الجلسة · وضعُ القراءة · الثابتُ بتريغرين (#693) · التسوية · الصلاحيات;
   (٢) inv-consume.js بثوابت ذاتية: التوزيعُ يطابق المُدخَل بالمئات ويتبع النسب · الحمولة · التوست يعلن النقصَ باسمه (#689);
   (٣) النافذتان تُشغَّلان بعميلٍ مصطنع: الحمولةُ للـRPC وحدها، كلُّ سطرٍ بجلسته، والمجموعُ = ما عدّله الطبيب;
   (٤) المساراتُ الخمسة ببطاقة المريض تمرّر الجلسة · شاشةُ المخزون: الاستهلاكُ والإنهاء بالـRPC · الأصلُ محمَّلٌ مرةً وبالفليت.
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function fnSrc(src, sig) { const i = src.indexOf(sig); if (i < 0) return ''; const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

function loadModule(F) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(F['inv-consume.js'], ctx);
  return ctx.window.SyDentInvConsume;
}

/* عميلٌ مصطنع: جداول للقراءة + تسجيلُ كل كتابة و rpc */
function makeSb(tables, log, rpcReply) {
  function Q(t) { this.t = t; this.f = []; this.inF = null; this.op = 'select'; }
  Q.prototype.select = function () { return this; };
  Q.prototype.eq = function (k, v) { this.f.push([k, v]); return this; };
  Q.prototype.in = function (k, v) { this.inF = [k, v]; return this; };
  Q.prototype.order = function () { return this; };
  Q.prototype.limit = function () { return this; };
  Q.prototype.single = function () { this.one = true; return this; };
  ['insert', 'update', 'delete', 'upsert'].forEach(m => { Q.prototype[m] = function (p) { log.push({ write: m, t: this.t, p }); this.op = m; return this; }; });
  Q.prototype.then = function (res) {
    let rows = (tables[this.t] || []).filter(r => this.f.every(([k, v]) => r[k] === v));
    if (this.inF) rows = rows.filter(r => this.inF[1].indexOf(r[this.inF[0]]) > -1);
    return Promise.resolve(this.op !== 'select' ? { data: null, error: null } : { data: this.one ? rows[0] : rows, error: null }).then(res);
  };
  return {
    from: t => new Q(t),
    rpc: (name, args) => { log.push({ rpc: name, args: JSON.parse(JSON.stringify(args)) }); return Promise.resolve(rpcReply(name, args)); }
  };
}
function echoReply(name, args) {
  if (name !== 'inventory_consume') return { data: null, error: { message: 'unknown' } };
  return { data: { lines: args.p_lines.map(l => ({ item_id: l.item_id, session_id: l.session_id, requested: l.qty, deducted: l.qty, remaining: 5 })) }, error: null };
}
/* DOM صغير: صفوفُ المودال تُقرأ كمدخلات بقيمٍ نحدّدها */
function makeDom(values) {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', disabled: false, classList: { add() {}, remove() {} } });
  return {
    els,
    document: {
      getElementById: get,
      querySelectorAll: () => values.map((v, i) => ({ value: String(v), getAttribute: () => String(i) }))
    }
  };
}

async function suite(F) {
  /* (١) الهجرة */
  const M = F['migrations/169_inventory_atomic_consume.sql'];
  ['session_id  uuid REFERENCES public.ledger_sessions(id)   ON DELETE SET NULL',
   'patient_id  uuid REFERENCES public.patients(id)          ON DELETE SET NULL',
   'provider_id uuid REFERENCES public.clinic_doctors(id)    ON DELETE SET NULL',
   'batch_id    uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL'].forEach(c => ok(M.indexOf(c) > -1, 'migration: column ' + c.split(' ')[0]));
  ['movement_item_not_owned', 'movement_session_not_owned', 'movement_patient_not_owned', 'movement_provider_not_owned', 'movement_batch_not_owned',
   'material_item_not_owned', 'material_treatment_not_owned', 'batch_item_not_owned', 'item_not_owned', 'session_not_owned', 'batch_not_owned']
    .forEach(k => ok(new RegExp("RAISE EXCEPTION '" + k + "' USING ERRCODE = '42501'").test(M), 'migration: ownership guard ' + k));
  ok(/BEFORE INSERT OR UPDATE OF owner_id, item_id, session_id, patient_id, provider_id, batch_id ON public\.inventory_movements/.test(M), 'migration: movement guard fires on every link column');
  ok(/b\.id = NEW\.batch_id AND b\.owner_id = NEW\.owner_id AND b\.item_id = NEW\.item_id/.test(M), 'migration: a batch must belong to the same item');
  ok(/BEFORE INSERT OR UPDATE OF owner_id, item_id, treatment_id ON public\.treatment_materials/.test(M), 'migration: materials guard');
  const fefo = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_fefo_take'), M.indexOf('-- ── ٤)'));
  const iValid = fefo.indexOf('(x.expiry_date IS NULL OR x.expiry_date >= p_today)'), iRem = fefo.indexOf('NOT p_batches_only AND v_rem > 0'), iExp = fefo.indexOf('AND x.expiry_date < p_today');
  ok(iValid > 0 && iRem > iValid && iExp > iRem, 'FEFO: valid batches ⇒ undated remainder ⇒ expired last');
  ok(/ORDER BY x\.expiry_date NULLS LAST, x\.created_at, x\.id\s+FOR UPDATE/.test(fefo), 'FEFO: nearest expiry first, batches locked');
  ok((fefo.match(/is_finished = \(quantity - t\) <= 0/g) || []).length === 2, 'FEFO: an emptied batch is finished');
  const cons = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_consume'), M.indexOf('-- ── ٧)'));
  ok(/SECURITY INVOKER/.test(cons) && !/SECURITY DEFINER/.test(cons), 'consume: invoker rights (RLS + subscription gate stay)');
  ok(/my_access_level\(\) <> 'full' THEN RAISE EXCEPTION 'read_only'/.test(cons), 'consume: read-only refused');
  ok(/ORDER BY 1, 4/.test(cons) && /i\.owner_id = v_uid FOR UPDATE/.test(cons), 'consume: item rows locked in a fixed order');
  ok(/SELECT ls\.patient_id, ls\.provider_id INTO v_pat, v_prov[\s\S]*?ls\.doctor_id = v_uid/.test(cons), 'consume: patient and provider derived from the owned session');
  ok(/v_take := least\(r\.qty, greatest\(v_q, 0\)\)/.test(cons), 'consume: clamped to stock, never negative');
  ok(/r\.session_id, v_pat, v_prov, s\.batch_id/.test(cons) && /-s\.took, 'consume'/.test(cons), 'consume: one movement per slice carrying session, patient, provider, batch');
  ok(cons.indexOf('inventory_fefo_take(r.item_id') < cons.indexOf('UPDATE public.inventory_items SET quantity = quantity - v_take'), 'consume: batches first, then the item (trim trigger stays a no-op)');
  ok(/'skipped', 'inactive'/.test(cons), 'consume: deleted item skipped and reported');
  ok(/RAISE EXCEPTION 'bad_line'/.test(cons) && /jsonb_array_length\(p_lines\) > 200/.test(cons), 'consume: bad lines refused');
  const bg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_batches_guard'), M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_items_trim_batches'));
  ok(/v_other \+ coalesce\(NEW\.quantity, 0\) > coalesce\(v_itemq, 0\) THEN\s+RAISE EXCEPTION 'batch_exceeds_stock'/.test(bg), 'invariant: no batch beyond the stock');
  ok(/coalesce\(NEW\.quantity, 0\) > coalesce\(OLD\.quantity, 0\)/.test(bg), 'invariant: only growth is checked (trimming passes)');
  ok(/NEW\.received_qty := NEW\.quantity/.test(bg), 'received quantity kept on insert');
  ok(/AFTER UPDATE OF quantity ON public\.inventory_items/.test(M) && /PERFORM public\.inventory_fefo_take\(NEW\.id, v_open - NEW\.quantity,[\s\S]*?, true\)/.test(M), 'invariant: any decrease trims the batches (old cached clients)');
  ok(M.indexOf('-- ── ٤)') < M.indexOf('CREATE TRIGGER trg_inventory_batches_guard'), 'reconciliation runs before the batch guard');
  ok(/'adjust',\s*'📦 تسوية: الدفعة نقصت/.test(M) && /0, 'adjust',/.test(M), 'reconciliation logged with change 0');
  ok(/inventory_items_quantity_nonneg CHECK \(quantity >= 0\)/.test(M), 'no negative stock');
  ok(/REVOKE ALL ON FUNCTION public\.inventory_consume\(jsonb, text\) FROM PUBLIC, anon/.test(M) && /GRANT EXECUTE ON FUNCTION public\.inventory_consume\(jsonb, text\) TO authenticated/.test(M), 'grants: authenticated only');
  const fin = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.inventory_finish_batch'), M.indexOf('REVOKE ALL ON FUNCTION'));
  ok(/quantity = 0, is_finished = true/.test(fin) && /SET quantity = quantity - v_out/.test(fin) && /-v_out, 'adjust'/.test(fin), 'finish: remaining leaves the stock with an adjust movement');
  const SCH = F['db/schema.sql'];
  ok(/"received_qty" numeric/.test(SCH) && /inventory_movements_session_id_fkey/.test(SCH) && /inventory_items_quantity_nonneg/.test(SCH), 'schema.sql mirrors M169');

  /* (٢) inv-consume.js */
  let C;
  try { C = loadModule(F); } catch (e) { ok(false, 'inv-consume throws: ' + e.message); return; }
  const sum = a => Math.round(a.reduce((s, x) => s + x.qty, 0) * 100) / 100;
  let sp = C.split(10, [{ session_id: 'a', qty: 1 }, { session_id: 'b', qty: 1 }, { session_id: 'c', qty: 1 }]);
  ok(sp.length === 3 && sum(sp) === 10 && sp.every(x => x.qty === 3.33 || x.qty === 3.34), 'split: 10 over three equal sessions = 3.34+3.33+3.33');
  sp = C.split(3, [{ session_id: 'a', qty: 2 }, { session_id: 'b', qty: 1 }]);
  ok(sp[0].session_id === 'a' && sp[0].qty === 2 && sp[1].qty === 1, 'split: follows the default shares');
  sp = C.split(4.5, [{ session_id: 'a', qty: 2 }, { session_id: 'b', qty: 1 }]);
  ok(sum(sp) === 4.5 && sp[0].qty === 3 && sp[1].qty === 1.5, 'split: edited total keeps the proportions');
  sp = C.split(0.01, [{ session_id: 'a', qty: 1 }, { session_id: 'b', qty: 1 }]);
  ok(sp.length === 1 && sp[0].qty === 0.01, 'split: no zero lines');
  sp = C.split(2, []);
  ok(sp.length === 1 && sp[0].session_id === null && sp[0].qty === 2, 'split: no session ⇒ one unlinked line');
  ok(C.split(0, [{ session_id: 'a', qty: 1 }]).length === 0 && C.split(-1, []).length === 0, 'split: nothing for zero/negative');
  for (let t = 1; t <= 60; t++) { const s2 = C.split(t / 7, [{ session_id: 'a', qty: 1 }, { session_id: 'b', qty: 3 }, { session_id: 'c', qty: 2 }]); if (sum(s2) !== Math.round(t / 7 * 100) / 100) { ok(false, 'split: exact total for ' + t / 7); break; } }
  ok(true, 'split: exact totals across 60 fractions');
  const bl = C.buildLines([{ item_id: 'i1', qty: 2, contribs: [{ session_id: 's1', qty: 1 }, { session_id: 's2', qty: 1 }] }, { item_id: 'i2', qty: 1, contribs: [] }]);
  ok(bl.length === 3 && bl[0].item_id === 'i1' && bl[0].session_id === 's1' && bl[2].session_id === null, 'buildLines: one line per item × session');
  const names = { i1: 'بنج', i2: 'كفوف' };
  ok(/^تم خصم 2 مادة/.test(C.message({ ok: true, lines: [{ item_id: 'i1', requested: 1, deducted: 1 }, { item_id: 'i1', requested: 1, deducted: 1 }, { item_id: 'i2', requested: 1, deducted: 1 }] }, names)), 'message: lines of one item counted once');
  const part = C.message({ ok: true, lines: [{ item_id: 'i1', requested: 5, deducted: 2 }, { item_id: 'i2', requested: 1, deducted: 1 }] }, names);
  ok(/^⚠️/.test(part) && /«بنج»: انخصم 2 من 5/.test(part) && /تم خصم 1 مادة/.test(part), 'message: the partial number is announced by name (#689)');
  ok(/«كفوف» محذوف/.test(C.message({ ok: true, lines: [{ item_id: 'i2', requested: 1, deducted: 0, skipped: 'inactive' }] }, names)), 'message: deleted item named');
  ok(/وضع القراءة/.test(C.message({ ok: false, error: { message: 'read_only' } })), 'message: read-only explained');
  ok(/ما انخصم شي/.test(C.message({ ok: false, error: { message: 'x' } })), 'message: failure says nothing was deducted (all or nothing)');
  const log0 = [];
  const r0 = await C.run(makeSb({}, log0, () => ({ data: null, error: { message: 'read_only' } })), [{ item_id: 'i', qty: 1, session_id: null }], 'n');
  ok(!r0.ok && log0.length === 1 && log0[0].rpc === 'inventory_consume' && log0[0].args.p_note === 'n', 'run: one RPC call, error surfaced');

  /* (٣) النافذتان بعميلٍ مصطنع */
  const PP = F['patient-profile.html'], AP = F['appointments.html'];
  const ppSrc = fnSrc(PP, 'async function maybePromptMaterialDeduction(') + fnSrc(PP, 'async function confirmMaterialDeduction() {');
  {
    const log = [], toasts = [];
    const dom = makeDom([6]);   // الطبيب عدّل 4 ⇒ 6
    const ctx = {
      window: {}, document: dom.document, console, currentUser: { id: 'u' },
      getTreatment: () => ({ dbId: 'T' }), escapeHtml: s => String(s), openModal() {}, closeModal() {}, showToast: t => toasts.push(t)
    };
    vm.createContext(ctx);
    vm.runInContext(F['inv-consume.js'], ctx);
    ctx.window.sb = makeSb({ treatment_materials: [{ owner_id: 'u', treatment_id: 'T', item_id: 'I', qty_per_use: 2 }], inventory_items: [{ id: 'I', owner_id: 'u', name: 'بنج', unit: 'أمبولة', quantity: 9, is_active: true }] }, log, echoReply);
    try {
      vm.runInContext(ppSrc + '\nthis.__m = maybePromptMaterialDeduction; this.__c = confirmMaterialDeduction;', ctx);
      await ctx.__m('k', 'حشوة', 2, ['s1', 's2']);
      await ctx.__c();
    } catch (e) { ok(false, 'profile window throws: ' + e.message); }
    const rpc = log.filter(x => x.rpc);
    const lines = rpc.length ? rpc[0].args.p_lines : [];
    ok(rpc.length === 1 && !log.some(x => x.write), 'profile: one RPC, zero direct writes');
    ok(lines.length === 2 && lines[0].session_id === 's1' && lines[1].session_id === 's2' && near(lines[0].qty + lines[1].qty, 6), 'profile: the edited 6 split over both tooth sessions');
    ok(rpc.length && rpc[0].args.p_note === 'استهلاك تلقائي (جلسة)', 'profile: note kept');
    ok(/^تم خصم 1 مادة/.test(toasts[toasts.length - 1] || ''), 'profile: toast from the result');
  }
  {
    const log = [], toasts = [];
    const dom = makeDom([3, 2]);
    const ctx = { window: {}, document: dom.document, console, currentUser: { id: 'u' }, escapeHtml: s => String(s), showToast: t => toasts.push(t) };
    vm.createContext(ctx);
    vm.runInContext(F['inv-consume.js'], ctx);
    ctx.window.sb = makeSb({
      treatments: [{ id: 'TA', doctor_id: 'u', name: 'حشوة', label: 'حشوة' }, { id: 'TB', doctor_id: 'u', name: 'قلع', label: 'قلع جراحي' }],
      treatment_materials: [{ owner_id: 'u', treatment_id: 'TA', item_id: 'I1', qty_per_use: 1 }, { owner_id: 'u', treatment_id: 'TB', item_id: 'I1', qty_per_use: 2 }, { owner_id: 'u', treatment_id: 'TB', item_id: 'I2', qty_per_use: 1 }],
      inventory_items: [{ id: 'I1', owner_id: 'u', name: 'بنج', quantity: 50, is_active: true }, { id: 'I2', owner_id: 'u', name: 'خيط', quantity: 5, is_active: true }]
    }, log, echoReply);
    const src = fnSrc(AP, 'async function apptPromptMaterialDeductionBulk(') + fnSrc(AP, 'function closeApptMatDeductModal() {') + fnSrc(AP, 'async function apptConfirmMaterialDeduction() {');
    try {
      vm.runInContext(src + '\nthis.__p = apptPromptMaterialDeductionBulk; this.__c = apptConfirmMaterialDeduction; this.__l = function(){ return _apptMatDeductList; };', ctx);
      await ctx.__p([{ id: 'sA', type: 'حشوة' }, { id: 'sB', type: 'قلع جراحي' }, { id: 'sC', type: 'غير معروف' }]);
      const L = ctx.__l();
      ok(L.length === 2 && L[0].item_id === 'I1' && L[0].qty === 3 && L[1].qty === 1, 'appointments: default totals per item (1 + 2 · 1)');
      await ctx.__c();
    } catch (e) { ok(false, 'appointments window throws: ' + e.message); }
    const rpc = log.filter(x => x.rpc);
    const lines = rpc.length ? rpc[0].args.p_lines : [];
    const i1 = lines.filter(l => l.item_id === 'I1');
    ok(rpc.length === 1 && !log.some(x => x.write), 'appointments: one RPC, zero direct writes');
    ok(i1.length === 2 && i1.find(l => l.session_id === 'sA').qty === 1 && i1.find(l => l.session_id === 'sB').qty === 2, 'appointments: each session keeps its own share');
    ok(lines.filter(l => l.item_id === 'I2').length === 1 && lines.find(l => l.item_id === 'I2').session_id === 'sB', 'appointments: an item only goes to the sessions that use it');
  }

  /* (٤) الربط */
  ok(PP.indexOf("maybePromptMaterialDeduction(_mdTr.id, sess.type, 1, [sess.id])") > -1, 'profile path 1 (complete planned) passes the session');
  ok(PP.indexOf("maybePromptMaterialDeduction(typeVal, type, 1, newSess ? [newSess.id] : [])") > -1, 'profile path 2 (session form) passes the session');
  ok(PP.indexOf("maybePromptMaterialDeduction(_pd.k, _pd.l, _pd.m, _pd.s)") > -1, 'deferred lab path carries the sessions');
  ok(F['pp-clinical.js'].indexOf("m: 1, s: newSess ? [newSess.id] : [] }") > -1, 'tooth + lab path stores the session');
  const PD = F['pp-dental.js'];
  ok(/_bCreated\+\+;\n\s+_bSessIds\.push\(_bl\.data\.id\);/.test(PD) && PD.indexOf('m: _bCreated, s: _bSessIds }') > -1 && PD.indexOf('maybePromptMaterialDeduction(pendingToothStatus, pendingToothLabel, _bCreated, _bSessIds)') > -1, 'batch teeth path passes every created session');
  ok(PD.indexOf('maybePromptMaterialDeduction(pendingToothStatus, pendingToothLabel, 1, newSess ? [newSess.id] : [])') > -1, 'single tooth path passes the session');
  ['patient-profile.html', 'appointments.html'].forEach(f => ok(!/from\('inventory_movements'\)\.insert/.test(F[f]) && !/from\('inventory_items'\)\s*\.update/.test(F[f]), f + ': no direct stock write left'));
  const INV = F['inventory.html'];
  const sm = fnSrc(INV, 'async function saveMovement() {');
  ok(/if \(reason === 'consume'\) \{[\s\S]*?SyDentInvConsume\.run\(window\.sb, \[\{ item_id: moveItemId, qty: q, session_id: null \}\]/.test(sm) && sm.indexOf("reason === 'consume'") < sm.indexOf("from('inventory_items')"), 'inventory: manual consume through the RPC, before any direct write');
  ok(/window\.sb\.rpc\('inventory_finish_batch', \{ p_batch: batchId \}\)/.test(INV) && !/update\(\{ is_finished: true \}\)/.test(INV), 'inventory: finishing a batch through the RPC');
  ok(/escapeHtml\(batchQtyText\(b, un\)\)/.test(INV) && /' من ' \+ fmtNum\(rc\)/.test(INV), 'inventory: remaining of received shown');
  ok(/patient:patients\(name\), batch:inventory_batches\(expiry_date\)/.test(INV) && /if \(res\.error\) res = await histQ\('change, reason, note, created_at'\)/.test(INV), 'history: patient and batch, plain read as fallback');
  ok(/<bdi dir="ltr">' \+ chTxt \+ '<\/bdi>/.test(INV), 'history: signed change isolated LTR (#704)');
  ok(/escapeHtml\(m\.patient\.name\)/.test(INV) && /encodeURIComponent\(m\.patient_id\)/.test(INV), 'history: patient name escaped, link encoded');
  ['patient-profile.html', 'appointments.html', 'inventory.html'].forEach(f => {
    const S = F[f], iS = S.indexOf('<script src="sidebar.js?v='), iC = S.indexOf('<script src="inv-consume.js?v=');
    ok(iC > iS && (S.match(/inv-consume\.js\?v=/g) || []).length === 1, f + ': inv-consume.js loaded once after sidebar.js');
  });
  ok((F['scripts/cache-bust.sh'].match(/inv-consume/g) || []).length === 3, 'cache-bust: inv-consume.js in the fleet allow-list');
}

const FILES = ['migrations/169_inventory_atomic_consume.sql', 'db/schema.sql', 'inv-consume.js', 'patient-profile.html', 'appointments.html', 'inventory.html', 'pp-clinical.js', 'pp-dental.js', 'scripts/cache-bust.sh'];
const base = {}; FILES.forEach(f => { base[f] = read(f); });
const rep = (f, a, b) => F => Object.assign({}, F, { [f]: F[f].replace(a, b) });
const MIG = 'migrations/169_inventory_atomic_consume.sql';
const MUTANTS = [
  ['session guard dropped', rep(MIG, "RAISE EXCEPTION 'movement_session_not_owned'", "RAISE NOTICE 'movement_session_not_owned'")],
  ['batch of another item accepted', rep(MIG, 'AND b.owner_id = NEW.owner_id AND b.item_id = NEW.item_id', 'AND b.owner_id = NEW.owner_id')],
  ['expired consumed first', rep(MIG, 'AND (x.expiry_date IS NULL OR x.expiry_date >= p_today)', 'AND true')],
  ['item not locked', rep(MIG, 'i.owner_id = v_uid FOR UPDATE', 'i.owner_id = v_uid')],
  ['patient trusted from the client', rep(MIG, 'r.session_id, v_pat, v_prov, s.batch_id', "r.session_id, (e->>'patient_id')::uuid, v_prov, s.batch_id")],
  ['no clamp to stock', rep(MIG, 'v_take := least(r.qty, greatest(v_q, 0));', 'v_take := r.qty;')],
  ['read-only allowed', rep(MIG, "IF public.my_access_level() <> 'full' THEN RAISE EXCEPTION 'read_only' USING ERRCODE = '42501'; END IF;\n  IF p_lines", 'IF p_lines')],
  ['batch beyond stock allowed', rep(MIG, "RAISE EXCEPTION 'batch_exceeds_stock'", "RAISE NOTICE 'batch_exceeds_stock'")],
  ['old clients do not trim', rep(MIG, 'AFTER UPDATE OF quantity ON public.inventory_items', 'AFTER UPDATE OF is_active ON public.inventory_items')],
  ['split loses the remainder', rep('inv-consume.js', '.slice(0, Math.max(0, left)).forEach(function (p) { p.n++; });', '.slice(0, 0).forEach(function (p) { p.n++; });')],
  ['partial deduction reported as success', rep('inv-consume.js', 'if (it.deducted + 1e-9 < it.requested) {', 'if (false) {')],
  ['profile ignores the sessions', rep('patient-profile.html', 'contribs: _matSess.map(function(sid){ return { session_id: sid, qty: per }; })', 'contribs: []')],
  ['appointments lumps all sessions together', rep('appointments.html', ".push({ session_id: s.id || null, qty: Number(m.qty_per_use) || 1 });", ".push({ session_id: null, qty: Number(m.qty_per_use) || 1 });")],
  ['batch path loses its sessions', rep('pp-dental.js', '        _bSessIds.push(_bl.data.id);\n', '')],
  ['manual consume back to read-then-write', rep('inventory.html', "    if (reason === 'consume') {\n      var names = {};", "    if (false) {\n      var names = {};")],
  ['signed change not isolated', rep('inventory.html', '<bdi dir="ltr">\' + chTxt + \'</bdi>', '\' + chTxt + \'')],
  ['patient name unescaped in history', rep('inventory.html', 'escapeHtml(m.patient.name)', 'm.patient.name')]
];
(async () => {
  await suite(base);
  const bp = pass, bf = fail;
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
    pass = bp; fail = bf;
    const all = bit === MUTANTS.length;
    console.log((fail === 0 && all ? '✅' : '❌') + ' prove-inv-consume: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
    process.exit(fail === 0 && all ? 0 : 1);
  }
  console.log((fail === 0 ? '✅' : '❌') + ' prove-inv-consume: ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})();

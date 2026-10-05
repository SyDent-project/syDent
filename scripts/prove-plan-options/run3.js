const X = require('./sc.js'), h = require('./h.js'), S = require('./s0.js'), E = require('./extract.js');
const fs = require('fs'); const T = X.T;
const rows = (b, n) => b.db.T.teeth_status.filter(r => String(r.tooth_num) === String(n)).map(r => r.surface + '=' + r.treatment_key + ':' + r.status + (r.unit_id ? '@' + r.unit_id : '')).sort().join(' ');
const count = (s, re) => (s.match(re) || []).length;
(async () => {
  // ── K: tooltips — the drawn bridge appears exactly once, carrying its option ──
  { const b = await X.buildFull();
    for (const n of [43, 45]) { const t = X.tipOf(b, n);
      T(`K: ${n} وجهي — «دعامة جسر: جسر» مرة واحدة بشارة خيار ب، والبديل بخيار أ`, /دعامة جسر: جسر مخطط خيار ب/.test(t.facial) && !/الجسر المرسوم/.test(t.facial) && /جسر بديل: جسر \(زركون\) مخطط خيار أ/.test(t.facial), t.facial);
      T(`K: ${n} إطباقي — نفس المحتوى`, /دعامة جسر: جسر مخطط خيار ب/.test(t.occ) && !/الجسر المرسوم/.test(t.occ) && /جسر بديل: جسر \(زركون\) مخطط خيار أ/.test(t.occ), t.occ); }
    const t44 = X.tipOf(b, 44);
    T('K: 44 وهمي — «سن وهمي (جسر): جسر [ب]» + البديل [أ] + الزرعة [ج]', /سن وهمي \(جسر\): جسر مخطط خيار ب/.test(t44.facial) && !/الجسر المرسوم/.test(t44.facial) && /جسر \(زركون\) مخطط خيار أ/.test(t44.facial) && /زراعة مخطط خيار ج/.test(t44.facial), t44.facial);
    const t43 = X.tipOf(b, 43);
    T('K: 43 — تاج الخيار ج صفٌّ مستقل', /التاج كامل: تاج زركون مخطط خيار ج/.test(t43.facial), t43.facial);
    // after adopting ب: no badges, still one row for the bridge
    await b.run('adoptPlanOption(2)'); const a43 = X.tipOf(b, 43), a44 = X.tipOf(b, 44);
    T('K: بعد اعتماد ب — لا شارات ولا تكرار', !/خيار/.test(a43.facial + a43.occ + a44.facial + a44.occ) && count(a43.facial, /جسر مخطط/g) === 1 && /دعامة جسر: جسر مخطط/.test(a43.facial), a43.facial + ' || ' + a44.facial); }

  // ── L: alternative saves announce the option they got ──
  { const b = await h.bootAsync(); S.seed(b);
    await X.modalSave(b, 44, 'WHOLE', 'c_zr', 'جسر (زركون)', null, 25000, 'SYP', true);
    T('L: توست الجسر البديل يذكر الخيار والوحدة', b.toasts.some(t => /كـ«الخيار ب» — بديلٌ للجسر 43، 44، 45/.test(t)), b.toasts.join(' | '));
    await X.modalSave(b, 44, 'WHOLE', 'implant', 'زراعة', null, 350, 'USD', true);
    T('L: توست الزرعة البديلة يذكر الخيار', b.toasts.some(t => /كـ«الخيار ج» — زرعةٌ بديلة للجسر مكان السن 44/.test(t)), b.toasts.join(' | '));
    T('L: الزرعة محفوظة بالدولار', b.db.T.ledger_sessions.some(r => r.type === 'زراعة' && r.currency === 'USD' && r.cost === 350));
    X.invariants(b, 'L'); }

  // ── M: alt mode never leaks — reopening the modal and the non-modal callers reset it ──
  { const b = await h.bootAsync(); S.seed(b);
    await b.run(`openToothModal(44, 'WHOLE')`); b.run('openAltBridgePicker(44)');
    T('M: وضع البديل فعّال بعد فتح المنتقي', !!b.run('_altBridge'));
    await b.run(`openToothModal(45, 'WHOLE')`);
    T('M: فتح المودال من جديد يصفّره', b.run('_altBridge') === null);
    const pm = fs.readFileSync(require('path').resolve(__dirname, '../..') + '/pp-modules.js', 'utf8'), pc = fs.readFileSync(require('path').resolve(__dirname, '../..') + '/pp-clinical.js', 'utf8');
    const iR = pm.indexOf("if (typeof _altBridge !== 'undefined') _altBridge = null;"), iC = pm.indexOf('var sp = await persistSpecialTreatment();');
    T('M: مسار الفحص يصفّر الوضع قبل الحفظ الخاص', iR > 0 && iR < iC && iC - iR < 200);
    const jR = pc.indexOf("if (typeof _altBridge !== 'undefined' && _altBridge)"), jC = pc.indexOf('var _sp = await persistSpecialTreatment();');
    T('M: مسار المخبر يرفض بوضع البديل قبل الحفظ الخاص', jR > 0 && jR < jC); }

  // ── N: appointments page mirror flips unit rows on completion ──
  { const b = await X.buildFull(); await b.run('adoptPlanOption(1)');
    const A = E.scan(require('path').resolve(__dirname, '../..') + '/appointments.html');
    for (const n of ['_apptSessionTreatmentKey', '_apptSyncUnitRowsOnComplete', '_apptSyncToothStatusOnComplete']) b.run(A[n], 'appt:' + n);
    const zb = b.db.T.ledger_sessions.find(r => r.type === 'جسر (زركون)');
    await b.run(`_apptSyncToothStatusOnComplete(${JSON.stringify({ ...zb, status: 'completed' })}, 'PR9')`);
    T('N: المواعيد — صفوف الوحدة صارت منجزة', rows(b, 43) === 'WHOLE=c_zr:completed@U1' && rows(b, 44) === 'PONTIC=c_zr:completed@U1 WHOLE=extracted:completed' && rows(b, 45) === 'WHOLE=c_zr:completed@U1', rows(b, 43) + ' || ' + rows(b, 44));
    T('N: المواعيد — مقدّم الخدمة المُوحَّد كُتب على صفوف الوحدة', b.db.T.teeth_status.filter(r => r.unit_id === 'U1').every(r => r.provider_id === 'PR9'));
    T('N: المواعيد — القلع المنجز لم يُمَسّ', b.db.T.teeth_status.some(r => r.tooth_num === '44' && r.surface === 'WHOLE' && r.treatment_key === 'extracted' && r.status === 'completed' && r.provider_id == null)); }

  // ── O: safety — legacy bridge rows without unit_id, or another key drawn ⇒ zero touch ──
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.forEach(r => { r.unit_id = null; }); S.load(b);
    const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`completeSessionFromProfile('br')`);
    T('O: جسر قديم بلا unit_id ⇒ الجلسة منجزة والمخطط بلا مساس', JSON.stringify(b.db.T.teeth_status) === before && b.db.T.ledger_sessions.find(r => r.id === 'br').status === 'completed');
    X.invariants(b, 'O'); }
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.ledger_sessions.push({ id: 'zz', doctor_id: 'D1', patient_id: 'P1', type: 'جسر (زركون)', treatment_key: 'c_zr', cost: 1, tooth_num: '43,44,45', surface: 'WHOLE', status: 'planned', currency: 'SYP', created_at: '2026-09-19T12:00:00Z', date: '2026-09-19' });
    S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`completeSessionFromProfile('zz')`);
    T('O: إنجاز جسرٍ غير المرسوم (بلا خيارات) ⇒ المخطط بلا مساس', JSON.stringify(b.db.T.teeth_status) === before);
    X.invariants(b, 'O2'); }

  // ── P: plain bridge, no options at all — completion now flips it (the pre-existing gap) ──
  { const b = await h.bootAsync(); S.seed(b);
    await b.run(`completeSessionFromProfile('br')`);
    T('P: جسر عادي بلا خيارات — إنجازه يقلب صفوفه', rows(b, 43) === 'WHOLE=bridge:completed@U1' && rows(b, 44) === 'PONTIC=bridge:completed@U1 WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    T('P: لا حوار خطر بلا بدائل', true);
    X.invariants(b, 'P'); }

  // ── Q: adopt when nothing is dropped (only tags cleared) is not styled destructive ──
  { const b = await h.bootAsync(); S.seed(b);
    await b.run(`setSessionOption('zr36', 1)`); b.dialogs.length = 0;
    await b.run('adoptPlanOption(1)');
    T('Q: اعتمادٌ لا يحذف شيئاً ⇒ حوار عادي', b.dialogs.length === 1 && b.dialogs[0].danger === false);
    T('Q: الوسم فُرّغ', b.db.T.ledger_sessions.find(r => r.id === 'zr36').plan_option == null);
    X.invariants(b, 'Q'); }

  console.log(`\n${X.OK} نجح · ${X.BAD} فشل`); if (X.BAD) { console.log('FAILS:\n - ' + X.fails.join('\n - ')); process.exitCode = 1; }
})().catch(e => console.log('FATAL', e.stack));

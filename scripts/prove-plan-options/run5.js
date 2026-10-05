/* v467 (M145-l) — زر «إزالة الجسر» يسأل عن جلسة الجسر المخطّطة */
const X = require('./sc.js'), h = require('./h.js'), S = require('./s0.js');
const T = X.T;
const rows = (b, n) => b.db.T.teeth_status.filter(r => String(r.tooth_num) === String(n)).map(r => r.surface + '=' + r.treatment_key + ':' + r.status + (r.unit_id ? '@' + r.unit_id : '')).sort().join(' ');
const bridgesPlanned = b => b.db.T.ledger_sessions.filter(r => r.status === 'planned' && String(r.tooth_num).includes(',')).map(r => r.type).sort().join(',');
(async () => {
  // U1: plain planned bridge → remove drawing → «احذفها»
  { const b = await h.bootAsync(); S.seed(b); b.ctx._answers = [true, true]; b.dialogs.length = 0;
    await b.run('undoExtraction(44)');
    T('U1: سؤالان (الإزالة ثم الجلسة)', b.dialogs.length === 2, 'dialogs=' + b.dialogs.length);
    const q = b.dialogs[1] || {};
    T('U1: السؤال الثاني صريح بأزراره ونمط الخطر', q.confirmText === 'احذفها' && q.cancelText === 'أبقِها' && q.danger === true && /جلسته المخطّطة/.test(q.message) && /جسر — 10,000 ل\.س/.test(q.message), JSON.stringify(q).slice(0, 200));
    T('U1: الرسم أُزيل والقلع باقٍ', rows(b, 43) === '' && rows(b, 45) === '' && rows(b, 44) === 'WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    T('U1: الجلسة حُذفت', bridgesPlanned(b) === '', bridgesPlanned(b));
    T('U1: التوست يذكر حذف الجلسة', b.toasts.some(t => /تمت إزالة الجسر وحذف جلسته المخطّطة/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'U1'); }
  // U2: «أبقِها» → previous behaviour exactly (drawing gone, session kept)
  { const b = await h.bootAsync(); S.seed(b); b.ctx._answers = [true, false];
    await b.run('undoExtraction(44)');
    T('U2: «أبقِها» ⇒ الجلسة باقية والرسم أُزيل', bridgesPlanned(b) === 'جسر' && rows(b, 43) === '', bridgesPlanned(b) + ' || ' + rows(b, 43));
    T('U2: التوست بلا «حذف جلسته»', b.toasts.some(t => /^✅ تمت إزالة الجسر$/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'U2'); }
  // U3: first confirmation cancelled → nothing at all, no second question
  { const b = await h.bootAsync(); S.seed(b); b.ctx._answers = [false]; b.dialogs.length = 0;
    const before = JSON.stringify(b.db.T);
    await b.run('undoExtraction(44)');
    T('U3: إلغاء الإزالة ⇒ صفر تغيير وبلا سؤال ثانٍ', JSON.stringify(b.db.T) === before && b.dialogs.length === 1); }
  // U4: completed bridge → no question (deleting a completed session is a financial decision, not asked here)
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.filter(r => r.unit_id === 'U1').forEach(r => { r.status = 'completed'; });
    b.db.T.ledger_sessions.find(r => r.id === 'br').status = 'completed'; S.load(b);
    b.ctx._answers = [true]; b.dialogs.length = 0;
    await b.run('undoExtraction(44)');
    T('U4: جسرٌ منجز ⇒ لا سؤال عن الجلسة والجلسة المنجزة باقية', b.dialogs.length === 1 && b.db.T.ledger_sessions.find(r => r.id === 'br').status === 'completed');
    X.invariants(b, 'U4'); }
  // U5: with plan options — both bridge options listed with their letters; the implant option stays
  { const b = await X.buildFull(); b.ctx._answers = [true, true]; b.dialogs.length = 0;
    await b.run('undoExtraction(44)');
    const q = b.dialogs[1] || {};
    T('U5: السؤال يسرد الجسرين بخياريهما', /جلساته المخطّطة \(2\)/.test(q.message || '') && /\[خيار أ\]/.test(q.message || '') && /\[خيار ب\]/.test(q.message || ''), (q.message || '').slice(0, 250));
    T('U5: الجسران حُذفا والزرعة (ج) باقية', bridgesPlanned(b) === '' && b.db.T.ledger_sessions.some(r => r.type === 'زراعة' && r.status === 'planned'), bridgesPlanned(b));
    T('U5: 43 يبقى عليه تاج ج فقط', rows(b, 43) === 'CROWN_FULL=czr:planned', rows(b, 43));
    T('U5 (v468): الزرعة البديلة رُسمت مكان الجسر — كمسار الجدول تماماً', rows(b, 44) === 'WHOLE=implant:planned', rows(b, 44));
    T('U5 (v468): التوست يذكرها', b.toasts.some(t => /الزرعةُ البديلة رُسمت مكانه/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'U5'); }
  // U8 (v468): «احذفها» but the delete fails → the toast must not claim success
  { const b = await h.bootAsync(); S.seed(b); b.ctx._answers = [true, true];
    const realFrom = b.ctx.sb.from;
    b.ctx.sb.from = t => { const q = realFrom(t); if (t !== 'ledger_sessions') return q; const d = q.delete; q.delete = () => { d.call(q); return { eq: () => ({ eq: async () => ({ error: { message: 'FK restrict' } }) }) }; }; return q; };
    await b.run('undoExtraction(44)');
    const last = b.toasts[b.toasts.length - 1] || '';
    T('U8: فشلُ حذف الجلسة ⇒ التوست الأخير تحذيرٌ صادق', /^⚠️ تمت إزالة الجسر — لكن تعذّر حذف الجلسة$/.test(last), b.toasts.join(' | '));
    T('U8: الجلسة ما زالت بالقاعدة', b.db.T.ledger_sessions.some(r => r.id === 'br'));
    b.ctx.sb.from = realFrom; }
  // U9 (v468): «أبقِها» with an implant alternative → the implant stays ledger-only (the bridge plan still exists)
  { const b = await X.buildFull(); b.ctx._answers = [true, false];
    await b.run('undoExtraction(44)');
    T('U9: «أبقِها» ⇒ الزرعة لا تُرسم وجلسات الجسر باقية', rows(b, 44) === 'WHOLE=extracted:completed' && bridgesPlanned(b) === 'جسر,جسر (زركون)', rows(b, 44) + ' || ' + bridgesPlanned(b));
    X.invariants(b, 'U9'); }
  // U10 (v468): both removal paths end in the same chart
  { const a = await X.buildFull(); a.ctx._answers = [true, true]; await a.run('undoExtraction(44)');
    const c = await X.buildFull();
    for (const id of c.db.T.ledger_sessions.filter(r => r.status === 'planned' && String(r.tooth_num).includes(',')).map(r => r.id)) await c.run(`delSession('${id}')`);
    const same = [36, 43, 44, 45].every(n => rows(a, n) === rows(c, n));
    T('U10: الزر + «احذفها» ≡ حذفُ الجسور من الجدول (نفس المخطط)', same, [36, 43, 44, 45].map(n => n + ':' + rows(a, n) + ' vs ' + rows(c, n)).join(' ; ')); }
  // U6: legacy bridge rows (no unit_id) — the question still works through the legacy unit
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.forEach(r => { r.unit_id = null; }); S.load(b);
    b.ctx._answers = [true, true];
    await b.run('undoExtraction(44)');
    T('U6: جسرٌ قديم بلا معرّف ⇒ الرسم أُزيل والجلسة حُذفت', rows(b, 43) === '' && rows(b, 45) === '' && bridgesPlanned(b) === '', rows(b, 43) + ' || ' + bridgesPlanned(b));
    X.invariants(b, 'U6'); }
  // U7: a planned bridge session on OTHER teeth is never offered
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.ledger_sessions.push({ id: 'far', doctor_id: 'D1', patient_id: 'P1', type: 'جسر', treatment_key: 'bridge', cost: 7, tooth_num: '13,14,15', surface: 'WHOLE', status: 'planned', plan_option: null, currency: 'SYP', created_at: '2026-09-19T13:00:00Z', date: '2026-09-19' });
    S.load(b); b.ctx._answers = [true, true]; b.dialogs.length = 0;
    await b.run('undoExtraction(44)');
    T('U7: جسرٌ على أسنانٍ أخرى لا يُعرض ولا يُحذف', !/7 ل\.س/.test((b.dialogs[1] || {}).message || '') && b.db.T.ledger_sessions.some(r => r.id === 'far'));
    X.invariants(b, 'U7', { skipI4: true }); }
  console.log(`\n${X.OK} نجح · ${X.BAD} فشل`); if (X.BAD) { console.log('FAILS:\n - ' + X.fails.join('\n - ')); process.exitCode = 1; }
})().catch(e => { console.log('FATAL', e.stack); process.exitCode = 1; });

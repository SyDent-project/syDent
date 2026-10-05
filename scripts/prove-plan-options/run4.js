/* v464 — الإنجاز من صفحة المواعيد/اللوحة (تسليم ?dismiss=) ثم الاعتماد من ملف المريض */
const X = require('./sc.js'), h = require('./h.js'), S = require('./s0.js'), E = require('./extract.js');
const REPO = require('path').resolve(__dirname, '../..') + '/';
const T = X.T;
const rows = (b, n) => b.db.T.teeth_status.filter(r => String(r.tooth_num) === String(n)).map(r => r.surface + '=' + r.treatment_key + ':' + r.status + (r.unit_id ? '@' + r.unit_id : '')).sort().join(' ');
const ls = b => b.db.T.ledger_sessions.filter(r => r.status === 'planned').map(r => r.type + '#' + r.tooth_num + (r.plan_option ? '/' + r.plan_option : '')).sort().join(' | ');
const A = E.scan(REPO + 'appointments.html');
/* completeApptWithProcedures' per-session core, verbatim order: flip the ledger row, then the page's own chart sync */
async function apptComplete(b, ids) {
  for (const n of ['_apptSessionTreatmentKey', '_apptSyncUnitRowsOnComplete', '_apptSyncToothStatusOnComplete']) if (!b.ctx[n]) b.run(A[n], 'appt:' + n);
  for (const id of ids) {
    const s = b.db.T.ledger_sessions.find(r => r.id === id);
    const u = b.db.T.ledger_sessions.find(r => r.id === id); u.status = 'completed';
    await b.run(`_apptSyncToothStatusOnComplete(${JSON.stringify({ ...s, status: 'completed' })}, null)`);
  }
  S.load(b);   // the doctor opens the profile afterwards → fresh load from the DB
}
const idOf = (b, type, tn) => b.db.T.ledger_sessions.find(r => r.type === type && (!tn || String(r.tooth_num) === String(tn))).id;
const bar = b => b.run('planOptionsBarHtml()').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  // R1: PFM 36 (ب, drawn) completed from the appointments page
  { const b = await X.buildFull(); await apptComplete(b, [idOf(b, 'تاج خزف على معدن', 36)]);
    T('R1: المواعيد تقلب تاج 36 المرسوم', rows(b, 36) === 'CROWN_FULL=crown:completed WHOLE=extracted:planned', rows(b, 36));
    X.invariants(b, 'R1-قبل');
    T('R1: ملف المريض يعرض «اعتمادٌ معلّق» للخيار ب بزرّه', /أُنجز بندٌ من «الخيار ب»/.test(bar(b)) && /adoptPlanOption\(2\)/.test(b.run('planOptionsBarHtml()')), bar(b));
    await b.run('adoptPlanOption(2)');
    T('R1: الاعتماد — الباقي جسر ب فقط', ls(b) === 'جسر#43,44,45', ls(b));
    T('R1: 36 تاج منجز فقط · الوحدة جسر مخطّط', rows(b, 36) === 'CROWN_FULL=crown:completed' && rows(b, 43) === 'WHOLE=bridge:planned@U1', rows(b, 36) + ' || ' + rows(b, 43));
    T('R1: لا وسوم باقية (ولا على المنجز)', !b.db.T.ledger_sessions.some(r => r.plan_option != null));
    T('R1: الشريط اختفى', b.run('planOptionsBarHtml()') === '');
    X.invariants(b, 'R1'); }

  // R2: zirconia bridge (أ, NOT drawn) completed from the appointments page
  { const b = await X.buildFull(); await apptComplete(b, [idOf(b, 'جسر (زركون)')]);
    T('R2: المواعيد لا تمسّ الوحدة (المرسوم جسرٌ آخر)', rows(b, 43) === 'CROWN_FULL=czr:planned WHOLE=bridge:planned@U1', rows(b, 43));
    await b.run('adoptPlanOption(1)');
    T('R2: بعد الاعتماد — الوحدة = جسر زركون **منجز**', rows(b, 43) === 'WHOLE=c_zr:completed@U1' && rows(b, 45) === 'WHOLE=c_zr:completed@U1' && rows(b, 44) === 'PONTIC=c_zr:completed@U1 WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    T('R2: 36 = تاج زركون مخطّط (خيار أ الباقي)', rows(b, 36) === 'CROWN_FULL=czr:planned', rows(b, 36));
    T('R2: الباقي = تاج زركون 36', ls(b) === 'تاج زركون#36', ls(b));
    X.invariants(b, 'R2'); }

  // R3: implant (ج) completed from the appointments page
  { const b = await X.buildFull(); await apptComplete(b, [idOf(b, 'زراعة', 44)]);
    T('R3: المواعيد لا تكتب فوق القلع', rows(b, 44) === 'PONTIC=bridge:planned@U1 WHOLE=extracted:completed', rows(b, 44));
    await b.run('adoptPlanOption(3)');
    T('R3: بعد الاعتماد — 44 = زرعة **منجزة** والجسر أُزيل', rows(b, 44) === 'WHOLE=implant:completed' && rows(b, 45) === '' && rows(b, 43) === 'CROWN_FULL=czr:planned', rows(b, 44) + ' || ' + rows(b, 43) + ' || ' + rows(b, 45));
    T('R3: الباقي = بنود ج المخطّطة', ls(b) === ['تاج زركون#43', 'قلع#36'].sort().join(' | '), ls(b));
    X.invariants(b, 'R3'); }

  // R4: items from two different options completed → no single adopt button, clear review message
  { const b = await X.buildFull(); await apptComplete(b, [idOf(b, 'تاج خزف على معدن', 36), idOf(b, 'جسر (زركون)')]);
    const t = bar(b);
    T('R4: رسالة «خياران مختلفان» بلا زر اعتماد واحد', /من خيارين مختلفين \(أ وب\)/.test(t) && !/اعتماد [أبج] ⚠|أُنجز بندٌ من «الخيار/.test(t), t);
    X.invariants(b, 'R4'); }

  // R5: the drawn bridge (ب) completed from the appointments page → rows already completed; adopt keeps them
  { const b = await X.buildFull(); await apptComplete(b, ['br']);
    T('R5: المواعيد تقلب صفوف الجسر المرسوم', rows(b, 43) === 'CROWN_FULL=czr:planned WHOLE=bridge:completed@U1', rows(b, 43));
    await b.run('adoptPlanOption(2)');
    T('R5: بعد الاعتماد — الجسر منجز كما هو والباقي تاج خزف ب', rows(b, 43) === 'WHOLE=bridge:completed@U1' && ls(b) === 'تاج خزف على معدن#36', rows(b, 43) + ' || ' + ls(b));
    X.invariants(b, 'R5'); }

  // R6: no options at all → appointments completion unchanged, no banner
  { const b = await h.bootAsync(); S.seed(b); await apptComplete(b, ['pfm36']);
    T('R6: بلا خيارات — لا شريط', b.run('planOptionsBarHtml()') === '');
    X.invariants(b, 'R6'); }

  // R8: an OLD completed bridge (no option tag) on the same teeth must not take the chart when the planned one is deleted
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.ledger_sessions.push({ id: 'old', doctor_id: 'D1', patient_id: 'P1', type: 'جسر (زركون)', treatment_key: 'c_zr', cost: 1, tooth_num: '43,44,45', surface: 'WHOLE', status: 'completed', plan_option: null, currency: 'SYP', created_at: '2020-01-01T00:00:00Z', date: '2020-01-01' });
    S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('R8: جسرٌ منجز قديم بلا وسم ⇒ حذفُ المخطّط لا يُعيد رسمه (صفر مساس كما قبل)', JSON.stringify(b.db.T.teeth_status) === before, rows(b, 43));
    X.invariants(b, 'R8', { skipI4: true }); }

  // R9: an OLD completed implant (no tag) on the still-extracted pontic tooth (failed, removed) must not be redrawn
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.ledger_sessions.push({ id: 'oldimp', doctor_id: 'D1', patient_id: 'P1', type: 'زراعة', treatment_key: 'implant', cost: 1, tooth_num: '44', surface: 'WHOLE', status: 'completed', plan_option: null, currency: 'SYP', created_at: '2021-01-01T00:00:00Z', date: '2021-01-01' });
    S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('R9: زرعةٌ منجزة قديمة بلا وسم ⇒ لا تُرسم؛ رسمُ الجسر المحذوف يُزال والقلع يبقى (v466)', rows(b, 44) === 'WHOLE=extracted:completed' && rows(b, 43) === '' && rows(b, 45) === '', rows(b, 44) + ' || ' + rows(b, 43));
    X.invariants(b, 'R9'); }

  // R10: adopting from the banner when no planned item of that option remains — the dialog says so plainly
  { const b = await X.buildFull(); await apptComplete(b, [idOf(b, 'زراعة', 44)]);
    const c43 = idOf(b, 'تاج زركون', 43), e36 = b.db.T.ledger_sessions.find(r => r.type === 'قلع' && r.tooth_num === '36').id;
    await apptComplete(b, [c43, e36]); b.dialogs.length = 0;
    await b.run('adoptPlanOption(3)');
    T('R10: رسالة الاعتماد بلا بنود مخطّطة من الخيار', b.dialogs[0] && /ما أُنجز من الخيار ج يبقى كما هو/.test(b.dialogs[0].message) && !/\(0\)/.test(b.dialogs[0].message), b.dialogs[0] && b.dialogs[0].message);
    T('R10: الخطة نظيفة بعدها', ls(b) === '' && !b.db.T.ledger_sessions.some(r => r.plan_option != null), ls(b));
    X.invariants(b, 'R10'); }

  // ── v466 (M145-k): deleting a planned bridge session with no alternative removes its drawing ──
  // K1: plain planned bridge, no options
  { const b = await h.bootAsync(); S.seed(b);
    await b.run(`delSession('br')`);
    T('K1: حذف الجسر من الجدول ⇒ رسمه يُزال', rows(b, 43) === '' && rows(b, 45) === '', rows(b, 43) + ' || ' + rows(b, 45));
    T('K1: السن الوهمي يبقى مقلوعاً (منجز)', rows(b, 44) === 'WHOLE=extracted:completed', rows(b, 44));
    T('K1: باقي المخطط لم يُمَس (36)', rows(b, 36) === 'CROWN_FULL=crown:planned', rows(b, 36));
    for (const n of [43, 44, 45]) { const t = X.tipOf(b, n); T(`K1: تلميح ${n} بلا جسر وبلا استثناء`, !t.threw && !/جسر/.test(t.facial + t.occ), t.facial + ' || ' + t.occ); }
    X.invariants(b, 'K1'); }
  // K2: planned extraction + planned bridge (the classic plan) — the planned extraction stays
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.find(r => r.tooth_num === '44' && r.surface === 'WHOLE').status = 'planned';
    b.db.T.ledger_sessions.find(r => r.id === 'x44').status = 'planned'; S.load(b);
    await b.run(`delSession('br')`);
    T('K2: القلع المخطّط يبقى والجسر يُزال', rows(b, 44) === 'WHOLE=extracted:planned' && rows(b, 43) === '' && rows(b, 45) === '', rows(b, 44) + ' || ' + rows(b, 43));
    X.invariants(b, 'K2'); }
  // K3: legacy rows without unit_id ⇒ zero touch (cannot prove which rows are this bridge)
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.forEach(r => { r.unit_id = null; }); S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('K3: جسرٌ قديم بلا unit_id ⇒ صفر مساس', JSON.stringify(b.db.T.teeth_status) === before);
    X.invariants(b, 'K3', { skipI4: true }); }
  // K4: two planned sessions describe the same drawn bridge ⇒ deleting one keeps the drawing
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.ledger_sessions.push({ id: 'br2', doctor_id: 'D1', patient_id: 'P1', type: 'جسر', treatment_key: 'bridge', cost: 1, tooth_num: '43,44,45', surface: 'WHOLE', status: 'planned', plan_option: null, currency: 'SYP', created_at: '2026-09-19T12:00:00Z', date: '2026-09-19' });
    S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('K4: جلسةٌ أخرى تصف الجسر نفسه ⇒ الرسم باقٍ', JSON.stringify(b.db.T.teeth_status) === before);
    X.invariants(b, 'K4'); }
  // K5: the drawn unit extends beyond the session's teeth ⇒ zero touch
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.push({ doctor_id: 'D1', patient_id: 'P1', tooth_num: '46', surface: 'WHOLE', treatment_key: 'bridge', status: 'planned', unit_id: 'U1', review_at: null, provider_id: null });
    S.load(b); const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('K5: الوحدة المرسومة أوسع من أسنان الجلسة ⇒ صفر مساس', JSON.stringify(b.db.T.teeth_status) === before);
    X.invariants(b, 'K5', { skipI4: true }); }
  // K6: another key drawn on the unit (the session is not what is drawn) ⇒ zero touch
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.filter(r => r.unit_id === 'U1').forEach(r => { r.treatment_key = 'c_zr'; }); S.load(b);
    const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('K6: المرسوم جسرٌ بمفتاحٍ آخر ⇒ صفر مساس', JSON.stringify(b.db.T.teeth_status) === before);
    X.invariants(b, 'K6', { skipI4: true }); }
  // K7: adopting an option that has no bridge removes the other option's bridge drawing
  { const b = await h.bootAsync(); S.seed(b);
    await b.run(`setSessionOption('zr36', 1)`); await b.run(`setSessionOption('br', 2)`); await b.run(`setSessionOption('pfm36', 2)`);
    await b.run('adoptPlanOption(1)');
    T('K7: اعتماد خيارٍ بلا جسر ⇒ رسم جسر الخيار الآخر يُزال', rows(b, 43) === '' && rows(b, 45) === '' && rows(b, 44) === 'WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    T('K7: 36 = تاج زركون مخطّط', rows(b, 36) === 'CROWN_FULL=czr:planned', rows(b, 36));
    X.invariants(b, 'K7'); }
  // K8: a completed bridge session deleted ⇒ out of scope, zero touch (the rows stand for a bridge in the mouth)
  { const b = await h.bootAsync(); S.seed(b);
    b.db.T.teeth_status.filter(r => r.unit_id === 'U1').forEach(r => { r.status = 'completed'; });
    b.db.T.ledger_sessions.find(r => r.id === 'br').status = 'completed'; S.load(b);
    const before = JSON.stringify(b.db.T.teeth_status);
    await b.run(`delSession('br')`);
    T('K8: حذف جلسة جسرٍ **منجز** ⇒ صفر مساس (خارج النطاق عمداً)', JSON.stringify(b.db.T.teeth_status) === before); }

  // R7: the dashboard's completion modal (appt-time.js) labels option items and explains the next step
  { const src = require('fs').readFileSync(REPO + 'appt-time.js', 'utf8');
    T('R7: نافذة الإنهاء تُظهر «خيار X» وتنبيه الاعتماد', /' • 🔀 خيار ' \+ \['أ', 'ب', 'ج'\]\[s\.plan_option - 1\]/.test(src) && /بعد الإكمال افتح ملف المريض واعتمد الخيار/.test(src));
    const ap = require('fs').readFileSync(REPO + 'appointments.html', 'utf8');
    T('R7: تحميل جلسات المواعيد يجلب plan_option', /select\(_sesCols \+ ', plan_option'\)/.test(ap)); }

  console.log(`\n${X.OK} نجح · ${X.BAD} فشل`); if (X.BAD) { console.log('FAILS:\n - ' + X.fails.join('\n - ')); process.exitCode = 1; }
})().catch(e => { console.log('FATAL', e.stack); process.exitCode = 1; });

/* v600 — بلاغ المالك (10 ت١ 2026، الأسنان 36/42/45): بدائلُ مخطّطة على السن نفسه بأي ترتيب.
   الأهليةُ تتبع حالةَ القلع (مخطّط = سنٌّ قائم) · زرعةٌ على قلعٍ مخطّط = جلسةُ خطةٍ بلا مسح ·
   «جسر بديل للزرعة» · الرسمُ عند إنجاز القلع/الزرعة · إزالةُ الزراعة وحذفُ جلسة القلع بحالتهما الحقيقية.
   الكود الحقيقي (pp-core/pp-dental/pp-plan + دوالّ patient-profile.html) على قاعدةٍ وهمية بقيدها الفريد. */
const X = require('./sc.js'), h = require('./h.js'), S = require('./s0.js');
const T = X.T;
const rows = (b, n) => b.db.T.teeth_status.filter(r => String(r.tooth_num) === String(n))
  .map(r => r.surface + '=' + r.treatment_key + ':' + r.status + (r.unit_id ? '@u' : '')).sort().join(' ');
const allowed = b => (b.ctx._txAllowed || []).map(t => t.id);
const sess = (b, key, tn) => b.db.T.ledger_sessions.filter(r => r.treatment_key === key && (!tn || String(r.tooth_num) === String(tn)));
async function fresh(extra) {
  const b = await h.bootAsync();
  if (extra) extra(b);
  S.load(b);
  return b;
}
async function save(b, tooth, surface, key, label, status, cost) {
  b.toasts.length = 0; b.ctx._cur = 'SYP';
  b.run(`pickToothTreatment('${key}', '${label}')`);
  if (status) b.run(`pickStatus('${status}')`);
  b.els.toothCost.value = String(cost); b.els.toothDate.value = '2026-10-10'; b.els.toothNotes.value = '';
  await b.run('saveToothTreatment()');
}
async function modal(b, tooth, surface) { await b.run(`openToothModal(${tooth}, '${surface}')`); }
(async () => {
  // ── A: 42 — قلعٌ مخطّط ثم عصبٌ مخطّط (البلاغ) ──
  { const b = await fresh();
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
    T('A0: القلع المخطّط مرسومٌ صفّاً مخطّطاً', rows(b, 42) === 'WHOLE=extracted:planned', rows(b, 42));
    await modal(b, 42, 'R1');
    const al = allowed(b);
    T('A1: نقرُ جذر سنٍّ قلعُه مخطّط يعرض العصب', al.includes('rct'), al.join(','));
    T('A1: … ولا يعرض قلعاً ثانياً', !al.includes('extracted'), al.join(','));
    T('A1: … ولا علاجاتِ التاج على الجذر (المصفوفة باقية)', !al.includes('comp'), al.join(','));
    T('A1: … والبدائلُ التعويضية متاحة (زرعة/جسر)', al.includes('implant') && al.includes('bridge'), al.join(','));
    T('A1: زرّ «إلغاء القلع المخطّط» بدل «إعادة السن»', /إلغاء القلع المخطّط/.test(b.ctx._txSpecialHtml || '') && !/إعادة السن/.test(b.ctx._txSpecialHtml || ''));
    await save(b, 42, 'R1', 'rct', 'حشوة عصب', 'planned', 5000);
    T('A2: العصبُ حُفظ والقلعُ باقٍ', rows(b, 42) === 'R1=rct:planned WHOLE=extracted:planned', rows(b, 42));
    T('A2: جلستان مخطّطتان', sess(b, 'rct', 42).length === 1 && sess(b, 'extracted', 42).length === 1);
    await modal(b, 42, 'B');
    T('A3: نقرُ سطحٍ تاجي يعرض الحشوة', allowed(b).includes('comp'), allowed(b).join(','));
    X.invariants(b, 'A'); }

  // ── B: 36 — الترتيبُ المعاكس يعطي النتيجةَ نفسها ──
  { const b = await fresh();
    await modal(b, 36, 'R1R2'); await save(b, 36, 'R1R2', 'rct', 'حشوة عصب', 'planned', 5000);
    await modal(b, 36, 'WHOLE'); await save(b, 36, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
    T('B1: عصب ثم قلع ⇒ الصفّان', rows(b, 36) === 'R1R2=rct:planned WHOLE=extracted:planned', rows(b, 36));
    await modal(b, 36, 'CROWN_FULL');
    T('B2: بعد القلع المخطّط ما زال التاجُ متاحاً', allowed(b).includes('czr'), allowed(b).join(','));
    X.invariants(b, 'B'); }

  // ── C: زرعةٌ على قلعٍ مخطّط = جلسةُ خطة، صفر مسح ──
  let C;
  { const b = await fresh();
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
    await modal(b, 42, 'R1'); await save(b, 42, 'R1', 'rct', 'حشوة عصب', 'planned', 5000);
    const before = rows(b, 42);
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'implant', 'زراعة', 'completed', 350);
    T('C1: زرعةٌ «منجزة» على قلعٍ مخطّط تُرفض بلا أي كتابة', rows(b, 42) === before && !sess(b, 'implant', 42).length && b.toasts.some(t => /تُضاف كعلاجٍ مخطّط/.test(t)), b.toasts.join(' | '));
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'implant', 'زراعة', 'planned', 350);
    T('C2: الزرعةُ المخطّطة لا تمسح القلعَ ولا العصب', rows(b, 42) === before, rows(b, 42));
    T('C2: … جلسةُ زرعةٍ مخطّطة على WHOLE', sess(b, 'implant', 42).length === 1 && sess(b, 'implant', 42)[0].surface === 'WHOLE' && sess(b, 'implant', 42)[0].status === 'planned');
    T('C2: … والتوستُ يشرح', b.toasts.some(t => /تُرسم الزرعة عند إنجاز القلع/.test(t)), b.toasts.join(' | '));
    const tip = X.tipOf(b, 42);
    T('C3: الزرعةُ ظاهرةٌ بتلميح السن القائم', /زراعة/.test(tip.facial) && !tip.threw, tip.facial.slice(0, 200));
    X.invariants(b, 'C'); C = b; }

  // ── D: جسرٌ فوق القلع المخطّط ⇒ الزرعة بديلٌ له (أ/ب) · اعتمادُ الزرعة · إنجازُ القلع ثم الزرعة ──
  { const b = await fresh();
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'implant', 'زراعة', 'planned', 350);
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'bridge', 'جسر', 'planned', 9000);
    const br = b.db.T.ledger_sessions.find(r => r.treatment_key === 'bridge'), im = sess(b, 'implant', 42)[0];
    T('D1: الجسرُ رُسم وهمياً فوق القلع المخطّط', /PONTIC=bridge:planned@u/.test(rows(b, 42)) && /WHOLE=extracted:planned/.test(rows(b, 42)), rows(b, 42));
    T('D1: الزرعة أ والجسر ب تلقائياً', im.plan_option === 1 && br && br.plan_option === 2, 'imp=' + im.plan_option + ' br=' + (br && br.plan_option));
    T('D1: التوستُ يسمّي الخيار', b.toasts.some(t => /الخيار ب/.test(t) && /بديلٌ للزرعة/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'D1');
    b.ctx._answers = [true, true, true];
    await b.run(`adoptPlanOption(1, { skipConfirm: true, quiet: true })`);
    T('D2: اعتمادُ الزرعة ⇒ الجسرُ حُذف ورسمُه أُزيل', !b.db.T.ledger_sessions.some(r => r.treatment_key === 'bridge') && !/@u/.test(rows(b, 41) + rows(b, 42) + rows(b, 43)), rows(b, 41) + ' | ' + rows(b, 42) + ' | ' + rows(b, 43));
    T('D2: … والقلعُ المخطّط باقٍ (الزرعةُ لم تمسحه)', rows(b, 42) === 'WHOLE=extracted:planned', rows(b, 42));
    X.invariants(b, 'D2', { skipI4: true });
    const ex = sess(b, 'extracted', 42)[0];
    b.ctx._answers = [true, true];
    await b.run(`completeSessionFromProfile('${ex.id}')`);
    T('D3: إنجازُ القلع ⇒ الزرعةُ المخطّطة تُرسم مكانه', rows(b, 42) === 'WHOLE=implant:planned', rows(b, 42));
    X.invariants(b, 'D3');
    b.ctx._answers = [true, true];
    await b.run(`completeSessionFromProfile('${sess(b, 'implant', 42)[0].id}')`);
    T('D4: إنجازُ الزرعة ⇒ منجزة على المخطط', rows(b, 42) === 'WHOLE=implant:completed', rows(b, 42));
    X.invariants(b, 'D4'); }

  // ── E: 45 — زرعةٌ مخطّطة على موقعٍ مقلوع ⇒ «جسر بديل للزرعة» ──
  const seed45 = b => {
    b.db.T.teeth_status.push({ doctor_id:'D1', patient_id:'P1', tooth_num:'45', surface:'WHOLE', treatment_key:'extracted', status:'completed', unit_id:null, review_at:null, provider_id:null });
    b.db.T.ledger_sessions.push({ id:'x45', doctor_id:'D1', patient_id:'P1', type:'قلع', treatment_key:null, cost:0, tooth_num:'45', surface:'WHOLE', status:'completed',
      description:'', notes:'', provider_id:null, appointment_id:null, quadrant:null, arch:null, phase:null, currency:'SYP', plan_option:null, units:null, date:'2026-08-09', created_at:'2026-08-09T10:00:00Z' });
  };
  { const b = await fresh(seed45);
    await modal(b, 45, 'WHOLE'); await save(b, 45, 'WHOLE', 'implant', 'زراعة', 'planned', 350);
    T('E0: زرعةٌ مخطّطة على مقلوعٍ منجز تُرسم كما كانت', rows(b, 45) === 'WHOLE=implant:planned', rows(b, 45));
    await modal(b, 45, 'WHOLE');
    T('E1: نافذةُ الزرعة المخطّطة تعرض «جسر بديل للزرعة»', /openImplantAltBridgePicker\(45\)/.test(b.els.toothOptsContainer.innerHTML + (b.ctx._txSpecialHtml || '')));
    b.run('openImplantAltBridgePicker(45)');
    T('E1: المنتقي يعرض الجسور وحدها', /pickToothTreatment\('bridge'/.test(b.els.toothOptsContainer.innerHTML) && /pickToothTreatment\('c_zr'/.test(b.els.toothOptsContainer.innerHTML) && !/pickToothTreatment\('implant'/.test(b.els.toothOptsContainer.innerHTML));
    b.run(`pickToothTreatment('c_zr', 'جسر (زركون)')`);
    T('E2: الحالةُ مخطّطةٌ قسراً', b.ctx.pendingTreatStatus === 'planned');
    b.els.toothCost.value = '25000'; b.els.toothDate.value = '2026-10-10'; b.els.toothNotes.value = ''; b.toasts.length = 0;
    await b.run('saveToothTreatment()');
    const br = b.db.T.ledger_sessions.find(r => r.treatment_key === 'c_zr'), im = sess(b, 'implant', 45)[0];
    T('E3: الموقعُ عاد مقلوعاً منجزاً وفوقه جسرٌ وهمي', /WHOLE=extracted:completed/.test(rows(b, 45)) && /PONTIC=c_zr:planned@u/.test(rows(b, 45)), rows(b, 45));
    T('E3: الدعامتان 44 و46', /c_zr:planned@u/.test(rows(b, 44)) && /c_zr:planned@u/.test(rows(b, 46)), rows(b, 44) + ' | ' + rows(b, 46));
    T('E3: الزرعة أ والجسر ب', im && im.plan_option === 1 && br && br.plan_option === 2, 'imp=' + (im && im.plan_option) + ' br=' + (br && br.plan_option));
    T('E3: التوستُ يسمّي الخيار', b.toasts.some(t => /الخيار ب/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'E3');
    const tip = X.tipOf(b, 45);
    T('E4: تلميحُ الوهمي يعرض الجسر والزرعة', /زراعة/.test(tip.facial) && /جسر/.test(tip.facial), tip.facial.slice(0, 200));
    b.ctx._answers = [true, true, true];
    await b.run(`adoptPlanOption(1, { skipConfirm: true, quiet: true })`);
    T('E5: اعتمادُ الزرعة ⇒ تعود مرسومةً والجسرُ زال', rows(b, 45) === 'WHOLE=implant:planned' && rows(b, 44) === '' && rows(b, 46) === '', rows(b, 44) + ' | ' + rows(b, 45) + ' | ' + rows(b, 46));
    X.invariants(b, 'E5', { skipI4: true }); }

  // ── F: رفضُ حارس الجسر ⇒ الزرعة تُستعاد حرفياً ──
  { const b = await fresh(b => { seed45(b);
      b.db.T.teeth_status.push({ doctor_id:'D1', patient_id:'P1', tooth_num:'46', surface:'WHOLE', treatment_key:'implant', status:'completed', unit_id:null, review_at:null, provider_id:null }); });
    await modal(b, 45, 'WHOLE'); await save(b, 45, 'WHOLE', 'implant', 'زراعة', 'planned', 350);
    const snap = [44,45,46,47].map(n => rows(b, n)).join(' | ');
    await modal(b, 45, 'WHOLE'); b.run('openImplantAltBridgePicker(45)'); b.run(`pickToothTreatment('bridge', 'جسر')`);
    b.els.toothCost.value = '9000'; b.els.toothDate.value = '2026-10-10'; b.els.toothNotes.value = '';
    await b.run('saveToothTreatment()');
    const now = [44,45,46,47].map(n => rows(b, n)).join(' | ');
    T('F1: جسرٌ مرفوض (زرعةٌ مجاورة) ⇒ المخطط كما كان حرفياً', now === snap && !b.db.T.ledger_sessions.some(r => r.treatment_key === 'bridge'), snap + ' ≠ ' + now);
    X.invariants(b, 'F1'); }

  // ── G: إزالةُ الزراعة وحذفُ جلسة القلع ──
  { const b = await fresh(b => {
      b.db.T.teeth_status.push({ doctor_id:'D1', patient_id:'P1', tooth_num:'14', surface:'WHOLE', treatment_key:'implant', status:'planned', unit_id:null, review_at:null, provider_id:null });
      b.db.T.ledger_sessions.push({ id:'x14', doctor_id:'D1', patient_id:'P1', type:'قلع', treatment_key:'extracted', cost:0, tooth_num:'14', surface:'WHOLE', status:'planned',
        description:'', notes:'', provider_id:null, appointment_id:null, quadrant:null, arch:null, phase:null, currency:'SYP', plan_option:null, units:null, date:'2026-10-10', created_at:'2026-10-10T08:00:00Z' }); });
    b.ctx._answers = [true, false];
    await b.run('removeImplant(14)');
    T('G1: إزالةُ زرعةٍ قلعُها ما زال خطة ⇒ القلعُ يعود مخطّطاً (السنُّ قائم)', rows(b, 14) === 'WHOLE=extracted:planned', rows(b, 14));
    X.invariants(b, 'G1'); }
  { const b = C, xid = sess(b, 'extracted', 42)[0].id;
    // G3 أولاً على نسخةٍ مستقلة: «أبقِها» ⇒ الزرعةُ باقيةٌ بالخطة، والمخطط بلا زرعةٍ مرسومة على سنٍّ قائم
    { const k = await fresh(); await modal(k, 42, 'WHOLE'); await save(k, 42, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
      await modal(k, 42, 'WHOLE'); await save(k, 42, 'WHOLE', 'implant', 'زراعة', 'planned', 350);
      k.ctx._answers = [true, false]; k.dialogs.length = 0;
      await k.run(`delSession('${sess(k, 'extracted', 42)[0].id}')`);
      T('G3: «أبقِها» ⇒ الزرعةُ باقية بالخطة ولا تُرسم على سنٍّ قائم', rows(k, 42) === '' && sess(k, 'implant', 42).length === 1, rows(k, 42)); }
    b.ctx._answers = [true, true]; b.dialogs.length = 0;
    await b.run(`delSession('${xid}')`);
    const q = b.dialogs[1] || {};
    T('G2: حذفُ جلسة القلع يسأل عن الزرعة المبنية عليه', q.confirmText === 'احذفها' && /زرعةٌ مخطّطة تُبنى/.test(q.message || ''), JSON.stringify(q).slice(0, 200));
    T('G2: «احذفها» ⇒ القلعُ والزرعة زالا والعصبُ باقٍ', rows(b, 42) === 'R1=rct:planned' && !sess(b, 'implant', 42).length && sess(b, 'rct', 42).length === 1, rows(b, 42));
    T('G2: توستٌ واحد يذكرهما', b.toasts.filter(t => /تم حذف الجلسة/.test(t)).length >= 1 && b.toasts.some(t => /جلسة الزرعة المبنية عليها/.test(t)), b.toasts.join(' | '));
    X.invariants(b, 'G2'); }

  // ── H: التحديدُ المتعدد بالقاعدة نفسها ──
  { const b = await fresh();
    await modal(b, 42, 'WHOLE'); await save(b, 42, 'WHOLE', 'extracted', 'قلع', 'planned', 3000);
    { const acorn = require('../../node_modules/acorn'), src = require('fs').readFileSync(require('path').join(__dirname, '../../pp-modules.js'), 'utf8');
      const fn = acorn.parse(src, { ecmaVersion: 'latest' }).body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'batchAllowed');
      b.run(src.slice(fn.start, fn.end), 'pp-modules.js:batchAllowed'); }
    const tr = k => `getTreatment('${k}')`;
    T('H1: الدفعة — العصبُ مسموح على القلع المخطّط', b.run(`batchAllowed(42, ${tr('rct')}, 'R1').ok`) === true);
    T('H1: الدفعة — الزرعةُ مسموحة', b.run(`batchAllowed(42, ${tr('implant')}, 'WHOLE').ok`) === true);
    T('H1: الدفعة — قلعٌ ثانٍ مرفوض', b.run(`batchAllowed(42, ${tr('extracted')}, 'WHOLE').ok`) === false);
    T('H1: الدفعة — سنٌّ قائم بلا قلع ما زال يرفض الزرعة', b.run(`batchAllowed(43, ${tr('implant')}, 'WHOLE').ok`) === false);
  }
  console.log(`\n${X.OK} نجح · ${X.BAD} فشل`);
  process.exitCode = X.BAD ? 1 : 0;
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); console.log(`\n${X.OK} نجح · ${X.BAD + 1} فشل`); process.exitCode = 1; });

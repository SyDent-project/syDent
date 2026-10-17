/* v595 — مثبتُ استمارة المريض الرقمية (M177): intake.html · pp-intake.js · appt-booking.js · settings · اللوحة — على الملفات الحيّة.
   (١) المرايا: مفاتيحُ الأعلام الطبية/الحساسية بـintake.html = huddle-flags.js · INTAKE_EXTRA_DEFS بـintake.html = pp-intake.js
       (مفتاحاً وتسمية) · القوائمُ البيضاء الثلاث بالهجرة 177 = المفاتيحُ نفسُها (لا مفتاحَ يُعرض للمريض ثم تُسقطه القاعدة);
   (٢) intake.html سطحٌ مستقلّ: لا ملفَ مشترك · لا ?v= · vendor · honeypot · كلُّ RAISE EXCEPTION بالهجرة له نصٌّ بـERR_MAP والعكس;
   (٣) الهجرة: RLS · بوابة الاشتراك · REVOKE/GRANT للدالتين فقط (الدالةُ الداخلية مسحوبة) · SECURITY DEFINER · صفٌّ معلّقٌ واحد · نوعُ 'intake' بسجل المراسلات;
   (٤) خطةُ الدمج (vm على الدوال الحيّة): اتحادٌ لا استبدال · لا تكرار · الميلادُ عند غيابه فقط · «لا يوجد» ليست حساسية · المفاتيحُ المجهولة تُهمَل · النصُّ الموجود لا يُعاد;
   (٥) الرسم (vm): كلُّ حالةٍ زرُّها الحرفي (سجلّ وضع القراءة يقرأ الاسم من المصدر) · الخطةُ المحجوبة تُخفي الصفّ;
   (٦) التوصيل: بطاقة المريض (السكربت · النافذة sy-m · الصفّ · سطرُ القراءة) · cache-bust ×2 · PP_MSG_KINDS · رابطُ التأكيد ينتظر bookingIntakeLine
       ويخضع للإعداد والخطة · تنبيهُ اللوحة محجوبٌ بالخطة · الإعدادات (حفظٌ مخفيٌّ بالقراءة).
   v621: الأعلامُ الطبية بالبطاقة (13) = الاستمارة (6 + 7 إضافية) مفتاحاً وتسميةً، والدمجُ يكتب الإضافيةَ أعلاماً لا نصاً.
   --self-test: 11 طفرة لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function slice(src, fnName) {
  let i = src.indexOf('async function ' + fnName + '(');
  if (i < 0) i = src.indexOf('function ' + fnName + '(');
  if (i < 0) throw new Error('missing ' + fnName);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + fnName);
}
function literal(src, anchor, open, close) {
  const at = src.indexOf(anchor); if (at < 0) throw new Error('anchor ' + anchor);
  const from = src.indexOf(open, at); let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (!depth) return vm.runInNewContext('(' + src.slice(from, i + 1) + ')', Object.create(null), { timeout: 1000 }); }
  }
  throw new Error('unbalanced ' + anchor);
}
const keysOf = a => a.map(d => d.key).join(',');
const sqlArray = (sql, name) => { const m = new RegExp(name + "\\s+TEXT\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]").exec(sql); return m ? m[1].match(/'([a-z_]+)'/g).map(x => x.slice(1, -1)).join(',') : ''; };

function loadPP(src, opt) {
  opt = opt || {};
  const FN = ['ppIntakeLabel', 'ppIntakeLabels', 'ppIntakeMergePlan', 'ppIntakeIsExpired', 'ppIntakeIsFresh', 'ppIntakeRender', 'ppIntakeWhen', 'ppIntakeLink'];
  const hf = read('huddle-flags.js');
  const els = { intakeRow: { style: {} }, iIntake: { innerHTML: '' } };
  const ctx = {
    window: { sb: null }, document: { getElementById: id => els[id] || null, querySelectorAll: () => [] }, console: { warn() {} },
    location: { origin: 'https://sydent.app' }, Date, Array, Object, String, Number, Math, RegExp, JSON,
    escapeHtml: s => String(s == null ? '' : s), fmtD: d => String(d).slice(0, 10),
    PP_INTAKE: opt.row === undefined ? null : opt.row, PP_BOOKING_PLAN_OK: opt.planOk !== false, PP_INTAKE_ROWS: opt.rows || (opt.row ? [opt.row] : [])
  };
  vm.createContext(ctx);
  vm.runInContext('var MEDICAL_FLAGS_DEFS = ' + JSON.stringify(literal(hf, 'var MEDICAL_FLAGS_DEFS', '[', ']')) + ';'
    + 'var ALLERGY_FLAGS_DEFS = ' + JSON.stringify(literal(hf, 'var ALLERGY_FLAGS_DEFS', '[', ']')) + ';'
    + 'var INTAKE_EXTRA_DEFS = ' + JSON.stringify(literal(src, 'var INTAKE_EXTRA_DEFS', '[', ']')) + ';'
    + 'var PP_INTAKE_FRESH_DAYS = 365;\n' + FN.map(f => slice(src, f)).join('\n'), ctx);
  return { ctx, els };
}

function suite(S) {
  const { intake, pp, mig, pph, ppcss, cb, ppwa, bk, idx, stg, hf } = S;
  const S_ = S;
  /* (١) المرايا */
  const hfMed = keysOf(literal(hf, 'var MEDICAL_FLAGS_DEFS', '[', ']')), hfAlg = keysOf(literal(hf, 'var ALLERGY_FLAGS_DEFS', '[', ']'));
  const ikMed = literal(intake, 'var MEDICAL_FLAGS_DEFS', '[', ']'), ikAlg = literal(intake, 'var ALLERGY_FLAGS_DEFS', '[', ']');
  const ikEx = literal(intake, 'var INTAKE_EXTRA_DEFS', '[', ']'), ppEx = literal(pp, 'var INTAKE_EXTRA_DEFS', '[', ']');
  /* v621: the card's medical flags = the intake's 6 + its 7 extras, same keys, same labels, same order — what the patient ticks is what the doctor sees */
  const hfMedDefs = literal(hf, 'var MEDICAL_FLAGS_DEFS', '[', ']');
  ok(JSON.stringify(ikMed.concat(literal(intake, 'var INTAKE_EXTRA_DEFS', '[', ']'))) === JSON.stringify(hfMedDefs) && hfMedDefs.length === 13 && keysOf(ikAlg) === hfAlg, 'mirror: card MEDICAL_FLAGS_DEFS (13) = intake medical (6) + intake extras (7) — keys and labels');
  ok(JSON.stringify(ikEx) === JSON.stringify(ppEx) && ikEx.length === 7, 'mirror: INTAKE_EXTRA_DEFS intake.html = pp-intake.js (key + label)');
  ok(sqlArray(mig, 'v_med') + ',' + sqlArray(mig, 'v_extra') === hfMed && sqlArray(mig, 'v_alg') === hfAlg && sqlArray(mig, 'v_extra') === keysOf(ikEx), 'mirror: migration whitelists (med + extra) = the card\'s 13 medical keys');
  /* (٢) intake.html standalone */
  ok(!/src="(supabase-init|sidebar|theme|sy-modal)\.js|href="theme\.css/.test(intake) && intake.indexOf('?v=') < 0 && intake.indexOf('/vendor/supabase-') > -1, 'intake.html: standalone, token-free, vendor supabase');
  ok(/class="hp-field"/.test(intake) && /if \(hp && hp\.value\) \{ screenDone/.test(intake), 'intake.html: honeypot short-circuits before any RPC');
  const raised = [...new Set([...mig.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map(m => m[1]))];
  const errMap = literal(intake, 'var ERR_MAP', '{', '}');
  ok(raised.length >= 6 && raised.every(k => typeof errMap[k] === 'string' && errMap[k].length > 5), 'intake.html: every RPC exception has an Arabic message (' + raised.join(',') + ')');
  ok(Object.keys(errMap).every(k => raised.includes(k)), 'intake.html: ERR_MAP carries no phantom codes');
  ok(/consent: true,/.test(intake) && /if \(!consent \|\| !consent\.classList\.contains\('on'\)\)/.test(intake), 'intake.html: consent gate before submit');
  ok(/sb\.rpc\('intake_submit', \{ p_token: TOKEN, p_answers: answers, p_signature: sigData\(\) \}\)/.test(intake) && /sb\.rpc\('intake_info', \{ p_token: TOKEN \}\)/.test(intake), 'intake.html: the two RPCs only');
  ok(/\[\?&\]t=\(\[0-9a-fA-F\]\{64\}\)/.test(intake), 'intake.html: token read as 64 hex only');
  /* (٣) الهجرة */
  ok(/ALTER TABLE public\.patient_intakes ENABLE ROW LEVEL SECURITY;/.test(mig) && /_sub_guard_table\('public\.patient_intakes'\)/.test(mig), 'migration: RLS + subscription gate');
  ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_intakes_pending[\s\S]*?WHERE status = 'pending'/.test(mig), 'migration: one pending link per patient');
  ok(/GRANT EXECUTE ON FUNCTION public\.intake_info\(text\) TO anon, authenticated;/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.intake_submit\(text,jsonb,text\) TO anon, authenticated;/.test(mig)
     && /REVOKE ALL ON FUNCTION public\._intake_clinic_open\(uuid\) FROM PUBLIC, anon, authenticated;/.test(mig), 'migration: the two RPCs are the only anon surface');
  ok((mig.match(/SECURITY DEFINER/g) || []).length >= 3 && /tenant_access_level\(p_clinic\) <> 'full'/.test(mig) && /entitlements->>'booking'/.test(mig), 'migration: definer + subscription + plan gate chain');
  ok(/'free','other','intake'\]\)\);/.test(mig), 'migration: patient_messages kind check carries intake');
  ok(/IF v\.status <> 'pending' THEN RAISE EXCEPTION 'already_submitted'/.test(mig) && /IF v\.expires_at < now\(\) THEN RAISE EXCEPTION 'expired'/.test(mig) && /FOR UPDATE;/.test(mig), 'migration: one submit per token, expiry, row lock');
  /* (٤) خطةُ الدمج */
  const P = loadPP(pp);
  const plan = (pt, a) => P.ctx.ppIntakeMergePlan(pt, a);
  const apply = items => { const u = {}; items.forEach(it => it.apply(u)); return u; };
  let items = plan({ medical_flags: ['diabetes'], medical_flags_other: 'كلى', allergies: 'غبار', dob: '1990-01-01' },
    { med: ['diabetes', 'asthma', 'hacker'], alg: ['latex_allergy'], extra: ['smoker', 'nope'], med_other: 'كلى', meds: 'ميتفورمين', alg_other: 'فراولة', dob: '1991-02-02' });
  let u = apply(items);
  ok(items.map(i => i.key).join(',') === 'flags,other,allergy', 'merge: flags + other + allergy (dob kept because the record has one)');
  ok(JSON.stringify(u.medical_flags) === JSON.stringify(['diabetes', 'asthma', 'latex_allergy', 'smoker']), 'merge: flags are a union (existing kept, unknown dropped, no duplicates) — the intake extras land as flags (v621)');
  ok(u.medical_flags_other === 'كلى، أدوية: ميتفورمين', 'merge: other text appends only what is missing — «مدخّن» is a flag now, not text');
  ok(u.allergies === 'غبار، فراولة' && u.dob === undefined, 'merge: allergy appended, dob untouched');
  items = plan({ medical_flags: [], allergies: 'لا يوجد' }, { med: [], alg: [], extra: [], alg_other: 'فراولة', dob: '1991-02-02' });
  u = apply(items);
  ok(items.map(i => i.key).join(',') === 'allergy,dob' && u.allergies === 'فراولة' && u.dob === '1991-02-02', 'merge: «لا يوجد» is not an allergy · dob filled when missing');
  ok(plan({ medical_flags: ['asthma', 'latex_allergy', 'smoker'], medical_flags_other: '', allergies: 'فراولة', dob: '1990-01-01' },
    { med: ['asthma'], alg: ['latex_allergy'], extra: ['smoker'], alg_other: 'فراولة', dob: '1991-02-02' }).length === 0, 'merge: nothing new ⇒ empty plan');
  ok(plan({}, { dob: '1991-2-2' }).length === 0 && plan({}, { dob: '1991-02-02' }).length === 1, 'merge: dob only in YYYY-MM-DD');
  ok(P.ctx.ppIntakeLabels({ med: ['asthma', 'x'], alg: ['latex_allergy'], extra: ['smoker'] }).med.join() === 'ربو' && P.ctx.ppIntakeLabels({}).extra.length === 0, 'labels: constants only, unknown keys ignored');
  ok(P.ctx.ppIntakeIsExpired({ status: 'pending', expires_at: '2000-01-01T00:00:00Z' }) && !P.ctx.ppIntakeIsExpired({ status: 'submitted', expires_at: '2000-01-01T00:00:00Z' }), 'expired: pending past expiry only');
  ok(P.ctx.ppIntakeIsFresh({ status: 'reviewed', submitted_at: new Date().toISOString() }) && !P.ctx.ppIntakeIsFresh({ status: 'reviewed', submitted_at: '2020-01-01T00:00:00Z' }) && !P.ctx.ppIntakeIsFresh({ status: 'pending', created_at: new Date().toISOString() }), 'fresh: reviewed/submitted within a year');
  ok(P.ctx.ppIntakeLink('ab') === 'https://sydent.app/intake.html?t=ab', 'link: intake.html?t=');
  /* (٥) الرسم */
  const render = row => { const L = loadPP(pp, { row }); L.ctx.ppIntakeRender(); return L.els.iIntake.innerHTML; };
  ok(/onclick="ppIntakeSend\(\)"/.test(render(null)) && !/ppIntakeOpenReview/.test(render(null)), 'render: none ⇒ send only');
  const pend = render({ status: 'pending', expires_at: '2999-01-01T00:00:00Z', created_at: '2026-10-10T10:00:00Z' });
  ok(/onclick="ppIntakeSend\(\)"/.test(pend) && /onclick="ppIntakeCopyLink\(\)"/.test(pend) && /بانتظار المريض/.test(pend), 'render: pending ⇒ resend + copy');
  ok(/انتهت صلاحية/.test(render({ status: 'pending', expires_at: '2000-01-01T00:00:00Z' })), 'render: expired pending');
  const sub = render({ status: 'submitted', submitted_at: '2026-10-10T10:00:00Z' });
  ok(/onclick="ppIntakeOpenReview\(\)"/.test(sub) && /pp-intake-primary/.test(sub) && !/ppIntakeSend/.test(sub), 'render: submitted ⇒ review (primary), no resend');
  const rev = render({ status: 'reviewed', reviewed_at: '2026-10-10T10:00:00Z', reviewed_by: 'سارة' });
  ok(/onclick="ppIntakeOpenReview\(\)"/.test(rev) && /onclick="ppIntakeSend\(\)"/.test(rev) && /سارة/.test(rev), 'render: reviewed ⇒ view + new form');
  const G = loadPP(pp, { row: null, planOk: false }); G.ctx.ppIntakeRender();
  ok(G.els.intakeRow.style.display === 'none', 'render: plan without booking hides the row');
  /* (٧) القالب (M178): مرآة ×3 · التعبئة · سطرُ التأكيد من القالب · البثّ */
  const extract = (src, name) => { const i = src.indexOf(name + ' ='); const j = src.indexOf(';', i); return vm.runInNewContext('(' + src.slice(i + name.length + 2, j) + ')', {}, { timeout: 500 }); };
  const tplS = extract(stg, 'const DEFAULT_INTAKE_TEMPLATE'), tplP = extract(pp, 'var PP_DEFAULT_INTAKE_TPL'), tplB = extract(bk, 'var BK_DEFAULT_INTAKE_TPL');
  ok(tplS === tplP && tplP === tplB && /\{intake_link\}/.test(tplS) && /\{patient_first_name\}/.test(tplS) && /\{clinic_name\}/.test(tplS), 'template: three defaults byte-equal and carry the placeholders');
  const F = loadPP(pp); vm.runInContext(slice(pp, 'ppIntakeFill'), F.ctx);
  ok(F.ctx.ppIntakeFill('م {patient_first_name} · {clinic_name} · {intake_link} · {x}', { patient_first_name: 'يحيى', clinic_name: 'ع', intake_link: 'L' }) === 'م يحيى · ع · L · {x}', 'fill: known placeholders replaced, unknown kept');
  const BL = vm.runInNewContext(slice(bk, 'bookingIntakeLineOf') + '; bookingIntakeLineOf', {}, { timeout: 500 });
  ok(BL(tplS, 'https://x/i?t=1') === 'قبل زيارتك إلى {clinic_name}، نرجو تعبئة استمارة المريض (تأخذ دقيقتين) عبر هذا الرابط: https://x/i?t=1', 'confirmation line: invitation line + link from the template, greeting dropped');
  ok(BL('مرحباً {patient_first_name}\nرابطك: {intake_link}', 'L') === '📝 رابطك: L' && BL('بلا عنصر نائب', 'L') === '📝 استمارة المريض: L', 'confirmation line: greeting-only prefix dropped · missing placeholder falls back');
  ok(/whatsapp_intake_template: intakeTemplate,/.test(stg) && /'whatsapp_review_template', 'whatsapp_intake_template'/.test(stg) && /id="fIntakeTemplate"/.test(stg) && /insertPlaceholderInto\('fIntakeTemplate','\{intake_link\}'\)/.test(stg), 'settings: intake template saved · optional column · pill for {intake_link}');
  ok(/<div class="section-title">قوالب WhatsApp<\/div>/.test(stg), 'settings: section renamed «قوالب WhatsApp»');
  ok(/cs\.whatsapp_intake_template && String\(cs\.whatsapp_intake_template\)\.trim\(\)\) \|\| PP_DEFAULT_INTAKE_TPL/.test(pp) && /CLINIC_SETTINGS_WA\.whatsapp_intake_template\)\.trim\(\)\) \|\| BK_DEFAULT_INTAKE_TPL/.test(bk), 'template: both senders read the clinic template, default when empty');
  const sb = S_.sb;
  ok(/table: 'patient_intakes', filter: 'owner_id=eq\.' \+ uid/.test(sb) && /if \(row\.status !== 'submitted'\) return;/.test(sb) && /window\.onSyDentIntake\(row\)/.test(sb) && /patient_intakes'\)\s+\.select\('id', \{ count: 'exact', head: true \}\)/.test(sb), 'sidebar: realtime UPDATE subscription, submitted ⇒ hook, head count badge');
  ok(/sb-badge--intake/.test(sb) && /ALTER PUBLICATION supabase_realtime ADD TABLE public\.patient_intakes/.test(read('migrations/178_intake_template_realtime.sql')), 'sidebar badge on patients + table published for realtime');
  ok(/window\.onSyDentIntake = function\(\)\{ try\{ renderDashAlerts\(\); \}catch\(_\)\{\} \};/.test(idx) && /row\.patient_id !== patientId\) return;\s*\n\s*ppIntakeLoad\(true\);/.test(pp), 'hooks: dashboard re-renders alerts · patient card reloads its row');
  const PR = loadPP(pp, { rows: [{ status: 'pending', expires_at: '2999-01-01T00:00:00Z', created_at: '2026-10-10T10:00:00Z' }, { status: 'reviewed', reviewed_at: '2026-10-10T09:00:00Z' }], row: { status: 'pending', expires_at: '2999-01-01T00:00:00Z', created_at: '2026-10-10T10:00:00Z' } });
  PR.ctx.ppIntakeRender();
  ok(/آخر استمارة مُعتمدة/.test(PR.els.iIntake.innerHTML), 'render: pending after an approved form shows the last approval');
  const pts = S_.pts;
  ok(/onclick="setFilter\('intake', this\)"/.test(pts) && /filter === 'intake'  \? !!prmIntake\[p\.id\]/.test(pts) && /if \(prmIntake\[p\.id\]\) n\.intake\+\+;/.test(pts) && /intake: 1 \}/.test(pts), 'patients list: «استمارات» filter · count · deep-link key');
  ok(/prm-intake-chip/.test(pts) && /from\('patient_intakes'\)\.select\('patient_id, submitted_at'\)\.eq\('owner_id', currentUser\.id\)\.eq\('status', 'submitted'\)/.test(pts) && /const _ikP = loadPrmIntake\(\);/.test(pts) && /prmIntake\[row\.patient_id\] = row\.submitted_at/.test(pts), 'patients list: chip under the name · one read with the batch · realtime hook');
  ok(/location\.href='patients\.html\?filter=intake'/.test(sb), 'sidebar badge opens the patients list filtered to pending forms');
  /* (٦) التوصيل */
  ok(/<script src="pp-intake\.js\?v=[0-9a-z]+"><\/script>/.test(pph) && /<div class="modal-overlay sy-m" id="ppIntakeModal">/.test(pph) && /id="intakeRow"/.test(pph) && /ppIntakeLoad\(\); \} catch\(e\) \{\}/.test(pph), 'patient-profile: script · modal on the kit · row · loader hook');
  ok(/\[onclick\*="ppIntakeSend\("\],\[onclick\*="ppIntakeCopyLink\("\],\[onclick\*="ppIntakeDismiss\("\],\[onclick\*="ppIntakeApprove\("\]/.test(ppcss), 'patient-profile.css: the four writes hidden in read mode');
  ok((cb.match(/pp-intake\\\.js/g) || []).length === 2 && /mat-cost\.js · pp-intake\.js/.test(cb), 'cache-bust.sh: pp-intake.js numbered asset (×2 + comment)');
  ok(/intake:\s*\{ l: 'استمارة المريض'/.test(ppwa), 'pp-wa.js: correspondence kind intake');
  ok(/ppWaComposeOpen\('إرسال استمارة المريض', ppIntakeMsgText\(link\), false, null, '', 'intake'\)/.test(pp), 'pp-intake: send via the v408 composer, logged as intake');
  ok(/bookingBuildConfirmMsg\(ctx, savedAppt\.date, savedAppt\.time\) \+ await bookingIntakeLine\(savedAppt\.patient_id\)/.test(bk) && /CLINIC_SETTINGS_WA\.intake_on_booking === false\) return ''/.test(bk) && /!window\.SyDentPlan\.can\('booking'\)\) return ''/.test(bk) && /await showBookingWaConfirm\(ctx, savedAppt\)/.test(bk), 'appt-booking: confirmation message awaits the intake line, gated by setting + plan');
  ok(/from\('patient_intakes'\)\.select\('patient_id, submitted_at, patients\(name\)'\)\.eq\('status','submitted'\)/.test(idx) && /window\.SyDentPlan\.can\('booking'\)/.test(idx), 'dashboard: submitted intakes alert, plan-gated');
  ok(/onclick="saveIntakeSettings\(\)"/.test(stg) && /\[onclick\*="saveIntakeSettings\("\]/.test(stg) && /intake_on_booking: document\.getElementById\('ikOnBooking'\)\.checked/.test(stg) && /await loadIntakeSettings\(\);/.test(stg), 'settings: section saves named columns · hidden in read mode · loaded at boot');
}

function sources() {
  return { intake: read('intake.html'), pp: read('pp-intake.js'), mig: read('migrations/177_patient_intake.sql'), pph: read('patient-profile.html'),
    ppcss: read('patient-profile.css'), cb: read('scripts/cache-bust.sh'), ppwa: read('pp-wa.js'), bk: read('appt-booking.js'), idx: read('index.html'),
    stg: read('settings.html'), hf: read('huddle-flags.js'), sb: read('sidebar.js'), pts: read('patients.html') };
}
function run(S) { pass = 0; fail = 0; try { suite(S); } catch (e) { fail++; console.log('FAIL (throw)', e.message); } return { pass, fail }; }

const base = sources();
const R = run(base);
if (process.argv.includes('--self-test')) {
  const MUT = [
    ['intake.html: asthma dropped from the patient list', S => { S.intake = S.intake.replace("  { key:'asthma',             label:'ربو' }\n", ''); }],
    ['pp-intake: intake extras back to free text', S => { S.pp = S.pp.replace(", Array.isArray(answers.extra) ? answers.extra : [])", ')'); }],
    ['pp-intake: merge overwrites flags instead of union', S => { S.pp = S.pp.replace('u.medical_flags = have.concat(want);', 'u.medical_flags = want;'); }],
    ['intake.html: honeypot removed', S => { S.intake = S.intake.replace('if (hp && hp.value) { screenDone(new Date().toISOString()); return; }', ''); }],
    ['migration: submit RPC granted to nobody (GRANT line dropped)', S => { S.mig = S.mig.replace('GRANT EXECUTE ON FUNCTION public.intake_submit(text,jsonb,text) TO anon, authenticated;', ''); }],
    ['pp-intake: submitted row loses its review button', S => { S.pp = S.pp.replace("+ B_REVIEW;", "+ '';"); }],
    ['intake.html: already_submitted message missing', S => { S.intake = S.intake.replace(/  already_submitted:[^\n]*\n/, ''); }],
    ['pp-intake: «لا يوجد» treated as an allergy', S => { S.pp = S.pp.replace("if (algNow === 'لا يوجد') algNow = '';", ''); }],
    ['appt-booking: intake line ignores the clinic setting', S => { S.bk = S.bk.replace("if (CLINIC_SETTINGS_WA && CLINIC_SETTINGS_WA.intake_on_booking === false) return '';", ''); }],
    ['template: pp-intake default drifts from settings', S => { S.pp = S.pp.replace("'{intake_link}\\n' +", "'{intake_link} \\n' +"); }],
    ['sidebar: reviewed updates also fire the arrival hook', S => { S.sb = S.sb.replace("if (row.status !== 'submitted') return;", ''); }]
  ];
  let bit = 0;
  MUT.forEach(([name, m]) => { const S = sources(); m(S); const r = run(S); if (r.fail > 0) bit++; else console.log('MUTANT SURVIVED:', name); });
  pass = R.pass; fail = R.fail;
  console.log((fail === 0 && bit === MUT.length ? '✅' : '❌') + ' prove-intake: ' + R.pass + '/' + (R.pass + R.fail) + ' · ' + bit + '/' + MUT.length + ' طفرات تعضّ');
  process.exit(fail === 0 && bit === MUT.length ? 0 : 1);
}
console.log((R.fail === 0 ? '✅' : '❌') + ' prove-intake: ' + R.pass + '/' + (R.pass + R.fail));
process.exit(R.fail === 0 ? 0 : 1);

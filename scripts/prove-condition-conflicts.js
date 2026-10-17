#!/usr/bin/env node
/* v609 — تعارضُ الحالات السريرية والعلاجات (مراجعةٌ بطلب المالك، 11 تشرين الأول 2026).
   يشغّل مسارَ الحفظ الحقيقي (_saveToothTreatment_inner على pp-dental.js الحيّ) بعُدّة dom-smoke وjsdom،
   على stub قاعدةٍ يلتقط السلسلة كاملة، ويُثبت:
   A  تاجٌ كامل منجز ⇒ أسطحُ التاج (حالاتٌ وحشوات) تُمحى، الجذرُ يبقى، الحالاتُ تُحمل dx عليه، والتلميح «عولج: …».
   B  تاجٌ كامل مخطّط ⇒ الحشواتُ تبقى تحت تهشيره، الحالاتُ تُحمل تشخيصاً معلّقاً «التشخيص: …».
   C  زرعةٌ ⇒ محوُ السن (القائم) + حملُ حالاته dx + لا مرآةَ dx بائتة.
   D  إزالةُ التاج تعيد الحالةَ صفَّ «condition» على سطحها (v606).
   E  v610: حالةٌ على سطحٍ يحمل علاجاً منجزاً ⇒ «ملاحظة على العلاج» (dx «!»): لا محوَ، رمزٌ فوق الترميم، «ملاحظة: …»،
      تصير تشخيصَ البديل المخطّط، تحت المخطّط تشخيصٌ عادي، على MOD من سطحٍ واحد، إزالتُها، عودتُها حالةً عند إزالة الحشوة، والقلعُ يحملها «عولج».
   F  جسرٌ: مثبِّتُ الدعامة يمحو أسطحَ تاجها ويحمل حالاتِها، والدعامةُ الأخرى كذلك، والعضوُ الوهمي لا يُمسّ.
   --self-test: 9 طفرات يجب أن تعضّ. بلا jsdom ⇒ يتخطّى بـ0. */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت تعارض الحالات (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const DENTAL = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8');

function boot(dentalSrc, label) {
  const tmp = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.' + label + '.js');
  fs.writeFileSync(tmp, dentalSrc);
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmp)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}
function installDb(w) {
  const log = [];
  w.sb = { from: (table) => {
    const st = { table, op: null, payload: null, eq: {}, in: {} };
    const api = {
      delete() { st.op = 'delete'; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p) { st.op = 'upsert'; st.payload = p; log.push(st); return Promise.resolve({ data: [p], error: null }); },
      insert(p) { st.op = 'insert'; st.payload = p; log.push(st); return { select: () => ({ single: () => Promise.resolve({ data: Object.assign({ id: 'sess-' + log.length }, p), error: null }) }) }; },
      select() { return api; }, eq(k, v) { st.eq[k] = v; return api; }, in(k, v) { st.in[k] = v.slice(); return api; },
      order() { return api; }, limit() { return api; }, not() { return api; }, or() { return api; },
      single() { return Promise.resolve({ data: null, error: null }); },
      then(res) { log.push(st); return Promise.resolve({ data: [], error: null }).then(res); }
    };
    return api;
  }, rpc: () => Promise.resolve({ data: null, error: null }) };
  return log;
}
function prep(w) {
  ['reallocatePatientFunds', 'logAudit', 'maybePromptMaterialDeduction', 'followUpRemovedSessions'].forEach(n => { w[n] = async () => {}; });
  w.renderAll = () => {}; w.renderPlanVisits = () => {}; w._rowLbl = () => 'ل.س'; w._rowCur = () => 'SYP'; w.fmt = n => String(n);
  w.SyDialog = { confirm: () => Promise.resolve(true), alert: () => Promise.resolve(), prompt: () => Promise.resolve(null) };
  w.TREATMENTS.push({ id: 'implant', name: 'زراعة', target_part: 'implant', is_active: true, fill: '#999', stroke: '#666' });
  w.TREATMENTS.push({ id: 'bridge_x', name: 'جسر', target_part: 'bridge', is_active: true, fill: '#999', stroke: '#666' });
  w.document.getElementById('toothDate').value = '2026-10-11';
  const cat = w.TREATMENTS;
  const comp = cat.find(t => /كومبوزت/.test(t.name)) || cat.find(t => (t.target_part || 'crown') === 'crown');
  const crown = cat.find(t => t.target_part === 'crown_full');
  return { comp, crown };
}
async function save(w, tooth, surface, key, status) {
  w.currentTooth = tooth; w.currentSurface = surface; w.pendingToothStatus = key; w.pendingToothLabel = key; w.pendingTreatStatus = status;
  w.pendingRegionalType = null; w.toothEntryMode = false; w.pendingBridgeExtra = { mesial: 0, distal: 0 };
  w.document.getElementById('toothCost').value = '1000';
  const log = installDb(w); await w._saveToothTreatment_inner(); return log;
}
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function assertions(src) {
  const fails = [];
  const T = (n, ok, extra) => { if (!ok) fails.push(n + (extra ? ' :: ' + String(extra).slice(0, 260) : '')); };
  const w = await boot(src, 'cc');
  T('0 العُدّة أقلعت', w.__ERRORS.length === 0 && typeof w.subsumeCrownSurfaces === 'function', w.__ERRORS.join(' | '));
  if (fails.length) return fails;
  const { comp, crown } = prep(w);
  const m = n => w.teethMap[String(n)] || {}, dx = n => (w.teethDx || {})[String(n)] || {};
  const tip = n => strip(w.occTipRows(n, m(n)));
  /* A */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 26, 'O', 'cond-caries', 'condition'); await save(w, 26, 'B', 'cond-fracture', 'condition'); await save(w, 26, 'D', comp.id, 'completed');
  w.teethMap['26'].R1 = 'root_canal'; w.teethMap['26'].__status.R1 = 'completed';
  const lA = await save(w, 26, 'CROWN_FULL', crown.id, 'completed');
  const dA = lA.filter(x => x.op === 'delete');
  T('A1 حذفٌ واحد لأسطح التاج O·B·D فقط', dA.length === 1 && dA[0].in.surface.slice().sort().join() === 'B,D,O' && dA[0].eq.tooth_num === '26', JSON.stringify(dA));
  T('A2 الخريطة: الجذرُ باقٍ والأسطحُ ممحوّة والتاجُ منجز', m(26).R1 === 'root_canal' && !m(26).O && !m(26).B && !m(26).D && m(26).CROWN_FULL === crown.id && m(26).__status.CROWN_FULL === 'completed', JSON.stringify(m(26)));
  T('A3 الحالاتُ محمولة dx على التاج', dx(26).CROWN_FULL === 'O:cond-caries,B:cond-fracture' && !dx(26).O && !dx(26).B, JSON.stringify(dx(26)));
  T('A4 التلميح «عولج: تسوس — إطباقي · كسر — دهليزي» ولا «مراقبة»', /عولج: تسوس \(نخر\) — إطباقي · كسر — دهليزي/.test(tip(26)) && !/مراقبة/.test(tip(26)), tip(26));
  const upA = lA.find(x => x.op === 'upsert' && x.payload.surface === 'CROWN_FULL');
  T('A5 صفُّ التاج كُتب بـdx_key', upA && upA.payload.dx_key === 'O:cond-caries,B:cond-fracture', JSON.stringify(upA && upA.payload));
  /* B */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 27, 'O', 'cond-caries', 'condition'); await save(w, 27, 'D', comp.id, 'completed');
  const lB = await save(w, 27, 'CROWN_FULL', crown.id, 'planned');
  const dB = lB.filter(x => x.op === 'delete');
  T('B1 تاجٌ مخطّط: الحالةُ وحدها تُمحى والحشوةُ تبقى', dB.length === 1 && dB[0].in.surface.join() === 'O' && m(27).D === comp.id && !m(27).O, JSON.stringify([dB, m(27)]));
  T('B2 التشخيصُ معلّق على التاج المخطّط', dx(27).CROWN_FULL === 'O:cond-caries' && /التشخيص: تسوس \(نخر\) — إطباقي/.test(tip(27)), tip(27));
  /* C */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 16, 'B', 'cond-fracture', 'condition'); const lC = await save(w, 16, 'WHOLE', 'implant', 'completed');
  T('C1 الزرعة: السنُّ ممحوّ إلا صفَّها', Object.keys(m(16)).filter(k => k[0] !== '_').join() === 'WHOLE' && m(16).WHOLE === 'implant', JSON.stringify(m(16)));
  T('C2 الزرعة تحمل حالةَ السن ولا مرآةَ بائتة', dx(16).WHOLE === 'B:cond-fracture' && !dx(16).B, JSON.stringify(dx(16)));
  const upC = lC.find(x => x.op === 'upsert' && x.payload.surface === 'WHOLE');
  T('C3 صفُّ الزرعة كُتب بـdx_key', upC && upC.payload.dx_key === 'B:cond-fracture', JSON.stringify(upC && upC.payload));
  /* D */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 36, 'O', 'cond-caries', 'condition'); await save(w, 36, 'CROWN_FULL', crown.id, 'completed');
  w.currentTooth = 36; w.currentSurface = 'CROWN_FULL'; installDb(w); try { await w._clearToothStatus_inner(); } catch (e) {}
  T('D1 إزالةُ التاج تعيد النخرَ «condition» على O', m(36).O === 'cond-caries' && m(36).__status.O === 'condition' && !m(36).CROWN_FULL && !dx(36).CROWN_FULL, JSON.stringify([m(36), dx(36)]));
  /* E — v610: حالةٌ على سطحٍ يحمل علاجاً منجزاً ⇒ ملاحظةٌ على العلاج (لا محوَ ولا منع) */
  w.teethMap = {}; w.teethDx = {}; w.sessions = []; w.__TOASTS.length = 0;
  await save(w, 46, 'O', comp.id, 'completed'); const lE = await save(w, 46, 'O', 'cond-fracture', 'condition');
  const upE = lE.filter(x => x.op === 'update');
  T('E1 لا حذفَ ولا upsert — تحديثُ dx_key على صفّ الحشوة فقط', lE.every(x => x.op === 'update') && upE.length === 1 && upE[0].payload.dx_key === 'O:!cond-fracture' && upE[0].eq.surface === 'O' && upE[0].eq.tooth_num === '46', JSON.stringify(lE));
  T('E2 الحشوةُ باقية والملاحظةُ بالمرآة', m(46).O === comp.id && m(46).__status.O === 'completed' && dx(46).O === 'O:!cond-fracture', JSON.stringify([m(46), dx(46)]));
  T('E3 التلميح «ملاحظة: كسر» لا «عولج»', /ملاحظة: كسر/.test(tip(46)) && !/عولج/.test(tip(46)), tip(46));
  T('E4 الرمزُ يُرسم فوق الترميم', w.dxCondView(46, m(46)).O === 'cond-fracture', JSON.stringify(w.dxCondView(46, m(46))));
  T('E5 توستُ الملاحظة', w.__TOASTS.some(x => /ملاحظةً على/.test(x)), JSON.stringify(w.__TOASTS));
  T('E6 زرُّ إزالة الملاحظة بالنافذة', w.dxNoteRowsOf(46).length === 1 && w.dxNoteRowsOf(46)[0].row === 'O' && w.dxNoteRowsOf(46)[0].key === 'cond-fracture', JSON.stringify(w.dxNoteRowsOf(46)));
  /* E7 تخطيطُ بديلٍ على السطح ⇒ الملاحظةُ تصير تشخيصَه */
  const lE7 = await save(w, 46, 'O', comp.id, 'planned');
  const upE7 = lE7.find(x => x.op === 'upsert' && x.payload.surface === 'O'), insE7 = lE7.find(x => x.op === 'insert');
  T('E7 البديلُ المخطّط يحمل الكسرَ تشخيصاً وبجلسته «سبب العلاج»', upE7 && upE7.payload.dx_key === 'O:cond-fracture' && dx(46).O === 'O:cond-fracture' && /التشخيص: كسر/.test(tip(46)) && insE7 && /سبب العلاج: كسر/.test(insE7.payload.notes), JSON.stringify([upE7 && upE7.payload, insE7 && insE7.payload.notes, tip(46)]));
  /* E8 حالةٌ تحت علاجٍ مخطّط ⇒ تشخيصٌ عادي لا ملاحظة */
  const lE8 = await save(w, 46, 'O', 'cond-caries', 'condition');
  T('E8 تحت المخطّط: تشخيصٌ عادي يُضاف', lE8.length === 1 && lE8[0].op === 'update' && lE8[0].payload.dx_key === 'O:cond-fracture,O:cond-caries' && /التشخيص: كسر · تسوس/.test(tip(46)), JSON.stringify([lE8, tip(46)]));
  /* E9 ملاحظةٌ على مركّبٍ (MOD) من سطحٍ واحد + إزالتها */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 47, 'MOD', comp.id, 'completed'); const lE9 = await save(w, 47, 'O', 'cond-fracture', 'condition');
  T('E9 الملاحظةُ على صفّ MOD بسطح O', lE9.length === 1 && lE9[0].eq.surface === 'MOD' && lE9[0].payload.dx_key === 'O:!cond-fracture' && /ملاحظة: كسر — إطباقي/.test(tip(47)), JSON.stringify([lE9, tip(47)]));
  installDb(w); await w._removeDxNote_inner(47, 'MOD', 'O', 'cond-fracture');
  T('E10 إزالةُ الملاحظة تُبقي الحشوة وتصفّر dx', m(47).MOD === comp.id && !dx(47).MOD, JSON.stringify([m(47), dx(47)]));
  /* E11 إزالةُ الحشوة وعليها ملاحظة ⇒ الملاحظةُ تعود حالةً على سطحها */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 48, 'O', comp.id, 'completed'); await save(w, 48, 'O', 'cond-fracture', 'condition');
  w.currentTooth = 48; w.currentSurface = 'O'; installDb(w); try { await w._clearToothStatus_inner(); } catch (e) {}
  T('E11 بعد إزالة الحشوة: كسرٌ «condition» على O', m(48).O === 'cond-fracture' && m(48).__status.O === 'condition', JSON.stringify([m(48), dx(48)]));
  /* E12 قلعٌ بعد ملاحظة ⇒ تُحمل «عولج» */
  w.teethMap = {}; w.teethDx = {}; w.sessions = [];
  await save(w, 38, 'O', comp.id, 'completed'); await save(w, 38, 'O', 'cond-fracture', 'condition'); await save(w, 38, 'WHOLE', 'extracted', 'completed');
  T('E12 القلعُ يحمل الملاحظةَ معالَجة', dx(38).WHOLE === 'O:cond-fracture' && /عولج: كسر — إطباقي/.test(tip(38)), JSON.stringify([dx(38), tip(38)]));
  /* F */
  w.teethMap = { '45': { WHOLE: 'extracted', __status: { WHOLE: 'completed' } } }; w.teethDx = {}; w.sessions = [];
  await save(w, 44, 'O', 'cond-caries', 'condition'); await save(w, 46, 'D', comp.id, 'completed'); await save(w, 46, 'B', 'cond-fracture', 'condition');
  const lF = await save(w, 45, 'WHOLE', 'bridge_x', 'completed');
  const abut44 = lF.find(x => x.op === 'upsert' && x.payload.tooth_num === '44' && x.payload.surface === 'WHOLE');
  const abut46 = lF.find(x => x.op === 'upsert' && x.payload.tooth_num === '46' && x.payload.surface === 'WHOLE');
  const pont45 = lF.find(x => x.op === 'upsert' && x.payload.tooth_num === '45' && x.payload.surface === 'PONTIC');
  T('F1 الجسرُ كُتب: دعامتان وعضوٌ وهمي', abut44 && abut46 && pont45, JSON.stringify(lF.map(x => [x.op, x.payload && x.payload.tooth_num, x.payload && x.payload.surface])));
  T('F2 دعامة 44: النخرُ ممحوٌّ ومحمولٌ على المثبِّت', abut44 && abut44.payload.dx_key === 'O:cond-caries' && !m(44).O && dx(44).WHOLE === 'O:cond-caries', JSON.stringify([abut44 && abut44.payload, m(44), dx(44)]));
  T('F3 دعامة 46 (منجز): الحشوةُ والكسرُ ممحوّان والكسرُ محمول', abut46 && abut46.payload.dx_key === 'B:cond-fracture' && !m(46).D && !m(46).B, JSON.stringify([abut46 && abut46.payload, m(46)]));
  T('F4 العضوُ الوهمي 45 بلا dx وقلعُه باقٍ', pont45 && !pont45.payload.dx_key && m(45).WHOLE === 'extracted' && m(45).PONTIC === 'bridge_x', JSON.stringify([pont45 && pont45.payload, m(45)]));
  /* H — v610: الفحصُ الأولي مرآةُ الوضع العادي: ختمُ حالةٍ على سطحٍ معالج ⇒ ملاحظة + تراجعٌ يعيد dx السابق */
  w.teethMap = {}; w.teethDx = {}; w.sessions = []; w.__TOASTS.length = 0;
  await save(w, 17, 'O', comp.id, 'completed');
  w.__examMode = true; w.examSelectedKey = 'cond-fracture'; w.examStatus = 'condition'; w.examUndoStack = []; w.examCount = 0;
  const lH = installDb(w); await w._examStamp_inner(17, 'O');
  T('H1 ختمُ الفحص يسجّل الملاحظةَ على صفّ الحشوة بلا محو', lH.length === 1 && lH[0].op === 'update' && lH[0].payload.dx_key === 'O:!cond-fracture' && m(17).O === comp.id && dx(17).O === 'O:!cond-fracture', JSON.stringify([lH, m(17), dx(17)]));
  T('H2 التراجعُ بالفحص يعيد dx السابق (فارغاً)', (await (async () => { const l2 = installDb(w); await w._examUndo_inner(); return l2.length === 1 && l2[0].op === 'update' && l2[0].payload.dx_key === null && !dx(17).O && m(17).O === comp.id; })()), JSON.stringify([dx(17), m(17)]));
  w.__examMode = false;
  /* I — v612: اختيارُ حالةٍ سريرية بمودال السن ⇒ مظهرُ توثيقٍ لا جلسة: زرُّ «حفظ» وسمةُ data-cond-ui، وعلاجٌ ⇒ «حفظ كجلسة» بلا سمة */
  w.__examMode = false; await w.openToothModal(47, 'O'); w.pickToothTreatment('cond-caries', 'تسوس (نخر)');
  const btn = w.document.querySelector('#toothFoot .btn-save-m'), st2 = w.document.getElementById('toothStep2');
  T('I1 حالةٌ ⇒ «حفظ» + data-cond-ui', btn.textContent === 'حفظ' && st2.getAttribute('data-cond-ui') === '1', btn.textContent + '/' + st2.getAttribute('data-cond-ui'));
  w.backToStep1(); w.pickToothTreatment(comp.id, comp.name);
  T('I2 علاجٌ ⇒ «حفظ كجلسة» بلا سمة', btn.textContent === 'حفظ كجلسة' && !st2.hasAttribute('data-cond-ui'), btn.textContent + '/' + st2.getAttribute('data-cond-ui'));
  T('I3 CSS يخفي حقولَ الجلسة للحالة', /#toothStep2\[data-cond-ui="1"\] \.form-group:has\(> #toothDate\)/.test(w.__CSS || fs.readFileSync(path.join(ROOT, 'patient-profile.css'), 'utf8')));
  w.closeModal('toothModal');
  T('Z لا أخطاءَ بالصفحة', w.__ERRORS.length === 0, w.__ERRORS.join(' | '));
  return fails;
}

const MUTANTS = [
  ['M1 التاجُ يترك الحالات', "    return isConditionKey(sm[k]) || landed;\n  });\n  if (!del.length) return '';\n  var pairs = dxCollectSubsumed(tn, del);\n  var r = await window.sb.from('teeth_status').delete()\n    .eq('doctor_id', currentUser.id).eq('patient_id', pid || patientId).eq('tooth_num', tn).in('surface', del);\n  if (r.error) { console.warn('subsumeCrownSurfaces:'", "    return landed;\n  });\n  if (!del.length) return '';\n  var pairs = dxCollectSubsumed(tn, del);\n  var r = await window.sb.from('teeth_status').delete()\n    .eq('doctor_id', currentUser.id).eq('patient_id', pid || patientId).eq('tooth_num', tn).in('surface', del);\n  if (r.error) { console.warn('subsumeCrownSurfaces:'"],
  ['M2 التاجُ المخطّط يمحو الحشوات', "var _cdx = await subsumeCrownSurfaces(currentTooth, isExtractionLandedStatus(pendingTreatStatus), patientId);", "var _cdx = await subsumeCrownSurfaces(currentTooth, true, patientId);"],
  ['M3 الزرعةُ لا تحمل الحالات', "return { handled: false, implantWiped: true, implantDx: _iDx };", "return { handled: false, implantWiped: true, implantDx: '' };"],
  ['M4 فرعُ التاج معطَّل بالحفظ المفرد', "if ((currentSurface === 'CROWN_FULL' || currentSurface === 'WHOLE') && pendingTp === 'crown_full') {", "if (false) {"],
  ['M5 مثبِّتُ الدعامة بلا حمل', "        if (_aDx) _aRow.dx_key = _aDx;\n", "\n"],
  ['M6 الملاحظةُ لا تُميَّز عن «عولج»', "  pairs.push({ sf: atSurface, key: condKey, pending: pend });", "  pairs.push({ sf: atSurface, key: condKey, pending: false });"],
  ['M7 الملاحظةُ لا تصير تشخيصَ البديل', "    else out = out.concat(dxPromote(dxOf(num, sf)));", "    else out = out.concat(dxOf(num, sf));"],
  ['M8 الرمزُ لا يُرسم فوق المنجز', "if ((pend || p.pending) && !v[p.sf]) v[p.sf] = p.key;", "if (pend && !v[p.sf]) v[p.sf] = p.key;"],
  ['M9 مظهرُ الحالة لا يتبدّل', "  if (btn) btn.textContent = on ? 'حفظ' : 'حفظ كجلسة';", "  if (btn) btn.textContent = 'حفظ كجلسة';"]
];
(async () => {
  const fails = await assertions(DENTAL);
  if (fails.length) { console.log('prove-condition-conflicts: ' + fails.length + ' فشل'); fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
  const COUNT = (assertions.toString().match(/\bT\('/g) || []).length;
  if (process.argv.includes('--self-test')) {
    let bite = 0;
    for (const [name, a, b] of MUTANTS) {
      if (!DENTAL.includes(a)) { console.log('prove-condition-conflicts: الطفرةُ ' + name + ' لا تجد هدفها'); process.exit(1); }
      const f = await assertions(DENTAL.replace(a, b));
      if (f.length) bite++; else { console.log('prove-condition-conflicts: الطفرةُ لم تعضّ — ' + name); process.exit(1); }
    }
    console.log('prove-condition-conflicts ✅ ' + COUNT + ' توكيداً · ' + bite + '/' + MUTANTS.length + ' طفرات تعضّ');
  } else console.log('prove-condition-conflicts ✅ ' + COUNT + ' توكيداً');
  process.exit(0);
})().catch(e => { console.log('prove-condition-conflicts: خطأ — ' + (e && e.stack || e)); process.exit(1); });

#!/usr/bin/env node
/* ج1 (M226) — مثبتُ «السن الزائد كسنٍّ مستقل» (قرارُ المالك 23 ت٢ 2026 · docs/SUPERNUMERARY.md).
   يحمّل عُدّةَ dom-smoke الحقيقية (pp-*.js الحيّة + مودالُ السن من patient-profile.html) بـjsdom ويثبت:
   ① الرمز: مضيف×10+موضع · الخطُّ الناصف بربعه الأيمن (111/411) · «وحشي» لآخر الربع وحده · فراغٌ واحد = رمزٌ واحد
      (وحشيُّ 12 = إنسيُّ 13 = 131) · التسنينُ اللبني/المختلط · الاسمُ «سن زائد بين 12 و13» لا 51–82.
   ② الشكل: دوالُّ الهندسة تقرأ المضيف (نوع · جذور · أمامي · ربع · حنكي/لساني) والعرضُ أصغر (×0.7).
   ③ الرسم بالمنظرين: بين السنّين بالجهة الصحيحة (الإنسيُّ يميناً بالربعين 1 و4) · وراء آخر سن · الخطُّ الناصف ·
      الدهليزيُّ/الحنكيُّ بممرّ المضيف (الإطباقي: الدهليزيُّ جهةَ الخدّ) · قلعٌ مخطّط ✕ · منجز شبح · خليةُ سنٍّ كاملة على رمزه.
   ④ الخريطة: صفُّ SN لا يدخل teethMap (ولا رمزٌ غير قانوني) · العرضُ التاريخي يعيدها.
   ⑤ نافذتُه: العنوانُ باسمه · لا جسرَ ولا زرعةَ ولا جهازَ · زرُّ إزالته · ومن نافذة سنٍّ عادي «➕ سن زائد» بأماكنه الأربعة
      (المشغولُ معطّل) · الإضافةُ صفٌّ SN واحد (existing_current — لا مراقبة) · الإزالةُ تُرفض وعليه علاج.
   ⑥ الملفات: M226 (SN · بلا SXM/SXD · البيريو يقبل الرموز · التحويلُ والزنادُ موقوفٌ ثم مُعاد) · المحمّلان · patients.html ·
      الخيارُ أ غائبٌ عن الكود · التحديدُ المتعدد والفحصُ الأولي يرفضانه بالإصدار الأول · الإنكليزية.
   ⑧ ج3 (M227 · القرارُ المعدَّل 25 ت٢): لا عمودَ بجدول البيريو — صندوقُ «أسنان زائدة» للموجود الحيّ بمضيفٍ دائم (لا المقلوعُ
      ولا اللبني) · ملاحظةُ ما أُزيل باقيةٌ بفحصها · المسودةُ لفحصها وحده · الحفظُ يكتب المتغيّرَ فقط · المقارنةُ للقراءة ·
      الطباعة · النسخُ للحيّ وحده · نصُّ الطبيب مُهرَّب وخارجُ المترجم · M227 · الإنكليزية.
   --self-test: طفراتٌ متعمَّدة يجب أن يُسقط كلٌّ منها توكيداً واحداً على الأقل (#342). بلا jsdom ⇒ تخطٍّ بـ0. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت السن الزائد (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const SELF = process.argv.includes('--self-test');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const FILES = ['pp-dental.js', 'pp-modules.js', 'patient-profile.html', 'patients.html', 'patient-profile.css', 'i18n-en.js', 'migrations/226_supernumerary_tooth.sql', 'migrations/227_perio_sup_notes.sql', 'scripts/validate.sh',
  'supabase-init.js', 'portal.html'];
/* ج2: مواضعُ عرض السن بالمنصة — كلٌّ يمرّ بـSyTooth (العددُ الأدنى لاستدعاءاته بالملف) */
const SITES = { 'pp-plan.js': 8, 'pp-timeline.js': 4, 'pp-appt.js': 9, 'pp-core.js': 6, 'pp-clinical.js': 6, 'pp-extras.js': 8, 'pp-consent.js': 8, 'pp-wa.js': 2, 'pp-xray.js': 16,
  'appt-modal.js': 10, 'appt-followup.js': 2, 'fu-unbooked.js': 2, 'appt-time.js': 4, 'index.html': 10, 'labs.html': 8, 'lab-redo.js': 2, 'radiology.html': 4,
  'provider-reports.html': 6, 'acc-daysheet.js': 2, 'huddle-flags.js': 3, 'patients.html': 2, 'xray-viewer.js': 4, 'lab-slip.js': 4, 'patient-profile.html': 4 };   /* عددُ «window.SyTooth» بالملف حرفياً — موضعٌ يعود للرقم الخام يُنقصه */   /* عددُ «window.SyTooth» بالملف حرفياً — موضعٌ يعود للرقم الخام يُنقصه */
Object.keys(SITES).forEach(f => { if (!FILES.includes(f)) FILES.push(f); });
const LIVE = {}; FILES.forEach(f => { LIVE[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

function boot(F, label) {
  const tmpD = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.sup-' + label + '.js');
  const tmpM = path.join(__dirname, 'dom-smoke', '.out', 'pp-modules.sup-' + label + '.js');
  fs.writeFileSync(tmpD, F['pp-dental.js']); fs.writeFileSync(tmpM, F['pp-modules.js']);
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmpD).split('file://' + ROOT + '/pp-modules.js').join('file://' + tmpM)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

async function measure(F, label) {
  const w = await boot(F, label), r = {};
  const ev = (s) => w.eval(s);
  const set = (ts, sup) => { ev('teethMap = ' + JSON.stringify(ts) + '; supReset(); ' + JSON.stringify(sup || []) + '.forEach(function(c){ supTake({ tooth_num: c, surface: "SN", status: "existing_current" }); });'
    + 'var _t = rebuildToothMaps(); T_FILL = _t.fill; T_STROKE = _t.stroke; T_LABEL = _t.label; dentitionMode = "permanent"; flipState = {};'); };
  /* ① الرمز */
  r.codeValid = ev("[131,111,411,511,811,182,552,163,164,464,241].every(isSupTooth) && ![211,311,611,711,172,532,125,131.5,'13','1311',95,91,0,null,'',901,195].some(isSupTooth)");
  ev("dentitionMode='permanent'; flipState={};");
  r.codeMidline = ev("supCode(11,'M')===111 && supCode(21,'M')===111 && supCode(41,'M')===411 && supCode(31,'M')===411");
  r.codeOneGapOneCode = ev("supCode(12,'D')===131 && supCode(13,'M')===131 && supCode(23,'D')===241 && supCode(24,'M')===241 && supCode(45,'D')===461");
  r.codeDistalLast = ev("supCode(18,'D')===182 && supCode(28,'D')===282 && supCode(48,'D')===482");
  r.codeBL = ev("supCode(16,'B')===163 && supCode(16,'L')===164 && supCode(46,'L')===464");
  ev("dentitionMode='primary';"); r.codePrimary = ev("supCode(55,'D')===552 && supCode(51,'M')===511 && supCode(61,'M')===511 && supCode(71,'M')===811");
  ev("dentitionMode='mixed'; flipState={15:'primary'};"); r.codeMixed = ev("supCode(55,'D')===161 && supCode(16,'M')===161 && supName(161)==='سن زائد بين 55 و16'");
  ev("dentitionMode='permanent'; flipState={};");
  r.names = ev("supName(131)==='سن زائد بين 12 و13' && supName(111)==='سن زائد بين 11 و21' && supName(411)==='سن زائد بين 31 و41' && supName(182)==='سن زائد وحشي 18'"
    + " && supName(164)==='سن زائد حنكي 16' && supName(464)==='سن زائد لساني 46' && supName(163)==='سن زائد دهليزي 16'");
  r.refs = ev("toothRef(12)===12 && toothRef('131')==='الزائد بين 12 و13' && sessionToothChipText('131','M')==='سن زائد بين 12 و13' && sessionToothChipText('12','M')==='سن 12'");
  /* ② الشكل */
  r.morph = ev("toothType(131)==='canine' && rootsCount(164)===3 && rootsCount(464)===2 && isAnterior(111) && !isAnterior(164) && normQuad(354)===3 && quadrantForTooth(354)==='LL'"
    + " && surfLabelFor('L',164)==='حنكي' && surfLabelFor('L',464)==='لساني' && !isFlippable(131) && isPrimaryTooth(551) && !isPrimaryTooth(131)");
  r.smaller = ev("cellWidth(131)===42 && cellWidth(551)===Math.round(Math.round(60*PRIMARY_TOOTH_SCALE)*0.7) && toothAnatomy(164).cellW===42 && cellWidth(16)===60");
  /* ③ الرسم */
  set({ '131': { M: 'custom_1781292854422', __status: { M: 'completed' } }, '182': { WHOLE: 'extracted', __status: { WHOLE: 'planned' } }, '241': { WHOLE: 'extracted', __status: { WHOLE: 'completed' } } },
      ['131', '111', '182', '241', '251', '411', '461', '163', '164', '354', '211']);
  ev('renderTeeth()');
  const kids = (id) => ev("Array.from(document.getElementById('" + id + "').children).map(function(c){ return c.getAttribute('data-tooth-cell') || c.getAttribute('data-occ-cell') || (c.classList.contains('midline') ? '|' : '?'); })");
  const ku = kids('upperJaw'), kl = kids('lowerJaw'), ko = kids('upperOcc');
  r.betweenRight = ku.indexOf('131') === ku.indexOf('13') - 1 && ko.indexOf('131') === ko.indexOf('13') - 1;   /* الربع 1: الإنسيُّ يميناً = السابقُ بالـDOM (RTL) */
  r.betweenQuad2 = ku.indexOf('251') === ku.indexOf('25') + 1;                                                  /* الربع 2: الإنسيُّ يساراً = التالي */
  r.midline = ku.indexOf('111') === ku.indexOf('|') + 1 && ku.indexOf('11') === ku.indexOf('111') + 1 && kl.indexOf('411') === kl.indexOf('41') - 1;
  r.distalLast = ku.indexOf('182') === ku.length - 1 && ku.indexOf('18') === ku.length - 2 && kl.indexOf('461') === kl.indexOf('46') - 1;
  r.noncanonicalIgnored = ku.indexOf('211') === -1 && ev("!supMap['211'] && !teethMap['211']");
  r.laneFacial = ev("!!document.querySelector('#upperJaw [data-tooth-cell=\"16\"] .sup-lane-box [data-tooth-cell=\"163\"]') && !!document.querySelector('#upperJaw [data-tooth-cell=\"16\"] .sup-lane-box [data-tooth-cell=\"164\"]')"
    + " && !!document.querySelector('#lowerJaw [data-tooth-cell=\"35\"] .sup-lane-box [data-tooth-cell=\"354\"]') && document.getElementById('upperJaw').classList.contains('sup-lane') && document.getElementById('lowerJaw').classList.contains('sup-lane')");
  r.laneOcc = ev("!!document.querySelector('#upperOcc [data-occ-cell=\"16\"] .sup-lane-B [data-occ-cell=\"163\"]') && !!document.querySelector('#upperOcc [data-occ-cell=\"16\"] .sup-lane-L [data-occ-cell=\"164\"]')"
    + " && document.getElementById('upperOcc').classList.contains('sup-lane-top') && document.getElementById('upperOcc').classList.contains('sup-lane-bot')"
    + " && document.getElementById('lowerOcc').classList.contains('sup-lane-top') && !document.getElementById('lowerOcc').classList.contains('sup-lane-bot')");
  r.fullToothCell = ev("(function(){ var c=document.querySelector('#upperJaw > [data-tooth-cell=\"131\"]'); return !!c && c.classList.contains('sup-cell') && !!c.querySelector('.crown-surface[data-tooth=\"131\"][data-surface=\"M\"]')"
    + " && c.querySelector('svg.tooth-shape').getAttribute('width')==='42' && c.querySelector('.tooth-num').textContent==='+' && c.title==='السن الزائد بين 12 و13' && /fill-opacity/.test(c.innerHTML); })()");
  /* قرارُ المالك 24 ت٢: المخطّطُ ✕ فوق السن · المنجزُ يُخفيه من المنظرين (لا شبح) ولا شارةَ له */
  r.extractionStates = ev("!!document.querySelector('[data-tooth-cell=\"182\"] .planned-x') && !document.querySelector('[data-tooth-cell=\"241\"]') && !document.querySelector('[data-occ-cell=\"241\"]') && supExists(241)");
  r.noLaneWhenNone = (set({}, ['131']), ev("renderTeeth(); !document.getElementById('upperJaw').classList.contains('sup-lane') && !document.getElementById('upperOcc').classList.contains('sup-lane-top')"));
  /* ④ الخريطة */
  r.takeSwallows = ev("supReset(); var a=supTake({tooth_num:'131',surface:'SN',status:'existing_current'}), b=supTake({tooth_num:'211',surface:'SN'}), c=supTake({tooth_num:'131',surface:'M'});"
    + " a===true && b===true && c===false && !!supMap['131'] && !supMap['211']");
  r.history = ev("supHistBegin(); var e=supCodes().length===0; supTake({tooth_num:'164',surface:'SN'}); var h=supExists(164); supHistEnd(); e && h && supExists(131) && !supExists(164)");
  /* ⑤ نافذتُه */
  set({}, ['131']); ev('renderTeeth(); window.__WRITES.length=0;');
  /* الكتالوجُ بالعُدّة بلا جسرٍ ولا زرعة — يُضافان كي يُثبَت غيابُهما عن نافذة الزائد وحضورُ الجسر على سنٍّ عادي */
  ev("(function(){ var c=TREATMENTS.filter(function(t){ return t.target_part==='crown_full'; })[0]; var b=JSON.parse(JSON.stringify(c)); b.id='bridge'; b.name='جسر'; b.target_part='bridge';"
    + " var i=JSON.parse(JSON.stringify(c)); i.id='implant'; i.name='زراعة'; i.target_part='implant'; TREATMENTS.push(b,i); })()");
  await ev("openToothModal(131,'M')");
  r.modalTitle = ev("document.getElementById('toothModalTitle').textContent.indexOf('السن الزائد بين 12 و13')===0");
  r.modalAllowed = ev("(function(){ var tp=(_txAllowed||[]).map(function(t){return t.target_part||'crown';}); return tp.indexOf('extraction')!==-1 && tp.indexOf('crown')!==-1 && tp.indexOf('bridge')===-1 && tp.indexOf('implant')===-1"
    + " && !(_txAllowed||[]).some(function(t){ return t.id===COND_CONTACT_ID || (window.SyDenture && window.SyDenture.isTreatment(t)); }); })()");
  r.modalRemoveBtn = ev("/sup-remove-btn/.test(_txSpecialHtml) && !/sup-add-btn/.test(_txSpecialHtml)");
  ev("closeModal('toothModal')");
  await ev("openToothModal(12,'M')");
  r.modalAddBtn = ev("/sup-add-btn/.test(_txSpecialHtml) && !/sup-remove-btn/.test(_txSpecialHtml) && (_txAllowed||[]).some(function(t){ return t.target_part==='bridge'; })");
  ev("supOpenPicker(12)");
  r.picker = ev("(function(){ var b=Array.from(document.querySelectorAll('.sup-place')); return b.length===4 && b.map(function(x){return x.getAttribute('data-sup-where')+(x.disabled?'-':'+');}).join(',')==='M+,D-,B+,L+'"
    + " && /سن زائد بين 11 و12/.test(b[0].textContent) && /سن زائد حنكي 12/.test(b[3].textContent) && document.getElementById('toothModal').classList.contains('sup-picking'); })()");
  await ev("supAdd(12,'B')");
  r.addWrites = ev("(function(){ var w=window.__WRITES.filter(function(x){return x.table==='teeth_status';}); return w.length===1 && w[0].op==='upsert' && w[0].payload.tooth_num==='123' && w[0].payload.surface==='SN'"
    + " && w[0].payload.treatment_key==='sup-present' && w[0].payload.status==='existing_current' && supExists(123) && !teethMap['123'] && !!document.querySelector('#upperJaw [data-tooth-cell=\"123\"]'); })()");
  ev("window.__WRITES.length=0;"); await ev("supAdd(12,'B')");
  r.onePerPlace = ev("window.__WRITES.length===0 && /واحدٌ بكل مكان/.test(window.__TOASTS[window.__TOASTS.length-1])");
  ev("window.__alerts=[]; window.SyDialog=window.SyDialog||{}; SyDialog.alert=async function(o){ window.__alerts.push(o.message||o); }; SyDialog.confirm=async function(){ return true; }; sessions=[{id:'s1',tooth_num:'131',surface:'M',status:'completed'}]; window.__WRITES.length=0;");
  await ev("supRemove(131)");
  r.removeRefused = ev("window.__WRITES.length===0 && window.__alerts.length===1 && supExists(131)");
  ev("sessions=[]; teethMap['123']={ COND: 'cond-abscess', __status: { COND: 'condition' } }; window.__WRITES.length=0;");
  await ev("supRemove(123)");
  r.removeDone = ev("(function(){ var w=window.__WRITES.filter(function(x){return x.table==='teeth_status';}); return w.length===1 && w[0].op==='delete' && !supExists(123) && !teethMap['123']; })()");
  ev("teethMap['131']={ WHOLE: 'extracted', __status: { WHOLE: 'completed' } }; supTake({tooth_num:'131',surface:'SN'}); renderTeeth();");
  await ev("openToothModal(12,'M')"); ev("supOpenPicker(12)");
  r.pickerRestoresExtracted = ev("(function(){ var d=document.querySelector('.sup-place[data-sup-where=\"D\"]'); return !!d && !d.disabled && d.classList.contains('sup-place-gone') && d.getAttribute('onclick')==='undoExtraction(131)' && /قُلع/.test(d.textContent) && !document.querySelector('#upperJaw [data-tooth-cell=\"131\"]'); })()");
  ev("closeModal('toothModal')");
  /* ج2: الفحصُ الأولي والتحديدُ المتعدد يقبلانه بمسند نافذة السن نفسه */
  set({}, ["131"]); ev("renderTeeth()");
  r.examBatchShared = ev("(function(){ var f=getTreatment('custom_1781292854422'), x=getTreatment('extracted'), oc=getCondition(COND_CONTACT_ID), br=TREATMENTS.filter(function(t){return t.target_part==='bridge';})[0];"
    + " return examAllowed(131,f).ok && batchAllowed(131,f,'M').ok && examAllowed(131,x).ok && !examAllowed(131,oc).ok && /بين سنَّين/.test(examAllowed(131,oc).msg)"
    + " && !batchAllowed(131,br,'WHOLE').ok && batchAllowed(12,br,'WHOLE').ok !== undefined && supTxRefusal(12,br)===null && supTxRefusal(131,br)!==null; })()");
  ev("window.__TOASTS.length=0; window.__WRITES.length=0; examSelectedKey='cond-caries'; examStatus='existing_other';");
  await ev("examStamp(131,'M')");
  r.examStamps = ev("(function(){ var w=window.__WRITES.filter(function(x){return x.table==='teeth_status';}); return w.length===1 && w[0].payload.tooth_num==='131' && w[0].payload.surface==='M' && w[0].payload.treatment_key==='cond-caries'; })()");
  ev("examSelectedKey=null; window.__examMode=false;");
  /* ⑧ ج3: ملاحظةُ السن الزائد بفحص اللثة */
  ev("var _pp=document.createElement('div'); _pp.id='tab-perio'; _pp.innerHTML='<div id=\"perioStats\"></div><div class=\"card\"><div id=\"perioSupBox\" hidden></div></div>'; document.body.appendChild(_pp);");
  set({ '241': { WHOLE: 'extracted', __status: { WHOLE: 'completed' } } }, ['131', '164', '241', '511']);
  r.perioLiveCodes = ev("isExtractionDone(241) && JSON.stringify(supPerioCodes())==='[\"131\",\"164\"]'");
  r.perioHistoryLive = ev("(function(){ var tm=teethMap; supHistBegin(); window.__historyMode=true; liveTeethMapRef=tm; teethMap={};"
    + " var ok=JSON.stringify(supPerioCodes())==='[\"131\",\"164\"]'; teethMap=tm; liveTeethMapRef=null; window.__historyMode=false; supHistEnd(); return ok && supCodes().length===4; })()");
  ev("perioCompare=false; perioCmpExam=null; perioSupDraft=null; perioCurrent={ id:'E2', exam_date:'2026-11-20', sup_notes:{ '131':'جيب 5', '284':'قديمة' } }; perioSupRender();");
  r.perioBox = ev("(function(){ var b=document.getElementById('perioSupBox'), rows=Array.from(b.querySelectorAll('.perio-sup-row')).map(function(e){return e.getAttribute('data-sup-row');});"
    + " return !b.hidden && rows.join()==='131,164,284' && !!b.querySelector('[data-sup-row=\"284\"] .perio-sup-gone') && !b.querySelector('[data-sup-row=\"131\"] .perio-sup-gone')"
    + " && b.querySelector('input[data-sup=\"131\"]').value==='جيب 5' && b.querySelector('[data-sup-row=\"164\"] .perio-sup-name').textContent==='سن زائد حنكي 16' && b.querySelector('input[data-sup=\"164\"]').getAttribute('maxlength')==='300'; })()");
  await ev("(async function(){ var b=document.getElementById('perioSupBox'), i1=b.querySelector('input[data-sup=\"164\"]'), i2=b.querySelector('input[data-sup=\"284\"]');"
    + " i1.value='\"><img src=x>'; perioSupInput(i1); if (i2) { i2.value='  '; perioSupInput(i2); } window.__WRITES.length=0; await _perioSave_inner();"
    + " window.__P3=window.__WRITES.filter(function(x){return x.table==='perio_exams';}); window.__WRITES.length=0; await _perioSave_inner();"
    + " window.__P3b=window.__WRITES.filter(function(x){return x.table==='perio_exams';}).length; })()");
  r.perioSaveChangedOnly = ev("(function(){ var w=window.__P3; return w.length===1 && w[0].op==='update' && JSON.stringify(w[0].payload)===JSON.stringify({ sup_notes:{ '131':'جيب 5', '164':'\"><img src=x>' } })"
    + " && perioCurrent.sup_notes['164']==='\"><img src=x>' && !perioCurrent.sup_notes['284'] && perioSupDraft===null && window.__P3b===0; })()");
  ev("perioSupRender();");
  r.perioEscaped = ev("!document.querySelector('#perioSupBox img') && document.querySelector('#perioSupBox input[data-sup=\"164\"]').value==='\"><img src=x>'");
  r.perioDraftPerExam = ev("(function(){ var i=document.querySelector('#perioSupBox input[data-sup=\"131\"]'); i.value='مسودة'; perioSupInput(i); var a=perioSupNotesNow()['131']==='مسودة';"
    + " var keep=perioCurrent; perioCurrent={ id:'E1', exam_date:'2026-10-01', sup_notes:{ '131':'قبل' } }; var b=perioSupNotesNow()['131']==='قبل'; perioCurrent=keep; perioSupDraft=null; return a && b; })()");
  ev("perioCompare=true; perioCmpExam={ id:'E1', exam_date:'2026-10-01', sup_notes:{ '131':'قبل' } }; perioSupRender();");
  r.perioCompareReadOnly = ev("(function(){ var b=document.getElementById('perioSupBox'), ins=b.querySelectorAll('.perio-sup-in'), pv=b.querySelector('[data-sup-row=\"131\"] .perio-sup-prev');"
    + " var ro=Array.prototype.every.call(ins,function(x){return x.readOnly;}); ins[0].value='تغيير'; perioSupInput(ins[0]);"
    + " return ro && perioSupDraft===null && !!pv && !!pv.querySelector('span[data-i18n-skip]') && pv.querySelector('span[data-i18n-skip]').textContent==='قبل'; })()");
  r.perioPrint = ev("(function(){ var h=perioSupPrintHtml(); return h.indexOf('سن زائد بين 12 و13')!==-1 && h.indexOf('<span data-i18n-skip>جيب 5</span>')!==-1 && h.indexOf('<span data-i18n-skip>قبل</span>')!==-1 && h.indexOf('<img')===-1; })()");
  ev("perioCompare=false; perioCmpExam=null; supReset(); perioCurrent={ id:'E3', exam_date:'2026-11-25', sup_notes:null }; perioSupRender();");
  r.perioNoSupNoBox = ev("document.getElementById('perioSupBox').hidden && document.getElementById('perioSupBox').innerHTML==='' && perioSupPrintHtml()===''");
  r.perioClean = ev("JSON.stringify(perioSupClean({ '131':'  ', '511':'x', '13':'y', '164':new Array(402).join('a') }))===JSON.stringify({ '164':new Array(301).join('a') }) && perioSupClean({})===null && perioSupClean(null)===null");
  r.noJsErrors = ev('(window.__ERRORS||[]).length === 0');
  /* ⑥ الملفات */
  const M = F['migrations/226_supernumerary_tooth.sql'], PH = F['patient-profile.html'], PT = F['patients.html'], PD = F['pp-dental.js'], PM = F['pp-modules.js'];
  const ts = /ALTER TABLE public\.teeth_status ADD CONSTRAINT teeth_status_surface_check[\s\S]*?\);/.exec(M), ls = /ALTER TABLE public\.ledger_sessions ADD CONSTRAINT ledger_sessions_surface_check[\s\S]*?\);/.exec(M);
  r.migSurfaces = !!ts && /'SN'::text/.test(ts[0]) && /'DENTURE'::text/.test(ts[0]) && !/SX[MD]/.test(ts[0]) && !!ls && !/SX[MD]|'SN'/.test(ls[0]);
  r.migPerio = /perio_measurements_tooth_num_check[\s\S]*tooth_num >= 11 AND tooth_num <= 48[\s\S]*tooth_num >= 111 AND tooth_num <= 484[\s\S]*tooth_num % 10 BETWEEN 1 AND 4/.test(M);
  r.migConvert = /DISABLE TRIGGER trg_teeth_status_history[\s\S]*'SN', 'sup-present', 'existing_current'[\s\S]*'WHOLE', t\.treatment_key[\s\S]*DELETE FROM public\.teeth_status WHERE surface IN \('SXM', 'SXD'\)[\s\S]*UPDATE public\.ledger_sessions[\s\S]*UPDATE public\.teeth_status_history[\s\S]*ENABLE TRIGGER trg_teeth_status_history/.test(M);
  /* دالةُ التحويل بالـSQL = supCode بالواجهة (تُقيَّم هنا بنقلها حرفياً إلى JS) */
  const fx = /CASE WHEN h % 10 = 1 AND \(h \/ 10\) IN \(2, 3, 6, 7\)\s*THEN \(CASE WHEN \(h \/ 10\) % 2 = 0 THEN \(h \/ 10\) - 1 ELSE \(h \/ 10\) \+ 1 END\) \* 100 \+ 11\s*ELSE h \* 10 \+ 1 END/.test(M)
    && /WHEN \(\(h \/ 10\) >= 5 AND h % 10 = 5\) OR \(\(h \/ 10\) <= 4 AND h % 10 = 8\)\s*THEN h \* 10 \+ 2\s*ELSE \(h \+ 1\) \* 10 \+ 1 END/.test(M);
  r.migSameScheme = fx;
  r.loaders = /if \(window\.SyDenture && window\.SyDenture\.take\(t\)\) return;[^\n]*\n\s*if \(typeof supTake === 'function' && supTake\(t\)\) return;[^\n]*\n\s*var n = String\(t\.tooth_num\);/.test(PH)
    && /if \(window\.SyDenture && window\.SyDenture\.take\(ev\)\) return;[^\n]*\n\s*if \(typeof supTake === 'function' && supTake\(ev\)\) return;/.test(PH)
    && /supReset\(\);[^\n]*\n\s*if \(window\.SyDenture\) window\.SyDenture\.reset\(\);[^\n]*\n\s*\(td \|\| \[\]\)\.forEach\(ppIngestToothRow\);/.test(PH) && /supHistBegin\(\)/.test(PH) && /supHistEnd\(\)/.test(PH);
  r.patientsWatch = /return s === 'COND' \|\| s === 'SN';/.test(PT);
  r.optionAGone = !/isSxSurface\(|sxCellsFor\(|condStorageSurface\(|'cond-supernumerary'|'SXM'|'SXD'/.test(PD + PM + PT + PH);
  r.addNotCondition = /treatment_key: SUP_KEY, status: 'existing_current'/.test(PD);
  r.newSessionLists = /html \+= '<div class="nse-row nse-sup">';/.test(PD) && /onclick="nsePick\(' \+ c \+ '\)">' \+ escapeHtml\(supName\(c\)\)/.test(PD);   /* ج2: «جلسة جديدة» تعرض أسنانَه الزائدة باسمها */
  r.removeSparesDenture = /\.eq\('tooth_num', tn\)\.neq\('surface', 'DENTURE'\);   \/\* M202: نمطُ كلِّ محوٍ بلا سطح \*\//.test(PD);
  r.cssLane = /#upperJaw\.sup-lane > \.tooth-cell\{padding-bottom:56px;\}/.test(F['patient-profile.css']) && /#lowerJaw > \.sup-cell\{align-self:flex-start;\}/.test(F['patient-profile.css']);
  /* ⑧ ج3 — المصادر: لا عمود · التحميلُ والنسخُ وإعادةُ الفتح · M227 */
  const M7 = F['migrations/227_perio_sup_notes.sql'];
  r.perioNoColumn = /function perioIsMolar\(t\)\{ return \(t % 10\) >= 6; \}/.test(PM) && !/supMorph/.test(PM)
    && /document\.getElementById\('perioUpper'\)\.innerHTML = perioArchHtml\(UPPER_T, 'حنكي'\);/.test(PM) && /<div class="perio-sup-box" id="perioSupBox" hidden><\/div>/.test(PH);
  r.perioWiring = /\.select\('id, provider_id, exam_date, notes, sup_notes, created_at'\)/.test(PM) && /if \(perioInited\) \{ perioSupRender\(\); return; \}/.test(PM)
    && /perioSupDraft = null;   \/\* ج3/.test(PM) && /if \(_live\.indexOf\(k\) !== -1\) _cp\[k\] = _src\[k\];/.test(PM)
    && /perioPrintArch\(LOWER_T, 'لساني', perioSrc, perioCompare \? perioCmpRows : null\)\n    \+ perioSupPrintHtml\(\)\n/.test(PM);
  r.migM227 = !!M7 && /k !~ '\^\[1-4\]\[1-8\]\[1-4\]\$'/.test(M7) && /length\(v #>> '\{\}'\) > 300/.test(M7) && /length\(btrim\(v #>> '\{\}'\)\) = 0/.test(M7)
    && /REVOKE ALL ON FUNCTION public\._perio_sup_notes_ok\(jsonb\) FROM PUBLIC, anon;/.test(M7) && /ADD COLUMN IF NOT EXISTS sup_notes JSONB/.test(M7)
    && /CHECK \(public\._perio_sup_notes_ok\(sup_notes\)\)/.test(M7) && /RAISE EXCEPTION 'M227/.test(M7)
    && /ADD CONSTRAINT perio_measurements_tooth_num_check\n  CHECK \(tooth_num >= 11 AND tooth_num <= 48\);/.test(M7);
  r.gate = /prove-supernumerary\.js" --self-test/.test(F['scripts/validate.sh']);
  /* ⑦ ج2 — SyTooth: مصدرُ الاسم بالمنصة = رمزُ المخطط حرفياً (كلُّ 0–999) · مرآةُ البوابة العامة · كلُّ موضع عرضٍ يمرّ به */
  const SI = F['supabase-init.js'], i0 = SI.indexOf('window.SyTooth = (function'), i1 = SI.indexOf('})();', i0) + 5;
  const sx = { window: {} }; vm.createContext(sx); vm.runInContext(SI.slice(i0, i1), sx); const ST = sx.window.SyTooth;
  const PO = F['portal.html'], pfs = ['ptSupPlace', 'ptToothNum', 'ptTeethText'].map(n => { const a = PO.indexOf('function ' + n + '('); let d = 0, k = PO.indexOf('{', a); for (; k < PO.length; k++) { if (PO[k] === '{') d++; else if (PO[k] === '}' && !--d) break; } return PO.slice(a, k + 1); });
  const px = {}; vm.createContext(px); vm.runInContext(pfs.join('\n'), px);
  const w2 = await boot(F, label + '-st'); w2.eval("dentitionMode='permanent'; flipState={};");
  let same = true, mirror = true;
  for (let c = 0; c < 1000; c++) {
    const a = String(c).padStart(c < 100 ? 2 : 3, '0'), sup = w2.isSupTooth(a);
    if (sup !== ST.isSup(a)) { same = false; break; }
    if (sup && c < 500 && (w2.supPlace(a) !== ST.place(a) || ST.chip(a) !== w2.supName(a))) { same = false; break; }   /* المضيفُ الدائم: المخططُ والمنصة بالاسم نفسه (اللبنيُّ يسمّيه المخطط بالظاهر حسب التسنين) */
    if ((px.ptSupPlace(a) || null) !== (sup ? ST.place(a) : null)) { mirror = false; break; }
  }
  w2.close();
  r.syToothSameAsChart = same && ST.chip('12') === 'سن 12' && ST.the('131') === 'السن الزائد بين 12 و13' && ST.num('164') === 'زائد حنكي 16' && ST.num('45,44') === '45,44'
    && ST.list('131، 12') === 'زائد بين 12 و13، 12' && ST.the(' 12') === 'السن 12';
  /* مراجعةُ ج2: ورقةُ المخبر تقرأ رمزَ الزائد وتسمّيه (كانت تُسقطه: 11–85 فقط) · حقلُ «رقم السن» يسمّيه ولا يقصّه السهمان */
  const LS = F['lab-slip.js'];
  const pt = (() => { const a = LS.indexOf('function parseTeeth('); let d = 0, k = LS.indexOf('{', a); for (; k < LS.length; k++) { if (LS[k] === '{') d++; else if (LS[k] === '}' && !--d) break; } const c2 = { window: { SyTooth: ST } }; vm.createContext(c2); vm.runInContext(LS.slice(a, k + 1), c2); return c2.parseTeeth; })();
  r.labSlipKeepsSup = JSON.stringify(pt('131، 12')) === '[12,131]' && JSON.stringify(pt('211, 95')) === '[]' && /var _fdi = \(d\.teeth \|\| \[\]\)\.filter\(function \(t\) \{ return t < 100; \}\);/.test(LS)
    && /esc\(d\.teeth\.map\(function \(t\) \{ return \(typeof window !== 'undefined' && window\.SyTooth\) \? window\.SyTooth\.num\(t\) : t; \}\)\.join\('، '\)\)/.test(LS);
  const hx = (() => { const a = SI.indexOf('window.labToothHint = function'); return SI.slice(a, SI.indexOf('\n};', a) + 3); })();
  const mk = (v, max) => { const at = { max: max }; return { value: v, getAttribute: k => (k in at ? at[k] : null), setAttribute: (k, x) => { at[k] = String(x); }, removeAttribute: k => { delete at[k]; }, at }; };
  const runHint = (v, max) => { const inp = mk(v, max), out = { textContent: '', hidden: true }; const c3 = { window: { SyTooth: ST }, document: { getElementById: id => id === 'labOrderTooth' ? inp : out } }; vm.createContext(c3); vm.runInContext(hx, c3); c3.window.labToothHint(); return { inp, out }; };
  const h1 = runHint('131', '85'), h2 = runHint('36', '85');
  r.labToothNamed = h1.out.textContent === 'سن زائد بين 12 و13' && !h1.out.hidden && !('max' in h1.inp.at) && h2.out.hidden && h2.inp.at.max === '85'
    && (F['patient-profile.html'].match(/oninput="labToothHint\(\)"/g) || []).length === 1 && /<div id="labOrderToothName" class="lab-tooth-name" hidden><\/div>/.test(F['labs.html']);
  r.portalMirror = mirror && px.ptTeethText('241، 21') === 'زائد بين 23 و24، 21' && /var _pl = ptSupPlace\(it\.tooth\); return _pl \? 'سن زائد ' \+ esc\(_pl\)/.test(PO);
  r.sitesUseSyTooth = Object.keys(SITES).every(f => (F[f].match(/window\.SyTooth/g) || []).length === SITES[f]);
  /* الإنكليزية: المحرّكُ الحقيقي يقرأ القاموسَ والأنماط من i18n-en.js */
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(F['i18n-en.js'], ctx);
  const D = ctx.window.SyI18nDict, P = ctx.window.SyI18nPatterns;
  const tr = (s) => { if (D[s] != null) return D[s]; for (const p of P) if (p[0].test(s)) return s.replace(p[0], p[1]); return null; };
  r.english = tr('سن زائد بين 12 و13') === 'Supernumerary tooth between 12 and 13' && tr('السن الزائد حنكي 16') === 'Supernumerary tooth palatal to 16'
    && tr('سن زائد لساني 46') === 'Supernumerary tooth lingual to 46' && tr('✅ أُضيف سن زائد وحشي 18 — انقره لتسجيل علاجاته') === '✅ Added a supernumerary tooth distal to 18 — click it to record its treatments'
    && tr('قُلع — اضغط لإعادته') === 'Extracted — tap to restore it' && tr('سن زائد') === 'Supernumerary tooth' && tr('إزالة السن الزائد') === 'Remove the supernumerary tooth' && tr('مكان السن الزائد حول السن 12') === 'Where is the supernumerary tooth around tooth 12'
    && /^The supernumerary tooth between 12 and 13 has recorded treatments \(2\)\./.test(tr('على سن زائد بين 12 و13 علاجاتٌ مسجّلة (2). أزلها أولاً من نافذته، ثم أزل السن الزائد.') || '');
  r.english3 = tr('🦷 أسنان زائدة') === '🦷 Supernumerary teeth' && tr('أسنان زائدة') === 'Supernumerary teeth' && tr('لم يعد موجوداً') === 'no longer present' && tr('ملاحظة…') === 'Note…'
    && tr('ملاحظة سن زائد حنكي 16') === 'Note on the supernumerary tooth palatal to 16' && tr('ملاحظة سن زائد بين 12 و13') === 'Note on the supernumerary tooth between 12 and 13'
    && tr('كان (1/10/2026):') === 'Was (1/10/2026):' && /^A supernumerary tooth is not in the measurement table/.test(tr('السن الزائد لا يدخل جدول القياسات — اكتب ملاحظتك عليه هنا (جيب، نزف، حركة…)') || '');
  w.close();
  return r;
}

const rep = (f, a, b) => ({ f, a, b });
const MUT = [
  ['midline not normalised', rep('pp-dental.js', "(q === 2 || q === 3 || q === 6 || q === 7) ? (q % 2 === 0 ? q - 1 : q + 1) * 100 + 11 : host * 10 + 1", "host * 10 + 1")],
  ['distal of a middle tooth gets its own code', rep('pp-dental.js', "c = nb ? nb * 10 + 1 : host * 10 + 2;", "c = host * 10 + 2;")],
  ['mesial drawn on the wrong side', rep('pp-dental.js', "if (p === 1) push(mr ? plan.before : plan.after, i, c);", "if (p === 1) push(mr ? plan.after : plan.before, i, c);")],
  ['shape not routed to the host', rep('pp-dental.js', "function toothType(num) {\n  var n = parseInt(supMorph(num), 10),", "function toothType(num) {\n  var n = parseInt(num, 10),")],
  ['not smaller', rep('pp-dental.js', "return isSupTooth(num) ? Math.round(w * SUP_SCALE) : w;", "return w;")],
  ['palatal lane on the cheek side', rep('pp-dental.js', "el.classList.toggle('sup-lane-top', R[2] ? plan.laneB : plan.laneL);", "el.classList.toggle('sup-lane-top', R[2] ? plan.laneL : plan.laneB);")],
  ['SN row leaks into teethMap', rep('patient-profile.html', "  if (typeof supTake === 'function' && supTake(t)) return;", "  ")],
  ['remove wipes a denture row', rep('pp-dental.js', ".eq('tooth_num', tn).neq('surface', 'DENTURE');   /* M202: نمطُ كلِّ محوٍ بلا سطح */", ".eq('tooth_num', tn);")],
  ['history not rebuilt', rep('pp-dental.js', "function supHistBegin(){ if (_supLiveRef === null) _supLiveRef = supMap; supMap = {}; }", "function supHistBegin(){ }")],
  ['bridge offered on a supernumerary', rep('pp-dental.js', "  if (tp === 'bridge' || tp === 'implant' || tp === 'quadrant' || tp === 'arch' || tp === 'mouth') return 'السن الزائد لا يقبل جسراً ولا زرعة';", "")],
  ['presence saved as a watch', rep('pp-dental.js', "treatment_key: SUP_KEY, status: 'existing_current'", "treatment_key: SUP_KEY, status: 'condition'")],
  ['removed with treatments on it', rep('pp-dental.js', "  if (sess.length || work.length) {", "  if (false) {")],
  ['two in one place', rep('pp-dental.js', "  if (supExists(c)) { showToast(", "  if (false) { showToast(")],
  ['extracted supernumerary still drawn', rep('pp-dental.js', "    if (isExtractionDone(c)) return;   /* قرارُ المالك (24 ت٢)", "    if (false) return;   /* قرارُ المالك (24 ت٢)")],
  ['extracted place cannot be restored', rep('pp-dental.js', "    h += (gone\n", "    h += (false\n")],
  ['SyTooth midline not normalised', rep('supabase-init.js', "return 'بين ' + Math.min(h, t) + ' و' + Math.max(h, t); }\n      return 'بين ' + (h - 1) + ' و' + h;", "return 'بين ' + h + ' و' + t; }\n      return 'بين ' + (h - 1) + ' و' + h;")],
  ['portal mirror drifts', rep('portal.html', "  if (p === 3) return 'دهليزي ' + h;\n  return ((q === 1", "  if (p === 3) return 'شدقي ' + h;\n  return ((q === 1")],
  ['plan line keeps the raw number', rep('pp-plan.js', "    if (s.tooth_num != null) label += ' (' + ((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.chip(s.tooth_num) : 'سن ' + s.tooth_num) + ')';", "    if (s.tooth_num != null) label += ' (سن ' + s.tooth_num + ')';")],
  ['lab badge keeps the raw number', rep('labs.html', "(lo.tooth_num ? '<span class=\"tooth-badge\">' + escapeHtml(((typeof window !== 'undefined' && window.SyTooth) ? window.SyTooth.chip(lo.tooth_num) : 'سن ' + lo.tooth_num)) + '</span>'", "(lo.tooth_num ? '<span class=\"tooth-badge\">سن ' + lo.tooth_num + '</span>'")],
  ['multi-select ignores the shared refusal', rep('pp-modules.js', "  var _sup = (typeof supTxRefusal === 'function') ? supTxRefusal(n, t) : null; if (_sup) return { ok: false, msg: _sup };", "  var _sup = null;")],
  ['initial exam ignores the shared refusal', rep('pp-modules.js', "  var _sup = (typeof supTxRefusal === 'function') ? supTxRefusal(n, t) : null; if (_sup) return { ok: false, msg: '🦷 ' + _sup };", "  var _sup = null;")],
  ['lab slip drops the code', rep('lab-slip.js', "      if (((n >= 11 && n <= 85 && n % 10 >= 1 && n % 10 <= 8) || sup) && out.indexOf(n) === -1) out.push(n);", "      if ((n >= 11 && n <= 85 && n % 10 >= 1 && n % 10 <= 8) && out.indexOf(n) === -1) out.push(n);")],
  ['lab field arrows clip the code', rep('supabase-init.js', "  if (sup) i.removeAttribute('max'); else", "  if (false) i.removeAttribute('max'); else")],
  ['taken place still clickable', rep('pp-dental.js', "'\"' + (taken ? ' disabled' : '') + ' onclick=\"supAdd(", "'\"' + ' onclick=\"supAdd(")],
  ['migration keeps SXM', rep('migrations/226_supernumerary_tooth.sql', "'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SN'::text, 'DENTURE'::text,", "'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SN'::text, 'SXM'::text, 'DENTURE'::text,")],
  ['migration conversion ≠ UI scheme', rep('migrations/226_supernumerary_tooth.sql', "           ELSE (h + 1) * 10 + 1 END", "           ELSE h * 10 + 2 END")],
  ['english name dropped', rep('i18n-en.js', "if (m) return 'between ' + m[1] + ' and ' + m[2];", "if (m) return p;")],
  ['perio: extracted supernumerary gets a note row', rep('pp-dental.js', "&& Math.floor(supHost(c) / 10) <= 4 && !isExtractionDone(c); }).sort();", "&& Math.floor(supHost(c) / 10) <= 4; }).sort();")],
  ['perio: primary host included', rep('pp-dental.js', "return isSupTooth(c) && Math.floor(supHost(c) / 10) <= 4 && !isExtractionDone(c);", "return isSupTooth(c) && !isExtractionDone(c);")],
  ['perio: history reads the emptied map', rep('pp-dental.js', "  var m = _supLiveRef || supMap, saved = teethMap;", "  var m = supMap, saved = teethMap;")],
  ['perio: draft leaks to another exam', rep('pp-modules.js', "  if (perioSupDraft && perioSupDraft.exam === perioCurrent.id) return perioSupDraft.notes;", "  if (perioSupDraft) return perioSupDraft.notes;")],
  ['perio: note never saved', rep('pp-modules.js', "  if (!perioSupSame(supNotes, perioCurrent.sup_notes)) {", "  if (false) {")],
  ['perio: writes on every save', rep('pp-modules.js', "  if (!perioSupSame(supNotes, perioCurrent.sup_notes)) {", "  if (true) {")],
  ['perio: empty note saved', rep('pp-modules.js', "    if (v && n < 40) { out[k] = v; n++; }", "    if (n < 40) { out[k] = v; n++; }")],
  ['perio: no length cap', rep('pp-modules.js', "var v = typeof o[k] === 'string' ? o[k].trim().slice(0, PERIO_SUP_MAX) : '';", "var v = typeof o[k] === 'string' ? o[k].trim() : '';")],
  ['perio: note not escaped', rep('pp-modules.js', "value=\"' + escapeHtml(v) + '\"'", "value=\"' + v + '\"'")],
  ['perio: compare editable', rep('pp-modules.js', "  var ro = perioCompare || !!(window.SyDentSub", "  var ro = false || !!(window.SyDentSub")],
  ['perio: removed tooth note hidden', rep('pp-modules.js', "  Object.keys(cur).concat(Object.keys(prev)).forEach(", "  [].forEach(")],
  ['perio: copy carries an extracted tooth', rep('pp-modules.js', "if (_live.indexOf(k) !== -1) _cp[k] = _src[k];", "_cp[k] = _src[k];")],
  ['perio: print drops the notes', rep('pp-modules.js', "    + perioSupPrintHtml()\n", "\n")],
  ['perio: doctor text through the translator', rep('pp-modules.js', "(prev[s.code] ? '<span data-i18n-skip>' + escapeHtml(prev[s.code])", "(prev[s.code] ? '<span>' + escapeHtml(prev[s.code])")],
  ['perio: tab reopened stale', rep('pp-modules.js', "  if (perioInited) { perioSupRender(); return; }", "  if (perioInited) { return; }")],
  ['perio: a column again', rep('pp-modules.js', "function perioIsMolar(t){ return (t % 10) >= 6; }", "function perioIsMolar(t){ return (supMorph(t) % 10) >= 6; }")],
  ['M227 keeps supernumerary codes in perio', rep('migrations/227_perio_sup_notes.sql', "  CHECK (tooth_num >= 11 AND tooth_num <= 48);", "  CHECK (tooth_num >= 11 AND tooth_num <= 484);")],
  ['M227 validator callable by anon', rep('migrations/227_perio_sup_notes.sql', "REVOKE ALL ON FUNCTION public._perio_sup_notes_ok(jsonb) FROM PUBLIC, anon;", "")],
  ['english note label dropped', rep('i18n-en.js', "    [R('^ملاحظة سن زائد ' + PL + '$'), function (m, p) { return 'Note on the ' + sup(p); }],", "")],
  ['not in the gate', rep('scripts/validate.sh', 'prove-supernumerary.js" --self-test', 'prove-supernumerary.js"')]
];

(async () => {
  const r = await measure(LIVE, 'live'), keys = Object.keys(r), bad = keys.filter(k => !r[k]);
  keys.forEach(k => console.log((r[k] ? '  ✓ ' : '  ✗ ') + k));
  if (bad.length) { console.error('✗ فشل: ' + bad.join(', ')); console.log(`prove-supernumerary: ${keys.length - bad.length}/${keys.length}`); process.exit(1); }
  console.log(`prove-supernumerary: ${keys.length}/${keys.length} passed ✓`);
  if (!SELF) process.exit(0);
  let bites = 0;
  for (const [name, m] of MUT) {
    if (LIVE[m.f].indexOf(m.a) < 0) { console.error('✗ طفرة «' + name + '»: المرساةُ غائبة'); process.exit(1); }
    const F = Object.assign({}, LIVE); F[m.f] = LIVE[m.f].replace(m.a, m.b);
    let mr; try { mr = await measure(F, 'mut' + bites); } catch (e) { mr = { crashed: false }; }
    const fails = Object.keys(mr).filter(k => !mr[k]);
    if (fails.length) { bites++; console.log('  🦷 ' + name + ' → ' + fails.slice(0, 4).join(', ')); }
    else console.error('  ✗ طفرة «' + name + '» مرّت بلا أثر');
  }
  console.log(`prove-supernumerary mutants: ${bites}/${MUT.length}`);
  process.exit(bites === MUT.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

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
   --self-test: طفراتٌ متعمَّدة يجب أن يُسقط كلٌّ منها توكيداً واحداً على الأقل (#342). بلا jsdom ⇒ تخطٍّ بـ0. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت السن الزائد (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
const SELF = process.argv.includes('--self-test');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const FILES = ['pp-dental.js', 'pp-modules.js', 'patient-profile.html', 'patients.html', 'patient-profile.css', 'i18n-en.js', 'migrations/226_supernumerary_tooth.sql', 'scripts/validate.sh'];
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
      ['131', '111', '182', '241', '411', '461', '163', '164', '354', '211']);
  ev('renderTeeth()');
  const kids = (id) => ev("Array.from(document.getElementById('" + id + "').children).map(function(c){ return c.getAttribute('data-tooth-cell') || c.getAttribute('data-occ-cell') || (c.classList.contains('midline') ? '|' : '?'); })");
  const ku = kids('upperJaw'), kl = kids('lowerJaw'), ko = kids('upperOcc');
  r.betweenRight = ku.indexOf('131') === ku.indexOf('13') - 1 && ko.indexOf('131') === ko.indexOf('13') - 1;   /* الربع 1: الإنسيُّ يميناً = السابقُ بالـDOM (RTL) */
  r.betweenQuad2 = ku.indexOf('241') === ku.indexOf('24') + 1;                                                  /* الربع 2: الإنسيُّ يساراً = التالي */
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
  r.extractionStates = ev("!!document.querySelector('[data-tooth-cell=\"182\"] .planned-x') && document.querySelector('#upperJaw > [data-tooth-cell=\"241\"]').classList.contains('extract-cell')");
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
  r.batchExamRefuse = (ev("window.__TOASTS.length=0; window.__batchMode=true;"), ev("batchToggleAt(131,'M'); window.__batchMode=false; /خارج التحديد المتعدد/.test(window.__TOASTS.join('|'))"));
  ev("window.__TOASTS.length=0; examSelectedKey='extracted';"); await ev("examStamp(131,'M')");
  r.batchExamRefuse = r.batchExamRefuse && ev("/خارج الفحص الأولي/.test(window.__TOASTS.join('|'))");
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
  r.removeSparesDenture = /\.eq\('tooth_num', tn\)\.neq\('surface', 'DENTURE'\);   \/\* M202: نمطُ كلِّ محوٍ بلا سطح \*\//.test(PD);
  r.cssLane = /#upperJaw\.sup-lane > \.tooth-cell\{padding-bottom:56px;\}/.test(F['patient-profile.css']) && /#lowerJaw > \.sup-cell\{align-self:flex-start;\}/.test(F['patient-profile.css']);
  r.gate = /prove-supernumerary\.js" --self-test/.test(F['scripts/validate.sh']);
  /* الإنكليزية: المحرّكُ الحقيقي يقرأ القاموسَ والأنماط من i18n-en.js */
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(F['i18n-en.js'], ctx);
  const D = ctx.window.SyI18nDict, P = ctx.window.SyI18nPatterns;
  const tr = (s) => { if (D[s] != null) return D[s]; for (const p of P) if (p[0].test(s)) return s.replace(p[0], p[1]); return null; };
  r.english = tr('سن زائد بين 12 و13') === 'Supernumerary tooth between 12 and 13' && tr('السن الزائد حنكي 16') === 'Supernumerary tooth palatal to 16'
    && tr('سن زائد لساني 46') === 'Supernumerary tooth lingual to 46' && tr('✅ أُضيف سن زائد وحشي 18 — انقره لتسجيل علاجاته') === '✅ Added a supernumerary tooth distal to 18 — click it to record its treatments'
    && tr('سن زائد') === 'Supernumerary tooth' && tr('إزالة السن الزائد') === 'Remove the supernumerary tooth' && tr('مكان السن الزائد حول السن 12') === 'Where is the supernumerary tooth around tooth 12'
    && /^The supernumerary tooth between 12 and 13 has recorded treatments \(2\)\./.test(tr('على سن زائد بين 12 و13 علاجاتٌ مسجّلة (2). أزلها أولاً من نافذته، ثم أزل السن الزائد.') || '');
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
  ['bridge offered on a supernumerary', rep('pp-dental.js', "if (_tpSup === 'bridge' || _tpSup === 'implant' ||", "if (")],
  ['presence saved as a watch', rep('pp-dental.js', "treatment_key: SUP_KEY, status: 'existing_current'", "treatment_key: SUP_KEY, status: 'condition'")],
  ['removed with treatments on it', rep('pp-dental.js', "  if (sess.length || work.length) {", "  if (false) {")],
  ['two in one place', rep('pp-dental.js', "  if (supExists(c)) { showToast(", "  if (false) { showToast(")],
  ['taken place still clickable', rep('pp-dental.js', "+ '\"' + (taken ? ' disabled' : '')", "+ '\"' + ''")],
  ['multi-select takes it', rep('pp-modules.js', "  if (typeof isSupTooth === 'function' && isSupTooth(n)) { showToast('🩺 السنُّ الزائد خارج التحديد المتعدد", "  if (false) { showToast('🩺 السنُّ الزائد خارج التحديد المتعدد")],
  ['migration keeps SXM', rep('migrations/226_supernumerary_tooth.sql', "'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SN'::text, 'DENTURE'::text,", "'SPACER'::text, 'SOCKET'::text, 'COND'::text, 'SN'::text, 'SXM'::text, 'DENTURE'::text,")],
  ['migration conversion ≠ UI scheme', rep('migrations/226_supernumerary_tooth.sql', "           ELSE (h + 1) * 10 + 1 END", "           ELSE h * 10 + 2 END")],
  ['english name dropped', rep('i18n-en.js', "if (m) return 'between ' + m[1] + ' and ' + m[2];", "if (m) return p;")],
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

/* مثبت DOM حيّ: يركّب مودال السن الحقيقي (من patient-profile.html) فوق pp-dental.js + pp-core.js
   الحقيقيَّين، ثم ينقر كما ينقر الطبيب: شريحة «حالات سريرية» ← «كسر» ← «حفظ كجلسة». */
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const OUT=path.join(__dirname,'.out');
if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
/* مودالُ السن يُقتطع من patient-profile.html نفسه — لا نسخة (لو تغيّر المعرّفُ أو البنية سقط المثبت) */
const PP=fs.readFileSync(path.join(ROOT,'patient-profile.html'),'utf8');
/* v443: الصفحة انتقلت لعُدّة النوافذ ⇒ الـoverlay تحمل sy-m والأحجام.
   يُبحث عن المعرّف نفسه لا عن سلسلة الفئات، فلا يسقط المثبت بتغيير حجمٍ لاحق. */
const mi=PP.search(/<div class="modal-overlay[^"]*" id="toothModal">/);
if(mi<0) throw new Error('toothModal: لم أجد المودال بـpatient-profile.html');
const mEnd=PP.indexOf('\n</div>', PP.indexOf('id="toothFoot"'));
const modal=PP.slice(mi, mEnd+7);
if(modal.indexOf('toothStatusPicker')<0 || modal.indexOf('toothOptsContainer')<0) throw new Error('toothModal: الاقتطاعُ ناقص');
const CAT=[
 {treatment_key:'custom_1781292854422',id:'x1',name:'حشوة كومبوزت',fill:'#60a5fa',stroke:'#1d4ed8',price:60000,target_part:'crown',category:'restorative',is_active:true,is_favorite:true,currency:'SYP',price_overrides:{}},
 {treatment_key:'extracted',id:'x2',name:'قلع',fill:'#ef5350',stroke:'#c62828',price:40000,target_part:'extraction',category:'surgical',is_active:true,is_favorite:true,currency:'SYP',price_overrides:{}},
 {treatment_key:'crown',id:'x3',name:'تاج',fill:'#fb923c',stroke:'#c2410c',price:250000,target_part:'crown_full',category:'prosthodontics',is_active:true,currency:'SYP',price_overrides:{}}
].map(t=>({id:t.treatment_key,name:t.name,label:t.name,fill:t.fill,stroke:t.stroke,price:t.price,target_part:t.target_part,category:t.category,is_active:true,is_favorite:!!t.is_favorite,needs_lab:false,post_extraction:false,dentition_scope:'all',accepts_units:false,currency:'SYP',price_overrides:{},default_note:'',completion_note:'',layman_name:''}));
/* شريطُ الفحص الأولي يُقتطع من الصفحة نفسها كما يُقتطع المودال */
const bi=PP.indexOf('<div class="exam-bar" id="examBar">');
if(bi<0) throw new Error('examBar: لم أجد شريط الفحص بـpatient-profile.html');
const bEnd=PP.indexOf('\n      </div>', PP.indexOf('id="examCondPalette"')>=0?PP.indexOf('id="examCondPalette"'):bi);
const examBar=PP.slice(bi, bEnd+13);
if(examBar.indexOf('examPalette')<0) throw new Error('examBar: الاقتطاعُ ناقص');

const page=`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${ROOT}/theme.css"><link rel="stylesheet" href="file://${ROOT}/patient-profile.css">
<script>
  window.__ERRORS=[]; window.onerror=function(m,s,l,c,e){window.__ERRORS.push(String(m)+' @'+s+':'+l);};
  window.addEventListener('unhandledrejection',function(e){window.__ERRORS.push('promise: '+(e.reason&&e.reason.message||e.reason));});
  localStorage.setItem('sydent_treatments', ${JSON.stringify(JSON.stringify(CAT))});
  window.__WRITES=[]; window.__TOASTS=[];
  var currentUser={id:'doc-1'}, patientId='pat-1', patient={id:'pat-1',name:'تجريبي',dob:'1990-01-01'};
  var teethMap={}, sessions=[], _toothPhotoCounts={}, CLINIC_DOCTORS=[{id:'d1',name:'د. أيهم',is_owner:true,is_active:true}];
  window.CLINIC_DOCTORS_ALL=CLINIC_DOCTORS; var BUNDLE_ITEMS=[];
  window.__m61=true; window.__m151T=true;
  var _chartStatusFilter='all', liveTeethMapRef=null, pendingProviderId=null, occViewSeg=null;
  var _pfFiles=[], payments=[], adjustments=[], plannedAppts=[], appointments=[];
  var examStatus='existing_other', examSelectedKey=null, examReviewMonths=3, examCount=0, examUndoStack=[];
  function getDefaultProviderId(p){ return p&&p[0]?p[0].id:null; }
  function ppYmdLocal(d){ return '2026-12-20'; }
  function snTplRefresh(){} function renderPlan(){} function renderWatchBanner(){} function addPhotoBadges(){} function renderPayments(){} function renderRecentSessions(){} function renderInfo(){} function addLabBadges(){} function renderPendingPP(){} function refreshPlanBar(){} function renderVisitsBar(){} function renderDraftOverlay(){} function ppRenderMsgTab(){}
  function rxClinicInfo(){ return {clinic_name:'عيادة',clinic_phone:''}; }
  function showToast(m){ window.__TOASTS.push(m); }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function closeModal(id){ var e=document.getElementById(id); if(e) e.classList.remove('open'); }
  function openModal(id){ var e=document.getElementById(id); if(e) e.classList.add('open'); }
  function renderStats(){} function renderSessions(){} function renderTimeline(){}
  function ppGuarded(n,f){ return f; }
  function toDay(){ return '2026-09-20'; }
  function calcAge(){ return 30; }
  function maybePromptMaterialDeduction(){ return Promise.resolve(); }
  function openLabOrderModal(){ }
  function sessionTreatmentKey(x){ return x.treatment_key; }
  function tipOptBadge(){ return ''; }
  function centerSurface(n){ return 'O'; }
  window.SyDentSub={ isReadOnly:function(){return false;}, blockReadOnly:function(){return false;}, level:function(){return 'full';} };
  window.SyDentLock={ isOwner:function(){return true;}, isDoctorAccountInactive:function(){return false;}, getCurrentEmployee:function(){return {name:'د. أيهم'};} };
  window.SyDentCurPick={ set:function(){}, read:function(){ return 'SYP'; }, mount:function(){} };
  /* stub supabase: يلتقط كل كتابة كما هي */
  function _q(table){ var st={table:table,op:null,payload:null,eq:{}};
    var api={ upsert:function(row){ st.op='upsert'; st.payload=row; window.__WRITES.push(JSON.parse(JSON.stringify(st))); return Promise.resolve({data:[row],error:null}); },
      insert:function(row){ st.op='insert'; st.payload=row; window.__WRITES.push(JSON.parse(JSON.stringify(st)));
        return { select:function(){ return { single:function(){ return Promise.resolve({data:Object.assign({id:'sess-1'},row),error:null}); } }; } }; },
      delete:function(){ st.op='delete'; window.__WRITES.push(JSON.parse(JSON.stringify(st))); return api; },
      update:function(p){ st.op='update'; st.payload=p; window.__WRITES.push(JSON.parse(JSON.stringify(st))); return api; },
      select:function(){ return api; }, eq:function(k,v){ st.eq[k]=v; return api; }, in:function(){ return api; },
      order:function(){ return api; }, limit:function(){ return api; }, single:function(){ return Promise.resolve({data:null,error:null}); },
      not:function(){ return api; }, or:function(){ return api; }, then:function(res){ return Promise.resolve({data:[],error:null}).then(res); } };
    return api; }
  window.sb={ from:_q, rpc:function(){ return Promise.resolve({data:null,error:null}); } };
</script></head><body>
<div id="printRoot"></div><div id="jawWrap"><div id="upperJaw"></div><div id="lowerJaw"></div><div id="upperOcc"></div><div id="lowerOcc"></div></div>
<div id="chartLegend"></div><div id="watchBanner"></div>
${modal}
${examBar}
<script src="file://${ROOT}/pp-modules.js"></script>
<script src="file://${ROOT}/pp-dental.js"></script>
<script src="file://${ROOT}/pp-wa.js"></script>
<script src="file://${ROOT}/pp-clinical.js"></script>
<script src="file://${ROOT}/pp-core.js"></script>
<script>
  /* pp-core يحمّل الكتالوج من الشبكة — نُبقي الكاش المحلي */
  loadTreatmentsFromSupabase = function(){ return Promise.resolve(); };
  populateProviderPicker = window.populateProviderPicker || function(){};
  var _T2=rebuildToothMaps(); T_FILL=_T2.fill; T_STROKE=_T2.stroke; T_LABEL=_T2.label;
</script></body></html>`;
fs.writeFileSync(path.join(OUT,'harness.html'), page);
console.log('harness: ' + path.join(OUT,'harness.html'));

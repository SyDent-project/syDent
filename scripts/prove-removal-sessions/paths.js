/* v488 — مثبتُ جلسات الإزالة (مسارات الإزالة الستة) على الدوال الحية من pp-dental.js.
   يستخرج الدوال بنصّها ويشغّلها بـvm مع بدائل للـDOM/القاعدة. F=<مسار> لتجربة نسخةٍ مُطفَّرة. */
const fs=require('fs'),vm=require('vm');
const FILE=process.env.F||require('path').join(__dirname,'..','..','pp-dental.js');
const src=fs.readFileSync(FILE,'utf8');
function ext(name){const i=src.indexOf(name);if(i<0)throw new Error('missing '+name);let j=src.indexOf('{',i),d=0,k=j;
 for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)break;}}return src.slice(i,k+1);}
const names=['async function _clearToothStatus_inner','function plannedToothSessions','function canDeleteCompletedSessions','function removedRowsOf','function unitSessionsFor','function removalSessionsNote','async function followUpRemovedSessions','function removalToast','function _removalSessWhere','function completedToothSessionsForRows','async function askDeleteCompletedToothSessions','async function deleteToothSessions','async function askDeletePlannedToothSessions','function isUnitLedgerSession','async function _undoExtraction_inner','async function _removeImplant_inner','async function _removeSocket_inner','async function removeSpacerUnit','function spacerSessionsForUnit','async function clearSpacerRows','function _sameToothSet','function bridgeSessionsForRemovedUnit'];
const code=names.map(ext).join('\n');
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('FAIL',m);}}
const isExt=k=>k==='extracted'||k==='surg_ext', isBr=k=>k==='bridge', isSp=k=>k==='spacer', isImp=k=>k==='implant';
function run(o,entry,arg){
 const log={toasts:[],dels:[],confirms:[],tsDel:[],upserts:[]};const answers=o.answers.slice();
 const q=()=>{const st={};const b={delete(){st.op='del';return b},upsert(r){log.upserts.push(r);st.op='up';return b},eq(k,v){st[k]=v;return b},
   then(res){if(st.op==='del')log.tsDel.push((st.tooth_num||'')+':'+(st.surface||'*'));const e=(o.tsErrOn&&o.tsErrOn(st))?{m:1}:null;return Promise.resolve({error:e}).then(res)}};return b;};
 const ctx={teethMap:JSON.parse(JSON.stringify(o.map)),currentTooth:o.tooth,currentSurface:o.surface||'X',currentUser:{id:'D'},
  sessions:o.sessions.map(x=>Object.assign({},x)),patientId:'P',
  window:{sb:{from:q},SyDentLock:o.role?{isOwner:()=>o.role==='owner',isDoctorAccountInactive:()=>false}:undefined,SyDT:{numDate:d=>'N'+d}},
  SyDialog:{confirm:async(a)=>{log.confirms.push(a);return answers.shift();}},
  delSession:async(id)=>{log.dels.push(id);if(!(o.failIds||[]).includes(id))ctx.sessions=ctx.sessions.filter(s=>s.id!==id);},
  showToast:m=>log.toasts.push(m),closeModal:()=>{},renderTeeth:()=>{},renderStats:()=>{},
  getTreatment:()=>({target_part:'crown'}),isBridgeKey:isBr,isExtractionKey:isExt,isSpacerKey:isSp,isRootCode:c=>/^(R[123]){1,3}$/.test(c),
  surfLabelFor:(k)=>'S'+k,rootAreaLabelFor:()=>'الجذر',centerSurface:()=>'O',fmt:n=>String(n),curLblOf:()=>'ل.س',_rowCur:()=>'SYP',
  sessionTreatmentKey:x=>x.treatment_key||null,computeSessionPaid:id=>(o.paid||{})[id]||0,PLAN_OPTION_LABELS:{},
  isBridgeTooth:n=>!!(o.bridgeUnit&&o.bridgeUnit.includes(+n)),toothUnitId:()=>null,legacyBridgeUnitOf:()=>o.bridgeUnit,sweepOrphanRetainers:async()=>false,
  altImplantsForUnit:()=>[],_altChartToImplants:async()=>false,
  toothHasSpacer:n=>!!(o.spacerUnit&&o.spacerUnit.includes(+n)),spacerUnitOf:()=>o.spacerUnit};
 vm.createContext(ctx);vm.runInContext(code+';this.fns={clear:_clearToothStatus_inner,undo:_undoExtraction_inner,imp:_removeImplant_inner,sock:_removeSocket_inner,spc:removeSpacerUnit};',ctx);
 return ctx.fns[entry](arg).then(()=>({log,ctx}));
}
(async()=>{
 let r;
 // ===== plain undo extraction =====
 const EXc={id:'e1',tooth_num:'36',surface:'WHOLE',type:'قلع',status:'completed',treatment_key:'extracted',cost:30000,date:'2026-07-01'};
 const EXp={id:'e2',tooth_num:'36',surface:'WHOLE',type:'قلع',status:'planned',treatment_key:'extracted',cost:30000};
 const GRp={id:'g1',tooth_num:'36',surface:'SOCKET',type:'طعم',status:'planned',treatment_key:'graft',cost:5};
 r=await run({map:{'36':{WHOLE:'extracted',__status:{WHOLE:'planned'}}},sessions:[EXp],answers:[true,true]},'undo',36);
 ok(/نسألك عن حذف العلاجات المخطّطة/.test((r.log.confirms[0]||{}).message),'U1 note');ok(r.log.dels.join()==='e2'&&/^✅ تمت إعادة السن 36 — حُذف العلاج المخطّط/.test(r.log.toasts.at(-1)),'U1 planned extraction deleted');
 r=await run({role:'owner',map:{'36':{WHOLE:'extracted',SOCKET:'graft',__status:{SOCKET:'planned'}}},sessions:[EXc,GRp],answers:[true,true,false]},'undo',36);
 ok((r.log.confirms[1]||{}).title==='العلاجات المخطّطة'&&/طعم/.test((r.log.confirms[1]||{}).message),'U2 socket planned offered');
 ok((r.log.confirms[2]||{}).title==='الجلسات المنجزة'&&/قلع/.test((r.log.confirms[2]||{}).message),'U2 completed extraction offered');
 ok(r.log.dels.join()==='g1'&&/^✅/.test(r.log.toasts.at(-1)),'U2 keep completed');
 r=await run({role:'doctor',map:{'36':{WHOLE:'extracted'}},sessions:[EXc],answers:[true]},'undo',36);
 ok(r.log.confirms.length===1&&/لن تُحذف/.test((r.log.confirms[0]||{}).message)&&/صلاحية المالك/.test(r.log.toasts.at(-1)),'U3 doctor');
 r=await run({map:{'36':{WHOLE:'extracted'}},sessions:[],answers:[true]},'undo',36);
 ok(r.log.toasts.at(-1)==='✅ تمت إعادة السن 36','U4 no sessions = old toast');
 // with spacer on the tooth
 const SPp={id:'s1',tooth_num:'74,75',surface:'SPACER',status:'planned',treatment_key:'spacer',cost:9};
 r=await run({spacerUnit:[74,75],map:{'74':{WHOLE:'extracted',SPACER:'spacer'},'75':{SPACER:'spacer'}},sessions:[SPp],answers:[true,true]},'undo',74);
 ok(r.log.dels.join()==='s1'&&/الأسنان 74، 75/.test((r.log.confirms[1]||{}).message),'U5 spacer planned offered via undo');
 r=await run({spacerUnit:[74,75],map:{'74':{WHOLE:'extracted',SPACER:'spacer'},'75':{SPACER:'spacer'}},sessions:[SPp],answers:[true],tsErrOn:st=>st.surface==='SPACER'},'undo',74);
 ok(/^⚠️ تمّ جزئياً/.test(r.log.toasts.at(-1))&&r.log.confirms.length===1,'U6 spacer delete failure now honest');
 // ===== bridge: planned (M145-l) then completed =====
 const BRp={id:'b1',tooth_num:'34,35,36',surface:'BRIDGE',type:'جسر',status:'planned',treatment_key:'bridge',cost:1};
 const BRc={id:'b2',tooth_num:'34,35,36',surface:'BRIDGE',type:'جسر',status:'completed',treatment_key:'bridge',cost:2,date:'2026-01-01'};
 const bmap={'34':{WHOLE:'bridge'},'35':{PONTIC:'bridge',WHOLE:'extracted'},'36':{WHOLE:'bridge'}};
 r=await run({role:'owner',bridgeUnit:[34,35,36],map:bmap,sessions:[BRp,BRc],answers:[true,true,true]},'undo',35);
 ok((r.log.confirms[1]||{}).title==='جلسة الجسر'&&(r.log.confirms[2]||{}).title==='الجلسات المنجزة','B1 order');
 ok(/الأسنان 34، 35، 36/.test((r.log.confirms[2]||{}).message),'B1 unit where');
 ok(r.log.dels.join()==='b1,b2'&&/^✅ تمت إزالة الجسر.*حُذف العلاج المنجز/.test(r.log.toasts.at(-1)),'B1 both');
 r=await run({role:'doctor',bridgeUnit:[34,35,36],map:bmap,sessions:[BRc],answers:[true]},'undo',35);
 ok(r.log.confirms.length===1&&/صلاحية المالك/.test(r.log.toasts.at(-1)),'B2 doctor');
 r=await run({role:'owner',bridgeUnit:[34,35,36],map:bmap,sessions:[BRc],answers:[true,true],failIds:['b2']},'undo',35);
 ok(/^⚠️ تمت إزالة الجسر/.test(r.log.toasts.at(-1)),'B3 completed fail warns');
 r=await run({role:'owner',bridgeUnit:[34,35,36],map:bmap,sessions:[Object.assign({},BRc,{tooth_num:'34,35'})],answers:[true]},'undo',35);
 ok(r.log.confirms.length===1,'B4 other unit set not offered');
 // ===== implant removal =====
 const IMc={id:'i1',tooth_num:'46',surface:'WHOLE',type:'زرعة',status:'completed',treatment_key:'implant',cost:500};
 const IMp={id:'i2',tooth_num:'46',surface:'WHOLE',type:'زرعة',status:'planned',treatment_key:'implant',cost:500};
 const CRp={id:'i3',tooth_num:'46',surface:'CROWN_FULL',type:'تاج',status:'planned',treatment_key:'crown',cost:5};
 r=await run({role:'owner',map:{'46':{WHOLE:'implant',CROWN_FULL:'crown',__status:{WHOLE:'planned',CROWN_FULL:'planned'}}},sessions:[IMp,CRp,EXc],answers:[true,true]},'imp',46);
 ok(/نسألك عن حذف العلاجات المخطّطة/.test((r.log.confirms[0]||{}).message),'I1 note');ok(r.log.dels.sort().join()==='i2,i3','I1 implant+crown planned');
 ok(r.log.upserts[0].treatment_key==='extracted','I1 extracted redrawn');
 r=await run({role:'owner',map:{'46':{WHOLE:'implant'}},sessions:[IMc,Object.assign({},EXc,{tooth_num:'46'})],answers:[true,true]},'imp',46);
 ok(r.log.dels.join()==='i1','I2 completed implant only (extraction stays)');
 r=await run({role:'owner',map:{'46':{WHOLE:'implant'}},sessions:[Object.assign({},EXp,{tooth_num:'46'})],answers:[true]},'imp',46);
 ok(r.log.confirms.length===1&&r.log.dels.length===0,'I3 planned extraction not offered');
 r=await run({role:'owner',map:{'46':{WHOLE:'implant'}},sessions:[IMc],answers:[true],tsErrOn:st=>st.op==='up'},'imp',46);
 ok(/^⚠️ تمّ جزئياً/.test(r.log.toasts.at(-1))&&r.log.confirms.length===1,'I4 write error no ask');
 r=await run({role:'owner',map:{'46':{WHOLE:'implant',R1:'extracted'}},sessions:[Object.assign({},EXc,{id:'x9',tooth_num:'46',surface:'R1'})],answers:[true]},'imp',46);
 ok(r.log.confirms.length===1&&r.log.dels.length===0,'I5 legacy extraction row: completed extraction not offered');
 // ===== socket =====
 const GRc={id:'g2',tooth_num:'36',surface:'SOCKET',type:'طعم',status:'completed',treatment_key:'graft',cost:7};
 r=await run({role:'owner',map:{'36':{WHOLE:'extracted',SOCKET:'graft'}},sessions:[GRc,EXc],answers:[true,true]},'sock',36);
 ok(r.log.dels.join()==='g2'&&/^✅ تمت إزالة علاج موقع القلع — حُذف العلاج المنجز/.test(r.log.toasts.at(-1)),'K1 completed graft only');
 r=await run({role:'owner',map:{'36':{WHOLE:'extracted',SOCKET:'graft',__status:{SOCKET:'planned'}}},sessions:[GRp],answers:[true,false]},'sock',36);
 ok(r.log.dels.length===0&&r.log.toasts.at(-1)==='✅ تمت إزالة علاج موقع القلع','K2 keep');
 r=await run({role:'owner',map:{'36':{SOCKET:'graft'}},sessions:[GRc],answers:[true],tsErrOn:()=>true},'sock',36);
 ok(r.log.confirms.length===1&&r.log.dels.length===0,'K3 error no ask');
 // ===== spacer removal =====
 const SPc={id:'s2',tooth_num:'74,75',surface:'SPACER',status:'completed',treatment_key:'spacer',cost:9};
 r=await run({role:'owner',spacerUnit:[74,75],map:{'74':{WHOLE:'extracted',SPACER:'spacer'},'75':{SPACER:'spacer'}},sessions:[SPp,SPc],answers:[true,true,true]},'spc',74);
 ok(/المخطّطة ثم الجلسات المنجزة/.test((r.log.confirms[0]||{}).message),'P1 note');ok(r.log.dels.join()==='s1,s2','P1 both');
 r=await run({role:'owner',spacerUnit:[74,75],map:{'74':{SPACER:'spacer',__status:{SPACER:'planned'}},'75':{SPACER:'spacer',__status:{SPACER:'planned'}}},sessions:[SPp,SPc],answers:[true,true]},'spc',74);
 ok(r.log.dels.join()==='s1'&&r.log.confirms.length===2,'P2 planned rows: completed not offered');
 r=await run({role:'owner',spacerUnit:[74,75],map:{'74':{SPACER:'spacer'},'75':{SPACER:'spacer'}},sessions:[SPc],answers:[true],tsErrOn:st=>st.tooth_num==='75'},'spc',74);
 ok(/^⚠️ تمّ جزئياً/.test(r.log.toasts.at(-1))&&r.ctx.teethMap['75'].SPACER==='spacer','P3 spacer failure honest + memory kept');
 // ===== clear regression =====
 const P={id:'p1',tooth_num:'32',surface:'R1',type:'وتد',status:'planned',cost:75000,treatment_key:'post'};
 const C={id:'c1',tooth_num:'15',surface:'O',type:'حشوة',status:'completed',cost:25000,treatment_key:'comp',date:'2026-07-25'};
 r=await run({tooth:32,surface:'R1',map:{'32':{R1:'post',__status:{R1:'planned'}}},sessions:[P],answers:[true,true]},'clear');
 ok(r.log.dels.join()==='p1'&&/^✅ الجذر للسن 32 أصبح سليماً — حُذف العلاج المخطّط/.test(r.log.toasts.at(-1)),'C1 clear planned');
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,true],failIds:['c1']},'clear');
 ok(r.log.toasts.at(-1)==='⚠️ أُزيل الرسم — تعذّر حذف العلاج المنجز — تحقّق من الاتصال وأعد المحاولة','C2 clear warn exact');
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,false]},'clear');
 ok(r.log.toasts.at(-1)==='🔄 السطح SO للسن 15 أصبح سليماً','C3 clear keep old toast');
 r=await run({tooth:15,surface:'O',role:'owner',map:{},sessions:[C],answers:[]},'clear');
 ok(/سليم بالفعل/.test(r.log.toasts[0]),'C4 orphan completed not offered');
 // cancel first confirm in every path => no writes
 for(const [e,a,m] of [['undo',36,{'36':{WHOLE:'extracted'}}],['imp',46,{'46':{WHOLE:'implant'}}],['sock',36,{'36':{SOCKET:'graft'}}],['spc',74,{'74':{SPACER:'spacer'},'75':{SPACER:'spacer'}}]]){
  r=await run({role:'owner',spacerUnit:[74,75],map:m,sessions:[EXc,IMc,GRc,SPc],answers:[false]},e,a);
  ok(r.log.tsDel.length===0&&r.log.dels.length===0&&r.log.upserts.length===0,'X cancel '+e);
 }
 console.log('🧩 مثبت جلسات الإزالة — مسارات الإزالة الستة: '+(fail?'⛔ '+fail+' فشل من '+(pass+fail):'✅ '+pass+'/'+pass));process.exit(fail?1:0);
})();

/* v488 — مثبتُ جلسات الإزالة («سليم (إلغاء)») على الدوال الحية من pp-dental.js.
   يستخرج الدوال بنصّها ويشغّلها بـvm مع بدائل للـDOM/القاعدة. F=<مسار> لتجربة نسخةٍ مُطفَّرة. */
const fs=require('fs'),vm=require('vm');
const FILE=process.env.F||require('path').join(__dirname,'..','..','pp-dental.js');
const src=fs.readFileSync(FILE,'utf8');
function ext(name){const i=src.indexOf(name);if(i<0)throw name;let j=src.indexOf('{',i),d=0,k=j;
 for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)break;}}return src.slice(i,k+1);}
const code=['async function _clearToothStatus_inner','function plannedToothSessions','function completedToothSessionsForRows','async function askDeleteCompletedToothSessions','async function deleteToothSessions','async function askDeletePlannedToothSessions','function isUnitLedgerSession','function canDeleteCompletedSessions','function removedRowsOf','function removalSessionsNote','async function followUpRemovedSessions','function removalToast','function _removalSessWhere'].map(ext).join('\n');
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('FAIL',m);}}
function run(o){
 const log={toasts:[],dels:[],confirms:[]};const answers=o.answers.slice();
 const ctx={teethMap:JSON.parse(JSON.stringify(o.map)),currentTooth:o.tooth,currentSurface:o.surface,
  sessions:o.sessions.map(x=>Object.assign({},x)),patientId:'P',
  window:{sb:{from:()=>{const q={delete(){return q},eq(){return q},then(r){return Promise.resolve({error:o.tsErr||null}).then(r)}};return q;}},
    SyDentLock:o.role?{isOwner:()=>o.role==='owner'}:undefined,SyDT:{numDate:d=>'N'+d}},
  SyDialog:{confirm:async(a)=>{log.confirms.push(a);return answers.shift();}},
  delSession:async(id)=>{log.dels.push(id);if(!(o.failIds||[]).includes(id))ctx.sessions=ctx.sessions.filter(s=>s.id!==id);},
  showToast:m=>log.toasts.push(m),closeModal:()=>{},renderTeeth:()=>{},undoExtraction:()=>log.undo=true,
  getTreatment:()=>({target_part:'crown'}),isBridgeKey:k=>k==='bridge',isRootCode:c=>/^(R[123]){1,3}$/.test(c),
  surfLabelFor:(k)=>'S'+k,rootAreaLabelFor:()=>'الجذر',centerSurface:()=>'O',fmt:n=>String(n),curLblOf:()=>'ل.س',_rowCur:()=>'SYP',
  sessionTreatmentKey:x=>x.treatment_key||null,computeSessionPaid:id=>(o.paid||{})[id]||0,PLAN_OPTION_LABELS:{}};
 ctx.window.SyDT=ctx.window.SyDT;ctx.SyDT=ctx.window.SyDT;
 vm.createContext(ctx);vm.runInContext(code+'\n;this.go=_clearToothStatus_inner;',ctx);
 return ctx.go().then(()=>({log,ctx}));
}
const P={id:'p1',tooth_num:'32',surface:'R1',type:'وتد فايبر',status:'planned',cost:75000,treatment_key:'post'};
const C={id:'c1',tooth_num:'15',surface:'O',type:'حشوة',status:'completed',cost:25000,treatment_key:'comp',date:'2026-07-25'};
(async()=>{
 let r;
 // --- planned (regression of v479) ---
 r=await run({tooth:32,surface:'R1',map:{'32':{R1:'post',__status:{R1:'planned'}}},sessions:[P],answers:[true,true]});
 ok(r.log.confirms.length===2&&r.log.confirms[1].title==='العلاجات المخطّطة','P1 planned dialog');ok(r.log.dels[0]==='p1','P1 deleted');ok(/^✅.*حُذف العلاج المخطّط/.test(r.log.toasts.at(-1)),'P1 toast');
 r=await run({tooth:32,surface:'R1',map:{'32':{R1:'post',__status:{R1:'planned'}}},sessions:[P],answers:[true,false]});
 ok(r.log.dels.length===0&&/^🔄/.test(r.log.toasts.at(-1)),'P2 keep');
 // --- completed, owner ---
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,true],paid:{c1:10000}});
 ok(/حذف الجلسة المنجزة/.test(r.log.confirms[0].message),'C1 note');ok(r.log.confirms[1].title==='الجلسات المنجزة','C1 dialog');
 ok(/N2026-07-25/.test(r.log.confirms[1].message)&&/مدفوع عليها 10000/.test(r.log.confirms[1].message)&&/رصيداً مقدّماً/.test(r.log.confirms[1].message),'C1 date+paid+credit');
 ok(r.log.confirms[1].danger===true,'C1 danger => cancel focused');ok(r.log.dels[0]==='c1'&&/حُذف العلاج المنجز/.test(r.log.toasts.at(-1)),'C1 deleted');
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,false]});
 ok(r.log.dels.length===0&&/^🔄/.test(r.log.toasts.at(-1)),'C2 keep');
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,true]});
 ok(!/رصيداً مقدّماً/.test(r.log.confirms[1].message),'C3 unpaid no credit line');
 // no SyDentLock => fail-open owner
 r=await run({tooth:15,surface:'O',map:{'15':{O:'comp'}},sessions:[C],answers:[true,true]});
 ok(r.log.dels[0]==='c1','C4 no lock = owner');
 // --- completed, non-owner ---
 for(const role of ['doctor','secretary']){
  r=await run({tooth:15,surface:'O',role,map:{'15':{O:'comp'}},sessions:[C],answers:[true]});
  ok(r.log.confirms.length===1&&/لن تُحذف/.test(r.log.confirms[0].message)&&r.log.dels.length===0,'N '+role+' no ask');
  ok(/صلاحية المالك/.test(r.log.toasts.at(-1)),'N '+role+' toast');
 }
 // --- mixed: planned + completed same tooth, owner, both delete: order planned then completed
 const map={'26':{R1:'post',O:'comp',__status:{R1:'planned'}}};
 const Ps={id:'p2',tooth_num:'26',surface:'R1',status:'planned',treatment_key:'post',cost:1};
 const Cs={id:'c2',tooth_num:'26',surface:'O',status:'completed',treatment_key:'comp',cost:2};
 r=await run({tooth:26,surface:'X',role:'owner',map,sessions:[Ps,Cs],answers:[true,true,true]});
 ok(/المخطّطة ثم الجلسات المنجزة/.test(r.log.confirms[0].message),'M note');
 ok(r.log.confirms[1].title==='العلاجات المخطّطة'&&r.log.confirms[2].title==='الجلسات المنجزة','M order');
 ok(r.log.dels.join()==='p2,c2','M both deleted');ok(/المخطّط · .*المنجز/.test(r.log.toasts.at(-1)),'M combined toast');
 r=await run({tooth:26,surface:'X',role:'owner',map,sessions:[Ps,Cs],answers:[true,false,true]});
 ok(r.log.dels.join()==='c2','M keep planned, delete completed');
 r=await run({tooth:26,surface:'X',role:'doctor',map,sessions:[Ps,Cs],answers:[true,true]});
 ok(r.log.confirms.length===2&&r.log.dels.join()==='p2'&&/صلاحية المالك/.test(r.log.toasts.at(-1)),'M doctor planned only');
 ok(/المنجزة تبقى/.test(r.log.confirms[0].message),'M doctor note');
 // --- precision: completed history not represented by a cleared row is NOT offered
 const Cold={id:'c3',tooth_num:'15',surface:'O',status:'completed',treatment_key:'amalgam',cost:5};
 const Cother={id:'c4',tooth_num:'15',surface:'M',status:'completed',treatment_key:'comp',cost:5};
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C,Cold,Cother],answers:[true,true]});
 ok(r.log.dels.join()==='c1','PR only matching surface+key');
 // row with non-financial status (existing/condition) → no completed offer
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp',__status:{O:'existing'}}},sessions:[C],answers:[true]});
 ok(r.log.confirms.length===1&&r.log.dels.length===0,'PR existing row no offer');
 // session without known key → not offered
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[Object.assign({},C,{treatment_key:null})],answers:[true]});
 ok(r.log.confirms.length===1,'PR unknown key no offer');
 // orphan path offers planned only, never completed
 r=await run({tooth:15,surface:'O',role:'owner',map:{},sessions:[C],answers:[]});
 ok(r.log.confirms.length===0&&/سليم بالفعل/.test(r.log.toasts[0]),'O completed orphan not offered');
 r=await run({tooth:32,surface:'R1',map:{},sessions:[P],answers:[true]});
 ok(r.log.dels[0]==='p1'&&/^✅/.test(r.log.toasts.at(-1)),'O planned orphan offered');
 r=await run({tooth:32,surface:'R1',map:{},sessions:[P],answers:[false]});
 ok(r.log.dels.length===0&&/بقيت العلاجات/.test(r.log.toasts.at(-1)),'O planned orphan keep');
 // failures
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true,true],failIds:['c1']});
 ok(/^⚠️.*تعذّر حذف العلاج المنجز/.test(r.log.toasts.at(-1)),'F completed failure honest');
 r=await run({tooth:26,surface:'X',role:'owner',map,sessions:[Ps,Cs],answers:[true,true,true],failIds:['p2']});
 ok(/^⚠️/.test(r.log.toasts.at(-1))&&r.log.dels.join()==='p2,c2','F planned fail still asks completed, warns');
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[true],tsErr:{e:1}});
 ok(r.log.confirms.length===1&&r.log.dels.length===0,'F write error no ask');
 // bridge routing untouched
 r=await run({tooth:32,surface:'O',role:'owner',map:{'32':{WHOLE:'bridge'}},sessions:[P],answers:[]});
 ok(r.log.undo&&r.log.confirms.length===0,'B bridge routing');
 // cancel first confirm: nothing
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C],answers:[false]});
 ok(r.log.dels.length===0&&r.ctx.teethMap['15'].O==='comp','X cancel untouched');
 // appointment warn in completed dialog
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[Object.assign({},C,{appointment_id:'a'})],answers:[true,false]});
 ok(/مربوط بموعد/.test(r.log.confirms[1].message),'A appt warn');
 // multiple completed same key (redo) both offered
 r=await run({tooth:15,surface:'O',role:'owner',map:{'15':{O:'comp'}},sessions:[C,Object.assign({},C,{id:'c9'})],answers:[true,true]});
 ok(r.log.dels.join()==='c1,c9'&&/العلاجات المنجزة \(2\)/.test(r.log.confirms[1].message),'R redo both');
 console.log('🧩 مثبت جلسات الإزالة — «سليم (إلغاء)»: '+(fail?'⛔ '+fail+' فشل من '+(pass+fail):'✅ '+pass+'/'+pass));process.exit(fail?1:0);
})();

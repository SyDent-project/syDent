package main

// الواجهةُ المحلية (http://127.0.0.1:4816) — صفحةٌ واحدة عربية بلا تبعيات. تُحدَّث كل ثانيتين من /api/state.
const uiHTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SyDent Bridge</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--text:#1f2937;--text2:#6b7280;--line:#e5e7eb;--green:#0f766e;--green-soft:#e6f4f1;--red:#b91c1c;--red-soft:#fee2e2;--yellow-soft:#fef3c7;--blue-soft:#e0ecff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1720;--card:#16212c;--text:#e5e7eb;--text2:#9ca3af;--line:#283241;--green:#2dd4bf;--green-soft:#0f2f2c;--red:#f87171;--red-soft:#3a1414;--yellow-soft:#3a2f0b;--blue-soft:#0f2340}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:15px}
.wrap{max-width:860px;margin:0 auto;padding:18px 14px 40px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--text2);font-size:13px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.card h2{font-size:15px;margin:0 0 10px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input[type=text]{flex:1;min-width:200px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text);font-size:15px}
button{padding:9px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);cursor:pointer;font-size:14px;font-weight:600}
button.p{background:var(--green);border-color:var(--green);color:#fff}button.d{color:var(--red)}button:disabled{opacity:.5;cursor:default}
.st{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px}
.st.ok{background:var(--green-soft);color:var(--green)}.st.bad{background:var(--red-soft);color:var(--red)}.st.wait{background:var(--yellow-soft)}
.dot{width:9px;height:9px;border-radius:50%;background:currentColor}
.list{display:flex;flex-direction:column;gap:6px}.item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}
.item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:right}
.req{background:var(--blue-soft);border-color:transparent;font-weight:700}
.log{font-size:13px;max-height:260px;overflow:auto}.log .item{padding:5px 10px}.log .ok{color:var(--green)}.log .err{color:var(--red)}.log .warn{color:#b45309}
.muted{color:var(--text2);font-size:13px}.code{font-family:ui-monospace,monospace;font-size:22px;letter-spacing:3px;text-transform:uppercase;direction:ltr;text-align:center}
label.chk{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px}
.hint{font-size:12.5px;color:var(--text2);line-height:1.7}
</style></head><body><div class="wrap">
<h1>🩻 SyDent Bridge <span class="muted" id="ver"></span></h1>
<div class="sub">يصل الحساس بحسابك على SyDent: الصورةُ التي يحفظها برنامجُ الجهاز تُرفع تلقائياً إلى المريض الذي فتحت له «التقاط من الجهاز»، وإلا إلى «وارد الأجهزة».</div>

<div class="card" id="cardStatus"><h2>الحالة</h2><div class="row" id="status"></div><div class="muted" id="reqs" style="margin-top:10px"></div></div>

<div class="card" id="cardPair"></div>

<div class="card"><h2>مجلدات المراقبة</h2>
<div class="hint">المجلدُ الذي يحفظ فيه برنامجُ الحساس صورَه (JPG · PNG · WebP · DICOM). ما كان موجوداً قبل الآن لا يُرفع؛ تُرفع الصورُ الجديدة فقط بعد أن تستقرّ على القرص.</div>
<div class="list" id="dirs" style="margin:10px 0"></div>
<div class="row"><input type="text" id="dirIn" placeholder="مثلاً: C:\Users\Clinic\Pictures\Sensor" dir="ltr"><button class="p" onclick="addDir()">➕ إضافة</button><button onclick="suggest()">🔍 اكتشاف تلقائي</button></div>
<div class="list" id="sug" style="margin-top:8px"></div>
<label class="chk" style="margin-top:12px"><input type="checkbox" id="moveDone" onchange="setMove(this.checked)"> بعد الرفع انقل الملفَّ إلى مجلدٍ فرعي <b dir="ltr">_sydent-uploaded</b></label>
</div>

<div class="card"><h2>🩻 الحساس عبر TWAIN (بلا برنامج الشركة)</h2>
<div class="hint">إن كان تعريفُ الحساس مثبّتاً على هذا الكمبيوتر، يضغط الطبيب «التقاط من الجهاز» في SyDent فيتسلّح الحساسُ هنا تلقائياً، ويصوّر، وتصل الصورة إلى المريض. اضغط «اكتشاف الأجهزة» واختر الحساس مرةً واحدة.</div>
<div class="row" style="margin-top:10px"><button onclick="twDiscover()">🔍 اكتشاف الأجهزة</button>
<select id="twSource" onchange="setTwain({source:this.value})" style="flex:1;min-width:220px;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)"><option value="">— اختر الحساس —</option></select>
<button class="p" id="twShot" onclick="setTwain({acquire:true})">📸 التقاط الآن (تجربة)</button></div>
<div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="twAuto" onchange="setTwain({auto:this.checked})"> تسليح الحساس تلقائياً عند طلب من SyDent</label>
<label class="chk"><input type="checkbox" id="twUI" onchange="setTwain({show_ui:this.checked})"> إظهار واجهة تعريف الحساس</label>
<label>المهلة (ث): <input type="text" id="twWait" maxlength="3" dir="ltr" style="width:70px;flex:none" onchange="setTwain({wait_sec:parseInt(this.value,10)||120})"></label></div>
<div class="muted" id="twSt" style="margin-top:8px"></div>
</div>

<div class="card"><h2>📡 استقبال DICOM من البانوراما / CBCT</h2>
<div class="hint">أجهزةُ البانوراما والسيفالومترية وCBCT ترسل صورَها بالشبكة إلى «جهاز أرشفة». فعّل المستقبِل هنا، ثم أدخل في إعدادات جهاز الأشعة (Send to / DICOM Store / PACS) عنوانَ هذا الكمبيوتر والمنفذ وعنوان AE أدناه. الصورُ الواصلة تُحفظ ثم تُرفع تلقائياً كأي صورة.</div>
<div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="dcmOn" onchange="setDicom({enabled:this.checked})"> تفعيل المستقبِل</label>
<span class="st" id="dcmSt"></span></div>
<div class="row" style="margin-top:10px"><label>عنوان AE: <input type="text" id="dcmAE" maxlength="16" dir="ltr" style="width:140px;flex:none" onchange="setDicom({ae:this.value})"></label>
<label>المنفذ: <input type="text" id="dcmPort" maxlength="5" dir="ltr" style="width:90px;flex:none" onchange="setDicom({port:parseInt(this.value,10)||0})"></label>
<button onclick="setDicom({firewall:true})">🛡 السماح بجدار ويندوز</button></div>
<div class="hint" style="margin-top:8px">عناوين IP لهذا الكمبيوتر: <b id="dcmIPs" dir="ltr"></b> · ملفاتُ DICOM الواردة تُحفظ في <span id="dcmDir" dir="ltr"></span> (مُراقَب تلقائياً)</div>
</div>

<div class="card"><h2>التشغيل</h2>
<div class="row"><label class="chk"><input type="checkbox" id="autostart" onchange="setAuto(this.checked)"> تشغيل مع تسجيل الدخول إلى ويندوز</label>
<button id="pauseBtn" onclick="pause()">⏸ إيقاف الرفع مؤقتاً</button><button class="d" onclick="quit()">⏻ إغلاق البرنامج</button></div>
<div class="hint" style="margin-top:8px">ملفُّ الإعدادات: <span id="cfgdir" dir="ltr"></span></div>
</div>

<div class="card"><h2>السجل</h2><div class="log list" id="log"></div></div>
</div>
<script>
var S={};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
async function api(p,b){var r=await fetch(p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});return r.json()}
async function refresh(){try{S=await api('/api/state')}catch(e){document.getElementById('status').innerHTML='<span class="st bad"><span class="dot"></span> البرنامج لا يستجيب</span>';return}
 document.getElementById('ver').textContent='v'+S.version;document.getElementById('cfgdir').textContent=S.config_dir;
 var st=document.getElementById('status');
 if(!S.paired){st.innerHTML='<span class="st wait"><span class="dot"></span> غير مقترن — أدخل رمز الاقتران أدناه</span>'}
 else if(S.last_err==='unauthorized'){st.innerHTML='<span class="st bad"><span class="dot"></span> رُفض مفتاح الجهاز — اقرن من جديد</span>'}
 else if(S.last_err){st.innerHTML='<span class="st bad"><span class="dot"></span> لا اتصال بالخادم — تُعاد المحاولة</span>'}
 else if(S.paused){st.innerHTML='<span class="st wait"><span class="dot"></span> الرفع متوقف مؤقتاً</span>'}
 else{st.innerHTML='<span class="st ok"><span class="dot"></span> متصل · '+esc(S.device_name)+((S.polled_ago<0||S.polled_ago<10)?'':' · آخر اتصال قبل '+S.polled_ago+' ث')+'</span>'}
 var rq=document.getElementById('reqs');
 rq.innerHTML=(S.requests&&S.requests.length)?'<div class="list">'+S.requests.map(function(r){return '<div class="item req">⏳ بانتظار صورة: '+esc(r.patient_name)+(r.teeth&&r.teeth.length?' · السن '+esc(r.teeth.join('،')):'')+(r.xray_type?' · '+esc(r.xray_type):'')+'</div>'}).join('')+'</div>':(S.paired?'لا طلبات مفتوحة الآن — الصور الجديدة تذهب إلى «وارد الأجهزة».':'');
 var prevMsg=(document.getElementById('pairMsg')||{}).textContent||'';var prevCode=(document.getElementById('code')||{}).value||'';
 var typing=!S.paired&&document.getElementById('code')&&document.activeElement===document.getElementById('code'); /* لا نعيد رسم بطاقة الاقتران أثناء الكتابة */
 var pairHTML=S.paired
  ?'<h2>الاقتران</h2><div class="row"><span>مقترن باسم <b>'+esc(S.device_name)+'</b>'+(S.paired_at?' منذ '+esc(S.paired_at.slice(0,10)):'')+'</span><button class="d" onclick="unpair()">إلغاء الاقتران</button></div><div class="hint">لإيقاف الجهاز نهائياً استعمل زر «إيقاف» من إعدادات SyDent أيضاً.</div>'
  :'<h2>الاقتران</h2><div class="hint">من SyDent: الإعدادات ← العيادة ← قسم «الأجهزة — SyDent Bridge» ← «رمز اقتران جديد»، ثم اكتب الرمز هنا خلال 10 دقائق.</div><div class="row" style="margin-top:10px"><input type="text" id="code" class="code" maxlength="9" placeholder="XXXX XXXX" autocomplete="off" value="'+esc(prevCode)+'"><button class="p" onclick="pair()">🔗 اقتران</button><button onclick="ping()">🌐 اختبار الاتصال بالخادم</button></div><div class="muted" id="pairMsg">'+esc(prevMsg)+'</div>';
 if(!typing)document.getElementById('cardPair').innerHTML=pairHTML;
 document.getElementById('dirs').innerHTML=(S.watch_dirs&&S.watch_dirs.length)?S.watch_dirs.map(function(d){return '<div class="item"><span class="t">'+esc(d)+'</span><button class="d" onclick="rmDir(\''+esc(d).replace(/\\\\/g,'\\\\\\\\')+'\')">✕</button></div>'}).join(''):'<div class="muted">لا مجلدات بعد — أضف مجلد حفظ صور الحساس.</div>';
 document.getElementById('moveDone').checked=!!S.move_done;document.getElementById('autostart').checked=!!S.autostart;document.getElementById('autostart').disabled=S.os!=='windows';
 document.getElementById('pauseBtn').textContent=S.paused?'▶ استئناف الرفع':'⏸ إيقاف الرفع مؤقتاً';
 var T=S.twain||{};document.getElementById('twAuto').checked=!!T.auto;document.getElementById('twUI').checked=!!T.show_ui;
 if(document.activeElement!==document.getElementById('twWait'))document.getElementById('twWait').value=T.wait_sec||120;
 var sel=document.getElementById('twSource');if(document.activeElement!==sel){var opts='<option value="">— اختر الحساس —</option>';var seen=false;(T.sources||[]).forEach(function(s){seen=seen||s.product===T.source;opts+='<option value="'+esc(s.product)+'"'+(s.product===T.source?' selected':'')+'>'+esc(s.product)+(s.manufacturer?' — '+esc(s.manufacturer):'')+'</option>'});if(T.source&&!seen)opts+='<option value="'+esc(T.source)+'" selected>'+esc(T.source)+'</option>';sel.innerHTML=opts}
 document.getElementById('twShot').disabled=!!T.busy||!T.supported;
 document.getElementById('twSt').textContent=!T.supported?'TWAIN متاحٌ على ويندوز فقط.':(T.busy?'⏳ الحساس مسلّح — صوّر الآن…':(T.last_err?'❌ '+T.last_err:(T.last_ok?'✓ آخر صورة '+T.last_ok:(T.source?'جاهز: '+T.source:'لم يُختر حساس بعد.'))));
 var D=S.dicom||{};document.getElementById('dcmOn').checked=!!D.enabled;
 if(document.activeElement!==document.getElementById('dcmAE'))document.getElementById('dcmAE').value=D.ae||'';
 if(document.activeElement!==document.getElementById('dcmPort'))document.getElementById('dcmPort').value=D.port||'';
 document.getElementById('dcmIPs').textContent=(D.ips||[]).join(' · ')||'—';document.getElementById('dcmDir').textContent=D.dir||'';
 var ds=document.getElementById('dcmSt');ds.className='st '+(D.running?'ok':(D.enabled?'bad':'wait'));ds.innerHTML='<span class="dot"></span> '+(D.running?('يستمع · وصلت '+(D.received||0)+' صورة'+(D.last_at?' · آخرها '+esc(D.last_at):'')):(D.enabled?'تعذّر فتح المنفذ — راجع السجل':'متوقف'));
 document.getElementById('log').innerHTML=(S.logs||[]).map(function(l){return '<div class="item '+esc(l.kind)+'"><span class="muted" dir="ltr">'+esc(l.at)+'</span><span>'+esc(l.text)+'</span></div>'}).join('')||'<div class="muted">لا شيء بعد.</div>';
}
async function ping(){var m=document.getElementById('pairMsg');m.textContent='جارٍ الاختبار…';var r=await api('/api/ping');m.textContent=r.ok?('✓ الخادم يستجيب ('+r.ms+' ms) — الاقتران سيعمل'):('❌ '+r.error)}
async function pair(){var c=(document.getElementById('code').value||'').replace(/\s|-/g,'');var m=document.getElementById('pairMsg');m.textContent='جارٍ الاقتران…';var r=await api('/api/pair',{code:c});m.textContent=r.ok?'':('❌ '+r.error);refresh()}
async function unpair(){if(!confirm('إلغاء الاقتران على هذا الكمبيوتر؟'))return;await api('/api/unpair',{});refresh()}
async function addDir(){var v=document.getElementById('dirIn').value.trim();if(!v)return;var r=await api('/api/dirs',{add:v});if(!r.ok)alert(r.error);else document.getElementById('dirIn').value='';refresh()}
async function rmDir(d){await api('/api/dirs',{remove:d});refresh()}
async function setMove(on){await api('/api/dirs',{move_done:on});refresh()}
async function suggest(){var b=document.getElementById('sug');b.innerHTML='<div class="muted">جارٍ البحث عن مجلدات فيها صور حديثة…</div>';var r=await api('/api/suggest');b.innerHTML=(r.dirs&&r.dirs.length)?r.dirs.map(function(d){return '<div class="item"><span class="t">'+esc(d)+'</span><button onclick="addSug(this.dataset.d)" data-d="'+esc(d)+'">➕</button></div>'}).join(''):'<div class="muted">لم أجد مجلدات بصور حديثة — اكتب المسار يدوياً.</div>'}
async function addSug(d){await api('/api/dirs',{add:d});document.getElementById('sug').innerHTML='';refresh()}
async function setTwain(o){var r=await api('/api/twain',o);if(r.error)alert(r.error);refresh()}
async function twDiscover(){document.getElementById('twSt').textContent='جارٍ البحث عن أجهزة TWAIN…';var r=await api('/api/twain',{discover:true});if(r.error)alert(r.error);else if(!(r.sources||[]).length)alert('لم يُعثر على أي جهاز TWAIN — ثبّت تعريف الحساس من شركته ثم أعد المحاولة');refresh()}
async function setDicom(o){var r=await api('/api/dicom',o);if(r.firewall)alert(r.firewall);refresh()}
async function pause(){await api('/api/pause',{});refresh()}
async function setAuto(on){var r=await api('/api/autostart',{on:on});if(!r.ok)alert(r.error);refresh()}
async function quit(){if(!confirm('إغلاق SyDent Bridge؟ لن تُرفع صور حتى تشغّله من جديد.'))return;await api('/api/quit',{});document.body.innerHTML='<div class="wrap"><div class="card">أُغلق البرنامج.</div></div>'}
refresh();setInterval(refresh,2000);
</script></body></html>`

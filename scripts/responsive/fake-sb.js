/* D1 — offline Supabase stub for scripts/check-responsive.js: fictional demo data only (no real clinic or patient).
   Every query resolves with the table's rows regardless of filters — enough to render each page's layout. */
(function(){
  var uid='00000000-0000-0000-0000-000000000001';
  function ds(off){var d=new Date();d.setDate(d.getDate()+off);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  var names=['أحمد الخطيب','سارة العلي','محمد حداد','ليلى سليمان','يوسف نصر','رنا حمدان','خالد المصري','هبة يوسف'];
  var appts=[];var times=['09:00','10:00','11:30','13:00','15:00','16:30'];
  var st=['confirmed','scheduled','completed','confirmed','pending','no_show'];
  for(var o=-3;o<10;o++){for(var k=0;k<((o+20)%3)+2;k++){var i=appts.length;appts.push({id:'a'+i,doctor_id:uid,patient_id:'p'+(i%8),patient_name:names[i%8],date:ds(o),time:times[k],duration:60,type:'فحص',status:o<0?'completed':st[i%6],notes:'',is_planned:false});}}
  appts.push({id:'pl1',doctor_id:uid,patient_id:'p1',patient_name:names[1],date:null,time:null,duration:60,type:'تقويم',status:'scheduled',is_planned:true,reason:'متابعة تقويم'});
  var F={appointments:appts,patients:names.map(function(n,i){return{id:'p'+i,name:n,phone:'0999000'+i,doctor_id:uid,patient_number:i+1,status:['تحت العلاج','مكتمل','جديد'][i%3],created_at:new Date().toISOString(),gender:i%2?'أنثى':'ذكر',dob:(1960+i*7)+'-03-15',referral_source:['friend','social','search'][i%3],medical_flags:i%3===0?['diabetes']:(i%4===1?['penicillin_allergy']:[]),created_at:new Date(Date.now()-i*40*864e5).toISOString()};}),
    doctors:[{id:uid,name:'د. تجربة',clinic_name:'عيادة الاختبار',plan:'pro',status:'active',trial_ends_at:null,role:'owner'}],
    treatments:[{key:'exam',name:'فحص',color:'#3f4fc4',doctor_id:uid}],clinic_settings:[{doctor_id:uid,currency:'SYP'}],trial_requests:[{user_id:uid,status:'accepted',plan:'pro'}],subscriptions:[{doctor_id:uid,status:'active',plan:'pro'}],
    inventory_items:[{id:'i1',owner_id:uid,name:'قفازات لاتكس M',unit:'علبة',quantity:3,reorder_level:10,reorder_qty:10,purchase_price:45000,currency:'SYP',is_active:true},{id:'i2',owner_id:uid,name:'بنج موضعي',unit:'كبسولة',quantity:40,reorder_level:20,purchase_price:1.2,currency:'USD',is_active:true},{id:'i3',owner_id:uid,name:'كمبوزيت — تطبيق',unit:'تطبيق',quantity:8,reorder_level:5,purchase_price:null,currency:'SYP',is_active:true}],
    inventory_suppliers:[{id:'s1',owner_id:uid,name:'مستودع الشفاء',phone:'0944123456',note:'يوصل يوم الثلاثاء',is_active:true},{id:'s2',owner_id:uid,name:'شركة الرازي للمستلزمات',phone:null,note:null,is_active:true}],
    inventory_orders:[{id:'o1',owner_id:uid,supplier_id:'s1',status:'partial',note:'التوصيل قبل الخميس',created_at:new Date(Date.now()-3*864e5).toISOString(),inventory_order_lines:[{id:'l1',item_id:'i1',qty_ordered:20,qty_received:12},{id:'l2',item_id:'i2',qty_ordered:100,qty_received:0}]},{id:'o2',owner_id:uid,supplier_id:'s2',status:'received',note:null,created_at:new Date(Date.now()-20*864e5).toISOString(),inventory_order_lines:[{id:'l3',item_id:'i3',qty_ordered:10,qty_received:10}]},{id:'o3',owner_id:uid,supplier_id:null,status:'open',note:null,created_at:new Date(Date.now()-864e5).toISOString(),inventory_order_lines:[{id:'l4',item_id:'i3',qty_ordered:5,qty_received:0}]}],
    inventory_order_lines:[{id:'l1',item_id:'i1',qty_ordered:20,qty_received:12,unit_price:45000,currency:'SYP',inventory_items:{name:'قفازات لاتكس M',unit:'علبة',is_active:true,quantity:3,reorder_level:10}},{id:'l2',item_id:'i2',qty_ordered:100,qty_received:0,unit_price:1.2,currency:'USD',inventory_items:{name:'بنج موضعي',unit:'كبسولة',is_active:true,quantity:40,reorder_level:20}}],
    inventory_receipts:[{id:'r1',received_at:new Date(Date.now()-2*864e5).toISOString(),note:'فاتورة 1187',supplier_id:'s1',expense_syp_id:null,expense_usd_id:null,inventory_suppliers:{name:'مستودع الشفاء'},inventory_receipt_lines:[{item_id:'i1',qty:12,unit_price:45000,currency:'SYP',expiry_date:'2027-06-01'}]}],
    inventory_batches:[{id:'b1',owner_id:uid,item_id:'i1',lot:'IMP-2291-A',quantity:3,received_qty:5,expiry_date:'2028-03-01',is_finished:false,note:'استلام طلبية',created_at:new Date().toISOString(),inventory_items:{name:'زرعة 4.1×10',unit:'قطعة'}},{id:'b2',owner_id:uid,item_id:'i1',lot:'IMP-2291-B',quantity:2,received_qty:2,expiry_date:null,is_finished:false,note:null,created_at:new Date().toISOString(),inventory_items:{name:'زرعة 4.1×10',unit:'قطعة'}}],
    inventory_movements:[{item_id:'i2',reason:'consume',provider_id:null,ledger_sessions:{type:'حشوة كمبوزيت'},batch_id:'b1',change:-4,created_at:new Date(Date.now()-5*864e5).toISOString(),patient_id:'p0',patients:{name:'أحمد الخطيب',phone:'09990000',patient_number:1},inventory_items:{name:'زرعة 4.1×10',unit:'قطعة'},inventory_batches:{lot:'IMP-2291-A',expiry_date:'2028-03-01'}},{item_id:'i1',reason:'consume',provider_id:null,ledger_sessions:{type:'معالجة لبية'},batch_id:'b1',change:-1,created_at:new Date(Date.now()-2*864e5).toISOString(),patient_id:'p3',patients:{name:'ليلى سليمان',phone:'09990003',patient_number:4},inventory_items:{name:'بنج موضعي',unit:'كبسولة'},inventory_batches:{lot:'IMP-2291-A',expiry_date:'2028-03-01'}}],
    expense_categories:[{id:'c1',owner_id:uid,name:'مواد ومستلزمات',is_active:true,icon:'📦',color:'#3f4fc4'}],expenses:[]};
  function chain(t){var rows=F[t]||[];var single=false;var p={};
    var h={get:function(_,k){if(k==='then'){return function(res,rej){var d=single?(rows[0]||null):rows;return Promise.resolve({data:d,error:null,count:rows.length}).then(res,rej);};}
      if(k==='single'||k==='maybeSingle'){return function(){single=true;return pr;};}
      return function(){return pr;};}};
    var pr=new Proxy(p,h);return pr;}
  var user={id:uid,email:'demo@sydent.app'};
  var stub={auth:{getUser:function(){return Promise.resolve({data:{user:user},error:null});},getSession:function(){return Promise.resolve({data:{session:{user:user,access_token:'x'}},error:null});},
      onAuthStateChange:function(){return{data:{subscription:{unsubscribe:function(){}}}};},signOut:function(){return Promise.resolve({});}},
    from:chain,rpc:function(){return Promise.resolve({data:null,error:null});},
    storage:{from:function(){return chain('_');}},channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;},removeChannel:function(){},
    functions:{invoke:function(){return Promise.resolve({data:null,error:null});}}};
  window.supabase={createClient:function(){return stub;}};
})();

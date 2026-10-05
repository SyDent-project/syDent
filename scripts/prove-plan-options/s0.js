const h = require('./h.js');
function seed(b) {
  const { db, run } = b, T = db.T;
  const D = 'D1', P = 'P1';
  T.teeth_status.push(
    { doctor_id:D, patient_id:P, tooth_num:'44', surface:'WHOLE', treatment_key:'extracted', status:'completed', unit_id:null, review_at:null, provider_id:null },
    { doctor_id:D, patient_id:P, tooth_num:'43', surface:'WHOLE', treatment_key:'bridge', status:'planned', unit_id:'U1', review_at:null, provider_id:null },
    { doctor_id:D, patient_id:P, tooth_num:'45', surface:'WHOLE', treatment_key:'bridge', status:'planned', unit_id:'U1', review_at:null, provider_id:null },
    { doctor_id:D, patient_id:P, tooth_num:'44', surface:'PONTIC', treatment_key:'bridge', status:'planned', unit_id:'U1', review_at:null, provider_id:null },
    { doctor_id:D, patient_id:P, tooth_num:'36', surface:'CROWN_FULL', treatment_key:'crown', status:'planned', unit_id:null, review_at:null, provider_id:null });
  const L = (o) => T.ledger_sessions.push({ doctor_id:D, patient_id:P, description:'', notes:'', provider_id:'PR1', appointment_id:null, quadrant:null, arch:null, phase:null, currency:'SYP', plan_option:null, units:null, date:'2026-09-19', ...o });
  L({ id:'x44', type:'قلع', treatment_key:'extracted', cost:3000, tooth_num:'44', surface:'WHOLE', status:'completed', created_at:'2026-09-19T08:00:00Z' });
  L({ id:'zr36', type:'تاج زركون', treatment_key:'czr', cost:10000, tooth_num:'36', surface:'CROWN_FULL', status:'planned', phase:1, created_at:'2026-09-19T09:00:00Z' });
  L({ id:'br', type:'جسر', treatment_key:'bridge', cost:10000, tooth_num:'43,44,45', surface:'WHOLE', status:'planned', phase:1, description:'جسر يشمل الأسنان 43، 44، 45', created_at:'2026-09-19T10:00:00Z' });
  L({ id:'pfm36', type:'تاج خزف على معدن', treatment_key:'crown', cost:5000, tooth_num:'36', surface:'CROWN_FULL', status:'planned', phase:2, created_at:'2026-09-19T11:00:00Z' });
  load(b);
}
function load(b) {   // the page's loadData for the two tables
  b.ctx.sessions = b.db.T.ledger_sessions.map(r => ({ ...r })).sort((a, c) => String(c.created_at).localeCompare(String(a.created_at)));
  b.ctx.teethMap = h.mapFromDB(b.db);
}
module.exports = { seed, load };
if (require.main === module) {
  const b = h.boot(); seed(b);
  // Try the REAL save path for an alt bridge on the pontic
  b.run(`openToothModal(44, 'WHOLE')`).then(async () => {
    b.run(`openAltBridgePicker(44)`);
    console.log('picker:', /pickToothTreatment\('c_zr'/.test(b.els.toothOptsContainer.innerHTML), /pickToothTreatment\('implant'/.test(b.els.toothOptsContainer.innerHTML));
    b.run(`pickToothTreatment('c_zr', 'جسر (زركون)')`);
    b.els.toothCost.value = '25000'; b.els.toothDate.value = '2026-09-19'; b.els.toothNotes.value = '';
    try { await b.run(`saveToothTreatment()`); } catch (e) { console.log('SAVE THREW', e.stack.split('\n').slice(0,4).join(' | ')); }
    console.log('toasts', b.toasts); console.log('warns', b.ctx._warns.slice(0,5));
    console.log('ledger', b.db.T.ledger_sessions.map(r => [r.id, r.type, r.tooth_num, r.status, r.plan_option, r.cost].join('/')).join('\n'));
    console.log('chart==db', h.norm(b.ctx.teethMap) === h.norm(h.mapFromDB(b.db)));
  });
}

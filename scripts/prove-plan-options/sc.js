const h = require('./h.js'), S = require('./s0.js');
let OK = 0, BAD = 0; const fails = [];
function T(name, cond, extra) { if (cond) OK++; else { BAD++; fails.push(name + (extra ? ' :: ' + extra : '')); } console.log((cond ? '✓ ' : '✗ ') + name + (!cond && extra ? '  → ' + extra : '')); }

async function modalSave(b, tooth, surface, key, label, status, cost, cur, alt) {
  b.toasts.length = 0; b.ctx._cur = cur || 'SYP';
  await b.run(`openToothModal(${tooth}, '${surface}')`);
  if (alt) b.run(`openAltBridgePicker(${tooth})`);
  b.run(`pickToothTreatment('${key}', '${label}')`);
  if (status && !alt) b.run(`pickStatus('${status}')`);
  b.els.toothCost.value = String(cost); b.els.toothDate.value = '2026-09-19'; b.els.toothNotes.value = '';
  await b.run('saveToothTreatment()');
}
const byType = (b, type, tn) => b.ctx.sessions.find(s => s.type === type && (!tn || String(s.tooth_num) === String(tn)));

function invariants(b, tag, opt) {
  opt = opt || {};
  // I1 chart in memory == chart the page would reload from the DB
  const mem = h.norm(b.ctx.teethMap), dbm = h.norm(h.mapFromDB(b.db));
  T(`[${tag}] I1 المخطط بالذاكرة = المخطط من القاعدة`, mem === dbm, mem === dbm ? '' : '\n   mem=' + mem + '\n   db =' + dbm);
  // I2 sessions in memory == DB rows (id,status,plan_option)
  const k = r => [r.id, r.status, r.plan_option == null ? '' : r.plan_option].join(':');
  const a = b.ctx.sessions.map(k).sort().join(','), d = b.db.T.ledger_sessions.map(k).sort().join(',');
  T(`[${tag}] I2 الجلسات بالذاكرة = القاعدة`, a === d, a === d ? '' : '\n   mem=' + a + '\n   db =' + d);
  // I3 no completed/non-planned session carries an option; options ⊂ 1..3
  // v464: a completed item may keep its option only as a *pending adoption* marker — i.e. while rival options are still planned
  const plannedOpts = new Set(b.db.T.ledger_sessions.filter(r => r.status === 'planned' && r.plan_option != null).map(r => r.plan_option));
  const badOpt = b.db.T.ledger_sessions.filter(r => r.plan_option != null && (![1, 2, 3].includes(r.plan_option)
      || (r.status !== 'planned' && !(r.status === 'completed' && [...plannedOpts].some(o => o !== r.plan_option)))));
  T(`[${tag}] I3 لا وسم خيار على جلسة غير مخطّطة (إلا علامة اعتمادٍ معلّق)`, !badOpt.length, badOpt.map(r => r.type + '/' + r.status).join(','));
  // I4 every drawn planned bridge unit has a planned bridge session with the same teeth and key
  const units = {};
  for (const r of b.db.T.teeth_status) if (r.unit_id && r.status === 'planned') (units[r.unit_id] = units[r.unit_id] || { key: r.treatment_key, teeth: new Set() }).teeth.add(Number(r.tooth_num));
  /* skipI4: حذفُ جلسة جسرٍ مخطّط **بلا أي بديل** يترك رسمه (سلوكٌ سابق موثّق: الإزالة بزر «إزالة الجسر») */
  if (!opt.skipI4) for (const [u, v] of Object.entries(units)) {
    const hit = b.db.T.ledger_sessions.some(s => s.status === 'planned' && String(s.tooth_num).includes(',') && s.treatment_key === v.key
      && String(s.tooth_num).split(',').map(Number).sort().join() === [...v.teeth].sort().join());
    T(`[${tag}] I4 وحدة ${u} المرسومة (${v.key}) لها جلسة مخطّطة مطابقة`, hit);
  }
  // I6 (v468) a planned single-tooth implant is drawn on the chart — unless it is a ledger-only alternative
  //    to a bridge that is still planned over that tooth
  for (const x of b.db.T.ledger_sessions.filter(r => r.status === 'planned' && !String(r.tooth_num).includes(',') && r.treatment_key === 'implant')) {
    const t = Number(x.tooth_num);
    const drawn = b.db.T.teeth_status.some(r => Number(r.tooth_num) === t && r.surface === 'WHOLE' && r.treatment_key === 'implant');
    const covered = b.db.T.ledger_sessions.some(r => r.status === 'planned' && String(r.tooth_num).includes(',') && String(r.tooth_num).split(',').map(Number).includes(t));
    T(`[${tag}] I6 زرعةٌ مخطّطة على ${t} مرسومة أو بديلٌ لجسرٍ مخطّط قائم`, drawn || covered);
  }
  // I5 real renderer + every tooltip builder run without throwing
  let err = null; try { b.run('renderTeeth()'); } catch (e) { err = e.stack.split('\n').slice(0, 3).join(' | '); }
  T(`[${tag}] I5 renderTeeth بلا استثناء`, !err, err);
}
function tipOf(b, n) {   // the tooltip the chart would show for tooth n (facial cell + occlusal)
  const sm = b.ctx.teethMap[String(n)] || {};
  const up = Number(String(n)[0]) <= 2;
  let cell = '';
  try {
    if (b.run(`isExtractionDone ? isExtractionDone(${n}) : isExtracted(${n})`) && !(sm.PONTIC)) cell = b.run(`buildExtractedPlaceholder(${n}, ${up})`);
    else if (sm.PONTIC) cell = b.run(`buildPonticTooth(${n}, ${up})`);
    else if (b.run(`isImplant(${n})`)) cell = b.run(`buildImplantTooth(${n}, ${up})`);
    else cell = b.run(`buildTooth(${n}, chartFilterSM(teethMap['${n}']), ${up})`);
  } catch (e) { cell = 'THREW ' + e.message; }
  let occ = ''; try { occ = b.run(`occTipRows(${n}, teethMap['${n}'] || {})`); } catch (e) { occ = 'THREW ' + e.message; }
  const m = /<div class="tooth-tip">([\s\S]*?)<\/div>(?=[^]*$)/.exec(cell);
  const strip = x => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tipHtml = (cell.match(/<div class="tooth-tip">[\s\S]*$/) || [''])[0];
  return { facial: strip(tipHtml), occ: strip(occ), threw: /^THREW/.test(cell) || /^THREW/.test(occ), raw: cell };
}

async function buildFull() {
  const b = await h.bootAsync(); S.seed(b);
  await modalSave(b, 44, 'WHOLE', 'c_zr', 'جسر (زركون)', null, 25000, 'SYP', true);
  // owner's own tagging: A = zirconia (crown 36 + zr bridge) · B = PFM 36 + bridge
  await b.run(`setSessionOption('zr36', 1)`); await b.run(`setSessionOption('pfm36', 2)`);
  const zb = byType(b, 'جسر (زركون)'); await b.run(`setSessionOption('${zb.id}', 1)`); await b.run(`setSessionOption('br', 2)`);
  await modalSave(b, 44, 'WHOLE', 'implant', 'زراعة', null, 350, 'USD', true);
  await modalSave(b, 43, 'CROWN_FULL', 'czr', 'تاج زركون', 'planned', 10000, 'SYP', false);
  await modalSave(b, 36, 'WHOLE', 'extracted', 'قلع', 'planned', 3000, 'SYP', false);
  const c43 = byType(b, 'تاج زركون', 43), e36 = b.ctx.sessions.find(s => s.type === 'قلع' && String(s.tooth_num) === '36');
  if (c43) await b.run(`setSessionOption('${c43.id}', 3)`);
  if (e36) await b.run(`setSessionOption('${e36.id}', 3)`);
  return b;
}
module.exports = { T, modalSave, byType, invariants, tipOf, buildFull, get OK() { return OK; }, get BAD() { return BAD; }, fails };

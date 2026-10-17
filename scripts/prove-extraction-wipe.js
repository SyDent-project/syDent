#!/usr/bin/env node
/* v608 — القلعُ المنجز يُنهي السنّ (بلاغُ المالك بصورتين، 11 تشرين الأول 2026: سنٌّ 43 عليه كسران قُلع
   وبقي الكسران بتلميحه وزرّا «إزالة كسر» بنافذته).
   يحمّل عُدّةَ dom-smoke الحقيقية (pp-*.js الحيّة) بـjsdom ويقيس على stub قاعدةٍ يلتقط السلسلة كاملة:
   ① wipeToothAfterExtraction: تُمحى أسطحُ التاج والجذور والحالات، ويبقى WHOLE/PONTIC/SOCKET/SPACER،
      والحالاتُ تُجمع dx («B:cond-fracture,R1:cond-fracture») ومرآةُ dx الممحوّة تُصفّر.
   ② isExtractionLandedStatus: منجز/قائم نعم · مخطّط/محوَّل لا (قلعٌ مخطّط = سنٌّ قائم).
   ③ syncToothStatusOnComplete (المستخرجة من patient-profile.html): إنجازُ قلعٍ مخطّط من الجلسة ⇒ المحوُ
      نفسه + dx_key على صفّ القلع + مرآةُ dx محلياً + صفوفُ الخريطة كما بالمخطط.
   ④ undoExtraction: إلغاءُ القلع يعيد الحالاتِ المحمولة صفوفَ «condition» على أسطحها.
   --self-test: 5 طفرات على المصدر يجب أن تُسقط التوكيدات. بلا jsdom ⇒ يتخطّى بـ0 (نمطُ acorn). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت محو القلع (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const DENTAL = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8');
const PROFILE = fs.readFileSync(path.join(ROOT, 'patient-profile.html'), 'utf8');
function extractFn(src, name) {
  const i = src.indexOf('async function ' + name + '(');
  if (i < 0) throw new Error(name + ' غائبة');
  let d = 0, j = src.indexOf('{', i), k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const SYNC = extractFn(PROFILE, 'syncToothStatusOnComplete');

function boot(dentalSrc, label) {
  const tmp = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.' + label + '.js');
  fs.writeFileSync(tmp, dentalSrc);
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmp)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>')
    .replace('</body>', '<script>' + SYNC.replace(/<\/script/gi, '<\\/script') + '</script></body>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}
/* stub قاعدةٍ يلتقط السلسلة كاملةً (delete/update/upsert + eq/in) عند التنفيذ لا عند الاستدعاء */
function installDb(w) {
  const log = [];
  w.sb = { from: (table) => {
    const st = { table, op: null, payload: null, eq: {}, in: {} };
    const api = {
      delete() { st.op = 'delete'; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p) { st.op = 'upsert'; st.payload = p; log.push(st); return Promise.resolve({ data: [p], error: null }); },
      insert(p) { st.op = 'insert'; st.payload = p; log.push(st); return { select: () => ({ single: () => Promise.resolve({ data: Object.assign({ id: 'sess-x' }, p), error: null }) }) }; },
      select() { return api; }, eq(k, v) { st.eq[k] = v; return api; }, in(k, v) { st.in[k] = v.slice(); return api; },
      order() { return api; }, limit() { return api; }, not() { return api; }, or() { return api; },
      single() { return Promise.resolve({ data: null, error: null }); },
      then(res) { log.push(st); return Promise.resolve({ data: [], error: null }).then(res); }
    };
    return api;
  }, rpc: () => Promise.resolve({ data: null, error: null }) };
  return log;
}
const seed43 = () => ({ '43': { B: 'cond-fracture', R1: 'cond-fracture', L: 'composite', WHOLE: 'extracted', SOCKET: 'socket-graft',
  __status: { B: 'condition', R1: 'condition', L: 'completed', WHOLE: 'planned', SOCKET: 'completed' } } });

async function assertions(src) {
  const fails = [];
  const T = (n, ok, extra) => { if (!ok) fails.push(n + (extra ? ' :: ' + String(extra).slice(0, 220) : '')); };
  const w = await boot(src, 'xw');
  T('0 العُدّة أقلعت بلا أخطاء', w.__ERRORS.length === 0 && typeof w.wipeToothAfterExtraction === 'function', w.__ERRORS.join(' | '));
  if (fails.length) return fails;
  /* ① المحو */
  let log = installDb(w);
  w.teethMap = seed43(); w.teethDx = { '43': { L: 'L:cond-caries' } };
  const dx = await w.wipeToothAfterExtraction('43', 'pat-1');
  const del = log.filter(x => x.op === 'delete');
  T('1a حذفٌ واحد مقيَّد بالطبيب والمريض والسن', del.length === 1 && del[0].eq.doctor_id === 'doc-1' && del[0].eq.patient_id === 'pat-1' && del[0].eq.tooth_num === '43', JSON.stringify(del));
  T('1b الأسطحُ الممحوّة = B·R1·L فقط (لا WHOLE ولا SOCKET)', del.length === 1 && del[0].in.surface.slice().sort().join() === 'B,L,R1', JSON.stringify(del[0] && del[0].in));
  T('1c dx المجموع = كسر دهليزي + كسر جذري + تشخيصُ الحشوة', dx === 'B:cond-fracture,R1:cond-fracture,L:cond-caries', dx);
  const m = w.teethMap['43'];
  T('1d الخريطةُ: WHOLE وSOCKET باقيان والباقي ممحوّ (قيمةً وحالةً)', m.WHOLE === 'extracted' && m.SOCKET === 'socket-graft' && !m.B && !m.R1 && !m.L && !m.__status.B && !m.__status.L, JSON.stringify(m));
  T('1e مرآةُ dx الممحوّة صُفّرت', !w.teethDx['43'] || !w.teethDx['43'].L, JSON.stringify(w.teethDx));
  T('1f سنٌّ بلا صفوفٍ أخرى ⇒ لا حذفَ ولا dx', (await (async () => { const l2 = installDb(w); w.teethMap = { '21': { WHOLE: 'extracted' } }; const r = await w.wipeToothAfterExtraction('21', 'pat-1'); return r === '' && l2.length === 0; })()));
  /* ② الحالات التي تُنهي السن */
  T('2 منجز/قائم تُنهي السن · مخطّط/محوَّل لا', w.isExtractionLandedStatus('completed') && w.isExtractionLandedStatus('existing_current') && w.isExtractionLandedStatus('existing_other') && !w.isExtractionLandedStatus('planned') && !w.isExtractionLandedStatus('referred') && !w.isExtractionLandedStatus('condition'));
  /* ③ إنجازُ القلع من الجلسة */
  log = installDb(w);
  w.teethMap = seed43(); w.teethDx = {};
  await w.syncToothStatusOnComplete({ id: 's-ext', tooth_num: '43', surface: 'WHOLE', treatment_key: 'extracted', type: 'قلع', status: 'completed', patient_id: 'pat-1' });
  const ups = log.filter(x => x.op === 'update'), dels = log.filter(x => x.op === 'delete');
  T('3a صفُّ القلع المخطّط صار منجزاً', ups.some(x => x.payload && x.payload.status === 'completed' && x.eq.surface === 'WHOLE' && x.eq.status === 'planned'), JSON.stringify(ups));
  T('3b المحوُ نفسه من مسار الجلسة', dels.length === 1 && dels[0].in.surface.slice().sort().join() === 'B,L,R1', JSON.stringify(dels));
  T('3c dx_key كُتب على صفّ القلع', ups.some(x => x.payload && x.payload.dx_key === 'B:cond-fracture,R1:cond-fracture' && x.eq.surface === 'WHOLE' && x.eq.tooth_num === '43'), JSON.stringify(ups));
  T('3d المرآةُ المحلية: WHOLE منجز يحمل dx والباقي ممحوّ', w.teethMap['43'].__status.WHOLE === 'completed' && !w.teethMap['43'].B && w.teethDx['43'] && w.teethDx['43'].WHOLE === 'B:cond-fracture,R1:cond-fracture', JSON.stringify([w.teethMap['43'], w.teethDx]));
  /* ④ إلغاءُ القلع يعيد الحالات */
  log = installDb(w);
  w.teethMap = { '43': { WHOLE: 'extracted', __status: { WHOLE: 'completed' } } }; w.teethDx = { '43': { WHOLE: 'B:cond-fracture,R1:cond-fracture' } };
  w.SyDialog = { confirm: () => Promise.resolve(true), alert: () => Promise.resolve() }; w.sessions = [];
  await w._undoExtraction_inner('43');
  const back = log.filter(x => x.op === 'upsert' && x.payload && x.payload.status === 'condition').map(x => x.payload.surface + ':' + x.payload.treatment_key).sort().join();
  T('4a صفّا الكسر عادا «condition» على B وR1', back === 'B:cond-fracture,R1:cond-fracture', JSON.stringify(log.map(x => [x.op, x.eq.surface, x.payload])));
  T('4b صفُّ القلع حُذف والخريطةُ تحمل الكسرين بلا WHOLE', !w.teethMap['43'].WHOLE && w.teethMap['43'].B === 'cond-fracture' && w.teethMap['43'].__status.R1 === 'condition' && !(w.teethDx['43'] && w.teethDx['43'].WHOLE), JSON.stringify([w.teethMap['43'], w.teethDx]));
  return fails;
}

const MUTANTS = [
  ['M1 المحوُ يطال SOCKET', "var keep = { WHOLE: 1, PONTIC: 1, SOCKET: 1, SPACER: 1 };", "var keep = { WHOLE: 1, PONTIC: 1, SPACER: 1 };"],
  ['M2 الحالاتُ لا تُحمل', "  return dxJoin(pairs);\n}\nfunction isExtractionLandedStatus", "  return '';\n}\nfunction isExtractionLandedStatus"],
  ['M3 القلعُ المخطّط يُنهي السن', "function isExtractionLandedStatus(st) { return st === 'completed'", "function isExtractionLandedStatus(st) { return st === 'planned' || st === 'completed'"],
  ['M4 إلغاءُ القلع لا يعيد الحالات', "if (!dr2.error && _xBack.length) await dxRestoreAfterRemoval(tn, sk2, _xBack);", "if (false) await dxRestoreAfterRemoval(tn, sk2, _xBack);"],
  ['M5 الخريطةُ تبقي الأسطحَ الممحوّة', "    delete sm[k];\n    ['__status', '__review', '__unit', '__prov']", "    ['__status', '__review', '__unit', '__prov']"]
];
(async () => {
  const fails = await assertions(DENTAL);
  if (fails.length) { console.log('prove-extraction-wipe: ' + fails.length + ' فشل'); fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
  const COUNT = (assertions.toString().match(/\bT\('/g) || []).length;
  if (process.argv.includes('--self-test')) {
    let bite = 0;
    for (const [name, a, b] of MUTANTS) {
      if (!DENTAL.includes(a)) { console.log('prove-extraction-wipe: الطفرةُ ' + name + ' لا تجد هدفها'); process.exit(1); }
      const f = await assertions(DENTAL.replace(a, b));
      if (f.length) bite++; else { console.log('prove-extraction-wipe: الطفرةُ لم تعضّ — ' + name); process.exit(1); }
    }
    console.log('prove-extraction-wipe ✅ ' + COUNT + ' توكيداً · ' + bite + '/' + MUTANTS.length + ' طفرات تعضّ');
  } else console.log('prove-extraction-wipe ✅ ' + COUNT + ' توكيداً');
  process.exit(0);
})().catch(e => { console.log('prove-extraction-wipe: خطأ — ' + (e && e.stack || e)); process.exit(1); });

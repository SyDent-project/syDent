#!/usr/bin/env node
/* v595 (+ v601: الزرعة والوهمي · ترتيبُ قراءة الحالة) — مثبتُ «الحالةُ تُرسم على الإجراء نفسه» (قرار المالك 10 تشرين الأول 2026 بعد مراجعة
   Open Dental · Dentrix Ascend · Sensei · Curve · Cloud 9):
   اللونُ للمادة، والحالةُ بالشكل على كلِّ سطحٍ وجذرٍ وتاجٍ بالمنظرين — منجز صلب · مخطط تهشيرٌ + إطار ·
   موجود/عيادتنا أفتح · موجود/عيادة أخرى أفتح + إطارٌ متقطّع · محوَّل إطارٌ منقّط — ولا تعتيمَ للسن كله.
   يحمّل عُدّةَ dom-smoke الحقيقية بـjsdom ويقيس البنية بمحلّل (#667)، ثم يُثبت أن طفراتٍ متعمَّدة تُحمرّه (#342). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت حالة الإجراء (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const DENTAL = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8');

function boot(dentalSrc, label) {
  const tmp = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.status-' + label + '.js');
  fs.writeFileSync(tmp, dentalSrc);
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmp)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

function measure(w) {
  const P = (h) => new w.DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
  w.TREATMENTS.push({ treatment_key: 'rct_t', id: 'rct_t', name: 'لبية', fill: '#a78bfa', stroke: '#6d28d9', price: 0, target_part: 'root', category: 'endo', is_active: true, currency: 'SYP', price_overrides: {} });
  w.TREATMENTS.push({ treatment_key: 'whole_t', id: 'whole_t', name: 'كامل', fill: '#22c55e', stroke: '#15803d', price: 0, target_part: 'whole', category: 'ortho', is_active: true, currency: 'SYP', price_overrides: {} });
  const set = (m) => { w.teethMap = m; const t = w.rebuildToothMaps(); w.T_FILL = t.fill; w.T_STROKE = t.stroke; w.T_LABEL = t.label; };
  const F = (n, up) => P(w.buildTooth(n, w.chartFilterSM(w.teethMap[String(n)] || {}), up));
  const O = (n, up) => P(w.buildOcclusalTooth(n, w.chartFilterSM(w.teethMap[String(n)] || {}), up));
  const K = 'custom_1781292854422';   /* حشوة كومبوزت بعُدّة الاختبار */
  const surf = (d, s) => d.querySelector('.crown-surface[data-surface="' + s + '"]');
  const r = {};
  /* ① سطوحُ السن 46 بأربع حالات — الشكلُ لكل سطحٍ على حدة، بالمنظرين */
  set({ '46': { O: K, B: K, M: K, D: K, __status: { O: 'completed', B: 'planned', M: 'existing_other', D: 'referred' } } });
  const f = F(46, false), o = O(46, false);
  const fO = surf(f, 'O'), fB = surf(f, 'B'), fM = surf(f, 'M'), fD = surf(f, 'D');
  r.completedSolid = fO && fO.getAttribute('fill') === '#60a5fa' && fO.getAttribute('fill-opacity') === String(w.SURFACE_FILL_OPACITY) && !fO.getAttribute('stroke');
  r.plannedHatched = fB && /^url\(#pf/.test(fB.getAttribute('fill')) && !!f.querySelector('pattern#' + fB.getAttribute('fill').slice(5, -1)) && fB.getAttribute('stroke') === '#1d4ed8' && !fB.getAttribute('stroke-dasharray');
  r.existingOtherDashed = fM && fM.getAttribute('fill') === '#60a5fa' && +fM.getAttribute('fill-opacity') < 0.5 && !!fM.getAttribute('stroke-dasharray');
  r.referredDotted = fD && +fD.getAttribute('fill-opacity') < 0.2 && fD.getAttribute('stroke-dasharray') === '1.6 2.4';
  r.hitZoneKept = fB.getAttribute('data-tooth') === '46' && !!fB.querySelector('title');
  const oRects = Array.from(o.querySelectorAll('rect[clip-path="url(#clo46)"]')).filter(x => !x.classList.contains('crown-surface'));
  r.occFourStyles = oRects.length === 4 && oRects.some(x => /^url\(#po/.test(x.getAttribute('fill'))) && oRects.some(x => x.getAttribute('stroke-dasharray') === '2.2 2')
    && oRects.some(x => x.getAttribute('stroke-dasharray') === '1.6 2.4') && oRects.some(x => x.getAttribute('fill-opacity') === String(w.SURFACE_FILL_OPACITY) && !x.getAttribute('stroke'));
  r.occPatternDefined = oRects.filter(x => /^url\(#po/.test(x.getAttribute('fill'))).every(x => !!o.querySelector('pattern#' + x.getAttribute('fill').slice(5, -1)));
  /* ② المفتاحُ المركّب (MOD) مخطط ⇒ حروفُه الثلاثة مهشّرة وجهياً وإطباقياً */
  set({ '36': { MOD: K, __status: { MOD: 'planned' } } });
  const f36 = F(36, false), o36 = O(36, false);
  r.compositePlanned = ['M', 'O', 'D'].every(s => /^url\(#pf/.test(surf(f36, s).getAttribute('fill')))
    && Array.from(o36.querySelectorAll('rect[clip-path="url(#clo36)"]')).filter(x => !x.classList.contains('crown-surface')).every(x => /^url\(#po/.test(x.getAttribute('fill')));
  /* ③ الجذورُ والتاجُ الكامل والسنُّ كاملاً */
  set({ '16': { R1R2R3: 'rct_t', CROWN_FULL: 'crown', __status: { R1R2R3: 'planned', CROWN_FULL: 'completed' } },
        '26': { CROWN_FULL: 'crown', __status: { CROWN_FULL: 'planned' } },
        '11': { R1: 'rct_t', WHOLE: 'whole_t', __status: { R1: 'existing_other', WHOLE: 'planned' } },
        '21': { WHOLE: 'whole_t', __status: { WHOLE: 'completed' } } });
  const f16 = F(16, true), f26 = F(26, true), o26 = O(26, true), f11 = F(11, true), o11 = O(11, true), f21 = F(21, true);
  const canals16 = Array.from(f16.querySelectorAll('path')).filter(p => /^url\(#pc/.test(p.getAttribute('fill') || ''));
  r.canalsPlannedHatched = canals16.length === 3 && canals16.every(p => p.getAttribute('stroke') === '#6d28d9');
  const crown16 = Array.from(f16.querySelectorAll('path')).find(p => p.getAttribute('fill') === '#fb923c' && p.getAttribute('fill-opacity') === '0.38');
  r.crownCompletedWash = !!crown16;
  r.crownPlannedHatched = !!Array.from(f26.querySelectorAll('path')).find(p => /^url\(#pw/.test(p.getAttribute('fill') || '') && p.getAttribute('stroke') === '#c2410c')
    && !!Array.from(o26.querySelectorAll('path')).find(p => /^url\(#pwo/.test(p.getAttribute('fill') || ''));
  const canal11 = Array.from(f11.querySelectorAll('path')).find(p => p.getAttribute('fill') === '#a78bfa' && p.getAttribute('stroke-dasharray') === '2.2 2');
  r.canalExistingOtherDashed = !!canal11;
  const ring = (d, col) => Array.from(d.querySelectorAll('path')).filter(p => p.getAttribute('fill') === 'none' && p.getAttribute('stroke') === col);
  r.wholePlannedDashedRing = ring(f11, '#22c55e').length >= 2 && ring(f11, '#22c55e').every(p => p.getAttribute('stroke-dasharray') === '5 3') && ring(o11, '#22c55e').every(p => p.getAttribute('stroke-dasharray') === '5 3');
  r.wholeCompletedSolidRing = ring(f21, '#22c55e').length >= 2 && ring(f21, '#22c55e').every(p => !p.getAttribute('stroke-dasharray'));
  /* ④ لا تعتيمَ للسن كله على المخطط/الموجود/المحوَّل — يبقى للمراقبة الرمادية وحدها */
  set({ '46': { O: K, __status: { O: 'planned' } }, '45': { O: K, __status: { O: 'existing_other' } }, '44': { O: K, __status: { O: 'completed' } }, '47': { O: 'extracted', __status: { O: 'condition' } } });
  w.renderTeeth(); try { w.renderOcclusal(); } catch (e) {}
  const doc = w.document;
  const occOp = (n) => { const c = doc.querySelector('#lowerOcc [data-occ-cell="' + n + '"]'); return c ? (c.style.opacity || '1') : null; };
  r.occCellNotDimmed = occOp(46) === '1' && occOp(45) === '1' && occOp(44) === '1';
  const shapeOp = (n) => { const c = doc.querySelector('[data-tooth-cell="' + n + '"] .tooth-shape'); return c ? (c.style.opacity || '') : null; };
  r.facialShapeNotDimmed = shapeOp(46) === '' && shapeOp(45) === '' && shapeOp(44) === '';
  r.badgeStillThere = !!doc.querySelector('[data-tooth-cell="46"] .tooth-status-badge.status-planned');
  /* ⑤ الدليلُ يحمل أشكالَ الحالة لا نقاطاً */
  w.renderLegend();
  const leg = doc.getElementById('chartLegend');
  r.legendShapes = !!leg.querySelector('pattern#lgplanned') && leg.querySelectorAll('rect[stroke-dasharray="2.2 2"]').length === 1 && leg.querySelectorAll('rect[stroke-dasharray="1.6 2.4"]').length === 1;
  r.helpers = w.txStatusOf({ MOD: K, __status: { MOD: 'planned' } }, 'O') === 'planned' && w.txStatusOf({ R1R2: 'rct_t', __status: { R1R2: 'referred' } }, 'R2') === 'referred' && w.txStatusOf({}, 'O') === 'completed'
    && w.txStatusOf({ O: K, __status: { O: 'existing_current' } }, 'O') === 'existing_current';
  /* v601: صفُّ السطح المفرد يفوز بحالته — صفٌّ قديمٌ بلا حالة = منجز، لا يرث حالةَ مركّبٍ يجاوره */
  r.singleRowWins = w.txStatusOf({ O: K, MOD: K, __status: { MOD: 'planned' } }, 'O') === 'completed' && w.txStatusOf({ O: K, MOD: K, __status: { O: 'referred', MOD: 'planned' } }, 'O') === 'referred';
  /* v601 (مراجعة v595): الزرعةُ والوهميُّ بلا سطوح — حالتُهما على تاجهما بالمنظرين، فلا يتطابق المخطّطُ مع المنجز */
  w.TREATMENTS.push({ treatment_key: 'implant', id: 'implant', name: 'زراعة', fill: '#bfdbfe', stroke: '#3b82f6', price: 0, target_part: 'implant', category: 'implant', is_active: true, currency: 'SYP', price_overrides: {} });
  w.TREATMENTS.push({ treatment_key: 'bridge', id: 'bridge', name: 'جسر', fill: '#ef4444', stroke: '#b91c1c', price: 0, target_part: 'bridge', category: 'prosth', is_active: true, currency: 'SYP', price_overrides: {} });
  set({ '36': { WHOLE: 'implant', __status: { WHOLE: 'planned' } }, '46': { WHOLE: 'implant', __status: { WHOLE: 'completed' } },
        '14': { WHOLE: 'bridge', __status: { WHOLE: 'planned' } }, '15': { WHOLE: 'extracted', PONTIC: 'bridge', __status: { WHOLE: 'completed', PONTIC: 'planned' } }, '16': { WHOLE: 'bridge', __status: { WHOLE: 'planned' } },
        '24': { WHOLE: 'bridge', __status: { WHOLE: 'completed' } }, '25': { WHOLE: 'extracted', PONTIC: 'bridge', __status: { WHOLE: 'completed', PONTIC: 'completed' } }, '26': { WHOLE: 'bridge', __status: { WHOLE: 'completed' } } });
  w.renderTeeth(); try { w.renderOcclusal(); } catch (e) {}
  const fc = (n) => doc.querySelector('[data-tooth-cell="' + n + '"] svg.tooth-shape'), oc = (n) => doc.querySelector('[data-occ-cell="' + n + '"] svg');
  const hatched = (el, pre) => !!el && Array.from(el.querySelectorAll('[fill^="url(#' + pre + '"]')).some(x => !!el.querySelector('pattern#' + x.getAttribute('fill').slice(5, -1)));
  r.implantPlannedBothViews = fc(36).classList.contains('implant-shape') && hatched(fc(36), 'pi') && !!fc(36).querySelector('g.implant-fixture-pending') && hatched(oc(36), 'pio');
  r.implantCompletedPlain = !fc(46).querySelector('pattern') && !fc(46).querySelector('g.implant-fixture-pending') && !oc(46).querySelector('pattern');
  r.ponticPlannedBothViews = fc(15).classList.contains('pontic-shape') && hatched(fc(15), 'pp') && hatched(oc(15), 'ppo');
  r.ponticCompletedPlain = fc(25).classList.contains('pontic-shape') && !fc(25).querySelector('pattern') && !oc(25).querySelector('pattern');
  r.ponticStatusHelper = w.txPonticStatus({ PONTIC: 'bridge', __status: { PONTIC: 'referred' } }) === 'referred' && w.txPonticStatus({ WHOLE: 'bridge', __status: { WHOLE: 'planned' } }) === 'planned'
    && w.txPonticStatus({ WHOLE: 'extracted', __status: { WHOLE: 'completed' } }) === 'completed';
  r.noJsErrors = (w.__ERRORS || []).length === 0;
  return r;
}

(async () => {
  const w = await boot(DENTAL, 'live');
  const res = measure(w);
  const keys = Object.keys(res), bad = keys.filter(k => !res[k]);
  keys.forEach(k => console.log((res[k] ? '  ✓ ' : '  ✗ ') + k));
  console.log(`prove-chart-status: ${keys.length - bad.length}/${keys.length}`);
  if (bad.length) process.exit(1);
  /* الطفرات: كلٌّ يجب أن تُحمرّ توكيداً واحداً على الأقل */
  const MUT = [
    ['planned-solid',      "if (st === 'planned')          return { defs:", "if (st === 'planned' && false) return { defs:"],
    ['existing-other-plain', "return { defs: '', fill: fill, fo: 0.38, stroke: stroke, sw: 1.2, dash: '2.2 2' };", "return { defs: '', fill: fill, fo: 0.38, stroke: null, sw: 0, dash: '' };"],
    ['referred-filled',    "return { defs: '', fill: fill, fo: 0.12, stroke: stroke, sw: 1.7, dash: '1.6 2.4' };", "return { defs: '', fill: fill, fo: SURFACE_FILL_OPACITY, stroke: null, sw: 0, dash: '' };"],
    ['composite-status-ignored', "if ((isCompositeSurfaceCode(k) || isCompositeRootCode(k)) && k.indexOf(key) !== -1) return st[k] || 'completed';", ""],
    ['single-row-inherits', "if (sm[key]) return st[key] || 'completed';", "if (st[key]) return st[key];"],
    ['implant-ignores-status', "var _iStat = (sm.__status && sm.__status[_iSf]) || 'completed';", "var _iStat = 'completed';"],
    ['implant-occ-ignores-status', "_ioSt=(sm.__status&&sm.__status.WHOLE)||'completed';", "_ioSt='completed';"],
    ['pontic-ignores-status', "var _pStat = txPonticStatus(teethMap[String(num)] || {});", "var _pStat = 'completed';"],
    ['pontic-occ-ignores-status', "var _pSt = txPonticStatus(rawP);", "var _pSt = 'completed';"],
    ['occ-dim-back',       "if(st==='condition') op=(condOnlyLibraryRows(num)?1:0.45);   /* v431 · v595", "if(st==='planned') op=0.55; else if(st==='condition') op=(condOnlyLibraryRows(num)?1:0.45);   /* v431 · v595"],
    ['facial-dim-back',    "if (status === 'condition') shape.style.opacity = '0.45';  // grey watch", "if (status === 'planned') shape.style.opacity = '0.55'; else if (status === 'condition') shape.style.opacity = '0.45';  // grey watch"],
    ['ring-no-dash',       "function txRingDash(st){ return st === 'planned' ? ' stroke-dasharray=\"5 3\"'", "function txRingDash(st){ return st === 'planned' ? ''"],
    ['canal-ignores-status', "var _cpa = txPathAttrs(txStatusOf(sm, r.key), canalColor,", "var _cpa = txPathAttrs('completed', canalColor,"],
    ['crown-ignores-status', "var _cfa = txPathAttrs(txStatusOf(sm, isBridgeAbutment ? 'WHOLE' : (sm.CROWN_FULL ? 'CROWN_FULL' : 'WHOLE')), crownFullColor,", "var _cfa = txPathAttrs('completed', crownFullColor,"]
  ];
  let bites = 0;
  for (const [name, a, b] of MUT) {
    if (DENTAL.indexOf(a) < 0) { console.error('✗ طفرة ' + name + ': المرساةُ غائبة'); process.exit(1); }
    const mw = await boot(DENTAL.replace(a, b), 'mut-' + name);
    const mr = measure(mw), fails = Object.keys(mr).filter(k => !mr[k]);
    if (fails.length) { bites++; console.log('  🦷 ' + name + ' → ' + fails.join(', ')); }
    else console.error('  ✗ طفرة ' + name + ' مرّت بلا أثر');
  }
  console.log(`prove-chart-status mutants: ${bites}/${MUT.length}`);
  process.exit(bites === MUT.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* v576 — مثبتُ رسم الحالات السريرية الثلاث (طلب المالك بصورة، 5 تشرين الأول 2026):
   (1) التماسُ المفتوح خطٌّ على حافّة السطح المنقور **وخطٌّ على حافّة الجار المقابلة**
       (المعيار: إنسيُّ سنٍّ + وحشيُّ جاره) — وجهياً وإطباقياً، وعبر الخطِّ الناصف والتسنين المختلط.
   (2) الكسرُ على سطح تاجٍ يُرسم بالمنظر الإطباقي بمكان سطحه (كسرُ الجذر لا — غيرُ مرئي)،
       وبقيةُ الحالات تحفظ قرارَ v437 (لا رموزَ إطباقية).
   (3) سهمُ الانطمار يشير نحو الذروة بالفكين (سفلي ↘ · علوي ↗ بقلب المجموعة، بلا قلبٍ مضاد).
   يحمّل عُدّةَ dom-smoke الحقيقية (pp-*.js الحيّة) بـjsdom ويقيس البنيةَ بمحلّلٍ (#667)،
   ثم يُثبت أن أربعَ طفراتٍ متعمَّدة تُحمرّه (#342). بلا jsdom ⇒ يتخطّى بـ0 (نمطُ acorn). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت رسم الحالات (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const DENTAL = fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8');

function boot(dentalSrc, label) {
  const tmp = path.join(__dirname, 'dom-smoke', '.out', 'pp-dental.' + label + '.js');
  fs.writeFileSync(tmp, dentalSrc);
  /* localStorage يحتاج أصلاً http بـjsdom ⇒ تُدمج السكربتات نصّاً بدل file:// */
  const html = HARNESS.split('file://' + ROOT + '/pp-dental.js').join('file://' + tmp)
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

function measure(w) {
  const P = (h) => new w.DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
  const set = (m) => { w.teethMap = m; const t = w.rebuildToothMaps(); w.T_FILL = t.fill; w.T_STROKE = t.stroke; };
  const F = (n, up) => P(w.buildTooth(n, w.chartFilterSM(w.teethMap[String(n)] || {}), up));
  const O = (n, up) => P(w.buildOcclusalTooth(n, w.chartFilterSM(w.teethMap[String(n)] || {}), up));
  const lines = (d) => Array.from(d.querySelectorAll('.cond-contact')).map(l => parseFloat(l.getAttribute('x1')));
  const syms = (d) => d.querySelectorAll('.cond-sym').length;
  const r = {};
  /* ① التماسُ المفتوح — 16.M (الربع 1: الإنسيُّ يميناً) */
  set({ '16': { M: 'cond-open-contact', __status: { M: 'condition' } }, '15': {}, '17': {} });
  let f16 = F(16, true), f15 = F(15, true), f17 = F(17, true), o16 = O(16, true), o15 = O(15, true), o17 = O(17, true);
  r.ownOneLineMesial = lines(f16).length === 1 && lines(f16)[0] > 50;
  r.neighborOneLineDistal = lines(f15).length === 1 && lines(f15)[0] < 50;
  r.untouched17 = lines(f17).length === 0 && lines(o17).length === 0;
  r.noTwoLineSymbol = syms(f16) === 0 && syms(f15) === 0;
  r.occOwnRight = lines(o16).length === 1 && lines(o16)[0] > 50;
  r.occNeighborLeft = lines(o15).length === 1 && lines(o15)[0] < 50;
  r.clipped = !!f16.querySelector('.cond-contact[clip-path="url(#ccg16)"]') && !!o16.querySelector('.cond-contact[clip-path="url(#clo16)"]');
  /* الخطُّ الناصف: 11.M ⇒ 21 يرسم على إنسيّه (يساراً بالربع 2) */
  set({ '11': { M: 'cond-open-contact', __status: { M: 'condition' } }, '21': {} });
  r.midline = lines(F(21, true)).length === 1 && lines(F(21, true))[0] < 50 && lines(F(11, true)).length === 1 && lines(F(11, true))[0] > 50;
  /* التسنينُ المختلط: 55.D ⇒ 16 يرسم على إنسيّه · 16.M ⇒ 55 يرسم على وحشيّه */
  set({ '55': { D: 'cond-open-contact', __status: { D: 'condition' } }, '16': {} });
  r.mixedPrimToPerm = lines(F(16, true)).length === 1 && lines(F(16, true))[0] > 50;
  set({ '16': { M: 'cond-open-contact', __status: { M: 'condition' } }, '55': {} });
  r.mixedPermToPrim = lines(F(55, true)).length === 1 && lines(F(55, true))[0] < 50;
  /* الفكُّ السفلي (الربع 4: الإنسيُّ يميناً كذلك) */
  set({ '46': { D: 'cond-open-contact', __status: { D: 'condition' } }, '47': {} });
  r.lowerDistal = lines(F(46, false)).length === 1 && lines(F(46, false))[0] < 50 && lines(F(47, false)).length === 1 && lines(F(47, false))[0] > 50;
  /* ② الكسرُ إطباقياً */
  set({ '16': { D: 'cond-fracture', __status: { D: 'condition' } }, '26': { R1: 'cond-fracture', __status: { R1: 'condition' } },
        '21': { B: 'cond-calculus', __status: { B: 'condition' } }, '27': { B: 'cond-calculus', __status: { B: 'condition' } }, '13': { COND: 'cond-fracture', __status: { COND: 'condition' } } });
  const o16f = O(16, true), fp = o16f.querySelector('.cond-sym path');
  const fx = fp ? parseFloat(/M ([0-9.]+)/.exec(fp.getAttribute('d'))[1]) : null;
  r.occFractureOnDistalStrip = syms(o16f) === 1 && fx !== null && fx < 30;          /* الوحشيُّ يساراً بالربع 1، الشريطُ ≤ ~30 */
  r.occFractureNoFlip = !!o16f.querySelector('.cond-sym') && !o16f.querySelector('.cond-sym').getAttribute('transform');
  r.facialFractureKept = syms(F(16, true)) === 1;
  r.rootFractureNotOcc = syms(O(26, true)) === 0 && syms(F(26, true)) === 1;
  r.occFractureWholeTooth = syms(O(13, true)) === 1;
  r.surfaceCondOcc = syms(O(27, true)) === 1 && syms(O(21, true)) === 0 && syms(F(27, true)) === 1;   /* v594: خريطةُ السطوح — دهليزيُّ الخلفي على حزام B من الأعلى (كالحشوة) · الأماميُّ بلا حزام B */
  /* v578: تسوس (صلب) · تآكل (نقاط) · انزياح (سهم نحو الجهة) · جذرٌ متبقٍّ بلا رمز */
  set({ '16': { O: 'cond-caries', M: 'cond-wear', __status: { O: 'condition', M: 'condition' } }, '15': { D: 'cond-drift', __status: { D: 'condition' } },
        '13': { COND: 'cond-retained', __status: { COND: 'condition' } }, '43': { B: 'cond-drift', __status: { B: 'condition' } }, '45': { L: 'cond-drift', __status: { L: 'condition' } } });
  const f16c = F(16, true), o16c = O(16, true);
  r.cariesSolidBothViews = !!f16c.querySelector('.cond-fill rect[clip-path="url(#ccg16)"]') && !!o16c.querySelector('.cond-fill rect[clip-path="url(#clo16)"]');
  r.wearDottedBothViews = f16c.querySelectorAll('.cond-fill circle').length >= 4 && o16c.querySelectorAll('.cond-fill circle').length >= 4;
  const dArrow = (d) => { const p = d.querySelector('.cond-drift path'); if (!p) return null; const m = /M ([0-9.\-]+) ([0-9.\-]+) L ([0-9.\-]+) ([0-9.\-]+)/.exec(p.getAttribute('d')); return { dx: +m[3] - +m[1], dy: +m[4] - +m[2] }; };
  const a15f = dArrow(F(15, true)), a15o = dArrow(O(15, true));
  r.driftDistalPointsDistal = !!a15f && a15f.dx < -5 && Math.abs(a15f.dy) < 0.01 && !!a15o && a15o.dx < -5;   /* الربع 1: الوحشيُّ يساراً */
  r.driftLingualOcclusalOnly = dArrow(F(45, false)) === null && !!dArrow(O(45, false)) && dArrow(O(45, false)).dy < -5;   /* السفلي: اللسانيُّ أعلى الإطباقي */
  r.driftLabialAnterior = !!dArrow(O(43, false)) && dArrow(O(43, false)).dy > 5;
  r.retainedNoTriangle = syms(F(13, true)) === 0 && !!F(13, true).querySelector('.root-part') && !F(13, true).querySelector('[fill^="url(#cg"]');
  r.libraryFourteen = w.COND_LIBRARY.length === 14;
  /* v581 (بلاغُ المالك بأربع صور): مركّبُ MOD يُرسم بكل حرف · الدهليزيُّ بالأمامي لا يُرى إطباقياً · حزامُ الحنكي الأمامي
     لا يمتدّ على الإنسي/الوحشي · سهمُ الانزياح الوجهي عند الجذر · إزالةُ التماس تزيل صفَّ الجار المقابل */
  set({ '38': { MOD: 'cond-caries', __status: { MOD: 'condition' } }, '11': { B: 'cond-wear', __status: { B: 'condition' } },
        '13': { L: 'cond-caries', __status: { L: 'condition' } }, '14': { M: 'cond-drift', __status: { M: 'condition' } }, '36': { BL: 'cond-fracture', __status: { BL: 'condition' } } });
  const o38 = O(38, false), f38 = F(38, false);
  r.compositeCariesBothViews = o38.querySelectorAll('.cond-fill rect').length === 3 && f38.querySelectorAll('.cond-fill rect').length === 3;
  /* v587: الإنسيُّ/الوحشيُّ إطباقياً صندوقٌ عند الحافّة الحفافية بالثلث الأوسط (لا شريطٌ بطول السن ⇒ لا حرفَ H)، ووجهياً منطقةُ التماس */
  const _hitM = o38.querySelector('.crown-surface[data-surface="M"]'), _rs = Array.from(o38.querySelectorAll('.cond-fill rect')).map(e => ({ y: +e.getAttribute('y'), h: +e.getAttribute('height'), rx: e.getAttribute('rx') }));
  const _prox = _rs.filter(q => q.rx), _hH = _hitM ? +_hitM.getAttribute('height') : 0;
  r.proximalBoxOcc = _prox.length === 2 && _hH > 0 && _prox.every(q => q.h < _hH * 0.62);
  const _fM = F(38, false).querySelector('.crown-surface[data-surface="M"]'), _fp = Array.from(f38.querySelectorAll('.cond-fill rect')).filter(e => e.getAttribute('rx'));
  r.proximalContactFacial = !!_fM && _fp.length === 2 && _fp.every(e => +e.getAttribute('height') <= +_fM.getAttribute('height') * 0.61);
  r.anteriorBuccalNotOcc = O(11, true).querySelectorAll('.cond-fill circle').length === 0 && F(11, true).querySelectorAll('.cond-fill circle').length >= 4;
  const o13 = O(13, true), l13 = o13.querySelector('.cond-fill rect'), h13 = o13.querySelector('.crown-surface[data-surface="L"]');
  const _n = (el, a) => parseFloat(el.getAttribute(a));
  r.anteriorPalatalInset = !!l13 && !!h13 && _n(l13, 'x') >= _n(h13, 'x') + 5 && _n(l13, 'x') + _n(l13, 'width') <= _n(h13, 'x') + _n(h13, 'width') - 5
    && o13.querySelectorAll('.cond-fill rect').length === 1;   /* التعبئةُ أضيق من مستطيل النقر بعرض الشريطين */
  const d14 = F(14, true).querySelector('.cond-drift path'), y14 = d14 ? +/M [0-9.\-]+ ([0-9.\-]+)/.exec(d14.getAttribute('d'))[1] : null;
  r.driftArrowAtRoot = y14 !== null && y14 > 120;   /* التاجُ ≤ ~110 بالإحداثيات المحلية؛ الجذورُ أسفلَه */
  r.compositeSymbolCentred = O(36, false).querySelectorAll('.cond-sym').length === 1 && F(36, false).querySelectorAll('.cond-sym').length === 1;
  r.condRectsFor = w.condRectsFor([{key:'M'},{key:'O'},{key:'D'}], 'MOD').length === 3 && w.condRectsFor([{key:'M'},{key:'O'}], 'B').length === 0 && w.condRectsFor([{key:'COND'}], 'COND').length === 1;
  /* v580: السنُّ الزائد — مرساةٌ على الجار (SX<الجهة>)، خليةٌ صغيرة بين السنّين بالمنظرين، قلعٌ مخطّط ✕، منجز ⇒ لا خلية */
  const sxd = w.getCondition('cond-supernumerary');
  r.sxStorage = w.condStorageSurface(sxd, 'M') === 'SXM' && w.condStorageSurface(sxd, 'D') === 'SXD' && w.condStorageSurface(sxd, 'O') === 'O'
    && w.condStorageSurface(w.getCondition('cond-calculus'), 'M') === 'M'
    && w.condSurfaceNotAllowed(sxd, 'SXM') === null && w.condSurfaceNotAllowed(sxd, 'SXD') === null && !!w.condSurfaceNotAllowed(sxd, 'O') && !!w.condSurfaceNotAllowed(sxd, 'COND');
  r.sxLabels = w.surfLabelFor('SXM', 12) === 'سن زائد إنسي' && w.surfLabelFor('SXD', 12) === 'سن زائد وحشي' && w.conditionSiteLabel(12, 'SXM') === 'سن زائد إنسي';
  set({ '12': { SXM: 'cond-supernumerary', __status: { SXM: 'condition' } }, '23': { SXD: 'cond-supernumerary', __status: { SXD: 'condition' } },
        '46': { SXD: 'extracted', __status: { SXD: 'planned' } }, '47': { SXM: 'extracted', __status: { SXM: 'completed' } } });
  w.renderTeeth(); try { w.renderOcclusal(); } catch (e) {}
  const doc = w.document, upJ = doc.getElementById("upperJaw"), loJ = doc.getElementById("lowerJaw");
  const kids = (el) => Array.from(el.children).map(c => c.getAttribute('data-tooth-cell') || c.getAttribute('data-sx-cell') || (c.classList.contains('midline') ? '|' : '?'));
  const ku = kids(upJ), kl = kids(loJ);
  r.sxCellRightOfTwelve = ku.indexOf('12:M') === ku.indexOf('12') - 1;        /* الربع 1: الإنسيُّ يميناً = السابقُ بالـDOM (RTL) */
  r.sxCellRightOfTwentyThree = ku.indexOf('23:D') === ku.indexOf('23') - 1;  /* الربع 2: الوحشيُّ يميناً = السابقُ بالـDOM */
  r.sxCellsCount = upJ.querySelectorAll('.sx-cell').length === 2 && loJ.querySelectorAll('.sx-cell').length === 1;
  r.sxPlannedX = !!loJ.querySelector('[data-sx-cell="46:D"] .planned-x') && kl.indexOf('46:D') === kl.indexOf('46') + 1;   /* الربع 4: الوحشيُّ يساراً = التالي بالـDOM */
  r.sxExtractedGone = !loJ.querySelector('[data-sx-cell="47:M"]');
  r.sxHitWired = !!upJ.querySelector('[data-sx-cell="12:M"] .crown-surface[data-tooth="12"][data-surface="SXM"]');
  r.sxOccCells = !!doc.querySelector('#upperOcc [data-sx-occ="12:M"]') && !!doc.querySelector('#lowerOcc [data-sx-occ="46:D"] .planned-x') && !doc.querySelector('#lowerOcc [data-sx-occ="47:M"]');
  r.sxNoSymbolOnHost = F(12, true).querySelectorAll('.cond-sym').length === 0 && O(12, true).querySelectorAll('.cond-sym').length === 0;
  r.sxState = !!w.sxState({ SXM: 'cond-supernumerary' }, 'M') && w.sxState({ SXM: 'extracted', __status: { SXM: 'completed' } }, 'M') === null
    && w.sxState({ SXM: 'extracted', __status: { SXM: 'planned' } }, 'M').planned === true && w.sxState({}, 'M') === null;
  r.occBeforeHits = (function(){ const h = w.buildOcclusalTooth(16, { D: 'cond-fracture', __status: { D: 'condition' } }, true); return h.indexOf('cond-sym') > 0 && h.indexOf('cond-sym') < h.indexOf('class="crown-surface"'); })();
  /* ③ سهمُ الانطمار */
  set({ '35': { COND: 'cond-impacted', __status: { COND: 'condition' } }, '15': { COND: 'cond-impacted', __status: { COND: 'condition' } },
        '13': { COND: 'cond-abscess', __status: { COND: 'condition' } } });
  const arrow = (d) => { const p = d.querySelector('.cond-sym path'); const m = /M ([0-9.\-]+) ([0-9.\-]+) L ([0-9.\-]+) ([0-9.\-]+)/.exec(p.getAttribute('d')); return { y1: +m[2], y2: +m[4], flip: /scale\(1,-1\)/.test(d.querySelector('.cond-sym').getAttribute('transform') || '') }; };
  const lo = arrow(F(35, false)), up = arrow(F(15, true));
  r.impLowerApical = lo.y2 > lo.y1 && !lo.flip;                                   /* +y محلي = نحو الجذر بالسفلي (الشاشة ↓) */
  r.impUpperApical = up.y2 > up.y1 && !up.flip && /scale\(1,-1\)/.test(F(15, true).querySelector('svg > g').getAttribute('transform'));   /* قلبُ المجموعة وحده ⇒ الشاشة ↑ */
  r.othersStillCounterFlipped = /scale\(1,-1\)/.test(F(13, true).querySelector('.cond-sym').getAttribute('transform') || '');
  r.noJsErrors = (w.__ERRORS || []).length === 0;
  return r;
}

(async () => {
  const w = await boot(DENTAL, 'live');
  const res = measure(w);
  const keys = Object.keys(res), bad = keys.filter(k => !res[k]);
  keys.forEach(k => console.log((res[k] ? '  ✓ ' : '  ✗ ') + k));
  console.log(`prove-chart-conditions: ${keys.length - bad.length}/${keys.length}`);
  if (bad.length) { console.error('✗ فشل: ' + bad.join(', ')); process.exit(1); }
  /* طفراتٌ تعضّ (#342): كلٌّ منها يجب أن تُسقط توكيداً واحداً على الأقل */
  const MUT = [
    ['no-neighbor',  "add(twin, pos - 1, 'D'); }", "}"],
    ['flip-arrow',   "var noFlip = (k === 'impacted');", "var noFlip = false;"],
    ['occ-off',      "symbol:'fracture', occ:true }", "symbol:'fracture' }"],
    ['gap-symbol',   "if (_cd2.symbol === 'gap') continue;", ""],
    ['drift-wrong-way', "cy + uy*size*0.45, def.stroke, size);", "cy + uy*size*0.45, def.stroke, size).replace(/M ([0-9.\\-]+) ([0-9.\\-]+) L ([0-9.\\-]+) ([0-9.\\-]+)/, 'M $3 $4 L $1 $2');"],
    ['triangle-back', "symbol:null, draw:'no-crown'", "symbol:'ring', draw:'no-crown'"],
    ['sx-side-swap', "var rightSide = mesialOnRight ? 'M' : 'D', leftSide = mesialOnRight ? 'D' : 'M';", "var rightSide = mesialOnRight ? 'D' : 'M', leftSide = mesialOnRight ? 'M' : 'D';"],
    ['sx-extracted-still-drawn', "return (typeof extractionStatusIsOpen === 'function' && extractionStatusIsOpen(st)) ? { present: true, planned: true, key: k, status: st } : null;", "return { present: true, planned: extractionStatusIsOpen(st), key: k, status: st };"],
    ['sx-store-on-M', "if (def && def.cond_store === 'sx' && /^[MD]$/.test(String(surf || ''))) return 'SX' + surf;", ""],
    ['composite-single-only', "for (i = 0; i < k.length; i++) for (j = 0; j < rects.length; j++) if (rects[j] && rects[j].key === k.charAt(i)) out.push(rects[j]);", "for (j = 0; j < rects.length; j++) if (rects[j] && rects[j].key === k) out.push(rects[j]);"],
    ['anterior-palatal-full-width', "I:[antX+cap,iEdgeY,antW-2*cap,iHv], L:[antX+cap,lFillY,antW-2*cap,lHv]", "I:[antX,iEdgeY,antW,iHv], L:[antX,lFillY,antW,lHv]"],
    ['proximal-full-strip-occ', "var _bh=(b.y1-b.y0), _cy=ant?(b.y0+_bh/2):(oY+third/2), _hh=ant?_bh*0.5:third*1.35;", "var _bh=(b.y1-b.y0), _cy=b.y0+_bh/2, _hh=_bh;"],
    ['proximal-full-strip-facial', "_q2.w + 1.5, _q2.h * 0.6, 'cc' + gid, 2.5);", "_q2.w + 1.5, _q2.h, 'cc' + gid, 2.5);"],
    ['buccal-occ-off', "var _oRectsCond=_oRects;", "var _oRectsCond=_oRects.filter(function(r){ return r.key!=='B'; });"]
  ];
  let bites = 0;
  for (const [name, a, b] of MUT) {
    if (DENTAL.indexOf(a) < 0) { console.error('✗ طفرة ' + name + ': المرساةُ غائبة'); process.exit(1); }
    const mw = await boot(DENTAL.replace(a, b), 'mut-' + name);
    const mr = measure(mw), fails = Object.keys(mr).filter(k => !mr[k]);
    if (fails.length) { bites++; console.log('  🦷 ' + name + ' → ' + fails.join(', ')); }
    else console.error('  ✗ طفرة ' + name + ' مرّت بلا أثر');
  }
  console.log(`prove-chart-conditions mutants: ${bites}/${MUT.length}`);
  process.exit(bites === MUT.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

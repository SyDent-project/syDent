#!/usr/bin/env node
/* v605 (M179) — مثبتُ «التشخيصُ يبقى تحت العلاج» (قرار المالك «ابدا» 11 تشرين الأول 2026، بعد مراجعة Dentrix Ascend · Open Dental):
   حشوةٌ مخطّطة على «تسوس» لا تمحوه — يُرسم رمزُه فوق التهشير، والتلميحُ «التشخيص: …» ثم «عولج: …» بعد الإنجاز،
   والجلسةُ تحمل «سبب العلاج»، والمركّبُ (MOD · R1R2R3) يحمل حالاتِ حروفه، وإزالةُ العلاج تعيد التشخيص لا «سليم».
   يقود مساراتِ الحفظ والإزالة والفحص الأولي **الحقيقية** على عُدّة dom-smoke بـjsdom ويقرأ الكتابات من مكعّب Supabase،
   ثم يُثبت أن طفراتٍ متعمَّدة تُحمرّه (#342). زنادُ القاعدة نفسه أُثبت حيّاً على Supabase داخل معاملةٍ تتراجع (6 سيناريوهات). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let jsdomOk = true; try { require.resolve('jsdom'); } catch (e) { jsdomOk = false; }
if (!jsdomOk) { console.warn('⚠️  jsdom غائبة — تخطّي مثبت التشخيص (npm install jsdom --no-save)'); process.exit(0); }
const { JSDOM, VirtualConsole } = require('jsdom');
cp.execFileSync('node', [path.join(__dirname, 'dom-smoke', 'build-harness.js')], { stdio: 'ignore' });
const HARNESS = fs.readFileSync(path.join(__dirname, 'dom-smoke', '.out', 'harness.html'), 'utf8');
const SRC = { 'pp-dental.js': fs.readFileSync(path.join(ROOT, 'pp-dental.js'), 'utf8'), 'pp-modules.js': fs.readFileSync(path.join(ROOT, 'pp-modules.js'), 'utf8') };
const PPH = fs.readFileSync(path.join(ROOT, 'patient-profile.html'), 'utf8');
const MIG = fs.readFileSync(path.join(ROOT, 'migrations', '179_teeth_status_dx.sql'), 'utf8');

function boot(src, label) {
  let html = HARNESS;
  for (const f of Object.keys(src)) {
    const tmp = path.join(__dirname, 'dom-smoke', '.out', f.replace('.js', '') + '.dx-' + label + '.js');
    fs.writeFileSync(tmp, src[f]);
    html = html.split('file://' + ROOT + '/' + f).join('file://' + tmp);
  }
  html = html.replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<script src="file:\/\/([^"]+)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/' });
  return new Promise(res => dom.window.addEventListener('load', () => setTimeout(() => res(dom.window), 50)));
}

async function measure(w, pph) {
  const r = {};
  const K = 'custom_1781292854422', KN = 'حشوة كومبوزت';
  const CARIES = w.getCondition('cond-caries'), WEAR = w.getCondition('cond-wear');
  w.confirm = () => true; w.SyDialog = w.SyDialog || {}; w.SyDialog.confirm = async () => true; w.SyDialog.alert = async () => {};
  ['reallocatePatientFunds','renderPayments','renderRecentSessions','renderTimeline','renderSessions','maybePromptMaterialDeduction','updatePatientLastVisit','refreshPlanSummary','delSession'].forEach(f => { if (typeof w[f] !== 'function') w[f] = async () => {}; });   /* مرآةُ dom-smoke/run.py */
  if (typeof w._rowCur !== 'function') w._rowCur = (r) => (r && r.currency === 'USD') ? 'USD' : 'SYP';   /* مُعرَّفةٌ بـpatient-profile.html (خارج العُدّة) — نسخةٌ حرفية */
  const T = w.rebuildToothMaps(); w.T_FILL = T.fill; w.T_STROKE = T.stroke; w.T_LABEL = T.label;
  const P = (h) => new w.DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
  /* تعبئةُ الحالة: صلبة (fill = لونها) أو منقّطة (نمطٌ بلونها) — يُعدّ كلُّ مجموعة .cond-fill تحمل لونَ الحالة */
  const fills = (h, def) => Array.from(P(h).querySelectorAll('.cond-fill')).filter(g => { const o = g.outerHTML; return o.indexOf(def.fill) !== -1 || o.indexOf(def.stroke) !== -1; }).length;
  const TS = () => w.__WRITES.filter(x => x.table === 'teeth_status');
  const reset = (map, dx) => { w.sessions = []; w.teethMap = map; w.teethDx = dx || {}; w.window.teethDx = w.teethDx; w.__WRITES.length = 0; w.__TOASTS.length = 0; };

  /* ① حشوةٌ مخطّطة على «تسوس» بالمودال الحقيقي — الصفُّ المفرد يتركه للزناد (لا dx_key مُرسَل)، والذاكرةُ تعكسه، والجلسةُ تحمل السبب */
  reset({ '36': { O: 'cond-caries', __status: { O: 'condition' } } });
  await w.openToothModal(36, 'O'); w.pickToothTreatment(K, KN); w.pickStatus('planned'); await w.saveToothTreatment();
  const u1 = TS().filter(x => x.op === 'upsert' && x.payload.surface === 'O');
  const l1 = w.__WRITES.find(x => x.table === 'ledger_sessions' && x.op === 'insert');
  r.singleLeavesToTrigger = u1.length === 1 && u1[0].payload.treatment_key === K && !('dx_key' in u1[0].payload);
  r.mirrorSingle = (w.teethDx['36'] || {}).O === 'O:cond-caries' && w.teethMap['36'].O === K && w.teethMap['36'].__status.O === 'planned';
  r.sessionNote = !!l1 && /سبب العلاج: تسوس/.test(l1.payload.notes || '');
  const sm36 = w.chartFilterSM(w.teethMap['36']);
  r.symbolOverPlannedBothViews = fills(w.buildTooth(36, sm36, false), CARIES) >= 1 && fills(w.buildOcclusalTooth(36, sm36, false), CARIES) >= 1;
  r.tipPending = /التشخيص: تسوس/.test(w.buildTooth(36, sm36, false)) && /التشخيص: تسوس/.test(w.occTipRows(36, sm36));
  /* ② منجز ⇒ الرمزُ يختفي و«عولج: …» */
  w.teethMap['36'].__status.O = 'completed';
  const sm36c = w.chartFilterSM(w.teethMap['36']);
  r.completedHidesSymbol = fills(w.buildTooth(36, sm36c, false), CARIES) === 0 && fills(w.buildOcclusalTooth(36, sm36c, false), CARIES) === 0;
  r.tipTreated = /عولج: تسوس/.test(w.buildTooth(36, sm36c, false)) && /عولج: تسوس/.test(w.occTipRows(36, sm36c));
  r.conditionRowNoDxText = !/عولج|التشخيص/.test(w.occTipRows(36, w.chartFilterSM({ O: 'cond-caries', __status: { O: 'condition' } })))
    && !/عولج|التشخيص/.test(w.buildTooth(36, w.chartFilterSM({ O: 'cond-caries', __status: { O: 'condition' } }), false));   /* مرآةٌ قديمة على صفّ حالة */
  w.__historyMode = true; r.historySuppressed = !/عولج|التشخيص/.test(w.buildTooth(36, sm36, false)) && fills(w.buildTooth(36, sm36, false), CARIES) === 0; w.__historyMode = false;
  /* ③ المركّب MOD فوق «تآكل» إنسي و«تسوس» إطباقي ⇒ dx_key بحالتي الحرفين، ويُرسمان فوق التهشير */
  reset({ '37': { M: 'cond-wear', O: 'cond-caries', __status: { M: 'condition', O: 'condition' } } });
  await w.openToothModal(37, 'O'); w.currentSurfaces = ['M', 'O', 'D']; w.currentSurface = 'MOD';
  w.pickToothTreatment(K, KN); w.pickStatus('planned'); await w.saveToothTreatment();
  const u3 = TS().filter(x => x.op === 'upsert' && x.payload.surface === 'MOD')[0];
  const dx3 = u3 && u3.payload.dx_key ? u3.payload.dx_key.split(',').sort().join(',') : '';
  r.compositeCarries = dx3 === 'M:cond-wear,O:cond-caries' && TS().filter(x => x.op === 'delete').length === 2 && !w.teethMap['37'].M && !w.teethMap['37'].O;
  const sm37 = w.chartFilterSM(w.teethMap['37']);
  r.compositeSymbols = fills(w.buildOcclusalTooth(37, sm37, false), CARIES) >= 1 && fills(w.buildOcclusalTooth(37, sm37, false), WEAR) >= 1
    && /التشخيص: (تآكل[^·<]* — إنسي · تسوس[^·<]* — إطباقي|تسوس[^·<]* — إطباقي · تآكل[^·<]* — إنسي)/.test(w.occTipRows(37, sm37));
  /* ④ «إزالة» العلاج المخطّط عن سطحه ⇒ حذفُ صفّه ثم عودةُ الحالة على سطحها (لا «سليم») */
  reset({ '36': { O: K, __status: { O: 'planned' } } }, { '36': { O: 'O:cond-caries' } });
  await w.openToothModal(36, 'O'); await w.clearToothStatus();
  const ops4 = TS().map(x => x.op + (x.payload ? ':' + x.payload.surface + '/' + x.payload.treatment_key + '/' + x.payload.status : ''));   /* المكعّبُ يلتقط الحذفَ قبل .eq */
  r.removeRestores = ops4.join('|') === 'delete|upsert:O/cond-caries/condition' && w.teethMap['36'].O === 'cond-caries' && w.teethMap['36'].__status.O === 'condition' && !w.teethDx['36']
    && w.__TOASTS.some(t => /عاد إلى التشخيص \(تسوس/.test(t));
  /* مركّبٌ يُزال ⇒ كلُّ حالةٍ على سطحها الأصلي */
  reset({ '37': { MOD: K, __status: { MOD: 'planned' } } }, { '37': { MOD: 'M:cond-wear,O:cond-caries' } });
  await w.openToothModal(37, 'MOD'); await w.clearToothStatus();
  r.removeCompositeRestores = w.teethMap['37'] && w.teethMap['37'].M === 'cond-wear' && w.teethMap['37'].O === 'cond-caries' && !w.teethMap['37'].MOD;
  /* «سليم» على سطحٍ فارغ (تنظيفُ السن كله) ⇒ لا استعادة */
  reset({ '36': { O: K, B: 'cond-calculus', __status: { O: 'planned', B: 'condition' } } }, { '36': { O: 'O:cond-caries' } });
  await w.openToothModal(36, 'L'); await w.clearToothStatus();
  r.fullClearNoRestore = !w.teethMap['36'] && TS().every(x => x.op === 'delete') && !w.teethDx['36'];
  /* ⑤ الفحصُ الأولي: إلغاءُ ختم العلاج (نقرةٌ ثانية) يعيد الحالة؛ وختمُه فوقها يحفظها */
  reset({ '46': { O: 'cond-caries', __status: { O: 'condition' } } });
  w.__examMode = true; w.examSelectedKey = K; w.examStatus = 'planned';
  await w.examStamp(46, 'O');
  r.examStampMirrors = (w.teethDx['46'] || {}).O === 'O:cond-caries' && w.teethMap['46'].O === K;
  await w.examStamp(46, 'O'); w.__examMode = false;
  r.examToggleRestores = w.teethMap['46'] && w.teethMap['46'].O === 'cond-caries' && w.teethMap['46'].__status.O === 'condition' && !w.teethDx['46'];
  /* ⑥ مرآةُ الزناد (وحدة) */
  const m = (row, pk, ps) => { w.teethDx = {}; w.window.teethDx = w.teethDx; w.dxSet(9, row.surface, 'O:cond-wear'); w.dxMirrorAfterWrite(row, pk, ps); return (w.teethDx['9'] || {})[row.surface] || null; };
  r.mirrorRules = m({ tooth_num: '9', surface: 'O', treatment_key: K, status: 'planned' }, null, null) === null
    && m({ tooth_num: '9', surface: 'O', treatment_key: 'cond-caries', status: 'condition' }, K, 'planned') === null
    && m({ tooth_num: '9', surface: 'O', treatment_key: K, status: 'completed' }, K, 'planned') === 'O:cond-wear'
    && m({ tooth_num: '9', surface: 'O', treatment_key: K, status: 'planned' }, 'cond-caries', 'condition') === 'O:cond-caries'
    && m({ tooth_num: '9', surface: 'O', treatment_key: 'crown', status: 'planned' }, K, 'condition') === 'O:cond-wear';   /* مراقبةٌ على مفتاح علاج ⇒ لا تُحمل */
  r.pairsSafe = w.dxPairs('O:cond-caries,X:<b>,M:cond-wear').length === 2 && w.dxJoin([{ sf: 'O', key: 'cond-caries' }, { sf: 'O', key: 'cond-caries' }]) === 'O:cond-caries';
  /* ⑦ مسارُ حذف الجلسة (patient-profile.html): صفُّ الحالة لا يُمحى، والعلاجُ الحامل للتشخيص يعيده — ثابتٌ بالمصدر */
  r.delSessionGuard = /v605: صفُّ حالةٍ سريرية لا يمثّل جلسةً قط/.test(pph) && /dxRestoreAfterRemoval\(sess\.tooth_num, sessSurface, _dxP\)/.test(pph)
    && /teethDx\[n\]\[s\] = t\.dx_key/.test(pph);
  r.migration = /CREATE TRIGGER trg_teeth_status_dx BEFORE INSERT OR UPDATE ON public\.teeth_status/.test(MIG) && /OLD\.treatment_key LIKE 'cond-%'/.test(MIG)
    && /teeth_status_dx_key_check/.test(MIG) && /NEW\.dx_key, *\n? *CASE WHEN TG_OP/.test(MIG);
  r.noJsErrors = (w.__ERRORS || []).length === 0;
  return r;
}

(async () => {
  const w = await boot(SRC, 'live');
  const res = await measure(w, PPH);
  const keys = Object.keys(res), bad = keys.filter(k => !res[k]);
  keys.forEach(k => console.log((res[k] ? '  ✓ ' : '  ✗ ') + k));
  console.log(`prove-chart-dx: ${keys.length - bad.length}/${keys.length}`);
  if (bad.length) process.exit(1);
  const MUT = [
    ['pp-dental.js', 'no-mirror', "if (res && !res.error) { try { dxMirrorAfterWrite(row, _pk, _ps); }", "if (false) { try { dxMirrorAfterWrite(row, _pk, _ps); }"],
    ['pp-dental.js', 'no-composite-carry', "if (!isConditionKey(pendingToothStatus)) _dxCarry = _dxCarry.concat(dxCollectSubsumed(currentTooth, _toDel));", ""],
    ['pp-dental.js', 'pending-not-drawn', "if ((pend || p.pending) && !v[p.sf]) v[p.sf] = p.key;", "if (false) v[p.sf] = p.key;"],   /* v610: مرساةٌ محدَّثة */
    ['pp-dental.js', 'drawn-when-completed', "if ((pend || p.pending) && !v[p.sf]) v[p.sf] = p.key;", "if (!v[p.sf]) v[p.sf] = p.key;"],   /* v610 */
    ['pp-dental.js', 'tip-same-label', "color:var(--text2);\">· عولج: ' + escapeHtml(dxNames(num, surface, done))", "color:var(--text2);\">· التشخيص: ' + escapeHtml(dxNames(num, surface, done))"],   /* v610 */
    ['pp-dental.js', 'no-session-note', "notes: (spacerUnitForLedger || bridgeUnitForLedger || _socketSave) ? notes : dxSessionNote(currentTooth, currentSurface, notes),", "notes: notes,"],
    ['pp-dental.js', 'clear-no-restore', "if (!_wErr) { for (var _dbk in _dxBack) await dxRestoreAfterRemoval(currentTooth, _dbk, _dxBack[_dbk]); }", "if (false) {}"],
    ['pp-dental.js', 'full-clear-restores', "if (!!sm[currentSurface]) surfacesToClear.forEach(", "if (true) surfacesToClear.forEach("],
    ['pp-dental.js', 'sole-treatment-no-restore', "if (!!sm[currentSurface]) surfacesToClear.forEach(", "if (!_fullClear) surfacesToClear.forEach("],
    ['pp-dental.js', 'history-leaks', "if (window.__historyMode || st === 'condition') return '';", "if (st === 'condition') return '';"],
    ['pp-dental.js', 'condition-row-text', "if (window.__historyMode || st === 'condition') return '';", "if (window.__historyMode) return '';"],
    ['pp-dental.js', 'mirror-carries-watch', "if (prevSt === 'condition' && isConditionKey(prevKey) && prevKey !== row.treatment_key)", "if (prevSt === 'condition' && prevKey !== row.treatment_key)"],
    ['pp-modules.js', 'exam-no-restore', "if (_dxT.length && typeof dxRestoreAfterRemoval === 'function') await dxRestoreAfterRemoval(n, s, _dxT);", "if (false) {}"]
  ];
  let bites = 0;
  for (const [f, name, a, b] of MUT) {
    if (SRC[f].indexOf(a) < 0) { console.error('✗ طفرة ' + name + ': المرساةُ غائبة'); process.exit(1); }
    const mw = await boot(Object.assign({}, SRC, { [f]: SRC[f].replace(a, b) }), 'mut-' + name);
    const mr = await measure(mw, PPH), fails = Object.keys(mr).filter(k => !mr[k]);
    if (fails.length) { bites++; console.log('  🦷 ' + name + ' → ' + fails.join(', ')); }
    else console.error('  ✗ طفرة ' + name + ' مرّت بلا أثر');
  }
  /* طفرةُ المصدر: حارسُ حذف الجلسة */
  const pphMut = PPH.replace('v605: صفُّ حالةٍ سريرية لا يمثّل جلسةً قط', 'v605-removed');
  const pw = await boot(SRC, 'mut-delsession'); const pr = await measure(pw, pphMut);
  if (!pr.delSessionGuard) { bites++; console.log('  🦷 delsession-guard-removed → delSessionGuard'); } else console.error('  ✗ طفرة delsession-guard-removed مرّت');
  console.log(`prove-chart-dx mutants: ${bites}/${MUT.length + 1}`);
  process.exit(bites === MUT.length + 1 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

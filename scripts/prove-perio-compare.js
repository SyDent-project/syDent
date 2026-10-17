#!/usr/bin/env node
/* SyDent — prove-perio-compare.js (v634 · جولة فجوات المنافسين ③)
   «مقارنة فحوص اللثة» على الدوالّ الحقيقية من pp-modules.js داخل jsdom (لا نسخ):
   (١) الأساسُ أيُّ فحصٍ أسبق — الافتراضي السابقُ مباشرة؛ القائمةُ تظهر فقط حين يوجد أكثرُ من فحصٍ أسبق.
   (٢) كلُّ عمقٍ: تحسّن/تراجع/ثبات + القيمةُ السابقة تحته (تُرى على الهاتف — التلميحُ يحتاج فأرة).
   (٣) عدُّ التحسّن/التراجع/الثبات + النزف الجديد/المتوقّف + شريحةُ الملخّص.
   (٤) تبديلُ الأساس لا يكدّس العلامات؛ الخروجُ يعيد كل حقلٍ لمكانه بلا أثر.
   (٥) طباعةُ المريض: «مقارنة: أ ← ب» · جملةٌ مبسّطة · جدولُ قبل/بعد بالفرق · ▼/▲ لكل عمق (يُقرأ بالرمادي).
   --self-test: طفراتٌ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const SRC0 = fs.readFileSync(path.join(ROOT, 'pp-modules.js'), 'utf8');

let pass = 0, fail = 0, SILENT = false;
function ok(c, m) { if (c) pass++; else { fail++; if (!SILENT) console.log('FAIL ' + m); } }
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  const start = src.lastIndexOf('\n', i) + 1;
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(start, j + 1);
}
const FNS = ['perioClearCompareMarks', 'perioExitCompareState', 'perioToggleCompare', 'perioRunCompare', 'updatePerioStats',
             'perioPrintArch', 'perioPrintCompareBlock', 'perioNowStats', 'perioCalcCal', 'perioIsMolar'];

const T = [16, 11, 46];
const SITES = ['mb', 'b', 'db', 'ml', 'l', 'dl'];
/* current exam values and two older exams */
const CUR = { 16: [3, 5, 4, 3, 3, 3], 11: [2, 2, 2, 2, 2, 2], 46: [6, 4, 3, 3, 3, 3] };
const PREV = { 16: [4, 5, 3, 3, 3, 3], 11: [2, 3, 2, 2, 2, 2], 46: [6, 6, 3, 3, 3, 3] };   // vs CUR: better 3 (16mb 11b 46b) · worse 1 (16db) · same 14
const OLD = { 16: [6, 6, 6, 3, 3, 3], 11: [3, 3, 3, 2, 2, 2], 46: [7, 7, 5, 3, 3, 3] };     // vs CUR: better 9 · worse 0
const BOP_CUR = { 16: ['b'], 46: ['mb'] }, BOP_PREV = { 16: ['b', 'db'], 46: [] };          // 46mb new, 16db stopped

function rowsOf(map, bop) {
  return Object.keys(map).map(t => { const r = { tooth_num: +t }; SITES.forEach((s, i) => { r['pd_' + s] = map[t][i]; r['bop_' + s] = !!(bop && bop[t] && bop[t].indexOf(s) > -1); }); return r; });
}

async function suite(SRC) {
  const html = '<!doctype html><body><div id="tab-perio"><button id="perioCompareBtn"></button><select id="perioCmpSel" style="display:none"></select>'
    + '<button id="perioSaveBtn"></button><div id="perioStats"></div><table><tr>'
    + T.map(t => '<td>' + SITES.map(s => '<input class="pd-in" data-t="' + t + '" data-f="pd_' + s + '" value="' + CUR[t][SITES.indexOf(s)] + '">'
        + '<input class="pd-in rec" data-t="' + t + '" data-f="rec_' + s + '" value="1">'
        + '<span class="bop-dot' + (BOP_CUR[t] && BOP_CUR[t].indexOf(s) > -1 ? ' on' : '') + '" data-t="' + t + '" data-f="bop_' + s + '"></span>').join('') + '</td>').join('')
    + '</tr></table></div></body>';
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const w = dom.window;
  const toasts = [];
  Object.assign(w, {
    UPPER_T: [16, 11], LOWER_T: [46], PERIO_B: ['mb', 'b', 'db'], PERIO_L: ['ml', 'l', 'dl'],
    perioIsExtracted: () => false, perioDocName: () => '', escapeHtml: x => String(x), fmtD: d => d.split('-').reverse().join('/'),
    showToast: m => toasts.push(m), currentUser: { id: 'U1' },
    perioExams: [{ id: 'E3', exam_date: '2026-10-13' }, { id: 'E2', exam_date: '2026-07-01' }, { id: 'E1', exam_date: '2026-04-12' }],
    __rows: { E2: rowsOf(PREV, BOP_PREV), E1: rowsOf(OLD, {}) },
    sb: { from: () => { const q = { _id: null, select() { return q; }, eq(k, v) { if (k === 'exam_id') q._id = v; return q; }, then(r) { return Promise.resolve({ data: w.__rows[q._id] || [], error: null }).then(r); } }; return q; } }
  });
  w.eval('var perioCompare = false, perioCmpLocked = [], perioCmpPrev = null, perioCmpExam = null, perioCmpRows = null, perioRows = {}; var perioCurrent = perioExams[0];\n'
    + FNS.map(n => fnSrc(SRC, n)).join('\n'));
  const $ = id => w.document.getElementById(id);
  const inputs = () => [...w.document.querySelectorAll('input.pd-in:not(.rec)')];
  const site = (t, s) => w.document.querySelector('input.pd-in[data-t="' + t + '"][data-f="pd_' + s + '"]');

  await w.perioToggleCompare();
  const sel = $('perioCmpSel');
  ok(w.perioCompare && sel.style.display === '' && sel.options.length === 2 && sel.value === 'E2' && /مقابل 01\/07\/2026/.test(sel.options[0].textContent), '(١) any older exam can be the baseline; the default is the previous one; the picker shows when there is a choice');
  ok(site(16, 'mb').classList.contains('cmp-better') && site(16, 'db').classList.contains('cmp-worse') && site(11, 'l').classList.contains('cmp-same') && site(46, 'b').classList.contains('cmp-better'), '(٢) each depth: better / worse / same against the baseline');
  const st = site(16, 'mb').parentNode;
  ok(st.classList.contains('pd-stack') && st.querySelector('.pd-prev').textContent === '4' && st.querySelector('.pd-prev').classList.contains('cmp-better') && w.document.querySelectorAll('.pd-stack').length === 18, '(٢) the previous value sits under every depth (visible without a mouse), coloured like its change');
  const cp = w.perioCmpPrev;
  ok(cp.better === 3 && cp.worse === 1 && cp.same === 14 && cp.bopNew === 1 && cp.bopStop === 1 && cp.date === '2026-07-01', '(٣) counts: improved 3 · worse 1 · same 14 · bleeding new 1 / stopped 1');
  ok(/مقابل 01\/07\/2026: <b class="cmp-better-t">▼ تحسّن 3<\/b> · <b class="cmp-worse-t">▲ تراجع 1<\/b> · ثبات 14 · نزف: توقّف 1 \/ جديد 1/.test($('perioStats').innerHTML) && /\(كان /.test($('perioStats').innerHTML), '(٣) the summary chip names the baseline and the counts; the before/after chips stay');
  ok(inputs().every(i => i.readOnly) && $('perioSaveBtn').disabled && $('perioCompareBtn').textContent === '✕ إنهاء المقارنة', 'compare mode is read-only and cannot be saved');

  await w.perioRunCompare('E1');
  ok(w.document.querySelectorAll('.pd-stack').length === 18 && w.document.querySelectorAll('.pd-stack .pd-stack').length === 0 && w.perioCmpPrev.better === 9 && w.perioCmpPrev.worse === 0 && site(16, 'db').classList.contains('cmp-better') && !site(16, 'db').classList.contains('cmp-worse'), '(٤) switching the baseline re-marks cleanly — no stacked marks, new counts');

  const block = w.perioPrintCompareBlock();
  ok(/مقارنة: 12\/04\/2026 ← 13\/10\/2026/.test(block) && /تحسّنت حالة اللثة: نقص عمق الجيب في 9 موقعاً\./.test(block) && /<th[^>]*>الفرق<\/th>/.test(block) && /▼<\/b> تحسّن \(عمقٌ أقل\)/.test(block), '(٥) patient print: which exams, a plain sentence, a before/after table with the difference, the legend');
  const snap = {}; T.forEach(t => { snap[t] = {}; SITES.forEach((x, i) => { snap[t]['pd_' + x] = CUR[t][i]; }); });
  const arch = w.perioPrintArch([16], 'حنكي', snap, w.perioCmpRows);
  ok(/<b style="color:#15803d;">3▼<\/b> · <b style="color:#15803d;">5▼<\/b> · <b style="color:#15803d;">4▼<\/b>/.test(arch) && !/▲/.test(arch), '(٥) patient print: every changed depth carries ▼/▲ (readable in grey)');
  const arch0 = w.perioPrintArch([16], 'حنكي', snap, null);
  ok(!/▼|▲/.test(arch0), '(٥) the normal print is unchanged outside comparison');

  w.perioExitCompareState();
  ok(!w.perioCompare && w.document.querySelectorAll('.pd-stack, .pd-prev').length === 0 && inputs().every(i => i.parentNode.tagName === 'TD' && !i.readOnly && !/cmp-/.test(i.className)) && sel.style.display === 'none' && w.perioCmpRows === null, '(٤) leaving compare puts every input back in its cell, editable, with no trace');

  w.perioExams = [{ id: 'E3', exam_date: '2026-10-13' }, { id: 'E2', exam_date: '2026-07-01' }];
  await w.perioToggleCompare();
  ok(sel.style.display === 'none' && w.perioCompare, '(١) a single older exam ⇒ no picker, compared directly');
  w.perioExitCompareState();
}

async function run(SRC) { pass = 0; fail = 0; try { await suite(SRC); } catch (e) { fail++; if (!SILENT) console.log('FAIL exception ' + e.message); } return { pass, fail }; }

(async () => {
  const main = await run(SRC0);
  if (main.fail) { console.log('❌ prove-perio-compare: ' + main.fail + ' فشل'); process.exit(1); }
  if (process.argv.includes('--self-test')) {
    const M = [
      ['baseline always the previous exam', "cs.value = older[0].id;\n    cs.style.display = older.length > 1 ? '' : 'none';", "cs.value = older[0].id;\n    cs.style.display = 'none';"],
      ['no previous value under the depth', '    st.appendChild(pr);\n', ''],
      ['same counted as better', "else { cls = 'cmp-same'; nSame++; }", "else { cls = 'cmp-better'; nBetter++; }"],
      ['switching stacks the marks', '  perioClearCompareMarks();\n  var panel = document.getElementById(\'tab-perio\');\n  var nBetter', '  var panel = document.getElementById(\'tab-perio\');\n  var nBetter'],
      ['exit leaves inputs wrapped', "    var inp = st.querySelector('input'); if (inp) st.parentNode.insertBefore(inp, st); st.remove();", "    st.remove();"],
      ['summary chip dropped', "(cp && cp.better !== undefined ? '<span class=\"perio-cmp-sum\">", "(false ? '<span class=\"perio-cmp-sum\">"],
      ['print without the change marks', "return v < pv ? '<b style=\"color:#15803d;\">' + v + '▼</b>' : '<b style=\"color:#b91c1c;\">' + v + '▲</b>';", 'return v;'],
      ['print sentence inverted', "var sentence = cp.better > cp.worse", "var sentence = cp.better < cp.worse"],
      ['compare editable (could be saved over)', "  document.getElementById('perioSaveBtn').disabled = true;\n  showToast('🔍 مقارنة", "  showToast('🔍 مقارنة"]
    ];
    let bit = 0; SILENT = true;
    for (const [name, a, b] of M) {
      if (SRC0.indexOf(a) < 0) { console.log('❌ طفرة لا تطابق المصدر: ' + name); process.exit(1); }
      const r = await run(SRC0.replace(a, b));
      if (r.fail) bit++; else console.log('❌ طفرة لم تعضّ: ' + name);
    }
    if (bit !== M.length) process.exit(1);
    console.log('✅ prove-perio-compare: ' + main.pass + '/' + main.pass + ' توكيداً · ' + bit + '/' + M.length + ' طفرة تعضّ');
  } else console.log('✅ prove-perio-compare: ' + main.pass + '/' + main.pass + ' توكيداً');
})();

#!/usr/bin/env node
/* =====================================================================
 * SyDent — check-fusha.js  (C1/C2: كل نصوص النظام بالعربية الفصحى)
 * ---------------------------------------------------------------------
 * Fails when a common Levantine word appears in user-facing text of a
 * page or script at the repo root. Comments are ignored (HTML, /* *\/, //).
 *
 * Allowed on purpose (ALLOW below):
 *   • the dashboard / expenses natural-language search regexes — they must
 *     understand what people type («هالشهر»، «بكرا»…);
 *   • the example patient question in the WhatsApp AI box (a patient's own words).
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['sw.js']);
const WORDS = [
  'هلق', 'هلّق', 'هلأ', 'لسا', 'لسّا', 'هون', 'هيك', 'شو', 'ليش', 'كتير', 'منيح', 'بدك', 'بدّك', 'بدي', 'بدّي',
  'رح', 'مافي', 'هاد', 'هادا', 'هاي', 'هدول', 'تبع', 'تبعك', 'تبعو', 'كرمال', 'منشان', 'شي', 'اللي',
  'فاضي', 'منين', 'إجوا', 'قدّيش', 'قديش', 'جاي', 'الجاية', 'بس', 'فيك', 'متل', 'إيمتى', 'ايمتى', 'مين',
  'النت', 'عنجد', 'يلا', 'شوي', 'شوية', 'بكرا', 'هالشهر', 'هالسنة', 'بيصير', 'بتصير', 'بيبقى', 'بياخد'
];
const RE = new RegExp('(^|[^\\u0600-\\u06FF])(?:و|ف)?(' + WORDS.join('|') + '|ما في (?:ولا|اتصال|أي|أصناف|أكتر|حدا))(?=$|[^\\u0600-\\u06FF])');
// («ما في» alone is also standard Arabic — «أهم ما في العلاج» — so only its colloquial uses are listed.)
// Lines that may hold colloquial words on purpose (see header).
const ALLOW = [
  /\.test\(n\)/,              // natural-language search parsers (index.html, expenses.html)
  /id="ppWaAiQuestion"/        // example patient question
];

function blank(m) { return m.replace(/[^\n]/g, ' '); }
function strip(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split('\n').map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}

const hits = [];
fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && !SKIP.has(f)).sort().forEach(f => {
  strip(fs.readFileSync(path.join(ROOT, f), 'utf8')).split('\n').forEach((l, i) => {
    if (ALLOW.some(r => r.test(l))) return;
    const m = RE.exec(l);
    if (m) hits.push(f + ':' + (i + 1) + ' «' + m[2] + '» ' + l.trim().slice(0, 100));
  });
});

if (hits.length) {
  hits.forEach(h => console.log('  ✗ ' + h));
  console.log('⛔ حارس الفصحى: ' + hits.length + ' نصّاً بالعامية — اكتبها بالفصحى.');
  process.exit(1);
}
console.log('✅ حارس الفصحى: لا كلمات عامية شائعة بنصوص الواجهة.');

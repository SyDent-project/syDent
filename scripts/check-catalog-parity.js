#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   الحارس العاشر — تماثل الكتالوج الافتراضي بين طبقتين
   ═══════════════════════════════════════════════════════════════════════════
   قائمة العلاجات الافتراضية لها مستهلكان لا ثالث لهما:
     (1) `CLINIC_CATALOG` في treatments.html  → «استعادة الافتراضي» + الزرع التلقائي
     (2) جدول VALUES داخل handle_new_doctor  → الزرع لحظة إنشاء الحساب
           (أحدثُ ملفٍّ بـmigrations/ يحمل العلامتين CATALOG-PARITY-START و
            CATALOG-PARITY-END — M103 ثم M146؛ آخرُ تعريفٍ هو الحيّ بالقاعدة، فالحارس
            يتبعه تلقائياً ولا يبقى معلّقاً على ملفٍّ تجاوزته دالةٌ أحدث)

   انحرافهما هو بالضبط سبب البغ الذي عالجته M103 (الـtrigger كان يزرع 9 علاجات
   بأسعار بينما الـJS يحمل 24 بسعر 0). هذا الحارس يجعل تكرار ذلك مستحيلاً:
   يقارن الطبقتين **حقلاً بحقل** في كل تشغيل لـ`validate.sh`.

   لا يُنفَّذ أي كود من الملفين — تحليل نصّي بحت.
   الخروج: 0 عند التطابق، 1 عند أي اختلاف.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT    = path.resolve(__dirname, '..');
const HTML    = path.join(ROOT, 'treatments.html');
/* أحدثُ ترحيلٍ يعرّف كتالوج handle_new_doctor = أعلى رقمٍ بين الملفات الحاملة للعلامة. */
const MIG_DIR = path.join(ROOT, 'migrations');
const MIG = (function () {
  const hits = fs.readdirSync(MIG_DIR)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .filter(f => fs.readFileSync(path.join(MIG_DIR, f), 'utf8').indexOf('-- CATALOG-PARITY-START') >= 0)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return hits.length ? path.join(MIG_DIR, hits[hits.length - 1]) : null;
})();
const MIG_NAME = MIG ? path.basename(MIG) : '(لا ملف)';

const FIELDS = ['treatment_key', 'name', 'label', 'fill', 'stroke', 'price', 'builtin',
                'needs_lab', 'target_part', 'category', 'sort_order', 'post_extraction',
                'is_favorite', 'is_active', 'layman_name', 'dentition_scope'];

const errors = [];
function fail(msg) { errors.push(msg); }

/* ── (1) الطبقة JS: استخراج CLINIC_CATALOG وتقييمه في سياق معزول ────────── */
function readJsCatalog() {
  const html = fs.readFileSync(HTML, 'utf8');
  const start = html.indexOf('const CLINIC_CATALOG = [');
  if (start < 0) { fail('CLINIC_CATALOG غير موجود في treatments.html'); return null; }
  const end = html.indexOf('];', start);
  if (end < 0) { fail('نهاية CLINIC_CATALOG غير موجودة'); return null; }
  const code = html.slice(start, end + 2);
  const ctx = {};
  vm.createContext(ctx);
  try {
    new vm.Script(code + '; this.__out = CLINIC_CATALOG;').runInContext(ctx);
  } catch (e) {
    fail('تعذّر تقييم CLINIC_CATALOG: ' + e.message);
    return null;
  }
  return ctx.__out;
}

/* ── (2) الطبقة SQL: استخراج صفوف VALUES بين علامتَي التماثل ─────────────── */
function splitSqlRow(inner) {
  // تقسيم على الفواصل خارج علامات التنصيص المفردة ('' = تهريب داخلي)
  const out = [];
  let cur = '', inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      if (ch === "'") {
        if (inner[i + 1] === "'") { cur += "'"; i++; }
        else { inStr = false; cur += ch; }
      } else cur += ch;
    } else if (ch === "'") { inStr = true; cur += ch; }
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function coerce(tok) {
  if (tok.startsWith("'") && tok.endsWith("'")) return tok.slice(1, -1).replace(/''/g, "'");
  if (tok === 'true')  return true;
  if (tok === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return tok;
}

function readSqlCatalog() {
  if (!MIG) { fail('لا يوجد ترحيلٌ يحمل علامتَي CATALOG-PARITY'); return null; }
  const sql = fs.readFileSync(MIG, 'utf8');
  const s = sql.indexOf('-- CATALOG-PARITY-START');
  const e = sql.indexOf('-- CATALOG-PARITY-END');
  if (s < 0 || e < 0 || e < s) { fail('علامتا CATALOG-PARITY غير موجودتين في ' + MIG_NAME); return null; }
  const block = sql.slice(s, e);

  // ترتيب الأعمدة كما هو مصرَّح في INSERT
  const colsMatch = block.match(/INSERT INTO public\.treatments\s*\(([\s\S]*?)\)\s*VALUES/);
  if (!colsMatch) { fail('تعذّر قراءة قائمة الأعمدة من ' + MIG_NAME); return null; }
  const cols = colsMatch[1].split(',').map(c => c.trim());

  const rows = [];
  const re = /\(NEW\.id,([\s\S]*?)\)\s*(?:,|\r?\n\s*ON CONFLICT)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const vals = ['NEW.id'].concat(splitSqlRow(m[1]).map(coerce));
    if (vals.length !== cols.length) {
      fail('صف SQL بعدد قيم ' + vals.length + ' بينما الأعمدة ' + cols.length);
      continue;
    }
    const obj = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    rows.push(obj);
  }
  return rows;
}

/* ── (3) المقارنة ────────────────────────────────────────────────────────── */
const js  = readJsCatalog();
const sql = readSqlCatalog();

if (js && sql) {
  if (js.length !== sql.length) {
    fail('عدد الصفوف مختلف: JS=' + js.length + ' · SQL=' + sql.length);
  } else {
    js.forEach((jr, i) => {
      const sr = sql[i];
      FIELDS.forEach(f => {
        const a = (f === 'layman_name') ? (jr[f] || '') : jr[f];
        const b = (f === 'layman_name') ? (sr[f] || '') : sr[f];
        if (a !== b) {
          fail('اختلاف [' + (jr.treatment_key || i) + '] · ' + f +
               ': JS=' + JSON.stringify(a) + ' · SQL=' + JSON.stringify(b));
        }
      });
    });
  }
  // ثوابت الكتالوج
  js.forEach(r => { if (r.price !== 0) fail('سعر غير صفري في JS: ' + r.treatment_key); });
  sql.forEach(r => { if (r.price !== 0) fail('سعر غير صفري في SQL: ' + r.treatment_key); });
  js.forEach((r, i) => { if (r.sort_order !== i + 1) fail('ترتيب JS غير متسلسل عند ' + r.treatment_key); });
  // M146: نوعُ الأسنان قيمةٌ من ثلاث — وتصنيفُ «أطفال» لا يبقى بلا علاجٍ يظهر على سنٍّ قائم
  // (هذا بالضبط بلاغ الشريحة الغائبة: العلاجُ الوحيد كان حافظَ المسافة المحجوب عن القائم).
  js.forEach(r => {
    if (['all', 'primary', 'permanent'].indexOf(r.dentition_scope) < 0) fail('dentition_scope غير صالح في JS: ' + r.treatment_key);
  });
  const pedoCrownSide = js.filter(r => r.category === 'pediatric' && r.is_active !== false &&
    r.post_extraction !== true && r.treatment_key !== 'pedo-spacer' &&
    ['crown', 'crown_full', 'whole'].indexOf(r.target_part) >= 0);
  if (!pedoCrownSide.length) fail('تصنيف «أطفال» بلا علاجٍ تاجيٍّ يظهر على السن القائم — شريحته ستختفي بمودال السن');
}

if (errors.length) {
  console.error('❌ حارس الكتالوج: ' + errors.length + ' اختلاف');
  errors.forEach(e => console.error('   • ' + e));
  process.exit(1);
}
console.log('✅ حارس الكتالوج: الكتالوج الافتراضي متطابق (' +
            (js ? js.length : 0) + ' علاجاً · كل الأسعار 0) بين CLINIC_CATALOG و handle_new_doctor — ' + MIG_NAME + '.');
process.exit(0);

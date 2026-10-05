#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
 * SyDent — check-xss.js  ·  الحارس الثامن: منع حقن نص مستخدم غير مهرَّب في HTML
 * ══════════════════════════════════════════════════════════════════════
 * يفحص كل template literal «شكله HTML» (يحوي وسماً <tag>) — سواء أُسند مباشرة
 * إلى innerHTML أو خُزّن في متغيّر ثم دُمج (يغطّي القوالب الفرعية أيضاً).
 * يمسك استيفاء ${expr} يصل إلى حقل «نص حرّ» (إدخال مستخدم محتمل: name/notes/
 * title/label/description…) بلا مرور بدالة هروب (escapeHtml/prmEsc/…). القاعدة #195.
 *
 * لماذا حقول النص الحر تحديداً: القيم الأخرى (ألوان .fill، معرّفات .id، أرقام
 * مُنسّقة fmt*(), ثوابt) لا تحمل نص مستخدم فلا تُشكّل خطر XSS؛ تضمينها يُغرق
 * الحارس بإنذارات كاذبة. الخطر الفعلي هو نص المستخدم الحر.
 *
 * استثناء دقيق: للحالة الآمنة المعروفة (ثابت/ناتج غير نصّي) ضع «xss-ok» داخل
 * الاستيفاء نفسه، مثل:  ${lb.title/* xss-ok: عنوان ثابت *​/}  — يوثّق ويُسكّن.
 * ════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const ROOT = require('child_process').execSync('git rev-parse --show-toplevel').toString().trim();
process.chdir(ROOT);

// دوال الهروب المعروفة كسلاسل فرعية (تمسك escapeHtml, _dashEscapeHtml, prmEsc,
// encodeURIComponent, sanitize, DOMPurify) دون مطابقة خاطئة لـ description/prescription.
const ESCAPE_RE = /escapehtml|prmesc|encodeuri|sanitize|purify|htmlescape/i;
// حقول نص حرّ (إدخال مستخدم محتمل)
const USERTEXT = /\.(name|fullname|full_name|notes?|title|label|description|desc|reason|address|email|comment|remarks?|message|subject|text|diagnosis|complaint|display_name|lab_name|patient_name)\b/i;
const HTMLISH = /<[a-zA-Z][a-zA-Z0-9]*[\s/>]/;

function extractTemplate(s, bt) {
  let i = bt + 1, depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`' && depth === 0) return i;         // نهاية القالب
    if (c === '$' && s[i + 1] === '{') { depth++; i += 2; continue; }
    if (c === '}' && depth > 0) { depth--; i++; continue; }
    i++;
  }
  return -1;
}
// يعيد استيفاءات {expr, at} بمواقع مطلقة في المصدر
function interps(s, start, end) {
  const out = [];
  let i = start;
  while (i < end) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let j = i + 2, d = 1;
      while (j < end && d > 0) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } j++; }
      out.push({ expr: s.slice(i + 2, j), at: i });
      i = j + 1;
    } else i++;
  }
  return out;
}
const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;

const files = fs.readdirSync('.').filter(f => /\.(html|js)$/.test(f));
const findings = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let i = 0;
  while (i < s.length) {
    if (s[i] === '`') {
      const end = extractTemplate(s, i);
      if (end !== -1) {
        const body = s.slice(i + 1, end);
        if (HTMLISH.test(body)) {
          for (const { expr, at } of interps(s, i + 1, end)) {
            if (!USERTEXT.test(expr)) continue;      // ليس حقل نص حرّ
            if (ESCAPE_RE.test(expr)) continue;       // مهرَّب
            if (/xss-ok/i.test(expr)) continue;       // مُستثنى صراحةً
            findings.push({ f, line: lineOf(s, at), expr: expr.trim().slice(0, 70) });
          }
        }
        i = end + 1; continue;
      }
    }
    i++;
  }
}
if (findings.length) {
  console.error(`❌ حارس XSS: ${findings.length} حقل نص حرّ بلا هروب في قالب HTML:`);
  for (const x of findings) console.error(`   ${x.f}:${x.line}  →  \${${x.expr}}`);
  console.error('   الحل: مرّر عبر escapeHtml/prmEsc، أو أضِف «xss-ok» داخل ${...} مع السبب إن كان آمناً.');
  process.exit(1);
}
console.log('✅ حارس XSS: صفر حقل نص حرّ بلا هروب في قوالب HTML (مباشرة أو فرعية).');

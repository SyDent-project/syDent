#!/usr/bin/env bash
# SyDent — check-cdn-order.sh (القاعدة #٢٨، مُحدَّثة بعد الاستضافة الذاتية):
# وسم مكتبة supabase-js المستضافة ذاتياً (/vendor/supabase-*.min.js) يجب أن
# يسبق وسم supabase-init.js بكل صفحة تحمّله. يفحص وسوم <script src=> الحقيقية
# فقط (التعليقات لا تُحتسب). كما يكنس الشجرة المخدومة من أي وسم CDN خارجي
# متبقٍّ (cdn.jsdelivr.net) — صفر أوسمة عائمة (راجع vendor/README.md).
# الاستخدام: bash scripts/check-cdn-order.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bad=0; checked=0
for f in *.html; do
  init_line=$(grep -nE '<script[^>]*src="supabase-init\.js' "$f" | head -1 | cut -d: -f1 || true)
  [ -z "$init_line" ] && continue   # صفحة لا تحمّله (book.html) — تُتخطى
  checked=$((checked+1))
  lib_line=$(grep -nE '<script[^>]*src="/vendor/supabase-[0-9.]+\.min\.js"' "$f" | head -1 | cut -d: -f1 || true)
  if [ -z "$lib_line" ]; then
    echo "✗ $f: يحمّل supabase-init.js (سطر $init_line) بلا وسم vendor/supabase إطلاقاً"; bad=$((bad+1))
  elif [ "$lib_line" -ge "$init_line" ]; then
    echo "✗ $f: vendor/supabase (سطر $lib_line) لا يسبق supabase-init.js (سطر $init_line)"; bad=$((bad+1))
  fi
done
# ── حارس ترتيب pp-modules.js (مشروع تفكيك الملفات الوحشية) ──────────────────
# الوحدات المستخرَجة تعريفات صِرفة يستدعيها init وonclick بالكتلة الرئيسية،
# فوسم pp-modules.js يجب أن يوجد مرة واحدة بالضبط بـpatient-profile.html وأن
# يسبق بداية الكتلة الرئيسية المضمّنة (مرساة البداية الحية:
# new URLSearchParams(location.search) — أول سطر تنفيذي فيها). خرق الترتيب =
# دوال غير معرَّفة وقت النداء ⇒ انكسار صفحة جوهرية.
pp_tag=$(grep -cE '<script[^>]*src="pp-modules\.js' patient-profile.html || true)
if [ "$pp_tag" -ne 1 ]; then
  echo "✗ patient-profile.html: وسم pp-modules.js موجود $pp_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  pp_line=$(grep -nE '<script[^>]*src="pp-modules\.js' patient-profile.html | head -1 | cut -d: -f1)
  main_line=$(grep -n 'new URLSearchParams(location.search)' patient-profile.html | head -1 | cut -d: -f1 || true)
  if [ -z "$main_line" ] || [ "$pp_line" -ge "$main_line" ]; then
    echo "✗ patient-profile.html: pp-modules.js (سطر $pp_line) لا يسبق الكتلة الرئيسية (سطر ${main_line:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب pp-timeline.js (تفكيك patient-profile — الاستخراج ١١): وسم
#    واحد بالضبط ويسبق الكتلة الرئيسية (مرساة حية: Patient Timeline marker) ──
pt_tag=$(grep -cE '<script[^>]*src="pp-timeline\.js' patient-profile.html || true)
if [ "$pt_tag" -ne 1 ]; then
  echo "✗ patient-profile.html: وسم pp-timeline.js موجود $pt_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  pt_line=$(grep -nE '<script[^>]*src="pp-timeline\.js' patient-profile.html | head -1 | cut -d: -f1)
  pt_main=$(grep -n 'نُقل بايت-بايت إلى pp-timeline.js' patient-profile.html | head -1 | cut -d: -f1 || true)
  if [ -z "$pt_main" ] || [ "$pt_line" -ge "$pt_main" ]; then
    echo "✗ patient-profile.html: pp-timeline.js (سطر $pt_line) لا يسبق الكتلة الرئيسية (سطر ${pt_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب pp-appt.js (تفكيك patient-profile — الاستخراج ١٢): وسم
#    واحد بالضبط ويسبق الكتلة الرئيسية (مرساة حية: marker الاستخراج ١٢) ──────
pa_tag=$(grep -cE '<script[^>]*src="pp-appt\.js' patient-profile.html || true)
if [ "$pa_tag" -ne 1 ]; then
  echo "✗ patient-profile.html: وسم pp-appt.js موجود $pa_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  pa_line=$(grep -nE '<script[^>]*src="pp-appt\.js' patient-profile.html | head -1 | cut -d: -f1)
  pa_main=$(grep -n 'pp-appt.js (الاستخراج ١٢' patient-profile.html | head -1 | cut -d: -f1 || true)
  if [ -z "$pa_main" ] || [ "$pa_line" -ge "$pa_main" ]; then
    echo "✗ patient-profile.html: pp-appt.js (سطر $pa_line) لا يسبق الكتلة الرئيسية (سطر ${pa_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب pp-core.js (تفكيك patient-profile — الاستخراج ١٣): وسم
#    واحد بالضبط ويسبق الكتلة الرئيسية (مرساة حية: marker الاستخراج ١٣) ──────
pc_tag=$(grep -cE '<script[^>]*src="pp-core\.js' patient-profile.html || true)
if [ "$pc_tag" -ne 1 ]; then
  echo "✗ patient-profile.html: وسم pp-core.js موجود $pc_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  pc_line=$(grep -nE '<script[^>]*src="pp-core\.js' patient-profile.html | head -1 | cut -d: -f1)
  pc_main=$(grep -n 'الاستخراج ١٣ — القسم أ' patient-profile.html | head -1 | cut -d: -f1 || true)
  if [ -z "$pc_main" ] || [ "$pc_line" -ge "$pc_main" ]; then
    echo "✗ patient-profile.html: pp-core.js (سطر $pc_line) لا يسبق الكتلة الرئيسية (سطر ${pc_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب pp-extras.js (تفكيك patient-profile — الاستخراج ١٤): وسم
#    واحد بالضبط ويسبق الكتلة الرئيسية (مرساة حية: marker القصة أ) ───────────
px_tag=$(grep -cE '<script[^>]*src="pp-extras\.js' patient-profile.html || true)
if [ "$px_tag" -ne 1 ]; then
  echo "✗ patient-profile.html: وسم pp-extras.js موجود $px_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  px_line=$(grep -nE '<script[^>]*src="pp-extras\.js' patient-profile.html | head -1 | cut -d: -f1)
  px_main=$(grep -n 'الاستخراج ١٤ — القصة أ' patient-profile.html | head -1 | cut -d: -f1 || true)
  if [ -z "$px_main" ] || [ "$px_line" -ge "$px_main" ]; then
    echo "✗ patient-profile.html: pp-extras.js (سطر $px_line) لا يسبق الكتلة الرئيسية (سطر ${px_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب admin-settings.js (تفكيك admin — الاستخراج ١٥): وسم واحد
#    بالضبط ويسبق الكتلة الرئيسية (مرساة حية: marker القصة أ) ────────────────
as_tag=$(grep -cE '<script[^>]*src="admin-settings\.js' admin.html || true)
if [ "$as_tag" -ne 1 ]; then
  echo "✗ admin.html: وسم admin-settings.js موجود $as_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  as_line=$(grep -nE '<script[^>]*src="admin-settings\.js' admin.html | head -1 | cut -d: -f1)
  as_main=$(grep -n 'الاستخراج ١٥ — أ' admin.html | head -1 | cut -d: -f1 || true)
  if [ -z "$as_main" ] || [ "$as_line" -ge "$as_main" ]; then
    echo "✗ admin.html: admin-settings.js (سطر $as_line) لا يسبق الكتلة الرئيسية (سطر ${as_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب admin-modules.js (تفكيك admin): وسم واحد بالضبط ويسبق بداية
#    الكتلة الرئيسية (مرساة حية: Phase E: privileged-ops backend bridge) ──────
am_tag=$(grep -cE '<script[^>]*src="admin-modules\.js' admin.html || true)
if [ "$am_tag" -ne 1 ]; then
  echo "✗ admin.html: وسم admin-modules.js موجود $am_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  am_line=$(grep -nE '<script[^>]*src="admin-modules\.js' admin.html | head -1 | cut -d: -f1)
  am_main=$(grep -n 'Phase E: privileged-ops backend bridge' admin.html | head -1 | cut -d: -f1 || true)
  if [ -z "$am_main" ] || [ "$am_line" -ge "$am_main" ]; then
    echo "✗ admin.html: admin-modules.js (سطر $am_line) لا يسبق الكتلة الرئيسية (سطر ${am_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب admin-wa.js (حزام A3): وسم واحد بالضبط ويسبق الكتلة الرئيسية ──
aw_tag=$(grep -cE '<script[^>]*src="admin-wa\.js' admin.html || true)
if [ "$aw_tag" -ne 1 ]; then
  echo "✗ admin.html: وسم admin-wa.js موجود $aw_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  aw_line=$(grep -nE '<script[^>]*src="admin-wa\.js' admin.html | head -1 | cut -d: -f1)
  aw_main=$(grep -n 'Phase E: privileged-ops backend bridge' admin.html | head -1 | cut -d: -f1 || true)
  if [ -z "$aw_main" ] || [ "$aw_line" -ge "$aw_main" ]; then
    echo "✗ admin.html: admin-wa.js (سطر $aw_line) لا يسبق الكتلة الرئيسية (سطر ${aw_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب admin-render.js (حزام A2): وسم واحد بالضبط ويسبق الكتلة الرئيسية ──
ar_tag=$(grep -cE '<script[^>]*src="admin-render\.js' admin.html || true)
if [ "$ar_tag" -ne 1 ]; then
  echo "✗ admin.html: وسم admin-render.js موجود $ar_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  ar_line=$(grep -nE '<script[^>]*src="admin-render\.js' admin.html | head -1 | cut -d: -f1)
  ar_main=$(grep -n 'Phase E: privileged-ops backend bridge' admin.html | head -1 | cut -d: -f1 || true)
  if [ -z "$ar_main" ] || [ "$ar_line" -ge "$ar_main" ]; then
    echo "✗ admin.html: admin-render.js (سطر $ar_line) لا يسبق الكتلة الرئيسية (سطر ${ar_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# ── حارس ترتيب admin-plans.js (حزام A1): وسم واحد بالضبط ويسبق الكتلة الرئيسية ──
ap_tag=$(grep -cE '<script[^>]*src="admin-plans\.js' admin.html || true)
if [ "$ap_tag" -ne 1 ]; then
  echo "✗ admin.html: وسم admin-plans.js موجود $ap_tag مرة والمطلوب 1"; bad=$((bad+1))
else
  ap_line=$(grep -nE '<script[^>]*src="admin-plans\.js' admin.html | head -1 | cut -d: -f1)
  ap_main=$(grep -n 'Phase E: privileged-ops backend bridge' admin.html | head -1 | cut -d: -f1 || true)
  if [ -z "$ap_main" ] || [ "$ap_line" -ge "$ap_main" ]; then
    echo "✗ admin.html: admin-plans.js (سطر $ap_line) لا يسبق الكتلة الرئيسية (سطر ${ap_main:-مفقودة})"; bad=$((bad+1))
  fi
fi
# كنس صفر-CDN: لا أوسمة jsdelivr بأي ملف مخدوم (html/js عدا scripts/ وdocs/ وe2e/)
leftover=$(grep -rln "cdn\.jsdelivr\.net" --include="*.html" --include="*.js" \
  --exclude-dir=scripts --exclude-dir=docs --exclude-dir=e2e --exclude-dir=node_modules . || true)
if [ -n "$leftover" ]; then
  echo "✗ أوسمة cdn.jsdelivr.net متبقية بملفات مخدومة:"; echo "$leftover"; bad=$((bad+1))
fi
if [ "$bad" -eq 0 ]; then echo "✅ CDN: الترتيب سليم بـ$checked صفحة + صفر jsdelivr متبقٍّ"; else echo "⛔ CDN: $bad خرق"; exit 1; fi

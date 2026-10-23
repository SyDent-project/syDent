#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# SyDent — build-dist.sh  ·  نشر أصول الويب فقط (بند 4-أ: منع كشف المصدر)
# ════════════════════════════════════════════════════════════════════════
# الغاية: بناء مجلد dist/ يحوي ملفات الويب المخدومة فقط، ويستثني المصدر
#   والعمليات (docs/ · scripts/ · migrations/ · db/ · supabase/ · *.md · *.pdf
#   · *.sql). يُضبط Vercel عبر vercel.json: buildCommand = bash scripts/build-dist.sh
#   · outputDirectory = dist. فلا تصل الملفات الحساسة إلى النشر إطلاقاً.
#
# آمن على التوفّر: ننسخ كل عناصر الجذر عدا قائمة استثناء صغيرة، فلا يضيع
#   ملف مخدوم. (dotfiles مثل .git/.github/.gitignore مستثناة تلقائياً لأن *
#   لا يشملها — وهي غير مخدومة أصلاً.)
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST"

for item in *; do
  case "$item" in
    "$DIST")                          continue ;;   # مجلد الإخراج نفسه
    db|docs|e2e|migrations|scripts|supabase) continue ;; # مصدر/عمليات — لا يُنشر
    *.md|*.pdf|*.sql)                 continue ;;    # وثائق/تدقيق — لا يُنشر
    vercel.json)                      continue ;;    # إعداد النشر — لا يُنشر
    *)                                cp -r "$item" "$DIST"/ ;;
  esac
done

# وثائق متداخلة داخل مجلدات مخدومة (مثل vendor/README.md): الاستثناء أعلاه
# يمسك عناصر الجذر فقط — ننظّفها من dist لتبقى سياسة «لا *.md يُنشر» كاملة.
find "$DIST" -name '*.md' -type f -delete

# تصغير ملفات JS وCSS الخاصة بنا (جذر dist فقط — vendor/ مصغَّرة أصلاً): حذف التعليقات
# والفراغات بلا إعادة تسمية (الصفحات تستدعي الدوال العليا من onclick) ولا تجميع ولا هزّ شجرة،
# فكل دالة عامة تبقى. يقارب نصف ما يُنزَّل ويُحلَّل. ملفات المستودع تبقى بتعليقاتها.
# إن تعذّر جلب esbuild تبقى النسخ غير المصغّرة — موقعٌ أبطأ لا نشرٌ مكسور. SYDENT_NO_MINIFY=1 يتخطّاه.
if [ "${SYDENT_NO_MINIFY:-}" != "1" ]; then
  shopt -s nullglob
  assets=("$DIST"/*.js "$DIST"/*.css)
  if [ ${#assets[@]} -gt 0 ]; then
    before=$(cat "${assets[@]}" | wc -c)
    if npx --yes esbuild@0.24.0 "${assets[@]}" --outdir="$DIST" --allow-overwrite \
         --minify-whitespace --minify-syntax --legal-comments=none --charset=utf8 --log-level=warning; then
      after=$(cat "${assets[@]}" | wc -c)
      echo "── صُغِّر ${#assets[@]} ملفاً: $((before / 1024))KB → $((after / 1024))KB ──"
    else
      echo "⚠️  تعذّر esbuild — dist يبقى بالملفات غير المصغّرة" >&2
      for f in "${assets[@]}"; do cp "${f#"$DIST"/}" "$f"; done
    fi
  fi
fi

echo "── المنشور في $DIST/ ──"
ls -1 "$DIST"

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

# تصغير أصولنا (scripts/minify-dist.js): ملفات JS/CSS بجذر dist (vendor/ مصغَّرة أصلاً) وكتل
# <script>/<style> المضمّنة بالصفحات. حذف التعليقات والفراغات بلا إعادة تسمية (الصفحات تستدعي الدوال
# العليا من onclick) ولا تجميع ولا هزّ شجرة، فكل دالة عامة تبقى. ملفات المستودع تبقى بتعليقاتها.
# إن تعذّر جلب esbuild يبقى dist غير مصغّر — موقعٌ أبطأ لا نشرٌ مكسور. SYDENT_NO_MINIFY=1 يتخطّاه.
if [ "${SYDENT_NO_MINIFY:-}" != "1" ]; then
  ESB="${TMPDIR:-/tmp}/sydent-esbuild-0.24.0"
  if [ -d "$ESB/node_modules/esbuild" ] || npm install --prefix "$ESB" --no-save --no-audit --no-fund --silent esbuild@0.24.0 >/dev/null 2>&1; then
    NODE_PATH="$ESB/node_modules" node scripts/minify-dist.js "$DIST" \
      || echo "⚠️  تعذّر التصغير — dist يبقى بالملفات غير المصغّرة" >&2
  else
    echo "⚠️  تعذّر جلب esbuild — dist يبقى بالملفات غير المصغّرة" >&2
  fi
fi

echo "── المنشور في $DIST/ ──"
ls -1 "$DIST"

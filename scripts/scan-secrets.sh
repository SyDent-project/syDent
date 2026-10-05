#!/usr/bin/env bash
# SyDent — scan-secrets.sh: كشف قيم الأسرار الفعلية (لا مجرد الكلمات).
#   الوضع الافتراضي: يفحص git diff (unstaged + staged) — للاستخدام قبل الـcommit.
#   --all: يفحص كل الملفات المتتبَّعة بالشجرة.
# الأنماط: PAT كامل · sb_secret_ · JWT مزدوج المقاطع (لا وجود شرعياً له بالريبو —
# المفتاح العام بصيغة sb_publishable_ الجديدة) · مفاتيح خاصة · postgres:// بكلمة
# سر حقيقية (الـplaceholders التوثيقية بصيغة <...> مستثناة).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
P1='github_pat_[A-Za-z0-9_]{20,}'
P2='sb_secret_[A-Za-z0-9_]+'
P3='eyJ[A-Za-z0-9_-]{40,}\.eyJ'
P4='-----BEGIN[ A-Z]*PRIVATE KEY'
P5='postgres(ql)?://[^[:space:]<>]*:[^[:space:]@<>]+@'
PATTERNS="$P1|$P2|$P3|$P4|$P5"
if [ "${1:-}" = "--all" ]; then
  HITS=$(git ls-files -z | xargs -0 grep -InE "$PATTERNS" -- 2>/dev/null || true)
  SCOPE="الشجرة الكاملة"
else
  HITS=$( (git diff; git diff --cached) | grep -nE "^\+.*($PATTERNS)" || true)
  SCOPE="الـdiff (قبل الكوميت)"
fi
if [ -n "$HITS" ]; then
  echo "⛔ أسرار محتملة بـ$SCOPE:"
  echo "$HITS" | head -10 | sed -E 's/(github_pat_[A-Za-z0-9_]{8})[A-Za-z0-9_]*/\1***MASKED***/g'
  exit 1
fi
echo "✅ أسرار: $SCOPE نظيف"

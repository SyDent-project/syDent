#!/usr/bin/env bash
# =====================================================================
# SyDent — cache-bust.sh  (المحور ٥: الأتمتة)
# تبديل توكن كسر-الكاش (?v=) على أسطول صفحات HTML كاملاً بأمر واحد.
#
# الاستخدام:
#   scripts/cache-bust.sh              ← توكن تلقائي (تاريخ اليوم + الحرف التالي)
#   scripts/cache-bust.sh 20260705a    ← توكن صريح
#   scripts/cache-bust.sh --dry-run    ← عرض الخطة بلا أي تعديل
#
# النطاق: الأصول المشتركة الخمسة حصراً (قائمة سماح صريحة):
#   supabase-init.js · sidebar.js · sy-modal.js · theme.css · theme.js · timepicker.js · pp-modules.js · pp-wa.js · pp-clinical.js · pp-dental.js · pp-plan.js · pp-timeline.js · pp-appt.js · pp-core.js · pp-extras.js · admin-settings.js · patient-profile.css · admin.css · admin-modules.js · admin-wa.js · admin-render.js · admin-plans.js · appt-booking.js · appointments.css · appt-wa.js · appt-time.js · appt-views.js · appt-modal.js · appt-conflict.js · pt-reliability.js · sched-blocks.js · appt-blocks.js · appt-series.js · appt-family.js · acc-aging.js · pay-methods.js · acc-daysheet.js · pwd-policy.js · huddle-flags.js · dash-yesterday.js · dash-goal.js · dash-gaps.js · lab-redo.js · lab-due.js · lab-slip.js · lab-files.js · rpt-treat.js · rpt-newpt.js · rpt-att.js · rpt-ret.js · ref-pick.js · rpt-sum.js · inv-consume.js · inv-order.js · inv-count.js
#   ملاحظة: favicon.svg?v=N ترقيم مستقل (يُرفع فقط عند تغيير الأيقونة نفسها)
#   ولا يمسّه هذا السكربت أبداً.
#
# الضمانات البنيوية (Rule #21 + قاعدة book.html):
#   1. book.html مستثنى بنيوياً — لا يدخل حلقة التعديل إطلاقاً، ويُتحقَّق
#      قبل وبعد أنه يحوي صفر توكنات.
#   2. تحقق تناظري: توزيع المراجع لكل أصل مشترك قبل التبديل = بعده
#      حرفياً (نفس الأعداد، توكن موحّد جديد فقط).
#   3. تحقق صفر-تغيير-بنيوي: كل سطر متغيّر في git diff يحوي ?v= حصراً.
#   أي فشل ⇒ خروج برمز ≠ 0 + تعليمات الاسترجاع.
# =====================================================================
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MODE="apply"; TOKEN=""
for a in "$@"; do
  case "$a" in
    --dry-run) MODE="dry" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) TOKEN="$a" ;;
  esac
done

# ── الأسطول = كل *.html ما عدا book.html (استثناء بنيوي) ──────────────
FLEET=()
for f in *.html; do
  [ "$f" = "book.html" ] && continue
  FLEET+=("$f")
done
[ ${#FLEET[@]} -gt 0 ] || { echo "❌ لا ملفات HTML بالجذر"; exit 1; }

# ── حارس book.html (قبل) ──────────────────────────────────────────────
if grep -q '?v=' book.html 2>/dev/null; then
  echo "❌ book.html يحوي توكنات ?v= — هذا خرق بنيوي، راجعه يدوياً قبل أي bump."
  exit 1
fi

# ── قائمة السماح: الأصول المشتركة الخمسة حصراً ────────────────────────
ASSETS_RE='(supabase-init\.js|sidebar\.js|sy-modal\.js|theme\.css|theme\.js|timepicker\.js|pp-modules\.js|pp-wa\.js|pp-clinical\.js|pp-dental\.js|pp-plan\.js|pp-timeline\.js|pp-appt\.js|pp-core\.js|pp-extras\.js|admin-settings\.js|patient-profile\.css|admin\.css|admin-modules\.js|admin-wa\.js|admin-render\.js|admin-plans\.js|appt-booking\.js|appointments\.css|appt-wa\.js|appt-time\.js|appt-views\.js|appt-modal\.js|appt-conflict\.js|pt-reliability\.js|sched-blocks\.js|appt-blocks\.js|appt-series\.js|appt-family\.js|acc-aging\.js|pay-methods\.js|acc-daysheet\.js|pwd-policy\.js|huddle-flags\.js|dash-yesterday\.js|dash-goal\.js|dash-gaps\.js|lab-redo\.js|lab-due\.js|lab-slip\.js|lab-files\.js|rpt-treat\.js|rpt-newpt\.js|rpt-att\.js|rpt-ret\.js|ref-pick\.js|rpt-sum\.js|inv-consume\.js|inv-order\.js|inv-count\.js)'

# ── جرد ما قبل: أصل → عدد + مجموعة التوكنات الحالية ───────────────────
pre_scan() {
  grep -hoE "${ASSETS_RE}\?v=[A-Za-z0-9]+" -- "${FLEET[@]}" | sort
}
PRE=$(pre_scan || true)
[ -n "$PRE" ] || { echo "❌ صفر مراجع ?v= بالأسطول — لا شيء يُبدَّل."; exit 1; }
PRE_DIST=$(echo "$PRE" | sed 's/?v=.*//' | uniq -c)
OLD_TOKENS=$(echo "$PRE" | grep -oE '\?v=[A-Za-z0-9]+' | sort -u | sed 's/?v=//')
TOTAL_REFS=$(echo "$PRE" | wc -l)

# ── حساب التوكن التلقائي ──────────────────────────────────────────────
AUTO_TOKEN=""
if [ -z "$TOKEN" ]; then
  AUTO_TOKEN=1
  TODAY=$(date +%Y%m%d)
  LAST=$(echo "$OLD_TOKENS" | grep -E "^${TODAY}[a-z]$" | sort | tail -1 || true)
  if [ -n "$LAST" ]; then
    L="${LAST: -1}"
    [ "$L" = "z" ] && { echo "❌ استُهلكت أحرف اليوم (z) — مرّر توكناً صريحاً."; exit 1; }
    NEXT=$(printf "\\$(printf '%03o' $(( $(printf '%d' "'$L") + 1 )))")
    TOKEN="${TODAY}${NEXT}"
  else
    TOKEN="${TODAY}a"
  fi
fi
echo "$TOKEN" | grep -qE '^[0-9]{8}[a-z]$' || {
  echo "❌ صيغة التوكن غير قانونية: '$TOKEN' (المطلوب YYYYMMDD + حرف صغير)."; exit 1; }

# ── v380: التوكن لم يُستعمل قط بتاريخ الريبو ──────────────────────────
# جلستان متوازيتان مرّرتا توكناتٍ صريحة بالحروف نفسها (20260917f…m استُعملت
# مرتين) — عنوانُ الأصل نفسُه قد يخدم نسخةً قديمة من كاش المتصفّح. التوكنُ
# الصريح المستعمل سابقاً يُرفض، والتلقائي يتقدّم حتى أول حرفٍ لم يُستعمل.
used_before() { [ -n "$(git log -S"?v=$1" --format=%h -n 1 2>/dev/null)" ]; }
if used_before "$TOKEN"; then
  if [ -n "$AUTO_TOKEN" ]; then
    while used_before "$TOKEN"; do
      L="${TOKEN: -1}"
      [ "$L" = "z" ] && { echo "❌ استُهلكت أحرف اليوم بالتاريخ — مرّر توكناً صريحاً بتاريخٍ آخر."; exit 1; }
      TOKEN="${TOKEN%?}$(printf "\\$(printf '%03o' $(( $(printf '%d' "'$L") + 1 )))")"
    done
  else
    echo "❌ التوكن '$TOKEN' استُعمل سابقاً بتاريخ الريبو ($(git log -S"?v=$TOKEN" --format=%h -n 1)) — اختر حرفاً لم يُستعمل (أو شغّل بلا توكن)."; exit 1
  fi
fi

echo "═══ cache-bust — الخطة ═══"
echo "الملفات: ${#FLEET[@]} (book.html مستثنى بنيوياً)"
echo "المراجع: $TOTAL_REFS"
echo "التوكنات الحالية: $(echo "$OLD_TOKENS" | tr '\n' ' ')"
echo "التوكن الجديد:    $TOKEN"
echo "التوزيع الحالي لكل أصل:"; echo "$PRE_DIST" | sed 's/^/  /'

if [ "$MODE" = "dry" ]; then
  echo "— dry-run: صفر تعديل. —"
  exit 0
fi

if echo "$OLD_TOKENS" | grep -qx "$TOKEN"; then
  echo "❌ التوكن الجديد '$TOKEN' موجود أصلاً بالشجرة — اختر توكناً أحدث."; exit 1
fi

# ── التبديل ────────────────────────────────────────────────────────────
TOKEN="$TOKEN" perl -pi -e 's/((?:supabase-init\.js|sidebar\.js|sy-modal\.js|theme\.css|theme\.js|timepicker\.js|pp-modules\.js|pp-wa\.js|pp-clinical\.js|pp-dental\.js|pp-plan\.js|pp-timeline\.js|pp-appt\.js|pp-core\.js|pp-extras\.js|admin-settings\.js|patient-profile\.css|admin\.css|admin-modules\.js|admin-wa\.js|admin-render\.js|admin-plans\.js|appt-booking\.js|appointments\.css|appt-wa\.js|appt-time\.js|appt-views\.js|appt-modal\.js|appt-conflict\.js|pt-reliability\.js|sched-blocks\.js|appt-blocks\.js|appt-series\.js|appt-family\.js|acc-aging\.js|pay-methods\.js|acc-daysheet\.js|pwd-policy\.js|huddle-flags\.js|dash-yesterday\.js|dash-goal\.js|dash-gaps\.js|lab-redo\.js|lab-due\.js|lab-slip\.js|lab-files\.js|rpt-treat\.js|rpt-newpt\.js|rpt-att\.js|rpt-ret\.js|ref-pick\.js|rpt-sum\.js|inv-consume\.js|inv-order\.js|inv-count\.js)\?v=)[A-Za-z0-9]+/${1}$ENV{TOKEN}/g' "${FLEET[@]}"

# ── التحقق التناظري (بعد) ─────────────────────────────────────────────
POST=$(pre_scan || true)
if [ -z "$POST" ]; then
  echo "❌ فشل كارثي: صفر مراجع بعد التبديل — الاستبدال شوّه الأنماط!"
  echo "   للاسترجاع: git checkout -- $(printf '%s ' "${FLEET[@]}")"
  exit 1
fi
POST_DIST=$(echo "$POST" | sed 's/?v=.*//' | uniq -c)
POST_TOKENS=$(echo "$POST" | grep -oE '\?v=[A-Za-z0-9]+' | sort -u | sed 's/?v=//')
FAIL=0

if [ "$PRE_DIST" != "$POST_DIST" ]; then
  echo "❌ كسر التناظر — توزيع الأصول تغيّر:"
  diff <(echo "$PRE_DIST") <(echo "$POST_DIST") | sed 's/^/  /' || true
  FAIL=1
fi
if [ "$POST_TOKENS" != "$TOKEN" ]; then
  echo "❌ التوكن غير موحّد بعد التبديل: $(echo "$POST_TOKENS" | tr '\n' ' ')"; FAIL=1
fi
if grep -q '?v=' book.html 2>/dev/null; then
  echo "❌ book.html تلوّث بتوكن — خرق قاعدة الحماية!"; FAIL=1
fi
# صفر تغيير بنيوي: كل سطر محتوى متغيّر يجب أن يحوي ?v=
STRUCT=$(git diff -U0 -- "${FLEET[@]}" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -v '?v=' || true)
if [ -n "$STRUCT" ]; then
  echo "❌ أسطر متغيّرة بلا ?v= (تغيير بنيوي غير متوقع):"; echo "$STRUCT" | head -10 | sed 's/^/  /'
  FAIL=1
fi
CHANGED_PLUS=$(git diff --numstat -- "${FLEET[@]}" | awk '{a+=$1} END{print a+0}')
CHANGED_MINUS=$(git diff --numstat -- "${FLEET[@]}" | awk '{a+=$2} END{print a+0}')

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "⛔ فشل التحقق — الشجرة معدّلة وغير سليمة. للاسترجاع:"
  echo "   git checkout -- $(printf '%s ' "${FLEET[@]}")"
  exit 1
fi

echo ""
echo "✅ نجح التبديل: ${TOTAL_REFS} مرجعاً → ?v=${TOKEN}"
echo "✅ التناظر محفوظ حرفياً (نفس التوزيع لكل أصل):"
echo "$POST_DIST" | sed 's/^/  /'
echo "✅ diff متناظر: +${CHANGED_PLUS}/-${CHANGED_MINUS} سطراً، كلها ?v= فقط"
echo "✅ book.html: صفر توكنات (قبل وبعد)"
echo ""
echo "التالي: راجع git diff ثم commit + push (لا يعمل السكربت commit نيابةً عنك)."

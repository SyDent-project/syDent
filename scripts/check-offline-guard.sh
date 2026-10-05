#!/usr/bin/env bash
# SyDent — check-offline-guard.sh (الحارس السادس · v2): الجدار المالي لطبقة PWA.
# عقد Phase 2.1 (دفعات offline بقرار المالك):
#   • طابور الكتابة = (appointments|audit_log|ledger_payments) حصراً.
#   • ledger_payments: POST فقط (إنشاء) — تعديل/حذف online حصراً.
#   • حقن UUID: appointments + ledger_payments فقط (كلاهما id uuid — Migration 64).
#   • حظر مطلق بكامل supabase-init.js: payment_splits / realloc_patient_splits /
#     buildFifoSplits — التوزيع المالي online حصراً بمسارات الصفحات، بلا نسخة رابعة.
#   • ledger_sessions: محظورة داخل الموديول وداخل قسم توصيل الأوفلاين
#     (قراءتها القديمة بكود onboarding خارجهما مشروعة).
#   • sw.js: صفر أي رمز مالي إطلاقاً + deny-list + GET فقط.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
bad=0

# ── 1) sw.js ────────────────────────────────────────────────────────────────
if [ ! -f sw.js ]; then
  echo "X sw.js غير موجود"; bad=1
else
  if grep -qE 'ledger_|payment_splits|realloc_patient_splits|buildFifoSplits' sw.js; then
    echo "X sw.js يذكر رموزاً مالية"; grep -nE 'ledger_|payment_splits|realloc' sw.js | head -3; bad=1
  fi
  grep -q "DENY_HOST_SUBSTR" sw.js || { echo "X sw.js: deny-list مفقودة"; bad=1; }
  grep -qF "if (req.method !== 'GET') return;" sw.js || { echo "X sw.js: بوابة GET مفقودة"; bad=1; }
  grep -q "supabase.co" sw.js || { echo "X sw.js: supabase.co غائبة"; bad=1; }
fi

# ── 2) حظر مطلق بكامل supabase-init.js: رموز التوزيع الثلاثة ────────────────
HARD_BAN='payment_splits|realloc_patient_splits|buildFifoSplits'
if grep -qE "$HARD_BAN" supabase-init.js; then
  echo "X supabase-init.js يذكر رموز التوزيع (محظورة كلياً):"
  grep -nE "$HARD_BAN" supabase-init.js | head -3; bad=1
fi

# ── 3) موديول SyDentOffline (بين الماركرين) ─────────────────────────────────
MOD=$(sed -n '/SYDENT_OFFLINE_MODULE_START/,/SYDENT_OFFLINE_MODULE_END/p' supabase-init.js)
if [ -z "$MOD" ]; then
  echo "X ماركرا الموديول غير موجودين"; bad=1
else
  LVARS=$(grep -oE 'ledger_[a-z_]+' <<< "$MOD" | sort -u | tr '\n' ' ')
  if [ -n "$LVARS" ] && [ "$LVARS" != "ledger_payments " ]; then
    echo "X الموديول يذكر جداول ledger_* غير الدفعات: $LVARS"; bad=1
  fi
  # whitelist الثلاثية حرفياً على سطر التعريف نفسه (بلا جدول رابع)
  grep 'OUTBOX_TABLES_RE' <<< "$MOD" | grep -F '(appointments|audit_log|ledger_payments)(' >/dev/null \
    || { echo "X whitelist الطابور تغيّرت عن الثلاثية"; bad=1; }
  grep -qF 'ledger_payments: { POST: 1 }' <<< "$MOD" \
    || { echo "X عقد (الدفعات = POST فقط) كُسر"; bad=1; }
  grep -qF 'audit_log:       { POST: 1 }' <<< "$MOD" \
    || { echo "X عقد (audit_log = POST فقط) كُسر"; bad=1; }
  grep -qF 'UUID_INJECT_TABLES = { appointments: 1, ledger_payments: 1 };' <<< "$MOD" \
    || { echo "X قائمة حقن UUID تغيّرت"; bad=1; }
  # الشرط الحارس نفسه (الجسد بعده تفرّع fast-fail/تمرير — الدلالة: لا كاش لغير GET)
  grep -qF "if (!isRest || isRpc || method !== 'GET') {" <<< "$MOD" \
    || { echo "X بوابة (كاش القراءة = GET فقط) مفقودة"; bad=1; }
fi

# ── 4) قسم توصيل الأوفلاين (من رأسيته حتى نهاية الملف): بلا ledger_sessions ──
WIRE=$(sed -n '/SyDent Offline — توصيل التصريف/,$p' supabase-init.js)
if grep -q 'ledger_sessions' <<< "$WIRE"; then
  echo "X قسم التوصيل يذكر ledger_sessions"; bad=1
fi

if [ "$bad" -eq 0 ]; then
  echo "✅ حارس PWA v2: الجدار سليم (الطابور = مواعيد+تدقيق+دفعات-إنشاء-فقط؛ التوزيع online حصراً؛ صفر splits/realloc/FIFO بكامل الطبقة)"
else
  echo "⛔ حارس PWA: خرق بالجدار المالي"; exit 1
fi

#!/usr/bin/env bash
# SyDent — check-offline-guard.sh (الحارس السادس · v2): الجدار المالي لطبقة PWA.
# عقد Phase 2.1 (دفعات offline بقرار المالك):
#   • طابور الكتابة = (appointments|audit_log|ledger_payments|patients) حصراً.
#   • patients: POST (مريض جديد) + PATCH لحقول الهوية والملف الطبي حصراً (PATIENT_EDIT_COLS) — بقرار المالك.
#     حالة الدفع وآخر زيارة والمخطط والعائلة والحذف: online حصراً.
#   • ledger_payments: POST فقط (إنشاء) — تعديل/حذف online حصراً.
#   • ledger_sessions (بقرار المالك 25/11): PATCH لعمود notes وحده (SESSION_EDIT_COLS) لصفٍّ رآه المستخدم —
#     الإنشاء والحذف والكلفة والحالة والتاريخ والخطة online حصراً.
#   • حقن UUID: appointments + ledger_payments فقط (كلاهما id uuid — Migration 64).
#   • حظر مطلق بكامل supabase-init.js: payment_splits / realloc_patient_splits /
#     buildFifoSplits — التوزيع المالي online حصراً بمسارات الصفحات، بلا نسخة رابعة.
#   • ledger_sessions: داخل الموديول بعقد الملاحظة أعلاه فقط؛ محظورة بقسم توصيل الأوفلاين
#     (يسمّيها الموديول «session-note» للنافذة — قراءتها القديمة بكود onboarding خارجهما مشروعة).
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
  if [ -n "$LVARS" ] && [ "$LVARS" != "ledger_payments ledger_sessions " ]; then
    echo "X الموديول يذكر جداول ledger_* غير الدفعات والجلسات: $LVARS"; bad=1
  fi
  # whitelist الخماسية حرفياً على سطر التعريف نفسه (بلا جدول سادس)
  grep 'var OUTBOX_TABLES_RE' <<< "$MOD" | grep -F '(appointments|audit_log|ledger_payments|ledger_sessions|patients)(' >/dev/null \
    || { echo "X whitelist الطابور تغيّرت عن الخماسية"; bad=1; }
  # الجلسات: تعديلٌ فقط (لا إنشاء ولا حذف) · notes وحدها · بوابةُ الحقول · لا حقنَ UUID · لا مهلةَ تقطع كتاباتها أونلاين
  grep -qF 'ledger_sessions: { PATCH: 1 }' <<< "$MOD" \
    || { echo "X عقد (الجلسات = تعديل الملاحظة فقط) كُسر"; bad=1; }
  grep -qF 'var SESSION_EDIT_COLS = { notes: 1 };' <<< "$MOD" \
    || { echo "X حقول تعديل الجلسة offline تغيّرت عن notes وحدها"; bad=1; }
  grep -qF "for (var c in sPatch) if (!SESSION_EDIT_COLS[c]) throw REFUSE_OFFLINE;" <<< "$MOD" \
    || { echo "X بوابة حقول ملاحظة الجلسة offline مفقودة"; bad=1; }
  grep -qF "!((table === 'patients' || table === 'ledger_sessions') && method === 'PATCH'));" <<< "$MOD" \
    || { echo "X تعديلات الجلسات أونلاين صارت تحت مهلة القطع"; bad=1; }
  grep -qF 'patients:        { POST: 1, PATCH: 1 }' <<< "$MOD" \
    || { echo "X عقد (المريض = إنشاء + تعديل، بلا حذف) كُسر"; bad=1; }
  # تعديل المريض offline: حقول الهوية والملف الطبي حرفياً — لا payment ولا last_visit ولا أي حقل مشتق
  grep -qF 'var PATIENT_EDIT_COLS = { name: 1, phone: 1, dob: 1, gender: 1, allergies: 1, notes: 1, status: 1, medical_flags: 1, medical_flags_other: 1, referral_source: 1, referred_by_patient_id: 1, referrer_name: 1 };' <<< "$MOD" \
    || { echo "X قائمة حقول تعديل المريض offline تغيّرت"; bad=1; }
  grep -qF "for (var c in keep) if (!PATIENT_EDIT_COLS[c]) throw REFUSE_OFFLINE;" <<< "$MOD" \
    || { echo "X بوابة حقول تعديل المريض offline مفقودة"; bad=1; }
  grep -qF 'ledger_payments: { POST: 1 }' <<< "$MOD" \
    || { echo "X عقد (الدفعات = POST فقط) كُسر"; bad=1; }
  grep -qF 'audit_log:       { POST: 1 }' <<< "$MOD" \
    || { echo "X عقد (audit_log = POST فقط) كُسر"; bad=1; }
  grep -qF 'UUID_INJECT_TABLES = { appointments: 1, ledger_payments: 1, patients: 1 };' <<< "$MOD" \
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
  echo "✅ حارس PWA v2: الجدار سليم (الطابور = مواعيد+تدقيق+دفعات-إنشاء-فقط+مريض-إنشاء-وتعديل-هوية+ملاحظة-جلسة؛ التوزيع online حصراً؛ صفر splits/realloc/FIFO بكامل الطبقة)"
else
  echo "⛔ حارس PWA: خرق بالجدار المالي"; exit 1
fi

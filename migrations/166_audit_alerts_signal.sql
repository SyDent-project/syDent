-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 166 — تنبيهاتُ سجل النشاطات: إشارةٌ لا ضجيج (DeepCode #10 · 1 تشرين الأول 2026 — موافقة المالك)
-- ---------------------------------------------------------------------------
-- القاعدة الحيّة قبلها: 328 تنبيهاً نشطاً، 319 منها على أفعال **المالك نفسه**، و314 من القاعدة ٣
-- («5+ تعديلات من نفس الموظف على نفس المريض اليوم») لأنها تُطلق تنبيهاً **مع كل** تعديلٍ بعد الخامس
-- (السادس، السابع … العشرين) — 33 حالةً حقيقية فقط. التنبيهاتُ المهمة فعلاً (حذفُ دفعة/جلسة من غير المالك ·
-- حذفُ دفعةٍ بعد دقائق) 9 فقط، ضائعة بينها.
--
-- التغيير (trigger detect_audit_alerts — BEFORE INSERT):
--   • **أفعالُ المالك لا تُنبِّه** (الدور owner أو بلا دور = المالك): القواعد ١ · ٢ · ٣. السجلُّ نفسُه لا يتغيّر —
--     كلُّ فعلٍ يُسجَّل كما كان؛ تغيّر فقط علَمُ «تنبيه».
--   • **القاعدة ٣ مرةً واحدة** لكل (موظف · مريض · يوم): عند الفعل الخامس بالضبط، لا مع كل فعلٍ بعده.
--   • القاعدة ٤ (حذفُ دفعة/جلسة من طبيبٍ موظف أو سكرتيرة) كما هي حرفياً.
-- أرشفةُ القائم (لا حذف): تنبيهاتُ المالك + تكراراتُ القاعدة ٣ بعد أول تنبيهٍ لكل مجموعة.
-- idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.detect_audit_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_price NUMERIC;
  v_new_price NUMERIC;
  v_pct_change NUMERIC;
  v_recent_count INT;
  v_payment_age_minutes NUMERIC;
  v_original_creation TIMESTAMPTZ;
  v_is_owner BOOLEAN := COALESCE(NEW.employee_role_snapshot, 'owner') = 'owner';   -- M166
BEGIN
  -- ── Rule 1: حذف دفعة بسرعة (M166: لغير المالك) ─────────────────────
  IF NOT v_is_owner AND NEW.action_type = 'payment.delete' AND NEW.old_value IS NOT NULL THEN
    BEGIN
      v_original_creation := (NEW.old_value->>'created_at')::TIMESTAMPTZ;
      IF v_original_creation IS NOT NULL THEN
        v_payment_age_minutes := EXTRACT(EPOCH FROM (now() - v_original_creation)) / 60;
        IF v_payment_age_minutes < 60 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := 'حذف دفعة بعد ' || ROUND(v_payment_age_minutes)::TEXT
                              || ' دقيقة فقط من إنشائها';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ── Rule 2: تعديل سعر جلسة بأكثر من 50% (M166: لغير المالك) ──────
  IF NOT v_is_owner AND NEW.action_type = 'session.edit_price'
     AND NEW.old_value IS NOT NULL AND NEW.new_value IS NOT NULL THEN
    BEGIN
      v_old_price := (NEW.old_value->>'cost')::NUMERIC;
      v_new_price := (NEW.new_value->>'cost')::NUMERIC;
      IF v_old_price IS NOT NULL AND v_old_price > 0 AND v_new_price IS NOT NULL THEN
        v_pct_change := ABS(v_new_price - v_old_price) / v_old_price * 100;
        IF v_pct_change >= 50 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                              || 'تعديل سعر بنسبة ' || ROUND(v_pct_change)::TEXT || '%';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ── Rule 3: 5 تعديلات من نفس الموظف على نفس المريض اليوم (M166: لغير المالك · مرةً واحدة عند الخامس) ──
  IF NOT v_is_owner AND NEW.patient_id IS NOT NULL AND NEW.employee_id IS NOT NULL
     AND (NEW.action_type LIKE '%.delete' OR NEW.action_type LIKE '%.edit%') THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.audit_log
    WHERE owner_id = NEW.owner_id
      AND employee_id = NEW.employee_id
      AND patient_id = NEW.patient_id
      AND (action_type LIKE '%.delete' OR action_type LIKE '%.edit%')
      AND created_at >= date_trunc('day', now())
      AND created_at < NEW.created_at;
    -- مرةً واحدة: عند بلوغ الخامس، وما لم يُطلَق تنبيهُ هذه المجموعة اليوم (يصمد أمام الإدراج الجماعي بالطابع نفسه)
    IF v_recent_count >= 4 AND NOT EXISTS (
         SELECT 1 FROM public.audit_log
          WHERE owner_id = NEW.owner_id AND employee_id = NEW.employee_id AND patient_id = NEW.patient_id
            AND is_alert AND alert_reason LIKE '%تعديلات أو أكثر من نفس الموظف%'
            AND created_at >= date_trunc('day', now())) THEN
      NEW.is_alert := TRUE;
      NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                          || '5 تعديلات أو أكثر من نفس الموظف على نفس المريض اليوم';
    END IF;
  END IF;

  -- ── Rule 4: حذف دفعة/جلسة من غير المالك (طبيب موظف أو سكرتيرة) — كما هو ──
  IF NEW.action_type IN ('payment.delete', 'session.delete')
     AND NEW.employee_role_snapshot IN ('doctor', 'secretary') THEN
    NEW.is_alert := TRUE;
    IF NEW.alert_reason IS NULL THEN
      NEW.alert_reason :=
        (CASE WHEN NEW.action_type = 'payment.delete' THEN 'حذف دفعة' ELSE 'حذف جلسة' END)
        || ' بواسطة '
        || (CASE NEW.employee_role_snapshot
              WHEN 'doctor'    THEN 'الطبيب'
              WHEN 'secretary' THEN 'السكرتيرة'
              ELSE 'موظف'
            END);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- أرشفةُ القائم (لا حذف — الصفوفُ والسجلُّ كما هي، والأرشيفُ قابلٌ للعرض بصفحة السجل):
-- (أ) تنبيهاتُ أفعال المالك نفسه.
UPDATE public.audit_log
   SET is_archived = TRUE, archived_at = now()
 WHERE is_alert AND NOT COALESCE(is_archived, FALSE)
   AND COALESCE(employee_role_snapshot, 'owner') = 'owner';
-- (ب) تكراراتُ القاعدة ٣ لغير المالك: يبقى أولُ تنبيهٍ لكل (موظف · مريض · يوم) ويُؤرشف ما بعده.
WITH r3 AS (
  SELECT id, row_number() OVER (PARTITION BY owner_id, employee_id, patient_id, date_trunc('day', created_at) ORDER BY created_at) AS rn
    FROM public.audit_log
   WHERE is_alert AND NOT COALESCE(is_archived, FALSE)
     AND alert_reason ~ 'تعديلات (أو أكثر )?من نفس الموظف على نفس المريض اليوم'
)
UPDATE public.audit_log a
   SET is_archived = TRUE, archived_at = now()
  FROM r3 WHERE a.id = r3.id AND r3.rn > 1;

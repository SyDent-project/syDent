-- Migration 91 — Implant Log (سجل تفاصيل الزرعة — Backlog #8)
-- =========================================================================
-- CareStack "Implant Tracker" / Sensei Cloud parity: per-tooth implant
-- documentation records (brand/system · reference# · lot# · diameter ·
-- length · placement date · loading date · notes). Purpose: medico-legal
-- traceability — supplier recalls and failure investigations resolve to
-- affected patients in seconds. Documentation layer ONLY:
--   * zero financial writes (fully separate from ledger_sessions/splits)
--   * zero tooth-chart geometry changes (chart implant marking unchanged)
-- Multiple rows per tooth allowed (re-implantation) — UI shows newest first.
-- tooth_num TEXT — matches teeth_status.tooth_num / patient_documents (M55).
-- Additive + idempotent. Mirrors Migration 58 (post_op_notes) structure.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.implant_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL,
  tooth_num   TEXT NOT NULL,
  brand       TEXT,            -- الماركة/النظام (مثال: Straumann BLT)
  ref_no      TEXT,            -- Reference # (المعرّف الكتالوجي — معيار recall)
  lot_no      TEXT,            -- Lot # (رقم التشغيلة)
  diameter    NUMERIC,         -- القطر بالمم
  length      NUMERIC,         -- الطول بالمم
  placed_at   DATE,            -- تاريخ الزرع
  loaded_at   DATE,            -- تاريخ التحميل
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.implant_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "implant_log_owner_all" ON public.implant_log;
CREATE POLICY "implant_log_owner_all" ON public.implant_log
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_implant_log_patient
  ON public.implant_log(owner_id, patient_id, created_at DESC);

COMMIT;

-- ── Verification (run tail — Rule #238) ─────────────────────────────────
SELECT
  to_regclass('public.implant_log')                                      AS implant_log_table,   -- expect public.implant_log
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'implant_log')     AS implant_log_policies, -- expect 1
  (SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'implant_log'
      AND indexname = 'idx_implant_log_patient')                         AS implant_log_index;    -- expect 1

-- ── ROLLBACK ──
-- DROP TABLE IF EXISTS public.implant_log;

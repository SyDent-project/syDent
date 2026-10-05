-- Migration 118: lab_payments — دفتر ذمم المخابر (تسوية سداد فقط)
-- الدفعات للمخبر لا تدخل أي معادلة مصروف/ربح — المصروف يبقى lab_orders.cost عند date_sent
-- (فلسفة المرجع المحاسبي: «المصروف يُحسب عند إصدار الالتزام للمخبر»). طبقة lab_payments
-- طبقة ذمم دائنة (A/P settlement) بحتة: «مستحق للمخابر» = Σ cost (!rejected) − Σ payments.
-- lab_id ON DELETE SET NULL (يطابق lab_orders.lab_id): حذف المخبر لا يفقد سجل السداد
-- فيبقى الإجمالي متسقاً. مطبّقة عبر Supabase MCP بتاريخ 02 آب 2026 ✓.
CREATE TABLE IF NOT EXISTS lab_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lab_id UUID REFERENCES labs(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  pay_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_payments_doctor ON lab_payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_payments_lab ON lab_payments(lab_id);

ALTER TABLE lab_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctor manages own lab payments" ON lab_payments;
CREATE POLICY "doctor manages own lab payments" ON lab_payments
  FOR ALL USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- تحقق:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'lab_payments' ORDER BY ordinal_position;

-- =====================================================================
-- Migration 128 — نطاق قفل العملة: يُقفل ما لا يُعدَّل مبلغه
-- =====================================================================
-- بلاغ المالك: طلبُ مخبرٍ سُجّل بالليرة سهواً ويجب أن يصير بالدولار —
-- والتعديل يرتدّ `currency_locked` من تريغر M125، بينما مودالُ الطلب يعرض
-- مبدّل عملةٍ مفتوحاً. أداةٌ تَعِد بما ترفضه القاعدة.
--
-- القاعدة الحاكمة المشتقّة من فحصٍ حيّ لا من تقدير:
--
--     العملة تُعدَّل حيثما يُعدَّل المبلغ، وتُقفل حيثما يُقفل المبلغ.
--
-- الوحدةُ ليست أقلَّ قابليةً للتصحيح من الرقم — بل الرقمُ الصحيح تحت وحدةٍ
-- خاطئة خطأٌ كامل بقاعدة النطاقات نفسها. فقفلُ الوسم مع ترك المقدار حرّاً
-- تناقضٌ لا حماية.
--
-- ── ما يبقى مقفولاً (مبرَّرٌ ببنيةٍ لا برأي) ─────────────────────────────
--   ledger_payments   ← payment_splits تخزّن العملة المشتقّة منه
--   ledger_sessions   ← payment_splits تشير إليها وجدارُ التطابق يقيسها،
--                        وaccount_adjustments ابنتها
--   account_adjustments · payment_splits · lab_payments
--   وكلُّها بلا أي مسار تعديلٍ للمبلغ بالعميل أصلاً: التصحيح فيها حذفٌ
--   وإعادةُ إنشاء — فالقفل متّسقٌ مع سلوكها لا زائدٌ عليه.
--   (فحصُ المفاتيح الأجنبية الحيّ: هذه وحدها لها أبناء يحملون عملةً مشتقّة.)
--
-- ── ما يُفتح هنا (صفر جدولٍ ابن — متحقَّقٌ حيّاً) ────────────────────────
--   lab_orders  · expenses · provider_payouts · payment_plans
--   الأربعةُ لها مسارُ تعديلٍ كاملُ الحمولة بالعميل يُعدِّل المبلغ نفسه،
--   وصفر صفٍّ مشتقّ منها بأي جدول. وتغطيةُ FIFO لذمم المخابر محسوبةٌ لحظة
--   الرسم بلا تخزين (v113) فتُشفى ذاتياً بأي تغيير: نقلُ طلبٍ من كيس الليرة
--   إلى كيس الدولار يُعيد الحساب بلا أي صفٍّ عالق.
--
-- ── شبكةُ الأمان التي تجعل الفتح آمناً ──────────────────────────────────
--   تبديلُ العملة بالواجهة صار يُفرّغ المبلغ ويطلب إعادة كتابته (هذه الدفعة)،
--   فيستحيل أن يُعاد وسمُ رقمٍ محفوظ بصمت: إعادةُ الوسم تستلزم فعلَ كتابةٍ
--   واعياً. ومسارات التعديل الثلاثة صارت تفتح بعملة الصف المحفوظة، فالصفُّ
--   غيرُ الافتراضي ما عاد يُرسَل موسوماً بعملة العيادة.
--
-- الأثر: صفر تغيير بيانات · صفر UPDATE · صفر تغيير RLS · صفر تعديل على
-- دالة الحارس نفسها (الوسيط الثالث وحده يتبدّل) · idempotent بالكامل.
-- =====================================================================

-- lab_orders — تكلفة عملٍ عند المخبر، بلا أي صفٍّ مشتقّ
DROP TRIGGER IF EXISTS trg_currency_lab_orders ON public.lab_orders;
CREATE TRIGGER trg_currency_lab_orders BEFORE INSERT OR UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','nolock');

-- expenses — مصروفُ عيادةٍ قائمٌ بذاته
DROP TRIGGER IF EXISTS trg_currency_expenses ON public.expenses;
CREATE TRIGGER trg_currency_expenses BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','nolock');

-- provider_payouts — دفعةُ طبيبٍ أو موظف، بلا أي صفٍّ مشتقّ
DROP TRIGGER IF EXISTS trg_currency_provider_payouts ON public.provider_payouts;
CREATE TRIGGER trg_currency_provider_payouts BEFORE INSERT OR UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('owner_id','currency','nolock');

-- payment_plans — الخطةُ كتلةٌ واحدة بعملةٍ واحدة، وأقساطها محسوبةٌ منها لا مخزَّنة
DROP TRIGGER IF EXISTS trg_currency_payment_plans ON public.payment_plans;
CREATE TRIGGER trg_currency_payment_plans BEFORE INSERT OR UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.sydent_currency_guard('doctor_id','currency','nolock');

COMMENT ON FUNCTION public.sydent_currency_guard() IS
  'M124: يشتق عملة الصف من عملة العيادة عند غيابها ويقفلها حيث يوجد صفٌّ مشتقّ منها. args: owner_col, currency_col, lock|nolock — وM128: القفل محصورٌ بجداول الدفتر ذات الأبناء (ledger_sessions · ledger_payments · account_adjustments · payment_splits · lab_payments)، وهي نفسها بلا مسار تعديلٍ للمبلغ بالعميل.';

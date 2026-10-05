-- Migration 121: حفظ النص المولَّد بالذكاء الاصطناعي مع قالب طلب المخبر
-- (طلب المالك 3 آب 2026: القالب يعيد المستند كاملاً فيقل استخدام الـAI
-- مستقبلاً ويصير الأمر أبسط وأسرع).
-- النص يُخزَّن بالعنصرين النائبين {الاسم}/{التاريخ} غير محلولين — يُحلّان
-- client-side عند التطبيق لمريض الحالة الحالي (نمط #372) فلا يتسرب اسم
-- مريض أو تاريخ حالة قديمة إلى قالب يُعاد استخدامه.
-- ملاحظة معمارية: قوالب سبب الإحالة (kind='referral' بجدول
-- wa_message_templates) لم تحتج migration — الحمولة الغنية تُخزَّن JSON
-- بعمود body القائم بشكل مُصنَّف الإصدار (v:2)، والقالب القديم النصي
-- يبقى مقروءاً كسبب فقط (توافق رجعي مطلق).
-- مطبَّقة حيّاً عبر MCP ومؤكَّدة بالاستعلام في 3 آب 2026.

ALTER TABLE lab_order_templates ADD COLUMN IF NOT EXISTS ai_order_text TEXT;

-- تحقق
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'lab_order_templates' AND column_name = 'ai_order_text';

# vendor/ — المكتبات الخارجية المستضافة ذاتياً

**القاعدة:** كل أصل خارجي حرج يُستضاف ذاتياً باسم مُرقَّم بالنسخة + SHA-256 موثَّق هنا.
صفر أوسمة CDN عائمة بالمشروع. ترقية نسخة = ملف جديد باسم جديد + commit يحمل النسخة
(اسم مُرقَّم ⇒ صفر مشاكل كاش بنيوياً — لا يحتاج `?v=` ولا يدخل `cache-bust.sh`).

**المصدر:** npm registry الرسمي (`registry.npmjs.org`) — نفس المنبع الذي كان jsDelivr يخدم منه.
**التحقق عند الترقية:** تنزيل tarball النسخة، استخراج ملف dist الموثَّق أدناه، `sha256sum`، تحديث هذا الجدول.

| الملف | الحزمة | المسار داخل tarball | SHA-256 | تاريخ التنزيل |
|---|---|---|---|---|
| `supabase-2.110.8.min.js` | `@supabase/supabase-js@2.110.8` | `dist/umd/supabase.js` | `913f94db33b394a97d34c058347009053ac2d9534459c0990eb08594a108d2ee` | 2026-07-24 |
| `chart-4.4.0.umd.min.js` | `chart.js@4.4.0` | `dist/chart.umd.js` | `321e3a3fa98da4aaa957d10be57cbb514de0989eed8f9d726b5d05902cd01904` | 2026-07-24 |
| `xlsx-0.18.5.full.min.js` | `xlsx@0.18.5` | `dist/xlsx.full.min.js` | `c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99` | 2026-07-24 |

**فحص السلامة المُجرى قبل الاعتماد (Node vm ببيئة تحاكي متصفحاً):**
`window.supabase.createClient` = function · `window.Chart` = function · `window.XLSX.version` = 0.18.5

**ملاحظات:**
- supabase-js كان محمَّلاً بوسم عائم `@2` — ثُبِّت على 2.110.8 (آخر 2.x وقت التثبيت = ما كان jsDelivr يخدمه فعلياً، أي صفر تغيير سلوكي).
- `supabase-2.110.8.min.js` وحده يدخل `PRECACHE_URLS` بـ `sw.js` (حرج لكل الصفحات offline)؛
  chart وxlsx يكفيهما مسار SWR (صفحة واحدة لكل منهما: admin.html · patients.html).

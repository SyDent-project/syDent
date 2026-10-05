# SyDent — دليل التشغيل الموحّد (OPERATIONS)

**الغاية:** لو اختفى المالك اليوم، هذا الملف + `DEVELOPER_HANDOFF_AR.md` كافيان لتشغيل النظام وصيانته. لا توجد أي قيمة سرّ هنا — أسماء ومواقع فقط.
**آخر تحديث:** ٤ تموز ٢٠٢٦ · **المرجع الأعمق:** ملف سياق المالك `SyDent_Context_knew_md_*.md` (خارج git عمداً — القاعدة #١٠٧).

---

## ١. الصورة الكبيرة (٦٠ ثانية)

- **المنتج:** SaaS إدارة عيادات أسنان، عربي RTL، متعدد المستأجرين.
- **الكود:** HTML/CSS/JS صِرف بجذر الريبو — لا build، لا bundler. عدّل ← push لـ`main` ← Cloudflare Pages ينشر تلقائياً على `sydent.app`.
- **الخلفية:** Supabase (PostgreSQL + RLS + Auth + Storage + دالة Edge واحدة `admin-ops`).
- **العزل:** RLS بكل جدول (`owner_id = auth.uid()`). `book.html` السطح المجهول الوحيد، يكتب حصراً عبر ٣ دوال SECURITY DEFINER بحدود إساءة.

---

## ٢. جرد البنية التحتية (أين كل شيء)

| المكوّن | القيمة/المكان |
|---|---|
| الريبو | `github.com/AyhamGhnaim/SyDent` — فرع `main` |
| النشر | Cloudflare Pages، مشروع باسم `sydent`، auto-deploy من `main` |
| النطاق | `sydent.app` (Cloudflare Registrar، صالح حتى أيار ٢٠٢٨) |
| قاعدة البيانات | Supabase، معرّف المشروع `rycqzpdhxabpqrdgtdzg`، منطقة EU |
| التخزين | حاوية Supabase `patient-files` (RLS) |
| البريد | Resend عبر SMTP مخصّص (`mail.sydent.app`) مربوط بـSupabase Auth — منطقة US East |
| المراقبة | BetterStack: مونيتوران (`sydent.app` كل ٥ دق · `/book.html` كل ٣ دق) + Sentry EU (Loader Script بكل الصفحات الـ٢٢) |
| النسخ الاحتياطي | ريبو خاص `AyhamGhnaim/SyDent-backups` (قاعدة يومياً) + حاوية R2 `sydent-backups` (ملفات المرضى عبر rclone) |
| CAPTCHA | Cloudflare Turnstile (مفتاح الموقع عام بـ`auth.html`/`settings.html`؛ السرّي بـSupabase ← Attack Protection) |

**خدمتان يتيمتان للإيقاف (لا تعيدا ربطهما):** خدمة Render قديمة (كانت لـ`server.js` المحذوف) + مشروع Vercel قديم (بقايا هيكل Next.js — مصدر إيميلات فشل النشر).

---

## ٣. جرد الأسرار — أسماء ومواقع فقط (بلا قيم أبداً)

**أسرار GitHub Actions (الريبو ← Settings ← Secrets ← Actions) — ٧:**
`SUPABASE_DB_URL` · `BACKUP_PAT` · `SUPABASE_S3_ACCESS_KEY_ID` · `SUPABASE_S3_SECRET_ACCESS_KEY` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_ACCOUNT_ID`
+ متغيّر repo `BACKUP_ENABLED` (يجب `true` ليشتغل النسخ الليلي).

**خارج الريبو (ملاحظات المالك الخاصة):**
- GitHub PAT للتطوير: `SyDent-dev` (least-privilege، ينتهي **٢٣ حزيران ٢٠٢٧**؛ التوكن القديم `Syrdent-token` الذي كان ينتهي ٢٢ تموز ٢٠٢٦ **محذوف** منذ v96).
- `BACKUP_PAT` (توكن `sydent-backup`): **بلا تاريخ انتهاء** ⚠️ — استبداله بتوكن مؤقّت بند معروف.
- مفتاح Supabase service-role: **فقط** في بيئة دالة `admin-ops` (Deno.env) — لا يصل المتصفح أبداً.
- مفتاح Resend API: كلمة سرّ SMTP بإعدادات Supabase Auth.
- المفتاح العام anon/publishable (بصيغة `sb_publishable_…`): **عام بالتصميم** داخل `supabase-init.js` — الحماية الفعلية هي RLS، لا يحتاج تدويراً.

**قاعدة إلزامية قبل أول عميل حقيقي:** تدوير كل الأسرار أعلاه (شُورِكت مع أدوات AI خلال التطوير).

---

## ٤. سير العمل اليومي (النشر والتعديل)

```
1) استنسخ الريبو نظيفاً
2) bash scripts/validate.sh              ← يجب أن يخرج "كل الحُرّاس خضر"
3) عدّل الملف المستهدف (تمريرة واحدة لكل ملف)
4) bash scripts/validate.sh              ← بعد كل تعديل
5) لو عدّلت أصلاً مشتركاً (supabase-init/sidebar/theme.css/theme.js/timepicker):
      scripts/cache-bust.sh              ← رفع التوكن أسطولياً بأمر واحد
6) لو لمست ملف مرايا (appointments/book/patients/patient-profile/settings):
      node scripts/check-mirrors.js      ← صفر تباعد إلزامي
7) commit برسالة إنجليزية مفصّلة ← push لـmain ← Cloudflare ينشر
8) اختبار حي على sydent.app
```

**خطوط حمراء:**
- **`book.html` لا يُمسّ أبداً** في أي تعديل جماعي (بوابة الحجز العامة — سطح مجهول حسّاس).
- **المالية مقدَّسة:** منطق FIFO لتوزيع الدفعات مكرّر بـ٣ ملفات (`patient-profile`/`appointments`/`settings`) ويجب أن يبقى متطابقاً؛ الحفظ الذرّي عبر RPC `realloc_patient_splits`. اختبار ذاتي مدمج: **Ctrl+Shift+D** على أسطح المحاسبة (ثوابت الحفظ A–E).
- **قاعدة الإيراد المكتسب:** الـsplit مكتسب فقط إذا `is_unearned=false` **و** جلسته مكتملة (محاسبة أساس نقدي).

---

## ٥. الترحيلات (Migrations)

- **مصدر الحقيقة = المخطّط الحيّ بـSupabase**، وملفات `migrations/` سجل تاريخي جزئي (فجوات وأرقام معادة — لا تعد تشغيلها لبناء بيئة).
- التطبيق: يدوي بمحرّر SQL بـSupabase ← ثم حفظ الملف مرقّماً بـ`migrations/` للسجل.
- الحالة: ٧٤–٧٧ مطبّقة ومؤكّدة؛ **رقم الملف التالي ٧٨** (تحقّق من القاعدة الحية قبل أي ترحيل جديد).
- تنبيه تشخيصي: `auth.uid()` بمحرّر SQL تُرجع NULL أو قيمة مختلفة — استعمل `owner_id` صريحاً بالاستعلامات التشخيصية.

---

## ٦. النسخ الاحتياطي والتعافي

- **آلياً يومياً (٠٢:٠٠ UTC):** `backup.yml` ← pg_dump كامل (أدوار + مخطّط + بيانات + مخطّط auth) إلى `SyDent-backups` بمجلد مؤرّخ، + rclone لملفات المرضى إلى R2 `sydent-backups`.
- **إبقاء المشروع صاحياً:** `keep-alive.yml` مرّتين أسبوعياً (ping بالمفتاح العام + كوميت علامة مشروط) — الخطة المجانية تنيّم المشروع بعد ٧ أيام خمول.
- **الاستعادة:** خطوات مفصّلة بـ`SyDent_DR_Runbook.md` (ضمن ملفات المالك). ⚠️ **لم يُجرَ اختبار استعادة كامل بعد** — أولوية مبكرة للمستلم (بمشروع Supabase رمّي).
- **اختبار الاستعادة (آلي، يدوي التشغيل):** `dr-restore-test.yml` ← يسحب آخر مجلد من `SyDent-backups` ويستعيده بأمر Supabase الموثَّق (`psql --single-transaction … roles → schema → data`) إلى قاعدة الهدف `DR_TARGET_DB_URL` (مشروع `sydent-dr` المجاني — **ليس الإنتاج؛ حارس صلب يرفض أي رابط يحمل مرجع الإنتاج**)، ثم يتحقّق: عدد الصفوف لكل جدول = عدد أسطر `COPY` بالنسخة، RLS مفعّلة على كل الجداول، السياسات > 0، كل طبيب له `auth.users`، وهوية `payment_splits ≤ payment`. الإيقاع: مرّة قبل أول عميل يدفع، ثم شهرياً وبعد أي هجرة تلمس البنية. النتيجة بملخّص الـrun.

---

## ٧. أدوات الجودة (scripts/)

| السكربت | الوظيفة | متى |
|---|---|---|
| `validate.sh` | الغلاف الجامع للخمسة أدناه | قبل كل commit |
| `validate-js.js` | صياغة كل كتل JS المضمّنة (vm.Script) | ضمن الغلاف |
| `check-divs.py` | توازن div بكل صفحة | ضمن الغلاف |
| `check-cdn-order.sh` | وسم CDN يسبق `supabase-init.js` (القاعدة #٢٨) | ضمن الغلاف |
| `scan-secrets.sh` | قيم أسرار فعلية بالـdiff (افتراضي) أو `--all` للشجرة | ضمن الغلاف + قبل push |
| `check-mirrors.js` | تطابق مجموعات المرايا سلوكياً/بايت-بايت (#٢١١) | عند لمس ملفات المرايا |
| `cache-bust.sh` | رفع توكن الكاش أسطولياً بتحقق تناظري | عند تعديل أصل مشترك |

---

## ٨. مجموعات المرايا (تطابق إلزامي — القاعدة #٢١١)

| المجموعة | النسخ |
|---|---|
| مطبّع الهاتف | `appointments.normalizePhone` · `book.normalizePhone` · `patients.prmNormalizePhone` · `patient-profile.ppNormalizePhone` |
| قالب تذكير الموعد الافتراضي | `settings.DEFAULT_WA_TEMPLATE` ↔ `appointments.DEFAULT_WA_TEMPLATE` |
| قالب الاستدعاء الافتراضي | `settings.DEFAULT_RECALL_TEMPLATE` ↔ `patients.DEFAULT_RECALL_TPL` ↔ `patient-profile.PP_DEFAULT_RECALL_TPL` |
| قالب عيد الميلاد الافتراضي | `settings.DEFAULT_BIRTHDAY_TEMPLATE` ↔ `patients.DEFAULT_BDAY_TPL` |
| أدوات ذيل المراجعات | `prmFmtNum↔fmtDNum` · `prmWatchTeeth↔ppWatchTeeth` · `prmWatchByDate↔ppWatchByDate` |

أي تغيير دلالي بنسخة **يُعمَّم على كل النسخ بنفس الكوميت** ثم `node scripts/check-mirrors.js`.

---

## ٩. مطبّات الهوية والدخول (اقرأها قبل لمس Auth)

- **التسجيل الذاتي هو المسار القانوني الوحيد** لإنشاء الحسابات (#٣٥) — لا دعوات من داشبورد Supabase.
- **أطباء الموظفين بلا حسابات Auth منفصلة** — دخول مشترك بحساب المالك + Device Lock. أي منطق يشتق "المستخدم الحالي" من `currentUser.id` سيُرجع المالك دائماً؛ استعمل `window.SyDentLock.getEffectiveDoctorId()` أولاً.
- `clinic_employees` يميّز المالك بـ`role='owner'` (لا يوجد عمود `is_owner`).
- **عناوين `@sydent.com` المولّدة لا تُعدَّل أبداً** (#٦٢) — معرّفات auth تاريخية.
- RLS بـsubquery على نفس الجدول = infinite recursion — الحل دالة SECURITY DEFINER (#٤٢).

---

## ١٠. الاستجابة للحوادث (مختصر)

| العرَض | أول ٣ خطوات |
|---|---|
| تنبيه BetterStack (الموقع ساقط) | ١) status.cloudflare.com ٢) داشبورد Cloudflare Pages ← آخر deploy ٣) status.supabase.com |
| أخطاء JS متدفقة بـSentry | حدّد الصفحة/السطر ← قارن بآخر commit ← `git revert` عند الشك (النشر فوري) |
| فشل workflow النسخ الاحتياطي | تبويب Actions ← سجل `backup.yml` ← غالباً سرّ منتهٍ (`BACKUP_PAT`/`SUPABASE_DB_URL`) |
| بريد Auth لا يصل | Supabase ← Auth ← SMTP (مفتاح Resend) + داشبورد Resend ← Logs |
| مشروع Supabase "متوقف" | Restore من الداشبورد؛ تحقق أن `keep-alive.yml` مفعّل |

**الاسترجاع الجراحي لملف واحد:** `git checkout <sha> -- file.html` ثم **أعد تطبيق الطبقات اللاحقة** — خصوصاً توكن الكاش ليطابق الأسطول (#٢٠٩)، ثم `validate.sh`.

---

## ١١. خلاصة القواعد التشغيلية الحرجة

`#١٩` الاختبار الحي هو الحكم الأخير · `#٢١` تعديل أصل مشترك ⇒ cache-bust أسطولي · `#٢٨` CDN قبل `supabase-init.js` · `#٧٩` تحديث ملف السياق صفري-الحذف + grep الأسرار قبل الإنهاء · `#١٠٧` ملف السياق لا يُرفع git أبداً · `#١٣٤` `treatment_key` ≠ `dbId` — استعمل `getTreatment(key).dbId` قبل استعلام `treatment_materials` · `#١٦٣` bulk-insert بـPostgREST يستعمل NULL لا DEFAULT · `#١٩٥` كل حقن `innerHTML` عبر `escapeHtml` · `#٢٠٠` التوست الوحيد `window.showToast` · `#٢٠١` الجسر/الحافظ/الزرع عبر `persistSpecialTreatment()` حصراً · `#٢١١` المرايا بايت-بايت.

القائمة الكاملة (#١–#٢١١) بملف سياق المالك.

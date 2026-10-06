# SyDent

نظام SaaS لإدارة عيادات الأسنان، متعدد المستأجرين، بالعربي RTL.

- **الواجهة:** HTML/CSS/JS عادي بدون build، مستضافة على **Vercel**.
- **الخلفية:** **Supabase** (Postgres + RLS + Auth + Storage + Edge Functions).
- **Cloudflare:** Turnstile (مربع "مش روبوت")، و Workers AI للذكاء الاصطناعي، والدومين `sydent.app` عند الإطلاق.

## ابدأ من هون

| الملف | شو فيه |
|---|---|
| [`TASKS.md`](TASKS.md) | خطة المهمات والمهمة الحالية. **ابدأ منو** |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | البنية التحتية: الحسابات والمشاريع والأسرار، وكيف بيشتغل النشر |
| [`docs/decisions.md`](docs/decisions.md) | القرارات وتواريخها |
| [`migrations/bootstrap/README.md`](migrations/bootstrap/README.md) | تجهيز مشروع Supabase جديد من الصفر |
| [`scripts/README.md`](scripts/README.md) | أدوات الفحص (`validate.sh`، و `cache-bust.sh`، و `scan-secrets.sh`) |
| [`docs/reference/`](docs/reference/) | مرجع المحاسبة، وخطة ما قبل الإطلاق |
| [`docs/archive/`](docs/archive/) | التوثيق اللي استلمناه مع المشروع (لحد v570). المنطق فيه صحيح، بس معلومات البنية التحتية قديمة |

## بنية المستودع

| المسار | شو فيه |
|---|---|
| `*.html` و `*.js` و `*.css` بالجذر | صفحات النظام وملفاتها. بتنرفع على Vercel كما هي |
| `vendor/` و `fonts/` و `icons/` | مكتبات وخطوط وأيقونات مستضافة محلياً |
| `supabase/functions/` | الـ Edge Functions: `admin-ops` و `ai-assist` |
| `db/schema.sql` | لقطة من الـ schema (`public`) |
| `migrations/` | تغييرات قاعدة البيانات المرقّمة، و `bootstrap/` للمشاريع الجديدة |
| `scripts/` | أدوات الفحص والبناء |
| `e2e/` | اختبارات Playwright |
| `docs/` | التوثيق |

ملفات `docs/` و `scripts/` و `migrations/` و `db/` و `supabase/` و `e2e/` وكل ملفات `*.md` و `*.sql` **ما بتنرفع على الموقع**. `scripts/build-dist.sh` بيبني مجلد `dist/` بملفات الموقع بس.

## الشغل اليومي

```bash
bash scripts/validate.sh          # قبل كل commit، لازم يطلع أخضر
bash scripts/cache-bust.sh        # بعد تعديل supabase-init.js أو sidebar.js أو theme.css أو theme.js أو timepicker.js
bash scripts/scan-secrets.sh      # فحص الأسرار بالتعديلات
```

- **كل مهمة** إلها فرع `task/<رقم>-<اسم>` و Pull Request على `main`.
- **قاعدة البيانات:** كل تغيير بيكون migration مرقّمة بـ `migrations/` (الرقم الجاي **176**). منجرّبها محلياً، وبعدين منطبّقها على `dental-dev`، وبعدين على `dental-prod`.
- **الأسرار** ما بتنكتب بالكود ولا بالشات أبداً.
- ⚠️ **`book.html`** (بوابة الحجز العامة) ما منلمسها بالتعديلات الجماعية.

## تشغيل محلي

```bash
bash scripts/build-dist.sh
cd dist && python3 -m http.server 8080
```

بعدها افتح `http://127.0.0.1:8080/auth.html`. الصفحات بتحكي مع `dental-dev`.

# SyDent — البنية التحتية والتشغيل

> **ما في ولا سر بهالملف.** بس أسماء وأماكن. القيم بتنحط بلوحات التحكم أو بـ GitHub Secrets.

## الحسابات

كل الحسابات على **حساب المشروع** (`SyDent-project` / `wadiamhd@gmail.com`).

| الخدمة | المكان |
|---|---|
| GitHub | المستودع `SyDent-project/syDent`، والفرع الرئيسي `main` |
| Supabase | منظمة `SyDent-project's Org` |
| Vercel | المشروع `sydent-project/sydent` |
| Cloudflare | الحساب `f49e30b5fc8570f54db3d2e2959ea437`: Turnstile و Workers AI، وبعدين الدومين و R2 |

فعّل **2FA** على كل الحسابات.

## مشاريع Supabase

| المشروع | المعرّف | المنطقة | الاستعمال |
|---|---|---|---|
| `dental-dev` | `peeydqtjwklixphuzvzg` | Singapore | التطوير. الكود بيحكي معو هلق |
| `dental-prod` | `nxkalpjrqvpglphmiuui` | Frankfurt | الإطلاق. لسا فاضي، وبيتجهّز بالمهمة A9. مربوط بـ GitHub على `main` |

**تجهيز مشروع جديد:** [`migrations/bootstrap/README.md`](../migrations/bootstrap/README.md).

**إعدادات بلوحة Supabase** (ما بيلتقطها أي ملف):
- Authentication ← Providers ← Email: **Confirm email مطفي**.
- Authentication ← URL Configuration: الـ Site URL، و Redirect URLs تبع Vercel (`https://*-sydent-project.vercel.app/**`).
- Authentication ← Attack Protection: CAPTCHA (**Turnstile**) مع السر تبع الـ widget.
- Edge Functions ← Secrets: `CF_ACCOUNT_ID` و `CF_AI_API_TOKEN`، و `CF_AI_MODEL` اختياري، و `ANTHROPIC_API_KEY` اختياري.

## النشر

| الشي | كيف بيصير |
|---|---|
| الموقع | Vercel بيبني من كل فرع نسخة تجريبية، ومن `main` النسخة الرئيسية. الإعدادات بـ [`vercel.json`](../vercel.json): البناء، ورؤوس الأمان، والروابط بدون `.html` |
| الـ Edge Functions | `.github/workflows/edge-deploy.yml` بيرفعهن لحالو لما يتغيّر `supabase/functions/` على `main` |
| قاعدة البيانات | migrations يدوية (SQL Editor أو أداة Supabase)، `dev` أول، وبعدين `prod` |

**بوابة النشر (`ci-guards.yml`):** على كل push لـ `main` بتشتغل الفحوصات و E2E. إذا نجحوا التنين، بينتقل الكود لفرع `release`. لما تشتغل E2E (بعد أسرارها)، منغيّر الفرع الرئيسي بـ Vercel لـ `release`.

## GitHub

**Secrets** (Settings ← Secrets and variables ← Actions):

| الاسم | الحالة | لمين |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | ✅ | `edge-deploy`. محصور بـ `dental-dev` و `dental-prod`، وصلاحياتو Project Settings (قراءة) و Edge Functions (قراءة وكتابة) |
| `E2E_EMAIL` و `E2E_SUPABASE_SECRET_KEY` | ⏳ | اختبارات E2E، بعد الخطط (A8) |
| `SUPABASE_DB_URL` | ⏳ | `backup` و `finance-integrity` و `schema-snapshot` |
| `BACKUP_PAT` و `SUPABASE_S3_*` و `R2_*` | ⏳ | النسخ الاحتياطي (E1) |

**Variables** (اختيارية، والافتراضي `dental-dev`):
`SUPABASE_PROJECT_REF` و `SUPABASE_PUBLISHABLE_KEY` و `SUPABASE_REGION` و `SUPABASE_PROD_REF` و `BACKUP_ENABLED`.

## Workflows

| الملف | إيمتى | شو بيعمل |
|---|---|---|
| `ci-guards.yml` | PR و push على `main` | الفحوصات، و E2E، والترقية لـ `release` |
| `edge-deploy.yml` | push على `main` (functions) أو يدوي | نشر `admin-ops` و `ai-assist` |
| `keep-alive.yml` | التلاتا والجمعة | بيمنع مشروع Supabase المجاني ينام |
| `backup.yml` | يومياً، إذا `BACKUP_ENABLED=true` | نسخة احتياطية لقاعدة البيانات والملفات |
| `finance-integrity.yml` | يومياً | 22 اختبار هوية مالية على البيانات |
| `schema-snapshot.yml` | أسبوعياً | تحديث `db/schema.sql` |
| `dr-restore-test.yml` | يدوي | تجربة استرجاع نسخة احتياطية |
| `e2e-smoke.yml` | يدوي | اختبارات E2E |

## قبل الإطلاق

الخطوات بـ [`TASKS.md`](../TASKS.md) (A8–A11 و E1–E3)، وبـ [`docs/reference/PRE_LAUNCH_RUNBOOK_AR.md`](reference/PRE_LAUNCH_RUNBOOK_AR.md).

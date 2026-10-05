# scripts/ — أدوات التطوير الآلية

أدوات المحور ٥ (الأتمتة). كلها تُشغَّل من أي مكان داخل الريبو، ولا تعمل `commit` نيابةً عنك أبداً.

---

## 1) `cache-bust.sh` — رفع توكن كسر-الكاش بأمر واحد

```bash
scripts/cache-bust.sh              # توكن تلقائي: تاريخ اليوم + الحرف التالي المتاح
scripts/cache-bust.sh 20260705a    # توكن صريح
scripts/cache-bust.sh --dry-run    # عرض الخطة بلا أي تعديل
```

**متى يُشغَّل؟** بعد أي تعديل على أحد الأصول المشتركة الخمسة:
`supabase-init.js` · `sidebar.js` · `theme.css` · `theme.js` · `timepicker.js`
(القاعدة #٢١: التوكن يُرفع أسطولياً حتى يجلب المتصفح النسخة الجديدة.)

**الضمانات المدمجة:**
- **نطاق مقيّد بقائمة سماح** للأصول الخمسة فقط — `favicon.svg?v=N` ترقيم مستقل لا يُمسّ.
- **`book.html` مستثنى بنيوياً** (لا يدخل حلقة التعديل)، ويُتحقَّق قبل وبعد أنه صفر توكنات؛ لو وُجد فيه توكن يُجهَض التشغيل فوراً.
- **تحقق تناظري:** توزيع المراجع لكل أصل قبل = بعد حرفياً (المرجع المعتمد: 16/20/21/21/2).
- **تحقق صفر-بنيوي:** كل سطر متغيّر بالـ`git diff` يحوي `?v=` حصراً.
- أي فشل ⇒ خروج ≠ 0 + أمر الاسترجاع جاهز للنسخ.

بعد النجاح: راجع `git diff` بعينك ثم `commit + push` يدوياً.

---

## 2) `check-mirrors.js` — حارس مجموعات المرايا (القاعدة #٢١١)

```bash
node scripts/check-mirrors.js
```

**متى يُشغَّل؟** قبل أي `commit` يلمس واحداً من ملفات المرايا:
`appointments.html` · `book.html` · `patients.html` · `patient-profile.html` · `settings.html`

**ماذا يثبت؟**
| المجموعة | النسخ | طريقة الإثبات |
|---|---|---|
| مطبّعات الهاتف | ×4 (`normalizePhone` ×2 · `prmNormalizePhone` · `ppNormalizePhone`) | سلوكياً على ١٧ متجه إدخال |
| قالب تذكير الموعد الافتراضي | ×2 (settings ↔ appointments) | بايت-بايت على القيمة المُقيَّمة |
| قالب الاستدعاء الافتراضي | ×3 (settings ↔ patients ↔ patient-profile) | بايت-بايت |
| قالب عيد الميلاد الافتراضي | ×2 (settings ↔ patients) | بايت-بايت |
| أدوات ذيل المراجعات | ×3 أزواج (`prmFmtNum↔fmtDNum` · `prmWatchTeeth↔ppWatchTeeth` · `prmWatchByDate↔ppWatchByDate`) | سلوكياً على متجهات صفوف ثابتة |

**القاعدة الحاكمة:** أي تغيير دلالي بمرآة **يُعمَّم على كل نسخها** بنفس الكوميت. الحارس يكسر البناء (exit 1) عند أي تباعد.

---

## 3) `validate.sh` — الغلاف الجامع لكل الحُرّاس

```bash
bash scripts/validate.sh    # قبل كل commit
```

يشغّل بالتسلسل ويفشل صاخباً عند أول خرق:

| الحارس | يفحص |
|---|---|
| `validate-js.js` | صياغة كل كتل JS المضمّنة بكل صفحة (vm.Script — يتخطى `src=` والأنواع غير JS) |
| `check-divs.py` | توازن وسوم `div` بكل صفحة |
| `check-cdn-order.sh` | وسم CDN الفعلي لـsupabase-js يسبق `supabase-init.js` (القاعدة #٢٨؛ التعليقات لا تُحتسب) |
| `scan-secrets.sh --all` | قيم أسرار فعلية بالشجرة (PAT كامل · `sb_secret_` · JWT · مفاتيح خاصة · `postgres://` بكلمة سر — الـplaceholders `<...>` مستثناة) |
| `check-mirrors.js` | تطابق كل مجموعات المرايا |
| `check-offline-guard.sh` | العزل المالي بطبقة الأوفلاين (صفر رموز مالية بـ`sw.js`/الموديول + whitelist الطابور + عقود PostgREST الحرفية) |
| `check-critical-logic.js` | المنطق الحرج الذي غلطُه صامت — يستخرج الدوال الحية ويؤكّد سلوكها بصندوق `vm` معزول. A) FIFO/توزيع الدفعات (قفل مرآة `buildFifoSplits`⇔`_apptBuildFifoSplits` + الثابت Σ=round(الدفعة))؛ B) CAL باللثة (`perioCalcCal` + تصنيف `perioCalPaint` عبر DOM shim خفيف)؛ C) قاعدة المكتسب `splitIsEarned` (مرآة `provider-reports`⇔`accounting` + قفل مصدر)؛ D) الملخّص المالي `computeFinancials` (رصيد المريض `trueBalance` + شلال الاسترداد + قاعدة split-على-planned)؛ E) محرّر التقسيم اليدوي `recalcSplitTotals` (منع حفظ توزيع يتجاوز الدفعة + تصنيف الفائض covers/prepay)؛ F) تكافؤ صيغة الرصيد `patients.html` (`loadFinancials`، sb وهمي) ⇔ `patient-profile.html` (`computeFinancials`) على سيناريوهات D — يمنع انحراف رصيد القائمة عن رصيد الملف؛ G) تكافؤ رصيد اللوحة الرئيسية `index.html` (`computeDashFinancials`، sb وهمي على 4 جداول عبر `.select().eq().in()`) ⇔ الكانوني `computeFinancials` على سيناريوهات D — ثالث تطبيق بنيوي للصيغة (بعد D وF)، يمنع اختلاف رصيد اللوحة عن رصيد الملف/القائمة لنفس المريض؛ H) محرّك P&L للمحاسبة `accounting.html` (`computeSummary` إيراد العيادة: splits + **de-dup الـlegacy** + استبعاد unearned + الإنتاج + معدّل التحصيل؛ `computeExpenseTotals`؛ `computeAdjustmentTotals`؛ + كتلة هويّة صافي الربح من `render()` تُقتَصّ بمرساة — سطور حسابية بحتة) — يقفل الرقم الذي يقرّر عليه المالك على مستوى العيادة كلها، أخطر فخّ صامت = دفعة إلها splits تُعدّ مرتين فينتفخ الإيراد؛ I) المدفوع على الجلسة `computeSessionPaid` (patient-profile، Σ splits المطابقة session_id — يغذّي محرّك التوزيع/المحرّر)؛ J) اقتراح دفعة الطبيب `computeSuggestion` (payouts، مال خارج: توجيه نموذج التعويض + الراتب مقسّماً على أيام الفترة + حصّة=إنتاج×نسبة−ما دُفع سابقاً مع **حارس منع الدفع المزدوج** + قصّ ≥0 + مطابقة breakdown_share؛ `resolveSharePct` يُستخرَج معها)؛ K) أداء الطبيب المالي `computeProviderStats` (provider-reports، إنتاج/تكلفة مخبر/صافي/تحصيل لكل طبيب: splits مكتسبة مطابقة للطبيب + fallback نسبي للدفعات القديمة + `net=production−labCost` + `_unassigned` + منع عدّ الدفعة ذات split مزدوجاً؛ `providerLabCost`+`splitIsEarned` يُستخرجان معها)؛ L) إحصاء المصاريف بالفترات `computeStats` (expenses، مجاميع اليوم/الأسبوع/الشهر/السنة — حدود >= شاملة + تعشيش النوافذ؛ معتمد DOM+تاريخ فيُحقَن Date ثابت + `$`/`todayISO`/`fmtAmount` shims) |

`scan-secrets.sh` بلا وسيطات يفحص **الـdiff فقط** (unstaged + staged) — الوضع الأسرع قبل الكوميت.

---

## ملاحظة معمارية

هذه السكربتات **قراءة/كتابة محلية فقط** — لا شبكة، لا أسرار، لا تعتمد على أي حزمة خارجية (bash/perl/node القياسية). يمكن لاحقاً ربطها بـGitHub Actions كحُرّاس CI عند الحاجة.

## finance-integrity.sql — فحصُ هوية المحاسبة على البيانات الحيّة (v263)
الحُرّاس أعلاه يفحصون **الكود**؛ هذا يفحص **البيانات**: 22 اختبار هوية (مجموع التوزيعات = الدفعة، عملة التوزيع = الدفعة = الجلسة، صفر أيتام، …). قراءة فقط. يُشغَّل ليلياً بـ`.github/workflows/finance-integrity.yml` وأي عددٍ غير صفر = فشل أحمر؛ ويُشغَّل يدوياً من SQL Editor بنسخ الملف كما هو. مصدر القيد المقابل بالقاعدة: `migrations/138_payment_splits_identity_guard.sql`.

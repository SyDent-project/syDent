# SyDent — ملف السياق الشامل
**آخر تحديث:** 3 تشرين الأول 2026 (**سياق 294** — **جولةُ المخزون والمواد المستهلكة مغلقةٌ بالسبعة** (v568 → v575 · M169–M174) + فحصٌ شامل ومراجعةٌ نهائية. قبلها **سياق 293**: ملاحظاتُ Deep Code — الباقي ثلاثةُ قرارات منتج (#7 · #5 · #6). البنيةُ بالقاعدة #682.)

## 🧭 كيف تستعمل هذا الملف
- **ملفٌّ واحد شامل** (قرار المالك، القاعدة #682): الحالةُ الحيّة · ما تبقّى مفتوحاً · كلُّ القواعد (#1–#726) مجمّعةً · فهرسُ الجلسات · ثم **التاريخُ الكامل حرفياً** (كتلة 294، ثم 293، ثم 292، ثم 291 مفصّلة، ثم 290، ثم 289، ثم كلُّ الكتل حتى 285 كما كانت) بآخر الملف.
- **ابدأ من رأسه:** الأقسامُ حتى «فهرس الجلسات» تكفي لبدء أي جلسة؛ التاريخُ تحتها يُبحث فيه بـ`grep -n` برقم نسخة (`v412`) أو هجرة (`M149`) أو قاعدة (`#669`) أو كلمة.
- **تفاصيل كل إصدار:** `CHANGELOG.md` بالريبو (المصدر الأدق للإصدارات بعد v400).
- **كتلةُ كلِّ جولةٍ جديدة:** موجزُها فوق «الحالة الحيّة»، وتفاصيلُها كاملةً أعلى قسم «التاريخ الكامل» — لا حذف، النقلُ فقط.

## ⭐ آخر جولة — سياق 294 (2 → 3 تشرين الأول 2026): جولةُ المخزون والمواد المستهلكة — مغلقةٌ بالسبعة (v568 → v574 · M169–M173)
- **المرجع:** بحثُ سياق 292 (Open Dental «Supply Inventory» · MedRestock · الممارسة المعتمدة) · تفاصيلُ كل إصدار: `CHANGELOG.md`.
- **(1) الخصمُ ذرّيٌّ بالقاعدة (M169، v568):** `inventory_consume` — قفلُ الصنف بترتيب · FEFO (الساريةُ ⇒ الرصيدُ بلا دفعة ⇒ المنتهيةُ آخراً) · حركةٌ لكل شريحة بالجلسة والمريض والطبيب والدفعة (المريضُ والطبيبُ من الجلسة بالقاعدة) · كلُّها أو لا شيء. **الثابت بالقاعدة:** الدفعاتُ المفتوحة ≤ الكمية — حارسُ دفعة + تريغرُ صنفٍ يقصّ FEFO عند أي إنقاص (العملاءُ القدامى يصمدون). `batch.quantity` = المتبقّي و`received_qty` = المستلَم · «✅ انتهت» يُخرج المتبقّي (`inventory_finish_batch`) · تسويةُ الفائض الحيّ (45) · حرّاسُ ملكية. `inv-consume.js` مصدرٌ واحد للنافذتين وشاشة المخزون.
- **(2) كميةُ الطلب و«🧾 جهّز الطلبية» (M170، v569):** `reorder_qty` · الاقتراحُ أصغرُ مضاعفٍ يرفع فوق الحدّ · واتساب/نسخ/طباعة/Excel · **الأسعارُ لا تذهب للمورّد** · `isLow` تعريفٌ واحد للصفحة واللوحة (كانتا مختلفتين).
- **(3) الجردُ الدوري (M171، v570):** `inventory_counts` + أسطرُها (السعرُ والعملةُ لحظةَ الجرد) · سببُ «count» · الفرقُ = المعدود − ما رآه العادّ والكميةُ = الحالية + الفرق (استهلاكٌ أثناء العدّ لا يُمحى) · ورقةٌ عمياء · تقريرُ فروقٍ لكل عملة.
- **(4) الموردون والطلبيات والاستلامُ الجزئي (M172، v571):** أربعةُ جداول · `inventory_create_order` / `inventory_receive` (لا فوق المطلوب بلا تأكيد · دفعةٌ بصلاحيتها) · «💸 سجّلها مصروف» يعبّي المصاريف ولا يحفظ، والربطُ بعد الحفظ مرةً واحدة لكل عملة.
- **(5) رقمُ الدفعة LOT (M173، v572):** الاستلامُ والشراءُ يحملانه · الخصمُ يأخذ الدفعةَ المختارة أولاً (منتقي «الدفعة (LOT)» بالنافذتين) · بطاقةُ المريض «🧪 المواد ورقم الدفعة» · «👥» مرضى الدفعة للاستدعاء + Excel.
- **(6) تبويب «🧪 المواد» بالتقارير (v573):** `mat-cost.js` دالّةٌ واحدة للمحاسبة والتقرير (#684) — حسب الصنف/الشهر/العلاج/الطبيب، ومطابقةُ المعادلة السابقة على 400 عيّنة.
- **(7) + الفحصُ الشامل (v574):** كشفُ المخزون Excel · عزلُ العيادات حيّاً (عيادةٌ ثانية لا ترى ولا تكتب شيئاً) · القراءةُ فقط تُرفض بكل RPC · مستشارُ الأمان نظيف لهذه الجولة · مراجعاتُ المتصفح الستّ معاً 219/219.
- **الإحكامُ بعد المراجعة النهائية (M174، v575):** حارسُ الدفعة يقفل الصنفَ عند النموّ فقط (لا دورةَ أقفال مع نسخةٍ قديمة) · تصفيرُ الدفعات المنتهية قبل M169 · `inventory_receive` يرفض الصنفَ المحذوف · تريغراتٌ بلا تنفيذٍ من anon · «👥 المرضى» بسجل الصنف وجلبُ الدفعة المنتهية بذاتها · تصفيحُ الطلبيات «عرض أقدم» · `.gitignore: _ra/`.
- **القواعد الجديدة:** #718–#726. **المثبتات الجديدة (6):** prove-inv-consume · prove-inv-order · prove-inv-count · prove-inv-po · prove-inv-trace · prove-mat-cost — البوابة **85 سطرَ حارس**.
- التفاصيلُ الكاملة: قسم «التاريخ الكامل» بآخر هذا الملف (كتلة 294).

## ⭐ الجولة السابقة — سياق 293 (30 أيلول → 2 تشرين الأول 2026): ملاحظاتُ Deep Code الـ21 (عرضُ إعادة بناءٍ بـ2,500$/16 أسبوعاً على Laravel+MySQL — قرارُ المالك: **لا إعادة بناء**، تُصلَح كلُّها على البنية الحالية بندًا بندًا بموافقته)
- **السجلُّ الحيّ:** `docs/DEEPCODE_REVIEW.md` (الـ21 بالتحقق الحيّ والتصنيف والحالة وسجلّ التقدّم) · تفاصيلُ كل إصدار: `CHANGELOG.md` (v550 → v567).
- **مشحون (15):** #2 الحساسيات لا تُعرض «لا يوجد» قبل وصولها + شريطُ تنبيهٍ طبي لاصق (v550) · #16 هيكلُ تحميل · #17 مسافةُ الزر العائم وتنحّيه بالتمرير · **#1 البطء** (v551–v557 + حارسُ ميزانية الأداء): القاعدةُ ليست السبب (زمنُ السيرفر 47ms من سوريا) بل **قراءاتٌ مستقلة تُنتظر واحدةً واحدة** — المواعيد 13 ⇒ 4 جولات · التقارير 17 ⇒ 5 (رسمٌ ~1.1ث بمحاكاة 400ms/طلب) · اللوحة 11 ⇒ 5 · القائمةُ الجانبية 6 ⇒ 1 بكل صفحة · المرضى 8 ⇒ 5 · المحاسبة 8 ⇒ 4–5؛ وأُزيل قصُّ 1000 صفّ الصامت بأرصدة اللوحة وقائمة المرضى (`.in(كل المرضى)` ⇒ قراءةٌ مصفّحة بنطاق الطبيب) · #5 تذييلُ القائمة يتبع الشخصَ الفعّال بعد «تبديل الموظف» (v556) · #11 تعريفٌ واحد لـ«مواعيد اليوم» `SyDentApptLive` (v558) · #3 نسبُ البطاقات بحدّ ±999% مع سبب (الإسنادُ فُحص حيّاً: 0/161 مخالفة) · #4 نصُّ «المراجع» · #13 صيغةُ هاتفٍ واحدة `SyDentPhone.tidy` عند كل حفظ + تلميحاتٌ لا تمنع (رقمٌ مشترك = عائلة · الاسم+الميلاد = تكرارٌ محتمل) (v559) · #19 **حقلُ تاريخٍ موحّد DD/MM/YYYY بكل جهاز** (`SyDentDateField` بـtheme.js — `value` يبقى YYYY-MM-DD لكل كود) (v560) · #10 التنبيهات (M166): لا تنبيهَ على أفعال المالك · القاعدةُ ٣ مرةً لكل مجموعة · أرشفةُ القديم · أولويةُ 🔴/🟡 — النشطُ 328 ⇒ 9 (v561) · #9 بطاقاتُ الهاتف (المحاسبة · الدفعات · المصاريف) · #20 نافذةُ علاج السن لا تغطّيه (لوحةٌ بالنصف المقابل / ورقةٌ أقصر) · #14 «منطقة الخطر» (v562) · #15 سقفُ الشارات 3 + «+N» على المواعيد واللوحة (`SyDentBadgeCap` — الطبيُّ والحساسية و«انتظار» لا تُطوى، بالنص لا ببادئة ⚠️) + بطاقةُ العلاج «مفضّل · تعديل · ⋯ المزيد» (v563–v565) · #8 إيصالُ شام كاش داخل طلب الاشتراك (M167، v566) + سياسةُ قراءة رقم الحساب للمستأجر (M168، v567).
- **مُغلق بقرار/تحقق:** #12 العلاجاتُ بسعر صفر طبيعية (لا تنبيه — المنافسون لا ينبّهون) · #18 جدولُ المخابر سليم حتى 1920 · #21 مركزُ التعلّم يُخفى من إعدادات الخطط.
- **المراجعةُ الشاملة (v567، بطلب المالك):** كلُّ البنود أُعيد فحصُها (18 صفحة × 1280 فاتح / 390 داكن: صفرُ خطأ صفحة/console وصفرُ تجاوز · القاعدةُ الحيّة · RLS التخزين كمستأجر) — نتيجتان أُصلحتا: رقمُ شام كاش ما كان مقروءاً للعيادة (M168) · شاشةُ فشل الشبكة ببطاقة المريض كانت تقول «قد يكون محذوفاً».
- **الباقي (قراراتُ منتج):** #7 بيئةُ اختبار منفصلة (مشروع Supabase ثانٍ — تكلفة) · #5 حسابُ دخولٍ لكل موظف · #6 التسجيل (تأكيدُ البريد **لا يصلح**: التسجيلُ بالهاتف وحده يولّد بريداً داخلياً لا يستقبل، وإدراجُ صفّ الطلب يحتاج جلسةً فورية — **لا تفعّله بلوحة Supabase**؛ البديل: رقمٌ نقابي إلزامي + عرضُه مع الفرع بطلب الموافقة) — **مؤجّل لآخر الجولة بقرار المالك**.
- **القواعد الجديدة:** #709–#717. **المثبتات الجديدة (15):** deepcode-b1 · perf-calendar · perf-reports · perf-dashboard · perf-shell · perf-lists · lock-footer · deepcode-g1 · phone-tidy · datefield · audit-alerts · deepcode-ui1 · appt-badges · shamcash-receipt + حارسُ `dom-smoke/perf-budget` (بمتصفح، 400ms/طلب) — البوابة **79 سطرَ حارس**.
- التفاصيلُ الكاملة: قسم «التاريخ الكامل» بآخر هذا الملف (كتلة 293) و`docs/DEEPCODE_REVIEW.md`.

## ⭐ جولةٌ أسبق — سياق 292 (30 أيلول 2026): بحثُ جولة المخزون والمواد المستهلكة مقابل Open Dental (Supply Inventory: Suppliers · Supplies · Orders) · أدوات المخزون المتخصصة (MedRestock) · الممارسة المعتمدة (نقطة طلب · كمية طلب · جرد دوري)
- **الحالة:** البحثُ والفحصُ الحيّ مُنجزان، **لا كود بعد** — القائمةُ المرتّبة تنتظر موافقة المالك على الترتيب (البرومت: `docs/NEXT_ROUND_PROMPT.md`).
- **الموجود:** `inventory.html` (أصنافٌ بكمية وحدّ طلب وسعرٍ بعملته وصلاحية · دفعاتٌ بصلاحية · نواقص · صلاحية · سجلُّ حركات) · `inventory_movements` (قيد `reason ∈ purchase/consume/adjust/return`) · `treatment_materials` مع نافذة تأكيد خصمٍ عند إنجاز الجلسة (البطاقة + المواعيد) · كلفةُ موادٍّ تقديرية بالمحاسبة.
- **العيوبُ المثبتة حيّاً:** الخصمُ قراءةٌ-ثم-كتابةٌ من المتصفح (سباقٌ بين شاشتين) · **الدفعاتُ لا تنقص بالاستهلاك** (صنفان كميتُهما ≠ مجموعُ دفعاتهما المفتوحة) · حركةُ الاستهلاك بلا جلسة/مريض/طبيب/دفعة · لا RPC للمخزون.
- **القائمة:** (1) خصمٌ ذرّي بالقاعدة مربوطٌ بالجلسة وFEFO على الدفعات · (2) كميةُ طلب + «جهّز الطلبية» · (3) الجردُ الدوري بالفروق · (4) الموردون وطلبياتُ الشراء والاستلام الجزئي · (5) رقمُ الدفعة وتتبّعُه للمريض · (6) تبويبُ «🧪 المواد» بالتقارير (بدالّة كلفة المحاسبة — #684) · (7) Excel/طباعة. **مستبعد:** التصنيفات/الموقع · سجلُّ المعدّات · الباركود وربطُ المتاجر.
- التفاصيلُ الكاملة: قسم «التاريخ الكامل» بآخر هذا الملف (كتلة 292). **نُفّذت بسياق 294.**

## (أ) الحالةُ الحيّة
- `main` = `release` = **`e3fe679`** بعد إحكام جولة المخزون (فوقه كومِتُ هذا التوثيق) · SW **v575** · توكن الفليت **`20261002i`** · آخر Migration **174** (التالي 175؛ M173 طُبّقت على دفعتين 173 + 173b — الملفُّ بالشكل النهائي). **تحقّق من HEAD الفعلي** — جلساتٌ موازية قد تدفع.
- الحُرّاس **85 سطراً** بـ`validate.sh` · `validate.sh` كلُّه أخضر (~9 دقائق ⇒ `setsid` واستطلاع — #681؛ **لا تضع `pkill -f validate.sh` بنفس أمر الإطلاق**: يقتل صدفةُ الأداة نفسها). محلياً `npm i --no-save acorn acorn-walk`.
- الخطُّ مستضافٌ ذاتياً بـ`/fonts` (v493) — لا Google Fonts بالإنتاج.
- **رمز GitHub (`sydent-claude`):** القيمةُ بنسخة معرفة المشروع فقط (#654) — لا تُكتب بالريبو ولا تُطبع. **لا يملك صلاحية Actions** (نقطة #144). استخرجه بـ`grep -o 'github_pat_[A-Za-z0-9_]*' … | grep -v '^github_pat_$'` (السطرُ الأول قد يكون ذكراً نصّياً للبادئة وحدها).

## (ب) ما تبقّى مفتوحاً
- **ملاحظاتُ Deep Code (الجولةُ التالية المقترحة — `docs/NEXT_ROUND_PROMPT.md`):** 18 من 21 مشحونة/مُغلقة (`docs/DEEPCODE_REVIEW.md`). **الباقي قراراتُ منتج بترتيب المالك:** #7 بيئةُ اختبار منفصلة · #5 حسابُ دخولٍ لكل موظف · **#6 التسجيل آخراً** (تأكيدُ البريد يكسر التسجيلَ بالهاتف — البديلُ رقمٌ نقابي إلزامي يُعرض بطلب الموافقة). **على المالك:** رقمُ حساب شام كاش بلوحة الأدمن ← الإعدادات ← «تعليمات الدفع» (فارغٌ ⇒ لا يُعرض) · صورةُ الخطأ الإملائي «الثة» (#19 — لم يُستنسخ بالكود ولا بالقاعدة).
- **E2E:** فشلٌ متقطّع مرةً على v559 (`00a3960`) ونجح الكودُ نفسُه بإعادة التشغيل (كومِتٌ فارغ) — سجلّاتُ Actions غيرُ مقروءة من المختبر (blob محجوب) والتوكن بلا صلاحية إعادة تشغيل.
- **إقفالُ دولار 30/9** محفوظٌ بلقطة «متوقَّع −150 · معدود 0 · زيادة 150» من قبل تعديل مصدر الراتب — **المالك يعيد الإقفال** («تعديل الإقفال» ⇒ 0 ⇒ مطابق)؛ الكشفُ الحيّ صحيح (0$). بندا الرصيد الافتتاحي والإيداع بالدرج **لم يُبنَيا** (المالك: يكفي).
- **قصُّ 1000 صفّ — أُغلق بـv548** (جالبٌ مشترك + جردٌ آلي بالبوابة).
- **جولةُ المخزون مغلقةٌ بالسبعة + إحكام (سياق 294، حتى v575).** ما بقي منها: **على المالك** — أصنافُك الحالية بلا «كمية طلب» ⇒ اقتراحُ الطلبية فارغٌ حتى تُعبّأ (نموذج الصنف) · **تجربةُ آيفون حقيقي** للطباعة من Safari (الطلبية · ورقة الجرد · طلبية الشراء) والواتساب وتعبئة المصروف — تحقّقتُ بالمحاكاة لا بجهاز · **ملاحظةُ ترتيب:** دفعةٌ مرقّمةٌ بلا صلاحية تُخصم بالمرحلة الأولى قبل الرصيد بلا دفعة — منتقي LOT يحسمها للزرعات · مستبعدٌ بقرار: التصنيفات/الموقع · سجلُّ المعدّات · الباركود وربطُ المتاجر · الطلبُ الآلي وكتالوجُ المورّد.
- **تجربةُ الآيفون الحقيقي** لتبويبات التقارير (الشبكة · الطباعة/PDF من Safari · النسخ للواتساب) و«مين حوّل المريض» — تحقّقتُ بالمحاكاة لا بجهاز.
- **بياناتُ المصدر:** 24 من 32 مريضاً بلا «كيف سمع عنّا؟» ⇒ «غير محدد» كبيرٌ بتبويب الجدد؛ و21 موعداً ماضياً بلا نتيجة مسجّلة ⇒ خارج نسب الحضور.
- **المتوقّعُ الحيّ لأيلول (SQL مستقل، للمطابقة بالواجهة):** إنتاج 101,998 ل.س + 990 $ · مريضٌ جديد واحد · 12 نشطاً · حضور 10/10 منتهية (3 اليوم · 4 بلا نتيجة).
- ما بقي من سياق 290: تجربةُ الآيفون لبنود المخابر · مرفقاتُ المخبر مع الواتساب · بياناتُ «أنس» · E2E المتقطّع (#144) · وما بقي من 289 (انظر الملاحق بالتاريخ).

## (ج) أهمّ ما يجب تذكّره (خلاصة القواعد الحاكمة)
- **الريبو هو المرجع** — تحقّق من HEAD أول كل جلسة (#19) واسحب قبل أي رفع؛ الجلسات المتوازية تدفع على نفس الريبو (#663).
- **الحُرّاس كلهم خضر** قبل وبعد كل commit · **مثبتٌ مستقل** لكل ميزة بتكافؤ بايت، على ثابتٍ ذاتي لا لقطة (#671)، ويُشغَّل **قبل** الدفع.
- **المال مقدّس:** `plan_option` · `phase` · `units` عرضيّون بحت — لا يدخلون FIFO/computeFinancials.
- **تسلسل الشحن:** ميزة ← كسر فليت (`scripts/cache-bust.sh`) بكومِت مستقل ← إصدار (SW + CHANGELOG) ← push ← `release` = `main`.
- **الهجرات تُطبَّق فوراً على القاعدة الحيّة** بلا عرض SQL على المالك، مع ملفها بالريبو وتحقّقٍ بعدها.
- **أي قرار ميزة/تصميم: المنافسون أولاً** (Open Dental · Dentrix · Dentrix Ascend · Curve · Denticon) ثم توصيةٌ واحدة.
- **لا مفاتيح من الذاكرة** — اقرأها من مصدرها وقارنها بالمثبت (درس v426).
- **الأصول تُستضاف مع الواجهة** (#670) · **المثبت البكسلي هرميّ** (#669).
- **كلُّ كتابةٍ على `appointments` مصنّفةٌ بجرد المثبت** (#673) · **الإنشاءُ الدفعي بفحصٍ مسبق واحد** (#678) · **شخّص من البيانات الحيّة قبل الكود** (#679).
- **لا معادلةَ ماليةً ثانية:** أيُّ عرضٍ مالي جديد (شهرٌ · يومٌ · طبقة) يُحسب بالدوالّ القائمة بتبديل السياق، والمثبتُ يقارن بالحساب المباشر (#684) · **طرقُ الدفع من `pay-methods.js` وحده** والقيودُ بالقاعدة تطابقه (#685) · **كلُّ صفحةٍ تحمل مرساةً لزرّ الدور** (#686).
- **البطاقاتُ الثانوية لا تؤخّر الرئيسية** (#687) · **إعداداتُ الصفحة تُحمَّل قبل مستهلكيها** (#688) · **الرقمُ الجزئي يُعلَن** (#689) · **الروابطُ العميقة تعبّئ ولا تحفظ** (#690) · **قوائمُ `.in()` بمقاطع 150 والاقتراحُ يفشل بأمان** (#691) · **حارسُ المتصفح: `wait_for_timeout` لا `time.sleep`** (#692).
- **كلُّ تحديثٍ لملف السياق يُسلَّم بنسختين تلقائياً:** الريبو بلا توكن · ومعرفةُ المشروع بالتوكن الفعلي (يرفعها المالك) — مع تحقّق clone (#683).
- **ثابتُ المرساة المالية يُفرض بالقاعدة** (تريغر) كي تصونه النسخُ المخزّنة القديمة (#693) · **كلُّ عمود ربطٍ لجدولٍ مملوك يحتاج حارسَ ملكية** — فحصُ FK لا يمرّ بـRLS (#694) · **القرارُ التخطيطي بعرض الحاوية** مع الشريط الجانبي (#695) · **مصدرٌ ناقص يدلّ على مكان إعداده** برابطٍ عميق (#696) · **تعديلٌ عام بـ`theme.css` يُتبع بمسحٍ منصّي** لكل النوافذ (#697) · **حوارٌ ينتظر المستخدم لا يُستدعى بـ`page.evaluate` المنتظِر** (#698).
- **كلُّ قراءة نافذةٍ زمنية مصفّحة** (`order('id').range` بصفحات 1000) والفشلُ مُعلَن — «السنة» و«كل الفترات» كلُّ التاريخ عملياً (#699) · **شريطُ تنقّلٍ لا يُخفي عناصره بتمريرٍ أفقي بلا إشارة**، والمراجعةُ تقيس «ظاهرٌ كاملاً» لا «قابلٌ للنقر» (#700) · **تبويبُ تقريرٍ يقسّم جلسات المحرّك القائم** والمجاميعُ المشتركة تُستخرج لدالّة واحدة (`clinicTotals`) (#701) · **تعريفٌ واحد لكل مفهوم عبر التبويبات** (`pickNew` · `isVisit`) (#702) · **المقارنة:** نسبةٌ للأعداد، نقاطٌ للنسب، العملةُ الموجودة بالطرفين، السيّئُ الصاعد أحمر، الغائبُ «—» (#703) · **كلُّ نسبةٍ وسهمٍ بنصٍّ عربي معزولٌ LTR** (`<bdi dir=ltr>`) (#704) · **التبويبُ الثانوي يُحمَّل كسولاً بحارس تسلسل** (#705) · **كلُّ قراءةٍ جماعية تمرّ بـ`window.SyDentFetchAll`** أو تُسجَّل بقائمة استثناءٍ مسبَّبة بـ`prove-fetchall` (#706). · **«نقداً» شكلٌ لا حساب:** مصدرُ النقد عمودٌ منفصل (`cash_source`) يدخل معادلةَ الدرج وحدها، والإقفالُ لقطةٌ لا تتحدّث تلقائياً (#707) · **جلسةٌ موازية دفعت أثناء العمل ⇒ اسحب وادمج وأعد تشغيل البوابة كاملةً، ورقمُ الإصدار والتوكن التاليان بعد الدمج لا قبله** (#708)

- **سياق 294:** حركاتُ المخزون عبر RPC ذرّي والثابتُ بتريغرين (#718) · رتبةُ ORDER BY تُحدَّث مع الأعمدة (#719) · جدولٌ مملوك = RLS + `_sub_guard_table` + حارسُ ملكية بنفس الهجرة (#720) · رابطُ المال العميق: المبلغُ من القاعدة والربطُ بعد الحفظ مرةً واحدة (#721) · نقلُ حسابٍ مالي لملفٍّ مشترك بمرجعٍ للمعادلة السابقة (#722) · ورقةُ المورّد بلا أسعار والطباعةُ متزامنة (#723) · الأشهرُ رقمية (#724) · مخلّفاتُ البوابة `_ra/` لا تُكومَت (#725) · بوابةٌ مقطوعة ليست نتيجة (#726).
- **سياق 293:** البطءُ يُقاس بجولاتٍ وتتبّعِ مُطلِق قبل إصلاحه، والجلبُ المبكر يُستهلك بموضعه (#709–#711) · المراقبُ لا يُطلق نفسه والمرافقُ مستثنى (#712–#713) · شاراتُ السلامة بنصّها (#714) · مفتاحُ إعدادٍ للمستأجر = توسيعُ سياسته بالهجرة نفسها ويُفحص كدور authenticated (#715) · فشلُ الشبكة ليس «غير موجود» (#716) · التنبيهاتُ إشارةٌ والتنظيفُ أرشفة (#717).

## 🚀 افتتاح المحادثة القادمة
```
مرحباً د. أيهم 👋
آخر توثيق: سياق 294 (3 تشرين الأول 2026 — جولةُ المخزون والمواد المستهلكة مغلقةٌ بالسبعة وإحكامُها حتى v575 · M174). اقرأ رأس docs/SyDent_Context_new_md_294.md (ملفٌّ واحد شامل) — والتاريخ الكامل بآخره يُبحث فيه بـgrep عند الحاجة.
تحقق من HEAD الفعلي أول كل جلسة (#19) واسحب قبل رفع أي نسخة (#663).
التالي بقرار المالك: باقي Deep Code — #7 بيئةُ الاختبار · #5 حسابُ كل موظف · #6 التسجيل آخراً (docs/DEEPCODE_REVIEW.md · البرومت: docs/NEXT_ROUND_PROMPT.md).
```

## 📐 القواعد — مجمّعة ومرتّبة (#1–#726)
> مصدرُها كلُّ تعريفاتها بملف السياق حتى كتلة 285؛ حين تكرّر تعريفُ قاعدة أُخذ **الأتمّ** (الأطول). قواعدُ عُرِّفت داخل فقراتٍ مشتركة أو داخل ترويسات جلسات مُدرجةٌ بقسمين تاليين بنصّها. النصّ الكامل بسياقه بالأرشيف.

- **#1 توحيد التسمية**: computeAccountState().label للمدفوع تحوّل من اسم الخطة (سنوي/شهري) → كلمة الحالة «نشط» (label عرض فقط، لا منطق يعتمد عليه). شارات الخطة في قائمة العملاء، أزرار واتساب-تجديد (القائمة+رأس 360)، تلميح منتقي الخطة، «الخطة» في نظرة 360 العامة — كلها planDisplayName؛ «الحالة» في 360 تعرض كلمة الحالة الفعلية. أُصلح «سنوي سنوي» المكرّر.
- **F1**: التجديد يحفظ الأيام المتبقّية (حدث renew، لا convert يصفّر).
- **F3**: حارس سباق الموافقة (إعادة فحص pending).

#### قاعدة #2 — Graceful Fallback Pattern
كل feature يضيف column/constraint جديد، يجب أن يحتوي fallback:
```js
function _isMigrationMissing(err) {
  if (!err) return false;
  var msg = (err.message || '') + ' ' + (err.code || '');
  return /relation .* does not exist|42P01|PGRST205|42703|23514/i.test(msg);
}
```

#### قاعدة #3 — جدول `treatments` خصوصيات تاريخية
| النقطة | في `treatments` | في باقي الجداول |
|---|---|---|
| Ownership | `owner_id` | `doctor_id` |
| اللون | `fill` | `color` |
| ID في JS | string (`TREATMENTS[].id`) | UUID مباشرة |
| UUID في JS | `TREATMENTS[].dbId` | الـ id |

- **#4**: منطق العلاقة متّسق طبيب↔أدمن (من السعر؛ سعر متساوٍ = «تغيير»). الطابور: «الخطة الحالية: X / المطلوبة: Y» (لا سهم اتجاه ملتبس في RTL)؛ تأكيد «من خطة X إلى خطة Y».

#### قاعدة #5 — PostgREST `upsert` Semantics
- INSERT: missing cols → DB defaults
- UPDATE: missing cols → **unchanged** (آمنة لـ wide tables مثل `clinic_settings`)

#### قاعدة #6 — Multi-Tenant Ownership

| Legacy (`doctor_id`) | Multi-Tenant (`owner_id`) |
|---|---|
| patients, appointments, ledger_sessions, ledger_payments, teeth_status, treatment_price_history, lab_orders, labs, treatments, doctors, trial_requests, operatories, appointment_types, payment_splits | clinic_doctors, clinic_employees, audit_log, clinic_settings, reminder_logs, treatment_bundles, provider_payouts, expense_categories, expenses |

**ملاحظة مهمة (v35 derived from Phase 7.6B):**
```
patients.doctor_id     = owner's auth.users.id  (NOT owner_id — historical)
appointments.doctor_id = owner's auth.users.id
clinic_employees.owner_id = owner's auth.users.id
```
الـ owner's `doctors.id` متطابق مع `auth.users.id` (Phase 1 canonical design).

#### قاعدة #7 — Client-side aggregation > DB views
لا migration إذا البيانات موجودة في الـ state.

#### قاعدة #8 — Inline over imports
**استثناء:** `supabase-init.js` و `sidebar.js` shared infrastructure.

#### قاعدة #9 — Loaded fields = Rendered fields
SELECT يجب أن يشمل كل الحقول التي يقرأها الـ render.

#### قاعدة #10 — Filter chips Gmail-style
Single-select with all-reset, لا toggle.

#### قاعدة #11 — Single Source of Truth للـ UI Actions
Actions في سياق واحد، Results في كل السياقات.
- PIN management = employees.html فقط
- Doctor add/edit/delete = employees.html فقط
- doctors.html = read-mostly view + "اربط كمزوّد افتراضي" فقط
- **Phase 7.3:** clinic_employees = canonical لكل HR fields
- **Phase 7.4:** has_system_access في clinic_employees = canonical للـ login eligibility
- **Phase 7.5:** accounting.html = read-only aggregator (لا writes)
- **v34:** admin.html = platform-level (لا SyDentLock، لا sidebar، لا tenant assumptions)
- **Phase 7.6A:** edit name/phone/email/city/notes = admin.html only (لا tenant pages)
- **Phase 7.6B:** activity metrics = admin.html only (uses SERVICE_KEY bypass)
- **Phase 7.6C:** trial expire alerts + adjust + TSV export + WhatsApp reminder = admin.html only
- **Phase 7.6D:** auth.users banned_until lifecycle = admin.html only

#### قاعدة #12 — Feature reversibility
كل feature قابل للـ revert نظيف.

#### قاعدة #13 — Feature completion = live test
الـ helper الموجود ≠ يعمل. الـ audit ≠ live test.

#### قاعدة #14 — Cross-file XSS sweep
بعد escapeHtml fix، افحص كل ملف.

#### قاعدة #15 — Soft-mode bootstrapping
كل gating feature تبدأ معطّلة افتراضياً + graceful fallback لو Migration لم يُشغَّل بعد.

#### قاعدة #16 — Privacy-critical UI = defense-in-depth (3+ layers)
**v34 update:** Platform/Tenant separation أيضاً defense-in-depth — index.html admin redirect + supabase-init.js defensive autoInit redirect (يغطي كل tenant pages عبر bookmarks/deep links).

#### قاعدة #17 — Broader mutation sweep
```bash
grep -nE "from\(.*\)\.(insert|update|upsert|delete)"
```

#### قاعدة #18 — Feature simplification through unification

#### قاعدة #19 — Live test = الحَكم النهائي
**أقوى قاعدة لـ runtime concerns.** Audit يحمي من syntax errors، لكن **لا يحمي من script load ordering، DOM timing، browser APIs، أو state assumptions الخاطئة في environment لم يُختبر**.

#### قاعدة #20 — Removal > Architecture
Failed feature × 3+ attempts = **اسأل "هل ضرورية؟"** قبل architecting.

#### قاعدة #21 — Cache-bust on inline-JS changes
- Cache-Control + Pragma meta tags في الـ head
- Hard refresh (Ctrl+Shift+R) أول مرة بعد deploy
- تغيير الـ `?v=` parameter يجبر revalidation للـ HTML
- **Versions chronological:**
  - `20260522a03` (v34 baseline)
  - `20260522a04` (Phase 7.6B counter widget bugfix)
  - `20260522a05` (Phase 7.6C-Step1 alerts banner)
  - `20260522a06` (Phase 7.6C-S1.1 trial adjust)
  - `20260522a07` (Phase 7.6C-Step2 CSV export — sep=, attempt)
  - `20260522a08` (Phase 7.6C-Step2 locale fix — same approach)
  - `20260522a09` (Phase 7.6C-Step2 TSV switch — final)
  - `20260522a10` (Phase 7.6C-Step3 WhatsApp reminder)
  - `20260522a11` (Phase 7.6D auth.users ban persistence) ⭐ v36
  - `20260523a14` (Phase 7.6F uniform 17 pages) ⭐ v38
  - `20260523a15` (Phase 7.6F-fix banner) ⭐ v39
  - `20260523a17` (Phase X1) ⭐ v40
  - `20260523a20` (Phase X2 + X2.1) ⭐ v41
  - `20260523a23` (Phase X3 محادثة 1) ⭐ v42
  - `20260523a28` (Phase X3.2 + X4 + X5) ⭐ v43

#### قاعدة #22 — Programmatic vs user-initiated DOM events
`sel.value = x` لا يطلق `change` event.

#### قاعدة #23 — Foundation columns vs flat booleans
عمودين منفصلين يفصلون "ماذا" عن "كيف" بدل ALTER لكل feature لاحقة.

#### قاعدة #24 — New page boilerplate checklist (11 بنود)
1. `<div class="main" id="sbMainContent">`
2. `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` في `<head>` **أولاً**
3. `<script src="supabase-init.js?v=YYYYMMDD"></script>` في `<head>` **بعد CDN**
4. `<script src="sidebar.js?v=YYYYMMDD"></script>` في `<head>` **بعد init**
5. `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` لا تكرّره في body
6. `initSidebar('pageId')` **في بداية init()** قبل auth check
7. Page guard `SyDentLock.guardPage(['owner'])` لو owner-only
8. تسجيل الصفحة في `sidebar.js` navItems
9. تحديث BLOCKED maps للأدوار اللي ما تستحقها
10. cache-bust meta tags في head لو inline JS كثيرة
11. **Run the Script Order Validator** قبل الـ commit للتأكد من CDN→init→sidebar في head

#### قاعدة #25 — Architectural reviews trump Phase decisions

**#26 — البطاقة الموحّدة تقرأ `adj.refundsTotal` من كل طبقة.** أيُّ تغييرٍ مستقبليّ ببنية الكائن الذي تُرجعه `computeLayersByCurrency` (إعادةُ تسميةِ حقلٍ · نقلُ التسويات · إضافةُ نوعِ تسويةٍ نقديّ ثالث) يجب أن يمرّ على `renderUnifiedReportCard` — وإلا عاد الطرحُ لا يصحّ بصمت. والبطاقةُ تقرأ **ثلاثةَ حقولٍ إضافية** (`summary.revenue` · `totals.totalExpenses` · `netProfit`) بنفس الاعتماد.

#### قاعدة #27 — TIMESTAMPTZ filtering needs timezone-safe pattern
Columns بنوع TIMESTAMPTZ (`paid_at`, `date_sent`) **لا تُفلتر** مباشرة بـ `gte/lte` على date strings.

**الحل المعياري (Phase 7.5):**
```js
function widenStartUtc(isoDay) {
  var d = new Date(isoDay + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}
function widenEndUtc(isoDay) {
  var d = new Date(isoDay + 'T23:59:59.999Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
function inLocalRange(timestamptz, from, to) {
  if (!timestamptz) return false;
  var d = new Date(timestamptz);
  if (isNaN(d.getTime())) return false;
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  var localDay = y + '-' + m + '-' + day;
  return localDay >= from && localDay <= to;
}
// Usage:
.gte('paid_at', widenStartUtc(from))
.lte('paid_at', widenEndUtc(to))
// then: rows.filter(r => inLocalRange(r.paid_at, from, to))
```

DATE columns (مثل `ledger_sessions.date`, `expenses.date`) **لا تحتاج** هذا.

#### قاعدة #28 — Script load order is a runtime concern (Phase 7.5)
**Supabase CDN MUST load BEFORE supabase-init.js.** الـ JS validator يفحص syntax فقط، **لا runtime ordering**. الـ HTML balance يفحص tags، **لا script execution order**.

**النمط الصحيح (مطلوب في كل صفحة):**
```html
<head>
  ...
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="supabase-init.js?v=YYYYMMDD"></script>
  <script src="sidebar.js?v=YYYYMMDD"></script>
</head>
```

**v34:** تم توحيد كل الـ 17 صفحة على هذا النمط في commit `e00ebf4`.

#### قاعدة #29 — Defense-in-depth for irreversible browser/UI actions (v35)

For event handlers that toggle state or trigger actions, use BOTH:
1. **Event-source check** (e.g. `if (e.target.id === 'closeBtn') return;`)
2. **`stopPropagation()`** in the inner handler

Either alone prevents the double-toggle bug; both together survive partial refactors.

**Phase 7.6C-Step1:** الـ alerts banner uses this pattern — clicking banner toggles filter, but clicking the ✕ button inside should ONLY close, never re-toggle.

#### قاعدة #30 — Always redact PAT in shell outputs (v35)

Every git command that may print the PAT (clone, push, fetch) MUST pipe through:
```bash
2>&1 | sed 's/github_pat_[A-Za-z0-9_]*/[PAT_HIDDEN]/g'
```

The PAT is a secret. Visible in tool output = visible to anyone reading the conversation. The redaction is cheap and never wrong.

#### قاعدة #31 — Live data simulation in audits (v35)

Synthetic test inputs lurk past formatting bugs that real data trips on. Every audit pass for text-generating code MUST include a simulation with at least one row pulled from live data.

**Phase 7.6C-Step3 was the proof:** 20 rounds with synthetic names like 'أحمد' looked fine. Re-audit round 34 replayed the 4 real tenant names ('د شذ المار', 'د مجد شاكر', 'د احمد غنيم', 'د ايهم غنيم') from the Notepad screenshot and immediately surfaced the doubled "د. د." honorific bug. Synthetic-only audits are not sufficient.

#### قاعدة #32 — Locale-specific spreadsheet exports prefer TSV (v35)

CSV semantics are locale-dependent:
- US English: comma separator
- German / French / Italian / Spanish / Arabic: semicolon separator
- Microsoft Excel's `sep=,` directive is honored by Excel but NOT by WPS Office Free
- Result: a CSV that works in one locale breaks in another

**Solution:** export TSV (tab-separated). Tab characters have NO locale ambiguity — every spreadsheet app on every locale interprets them as column separators. Cost: in-cell tabs/newlines must be sanitized to spaces (TSV has no quoting), which is acceptable for tenant data.

Implementation pattern (Phase 7.6C-Step2 final form):
```js
function tsvCell(v) {
  if (v == null) return '';
  return String(v).replace(/[\t\r\n]+/g, ' ');
}
// ...
var blob = new Blob(['\uFEFF' + tsvText],
  { type: 'text/tab-separated-values;charset=utf-8;' });
```

File extension stays `.csv` because users associate it with "spreadsheet" — every modern spreadsheet auto-detects tabs.

#### قاعدة #33 — Multi-store DB mutations need explicit sync ⭐ v36

**The principle:** When a logical state is encoded in TWO independent stores, every mutation MUST write to BOTH explicitly. Never assume one store will "catch up" or that the other store will be ignored.

**Phase 7.6D was the proof:** Account lifecycle state lived in two places:
- `trial_requests.status` ('new' / 'accepted' / 'rejected')
- `auth.users.banned_until` (NULL / timestamp)

Three of four lifecycle functions wrote ONLY to `trial_requests`, leaving `banned_until` stale. Result for د. مجد شاكر:
1. Suspend → trial_requests.status='rejected' ✓ + auth.users.banned_until=+100y ✓
2. Activate Permanent → trial_requests.trial_end=NULL ✓ but `banned_until` stayed +100y 🚨
3. UI showed "مقبول" (accepted) but tenant could not log in ("User is banned")
4. The visible state contradicted the auth state.

**The fix pattern:**
```js
// Two graceful helpers, both no-op on failure (don't throw):
async function unbanUserIfBanned(uid) {
  // PUT /auth/v1/admin/users/{uid} with ban_duration='none'
}
async function banUserPermanently(uid) {
  // PUT /auth/v1/admin/users/{uid} with ban_duration='876600h'
}
```

// Every lifecycle function writes BOTH stores:
async function activatePermanent(r) {
  await window.sb.from('trial_requests')
    .update({ trial_end: null, status: 'accepted' }).eq('id', r.id);
  await unbanUserIfBanned(r.user_id);  // ← critical
}
```
```

**State matrix discipline (Phase 7.6D):** Every lifecycle function has a transition matrix in its comment header showing input/output state for BOTH stores.

**Why this rule exists separately from rule #11:** Sometimes you can't unify stores — `auth.users` is owned by Supabase Auth, `trial_requests` is our app table. They MUST stay in sync because they encode the same logical state.

#### قاعدة #34 — Platform layer = enterprise mindset, tenant layer = simple ⭐ v37

| Layer | Philosophy |
|---|---|
| **Tenant** (per-clinic) | KISS, MVP-acceptable shortcuts, OpenDental parity, simplicity |
| **Platform** (admin) | Enterprise SaaS, Stripe/Microsoft-grade patterns, no MVP shortcuts |

**For every admin.html / platform feature:**
1. Search competitors: Stripe (subscription lifecycle), Microsoft Partner Center (subscription states), Dentrix Ascend / CareStack (dental SaaS admin), ChartMogul (SaaS metrics)
2. Build for: subscription tiers, billing history, audit trail, customer health, churn signals, MRR/ARR tracking
3. Schema must be future-proof: events table, currency-aware, multi-tier features (JSONB), admin-editable pricing
4. Avoid: hardcoded values that should live in DB tables (prices, durations, feature limits)

**Examples of enterprise patterns adopted (Phase 7.6E-Part 1):**
- ✓ `subscription_events` immutable log → basis for MRR/churn (Stripe pattern)
- ✓ `subscription_plans` admin-editable table → no code deploy to change prices
- ✓ `currency` column from day one → multi-currency-ready
- ✓ `features` JSONB → tier-based feature gating without migrations
- ✓ `max_employees`/`max_patients` limits → soft entitlement enforcement
- ✓ `performed_by` audit field → accountability trail
- ✓ Grace period concept → industry-standard dunning UX (Microsoft 30d, Stripe 23h, SyDent 14d)

**Origin:** د. أيهم directive in Phase 7.6E planning conversation.

#### قاعدة #35 — Self-signup is the canonical SaaS pattern ⭐ v38

**The principle:** When a trader requests access to a SaaS platform, they must create their own auth account with their own password. The platform/admin **NEVER** auto-creates accounts with hardcoded passwords, even as a convenience.

**Why this rule exists:**

Phase 7.6F audit revealed `admin.html accept()` was calling `POST /auth/v1/admin/users` with `password='0000'` for every approved trial. This meant:
1. **Every trader's account had a guessable default password** until they changed it (most never did)
2. **The trader couldn't log in** without admin telling them the password verbally
3. **A single leaked admin source file** exposed every active account
4. The convenience of "admin creates the user" hid this entire class of risk

**The fix (Phase 7.6F pattern):**

- `landing.html` → marketing only. CTAs link to `auth.html?tab=register`.
- `auth.html` → trader self-signs-up with email OR phone + password they choose.
- `auth.html` creates **both** `auth.users` AND `trial_requests` (with `user_id` link).
- `admin.html accept()` → just flips `trial_requests.status` from 'new' to 'accepted'. No POST /admin/users. No password handling. No security exposure.

**When the admin needs to create an account (rare, e.g. white-glove onboarding):**

The admin should use Supabase's password reset link feature — generate a setup magic link, send it to the trader via WhatsApp, let the trader set their own password. **The admin never sets a password value.**

#### قاعدة #36 — Promote to Admin = حساب دائم حصراً ⭐ v40

زر "👑 ترقية إلى Admin" يظهر فقط للحسابات `accepted` + `trial_end IS NULL` (دائم). الحسابات الـ trial أو الـ monthly/yearly لا يمكن ترقيتها — لأن Admin platform-level role، يجب أن يكون مستقراً.

#### قاعدة #37 — Plans editable من UI = Stripe/MS pattern ⭐ v41

prices, durations, feature limits لا تكون hardcoded في الكود. تُحفظ في `subscription_plans` table وتُعدَّل من admin UI. تغيير السعر = SQL update، لا code deploy.

#### قاعدة #38 — Templates editable مع variables = Courier pattern ⭐ v42

نصوص الـ notifications (WhatsApp/SMS/email) قابلة للتعديل من admin UI بدون code deploy. `{name}`, `{days_left}`, `{trial_end}`, `{plan_name}`, `{price}` — substitution patterns.

#### قاعدة #39 — Self-lockout protection: count(admins) > 1 ⭐ v40

كل destructive action على admin role (demote, delete, suspend) لازم تتحقق من `count(admins) > 1` قبل التنفيذ. الـ guard على **كل path**، ليس على demote فقط.

#### قاعدة #40 — Snapshot prices في trial_requests.price_paid ⭐ v41

عند accept/renew/convert، السعر الحالي يُنسخ من `subscription_plans.price` إلى `trial_requests.price_paid`. لو admin غيّر السعر لاحقاً، الـ snapshot القديم يبقى للـ audit/MRR.

#### قاعدة #41 — Tenant-side reads must follow admin-side writes ⭐ v39/v41

كل عمود يُعدَّل admin-side يجب يُراجَع tenant-side. مثال: `trial_requests.plan` اضيفت في Migration 23 (admin-side), لكن `index.html` (tenant-side) كان لسه يقرأ `trial_end` فقط بدون فحص `plan` → Phase 7.6F-fix.

#### قاعدة #42 — RLS subquery على نفس table = infinite recursion ⭐ v40

أي RLS policy على table A تعمل `EXISTS (SELECT FROM A WHERE ...)` على A نفسها = infinite recursion → HTTP 500 على كل قراءة. الحلّ الدائم: `SECURITY DEFINER` function تتجاوز RLS داخل الـ lookup.

```sql
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM doctors WHERE id = auth.uid()),
    false
  );
$$;
```

-- RLS policy:
CREATE POLICY p_xxx_admin_write ON xxx FOR ALL TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));
```
```

الـ `SELECT` wrapper مهم للـ initPlan caching (Supabase RLS best practices).

#### قاعدة #43 — NOT NULL constraints على legacy tables ⭐ v40

كل column NOT NULL على table قديمة لازم نتحقّق منها قبل أي UPSERT جديد. تضمين كل required columns + defensive guard لو القيمة فاضية.

**مثال (Phase X1 hotfix):** `doctors.email` NOT NULL — لكن UPSERT بدون email يفشل بـ `null value in column "email" violates not-null constraint`. الحل: تضمين `email: r.email` في كل UPSERT.

#### قاعدة #44 — Last-admin guard على كل destructive path ⭐ v40

ليس فقط demote_from_admin — كذلك delete + suspend. كل path يزيل admin (أو يمنع الـ login) لازم يتحقق من `count(admins) > 1` قبل التنفيذ.

#### قاعدة #45 — Optimistic concurrency على destructive UPDATE ⭐ v41

قبل UPDATE على table critical (subscription_plans، notification_templates)، re-fetch `updated_at` live + قارنه بـ snapshot. لو drift → alert + reload + abort. لو الـ check نفسه فشل (network) → proceed (لا blocking).

```js
async function savePlanEdits() {
  // 1. Re-fetch updated_at live
  var live = await window.sb.from('subscription_plans')
    .select('updated_at').eq('code', code).maybeSingle();
  // 2. Compare
  if (live.data && live.data.updated_at !== planEditorState.original.updated_at) {
    alert('تم تعديل من جلسة أخرى. تم تحميل النسخة الجديدة.');
    await loadPlanConfig();
    revertPlanEdits(true);
    return;
  }
  // 3. Safe to write
  await window.sb.from('subscription_plans').update({...}).eq('code', code);
}
```

Pattern مأخوذ من Stripe/ChargeBee. **آمن لأن audit log يحفظ كل version → recoverable.**

#### قاعدة #46 — RLS public catalog tables لازم TO anon ⭐ v41

`subscription_plans` هو public pricing catalog — لا توجد بيانات حسّاسة. RLS read policy لازم تكون `TO anon, authenticated` بـ `USING (true)`. Writes تبقى مقيّدة بـ `is_platform_admin()`.

**لا تخلط** بين tenant data (مقيّدة بـ owner_id) و public catalog data (مفتوحة للقراءة).

**استثناء:** `notification_templates` ليست public catalog — admin-only access (لا anon read).

#### قاعدة #47 — Features arrays نصّية يدوية، savings dynamic ⭐ v41

features arrays في `subscription_plans` يحرّرها admin يدوياً (marketing control). savings/discount badges تُحسب dynamically من الأسعار. **لا auto-sync** — admin قد يريد رقم تسويقي مختلف ("خصم 40%" بدل الحقيقي 38%).

#### قاعدة #48 — Migrations صغيرة متتالية ⭐ v41

بدل migration واحدة كبيرة (CHECK + policy refactor + anon access في ملف واحد)، انشرها كـ migrations صغيرة:
- 27 (CHECK extension) → live test
- 27.1 (existing policy refactor) → live test
- 27.2 (anon access) → live test

كل migration يقدر يُعمل rollback مستقلاً. Stripe pattern لـ schema changes.

#### قاعدة #49 — 15+ audit rounds للـ destructive features ⭐ v41

| Feature type | Rounds minimum |
|---|---|
| UI-only (rendering, filters) | 4 (R1-R4) |
| Read-only DB writes (audit log) | 8 |
| **Destructive DB writes (UPDATE/DELETE)** | **15 (R1-R15)** |
| **Untrusted user input** | **30 (R1-R20 + D1-D10 deep)** — قاعدة #53 |

R1-R4 الأصلية تكشف ~70% bugs (structure, naming, scope). R5-R15 العميقة تكشف الباقي — concurrency, integration regressions, race conditions.

#### قاعدة #50 — String substitution: split/join بدل while+replace ⭐ v42

```js
// ❌ خطير — DoS لو val تحوي needle:
while (body.indexOf(needle) !== -1) body = body.replace(needle, val);
```

// ✅ آمن — single-pass:
if (body.indexOf(needle) !== -1) body = body.split(needle).join(val);
```
```

**Phase X3 محادثة 1 R6:** tenant name = `'{name}!'` → replacement re-introduces needle → infinite loop → browser freeze 100% CPU. DoS عبر untrusted user input. Fixed في commit `31178b6`.

#### قاعدة #51 — update().maybeSingle() يحتاج row-not-found check ⭐ v42

PostgREST `update().maybeSingle()` لا يفشل لو لا توجد row تطابق الـ WHERE — يعيد `data: null, error: null`. لو الكود يفترض `!error = success` → "✅ تم حفظ" يظهر لكن لا شي تغيّر في DB.

```js
// ✅ الـ pattern الصحيح:
var upd = await window.sb.from(...).update({...}).eq(...).select().maybeSingle();
if (upd.error) { alert('فشل: ' + upd.error.message); return; }
if (!upd.data) { alert('لم يُحدَّث أي سطر — قد يكون row غير موجود أو RLS رفض'); return; }
```

Scenarios: seed missing، RLS denial، concurrent delete.

#### قاعدة #52 — "↩ افتراضي" منفصل عن "↺ إلغاء" ⭐ v42

أي editor عنده fallback hardcoded يحتاج زرّان منفصلان:
- **↺ إلغاء التعديلات** → restore `original` snapshot (آخر DB save) — يلغي edits غير محفوظة
- **↩ افتراضي** → restore `FALLBACK_TEMPLATES[code]` (الـ hardcoded في الكود) — يسترجع النص الأصلي حتى لو الـ DB version مخرَّب

اكتشف في live test Phase X3 محادثة 1: admin مسح كامل body → revert يعيد الفاضي → admin stuck. الإصلاح commit `d270a99`.

#### قاعدة #53 — Deep audit (10 rounds) بعد standard 20 ⭐ v42

Features تستقبل untrusted data → standard 20 rounds + deep 10 rounds = **30 rounds minimum**.

| Audit type | يفحص |
|---|---|
| Standard 20 | structure, naming, scope, RLS, UI |
| Deep 10 | edge inputs, attack vectors, race conditions, malicious data flows |

R6 CRITICAL DoS في Phase X3 محادثة 1 لم يُكتشف إلا بـ deep audit مع isolated test harness (val=`'{a}!'`).

#### قاعدة #54 — flex-wrap + min-width للـ many-button containers ⭐ v43 (Phase X3.2)

صفوف فيها 8+ أزرار على mobile لازم:
```css
.req-actions {
  display: flex;
  flex-wrap: wrap;     /* allow wrapping */
  gap: 6px;
}
.req-actions > * {
  min-width: 0;        /* prevent overflow */
}
```

**Phase X3 محادثة 2 mobile test:** بعد إضافة 3 أزرار جديدة (`👋` + `⏸` + `✅`), صف الـ actions تجاوز viewport على iPhone → horizontal scroll. الـ fix في commit `1acbdf0`.

#### قاعدة #55 — Token-based latest-wins guard للـ async loaders ⭐ v43 (Phase X4 D6)

لو user يبدّل filter بسرعة، أول `loadEvents()` قد ينتهي بعد الثاني → stale data overwrites fresh.

```js
var loadToken = 0;
async function loadEvents() {
  var myToken = ++loadToken;
  var data = await fetchEvents(...);
  if (myToken !== loadToken) return;  // ← stale, abort
  renderEvents(data);
}
```

Pattern مأخوذ من React Query / SWR concept.

#### قاعدة #56 — ID-based DOM references بدل index في debounced UIs ⭐ v43 (Phase X4 D8)

search debounce (300ms) قد يبدّل array order قبل click. الـ modal يفتح stale event.

```html
<!-- ❌ Index-based — stale لو الـ array تغيّر -->
<div onclick="openEventModal(7)">...</div>
```

<!-- ✅ ID-based — robust -->
<div data-id="abc-123-uuid" onclick="openEventModal('abc-123-uuid')">...</div>
```
```

```js
function openEventModal(id) {
  var ev = currentEvents.find(e => e.id === id);
  if (!ev) return;  // gracefully handle race
  // ...
}
```

#### قاعدة #57 — Net conversion يستثني rejected (ChartMogul) ⭐ v43 (Phase X5 D9)

لو ضممنا rejected في numerator أو denominator، نسبة الـ conversion تضخّم بشكل misleading.

```js
// ❌ خطأ:
conversionRate = (accepted / totalRequests) * 100;
```

// ✅ صحيح (ChartMogul/ProfitWell pattern):
var eligible = allRequests.filter(r => r.status !== 'rejected');
var converted = eligible.filter(r => r.status === 'accepted');
conversionRate = eligible.length > 0
  ? (converted.length / eligible.length) * 100
  : null;  // "—" بدل NaN%
```
```

#### قاعدة #58 — In-page sections > separate pages في GitHub Pages SPAs ⭐ v43 (Phase X4 — الدرس الذهبي)

**الـ cross-page architecture في GitHub Pages عرضة لـ 3 failure modes متلازمة:**

1. **GitHub Pages deploy lag:** new pages تأخذ 5-15 دقيقة للـ rebuild على كل CDN edges، خاصة بعد commits متتالية. الـ 404 خلال هذا الوقت → browser يحتفظ بـ URL القديم.
2. **Browser cache (Safari Mobile/Brave especially):** aggressive disk cache يعرض النسخة القديمة من الصفحة حتى بعد الـ deploy.
3. **Session race:** الـ init scripts (supabase-init.js) قد تنتهي بعد الـ DOM ready → redirect loops.

**Phase X4 الأصلية** كانت `subscription-events.html` منفصلة → 3 محاولات إصلاح (defensive auth, link reliability, session retry + no-cache) فشلت كلها لنفس symptom: "الزرّ لا يفتح الصفحة".

**الحل الذي نجح (commit `0190d6e`):** refactor كامل إلى **collapsible section داخل admin.html** بـ `evf-*` namespacing. يطابق pattern Phase X2 (Plans Editor) و Phase X3 (Templates Editor) — نمط مُختبَر وموثوق.

**القاعدة العامة:** في GitHub Pages SPAs، اختر in-page sections عن separate .html files إلا لو فيه سبب قاهر (مثل صفحة marketing مستقلة).

#### قاعدة #59 — Column-existence check قبل أي SELECT جديد ⭐ v44 (Phase X8 live-test bug)

**المشكلة:** Phase X8 ضمّن `trial_requests.updated_at` في SELECT — العمود غير موجود في schema. الـ 30 audit rounds فحصت **table names** فقط، مش **column names**. النتيجة في live test:

```
column trial_requests.updated_at does not exist ⚠️
```

كل feature ينكسر، الـ user يرى red error banner بدل الـ charts.

**سبب وصول الـ bug:** R15 audit في Phase X4/X8 يتحقق فقط من أن tables مذكورة بشكل صحيح — لا يفحص كل column مرّ عبر `.select(...)`. عندما يكون السيناريو offline-coded (لا access لـ Supabase Studio)، الـ assumption عن schema يعتمد على recall.

**القاعدة:** قبل أي **SELECT** جديد في أي feature:

1. **Grep canonical**: ابحث عن أي SELECT موجود لنفس الـ table في الكود — هو الـ ground truth.
   ```bash
   grep -rn "from('trial_requests').select" --include="*.html"
   ```
2. **التحقق من العمود الواحد**: لكل column في SELECT projection، تأكد أنه:
   - مذكور في migration الأصلي (مجلد `migrations/`)
   - أو موجود في `select('*')` reads أخرى يستخدمها admin.html
3. **في الـ audit checklist**: أضف **R15.5 — column-level verification** بعد R15 (table-level verification).

**سيناريو تقليدي للـ bug:** column من جدول مشابه (مثل `subscription_events.updated_at`) يُكتب بـ autopilot على جدول آخر بدون تحقق.

**Phase X8 fix (commit `17936cd`):** حذف العمود من SELECT (لم يُستخدم في الـ logic أصلاً) — one-line fix.

#### قاعدة #60 — Always-visible affordances > onboarding-once hints ⭐ v45 (Phase X9 FAB lesson)

**المشكلة:** الـ onboarding chip كان dismissible-once — بعد ما المستخدم يضغط ✕ ما يرجع يظهر أبداً. هذا يُحبط هدف الـ chip (دليل دائم على keyboard shortcuts).

**القاعدة:** أي UI hint عن capability موجودة في النظام (مثل shortcuts، features، keyboard combos) يجب أن يكون:
- **Always visible** (مثل Material Design FAB، Intercom Messenger floating button)
- ليس dismissible-permanent
- يكون متاح في أي لحظة لـ "remind me what I can do"

**Phase X9 fix (commit `5be2f44`):** استبدلت الـ chip بـ **FAB دائري Material Design**:
- 48×48 px، green accent
- Bottom-left always (RTL-aware)
- Tooltip "الاختصارات (؟)" على hover
- Click → openKbsModal()
- لا يُخفى أبداً

**الـ pattern من industry:** Intercom Messenger، Linear command palette FAB، Notion ?, Stripe Dashboard help button.

#### قاعدة #61 — Overlay class verification قبل cross-overlay logic ⭐ v45 (Phase X9 R18-R30 bugs)

**المشكلة:** Phase X9 keyboard shortcuts كانت تحاول إغلاق overlays عبر `Esc`. Audit deep كشف 4 bugs:
- R18: `c360Close()` — fn name غير صحيح (الصحيح: `closeCustomer360`)
- R20: `c360-drawer.show` — class غير صحيحة (الصحيحة: `.open`)
- R21: `bk-progress-back.show` — class غير صحيحة (الصحيحة: `.bk-progress-overlay.open`)
- R30: `evfModal` — DOM id غير صحيح (الصحيح: `evfModalOverlay`)

**القاعدة:** قبل كتابة logic يفترض classes/IDs/function names لـ overlays موجودة:
1. **grep canonical**: `grep "drawer-class\|overlay-id" admin.html`
2. **تحقق من actual CSS**: ابحث عن `.classname.show` vs `.classname.open` — أيهما يفعلاً يُستخدم؟
3. **تحقق من DOM elements**: `document.getElementById('id')` mock test قبل integration
4. **اختبر path execution** في console قبل commit

**سيناريو bug تقليدي:** ضمّ overlay جديد بدون verification → Esc shortcut يحاول إغلاقه لكن `removeClass('show')` لا يعمل لأن الـ CSS فعلاً يستخدم `.open`.

**Phase X9 fix:** verification scan caught 4 mismatches قبل live test.

#### قاعدة #62 — @sydent.com is auth identifier, NOT marketing domain ⭐ v46 (Phase X10 critical)

**القاعدة:** الـ string `@sydent.com` (مع `.com`، ليس `.app`) موجود في الكود في 8 أماكن:
- `auth.html` × 3 (login transform: phone-number → email)
- `admin.html` × 5 (template preview + 2 send-points + 2 comments)

**هذا ليس marketing domain — هذا مُعرّف داخلي لـ Supabase Auth.** الحسابات الموجودة (مجدي بورج، أنت، كل tenant) تُخزَّن في `auth.users` بهذا الـ suffix. تغييره يعني:
- ❌ كل المستخدمين الحاليين **لن يقدروا يسجلوا دخول**
- ❌ يحتاج migration على Supabase Auth (مكلف ومخاطر عالية)
- ❌ مش visible للمستخدم أصلاً (internal phone→email transform)

**عند تغيير marketing domain (sydent.com → sydent.app في Phase X10):**
- ✅ غيّر: `login_url` في templates، canonical URLs، OG tags، sitemap
- ❌ **لا تغيّر**: `@sydent.com` suffix أبداً
- ✅ وثّق هذا في commit message + rule

**Phase X10 verification:** R3 audit verified 8 occurrences preserved → live test على Brave + iPhone confirmed login still works.

#### قاعدة #63 — Clean URLs على Cloudflare Pages: extension اختيارية في path matching ⭐ v46 (Phase X10.2)

**المشكلة:** Phase X10.1 fix استخدم regex يطلب `.html` صريحة:
```js
/(^\/$)|(\/auth\.html$)|(\/landing\.html$)/
```

على iPhone Safari: المستخدم يفتح `sydent.app/auth.html` → pathname = `/auth.html` ✓
على Brave desktop: المستخدم ينقر link لـ `auth.html` → Cloudflare يخدم clean URL → pathname = `/auth` ✗

**القاعدة:** Cloudflare Pages يخدم clean URLs بشكل افتراضي. أي regex يطابق pathnames لازم يقبل **الشكلين**:

```js
// ❌ خطأ — يفشل على Cloudflare desktop
/\/auth\.html$/
```

// ✅ صحيح — يقبل /auth و /auth.html
/^\/(index|auth|landing|pending|admin)(\.html)?$/
```
```

**Additional safeguards:**
- Leading anchor `^\/` يمنع `/foo/auth` من match
- `?` على `(\.html)?` يجعلها optional
- `i` flag للـ case-insensitivity

**Phase X10.2 fix (commit `7bb74a3`):** regex جديدة + 40 path test cases pass.

#### قاعدة #64 — Computed > Stored للـ progress/checklist state ⭐ v46 (Phase 7.6G)

**المشكلة المحتملة:** لو خزّنا checklist completion items في DB columns:
```sql
clinic_settings:
  has_added_patient BOOLEAN
  has_booked_appointment BOOLEAN
  has_recorded_session BOOLEAN
```

كل insert في patients/appointments/sessions يحتاج **trigger** لـ flip الـ flag → sync بugs.

**الـ القاعدة:** للـ checklist items التي تمثّل "هل أنجز المستخدم action X؟":
- **Compute at read time** من COUNT queries على الـ tables الأصلية
- **لا تخزّنها** في columns منفصلة
- ضمن دقة دائمة بدون sync logic

**Phase 7.6G implementation:**
```js
var itemsDone =
  (clinicNameConfirmed ? 1 : 0) +
  (patientsCount     > 0 ? 1 : 0) +
  (appointmentsCount > 0 ? 1 : 0) +
  (sessionsCount     > 0 ? 1 : 0);
```

4 parallel COUNT queries بـ `head: true` → essentially zero wire cost.

**ما تُخزَّن فعلاً:**
- `onboarding_dismissed_at` — قرار المستخدم (لا يمكن compute)
- `clinic_name_confirmed_at` — قرار المستخدم (لا يمكن compute)

**القاعدة العامة:** خزّن decisions (user intent)، compute progress (derived state).

#### قاعدة #65 — Defensive normalization at substitution time, NOT at storage ⭐ v47

**المشكلة:** Templates مثل `"مرحباً د. {name}"` + DB data بـ `name = "د شذ المار"` ينتج duplication: `"مرحباً د. د شذ المار"`.

**الحل الخاطئ:** تنظيف الـ name عند الـ INSERT/UPDATE (يحرّف source-of-truth).

**الحل الصحيح:** helper `stripDoctorHonorific(name)` يُطبَّق **عند الـ substitution فقط** (وقت بناء رسالة WhatsApp)، لا عند الـ DB writes.

```js
// ✅ Defensive normalization at render time
async function waWelcomeLink(phone, name, email) {
  var body = await renderTemplate('wa_welcome', {
    name: stripDoctorHonorific(name)  // ← normalize HERE, not in DB
  });
  // ...
}
```

**Regex خطر:** `/^د\.?\s*/` يكسر أسماء تبدأ بـ "د" بدون honorific (`دلال` → `لال`).

**Regex صحيح:** `/^د\s+|^د\.\s*/` — يطلب whitespace **أو** dot بعد "د":

| Input | Output |
|---|---|
| `"د شذ المار"` | `"شذ المار"` ✓ |
| `"د. مجد"` | `"مجد"` ✓ |
| `"دلال"` | `"دلال"` ✓ (لا strip) |
| `"دانا"` | `"دانا"` ✓ (لا strip) |

**Single source of truth:** نفس الـ helper يُستخدم في `c360AvatarInitial` للـ avatar initial — لا regex مكرّر.

**Editor preview:** `TPL_MOCK_VARS.name` يجب يطابق post-strip value (`"محمد العلي"` لا `"د. محمد العلي"`) عشان الـ preview يعكس الـ live render بدقة.

**Phase post-X10 commit `3541583`:** 16 audit rounds + 26 edge-case tests pass.

#### قاعدة #66 — Audit findings: pattern-level, not file-level ⭐ v47

**الدرس:** Deep code audit في محادثة v47 كشف B1 (double-submit) **في 5 ملفات منفصلة**. لو عالجنا ملف واحد فقط، كان الـ bug يبقى في 4 آخرين.

**القاعدة:** عند الـ audit:
1. **حدّد الـ pattern** (مثلاً `async function save*` بدون in-flight guard)
2. **grep across all files** لإيجاد كل instances
3. **fix at pattern level** بنفس الـ shape (module-level flag، نفس naming convention)
4. **single commit** يغطي كل instances

**Anti-pattern:** Fix saveExpense → commit → "ننتقل لـ saveDoctor في محادثة منفصلة" → user يفقد context → fix يتأخّر → bug يستمر في الإنتاج.

**Phase post-X10 commit `3f5add6`:**
- 5 ملفات حصلت على نفس الـ pattern في commit واحد
- Each: `var _save*InFlight = false; try {...} finally {_save*InFlight = false}`
- Validation early-returns BEFORE flag set (no stuck button)
- 20 audit rounds + 0 bugs caught (clean implementation)

**حدّ الـ pattern audit:** إذا الـ pattern يلامس >10 ملفات، قسّمها على >1 commit للـ reviewability — لكن في sprint زمنياً متقارب.

#### قاعدة #67 — DRY-RUN قبل أي destructive migration ⭐ v48 (Phase F)

**الدرس:** قبل Phase F، خطّتنا الأصلية كانت "DROP doctors.role + maybe DROP doctors". لكن **DRY-RUN SQL مع 9 verification queries** كشف:
- Q4: 6 FK references TO doctors (treatments, patients, appointments, ledger_sessions, ledger_payments, teeth_status) → doctors هو **tenant identity table**، ليس legacy!
- Q8: 2 policies تستخدم `EXISTS(SELECT FROM doctors)` مباشرة → bypass `is_platform_admin()` → لا تتأثر بـ Migration 30.1
- Q9: `handle_new_doctor` trigger ينشئ tenant identity على signup → لا يجب لمسه

**القاعدة:** قبل أي destructive migration (DROP table، REMOVE column، REFACTOR policy):
1. **Q1 (schema):** `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<table>'`
2. **Q2-Q3 (RLS):** `SELECT * FROM pg_policies WHERE tablename = '<table>'` + grants
3. **Q4 (FK references TO):** `SELECT * FROM information_schema.referential_constraints WHERE unique_constraint_schema = '<table>'`
4. **Q5 (FK references FROM):** what does this table reference?
5. **Q6 (row sample):** `SELECT * FROM <table> WHERE ... LIMIT 5` للتأكد من state الفعلي
6. **Q7 (counts):** total, by-status, NULL columns
7. **Q8 (policy dependencies):** أي policies في DB تذكر هذا table في qual/with_check؟
8. **Q9 (function dependencies):** أي functions تذكر هذا table؟
9. **Q10 (live-data assertions):** فحص integrity constraints الموجودة

**نتيجة DRY-RUN على Phase F:** خطّة تغيرت من "drop doctors" إلى "create platform_admins + keep doctors intact + Migration 31 deferred". أنقذ نظام كامل من corruption.

**Anti-pattern:** القفز للـ migration بدون DRY-RUN لأن "الخطّة واضحة". في Postgres، **schema reality > schema assumption دائماً**.

#### قاعدة #68 — Helper consolidation للـ repeated query patterns ⭐ v48 (Phase F)

**الدرس:** قبل Phase F، كان `.from('doctors').select('role')...` patterns مكرّر في 12 موقع عبر 4 ملفات. لو تغيّر الـ source (مثل Phase F)، نحتاج 12 fix منفصل + 12 audit + 12 risk-point.

**القاعدة:** عند ظهور نفس query pattern في 3+ مواقع/ملفات:
1. **Extract إلى `window.SyDent*` namespace helper** (single source of truth)
2. **Return consistent shape** (مثلاً `{ isAdmin, error }` بدل raw response)
3. **Fail-closed semantics** (errors تُرجع safe default، ليس crash)
4. **Document نمط الاستدعاء** في JSDoc/comment

**Phase F example:**
```javascript
// قبل (12 sites):
const { data: roleData } = await window.sb.from('doctors').select('role')...;
if (roleData && roleData.role === 'admin') ...
```

// بعد (1 helper):
const adminCheck = await window.SyDentAuth.isPlatformAdmin(userId);
if (adminCheck.isAdmin) ...
```
```

**فائدة:** عند Phase F، **تغيير الـ source من doctors إلى platform_admins تطلّب فقط fix helper واحد + 12 callsite update مكانيكي**. لو ما كان helper، كنّا نعيد كتابة 12 SQL query منفصل + 12 audit لكل واحدة.

#### قاعدة #69 — Migration ordering window race documentation ⭐ v48 (Phase F)

**الدرس:** في Phase F، بين Migration 30.1 (function repoint) وdeploy الـ code (commit 4b5055d) كان هناك **window 2-3 دقائق** حيث:
- Function في DB تقرأ من `platform_admins` (Migration 30.1 done)
- Cloudflare لم ينشر الـ code بعد → admin.html القديم لا يزال يكتب لـ `doctors` (promote/demote)

**القاعدة:** عند migration يغيّر source-of-truth لـ shared object (function, policy, trigger):
1. **اختر quiet hours** (لا admin operations متوقّعة)
2. **وثّق الـ recovery SQL** في commit message أو في الـ migration الـ rollback section
3. **خبّر الـ user** بـ window timing (مثل "لا تعمل promote/demote لـ 5 دقائق")
4. **بعد deploy:** verify بـ `SELECT pg_get_functiondef(...)` + test E2E flow

**Phase F mitigation:** أعمال admin في هذا الـ window كانت 0 (deploy في وقت quiet)، ولكن **mitigation وثّقت في commit message** + rollback plan جاهز.

#### قاعدة #70 — Idempotent migrations دائماً ⭐ v48 (Phase F)

**القاعدة:** كل migration يجب أن يكون آمن على re-run (idempotent):
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `DROP POLICY IF EXISTS` قبل `CREATE POLICY`
- `INSERT ... ON CONFLICT DO NOTHING` (أو DO UPDATE حسب الحاجة)
- `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- **pre-flight schema check** (assertion على الـ state المتوقّع قبل البدء)

**Phase F example (Migration 30):**
```sql
-- Pre-flight: تأكّد من state الـ doctors قبل backfill
DO $$
DECLARE admin_count INT;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.doctors WHERE role = 'admin';
  IF admin_count = 0 THEN
    RAISE EXCEPTION 'No admins in doctors.role=admin to backfill!';
  END IF;
END $$;
```

-- Idempotent: re-run يدخل صفر new rows
INSERT INTO public.platform_admins (...)
SELECT ... FROM doctors WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;
```
```

**فائدة:** إذا migration فشل في النصف (network blip، timeout، connection drop)، re-run يصلح الـ state بدون duplicates أو errors.

**Anti-pattern:** `INSERT` بدون `ON CONFLICT` + `CREATE TABLE` بدون `IF NOT EXISTS` → first failure = stuck migration.

#### قاعدة #71 — SVG > emoji للأيقونات الـ universal ⭐ v49 (Password Toggle live test)

**الدرس:** Phase Password Toggle (v49) استخدمت emoji 👁 / 🙈 للـ visibility toggle. الـ 30-round audit صمت تماماً — emoji صحيح syntactically. لكن **live test على Windows Brave كشف:** الـ 🙈 emoji renders بحجم كبير ومكسور (Windows font fallback chain للـ multi-glyph monkey emoji). صار يحتاج commit إضافي (`970997e`) لاستبدالها بـ inline Heroicons SVG.

**القاعدة:** للأيقونات الـ universal الموجودة في الـ chrome (toggle buttons, indicators, controls):
- ✅ Inline Heroicons SVG (viewBox 24×24, currentColor, aria-hidden) — render مضبوط 100% across OSes
- ❌ Emoji في chrome elements — Windows/Linux font fallback غير موثوق
- ✅ Emoji في content فقط (مثل messages, notifications, labels) — context يعطي fallback آمن

**Industry pattern:** Stripe / GitHub / Notion — zero emoji في الـ chrome buttons. كلها SVG.

#### قاعدة #72 — Email pipeline alignment ⭐ v51 (Phase Email Part 2)

**الدرس:** Templates applied في Supabase Dashboard لا تُرسَل إلا لو الـ event trigger الفعلي يُنفَّذ. لو email confirmation مُعطَّل (auto-confirm=true في Phase 7.6F)، template `Confirm signup` لن يُرسَل أبداً مهما كانت جودته. كذلك templates `Password Changed` / `Email Changed` / `Phone Changed` / `MFA Enrolled` تحتاج Send Email Hook (Edge Function) — مش editable من Dashboard.

**القاعدة:** قبل ما تستثمر وقت في design template:
1. **تحقّق من الـ event trigger** — هل الـ flow الفعلي يُطلق هذا الـ event؟
2. **تحقّق من الـ delivery mechanism** — Dashboard template (built-in events) vs Send Email Hook (security notifications)
3. **اعرف الـ test scenario** — هل تقدر تـ trigger الـ event من UI؟

**Phase Email Part 2 application:**
- ✅ Reset Password → admin يضغط زر في Dashboard أو user يطلب forgot password → event fires → template ينُرسَل
- ❌ Confirm Signup → auto-confirm=true → event لا يُطلق → template موجود في Dashboard لكن dead code
- 🔮 Password Changed → يحتاج Send Email Hook → repo-only template

**Result:** 3 templates active في Dashboard (Confirm Signup [dead] + Change Email + Reset Password), 4 templates Send Email Hook future-ready, 3 templates repo-only source-of-truth.

#### قاعدة #73 — Forgot password UI is part of email infrastructure ⭐ v51 (Phase Email Part 3a planning)

**الدرس:** Email infrastructure شغّال (DKIM/SPF/DMARC PASS) لا يعني الـ flow كامل. الـ UI entry points لاستدعاء الإيميلات (مثل "نسيت كلمة المرور؟" link/button) هي جزء من الـ infrastructure. بدونها، الـ templates تبقى dead code — لا أحد يقدر يطلب reset.

**القاعدة:** لما تصمّم email infrastructure، اشمل في الـ scope:
1. SMTP provider + sender verification (DKIM/SPF/DMARC)
2. Templates (branded + localized)
3. **UI entry points** للـ user-initiated emails (forgot password, change email request, etc.)
4. **Test scenarios** end-to-end (request → email → click link → resolve)

**Phase Email decisions:** Part 1 = SMTP. Part 2 = Templates + DMARC. **Part 3b** (deferred) = Forgot Password UI. تجزئة scope clean للـ audit-ability.

#### قاعدة #74 — Signup atomic transaction failure ⭐ v51 (Phase Email Part 3a)

**الدرس:** عند signup multi-step (`auth.users` + `trial_requests` + clinic_settings + ...)، لو أي خطوة بعد الأولى فشلت، الـ user يقع في "phantom state":
- ✅ `auth.users` موجود (نجح Step 1)
- ❌ `trial_requests` غير موجود (فشل Step 2)
- ⚠️ النتيجة: المستخدم غير مرئي للـ admin، لا يقدر login (ensureAccountAccessible يحجب)، ولا يقدر signup مرة ثانية (Supabase يرفض duplicate email)

**Phase Email Part 3a live evidence:** `ayhamghoo@gmail.com` + `ayhamgho@gmail.com` كانوا phantom — `auth.users` موجود، `trial_requests` غير موجود. السبب: `phone NOT NULL` في schema رفض الـ INSERT.

**القاعدة:** كل multi-step signup flow يجب يكون فيه:
1. **Atomic guarantee** — إما كل الخطوات تنجح، أو الـ rollback يحدث (مع SERVICE_KEY أو SECURITY DEFINER function)
2. **OR Idempotency** — re-signup للـ same user يعيد المحاولة بدلاً من رفض ("user already exists")
3. **OR Admin cleanup tool** — UI في admin.html لـ orphan users (auth.users بدون trial_requests)
4. **OR SQL trigger** — على INSERT في auth.users، auto-create trial_request (Phase F3 option B)

**Phase Email Part 3a workaround:** صلّحنا الـ root cause (phone NOT NULL + Migration 32) بدل ما نضيف rollback — أبسط + أصلح. لكن edge case "network failure between Step 1 + Step 2" لا يزال موجود — مؤجَّل لـ Phase F3.

#### قاعدة #75 — Reset password flow MUST use event-based trigger only ⭐ v51 (Phase Email Part 3b planning — deferred)

**الدرس (من Phase Email Part 3b plan review، R41-R42):** في reset-password flows، الـ `supabase.auth.getSession()` يقرأ من localStorage بدون validation للـ session type. لو user آخر كان logged-in في نفس الـ browser، الـ session الموجودة يخدع الـ form لعرض update password بـ wrong user context. النتيجة: user يقدر بدون قصد يـ update password لـ user آخر — CVE-grade vulnerability.

**القاعدة:** في `reset-password.html` (أو أي page تتعامل مع recovery):
1. **Trust ONLY** الـ `onAuthStateChange` event مع `event === 'PASSWORD_RECOVERY'`
2. **NEVER** fall back لـ `getSession()` لـ تفعيل الـ update form
3. **Always signOut** بعد update password (clear الـ recovery session لكل الـ tabs)
4. لو الـ event ما يطلق خلال X ثوان → اعرض "link expired" حصراً، **ليس form**

**Industry pattern:** Stripe/Auth0/Supabase official examples كلها event-based فقط.

**Note:** Phase Email Part 3b مؤجَّل بعد ما هذه القاعدة اكتُشفت في الـ plan review. التطبيق الفعلي في محادثة منفصلة.

#### قاعدة #76 — Diagnostic queries reveal undocumented production state ⭐ v51 (Phase Email Part 3a discovery)

**الدرس:** تخطيط Migration 32 based على Context v50 كان سيكسف 5 RLS policies موجودة في production لكن **4 من 5 غير موثَّقة** في الـ repo migrations أو الـ context:

| Policy | في v50 docs? | في pg_policies (production)? |
|---|---|---|
| `Admin all access` | ✅ | ✅ |
| `Anyone can insert request` | ❌ | ✅ (weak, replaced في Migration 32) |
| `User can delete own trial` | ❌ | ✅ |
| `User can delete own trial by email` | ❌ | ✅ |
| `User read own trial` | ❌ | ✅ |

**Initial plan v3** assumed: "no INSERT policy exists, RLS rejects self-INSERT" → wrong. الـ INSERT كان مسموح فعلاً (لكن بـ weak policy).

**Initial root cause hypothesis** (RLS gap) كان خطأ. الـ root cause الفعلي (`phone NOT NULL`) كُشف بعد ما الـ console error code (400) فُحص + الـ schema query شُغّلت.

**القاعدة:** قبل أي migration على جدول له RLS:
1. **شغّل diagnostic first:** `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='X'`
2. **شغّل schema query:** `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='X'`
3. **شغّل constraints query:** `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='X'::regclass`
4. **لا تثق في الـ Context files** — Context قد يكون stale بالنسبة لـ legacy tables (especially الـ tables اللي created via Dashboard UI، ليس SQL migration files)

**Phase Email Part 3a application:** Q1 (policies) كشف 5 rows. Q2 (schema) كشف phone NOT NULL. Q3 (rows) كشف 2 phantom users. Q4 (duplicates) كشف 0. Q5 (constraints) كشف لا UNIQUE على user_id.

**نتيجة:** Migration 32 خرجت من scope "add self-INSERT policy" إلى "fix phone NOT NULL + add UNIQUE + replace weak policy" — كلها essential.

#### قاعدة #77 — autoGate skip object must normalize clean URLs ⭐ v52 (Phase Email Part 3b R12 audit catch)

**الدرس:** Phase X10.2 (قاعدة #63) طبّقت clean-URL تطبيع على `isPublicPage()` regex، لكن **نسيت** الـ autoGate skip object في `supabase-init.js`. الـ skip object يستخدم direct dictionary lookup (`skip[page]`) — لا regex — والـ key kept `'reset-password.html'` فقط.

**Cloudflare Pages behavior:**
- `sydent.app/reset-password.html` → `pathname = '/reset-password.html'` → `page = 'reset-password.html'` → `skip[page]` = 1 ✓
- `sydent.app/reset-password` (clean URL) → `pathname = '/reset-password'` → `page = 'reset-password'` → `skip[page]` = `undefined` ✗

**النتيجة المحتملة (لو لم يُكتشف R12):**
- User يفتح `/reset-password` (clean URL على Brave/Chrome)
- autoGate يشغل → `sbGetUser()` → recovery session موجودة (لأن supabase-js parsed الـ fragment)
- `ensureAccountAccessible(user)` يفحص `trial_requests.status`
- لو status='new'/'rejected'/'suspended' → autoGate يـ redirect لـ `auth.html?denied=...` → **user يخسر فرصة الـ reset**

**الـ Fix الذي طُبِّق:**
```js
var path = (window.location.pathname || '').toLowerCase();
var page = path.split('/').pop() || 'index.html';
// Normalize: if no extension, append .html so dictionary lookup matches both forms
if (page && page.indexOf('.') === -1) page = page + '.html';
var skip = { 'auth.html':1, 'landing.html':1, 'pending.html':1, 'admin.html':1, 'reset-password.html':1 };
if (skip[page]) return;
```

**القاعدة العامة:** أي page-name dictionary lookup في supabase-init.js (أو أي script يخدم على Cloudflare Pages SPAs):
1. **Normalize key أولاً** — append `.html` إذا الـ page بدون extension
2. **اختبر بـ كلا الشكلين** في كل R12-level audit:
   - `path = '/auth.html'` → `page = 'auth.html'` → skip=YES ✓
   - `path = '/auth'` → normalize → `page = 'auth.html'` → skip=YES ✓
3. **قاعدة #63 توأم لـ regex، #77 توأم لـ dictionary** — كلاهما needed على Cloudflare

**Defense-in-depth benefit:** الـ fix benefits **ALL public pages** (auth/landing/admin/pending) — كانوا عرضة لنفس الـ gap، لكن own auth checks fortuitously masked the issue. Now consistent across all public pages.

**Test cases verified (Node REPL during R12):**
- `/reset-password` → skip=YES ✓
- `/reset-password.html` → skip=YES ✓
- `/auth` → skip=YES ✓
- `/auth.html` → skip=YES ✓
- `/patients` → skip=NO ✓ (tenant page still gated correctly)
- `/reset-password-fake` → skip=NO ✓ (partial match attack blocked)
- `/reset-password/extra` → skip=NO ✓ (path traversal blocked)

#### قاعدة #78 — Disable platform features that bypass canonical signup flow ⭐ v53 (Phase F3)

**الدرس:** Phase 7.6F establishes canonical signup flow عبر `auth.html` فقط (self-signup). أي feature في Supabase Dashboard أو SQL Editor يخلق `auth.users` row بشكل مباشر يتجاوز هذا الـ pattern → phantom user risk (auth.users بدون trial_requests).

**Live evidence (Phase Email Part 1 ⭐ v50):** الـ 2 phantom users (`ayhamghoo` + `ayhamgho`) كانوا من Supabase Dashboard "Send invitation" test. مع أنهم cleanup ناجح، الـ pattern يجب يُمنع.

**القاعدة:** لكل feature في Supabase Dashboard يخلق auth.users:

1. **Document explicit ban** في Context — never use Dashboard invitations or manual SQL INSERT into auth.users
2. **Provide diagnostic query** للـ phantom detection (موثّقة في Phase F3 section)
3. **Document canonical alternative** — auth.html signup + admin.html accept flow
4. **Periodic check** — admin يشغل diagnostic query أسبوعياً (manual، حالياً)
5. **Discipline > trigger في mono-admin context** — trigger له blast radius (signups break لو فشل). Self-discipline + diagnostic query = sufficient enforcement لـ single-admin systems.

**متى يُعاد النظر:**
- Multi-admin emergence (أكثر من admin يستخدمون Dashboard)
- OAuth signup (Google/GitHub) — لازم trigger لضمان trial_request creation
- Live phantom incident detected via diagnostic query (real, not test)
- Programmatic auth.users creation من Phase 8 (WhatsApp signup automation)

**Industry context:** Supabase official docs explicitly warn: "If the trigger fails, it could block signups, so test your code thoroughly". الـ trigger pattern مذكور كـ "common design pattern" لكن غير مناسب لكل context — في mono-admin، الـ trade-off lean toward documentation.

**Phase F3 application:** Decision tree:
- Production phantoms? → 0 (verified) → no cleanup needed
- Need code enforcement? → No (single admin، careful workflow)
- Need detection? → Yes — diagnostic query موثّقة
- Need prevention? → Yes — documentation + canonical pattern reminder

> ملاحظة: القواعد #79-#82 (Theme System) موثّقة في ملخّص Day 3 + قسم الافتتاح (self-contained widgets degrade gracefully / user-stated > inferred / CSS var inheritance > overrides / preferences UI near identity).

- Auto-detect logic (Rule #79) means future page migrations are 3-line patches:
     add theme.js + theme.css + cache-bust. Toggle activates automatically.
   - Zero changes to supabase-init.js across all 6 commits — auth/init untouched.
   - Stage 2C achieved ZERO overrides — proves the cascade is doing the heavy lifting.

#### قاعدة #80 — صلابة/أسلوب التلوين عبر ثابت واحد ⭐ v63
صلابة (opacity) ألوان العلاجات وأسلوب تطبيقها يجب أن يكونا من **مصدر حقيقة واحد** (`SURFACE_FILL_OPACITY`) يُستعمل في كل منظورات المخطط (دهليزي + إطباقي + crownFull)، كي يبقى المنظوران متطابقَين بصرياً ولا ينحرفا مع الوقت.

#### قاعدة #81 — هندسة الأسطح: مركزي محصور / حافّي بـ overshoot ⭐ v63
- السطح **المركزي** (O الإطباقي) يبقى محصوراً في عموده بلا overshoot جانبي (لئلا يبتلع مناطق M/D/B/L).
- الأسطح **الحافّية/الجانبية** (M/D في المنظورين، B/L الإطباقي) تأخذ **overshoot اتجاهياً مقصوصاً بالـ outline** لتغطّي المنطقة المنحنية كاملةً (لا مستطيل عائم)، وتُرسم M/D **آخراً** لتغطية bleed الأشرطة الوسطى.
- السطح **الوجهي** (B الدهليزي) بقعة مركزية (≈70% من العرض) لا حزام حافة-لحافة.

#### قاعدة #82 — التحقّق البصري + الرَنتايم إلزامي قبل أي commit رسم ⭐ v63
أي تغيير على دوال رسم الأسنان لا يُسلَّم قبل: harness يستخرج الـ builders الفعلية + stubs → **resvg PNG** (تأكيد بصري) + **jsdom** (بنية DOM + أهداف النقر + فحص NaN/إحداثيات) + smoke شامل (كل الأسنان × كل الحالات × المنظورين). «لا تُسلَّم تعديلات رسم غير متحقَّق منها» (سبق رفضها).

#### قاعدة #83 — Storage path = tenant isolation عبر foldername ⭐ v58 (Phase 9)

عند استخدام Supabase Storage في نظام multi-tenant، اجعل **مسار الـ object نفسه** هو حد العزل: `{owner_id}/{patient_id}/{uuid}-{name}`. ثم storage RLS على `storage.objects`:
```sql
USING (bucket_id='patient-files' AND (storage.foldername(name))[1] = auth.uid()::text)
```
`foldername(name)[1]` = أول مجلد = owner_id → tenant لا يصل لملفات tenant آخر. طبّقها على الأربع عمليات (select/insert/update/delete). bucket خاص (`public=false`) + عرض عبر `createSignedUrl` فقط. أضف mime whitelist + file_size_limit على الـ bucket نفسه (دفاع server-side). **rollback** الـ object لو فشل الـ DB insert، واحذف الـ object قبل الصف عند الحذف (لا drift بين Storage والجدول).

#### قاعدة #84 — Native print-to-PDF > PDF libraries للـ RTL العربي ⭐ v58 (Phase 9.1)

لتوليد PDF من محتوى عربي RTL، **لا تستخدم** مكتبة (jsPDF/pdfmake) — فيها مشاكل shaping/bidi مزمنة مع العربية. بدلاً منها: ابنِ HTML منسّق في حاوية مخفية `#printRoot`، استخدم `@media print { body.printing > *:not(#printRoot){display:none} #printRoot{display:block} }`، ثم `window.print()` (المستخدم يختار «حفظ كـ PDF»). نتيجة: عربية مثالية، صفر اعتماديات، نمط OpenDental "Print Progress Notes". نظّف بـ `afterprint` + safety-net timeout للموبايل. هذا أيضاً مكان مثالي لـ toggle محتوى (مثل إخفاء الأسعار في نسخة المريض).

#### قاعدة #85 — مكوّنات theme-aware: متغيّرات دلالية + color-mix لا hex ثابت ⭐ v60 (أزرار admin)

أي مكوّن ملوّن يجب أن يبدو سليماً في الوضعين — **لا تكتب hex لون ثابت** (خاصة palette الـ dark الفاتح مثل #63b3ed/#b794f4/#ffa726). hex الـ dark على خلفية بيضاء = تباين منخفض → washed-out في light. الحل: استخدم المتغيّرات الدلالية من theme.css (`--green/--red/--blue/--purple/--orange/--amber/--cyan/--wa`) التي تتكيّف لكل وضع (غامقة مقروءة في light، فاتحة في dark)، واشتقّ الخلفية/الحدود من نفس المتغيّر عبر `color-mix(in srgb, var(--X) 12%, transparent)` (bg) و`40%` (border) و`100%` (text). هكذا الـ hue متطابق + theme-adaptive + DRY. ملاحظة: الـ dark values للمتغيّرات كانت نفسها الـ hex pastel الذي كان مكتوباً يدوياً، لذا التحويل = صفر تغيير بصري في dark. `color-mix` مدعوم عالمياً منذ 2023. عند الحاجة للون غير موجود كمتغيّر (cyan للتجديد، wa للواتساب)، أضف توكناً جديداً في الوضعين بدل تثبيت hex.

#### قاعدة #86 — العناصر absolute المتراكبة يجب أن تراعي اتجاه RTL ⭐ v60 (checkbox/اسم العميل)

عنصر `position:absolute` على حافة (مثل `right:12px`) صُمّم بعقلية LTR قد يتصادم مع المحتوى في RTL، لأن "right" في RTL هو **حيث يبدأ المحتوى** (الاسم/العنوان)، لا الحافة الفارغة. قبل وضع أي overlay مثبّت في زاوية، تحقّق أين يبدأ محتوى الصف في RTL. الحل الأمتن: احجز مساحة للـ overlay بـ `padding` على الحاوية (مثل `.req-top { padding-right:28px }` لـ checkbox بعرض 22px @ right:12px) بدل نقل العنصر — يبقى الـ badge على الطرف الآخر دون تأثّر، ويعمل مهما طال النص.

#### قاعدة #87 — منع auto-zoom iOS: حقول الإدخال ≥16px على الموبايل ⭐ v60 (responsive)

iOS Safari يقوم بـ auto-zoom على الـ viewport عند focus أي `input/select/textarea` بـ `font-size < 16px`، فيُجبر المستخدم على التصغير يدوياً (أسوأ داخل modals النماذج). الحل العالمي: قاعدة واحدة في theme.css (محمّلة بكل الصفحات): `@media (max-width:768px){ input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea { font-size:16px } }`. تمنع الزوم نهائياً، تطبّق على الموبايل فقط (لا تمسّ تصميم الكمبيوتر)، وتغيّر font-size فقط (لا layout). كذلك: الصفحات بلا sidebar (مثل admin) تحتاج `max-width` معقول (~1200px centered) — لا تتركها تبدو عمود ضيق على الشاشات العريضة، ولا تنسَ أنها لا تأخذ `margin-right:sb-width` مثل صفحات الـ tenant.

#### قاعدة #88 — فصل هويات الأسماء الثلاث + SoT واحد لكل نوع ⭐ v62 (Name Unification)

أنظمة العيادات الناضجة (OpenDental, CareStack, Dentrix) **تفصل عمداً** ثلاث هويات اسم ولا تدمجها بحقل واحد، لأن لكلٍّ غرضاً مختلفاً: (1) **اسم العيادة/البزنس** (Practice Title / Account Name) يظهر على الـ statements/البراند — قد يساوي اسم الطبيب في العيادة الفردية لكنه يبقى حقلاً منفصلاً؛ (2) **اسم المزوّد/الطبيب** (Provider) هوية سريرية؛ (3) **جهة اتصال الحساب** (Account/Billing contact) على طبقة الـ CRM. تطبيق SyDent: اسم العيادة = `clinic_settings.clinic_name` (يظهر: sidebar brand، واتساب، admin primary)؛ اسم المالك-الشخص = `user_metadata.full_name` وهو **SoT** (يظهر: footer، dashboard، settings)؛ جهة الاتصال = `trial_requests.name` (سجل lead تاريخي على طبقة الأدمن فقط، **ليس** مصدر العرض الحيّ). القاعدة: لكل نوع اسم **مصدر حقيقة واحد**، ولا تدمج المصادر — وحّد منطق العرض و(عند اللزوم) زامن، لكن لا تطمس الفصل الدلالي.

#### قاعدة #89 — اسم المالك-الشخص يُزامَن من full_name إلى سجلّيه (employee + doctor) ⭐ v62

المالك إنسان وهو أيضاً مزوّد/موظف. مصدر الحقيقة لاسمه = `user_metadata.full_name` (يحرّره المالك في settings؛ لا يحرّر سجله كموظف يدوياً). لمنع الـ drift يُزامَن على **طبقتين دفاعيتين**: (أ) **write-time** في `settings.saveProfile()` — بعد `updateUser({full_name})` نُحدّث اسم المالك في `clinic_employees` و`clinic_doctors`؛ (ب) **read-time self-heal** عند تحميل `employees.html`/`doctors.html` — لو اسم سجل المالك ≠ full_name نُصحّحه (يكتب فقط عند الاختلاف، fire-and-forget، لا يمسّ غير المالك). + back-fill تاريخي لمرة واحدة (Migration 32). الجذر الذي صُلح: `saveProfile` كان يحدّث full_name فقط ⇒ سجلّا الموظف/الطبيب يبقيان على اسم التسجيل القديم. **سجل المالك فقط** يصبح mirror؛ باقي الموظفين يبقى `clinic_employees.name` مستقلاً (canonical لهم).

#### قاعدة #90 — `clinic_employees` يُعرّف المالك بـ role='owner' فقط (لا عمود is_owner) ⭐ v62

`is_owner` موجود في `clinic_doctors` **وليس** في `clinic_employees`. أي استعلام/فلتر على المالك في `clinic_employees` يستخدم `role = 'owner'` (أو `.eq('role','owner')`)، وفي `clinic_doctors` يستخدم `is_owner = true`. خطأ شائع: `.or('is_owner.eq.true,role.eq.owner')` على clinic_employees → فشل صامت لأن PostgREST يُرجع `{error}` (لا exception)، فلا يلتقطه `try/catch` العادي ولا تُنفّذ العملية (يظهر فقط كـ 42703 في الـ SQL editor). تطبيقياً: مزامنة/heal/back-fill اسم المالك = clinic_employees(role=owner) + clinic_doctors(is_owner). (مرتبطة بـ قاعدة #59 — تحقّق من وجود العمود قبل أي SELECT/WHERE جديد.)

#### قاعدة #91 — الأدمن يعرض الأسماء الحيّة للمستأجر عبر خرائط batched (clinicNameByUid + ownerNameByUid) ⭐ v62

بطاقة العميل/درج 360/CSV/سجل الأحداث في admin.html يجب أن تعرض **الاسم الحيّ** للمستأجر لا snapshot التسجيل المجمّد (`trial_requests.name`). نمطان متوازيان يُبنيان مرة في `loadAndRender`: `clinicNameByUid` (اسم العيادة، من `clinic_settings` عبر window.sb + سياسة RLS قراءة للأدمن — Migration 31) و`ownerNameByUid` (اسم المالك الحيّ، من `clinic_employees` role=owner عبر **SERVICE_KEY REST** batched `owner_id=in.(…)` — لأن clinic_employees محميّ RLS لكل tenant والأدمن ليس مالكه؛ نفس نمط `safeCount`). العرض: العيادة primary، الاسم الحيّ كجهة اتصال، مع fallback إلى `trial_requests.name` عند غياب السجل (لا regression). `trial_requests.name` يبقى للسجل التاريخي فقط.

#### قاعدة #92 — الطبقات كاملة-التغطية لا تحجب ما تحتها ⭐ v64
علاج «السن كاملاً» (whole) و«التاج كاملاً» (crown_full) يجب ألّا يُرسما كتعبئة صلبة تبتلع علاجات الأسطح/الجذور المسجَّلة تحتها (سريرياً الكامل طبقة فوق علاجات سابقة، والطبيب يحتاج رؤيتها):
- **whole** = **إطار ملوّن (stroke)** حول outline التاج + كل جذر؛ الداخل يبقى التاج الطبيعي + أسطحه المعالَجة.
- **crown_full** = **wash شفاف (`0.38`)** يُرسم **آخراً فوق** الأسطح فيشفّ عنها (الجسر/الدعامة استثناء: `0.92` لأنه تاج فيزيائي).
- الأسطح (`overlayRect`/`reg`) تُرسم دائماً بـ `SURFACE_FILL_OPACITY` — ممنوع تصفيرها عند وجود طبقة كاملة.
- المنظوران (دهليزي + إطباقي) يطبّقان نفس المنطق ويُصنّفان WHOLE بنفس الطريقة (crown_full/bridge/whole عبر `target_part`) كي لا يتضاربا.

#### قاعدة #93 — التولتيب يسرد كل العلاجات لا الكامل فقط ⭐ v64
تولتيب السن يجب أن يجمع **كل** ما على السن: صف الطبقة الكاملة (إن وُجد) + **كل** الأسطح المعالَجة + اللساني (L) + الجذور. ممنوع وضع حلقة الأسطح في `else` لـ hasWhole/hasCrownFull (كان يُخفيها كلياً عند وجود تاج/سن كامل — bug سن 23).

#### قاعدة #94 — التولتيب عبر portal على body لا absolute داخل scroll-container ⭐ v64
أي عنصر hover-tooltip فوق حاوية فيها `overflow-x:auto` (مثل `.jaw-wrap`) **يُقصّ** لأن الـ spec يُجبر `overflow-y` على `auto` كذلك. الحل القياسي (floating-ui pattern): عنصر **واحد** `position:fixed` يُلحق بـ `body`، يُملأ من مصدر محتوى مخفي داخل الخلية، event-delegated على حاوية ثابتة (يبقى بعد إعادة الرسم)، يُحسب موضعه من `getBoundingClientRect` ويقلب فوق/تحت حسب المساحة + clamp للـ viewport. لا تعتمد على `padding` ضخم كـ workaround (ينكسر متى كبر التولتيب).

#### قاعدة #95 — العلاج يُرسم فوق التشريح ليبقى بلونه الكامل ⭐ v65
طبقات التشريح الزخرفية (الحُدبات/الأخاديد/الحواف في الإطباقي، أو highlights/shadows في الدهليزي) يجب أن تُرسم **قبل** تعبئة الأسطح الملوّنة (العلاجات)، لا فوقها. التشريح الفاتح المرسوم فوق علاج يبهت لونه ويجعله غير واضح (سن إطباقي: الحشوة بدت باهتة لأن الحُدبات البيضاء كانت فوقها). الترتيب الصحيح: outline → تشريح → أسطح ملوّنة → strokes حافّية → طبقات كاملة (crown_full/whole). هذا يحافظ على وضوح العلاج بلا كسر ثابت الصلابة الموحّد (قاعدة #80) — المسألة ترتيب رسم لا opacity.

#### قاعدة #96 — منطقة النقر تحمل `<title>` باسم السطح ⭐ v65
كل منطقة سطح قابلة للنقر (`.crown-surface` rect بالمنظورين) تحمل `<title>` = الاسم المترجم للسطح (`SURFACE_LABELS[key]`). الـ native tooltip لأقرب عنصر تحت المؤشر يفوز، فيدلّ المستخدم على **السطح** تحت المؤشر بدل عنوان الخلية العام («السن N»). هذا متكامل مع الـ portal (قاعدة #94): الـ portal = ملخّص علاجات السن، الـ title = أي سطح أنت عليه الآن.

#### قاعدة #97 — التسمية منفصلة عن الـ code والهندسة؛ التسميات التشريحية تتبع المعيار ⭐ v65
ثلاث طبقات منفصلة لكل سطح: **(1) الـ surface code** المخزَّن (`teeth_status.surface` = M/D/O/…)، **(2) الهندسة** (أي موضع فيزيائي يُخصَّص لأي code — عبر `mesialOnRight`+`leftKey/rightKey`)، **(3) التسمية المعروضة** (`SURFACE_LABELS`). خطأ التسمية يُصحَّح في الطبقة 3 وحدها دون مساس بالطبقتين 1/2 ولا migration. المعيار التشريحي إلزامي: **M=mesial=إنسي** (نحو خط الوسط)، **D=distal=وحشي** (بعيداً عنه). (كانت معكوسة حتى v65). قبل تغيير أي تسمية: تأكّد ألّا منطق يقارن النص المعروض نفسه (فقط الـ keys).

#### قاعدة #98 — مصدر الحقيقة الواحد للخطط ⭐ v66
كود الخطة هو المعرّف الثابت (لا UI لتعديله أبداً). كل ما عداه (display_name/price/duration_days/features/icon/is_active/sort_order/entitlements) يُقرأ حيّاً من `subscription_plans` عبر `getPlanConfig`. **أي عرض لاسم خطة يمرّ عبر `planDisplayName(code)`** — ممنوع hardcode «سنوي/شهري» في الواجهة. label الحالة (computeAccountState) عرض فقط، لا يحمل اسم خطة.

#### قاعدة #99 — التقارير plan-agnostic ⭐ v66
MRR وأي حساب إيراد يُطبَّع عبر `monthlyEquivPrice(plan,price)=price×30÷duration_days` لا افتراض شهري/سنوي. التوزيع/الصحّة/قمع التحويل تمرّ على كل أكواد الخطط (خرائط {code:count})، فإضافة خطة جديدة لا تتطلّب أي تعديل في طبقة التقارير.

#### قاعدة #100 — RTL: لا أسهم اتجاه ⭐ v66
في النصوص ثنائية الاتجاه (عربي + لاتيني) تجنّب أسهم الاتجاه (←/→) لأنها تلتبس بصرياً؛ استخدم صياغة صريحة «من X إلى Y» أو وسمَين منفصلين («الحالية: X / المطلوبة: Y»).

#### قاعدة #101 — الموافقة على طلب اشتراك ⭐ v66
الموافقة تعيد استخدام transitionAccount: **التجديد (نفس الخطة) = حدث `renew`** (يمدّد من النهاية الحالية، يحفظ الأيام المتبقّية)؛ **تغيير الخطة = `convert_*`**. وقبل أي تحويل **أعد قراءة الطلب وتأكّد status='pending'** (حارس سباق ضد الإلغاء/التفعيل المكرّر).

#### قاعدة #102 — صفحة الاشتراك الذاتية لا تُحجب ⭐ v66
`subscription.html` غائبة عمداً عن autoGate PAGE_MODULE فلا تُحجب بالخطة أبداً — ليصلها المستأجر المحدود/المنتهي ويرقّي. تقرأ اشتراكه بالـ user_id ثم email (يصلح حسابات @sydent.com الهاتفية).

#### قاعدة #103 — دلالة مقعد الموظف موحّدة ⭐ v67
المقعد = موظف **نشط** (`is_active IS NOT FALSE`)؛ **المالك (`role='owner'`) لا يُحتسب أبداً**؛ التعطيل يحرّر مقعداً وهو عكوس. تُطبَّق هذه الدلالة بالضبط في **كل** أبواب الاستهلاك: إضافة، إعادة تفعيل، تنزيل الخطة، طلب الطبيب. أي بوّابة جديدة تستهلك مقعداً تتبعها.

#### قاعدة #104 — لا تنزيل فوق الحد (Option A) ⭐ v67
يُمنع تغيير الخطة لأصغر إن تجاوز الاستخدام النشط حدّ الخطة الهدف — لا يدخل أي حساب حالة فوق-حد بصمت (نمط seat-based: MS 365/Google/Slack/Dentrix). الحارس في `transitionAccount` (نقطة اختناق للموافقة + التغيير اليدوي، على `convert_*` فقط) + `subscription.html` (منع الطلب). لا قرار آلي يختار مَن يبقى — القرار للعميل (يعطّل أولاً). fail-open على فشل العدّ.

#### قاعدة #105 — الـ trigger يفرض عند استهلاك مقعد فقط ⭐ v67
`enforce_employee_limit` على `BEFORE INSERT OR UPDATE`، لكن يفرض الحد فقط حين `new_counts AND NOT old_counts` (الصف يصير نشطاً غير-مالك ولم يكن). فالتعديلات العادية (اسم/لون/PIN) والتعطيل والمالك لا تُفحص أبداً، والعيادات القديمة فوق-الحد تقدر تعدّل/تعطّل دون أن تكبر. العتبة `> v_limit` (الصف الجديد العادّ مضمَّن في العدّ).

#### قاعدة #106 — الكلاينت يطابق الـ trigger حرفياً ⭐ v67
أي فحص حدّ موظفين في الكلاينت يجب أن يطابق دلالة الـ trigger تماماً: `.not('is_active','is',false)` (= `is_active IS NOT FALSE`) + `.or('role.is.null,role.neq.owner')` (= `COALESCE(role,'') <> 'owner'`). التباين بين الكلاينت والـ trigger = حجب صامت/سماح خاطئ.

#### قاعدة #107 — ملف السياق لا يُرفع للريبو أبداً ⭐ v67
ملف السياق يحوي أسراراً (PAT، Service Key) ومكانه project knowledge فقط. `git add -A` قد يضمّه بالخطأ فيرفضه GitHub Push Protection. مُضاف لـ `.gitignore` (`SyDent_Context_md_*.md`)؛ تحقّق دائماً أن `git diff --cached` خالٍ منه قبل الدفع.

#### قاعدة #108 — keep-alive لمشروع Supabase المجاني ⭐ v68
الخطة المجانية تنام بعد 7 أيام بلا query فعلية (المنصة تظهر ميتة لكل المستأجرين + لا backups). للفترات الخاملة:
workflow على GitHub Actions يضرب ping مرتين أسبوعياً على endpoint anon-readable. لكن GitHub يعطّل الـ scheduled
workflows بعد 60 يوم خمول للريبو، فالـ workflow يحمي نفسه بـ marker commit عند ≥45 يوم. الحل دائماً مؤقت — قُرب
الإطلاق Supabase Pro (لا نوم + backups) هو الصحيح.

#### قاعدة #109 — مفاتيح Supabase الجديدة بترويسة apikey فقط ⭐ v68
مفاتيح Supabase الجديدة (`sb_publishable_`/`sb_secret_`) ليست JWT. تُرسَل في ترويسة `apikey` فقط؛ وضعها في
`Authorization: Bearer` يجعل البوّابة تحاول فكّها كـ JWT وترفض بـ HTTP 400. الـ SDK يتعامل مع هذا تلقائياً؛
المشكلة تظهر فقط في استدعاءات REST اليدوية (curl/workflows). وعند طلب أعمدة، استعمل عموداً موجوداً فعلاً (subscription_plans = `code` لا `id`).

#### قاعدة #110 — قسم Handover محمي append-only ⭐ v68
ملف السياق يحوي قسم «⚠️🔒 نقاط لازم تنتبه لها» موجّهاً للمبرمج المستقبلي. هذا القسم append-only: يُضاف عليه فقط،
لا يُحذف ولا يُختصر عند أي تحديث، حتى عند ضغط/أرشفة بقية الأقسام.

#### قاعدة #111 — حلّ تحذير إهمال Node على GitHub Actions = ترقية نسخة الـ action ⭐ v69
عند ظهور «Node.js 20 actions are deprecated»، الحل النظيف هو **ترقية الـ action لنسخة تُعلِن Node 24** (مثل
`actions/checkout@v5`)، وليس متغيّر البيئة `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` — هذا الأخير يُشغّل الـ action
على Node 24 لكن يبقي التحذير ظاهراً بسبب bug في GitHub (actions/runner#4295). تحقّق من action.yml للنسخة (runs:
using: node24) قبل الاعتماد عليها. ملاحظة: التحذير cosmetic ولا يكسر شيئاً، ويختفي تلقائياً عند تحويل GitHub
الافتراضي إلى Node 24 (≈16 يونيو 2026).

#### قاعدة #112 — دلالة التسويات المحاسبية (cash-basis) ⭐ v70
discount/write_off = تخفيض الشحنة (**ليس نقداً**) → يقلّل صافي الإنتاج + المستحق على المريض، **ولا يدخل صافي الربح**. refund = **نقد خارج** → يقلّل الإيراد المحصّل وصافي الربح؛ على مستوى المريض يستهلك الرصيد المقدّم أولاً، والفائض يعيد فتح المستحق. على مستوى العيادة: التسويات تُعرض كأسطر منفصلة على الإجمالي وتبقى **clinic-level لا per-provider** فلا تكسر اختبارات الحفظ (Test A/B على الإجمالي).

#### قاعدة #113 — أعد التحقّق من بنية HTML بعد أي دمج مع جلسة موازية ⭐ v70
دمج git «نظيف» (بلا تعارضات) قد يُنتج HTML مشوّهاً (مثل إسقاط سطر فتح `<div>` يترك modal-box في الـ document flow → صندوق ظاهر دائماً). بعد أي rebase/merge مع شغل جلسة موازية: شغّل **توازن div** (`<div` مقابل `</div>` لكل صفحة) + **صيغة JS** على كل الملفات الملموسة، لا تكتفِ بنجاح الدمج. (حادثة v70: sessionModal فقد الـ overlay.)

#### قاعدة #114 — لا تُشحن SQL/RPC مالي غير مختبَر للإنتاج ⭐ v70
لكود المال الذي لا يمكن live-testing، خطر إدخال خطأ توزيع/حساب أكبر من فائدة إصلاح حافة نادرة قابلة للاسترجاع. أبقِ منطق المال حيث يُختبر (الكلاينت) ما لم يوجد مسار رولّاوت مختبَر. نسخ inline متطابقة **أأمن** من اعتمادية مشتركة لا يمكن التحقّق من تحميلها على كود مالي.

#### قاعدة #115 — فحص الأسرار: grep بلا head ⭐ v70
عند فحص الأسرار شرطياً، استخدم `git diff | grep -qiE "PATTERN"` **بدون** تمريره عبر `head` — لأن `head` (وأي أمر ينجح دائماً) يُخفي exit code الخاص بـ grep فيعطي إنذار «سرّ موجود» كاذباً. (ظهر إنذار كاذب في v70 بسبب `grep … | head -3`؛ التحقّق المصحّح بلا head أكّد صفر أسرار.)

#### قاعدة #116 — افصل دورة الفوترة عن التيار (نموذج Stripe Product→Prices) ⭐ v71
لا تخبز دورة الفوترة (شهري/سنوي) داخل اختيار التيار/الخطة. كل تيار (صف كتالوج) يحمل **عدّة أسعار** (`price_monthly` + `price_yearly`، nullable = الدورة غير معروضة)، والدورة المختارة تُخزَّن على **الاشتراك نفسه** (`billing_cycle`)، لا على التيار. هذا = نموذج Stripe «Product → multiple Prices» / Chargebee «price points» / Paddle «swap-prices». مدد الدورات تبقى ثوابت بطبقة التطبيق (`CYCLE_DAYS={monthly:30, yearly:365}`) لا أعمدة DB. يمكّن التيار الواحد من الفوترة بأي دورة، والمستخدم يختار الدورة وقت التجديد/التغيير.

#### قاعدة #117 — لا تُعِد تسمية مفاتيح فوترة حيّة لمكسب تجميلي ⭐ v71
أكواد التيار/الخطة (`'monthly'`/`'yearly'` كـ PK في `subscription_plans`) هي **معرّفات opaque ثابتة**؛ `display_name` هو ما يراه المستخدم. إعادة تسمية PK على صفوف مشتركين في الإنتاج = عملية all-or-nothing خطرة (تحديث FKs + كل الإشارات + الأحداث التاريخية) لمكسب تجميلي بحت. أبقِ الأكواد كما هي ووثّقها كـ legacy بتعليق سطري. التسمية المعروضة منفصلة عن المفتاح (امتداد لقاعدة #97 على طبقة الفوترة).

#### قاعدة #118 — الحساب الدائم (trial_end=NULL) مُستثنى موحّداً من التجديد/التغيير/MRR ⭐ v71
الحساب الدائم يجب أن يُستثنى **بدلالة واحدة** عبر كل المسارات: (1) حارس في برانش renew بـ `transitionAccount` (يرفض بـ error صريح — التجديد يهدم الدوام)، (2) UI التينانت (لا أزرار تجديد/تغيير + بانر دائم)، (3) **helper موحّد واحد** للـ MRR التاريخي (`rptEventBucket`) لأن `make_permanent` يُسجَّل كـ `convert_yearly` + `to_trial_end=NULL` فبدون فلتر `to_trial_end` يُحسب خطأً كمشترك سنوي مدفوع. أي مسار يُهمل أحد الثلاثة = drift في الدوام أو الإيراد.

#### قاعدة #119 — Dead write-paths: وثّق، لا تحذف (لأنها read-paths) ⭐ v71
حين يفقد مسار كتابة آخر caller بعد refactor (مثل `convert_monthly`/`convert_yearly` بعد أن صار التحويل عبر `convert_plan` في X13)، **لا تحذفه** — وثّقه كـ dead write-path. السبب: قيم الأحداث القديمة المخزّنة لا تُحذف، فالكود لا يزال **يقرؤها** في الـ replay التاريخي (مخطّطات MRR/الأحداث) والـ labels. حذف الفرع يكسر عرض السجلّ التاريخي. الحذف الآمن يتطلّب أيضاً migration لإعادة ترميز الأحداث القديمة — وهو خطر بلا فائدة.

#### قاعدة #120 — حافظ على ملف السياق نظيفاً دورياً (log-rotation) ⭐ v72
ملف السياق يكبر ~100 سطر كل إصدار؛ النفخ يرفع كلفة الـ tokens ويُغرق المهم. دورياً (أو حين يكبر بوضوح): (1) **ادمج السجلّات المكرّرة** — وحّد «سجل التحديثات» في فهرس مختصر سطر-سطرين لكل إصدار، وأبقِ كتلة الافتتاح على آخر ~3 إصدارات فقط (الباقي في الفهرس + كتل الملخّص). (2) **اضغط سرد الإصدارات القديمة** (جولات الـ audit، تتبّع cache-bust، إصلاحات blow-by-blow) إلى الجوهر: ماذا/لماذا + SHA + رقم migration + رقم rule. (3) **شرط السلامة الإلزامي (الملف خارج git — لا undo):** نسخة أرشيفية كاملة أولاً، ثم audit قاعدة #79 (التوكنات الكاملة للأسرار + كل migration/rule مميّز **يجب ألا يُفقَد**؛ ذِكرها التكراري في السرد قد يقلّ، لكن لا يُحذف السرّ نفسه ولا أي migration/rule مميّز)، ثم `comm` على عناوين الأقسام (صفر فقدان). (4) **لا تُلمَس أبداً:** الأسرار (PAT/Service Key/project ref)، المواصفات التقنية (SQL/schema/URLs)، القسم المحمي «نقاط لازم تنتبه لها» (#110)، كل القواعد الذهبية، البنية المعمارية، الحالة الحالية. (5) **Chesterton's Fence:** لا تحذف قصة بَغ مُصلَّح إلا إذا (أ) درسها تحوّل لقاعدة ذهبية، **و**(ب) الكود صار محصّناً بنيوياً فلا يعود البَغ — وإلا حوّلها لقاعدة ذهبية أولاً ثم اضغط السرد.

#### قاعدة #121 — تسجيل الدفعة منفصل عن تحويل دورة الحياة ⭐ v73
دفتر النقد المحصّل (`subscription_payments`) سطرٌ **مرتبط** بحدث دورة الحياة (`event_id`)، **لا** مُشغّل له. التحويلات تبقى عبر `transitionAccount` (نقطة الاختناق الذرّية)؛ الدفعة تُسجَّل بعد نجاح التحويل (`srqApprove` hook) أو يدوياً (Customer 360). هذا يفصل «المبلغ النظري» (المخزّن على الحدث) عن «النقد الفعلي المستلم» (المخزّن على الدفعة: تاريخ/طريقة/مرجع) — وهو جوهر دفتر الدفعات في نموذج يدوي (يكشف الفرق بين MRR النظري والتحصيل الفعلي). الحذف ممنوع — **soft-void فقط** (`voided_at/by/reason`، مستثنى من المجاميع) امتداداً لفلسفة Migration 25 immutable audit. الربط بالحدث best-effort/nullable (graceful لو RLS منع قراءة id الحدث).

#### قاعدة #122 — وحّد المفردة مع النظام القائم قبل إضافة CHECK جديد ⭐ v73
قبل كتابة CHECK constraint بمفردة (أكواد enum)، **تحقّق بـ grep من المفردة المستعملة في المسار القائم** الذي سيغذّي العمود. مثال v73: كُتب `bank_transfer` بـ Migration 47 بينما الطلبات (`subscription_requests.payment_method` + `SRQ_METHOD_AR`) تستعمل `transfer` → كان رح يطيح على الـ CHECK وقت التعبئة التلقائية من الطلب؛ صُلِّح بـ Migration 47.1 على جدول فاضٍ (drop/recreate). المفردة الواحدة عبر المنصّة (Rule #66) تُجنّب طبقة mapping وتضارب القيم. لو الجدول مش فاضي، التوحيد يحتاج backfill — فالفحص قبل التثبيت أرخص.

#### قاعدة #123 — المفاتيح ذات الامتياز (service_role) لا تلمس المتصفّح أبداً → Edge Function + تعطيل المفتاح المكشوف ⭐ v75
أي مفتاح يتجاوز RLS (`service_role` / secret) **يجب ألا يصل المتصفّح إطلاقاً** — لا في كود client-side ولا في الـ bundle.
النمط الصحيح (Stripe / Microsoft Partner Center): publishable key علني في المتصفّح + RLS، والمفتاح السرّي server-side فقط.
في SyDent (Phase E): كل عملية privileged (auth admin API + counts تتجاوز RLS) تمرّ عبر **Edge Function واحدة dispatch**
(`admin-ops`) بـ `verify_jwt` مُطفأ + **auth داخلي** (service-role client من `Deno.env` + `getUser(jwt)` على JWT الأدمن +
فحص `platform_admins`، **fail-closed**) — الأدمن يبعت JWT جلسته، الـ function تتحقّق ثم تنفّذ. الـ function تقرأ المفتاح من
`Deno.env` فقط (`SUPABASE_SERVICE_ROLE_KEY` — يحمل الـ secret الجديد تلقائياً في نظام المفاتيح الجديد). **وإذا كان المفتاح
القديم قد تسرّب فعلاً (git history / كود قديم / محادثة) فلا يكفي حذفه — يجب تعطيله أو تدويره** (Supabase: «Disable JWT-based
keys») وإلا يبقى صالحاً. قبل التعطيل: تأكّد بـ grep أن لا مكوّن (workflows / Render / مشاريع أخرى) يستعمل المفتاح القديم، ثم
عطّل واختبر **فوراً** مع شبكة أمان (إعادة تفعيل). دروس Phase E: (1) deploy عبر Dashboard editor (لا CLI/Docker) — الريبو =
مصدر الحقيقة (`supabase/functions/admin-ops/index.ts`، لا versioning في Dashboard). (2) تجنّب `SUPABASE_ANON_KEY` env داخل
الـ function (قد يحمل legacy JWT معطّلاً — issue معروف)؛ استعمل `SUPABASE_SERVICE_ROLE_KEY` فقط. (3) الـ callers تحافظ على
عقودها (fail-open-to-null للقراءات، boolean graceful للكتابات). (4) ترحيل تدريجي مُختبَر مرحلة-مرحلة (scaffold → reads →
writes → removal) أأمن من cutover دفعة واحدة.

#### قاعدة #124 — عرض دورة الفوترة منفصلة عن التيار والحالة (post-X13) ⭐ v76
بعد فصل الدورة عن التيار (X13)، اسم التيار (Mini/Max) وحده ما عاد يدلّ على الدورة — نفس التيار يُفوتَر شهري أو سنوي. لازم تُعرض الدورة (من عمود `billing_cycle`) في **كل مكان يُلخَّص فيه الاشتراك** (بطاقة الطلب، شارة القائمة، كتلة 360، الدفعات). استعمل helper null-safe (`cycleLabelArOrEmpty`): يرجّع «شهري»/«سنوي» للدورة المضبوطة و«» للـ NULL — **لا تستعمل `cycleLabelAr`/`normCycle` للعرض** لأنها تفترض أي قيمة ≠yearly = monthly فتعرض «شهري» خطأً للتجربة/الحساب الدائم اللي بلا دورة. والحارس ضد عودة باگ «سنوي سنوي» (live-test fix #1): label الحالة يحمل **كلمة الحالة فقط** («نشط»)، والدورة بُعد منفصل عنه فإضافتها آمنة. [admin.html: بطاقة الطلب renderSubRequests + شارة القائمة renderList + كتلة c360BuildOverview — `ae17881`.]

#### قاعدة #125 — الحارس `x ? x() : fallback` لا يحمي من ReferenceError لمعرّف غير مصرَّح ⭐ v76
الإشارة لمعرّف **غير مُصرَّح إطلاقاً** (مش property على object) ترمي `ReferenceError` فوراً عند التقييم — **حتى داخل شرط ternary**. فـ `evfEventTypeLabel ? evfEventTypeLabel(x) : fallback` لا ينجو إذا كانت `evfEventTypeLabel` غير معرّفة أبداً (تنجو فقط لو معرّفة بقيمة falsy). النتيجة: استثناء يطيح كل دالة العرض ويُسقط التبويب على حالته الفارغة بصمت عبر الـ catch (هون: تبويب السجل بـ 360 أظهر «لا يوجد سجل» رغم وجود الأحداث). الدرس: لا تفترض وجود دالة helper — استعمل المصدر الكنوني الموجود فعلاً (الماب `EVF_EVENT_TYPES` بدل دالة وهمية). والـ validator `vm.Script` **لا** يمسك هذا (صيغة سليمة، الخطأ runtime) — يُمسَك فقط بالـ live test / console (قاعدة #19). [من باگ تبويب السجل بـ Customer 360، `aca4c70`.]

#### قاعدة #126 — فرض 12 ساعة AM/PM على `<input type="time">` = wheel-picker مخصّص، لا `lang` ⭐ v77
Chromium **يتجاهل** `lang="en-US"` على `<input type="time">` (يتبع locale النظام، فيبقى 24h لو الجهاز عربي/أوروبي) — مجرّبة وفشلت وأُزيلت. الحل الموثوق: ملف مشترك `timepicker.js` يرقّي العنصر لـ wheel-picker (دواليب scroll-snap بنمط آيفون) **مع الحفاظ على عقد القيمة**: نفس الـ id، ونعترض `.value` (get/set عبر `Object.defineProperty`) فتبقى "HH:mm" 24h حسب مواصفة HTML → **صفر تغيير على أي منطق قراءة/كتابة**؛ prefill برمجي يزامن الدواليب؛ التغيير يُطلق input/change؛ graceful (فشل التحميل = picker أصلي يبقى). حقول `type="number"` (مُدد بالدقائق، مش أوقات يومية) لا تُلمَس. [`dd4e880`، timepicker.js.]

#### قاعدة #127 — اقرأ حالة scroll/layout **قبل** إخفاء العنصر (display:none → scrollTop=0) ⭐ v77
عنصر داخل شجرة `display:none` غير مُخطَّط فيرجّع **`scrollTop === 0`** (وكل أبعاده صفر). أي منطق يقرأ موضع scroll لاستخلاص قيمة (هون: العجلة المتمركزة = الوقت المختار) **يجب أن يُنفَّذ قبل إخفاء العنصر، لا بعده**. الباگ الفعلي (`e538449`): `close()` شالت class الـ `open` (popover → display:none) ثم نادت `commit()` اللي تقرأ `scrollTop` → كله صفر → readWheels ترجّع أول صف بكل عجلة = «01:00 AM» مهما اختار المستخدم. الحل: `commit()` ثم `remove('open')`. الـ validator لا يمسك هذا (runtime) — يُمسَك بالـ live test (قاعدة #19).

#### قاعدة #128 — بادج التذكير = تنبيه (nag) vs سجل (record): الوصول يخفي التنبيه فقط ⭐ v77
ميّز بين **التنبيه** القابل للإجراء («⚠️ أرسل تذكير») و**السجل** المعلوماتي («✓ تم التذكير»). الوصول الفيزيائي (الضغط «وصل» = `arrived_at`/`seated_at`/`dismissed_at`) يجعل **التنبيه** بلا معنى فيختفي — لكن **السجل** يبقى (وثيقة أن التذكير أُرسل). تطبيقياً: ضع فحص الوصول **بعد** فحص الـ reminder-log لا قبله (الترتيب الخطأ يخفي السجل كمان — باگ `e54694e` صُحّح بـ `733c2fe`). تحذير معماري: الوصول يكتب **timestamp فقط ولا يغيّر `status`** (يبقى confirmed/scheduled) فـ `isFinishedStatus()` لا يمسكه — لازم فحص صريح للـ timestamps. `confirmed_at` (تأكيد تلفون) **لا** يخفي التنبيه (التأكيد والتذكير-قبل-الموعد مستقلّان). [classifyReminderForAppt (appointments) + renderDashWaBadge (index).]

#### قاعدة #129 — عرض الوقت 12h AM/PM عبر helper موزّع؛ المنطق/البيانات تبقى 24h ⭐ v77
كل **عرض** للوقت للمستخدم = 12h «hh:mm AM/PM» عبر helper موحّد `fmtTime12("HH:mm")` (موزّع بكل ملف عرض — نمط الـ helpers الموزّعة، بلا تبعية runtime بين الملفات)؛ التواريخ-من-Date تستعمل `toLocaleTimeString('en-US',{hour12:true})`. **لا تحوّل أبداً** ما هو منطق أو بيانات: حسابات الوقت (مقارنات diff/now)، بناء iso strings للفرز/التحليل، الطوابع المخزّنة بالـ DB (`paid_at`)، طوابع CSV (تبقى 24h لا-لبس). امتداد: الوقت المضمّن بنصوص الـ audit-log **مخزّن** وقت الإجراء → تحويله **للأمام فقط** (الصفوف القديمة تبقى بصيغتها). [`f15030a`→`ab6efea`.]

#### قاعدة #130 — view-toggle = مصدر حقيقة وحيد + حافظ على حُرّاس الكتابة ⭐ v77 (امتداد #66)
عند إضافة «مفتاح عرض» (مثل active/archived بسجل النشاطات): مرّر **كل** استعلامات القراءة عبر helper واحد (`isArchivedView()`) = مصدر الحقيقة الوحيد، بدل تكرار الشرط بكل استعلام (هون: 7 استعلامات). وأي **حارس كتابة** (مثل UPDATE الأرشفة الذي يجب أن يبقى على `is_archived=false`) احفظه على قيمته الصريحة ولا تربطه بالعرض المختار. [audit-log archived view + restore، `22e376b`.]

- **#131 — جداول السجل/الأحداث (audit/event) لازم تكون INSERT + SELECT فقط على RLS، لا FOR ALL.** سجل الفوترة tamper-evident حتى ضد الأدمن (نمط Stripe). المرجع: `subscription_events` كانت FOR ALL (صُلّحت Migration 49)، بينما `platform_settings_audit` بُنيت صح من البداية. أي جدول append-only جديد = صلاحيتان منفصلتان (insert + select)، لا سياسة واحدة FOR ALL.

- **#132 — افحص حالة RLS الحيّة بسكربت تشخيص قبل أي قرار، لا تثق بالمستودع.** المستودع ناقص (30/48 migration) ونُسخ بعض migrations قديمة. الاستعلام الموحّد (pg_policies + pg_class + pg_proc → تقرير normalized بنتيجة واحدة) هو مصدر الحقيقة. تعميق لـ Rule #76. ملف التشخيص: `rls_audit_unified.sql` (للقراءة فقط، آمن لإعادة التشغيل أي وقت).

- **#133 — تحقّق من مصدر الحقل قبل «إصلاح» علم XSS.** الـ heuristic (grep) يطلّع false positives. مثال v78: علم على `appointments.html` lb.title/color/icon بدا حقن XSS، لكن `getApptLabBadge` يرجّعهن **ثوابت مكتوبة بالكود** (emoji/hex/نص عربي حسب حالة المخبر) — مش من المستخدم. تهريب ثوابت = churn بلا فائدة. اقرأ مصدر القيمة (الدالة المنتِجة) قبل التغليف بـ escapeHtml.

- **#134 — عدم تطابق المعرّفات: `treatment_key` (مفتاح منطقي) ≠ `dbId` (UUID القاعدة).** في `patient-profile.html`, `TREATMENTS[].id` = `treatment_key` نصّي، لكن صفّ العلاج يحمل أيضاً `dbId` = UUID الحقيقي لجدول `treatments`. أي استعلام على جدول يربط بـ `treatments.id` (UUID) — مثل `treatment_materials.treatment_id` — لازم يمرّ بـ **`getTreatment(key).dbId`** أولاً، لا بـ `.id` المنطقي، وإلا صفر مطابقة بصمت. (المرجع: P3 خصم المواد انكسر — commit `22a2e2f`. امتداد لـ Rule #59: تحقّق من نوع/مصدر المعرّف لا اسم العمود فقط.)

- **#135 — خصم المخزون: كمية طازجة + clamp صفر + hook معزول graceful.** عند خصم مادة مستهلكة: (1) اقرأ الكمية الحالية **طازجة من القاعدة لحظة الخصم** لا من cache (تفادي race-condition)، (2) **clamp على صفر** (لا كمية سالبة أبداً)، (3) الـ hook **معزول** — فشله لا يكسر حفظ الجلسة (المالية أولاً، المخزون ثانوي). يُطبّق على **كل** مسارات إكمال الجلسة دفعة واحدة (`saveSession` + `saveToothTreatment` + `saveToothAndOpenLab`). (المرجع: P3، commits `00b9a96`+`71e01cc`. امتداد لـ Rule #66.)

- **#136 — نافذة قائمة عمل مشتقّة من تنبيه = طابِق سقف التنبيه بالضبط.** أي قائمة عمل مجمّعة (worklist) تُبنى فوق نظام تنبيه/badge موجود لازم تستخدم **نفس عتبة النافذة** التي يستخدمها التنبيه، وإلا يظهر عنصر عليه badge لكنه غائب عن القائمة (أو العكس) = تناقض يربك المستخدم. (المرجع: P4-B — قائمة الاتصالات رُبطت بـ `whatsapp_reminder_hours_before + 24` = نفس سقف `classifyReminderForAppt`، commit `9012524`.)

- **#137:** الأكواد المركّبة على `surface` تسمية كلينيكال بحتة — صفر تأثير مالي (نفس مبدأ السطح المفرد؛ surface لا يُقرأ في FIFO/splitIsEarned/A–E).

- **#138:** للمجموعات المفتوحة المرتّبة (combos)، **regex CHECK أنظف من تعداد ARRAY** (يفرض الترتيب + يمنع التكرار + superset تلقائي للمفردات في تعبير واحد).

- **#139:** نمط `effectiveSurfaceTreatment` — resolver توسيع المركّب للرسم (المفرد الصريح أولاً ثم المركّب)، لمسة قيمة-فقط بدوال الرسم **بلا مساس بالهندسة** (يحفظ إصلاحات هندسية سابقة).

- **#140:** مسارات الجلسات **الجماعية** (regional: arch/quadrant/mouth) لازم تستدعي `renderTeeth()` بعد الحفظ/الحذف/التعديل — تحديث الإحصاء/السجل وحده **لا يعيد رسم المخطط** (السبب الجذري لـ«ماظهر التقويم»، `0546eed`).

- **#141:** «استعادة الافتراضي» يجب أن تكون **إضافية** (add-missing بالمفتاح أو الاسم) لا تدميرية (delete-all + reseed) — تحمي العلاجات المخصّصة (`e8d4ed7`).

- **#142 — حجب الخطة في SyDent له 4 أسطح لا 3، والسايدبار يحجب عبر allowlist `GATEABLE` صريحة لا حسب nav id.** أي موديول قابل للحجب لازم يُضاف لـ **أربعة** أماكن متطابقة الترتيب: (1) `admin.html` `PLAN_ENTITLEMENT_DEFS` (زر الأدمن)، (2) `supabase-init.js` `PAGE_MODULE` (حجب الصفحة/autoGate)، (3) `sidebar.js` `navItems[].id` (تعريف العنصر)، (4) `sidebar.js` `GATEABLE` (إخفاء العنصر من القائمة). **الفخّ:** وجود `id` بالـnav + استدعاء `SyDentPlan.can(id)` لا يكفي — الفلترة تمرّ على مصفوفة `GATEABLE` المكتوبة يدوياً فقط، فموديول غائب عنها يبقى ظاهراً بالقائمة رغم حجب صفحته بنجاح. (حجب **الأدوار** عبر مصفوفات `BLOCKED` منفصل كلياً عن حجب **الخطة**.) لا migration للموديول الجديد: `entitlements` JSONB حرّ + `SyDentPlan.can` fail-open (مفتاح غائب = مفعّل/grandfather). المرجع: تكامل المخزون `17e7016`→`931bc48` — السطح الرابع فاته التدقيق الأولي وكشفه الاختبار الحي (تعميق لـ Rule #19).

- **#143 — سجلّات لكل مريض ≠ مكتبة قوالب مشتركة؛ الميزات «وثيقة + قوالب» تطابق نمط الروشتات (3 مودالات).** أي ميزة تُنتج وثيقة قابلة لإعادة الاستخدام (روشتة، تعليمات بعد جلسة، …) = **سجلّات لكل مريض** بتبويبه (جدول `*_notes` بـ patient_id) + **مكتبة قوالب owner-scoped منفصلة** (جدول `*_templates` بلا patient_id) + 3 مودالات: (1) إنشاء سجل بـ«تعبئة من قالب» + «حفظ كقالب»، (2) مدير قوالب (قائمة + جديد)، (3) تعديل قالب (insert-or-update). الخطأ الشائع: إظهار مكتبة القوالب نفسها كأنها سجلّات المريض (كل مريض يرى قوالب الآخرين). المرجع: P6 Part A أُعيد بناؤها بعد ملاحظة المالك (مطابقة لنمط prescriptions المعتمد).

- **#144 — حفظ الإعدادات: حلقة graceful column-drop عامة (drop-any-missing-and-retry) لا fallback لعمود واحد.** عند حفظ صفّ إعدادات قد يحوي أعمدة اختيارية حديثة، استخدم حلقة (`_optionalCols` + `_guard`) تسقط **أي** عمود مفقود (42703/PGRST204) وتعيد المحاولة حتى ينجح الحفظ بالأعمدة المتوفّرة فقط — فالإعدادات الأساسية تُحفظ دائماً مهما كان ترتيب deploy↔migration. تعميم لـ Rule #135/#2 (من عمود-واحد إلى أي-عمود). المرجع: P6 settings.html saveClinicSettings.

- **#145 — Recall/«آخر زيارة» يجب أن يستثني صفوف رسم عدم الحضور.** صفّ رسم عدم الحضور `status='completed'` لكن المريض **لم يحضر** (`description='رسم عدم الحضور'`). أي اشتقاق لـ«آخر زيارة فعلية» (للـRecall، birthday-since، إلخ) من `ledger_sessions` المكتملة لازم يفلتر هذه الصفوف، وإلا يُحسب عدم-الحضور كزيارة فيُكبَت الاستدعاء خطأً. المرجع: P6 patients.html lastVisitMap.

- **#146 — المواد تُستهلَك عند الإنجاز لا عند التخطيط؛ وكل مسار يقلب planned→completed يجب أن يطلب خصم المواد.** طلبا الخصم بمسارَي حفظ مخطط الأسنان مبوّبان على `pendingTreatStatus==='completed'` (saveToothTreatment + saveToothAndOpenLab — كلاهما يقبل planned)؛ الجلسة المخطّطة تطلبه لحظة الإكمال: **completeSessionFromProfile** (فردي؛ حلّ name/label→treatment لأن ledger_sessions يخزّن `type` لا treatment_key — تتمّة #134؛ `_other` يُتجاهل؛ المختصر completeToothPlannedFromModal مغطّى لأنه يمرّ بنفس الدالة) و**completeApptWithProcedures** (جماعي؛ hook وحيد قبل return true يغطي كامل/subset/dismissed؛ تجميع qty_per_use×عدد الجلسات لكل علاج؛ تُخصم الجلسات الناجحة فقط عبر completedForDeduct). saveSession يحفظ completed دائماً فطلبه عند الحفظ صحيح. **صيانة المرآة (نمط FIFO mirror):** apptPromptMaterialDeductionBulk/apptConfirmMaterialDeduction (appointments) ↔ maybePromptMaterialDeduction/confirmMaterialDeduction (profile) — أي تغيير بدلالات الخصم (fresh-read، clamp، أعمدة الحركة، is_active) يُحدَّث بالنسختين. حلّ المستأجر: treatments بـdoctor_id، treatment_materials/inventory_* بـowner_id (القيمتان متطابقتان بنموذج auth الواحد). المرجع: `4284d17`.

- **قاعدة #147 — الصفحة العامة الجديدة standalone:** `isPublicPage()` regex وautoGate skip-list **لا يشملان** أي صفحة جديدة؛ تحميل supabase-init.js على صفحة عامة يشغّل SyDentLock.autoInit (استعلامات anon ميتة + بوابة PIN محتملة). الحل المعياري: client خاص inline بـ`persistSession:false` وصفر ملفات مشتركة (= صفر cache-bust). **تكرار URL/KEY مقصود — تدوير المفتاح يستلزم تحديث book.html يدوياً** (watch-point #11).

- **قاعدة #148 — فخ `document.querySelector('form')`:** openModal بالمواعيد يصفّر **أول** `<form>` بالمستند (والوحيد حالياً = فورم المودال سطر 1049). أي حاوية/تبويب يُحقن قبله بالـDOM **ممنوع** يحوي `<form>` — وإلا تلوث صامت لحقول المودال.

- **قاعدة #149 — التعيين البرمجي على `<select>`:** قيمة بلا `<option>` مطابق **تفشل بصمت** (تبقى القيمة القديمة — fDuration كان سيحفظ 60 لطلب 15 ويبتلع الـslots المجاورة). النمط: عيّن → افحص `sel.value !== المطلوب` → احقن option ديناميكياً → أعد التعيين. والوقاية: حصر الخيارات بالمصدر (slot الإعدادات = 30/45/60 حصراً).

- **قاعدة #150 — نمط السطح المجهول (anon surface):** جدول deny-all (صفر سياسات anon) + دوال SECURITY DEFINER بـ`SET search_path=public` كباب وحيد؛ **rate-limit داخل الدالة لا بالسياسات** (subquery على نفس الجدول بسياسة = recursion #42، وعبر الجداول يُقيَّم بسياق anon الأعمى)؛ UNIQUE جزئي = حارس السباق؛ idempotent re-submit للمدخل المكرر؛ مخرجات صفر-PII بنطاق مسقوف؛ فلتر حالات **سلبي** (المستقبلي يُحجب افتراضياً)؛ توقيت السوق ثابتاً بالدالة (`Asia/Damascus`)؛ العداد بكل الحالات والحذف هو التصفير الوحيد.

- **قاعدة #151 — فخ Bidi-Mirrored في RTL:** المحارف ذات خاصية Bidi_Mirrored (‹ › < > والأقواس…) **تنعكس بصرياً** عندما يكون اتجاهها المُحسوم RTL؛ زرّ/عنصر محتواه محرف محايد **وحيد** يرث اتجاه الفقرة (`dir=rtl`) فينقلب رسمه مع بقاء الوظيفة صحيحة — افحص الرسم والوظيفة **منفصلين**. الحل البيتي: `direction:ltr` على العنصر الأيقوني (`.cal-nav`)؛ بدائل آمنة: محارف غير معكوسة (◀ ▶ / ← →).

- **قاعدة #152 — سقوف anon endpoints ديناميكية بمرايا متزامنة:** حدّ النطاق بدالة anon يقارن بقيمة **المستأجر المخزّنة** (تُقرأ داخل الدالة — `SELECT INTO` من دالة المعلومات يدمج بوابة التوفر: 0 صف ⇒ NULL ⇒ RETURN) + **سقف مطلق واحد** كحارس abuse/typo (`LEAST(GREATEST(v,1),365)`) — **لا ثابت منتج hardcoded**. وأي سقف له طبقات مرآة (RPC guard + clamp العميل + input max + **save clamp**) تُحدَّث **كلها معاً** — save clamp تحديداً يفسد بصمت: يخزّن المقصوص والمستخدم يظن قيمته حُفظت (الـ90 خُزّنت 35). بعد رفع سقف الحفظ: **إعادة حفظ الإعداد إلزامية**.

- **قاعدة #153 — show-acts للبطاقات أزرارها-فقط:** `@media .list-actions{display:none}` افتراضُ تبويبِ القائمة (نقر الصف = المسار البديل للموبيل)؛ أي بطاقة تفاعلها **الوحيد** داخل `.list-actions` (بلا onclick للصف — كبطاقات الحجز) تكون **ميتة كلياً عالموبيل** — أعطها modifier (`show-acts`): override أعلى specificity داخل نفس الـmedia يعيد الأزرار صفاً ثانياً كامل العرض (flex-wrap + لمس ≥40px) + `.list-info{min-width:0}` (محتوى unbreakable كالهواتف يكسر flex بدونها)؛ ولا تطبع div أزرار **فارغاً** (صف منقّط فارغ). أزرار الإجراءات المصيرية تُعنوَن نصاً لا إيموجي فقط.

- **قاعدة #154 — [طلب صريح من المالك] مراجعة القواعد قبل التنفيذ:** قبل أي تنفيذ، تُراجَع قواعد الملف ذات الصلة أولاً ثم يُنفَّذ. (السبب: خرق #59 مرتين بجلسة 12/6 — أعمدة وهمية بالـselect، وأنكورات متعددة الأسطر غير مفحوصة.)

- **قاعدة #155 — كنس الألوان يصنّف السياق إلزامياً:** CSS-context → var()؛ أما data/attr-context → **hex حرفي**: خصائص SVG (stroke/fill/stop-color)، setAttribute، canvas (fillStyle/strokeStyle/addColorStop — Chart.js)، meta theme-color، manifest.json، favicon، قيم تُحفظ بالـDB، fallbacks الموازية لـhex من DB.

- **قاعدة #156 — تعزيز #59:** PostgREST يرجع **400 لأي عمود غير موجود بالـselect** حتى لو القراءة «دفاعية» بالـJS — grep الصفحة الأم للأعمدة قبل أي select جديد، دائماً.

- **قاعدة #157 — meta theme-color وmanifest.json لا يقبلان var():** حرفي فقط (دارك `#0a1628` / لايت `#f4f7fa`).

- **قاعدة #158 — التحقق من النشر برابط الـdeployment الفريد:** `https://<hash>.sydent.pages.dev` = اختبار صفر-كاش قاطع؛ Cloudflare Pages → Deployments يعرض SHA كل نشرة.

- **قاعدة #159 — الاستبدال بالموضع عند فشل الأنكور:** أنكورات متعددة الأسطر قد تفشل بـwhitespace خفي — البديل المعتمد: index splice بالموضع بدل المطابقة النصية.

- **قاعدة #160 — نمط الحراسة M61 (تعميم نمط M56):** كشف وجود العمود بدل الافتراض: `window.__m61`/`__m61T` = `'post_extraction' in rows[0]` من select('*')؛ **كل** سلوك جديد (خيارات/توغل/payloads/حفظ/فروع/قوالب) محروس به → النشر قبل الميغريشن آمن 100%. ملاحظة مرافقة: **خرائط التحميل تُسقط الأعمدة غير الممرّرة** — أي عمود جديد يُضاف صراحةً للـmapping رغم select('*').

- **قاعدة #161 — جرد التعديلات مقابل المخطط قبل الكومت:** بدفعة batch سقط بلوك مخطط (C10 سلك الفجوة) سهواً وانكشف باللايف فقط — قبل كل كومت متعدد القطب: grep-جرد كل بند من خطة التنفيذ والتحقق من وجوده بالملف.

- **قاعدة #162 — سطح SOCKET لعلاجات ما-بعد-القلع (نمط SPACER):** علاج `post_extraction` على سن مقلوع يُخزَّن بـ`surface='SOCKET'` = صف teeth_status **منفصل** عن القلع (WHOLE='extracted') → الشبح يبقى ويُرسم اللون فوقه بالعرضين (fill 0.32 تحت التقطيع). **صفر أثر مالي** (surface تسمية بحتة). إلزامي: `undoExtraction` ينظّف SOCKET بفرع القلع البسيط (لا صف يتيم)، وفرع إزالة الجسر **يُبقيه** (الأسنان تبقى مقلوعة). الحفظ عبر fallback آمن (يعدّل status لا surface فلا يدهس WHOLE).

- **قاعدة #163 — PostgREST bulk-insert يكتب NULL لا DEFAULT:** عند `insert([...])` بمصفوفة، PostgREST يبني أعمدته من **اتحاد مفاتيح** كل العناصر ويكتب NULL (لا قيمة العمود الافتراضية) لأي صف ينقصه مفتاح → أي عمود NOT-NULL **يجب بذره صراحةً على كل صف** (`Object.assign({col:default}, row)`). (صيد restore-defaults 400.) لا ينطبق على الحفظ المفرد single-row.

- **قاعدة #164 — حماية الحذف وفلتر «مخصصة» مصدرهما isProtectedTreatment = كاشفات هندسة المخطط حرفياً:** (extraction/implant/bridge/orthodontics/spacer، مع استثناء `custom_` أولاً). تعديل فئة/هدف علاج افتراضي يجب ألّا يفك حمايته (المطابقة على key **و** target_part **و** category). `resetToDefaults` يجب أن يبقى additive (لا يحذف صفوفاً موجودة — فقط يضيف القوالب الناقصة).

- **قاعدة #165 — هوية المصادقة الكانونية (تسجيل الحساب، v87):** الهاتف **إلزامي** والإيميل **اختياري**؛ `auth.users.email` الكانوني = الإيميل الحقيقي إن وُجد وإلا `{digits}@sydent.com`. **لا يُمسّ أي مُعرّف موجود أبداً** (#62). التخزين: `trial_requests.phone` دائماً + `email`=الكانوني. منع `@sydent.com` كإيميل مستخدم + منع إيميل-فقط. النشر آمن بأي ترتيب (الـmigration إضافي + الكود فيه fallback؛ المستخدمون الحاليون صفر تأثير).

- **قاعدة #166 — `resolve_login_email(text)` (Migration 65، SECURITY DEFINER STABLE، grant anon):** يربط مُدخل (هاتف **أو** إيميل) بالإيميل الكانوني الموثوق عبر `auth.users` **بمرساة user_id** (لا `trial_requests.email` — قد يختلف لصفوف legacy، أُكِّد حياً: trial synth=5 ≠ auth synth=3). **anti-enumeration:** يرجّع نصاً دائماً ولا يرفع خطأ؛ هاتف غير موجود → `{digits}@sydent.com` = نفس شكل حساب-رقم-فقط (غير مميَّز). **تسريب متبقٍّ مؤجَّل:** هاتف حساب-فيه-إيميل يُرجِع الإيميل الحقيقي للمتصفح (لا مفرّ بدون login server-side) — watch-point #13.

- **قاعدة #167 — تطبيع الهاتف للمقارنة فقط (Migration 67، `normalize_phone()` IMMUTABLE):** يوحّد الصيغ السورية (يسقط 00 ثم 963 ثم trunk 0 → رقم وطني) داخل مقارنة الـresolver **والـunique index** — **ليس** ببناء الإيميل الـsynthesized (وإلا #62). إلزامي: الـindex والمقارنة يستخدمان **نفس** التطبيع وإلا الـlookup غير حتمي (صفان بصيغتين لنفس الرقم → ambiguity). pre-flight cross-format collision guard قبل بناء الـindex.

- **قاعدة #168 — قوالب الترحيب/الاعتماد تطابق واقع self-signup (Migration 66):** لا «كلمة المرور: 0000» ولا عرض `{email}` الـsynthesized — المستأجر اختار معرّفه وكلمته بنفسه (#35). **سطحان متطابقان byte-for-byte:** `admin.html FALLBACK_TEMPLATES` + seed `notification_templates` (DB-down = DB-up). التحديث **UPDATE شرطي** (`WHERE body=<النص الحالي بالضبط>`) يحترم تعديلات الأدمن اليدوية + idempotent؛ تأكيد برمجي أن الـWHERE يطابق الحالة الحالية وإلا الـUPDATE no-op صامت.

- **قاعدة #169 — نافذة «نسيت كلمة المرور» تقبل هاتفاً أو إيميلاً (v87):** تحلّ المُدخل عبر `resolve_login_email`؛ كانوني synthesized (`@sydent.com`) → «تواصل مع الدعم»، إيميل حقيقي → reset عادي. **anti-enumeration محفوظ** (رسالة نجاح موحّدة دائماً، الأخطاء console فقط) + جوهر الـrecovery لم يُمسّ (مسار حسّاس #75).

- **قاعدة #170 — حذف دفعة/جلسة من غير-المالك = تنبيه دائم (Migration 68، قاعدة #4 بـ`detect_audit_alerts`):** أي `payment.delete`/`session.delete` حيث `employee_role_snapshot IN ('doctor','secretary')` → `is_alert:=TRUE` بلا شرط عمر/عدد (يسدّ فجوة Rule 1 «<60 دقيقة» وRule 3 «5+»). **whitelist صريح** للدورين الموظفين فقط (`clinic_employees.role` NOT NULL CHECK) — المالك وأي null/قيمة غير-متوقعة تفشل بأمان (لا false-positive على المالك، حذفه محاسبة مشروعة). السبب يُكتب فقط `IF alert_reason IS NULL` (يحترم سبب قاعدة أدقّ سابقة بلا تكرار). الآلية: تبديل المالك لموظف يضبط `LS_EMPLOYEE_ID` فـ`getCurrentEmployee()` يرجّع دور الموظف للـsnapshot. لا مسار آلي/cascade يصدر هذين النوعين (يدوي بـpatient-profile؛ split على جلسة محذوفة يُستثنى عبر splitSessionStatus undefined). عند تعديل الدالة: احفظ القواعد 1-3 byte-identical (تحقّق بالـdiff) + idempotent (CREATE OR REPLACE + DROP/CREATE TRIGGER).

- **قاعدة #171 — سبب التنبيه يجب أن يظهر بالصف لا بالـtooltip فقط (audit-log.html):** البانر العلوي يعرض `alert_reason` نصاً، لكن صف السجل كان يضعه بـ`title` (مخفي). أي «مفتاح عرض» مرئي بالأعلى يجب أن يكون مرئياً بالصف أيضاً — سطر `.ld-alert-reason` ظاهر تحت الوصف. `alert_reason` مجلوب أصلاً بالاستعلام (عرض بحت صفر-مساس).

- **قاعدة #172 — تسجيل/تعديل/حذف دفعة الطبيب (payout) للمالك فقط (provider-reports.html):** صرف حصة/راتب الطبيب إجراء مالي للمالك حصراً. helper `poIsOwner()` (`!window.SyDentLock || isOwner()`، fail-open: لا lock = مالك) يحجب زر «💵 تسجيل دفعة» بالكروت + حُرّاس early-return بـ`openPayoutModal`/`savePayout`/`deletePayout` (دفاع عميق). السكرتيرة محجوبة عن الصفحة أصلاً بـ`BLOCKED` (sidebar.js)؛ هذا يسدّ تسريب **وضع الطبيب** (provider-reports غير محجوبة عنه). نمط مرافق: أي إجراء مالي owner-only بصفحة متاحة للطبيب يحتاج حجب الزر **و** حارس الدالة.

- **قاعدة #173 — للحالات «يجب التقاطها بصرياً» استعمل accent بارز لا خفيف (v89):** اللمسات الخفيفة (حد 1px، tint ≤10%) غير مرئية عملياً على شاشة فاتحة ساطعة — أول محاولة لتمييز بطاقة التسجيل الجديد (1px أصفر + 10% tint) بدت «بلا تغيير» للمالك. الحل المعتمد: **شريط جانبي عدّة بكسلات** (`border-inline-start-width:5px` — RTL-safe، صفر إزاحة لأن العرض وحده يتغيّر) + **tint ≥~18%** (ضاعِف `--yellow-dim` عبر `linear-gradient` مزدوج فوق `var(--bg2)` الصلبة لتبقى البطاقة معتمة، لا شبه-شفافة). لا يُؤكَّد التمييز إلا بـlive (قاعدة #19) لا بمراجعة الكود — الفرق البصري لا يُقدَّر من الشيفرة وحدها.

- **قاعدة #174 — أنماط جلسة v89 (هوية git + realtime):** (أ) **هوية git تُمحى مع كل clone جديد** — `git config user.name/email` يجب إعادة ضبطها كل جلسة **قبل** أول commit؛ نسيانها = فشل commit صامت («Author identity unknown») قد يمرّ دون انتباه (حصل بهذه الجلسة وكُشف بإعادة فحص `git log` بعد الـpush — **تحقّق دائماً أن `local==origin` بعد كل push**). (ب) **realtime على جدول** يتطلب إضافته لنشر `supabase_realtime` (Migration، metadata بالـDB لا بالـrepo)؛ الاشتراك من العميل = channel واحد محروس (`_newSignupChannel`) + `postgres_changes` + debounce على المعالج (التسجيلات نادرة، `loadAndRender` كافٍ)؛ اجعل الكود **graceful** (try/catch + يعمل بلا الـpublication) فلا ينكسر إن لم تُطبَّق الـMigration؛ RLS يحكم وصول الأحداث (الأدمن عبر `is_platform_admin()`)؛ watch-point #14: استعادة DB من backup قديم قد تُسقط عضوية النشر فيتوقف الإشعار اللحظي (fallback: polling 60s).
- **تعلّم (لا قاعدة) — أساس التحصيل في provider-reports سليم by-design (لا تُعد فحصه):** «مستحق الطبيب» بأساس التحصيل = 30%×(مجموع `payment_splits` المكتسبة لـ`provider_id` الطبيب: `!is_unearned` AND الجلسة `completed`، الجلسة بأي تاريخ). هذا **كاش مقبوض ضمن نافذة الدفع** (cash basis) **مُسنَد لشغل الطبيب نفسه فقط** — ليس «كل ما دفعه المريض». الإنتاج = جلسات **تاريخها** بالنافذة (accrual). النافذتان مختلفتان → **تحصيل-النافذة قد يتجاوز إنتاج-النافذة** (كاش لشغل مكتمل من فترات سابقة)؛ السقف الحقيقي = **إجمالي إنتاج الطبيب المكتمل عبر كل الأوقات** لا إنتاج الشهر (FIFO يحدّ split≤كلفة الجلسة، الزائد unearned مستثنى). التفاوت الشهري = توقيت/استدراك لا دفع-زائد (العمر: 30%×إجمالي تحصيل=30%×إجمالي إنتاج). **أُكِّد حياً:** نافذة واسعة → 100% بالضبط. متوافق OpenDental/Dentrix. نسبة الـ«(%)» جنب التحصيل تخلط الأساسين فقد تتجاوز 100% (مضلِّلة بصرياً لا خطأ؛ تحسين تسمية مؤجَّل). «المتبقي بعد المدفوع» السالب = دفع-زائد إعلامي طبيعي.

- **قاعدة #177** تلخّص النمط.

• (ج) قرار مؤكَّد من المالك (Rule #194): الربط بمريض موجود → الموعد/التذكير يأخذ رقم البطاقة (resolvePatientPhoneForAppt عبر patient_id)، لكن صف booking_requests يبقى بالرقم/الاسم الأصليين كما سُجّلا بالبوابة (سجل intake ثابت، يوثّق مَن حجز — حالة عبدو شحرور→بطاقة تجريبي). سلوك صحيح ومقصود، صفر تعديل (نمط Dentrix/CareStack).
   • قواعد جديدة #192 (match-or-create + link-by-id، صندوق بالتأكيد والتعديل) + #193 (أزرار ديناميكية داخل <form onsubmit> لازم type=button + Enter-guard للحقول) + #194 (booking_requests سجل intake ثابت لا يُدهَس عند الربط؛ رقم البطاقة للتذكير ورقم الطلب للسجل). watch-point #15 (handoff 6a5388e موثّق-ذاتياً غير مسجّل بالسياق).
   • التالي (المحاور المتبقّية من «نام مرتاح»): المحور ٣ — البند ٣ custom SMTP (Resend) + تدرّج DMARC · المحور ٤ نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72 + H-bundle H2 XSS + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor). فكرة اختيارية: عرض «🔗 مربوط ببطاقة: X» جنب الطلب بتبويب طلبات الحجز.

• قاعدة جديدة #195 (escapeHtml شامل، لا تهريب يدوي per-char): كل قيمة ديناميكية تُحقن innerHTML تمرّ عبر escapeHtml الكامل (& < > " ')؛ ممنوع التهريب اليدوي per-char (.replace(/"/g,…)) — يهرّب جزئياً ويترك ثغرة < > لو دخل إدخال مستخدم للمسار لاحقاً. النمط البديل الصحيح = escapeHtml على القيمة كاملة قبل الحقن.
   • التالي (المحاور المتبقّية من «نام مرتاح»): المحور ٣ — البند ٣ custom SMTP (Resend) + تدرّج DMARC · المحور ٤ تتمّة نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72 + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor) · تدوير S3/R2 إلزامي قبل أول عميل حقيقي (#186). فكرة اختيارية: عرض «🔗 مربوط ببطاقة: X» جنب الطلب بتبويب طلبات الحجز.

• قاعدة جديدة #198 (فصل محوري overflow + كشف السكرول للماوس): overflow-x:auto يُجبر overflow-y:visible→auto؛ لإبقاء badges تتجاوز إطار الخلية بلا قصّ استعمل padding علوي/سفلي كافياً (> تجاوز الـbadge) بدل overflow-y:visible المستحيل مع overflow-x:auto؛ ولإظهار سكرول أفقي مكتشَف للماوس دون كسر سحب اللمس: @media (hover:hover) and (pointer:fine) فقط.
   • التالي (بلا تغيير عن v100): المحور ٤ تتمّة نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor) · تدوير S3/R2 إلزامي قبل أول عميل حقيقي (#186) · تدرّج DMARC.

• قاعدة جديدة #209: بعد أي استرداد ملف بـgit checkout أعد تطبيق كل الطبقات اللاحقة عليه — خصوصاً توكنات الكاش (قارن بالتوكن الأسطولي قبل الكومِت)
   • HEAD 192d9c5 · فليت 20260703a متناظر (16/20/21/21/2، صفر 20260702e) · migrations بلا تغيير (74–77 مطبّقة، التالي 78)
   • التالي: suspend خدمة Render (يدوي) · تحديث وثائق التسليم · Perio v2 مرشّح · تلميع UTC · باقي بنود v103

• قاعدة جديدة #210 (الحالات الفارغة المُفصِحة): قوائم العمل المفلترة حالتها الفارغة تكشف استثناءاتها الصامتة — خصوصاً الموعد المحجوز؛ المالك المطوّر نفسه التبس فالسكرتيرة أولى
   • قاعدة جديدة #211 (مرآة الاستدعاء 3-نسخ + أدوات الذيل): القالب الافتراضي بايت-بايت بثلاث نسخ (settings/patients/patient-profile) وأدوات الذيل مرايا prm↔pp — أي تغيير دلالي يُعمَّم ويُثبَت بايت-بايت بـnode (امتداد نمط 4-copy)
   • HEAD edaac39 · فليت 20260703a بلا تغيير (صفحات inline فقط) · migrations بلا تغيير (74–77 مطبّقة ✓، التالي 78)
   • التالي: بلا تغيير عن v105 (suspend خدمة Render يدوي · تحديث وثائق التسليم · Perio v2 مرشّح · تلميع UTC · باقي بنود v103)

• قاعدة جديدة #211 (مرآة الاستدعاء 3-نسخ + أدوات الذيل): القالب الافتراضي بايت-بايت بثلاث نسخ (settings/patients/patient-profile) وأدوات الذيل مرايا prm↔pp — أي تغيير دلالي يُعمَّم ويُثبَت بايت-بايت بـnode (امتداد نمط 4-copy)
   • HEAD edaac39 · فليت 20260703a بلا تغيير (صفحات inline فقط) · migrations بلا تغيير (74–77 مطبّقة ✓، التالي 78)
   • التالي: بلا تغيير عن v105 (suspend خدمة Render يدوي · تحديث وثائق التسليم · Perio v2 مرشّح · تلميع UTC · باقي بنود v103)

• قاعدة جديدة #219 (Cloudflare Pages: عند استثناء مسار بـ_headers انتبه لتحويل pretty-URL /x.html→/x فاستثنِ المسارين معاً؛ صياغة حذف رأس موروث هي `! HeaderName` لا قيمة فارغة)
   • HEAD 0dc51ab (كود) + 419db75 (توثيق) · فليت 20260703a بلا تغيير · migrations بلا تغيير (74–78 مطبّقة ✓، التالي 79) · بنية جديدة: بلوك /book بملف _headers

• قاعدة جديدة #220 (تهريب حقول العرض عند نقطة القالب لا نقطة التحميل): بيانات المستخدم المحقونة بـinnerHTML تُهرَّب حيث تُبنى السلسلة (كل map/render) عبر مُهرِّب كانوني كامل؛ التهريب عند نقطة التحميل (نمط _sanHex #218) مناسب للبيانات التي تُستهلك بمواضع متعددة، لكن حقول العرض النصية تُهرَّب بالقالب
   • HEAD 9d5d359 · فليت 20260703a بلا تغيير · migrations بلا تغيير (74–78 مطبّقة ✓، التالي 79)

• قاعدة #221 (الريبو private دائماً؛ سرّ بالتاريخ العام = مكشوف للأبد → تدوير إلزامي بخطورة السرّ؛ revoke آمن: Current≠المسرَّب ثم Revoke Previous؛ social engineering: لا رد + فحص وصول API) + watch-point #17 (Ben Book خارجي، لا ترد بتفاصيل)
   • HEAD 9d5d359 بلا تغيير · فليت 20260703a بلا تغيير · migrations بلا تغيير (74–78 ✓، التالي 79) · الريبو private · Legacy HS256 JWT مُبطَل (revoked)

**التأطير الصحيح (أهم ما بالبند):** **قاعدة #223 لم تُخرَق** — السطوح الأربعة لـ`labs` سليمة، والحارس الثاني عشر `check-plan-gating.js` يفرضها ويمرّ أخضر. الفجوة **سطح خامس: مستهلِك داخل صفحة أخرى**، والحارس لا يغطّيه بالتصميم — نفس صنف `{booking_link}` بـ`pp-wa.js`. و**قاعدة #244 لا تنطبق**: تحقّقت أن `book.html` فيه **صفر** إشارة للمخابر والـRPCs العامة الوحيدة `booking_*` ⇒ لا سطح anon لـ`labs`/`lab_orders`. وأهم من ذلك: **بوابة صفحة labs.html نفسها عميل-سايد** (`__sydentRenderPlanBlock` يعيد كتابة `body`) ⇒ بوابة عميل ببطاقة المريض **مكافئة بالقوة تماماً** لما هو منشور، وRPC خادمي للمخابر وحدها كان سيتجاوز مستوى إنفاذ المنصة كلها.

**التدقيق — أربعة أسطح (سابقة v49/قاعدة #265):** بادئة `lab_payment.` بـ`VALID_ACTION_PREFIXES` بـ`supabase-init.js` · `entityMap` بـ`audit-log.html` · ضمّ `lab_payment.create/delete` لعائلة فلتر المخبر بـ`ACTION_TYPES_BY_PREFIX`. **قرار موثَّق:** الخريطة المسطّحة بتبويب نشاطات المريض (`pp-extras.js`) **لا تحتاج إضافة** — الدفعات بلا `patient_id` فلا تدخل تبويب المريض أصلاً؛ هذا اكتمال لا فجوة.

**قاعدة جديدة #266 (الفصل بطبقة التعريف لا بترحيل البيانات):** فصل فئتين مخزَّنتين بعمود JSONB واحد (تحذيرات ↔ حساسيات) يتم بتقسيم الـDEFS الثابتة (`MEDICAL_FLAGS_DEFS` ↔ `ALLERGY_FLAGS_DEFS`) ودوال العرض (`warnParts`/`allergyParts`) — **المفاتيح تبقى بنفس العمود** (صفر ترحيل، صفر migration للبيانات)، الحفظ يدمج الحاويتين والقراءة تفصلهما؛ المفاتيح المجهولة/المهجورة تُهمَل بنيوياً بضمانة unknown-key؛ أي حقل حر مكمِّل (`medical_flags_other`) يُضاف بـ migration additive nullable مع strip-and-retry ما-قبل-migration مرتَّب **قبل** retry أي عمود يتشارك جذر الاسم، وريجكس الفحص القديم يُشدَّد بـ negative lookahead `(?!_suffix)` كي لا يبتلع خطأ العمود الجديد؛ الشارات/التاغات المنفصلة (أحمر تحذير/برتقالي حساسية) تُعمَّم على كل الأسطح (بطاقة/قائمة/موعد/طباعة/روشتة) للاتساق البصري.

**قاعدة جديدة #267 (بيانات الفحص المؤرَّخ تبقى بطبقة الفحص لا مودال الكيان):** أي قياس يتغير بين الفحوصات ويدخل المقارنة/النسخ (تشعب، انحسار، حركة…) يُوضع بشبكة الفحص المؤرَّخ نفسها لا بمودال السن/الكيان — فيرث المقارنة والنسخ والطباعة و RLS مجاناً بصفر كود؛ خلطه بمودال الكيان يخلط طبقة العرض الثابتة بطبقة الفحص الزمنية.

**قاعدة جديدة #268 (القيم المشتقة تُحسب بالعرض ولا تُخزَّن):** أي قيمة قابلة للاشتقاق من أعمدة مخزَّنة (CAL = PD + Recession) تُحسب حيّاً بالواجهة وتُعرض read-only ولا تدخل أي INSERT/UPDATE — يمنع انجراف البيانات ويُبقي مصدر الحقيقة وحيداً؛ يُحرَس بمثبت «صفر مفتاح مشتق بصفوف الحفظ».

**قاعدة جديدة #269 (كاشف strip-retry متعدد الأعمدة يفتاح على أسماء أعمدته حصراً):** عند تعايش أكثر من مسار strip-and-retry ما-قبل-migration بنفس الملف، كل كاشف يطابق أسماء أعمدته الحرفية (`rec_`/`furcation` مقابل `medical_flags_other`) لا مجرد رمز الخطأ 42703/PGRST204 — كي لا يبتلع كاشفٌ خطأ عمود مسار آخر؛ يُثبَّت حيّاً بحقن خطأ عمود كل مسار والتأكد أن الآخر لا يُفعَّل.

**قاعدة مرشّحة #275 (الحارس السابع = مثبت منطق حرج دائم):** أي منطق **كلاينت** غلطُه صامت وخطير (مالي/سريري) يُقفَل ببلوك بـ`scripts/check-critical-logic.js` — يستخرج الدالة الحية (string slicing + `vm`، صفر تبعيات، shim خفيف مطابق للعقد لو DOM-coupled)، يؤكّد سلوكها + ثوابتها الجوهرية + قفل مراياها (سلوكياً على النسختين + قفل مصدر `normWs`)؛ **mutation-tested غير-فارغ إلزامي** (يُثبَت أنه يمسك كسراً حقيقياً)؛ **قراءة-فقط صفر لمس إنتاج صفر ملف html**؛ الحزمة تنمو داخلياً (بلوك لكل دالة، لا حارس جديد لكل واحدة — نمط `check-mirrors.js`)؛ الدوال SQL السيرفرية خارج نطاقه (توثيق-عقد منفصل).

**قاعدة مرشّحة #276 (تكافؤ عبر تطبيقات متعددة لنفس الصيغة):** عندما تُطبَّق صيغة مالية واحدة بأكثر من ملف بشكل بنيوي مختلف (لا مرآة byte-identical)، يُقفَل التكافؤ بهارنس سلوكي: يُستخرَج الحساب من كل ملف (حتى لو async عبر mock DB خفيف) ويُشغَّل على نفس السيناريوهات ويُقارَن الناتج — بدل قفل مصدر هشّ يفشل زوراً على اختلاف أسماء المتغيرات.

**قاعدة مرشّحة #300 (DR drill = عملية تشغيلية توثيق-فقط، لا تغيّر الريبو):** تمرين التعافي لا يُنتج أيّ commit فلا يمسّ HEAD/SW/migrations؛ يُوثَّق كملخّص جلسة + إغلاق البند بالـRebuild Runbook والـHardening Plan، **مع التحقّق من HEAD/SW الحيّ عبر GitHub API قبل تدوين الحالة** (Rule #19 — الملف الحيّ لا البرومبت/الذاكرة؛ صحّحنا هنا `4d9ae31`→`69487c2`، SW16→v17، و«شحن Anthropic» المتقادم). ثوابت الاسترجاع المثبّتة: **psql 17+** إلزامي (GSSAPI مع الـpooler) · **الترتيب roles→schema→data** حصريّ · **`SET session_replication_role=replica`** على data يتجاوز قيود الـFK/triggers · أخطاء `already exists` و`permission denied` على جدولَي Supabase-AI النظاميين **متوقّعة وغير ضارّة** خارج النطاق. **قاعدة مرشّحة #301 (توثيق ما لا يُحدَّث):** قبل الاعتماد على «الملف محدَّث» تحقّق من الملف الفعلي بـproject knowledge (الرَنبوك بقي فارغاً رغم أن النص كُتب بجلسة سابقة لأن إنشاء الملفات كان مطفّياً) — والادّعاء بأن ملفاً حُدِّث يجب أن يطابق حالته الفعلية.

**قاعدة مرشّحة #302 (لا تُنقَل البنود إلى «المتبقّي» بلا إعادة تحقّق حيّ):** أيّ بند في قائمة «المتبقّي/الدَّين» يُعاد التحقّق من حالته من الريبو الحيّ (Rule #19) قبل نسخه لإصدار جديد — البنود المغلقة تُنسَخ خطأً عبر الإصدارات (H3/H4/Bug#1/--card ظلّت مدرجة رغم إغلاقها في v155/c66c7be0، وAnthropic أُدرج رغم شحنه). الفحص الحيّ رخيص (grep على release + مقارنة commit عبر GitHub API) والخطأ مكلف (لخبطة أولويات).

**قاعدة مرشّحة #303 (ترقية GitHub actions):** قبل ترقية أي action تحقّق من runtime إصداره الفعلي من `runs.using` في `action.yml` للـtag (node20/node24/composite) لا من الذاكرة — الـactions على node20 تُهمَل (قطع 16 أيلول 2026)، والـcomposite بلا Node runtime فلا تُهمَل أبداً؛ استعمل tags الإصدار الرئيسي (`@v5`/`@v3`) توافقاً مع عرف الريبو (لا SHA pinning)؛ تأكّد أن مدخلات `with:` القائمة لا تزال مدعومة في الإصدار الجديد (`node-version`، `version: latest`)؛ والاختبار الحيّ = `ci-guards` أخضر على الكومِت (يشغّل الـworkflow المعدَّل نفسه) + `backup`/`schema-snapshot` بلا تحذير Node عند أول تشغيل.

**قاعدة مرشّحة #304 (المسح النمطي يُعمَّم على الأسطول لا على ملف البلاغ):** حين يُكتشف عيب من صنف نمطي (متغيّر CSS غير معرّف · عمود خاطئ · هروب ناقص · مرآة منحرفة)، **المسح والإغلاق يجب أن يشملا كل ملفّات الأسطول لا الملف المُبلَّغ عنه وحده**، والتحقّق يكون **لكل ملف على حدة** (يعرّف المتغيّر محلياً؟ يرثه من الشيت المشترك؟) لا بمسح عام واحد — `54e204c` أغلق `appointments.html` وتُرك `admin.html` مفتوحاً ١٩ يوماً لأن الإغلاق وُثّق بصيغة «متغيّرات CSS ✅» بلا ذكر النطاق. **صيغة التوثيق الصحيحة تذكر الملفّات المشمولة صراحةً.** نفس صنف #241 (خريطة عمود المالك per-table) و#238 (العدّ الحيّ يكشف الـdrift). **قاعدة مرشّحة #305 (اختيار البديل عند إصلاح متغيّر CSS = من عمق التداخل الفعلي لا بالتخمين):** قبل استبدال متغيّر خلفية غير معرّف، **اقرأ الحاوية الأب الفعلية بالـDOM** (أيّ `.card`/`.section` يلفّه وبأيّ `--bg*`) واختر الدرجة **التالية** لها ليبقى التباين الهرمي؛ الاستبدال الأعمى بقيمة واحدة لكل المواضع يُسطّح التدرّج البصري ويبدو «معطوباً بشكل مختلف».

**قاعدة مرشّحة #306 (تعديل CSP/`_headers` لا يصل للـService Worker الشغّال):** الـSW يحتفظ بسياسة الأمان التي خُدم بها لحظة التثبيت؛ فأي تعديل على `_headers` (CSP أو غيره) يؤثّر على طلبات تمرّ عبر الـSW **يتطلّب رفع `SW_VERSION` في نفس الجلسة** وإلا بقي العامل القديم يطبّق السياسة القديمة إلى الأبد — ولا ينفع hard refresh ولا نشر Cloudflare. الأعراض المميِّزة: الخطأ يقتبس قائمة directive قديمة ومصدره `sw.js:<line>` لا الصفحة. **قاعدة مرشّحة #307 (`connect-src` يحكم كل fetch مهما كان نوع المورد):** السماح بمورد في `style-src`/`font-src`/`script-src` يغطّي التحميل التصريحي (`<link>`/`<script>`) فقط؛ أي جلب برمجي (`fetch()`/XHR — سواء من الصفحة أو من داخل الـSW أو أثناء تسخين كاش الأوفلاين) يخضع لـ`connect-src` حصراً. عند اعتراض الـSW لأصول خارجية يجب أن تُدرج نفس الأصول في `connect-src` أيضاً.

**قاعدة مرشّحة #308 (الاستضافة الذاتية للأصول الخارجية الحرجة):** كل أصل خارجي حرج يُستضاف ذاتياً باسم **مُرقَّم بالنسخة** + SHA-256 موثَّق بـ`vendor/README.md` + فحص سلامة قبل الاعتماد؛ **صفر أوسمة عائمة** (`@2`) — الوسم العائم يعني أن إصدار طرف ثالث يصل لكل العيادات بلا commit؛ الاسم المُرقَّم يجعل الترقية commit صريحاً وصفر-كاش بنيوياً (خارج `cache-bust.sh`). **قاعدة مرشّحة #309 (استثناء `book.html` المعماري):** القاعدة «لا يُمسّ» تحمي من التغييرات **السلوكية**؛ تغيير مصدر مكتبة ليس سلوكياً — لكنه **يبقى قراراً يُعرَض على المالك صراحةً** قبل التنفيذ، ويُوثَّق. **قاعدة مرشّحة #310 (`activate` يجب أن يورّث لا أن يُبيد):** حذف كاشات الإصدار السابق بلا ترحيل يمسح تغطية الأوفلاين عند كل رفعة SW؛ الأصول ذات المفاتيح الدقيقة (URL) تُنسَخ بأمان، أما **الصفحات فتُعاد جلبها طازجة لا تُنسَخ** (HTML قديم قد يشير لأصول أُزيلت)، مع قائمة محفوظة للاستئناف لو جرى الترحيل بلا اتصال. **قاعدة مرشّحة #311 (الكاش عبر pretty-URL redirect):** مع Cloudflare Pages، رابط `*.html` يقفز 308؛ رفض `redirected` بكاش التنقّلات يعني أن الصفحة **لا تُكاش أبداً**؛ الحل: كاش الاستجابة النهائية بمفتاح URL النهائي + **غسل علم `redirected`** بإعادة بناء الجسد (Chrome يرفض خدمتها للتنقّلات). **قاعدة مرشّحة #312 (`type === 'cors'` مواطن أول بالكاش):** أي مورد يُجلب بنمط CORS (وأبرزه ملفات الخطوط من CSS) لا يكون `basic` ولا `opaque`؛ شرط كاش يقبل الاثنين فقط **يُسقط الخطوط صامتاً للأبد**. **قاعدة مرشّحة #313 (باراميترات النيّة أحادية الاستهلاك):** أي باراميتر يفتح مودالاً/يشغّل فعلاً يجب أن يُستهلك مرة ثم يُمسح بـ`replaceState`، **ومشروطاً بنوع تنقّل حقيقي** (`navigate`) — لأن مدخلات التاريخ القديمة تبقى حاملةً له بعد الإصلاح، وreload/back-forward يجب ألا يعيدا تشغيل الفعل. **قاعدة مرشّحة #314 (الحارس يُختبَر بالعضّ قبل اعتماده):** أي حارس جديد يُثبَت بكسر متعمّد للسلوك الذي يحرسه (نظيف 0 → مكسور 1 → مستعاد 0)؛ فشل العضّ = ثغرة تغطية بالحارس لا سلامة بالكود — وقد حدث فعلاً هذه الجلسة. **قاعدة مرشّحة #315 (التوقّع ليس تشخيصاً):** «سيختفي بعد جلسة أونلاين» قيلت للمالك عن أسطر الخطوط وكانت **خاطئة**؛ إعادة اختباره كشفت باغاً عمره من عمر الميزة. أي عرَض يتكرّر بعد تفسيره بـ«طبيعي» يُعاد فتحه بتحقيق كودي لا بتطمين.

**[قاعدة مرشّحة #322 (الوثائق تجفّ بصمت — والأرقام أسرع ما يجفّ)]:** بيئة الجلسات المتوازية تُبطل أرقام الوثائق (عدد الحُرّاس · رقم الترحيل · تواريخ الاشتراكات · مؤشّر HEAD) **بلا أي إشارة فشل** — لا حارس يكشفها ولا اختبار يحمرّ لها. لذلك: **قبل الاستناد إلى أي رقم بوثيقة، يُقابَل بالحيّ**؛ وعند تحديث وثيقة **تُصحَّح الأقسام النافذة ويُترك السجل التاريخي حرفياً**؛ **ورقم الإصدار يتبع المحتوى** (#320). ومقياس الجفاف الأدقّ ليس تاريخ الوثيقة بل **عدد الجلسات المتوازية التي مرّت عليها**.

- **#323 (تفكيك monolith بلا bundler):** سكربتات كلاسيكية بالنطاق العام + **تعريفات صِرفة** + تحميل **قبل** الكتلة الرئيسية + **ملف واحد نامٍ لكل صفحة**. ES Modules والتجميع وقت البناء مرفوضان بأسبابهما.

- **#324 (البرهان الدلالي بـ`vm` يسبق أي مسح سطري):** المسح السطري **أعمى** عن الإعلانات المسلسلة بالفواصل وعن ذيول الإعلانات متعددة الأسطر. شغّل الكتلة بسياق `vm` فارغ وقارن مفاتيح النطاق بالطقم المتوقَّع، وأكّد صفر إعلان لأي معرّف خارج الكتلة **بنمطَي** الإعلان المباشر والمسلسل.

- **#325 (نمط الجذع المُستبقى):** الكتلة ذات التنفيذ top-level **تُبقي تنفيذها حرفياً بموضعه** (توقيت التشغيل وترتيب تسجيل المستمعات عقدٌ لا يُنقل)، وتنتقل تعريفاتها مع علامات بمكانَي الأصل، ببرهان تركيبي **عكوس**.

- **#326 (قاعدة التقاطع قبل أي قص):** معرّفات الكتلة × ما تقرؤه الحُرّاس = صفر، وإلا **يُعاد توجيه مسار القراءة بنفس الكومِت** ويُعضّ 0→1→0.

- **#327 (الاستعادة أثناء جراحة غير ملتزمة):** **تحرير نصي عكسي لا `git checkout`** (الأخير يمحو العمل غير الملتزم كله)؛ ورمز خروج العضّة **يُقاس مباشرةً بلا أنابيب** (الأنبوب يبلع الرمز ويعطي أخضر كاذباً).

- **#328 (توقيت قلب التوكن ومداه):** فحص «صفر تغيير بنيوي» يفرض القلبة **كومِتاً منفصلاً على شجرة نظيفة**، فتُدفع مع استخراجها **بدفعة واحدة** (صفر نافذة HTML-جديد/أصل-قديم)؛ و**الأصل الجديد المولود بالتوكن الحالي لا يحتاج قلبة**.

- **#٣٢٩ (الوثيقة المجمّدة تحمل لافتتها):** نسخةٌ لا تُصان **تُقرأ كأنها حالية** ما لم تصرّح بغير ذلك، وهذا أخطر من غيابها. فأي نسخة مجمّدة (لغة أخرى · PDF · لقطة) تحمل **لافتة تقادم بأعلاها** تسمّي المرجع الموثوق **وتُجدوِل ما لا تعرفه** — لا مجرّد تاريخ قديم بالترويسة.

- **#٣٣٠ (تعدّد نُسخ الوثيقة = تعدّد مصادر حقيقة):** قبل تحديث أي وثيقة، **يُجرَد كم نسخة منها بالريبو** (`git log -1` لكل ملف) لا النسخة المعروفة وحدها؛ ثم **إمّا واحدة موثوقة وإمّا لافتات صريحة** — والنسخ المتباعدة بصمت تُعالَج قبل تصحيح الأرقام لأنها الخطر الأكبر.

**قاعدة #331:** أي استخراج لاحق (بما فيه `admin.html`) **يمرّ بهذا الكنس قبل الكومِت** — لا يُكتفى بالبراهين المعزولة. الطبقة رخيصة (`npm i jsdom` + سكربت ~20 سطراً) وتصطاد بالضبط ما تعمى عنه البقية: **أخطاء وقت التحميل وترتيب التنفيذ**.

- **#332 (لا قيمة فارغة تُقترَح على نموذج لغوي):** أي عنصر قيمته فارغة يُحذف من القائمة قبل الإرسال، وإلا أنتج النموذج سطراً مبتوراً بعد الحلّ. والصفر **قيمة مشروعة** لا تُعامَل كفراغ.

- **#333 (مفاتيح العميل تُقرأ بـ`hasOwnProperty`):** أي خريطة مفاتيح مغلقة يأتي مفتاحها من العميل تُقرأ بـ`hasOwnProperty` لا `obj[k]`؛ `__proto__`/`constructor`/`toString` كلها **truthy** فتمرّ من حارس `!obj[k]`.

- **#334 (سياق السطح enum مغلق):** ما يصف السطح للنموذج يُمرَّر **مفتاحاً** ويخرج **جملةً ثابتة من الخادم** — صفر نص عميل. النص الحرّ مقصور على ما هو نيّة المستخدم بطبيعته (`intent`).

**⇒ قاعدة #335:** الفحص الذي يستدعي دالة مساعدة مباشرةً **لا يثبت شيئاً عن المسار الحقيقي**. فحص الميزات كان يستدعي `cleanFeaturesForSave` ولم يمرّ يوماً من `savePlanEdits` — فمرّ السطر المدمِّر. **البوابة الجديدة:** فحص من الطرف للطرف يقود **نقطة الدخول الفعلية** (زر الحفظ) ويؤكّد على **الحمولة الملتقَطة** المرسَلة لقاعدة البيانات، بثلاث حالات: DB مهاجَرة · صف تالف · DB قبل الميغريشن.

**⇒ قاعدة #336 (رمز العملة = طبقة عرض، والخيار يُقفَل عند التسجيل):** تعدّد العملات على مستوى **العرض** يُنفَّذ بعمود نصّي + وحدة رمز + ذاكرة دافئة متزامنة — **بلا تحويل، بلا سعر صرف، وبلا لمس رقم واحد**. والخيار يُقفَل بعد التسجيل بلا واجهة تغيير: تبديله لاحقاً يقلب رمز **كل التاريخ المالي** بلا تحويل (500,000 ل.س تصير $500,000)، وهو انحدار صامت لا يمكن كشفه من الواجهة. القفل يلغي الخطر من جذره بدل التحذير منه. ولا يُعاد استخدام عمود عملة قائم لمعنى ثانٍ (عملة الاشتراك ≠ عملة العيادة) مهما بدا الاسم مطابقاً.

**⇒ قاعدة #337 (ثابت top-level مُمرآة لا يستدعي دالة runtime):** ثابت يُقيَّم **وقت تحليل الملف** (`var X = '…' + f() + '…';` بالمستوى الأعلى) لا يجوز أن يستدعي دالة عالمية تُعرَّف بملف آخر — النتيجة `ReferenceError` **يُسقط الملف كاملاً** لا الثابت وحده (سابقة v50: `var _T = rebuildToothMaps()`). ينطبق مضاعفاً على الثوابت المُمرآة byte-identical لأن الخطأ يتضاعف بعدد النسخ. قوالب الواتساب الافتراضية نصوص قابلة لتحرير العيادة أصلاً، فاستثناؤها من الاستبدال هو الحلّ الصحيح لا حلّاً مؤقتاً.

**⇒ قاعدة #338 (اعتماد عرضي جديد داخل دالة محروسة = توسيع sandbox الحارس بنفس الكومِت):** حين تُدخِل استدعاء دالة عالمية جديدة داخل دالة يستخرجها حارس ويشغّلها بـ`vm`، يفشل الحارس بـ`X is not defined` **لا بخطأ منطقي**. الإصلاح shim ثابت داخل الـsandbox مع تعليق يوضّح أن القيمة عرض بحت ولا تدخل أي حساب — **لا تعطيل التوكيد ولا تعديل التوقّع**. الفشل هنا إشارة صحّية أن الحارس يقرأ الكود الحيّ فعلاً.

**قاعدة مرشّحة #340 (وسّع نقطة القرار لا نقاط الاستدعاء):** حين تحتاج بوابة قائمة لبُعد جديد، عدّل **الدالة التي تقرّر** لا كل موضع يسألها؛ فالتعديل عند نقطة القرار يُورّث البُعد الجديد لكل السطوح الحالية **والمستقبلية** بلا صيانة، بينما دالة موازية جديدة تفرض تتبّع كل سطح وتترك بابَ نسيان سطحٍ مفتوحاً إلى الأبد.

**#341 (أرقام الأسطر تبيت فوراً):** خطة القصّ بُنيت أول الجلسة على أرقام أسطر عمرها جلسة واحدة، وحين حان التنفيذ كانت تسع جلسات قد نزلت بنفس الأرض فكبر الملف 564 سطراً وانزاحت كل المراسي. **أعد مسح الحدود من الكود الحي قبل كل قصّ، ولا تنفّذ خطة جلسة سابقة بأرقامها.** الأثر العملي: مقارنة `git log` مع ادّعاءات ملف السياق قبل أي عمل (تطبيق مباشر للقاعدة #19).

**#342 (حارس بلا اختبار طفري = حارس بلا قيمة):** حارس يمرّ على الحالة السليمة لا يثبت شيئاً؛ الإثبات هو أن يرنّ على الكسر. كل حارس جديد يُطلَب منه المرور على مجموعة أنماط فشل **محقونة عمداً** على نسخة معزولة من الشجرة. امتداد طبيعي للقاعدة #335.

**#343 (استخراج ينقل مرآةً يوجب retarget بنفس الكومِت):** أي معرَّف مسجَّل بـ`check-mirrors.js` يقع داخل نطاق قصّ يفرض تحديث مسار قراءته فوراً — تأجيله يعني حارساً أحمر أو، أسوأ، حارساً يقرأ ملفاً لم يعد يحوي المعرَّف.

**#344 (تعديل `scripts/` فقط ⇒ ممنوع cache-bust أو رفعة SW):** إخلاء كاش الفليت يكلّف كل عميل إعادة تنزيل. إن لم يتغيّر أي أصل مخدوم (html/js/css بالجذر) فلا توكن ولا `SW_VERSION`. الفحص العملي: `git status --short` قبل الكومِت.

#### قاعدة مرشّحة #348 — النموذج الأوّلي المستقل قبل تعديل أي صفحة عامة

**النص:** أي تعديل بصري على صفحة عامة (`landing.html` · `auth.html` · `book.html`) يُعاين أولاً كـ**ملف مستقل واحد** قبل أي كومِت، لا كوصف نصّي ولا كقصاصة كود.

**الوصفة:** نسخة من الصفحة ← تضمين `theme.css` و`theme.js` داخلها (وإلا فمتغيّرات النمط غير معرَّفة والمعاينة كاذبة) ← إسقاط ما لا يُحلّ خارج الاستضافة (Sentry · `/vendor/*` · `supabase-init.js` · `manifest.json`) ← استبدال أي حاوية تُملأ من قاعدة البيانات بملاحظة ساكنة ← تسليم الملف للمعاينة.

**لماذا:** القرار البصري لا يُتخذ بالوصف. البلاغ الحاسم بهذه الجلسة («الأشكال صارت مكررة مع فقرة المميزات») مستحيل أن يُكتشف بقراءة كود أو وصف — يحتاج القسمين متجاورين على شاشة حقيقية. وكلفة الاكتشاف بعد الكومِت = كومِت تصحيحي + رفع `SW_VERSION` ثانٍ + انتظار دورة نشر.

**الحدّ:** النموذج **لا يُلتزم بالريبو أبداً** ولا يُسلَّم للنشر — أداة معاينة تُهمل بعد القرار. والتطبيق النهائي يجري بنقاط إرساء مُتحقَّق من فرادتها على الملف الحيّ، لا بنسخ النموذج فوق الأصل (النموذج فيه إسقاطات مقصودة تكسر الصفحة لو نُشرت).

⤵️ V188EOF

**آخر تحديث:** 28 تموز 2026 (v187 — **توحيد جلستين متوازيتين بيوم واحد**) — **هذا الملف يدمج نسختَي v186 اللتين أُنتجتا بمحادثتين متوازيتين على نفس الأساس `5facea6`، بصفر حذف من أيٍّ منهما.** التسلسل الزمني الحقيقي: v185 (`5facea6`) ← **v186-أ** (جلسة النصوص: بطاقة الذكاء الاصطناعي بصفحة الهبوط + وصف المساعد بالإعدادات + ترقية المحاسبة إلى ميزة بيع — كومِتان `e147e57`+`2d1abf9`، SW `v71`→`v72`) ← **v186-ب** (جلسة اكتشاف التطبيق المثبَّت: بطاقة دعوة التثبيت + نقل زر التحديث العائم — أربعة كومِتات `e7b6046`→`5ba3bf8` فوق `2d1abf9`، SW `v72`→`v74`، فليت `20260728g`→`i`). **جلسة v186-ب بُنيت فوق كومِتات v186-أ مباشرةً فلا تعارض بينهما — البلوكان مستقلان بالكامل (ملفات مختلفة، صفر تقاطع).** كذلك أُدرج بهذه النسخة **قسم v184-ب المستردّ** (جلسة بطاقة «آخر الجلسات» التي أنتجت `1cfa8e1` ولم تُوثَّق بحينها فقفز الملف من v184 إلى v185).

**الحالة الحيّة بعد التوحيد:** **HEAD = `5ba3bf8` (main) · SW_VERSION `v74` · الفليت `20260728i` · Migrations مطبَّقة حتى 111 ✓ (التالي **112**) · الحُرّاس الاثنا عشر خضر · `book.html` بلا مساس · الطبقة المالية بلا كتابة واحدة · صفر بند حرج.** **قواعد مرشّحة مضافة بهذا اليوم:** #346 و#347 (من v186-ب). **المتبقّي عامّاً — دَين معماري تدريجي فقط:** تفكيك المونوليث (`patient-profile.html` · `admin.html`) · إنهاء handoff للمطوّر القادم · DMARC→`p=reject` · توحيد صيغة الأرقام (ar-SY ↔ en-US) · مراجعة تسمية `sidebar.js` (صار مضلِّلاً لما يحمله) · #3 chatbot الحجز (محجوب بقراريه) · #4-ب المستقبلي · **مؤجّل:** تدوير التوكنات (2027) + CSP nonces. ⤵️ V187EOF

**آخر تحديث:** 28 تموز 2026 (v186-ب) — **جلسة اكتشاف التطبيق المثبَّت: (أ) بطاقة دعوة التثبيت عند أول فتح على متصفح جديد و(ب) زر التحديث العائم يصل أخيراً إلى صفحات الأدمن وتسجيل الدخول واللاندينج. أربعة كومِتات `e7b6046`→`5ba3bf8` فوق `2d1abf9`، صفر migration، SW `v72`→`v73`→`v74`، فليت `20260728g`→`h`→`i`، `book.html` بلا مساس (لا يحمّل `theme.js` أصلاً)، الطبقة المالية بلا كتابة واحدة، الحُرّاس الاثنا عشر خضر بكل كومِت، live-verified ✅ بصور المالك على أربعة أسطح (ويندوز فاتح · آيفون سفاري فاتح · آيفون سفاري داكن · التطبيق المثبَّت على ويندوز).**

**[أ — الحاجة]** المستخدم الجديد على متصفح جديد لم يكن يعرف أن SyDent قابل للتثبيت: المدخل الوحيد بطاقة مدفونة بصفحة الإعدادات (`#pwaInstallCard`، من Phase 3 / `e2bfda4`). والزر العائم ↻ داخل التطبيق المثبَّت كان غائباً عن ثلاث صفحات بالضبط. البندان مستقلان لكنهما يخدمان الغاية نفسها: **جعل قدرات الـPWA مكتشَفة**.

#### قاعدة مرشّحة #349 — فحص تسريب الأنون يكون بتقمّص الدور، لا بفحص عمود `roles`

**النص:** أي تحقّق من عزل جدول عن anon يُنجَز بـ`set role anon` ومحاولة قراءة **وكتابة** فعليتين، لا بتوكيد على عمود `roles` بـ`pg_policies`.

**لماذا:** سياسات Supabase تُسجَّل `{public}` لا `{anon}`، و`{public}` تشمل anon ضمناً ⇒ توكيد `'anon' = any(roles)` يرجع **صفراً دائماً** حتى مع تسريب حقيقي. **توكيد كاذب الطمأنينة أسوأ من غياب توكيد**، لأنه يُغلق باب الفحص.

**الوصفة:** `DO` block: `set local role anon` ← عدّ الصفوف ← `INSERT` داخل `BEGIN/EXCEPTION` ← `reset role` ← ارفع استثناءً إن نجح أيٌّ منهما. وزِد اختبار عزل مستأجرين بتقمّص `request.jwt.claims` لهويتين حقيقيتين، **ونظّف الصف الاختباري وأكّد `rows_final = 0`** (الفحص على الإنتاج).

#### قاعدة مرشّحة #350 — قاصّ الدوال بالمثبتات يجب أن يكون واعياً للتعليقات

**النص:** أي قاصّ أقواس متوازنة يستخرج دوالاً من كود حيّ **يتخطّى تعليقات `//` و`/* */` قبل تتبّع النصوص**، ويحمل حارساً ذاتياً يرفض أي قصّ يتجاوز سقف أسطر معقولاً.

**لماذا:** فاصلة عليا داخل تعليق إنجليزي عادي (`that's` · `isn't` · `don't`) تُقرأ كبداية نصّ فينفلت القصّ إلى آخر الملف. والعَرَض الظاهر **فشلٌ كاذب** (دالة تبدو مبوَّبة)، لكن الخطر الحقيقي **نجاحٌ كاذب**: قصٌّ منفلت يبتلع كوداً لاحقاً فيمرّ توكيد «الدالة محروسة» لأن الحارس موجود بدالة أخرى تماماً.

#### قاعدة مرشّحة #351 — التوكيدات المُقيَّدة بلحظتها تُحدَّث أو تُشطب، لا تُترك تتعفّن

**النص:** توكيد يصف خصوصية كومِت واحد (**«صفر migration»** · **«الملف س بلا مساس»**) يُحدَّث أو يُشطب صراحةً لحظة تغيُّر النطاق بالتصميم — ولا يُترك أحمر «مفهوماً».

**لماذا:** مثبت البوابة أعطى 46/1 ثم 45/2 لأسباب **كلها بالتصميم** (أُضيفت M112؛ وصارت `labs.html` سطحاً مقصوداً). مثبتٌ فيه أحمر مزمن يفقد قيمته كشبكة انحدار: العين تتعلّم تجاهله فيمرّ الانحدار الحقيقي. والتحديث كشف معلومة مفيدة: `labs.html` تحوي `labsPlanOk` **داخل حارس `typeof` فقط** — فصار التوكيد يفرض ذلك بدل أن يمنع الذكر أصلاً.

**ملحق:** ونفس المنطق على استخراج القيم المتغيّرة — توكن الفليت يُستخرَج بـ`2026[0-9]{4}[a-z]` لا بتاريخ مثبَّت، وإلا انكسر بصمت عند منتصف الليل.

#### قاعدة مرشّحة #352 — السطح المستهلِك الخامس: بوابة الخطة قد تكون سليمة والفجوة قائمة

**النص:** السطوح الأربعة للقاعدة #223 تُبوِّب **الموديول بصفحته**، ولا تقول شيئاً عن **مستهلِك للموديول داخل صفحة أخرى**. فعند تبويب أي موديول، يُجرَد صراحةً كل سطح ينشئ أو يعدّل بياناته من خارج صفحته.

**لماذا:** الحارس الثاني عشر كان **أخضر** والسطوح الأربعة **سليمة**، ومع ذلك كانت عيادة بلا صلاحية المخابر تنشئ طلبات مخبر من بطاقة المريض وتُدخل تكاليفها بالمحاسبة. السابقة القائمة `{booking_link}` بـ`pp-wa.js` كانت **نفس الصنف** ولم تُعمَّم كقاعدة.

**والقياس العملي:** قوة البوابة الجديدة تُقاس بقوة البوابة القائمة للموديول نفسه — بوابة صفحة عميل-سايد لا تستدعي RPC خادمياً لسطحٍ ثانوي؛ وقاعدة #244 تنطبق فقط عند وجود سطح anon فعليّ (يُتحقَّق منه، لا يُفترض).

**وعند التبويب:** يُفصل **الإنشاء** عن **التعديل وتقدّم الحالة والعرض** — التخفيض لا يبتلع بيانات سريرية قائمة ولا يترك حالة قيد التنفيذ بلا مخرج. وانتبه لعمليات «الإحياء» (`redo`) فهي **إنشاءٌ متخفٍّ**.

⤵️ V189EOF

**آخر تحديث:** 28 تموز 2026 (v188 — **جلسة صفحة الهبوط: قسم «نظرة عامة» + تصحيحان نصّيان ببطاقة الذكاء الاصطناعي**) — **كومِت واحد `d7b268d` فوق `5ba3bf8`، صفر migration، صفر JS، صفر منطق، SW `v74`→`v75`، الفليت `20260728i` بلا تغيير (لا أصل مشترك تغيّر ⇒ لا cache-bust)، `book.html` بلا مساس، الطبقة المالية بلا كتابة واحدة، الحُرّاس الاثنا عشر خضر.** ⚠️ **التوثيق تمّ بأمر المالك قبل «تم» الحيّة الكاملة (استثناء موثَّق، سابقة v128) — المعاينة تمّت على النموذج الأوّلي بصور المالك (ويندوز، نمط فاتح) قبل التطبيق، والتحقق الحيّ على sydent.app بعد ترقية `release` لم يُبلَّغ بعد.**

**[الحاجة]** المالك أراد إضافة عبارة تسويقية تلخّص ما يديره الطبيب عبر SyDent (مرضى/جلسات/دفعات/مواعيد · أعمال المخابر وفواتيرها · مصاريف العيادة · مصاريف الموظفين) مع إبراز أثر الذكاء الاصطناعي. صيغت بالفصحى عبر أربع جولات تحرير معه، ثم بُني **نموذج أوّلي مستقل** قبل أي لمس للمنصّة.

**[أ — النموذج الأوّلي قبل التطبيق · نمط جديد]** بناءً على أمر صريح («لا تطبّق عالمنصة… اقرا الريبو وانسخ الصفحة وعدّل عليها واعرضها بالمحادثة»)، أُنتج `landing-prototype.html` مستقلاً بالكامل: استنساخ ضحل للريبو ← نسخة من `landing.html` ← **تضمين `theme.css` و`theme.js` داخل الملف** ← إسقاط ما لا يُحلّ خارج الاستضافة (Sentry · `/vendor/supabase-*.js` · `supabase-init.js` · `manifest.json`) ← استبدال نص تحميل شبكة الأسعار بملاحظة ساكنة. النتيجة ملف واحد يُعاين بالمحادثة بصفر مخاطرة، والمالك راجعه بصور شاشة وأصدر التعديلات عليه قبل أي كومِت. ⇒ **قاعدة مرشّحة #348** (أدناه).

**[ب — القرار التصميمي]** النسخة الأولى من القسم كانت أربع بطاقات مستقلة، فجاء بلاغ المالك: «حاسس الأشكال صارت مكررة خصوصاً مع الفقرة يلي تليها (المميزات)» — وهو تشخيص صحيح: البطاقة المستقلة بحدّ وظلّ ورفع عند المرور هي **توقيع `.feature-card`** الذي يليها مباشرةً بعشر بطاقات. الحل لم يكن تغيير الألوان بل **تغيير الوحدة البنيوية**: من أربع بطاقات إلى **لوحة واحدة** (`.ov-panel`) تضمّ الأربعة، مفصولةً بخطوط شعرية 1px مولَّدة بحيلة `gap:1px` فوق خلفية بلون `--border` — فتتكيّف الخطوط تلقائياً مع أي عدد أعمدة بلا حدود مستقلة. وأُسقط مربّع الأيقونة (48px بخلفية `--green-dim`) لأنه توقيع البطاقات أيضاً، وأُسقط الرفع عند المرور واستُبدل بتلوين الخلية. المعنى البصري صار مطابقاً للرسالة: **نظام واحد بأربع مساحات**، لا أربعة أشياء منفصلة. وحُلّ ضمناً اختلالٌ ظهر بلقطة المالك (٣ بطاقات بصفّ وواحدة وحيدة بالصفّ الثاني) لأن الشبكة صارت 1 / 2 / 4 أعمدة عند 0 / 560px / 900px بدل `auto-fit`.

**[ج — التوقيع]** الجملة الختامية لم تعد صندوقاً منفصلاً بل **شريط داخل اللوحة نفسها** (`.ov-foot`) يفصله خطّ متدرّج `linear-gradient(90deg,transparent,var(--green),transparent)` بشفافية 0.5 — اللمسة البارزة الوحيدة بالقسم، وما عداها هادئ عمداً.

**[د — التعديلات النصّية ببطاقة الذكاء الاصطناعي]** (بلاغ المالك بصورة معلَّمة يدوياً على `.feature-card-ai` التي كُتبت بـv186-أ): (١) تبديل ترتيب الجملتين ⇒ «**يلخّص ملف المريض قبل الجلوس على الكرسي، ويشرح خطة العلاج بلغة المريض**» — ترتيب المسار الفعلي بالعيادة (التلخيص قبل الشرح)؛ (٢) «ويقرأ أرقام عيادتك» ⇒ «**ويلخّص حسابات عيادتك**» — أدقّ لما يفعله ملخّص لوحة المحاسبة (`monthly_digest` / M111): تلخيص لا قراءة.

**[هـ — نقاط الإرساء الخمس]** كلها مُتحقَّق من فرادتها (= 1) قبل التعديل: `\n.divider{` (CSS، داخل `<style>` الإنلاين 39-666) · `<!-- FEATURES -->` (HTML) · جملة الترتيب القديمة · `ويقرأ أرقام عيادتك` · `var SW_VERSION  = 'v74';   /* v74:`. والمسمّى `ov-*` **مُتحقَّق من عدم استعماله بالريبو كلّه** قبل الإدراج (لا تصادم — `prov-name` بـ`provider-reports.html`/`accounting.html` مطابقة جزئية فقط لا صنف حقيقي).

**[و — لماذا CSS داخل الكتلة الإنلاين لا ملف منفصل]** قواعد `ov-*` أُدرجت داخل `<style>` الإنلاين (39-666) قبل `.divider{` مباشرةً — **حفاظاً على عقد الـcascade الموثَّق**: `theme.css` يُحمَّل بعد الكتلة الإنلاين عمداً كي تتجاوز متغيّرات النمط الفاتح افتراضيات الداكن. لو وُضعت القواعد بملف منفصل بعد `theme.css` لانقلب الترتيب. القواعد لا تعرّف متغيّرات أصلاً بل تستهلكها (`--border` · `--bg2` · `--text` · `--text2` · `--green` · `--green-dim`)، مع تخصيص واحد `[data-theme="dark"] .ov-panel` لتعميق الظل بالنمط الداكن.

**[ز — لماذا رفع SW إلزامي وcache-bust غير لازم]** `landing.html` صفحة مكاشة بـSWR داخل الـService Worker — بلا رفع `SW_VERSION` يبقى عميل iOS على النص القديم (سابقة v72 حرفياً، وهي الجلسة التي كتبت هذه البطاقة أصلاً). بالمقابل `cache-bust.sh` نطاقه **الأصول المشتركة حصراً** (قائمة سماح صريحة) ولم يتغيّر أيٌّ منها ⇒ الفليت `20260728i` يبقى كما هو، والتشغيل بلا داعٍ كان سيولّد ضجيج diff بلا معنى.

**[ح — تصحيح انحراف ذاكرة عبر القاعدة #19]** انطلقت الجلسة بافتراضات قديمة (الحُرّاس **ستة**، `SW_VERSION` **v18**، النشر من `main`). القراءة الحيّة للريبو صحّحت الثلاثة: الحُرّاس **اثنا عشر** (`validate.sh`)، `SW_VERSION` = **v74**، والنشر من فرع **`release`** بترقية آلية من `ci-guards` عند الخضار وCloudflare Pages يراقب `release` لا `main`. ⇒ تأكيد عملي للقاعدة #19: **الريبو الحيّ هو مصدر الحقيقة، لا الذاكرة ولا التوثيق.**

**[ط — التحقق]** الحُرّاس **12/12 خضر** محلياً (حارس SW أكّد صراحةً «21 توكيداً … على v75») · الفرق على `landing.html` = **سطر واحد محذوف** (وصف بطاقة الذكاء الاصطناعي، مُستبدَل) + 88 مضافاً، وعلى `sw.js` سطر واحد ⇒ صفر ضرر جانبي · القسم **HTML ساكن بالكامل**: صفر JS وصفر دمج ديناميكي فلا سطح لحارس XSS أصلاً · صفر لمس لـ`data-test` أو المرايا أو بوابة الخطط · `prefers-reduced-motion` محترم.

**الحالة الحيّة:** **HEAD = `d7b268d` (main) · SW_VERSION `v75` · الفليت `20260728i` · Migrations مطبَّقة حتى 111 ✓ (التالي **112**) · الحُرّاس الاثنا عشر خضر · `book.html` بلا مساس · الطبقة المالية بلا كتابة واحدة · صفر بند حرج.** **قاعدة مرشّحة مضافة:** #348. **المتبقّي عامّاً — دَين معماري تدريجي فقط:** تفكيك المونوليث (`patient-profile.html` · `admin.html`) · إنهاء handoff للمطوّر القادم · DMARC→`p=reject` · توحيد صيغة الأرقام (ar-SY ↔ en-US) · مراجعة تسمية `sidebar.js` · #3 chatbot الحجز (محجوب بقراريه) · #4-ب المستقبلي · **مؤجّل:** تدوير التوكنات (2027) + CSP nonces. **معلَّق على تأكيد المالك:** «تم» الحيّة لهذه الجلسة بعد ترقية `release`.

- **#353** — عمود يُكتب من مسار حيّ: الهجرة تُطبَّق **وتُتحقَّق** قبل الـpush. `PGRST204` بعد `signUp` ينتج حسابات يتيمة، والفشل يقع بعد نقطة اللاعودة.

- **#354** — قبل إضافة عمود، **جرد الأعمدة القائمة على نفس الجدول**. عمود يحمل المفهوم نفسه ⇒ إعادة استخدام لا ازدواج؛ الازدواج على صف واحد = الطبيب يعدّل حقلاً والمخرَج يقرأ الآخر.

- **#355** — قاعدة CSS جديدة بمُحدِّد أعلى وزناً قد **تُبطل حارساً عامّاً** بـ`theme.css` (تكبير iOS). أي قاعدة على عنصر نموذج تُفحَص ضد الحُرّاس العامّة، وتُعاد الحماية بنفس الوزن.

- **#356** — أي سمة `data-*` جديدة تُفحَص ضد الماسحات العامّة قبل استعمالها (`paintCurrency` تكتب `textContent` على كل `[data-cur]`).

- **#357** — **الغياب يعني السلوك السابق.** الأعلام الجديدة تُقرأ بـ`=== false` لا falsy، وإلا حوّل أي فشل تحميل عابر الميزة إلى إطفاء صامت.

- **#358** — **الغياب معلومة.** صفّ عرض مشروط بوجود القيمة يختفي كلياً فيبدو كأن الحقل غير موجود؛ اعرضه بشرطة.

- **#359** — طبقتان تحملان المفهوم نفسه (منصة ↔ عيادة) ⇒ **مُحلِّل واحد مشترك** يمرّ منه كل سطح عرض، والمثبت يؤكد صفر قراءة خام متبقية.

- **#360** — صفّ واحد بمسارَي إنشاء ⇒ **يجب أن يبذرا الحقول نفسها**؛ أي حقل بمسار دون آخر = خسارة صامتة تتوقف على أول صفحة يفتحها المستخدم.

- **#361** — منتقٍ مغلق يدهس **صامتاً** قيمة خارج قائمته عند أول حفظ ⇒ تُحقَن كخيار مؤقّت عند التحميل.

- **#362** — **البوابة عند المنبع الوحيد لا عند المستهلكين.** بوابة داخل `rxClinicInfo()` غطّت خمسة أسطح طباعة بصفر لمس لأيٍّ منها.

**#363 (خصم المواد لا يتراكب — تأجيل عبر نقطة الخنق):** أي مسار يفتح مودال المخبر ثم يحتاج خصم مواد يضبط `window._pendingMatDeduct {k,l,m}` بنفس بوّابات الأهلية، والإطلاق حصراً بذيل `closeModal('labOrderModal')` (نقطة الخنق الوحيدة لكل مسارات الإغلاق شاملة نقرة الخلفية) بـconsume-once + تأخير 120ms + try/catch معزول؛ الفروع التي لا تفتح مودال المخبر تبقى نداءً مباشراً؛ صفر مساس بمنطق الخصم ذاته — توقيت فقط؛ مغادرة الصفحة قبل الإغلاق = ضياع مقبول موثَّق (الخصم اليدوي متاح).

**#364 (نظام التراكب الموحَّد iOS-sheet):** أي صفحة فيها مودالات قابلة للتكديس تحمل الثلاثية: ابن `SEL{background:rgba(0,0,0,.45)}` + ظل `SEL box{box-shadow}` + أب `.modal-overlay.open:has(~ .modal-overlay.open) box{scale(.96)+brightness(.55) saturate(.8)+pointer-events:none}` (حيث SEL = `‎.modal-overlay.open ~ .modal-overlay.open` وbox = صندوق الصفحة `.modal-box`/`.modal`)؛ الابن متأخر بالـDOM إلزامياً؛ الثلاثية والأزواج محروسة بـcheck-mirrors (٣ أسطح × ٣ قواعد + ٨ أزواج ترتيب)؛ صفحة تكسب تراكباً جديداً = نسخ الثلاثية + تسجيل الزوج بالحارس؛ `transparent` القديمة محظورة (تُظهر المودالين متساويين فيبدوان نموذجاً مكسوراً — أصل البلاغ)؛ `:has` تدهورها رشيق فلا fallback مطلوب.

**#365 (فحص تبعية RLS قبل أي REVOKE على دالة):** قبل سحب EXECUTE عن أي دالة من أي دور، افحص `pg_policies` (qual + with_check) عن اسمها — الدالة المستعملة بسياسة RLS تتطلب EXECUTE من الدور المُستعلِم **وقت تنفيذ الاستعلام**، وسحبها يحوّل الترشيح الصامت إلى permission denied انفجاري على كل الجدول (درس is_platform_admin: 14 سياسة منها 3 على {public})؛ وافحص proacl للتأكد أن منح authenticated/service_role **صريح** لا موروثاً من PUBLIC قبل سحب PUBLIC.

**#366 (انضباط استئناف الجلسة المنقطعة):** قبل أي متابعة: (أ) `git status -sb` يفصل المكومَت عن المدفوع عن شجرة العمل — لا افتراض أن آخر كومِت مدفوع؛ (ب) أدوات `/tmp` (مثبتات/fixtures) تُعتبر تالفة وتُعاد كتابتها كاملة؛ (ج) فشل مثبت جديد على كود قديم يُحقَّق ضد الكود الحي أولاً (الاحتمال الأرجح خطأ المثبت لا الكود)، وأي شبهة تلف نقل تُحسم ببرهان bytes (`segment in old_committed_source`) لا بالعين؛ (د) اكتمال البوابة (مثبت + حُرّاس) يُعاد على الحالة النهائية مهما ادّعت رسائل الكومِتات السابقة.

**#367 (نمط تفكيك appointments — امتداد نمط pp):** لكل استخراج: كتلة متصلة بمراسي نصية فريدة + توكيدات توازن الأقواس · vm-load بسياق بلا globals تطبيقية = برهان إلزامي ضد الجذوع · الأصول الجديدة تولد بتوكن الفليت الحالي **بلا bump** (لا نسخة مكاشة لها) وتُسجَّل فوراً بالمراسي الثلاث بـ`cache-bust.sh` · SW bump واحد بآخر كومِت يغطي السلسلة (الصفحة ضمن CORE_PAGES) · الطبقة المالية ومسار الحفظ وجيب المرايا لا تُستخرج أبداً · مرايا الكتلة المنقولة تُعاد توجيهاً بنفس كومِت النقل.

**#368 (تطبيع دمج السلاسل قبل توكيدات البرومبتات):** برومبتات `ai-assist` مكتوبة بدمج `" +\n    "`، فأي توكيد نصي على عبارة تعبر حدّ الدمج يفشل رغم صحة المحتوى. المثبت يطبّق `joinFix = s => s.replace(/" \+\n\s*"/g, '')` على مقتطف الملف الحي قبل أي `includes`.

**#369 (التوكيدات اللغوية العربية تراعي الالتحام):** حروف الجر تلتحم بأل التعريف — «للمراجعة» لا تحوي «المراجعة» حرفياً. فشل مثبت حقيقي بهذه الجلسة على هذا السبب؛ استخدم الصيغة الملتحمة كما ترد بالنص أو جذراً لا يعبر حدود الالتحام.

**#370 (توسيع الدوال القائمة بوسائط اختيارية في الذيل حصراً):** إضافة قدرة لدالة يستدعيها كودٌ قائم تكون **بوسيط اختياري في آخر التوقيع**، بحيث يعطي غيابُه السلوكَ القديم حرفياً — ويجب أن يوكّد المثبت **النداء القديم نفسه** (بعدد الوسائط الأصلي) لا الجديد فقط. طُبِّقت مرتين هذه الجلسة (`ppPostOpAiSuggest` بوسيطين رابع وخامس، و`ppWaAiDraft` بحقل السؤال).

**#371 (enum مغلق سيرفر-سايد لكل اختيار وارد من العميل — وسلوك المجهول يتبع جوهرية الحقل):** أي قائمة خيارات تصل من العميل تُترجَم بـ`pick` على خريطة مغلقة بالخادم (نصّ السياق لا يأتي من العميل إطلاقاً ⇒ استحالة حقن البرومبت من هذا الباب، و`__proto__`/`constructor` مرفوضان). والمفتاح المجهول: **يُرفض الطلب** إذا كان الحقل جوهرياً يحدّد نوع المخرج (`doc_type`)، و**يسقط لصياغة عامة** إذا كان تحسينياً اختيارياً (`expectation`/`urgency`).

**#372 (العناصر النائبة تُحلّ client-side بالمخرجات الطبية):** الحمولة تُرسَل بـ`{الاسم}`/`{التاريخ}` والاستبدال يجري بالمتصفح بعد التوليد ⇒ اسم المريض لا يغادر الجهاز مع بقاء المستند شخصياً بالكامل. مطبَّقة بـ`referral_report` و`patient_reply_draft`.

**#373 (أرقام الملخّصات تُقرأ من عناصر العرض لا تُعاد حسابها):** أي ميزة AI تلخّص أرقاماً معروضة تقرؤها من `textContent` العناصر نفسها ويمنع البرومبتُ أيَّ حساب ⇒ يستحيل أن يخالف الملخّص الشاشة. إعادة الحساب بمسار مستقل تُنتج تبايناً يقتل الثقة بالميزة كلها.

**#374 (الفصل البنيوي بالحمولة يسبق الفصل بالتعليمات):** حين يجب أن يميّز الموديل بين صنفين من البنود، أرسلهما **مفصولين بعنوانين صريحين** لا بوسم داخل السطر (`[planned]`). الوسم داخل السطر لا يُنتج فصلاً دلالياً موثوقاً — والدليل: المخطط صار موضوع الإحالة رغم وجود الوسم، ولم تُحلّ المشكلة إلا بالعنوانين + قاعدة صريحة.

**#375 (مخرجات AI داخل مودال ذي سكرول مخفي تحتاج صندوقاً دائماً + `scrollIntoView`):** إخفاء صندوق النتيجة حتى التوليد داخل `modal-body` ذي `max-height` وسكرولبار مخفي بالتصميم يجعل المخرج يُولَد تحت خط الرؤية فيبدو مقصوصاً أو غائباً. الصندوق يُعرض دائماً (فارغاً) ويُمرَّر إليه `scrollIntoView` بعد التوليد.

**#376 (تجميع أزرار مبوّبة داخل hub يوجب إزالة بواباتها القديمة):** عند نقل أزرار مبوّبة بـCSS إلى صفوف hub مع الاحتفاظ بمعرّفاتها، تُزال قواعد `#id{display:none}` القديمة في نفس الكومِت — وإلا أخفت العناصرَ الوارثة للمعرّف داخل الهاب. وافحص أيضاً الأزرارَ التي **لم** تكن مبوّبة (فجوة كامنة يكشفها التجميع).

**#377 (نقل المعرّف بدل تعديل الدوال — بشرط توكيد الوحدانية):** نقل `id` من زر مُزال إلى عنصر عرض جديد يُبقي كل الدوال التي تكتب عليه (`textContent` لحالات التحميل) شغّالة بلا لمس؛ حيلة صفر-لمس معتمدة **بشرط** أن يوكّد المثبت أن كل معرّف منقول يظهر **مرة واحدة بالضبط** بالملف وأنه على العنصر المقصود.

**#378 (مشاركة جدول قائم بعمود نطاق أرخص من جدول جديد — بشرط تحديث كل اللودرات بنفس الكومِت):** إضافة `kind` بـ`DEFAULT` القيمة القديمة تجعل كل صف قائم مصنَّفاً كما كان (صفر انحدار) وتغطي الـRLS القائمة النطاقين. الشرط الملزم: **كل لودر قائم على الجدول يُضاف إليه فلتر النطاق بنفس الكومِت**، وإلا خلط النطاقين بصمت.

- **#379 — توكيدات المثبت على مخرجات منسّقة تستعمل التنسيق نفسه.** `toLocaleString('ar-SY')` يُخرج أرقاماً هندية — توكيد `includes('600')` فشل فعلياً بهذه الجلسة وصُحّح بمقارنة ناتج الدالة نفسها.

- **#380 — البطاقات فوق أقسام قائمة تفتح عبر دوال التبديل الأصلية حصراً.** أي فتح مباشر بالصنف يتجاوز الـlazy-load وحُرّاس الحالة (كحارس التعديلات غير المحفوظة)؛ والمفتوح لا يُنادى تبديله (كي لا يُغلق).

- **#381 — الاعتراف بالمصروف والسداد طبقتان منفصلتان.** حين يكون المصروف مُعترَفاً به عند الالتزام (`cost@date_sent`)، فإن تسجيل السداد **يجب** أن يعيش بطبقة ذمّة لا يقرأها أي محرّك ربح. إدخاله بالمصروفات ازدواج، واستبداله بها يكسر إسناد الطبيب ويؤجّل التكلفة لشهر خاطئ.

- **#382 — الرقم الذي يقرأ كذمّة يجب أن يكون ذمّة.** «مستحق للمخابر» القديم كان وكيل حالة تشغيلية يُسقط المسلَّم غير المدفوع. أي مؤشّر بصيغة مالية إمّا يُحسب كالتزام ناقص سداد أو يُعاد تسميته إلى ما هو عليه فعلاً.

- **#383 — الجدول التابع يرث سلوك FK من الجدول الشقيق لا من الحدس.** `lab_payments.lab_id` أخذ `ON DELETE SET NULL` لأن `lab_orders.lab_id` كذلك (تحقُّق حي من `pg_constraint`). CASCADE كان سيرفع المستحق فجأة عند حذف مخبر رغم أن المال دُفع.

- **#384 — الرصيد المحسوب لا المخزَّن يعطي self-healing مجاناً.** حساب `Σ cost − Σ payments` لحظة العرض يجعل تعديل تكلفة أو حذف سجل يصحّح نفسه بلا مهمة صيانة ولا ترحيل ولا احتمال انحراف.

- **#385 — `data-cur` صالح للثابت فقط، والديناميكي يستعمل `curLbl()`.** `paintCurrency` تعمل مرة واحدة عند جهوزية الـDOM؛ أي `<span data-cur>` يُحقن لاحقاً بقالب لا يُصبغ أبداً. صنف كامل من الأخطاء يظهر بعيادات الدولار حصراً — يستحق فحصاً مخصّصاً بأي ميزة تعرض مبالغ.

- **#386 — نظير الميزة عبر الطبقات لا يعني نظير الآلية.** «مدفوع» بجلسات المريض يحتاج FIFO وsplits وunearned لأن الإيراد يُعترف به عند الإنجاز؛ نظيره بالمخابر لا يحتاج شيئاً من ذلك لأن المصروف مُعترَف به سلفاً. نسخ الآلية كان سيضيف جدول أنصبة بلا أي مبرّر محاسبي.

- **#387 — Skipped بلوحة النشر ليس فشلاً حتى يُثبت العكس.** بنية `main → (حُرّاس + E2E) → release → Cloudflare` تجعل كل سطر `main` يظهر Skipped بالتصميم. قبل تشخيص أي «عدم ظهور ميزة»، تُقرأ آلية النشر نفسها لا حالة السطر الأعلى بالقائمة.

- **#388 — الكومِت الفارغ أداة تشخيص نشر مشروعة.** حين يعلق النشر بخطوة الرفع مع بناء سليم وحالة مزوّد Operational، `git commit --allow-empty` يولّد نشراً جديداً بنفس المحتوى بلا لمس أي كود — أرخص وأأمن من إعادة بناء أو تعديل تحفيزي.

- **#389 — البروتوتايب قبل لمس الملف الحقيقي عند أي تعديل بصري.** التعديل الشكلي يُبنى أولاً كنسخة مستقلة قابلة للفتح بنفس متغيّرات `theme.css` الحقيقية (لايت وداكن) وبمقتطفات من الماركأب الحيّ، ولا يُلمس الملف الأصلي قبل موافقة صريحة. القيمة أُثبتت بهذه الجلسة نفسها: البروتوتايب الأول بُني على قراءة خاطئة للطلب (طيّ بدل تبويبات) وكلفة التصحيح كانت صفراً لأن الملف الحقيقي لم يكن قد لُمس.

- **#390 — قياس الـDOM داخل حاوية `display:none` يُرجع صفراً — فأي دالة قياس تحتاج خطافاً عند الإظهار.** حين تُنقل أقسام إلى طبقة عرض بالتبديل (`adminGo`/`settingsGo`)، يجب جرد كل مستدعيات `scrollHeight`/`offsetHeight`/`getBoundingClientRect` التي تعمل وقت التحميل: ما وقع منها داخل تبويب غير افتراضي يفشل بصمت (بلا خطأ كونسول وبلا حارس أحمر) ويحتاج إعادة استدعاء عند إظهار تبويبه — idempotent ومحروساً بـ`typeof`.

- **#391 — توازن الوسوم يُقاس فرقياً ضد النسخة السابقة لا كقيمة مطلقة.** ملفات الصفحات تحوي إغلاقات لحاويات تُفتح خارج نطاق القياس (`.main`/`.content`)، فالرقم المطلق ليس صفراً بالتصميم. المعيار الصحيح: `Δ(بعد) == Δ(قبل)` مقروءاً من `git show HEAD:file` — وإلا تُهدر جولة تصحيح على «عيب» موروث سليم.

- **#392 — العنصر الترويجي الشرطي يبقى خارج طبقة التبويبات.** ما يظهر شرطياً ويختفي بعد تحقّق غرضه (دعوة تثبيت PWA مثلاً) لا يُدفن داخل تبويب: دفنه يقتل اكتشافه، وبقاؤه فوق شريط التبويبات لا يكلّف مساحة لأنه مخفي أصلاً في معظم الحالات.

**#393 — كاش الأصول المرقّمة يجب أن يكون SWR لا cache-first-forever.** التوكن يضمن تفرّد الـURL لا صحّة الجسم: سباقُ توزيع edges بالنشر قد يحبس جسماً قديماً تحت توكن جديد، وcache-first يخلّده وتتوارثه الترقيات عبر ترحيل `activate`. العَرَض خبيث: ماركب جديد + جافاسكربت قديم = زرٌ ظاهر ونقرةٌ ميتة بصمت. إعادةُ التحقق بالخلفية تجعل التسمم يشفى ذاتياً بلا خسارة أداء.

**#394 — كل مودال يحمل حقول إدخال أو صندوق ناتج يُصفَّر عند كل فتح، بلا استثناء.** المستند وثيقةٌ لحالة بعينها؛ وبقاء قيمة من حالة سابقة ليس إزعاجاً بل خطر خلط حالات. والأخطر ما يُصفَّر بعضه دون بعض (كان القصد يُصفَّر وسؤالُ المريض يعلق) لأن التناقض يخفي العطب. وعند اكتشاف موضع علوق واحد يُجرد الصنف كله فوراً لا الموضع وحده.

**#395 — سياق المثبت يُبنى ممّا توفّره الصفحة فعلاً لا ممّا يشتهيه الموديول.** حقنُ متغيّر عام بالستَب لأن الكود يطلبه يخفي بالضبط ما جاء المثبت ليكشفه — وقد كلّف هذا باغاً حيّاً بجلسة واحدة. وكذلك ستَبّات عناصر النموذج تحاكي سلوك العنصر الحقيقي (منتقي `<select>` يرفض قيمة خارج خياراته؛ الكائن العادي يقبل كل شيء فيخفي مسار السقوط الاحتياطي).

**#396 — المتغيّرات العامة ليست متاحة عبر الصفحات.** `currentUser` موجود ببطاقة المريض وصفحة المخابر وغائبٌ عن الداشبورد. أي موديول جديد يُنقل نمطه لصفحة أخرى يتحقق من توفّر كل عامّ يعتمده بالصفحة المستهدفة (قاعدة #19 تنطبق على الرموز لا الحالة فقط) — والأمتن أن يكون مكتفياً ذاتياً بمُحضِّر كسول.

**#397 — القالب يحفظ الحالة كاملةً مع الناتج المولَّد، وما يخصّ الحالة بعينها يُعاد إلى عنصر نائب عند الحفظ.** غايةُ القالب إلغاءُ نداء الـAI بالمرة التالية لا اختصارُه. والاتجاه المعاكس شرطُ سلامته: الاسم والتاريخ وأرقام الأسنان تعود نائبةً عند الحفظ وتُحلّ لحالة التطبيق — وقراءةُ الصندوق لا النص الخام تضمن التقاط تعديلات الطبيب اليدوية.

**#398 — القيمة الخاصة بالحالة لا تُجمَّد داخل نصٍّ يُعاد استخدامه، وبنيةُ النص تحدّد الأسلوب.** بنيةٌ حتمية (سطر «السن/الأسنان:» بأمر المخبر) تُشطب وتُحقن؛ وقيمةٌ منسوجة بالنثر (أسنان الإحالة) يُستبدل منها ما يُعرف يقيناً بعنصر نائب. وعند تعذّر الحلّ يبقى النائب ظاهراً مع تنبيه: **رقمٌ ناقص أوضح من رقم حالةٍ أخرى خاطئ**.

**#399 — صيغة المثال داخل البرومبت تعليمةٌ لا توضيح.** «إلى الزميل الكريم / أخصائي …» جعل النموذج يخترع اختصاصاً بمستند رسمي. كلُّ فراغ أو نقاط استمرار بصيغة نموذجية دعوةٌ للتعبئة: تُكتب الصيغ حرفيةً كاملةً لكل حالة، وتُفرد قاعدة صريحة تمنع استنتاج ما لم يرد نصّاً.

**#400 — القيمة المشتقّة مرّةً واحدة عند البذر دَينٌ مؤجَّل لا حلّ.** أي حقل يُشتقّ من مصدرٍ متغيّر ثم يُخزَّن يجب أن يحمل معه **علم مصدر** يقول «ما زال مشتقّاً» أو «صار مخصَّصاً»؛ وإلا تجمّد بصمت وانحرف عن مصدره عند أول تغيير، ولا شيء بالنظام يعرف أن ثمّة انحرافاً أصلاً. والعرَض يظهر بعيداً عن السبب (هنا: بمخرج الذكاء الاصطناعي وبالروشتة، لا بصفحة الإعدادات).

**#401 — علم المصدر يُصان سيرفر-سايد بتريغر، لا بمنطق عميل، متى كتب الحقلَ أكثرُ من مسار.** حصر الصيانة بالعميل يعني أن كل مسار كتابةٍ حاليّ أو مستقبليّ ملزَمٌ بتذكّر العلم — وكفى بمسارٍ واحد ينساه لينهار العقد. التريغر يجعل الصيانة خاصيةً بنيوية للجدول لا اتفاقاً بين الملفات.

**#402 — الـbackfill التصنيفي يقارن مع اللقطة المجمّدة لا مع القيمة الحالية.** حين نصنّف «هل خُصِّصت هذه القيمة؟» فالمرجع هو ما بُذرت منه (لقطة التسجيل)، لأن القيمة الحالية قد تكون هي المنحرفة بالذات — والمقارنة معها تعطي الجواب المعكوس تماماً للصفوف التي نريد إصلاحها.

**#403 — الـbackfill أحادي الاتجاه.** يرقّي فقط ولا يُنزل أبداً (هنا: `derived → custom` حصراً). فتُصبح إعادة التشغيل آمنة بنيوياً، ويستحيل أن تدهس هجرةٌ أُعيد تشغيلها قراراً صريحاً اتّخذه المستخدم بعدها.

**#404 — مقارنة الأسماء العربية تمرّ بمطبّع، ونظيره client-side يوثَّق كنظير سلوكي.** التطبيع الأدنى: `أ/إ/آ/ٱ→ا` · `ة→ه` · `ى→ي` · `ؤ→و` · `ئ→ي` · حذف التطويل والنقطة والفاصلة العربية · ضغط المسافات. **بدونه يفشل التصنيف على فرق نقطة واحدة** — وهو ما كان سيقع فعلاً على الحساب الحيّ للمالك.

**#405 — تدقيق التريغر لا يُفشل عملية المستخدم أبداً.** إدراج التدقيق داخل `BEGIN … EXCEPTION WHEN OTHERS THEN NULL; END`. سجلٌّ ناقص أهون بما لا يُقاس من حفظ إعداداتٍ يفشل بسبب سجلّ.

**#406 — دوال التريغر تُسحب منها `EXECUTE`.** `REVOKE ALL … FROM public, anon, authenticated` بنفس الهجرة التي تنشئها؛ وإلا ظهرت بجرد مدقّق Supabase الأمني كدوال `SECURITY DEFINER` قابلة للتنفيذ عبر `/rest/v1/rpc` وأغرقت الجرد بضجيجٍ يخفي ما يهمّ.

**#407 — `sb.auth.updateUser` لا يحدّث كائن المستخدم المحلي.** بعد أي حفظ للاسم/الدور تبقى `currentUser.user_metadata` على القديم حتى إعادة التحميل، فيقرأ كلُّ مشتقٍّ منها قيمةً بائتة. الواجب: مزامنة الكائن محلياً بعد نجاح الحفظ، **وتمرير القيمة الحرجة صراحةً** للمسارات التي لا تحتمل الخطأ.

**#408 — تعارض `SW_VERSION` عند إعادة الأساس يُحَلّ بالدمج لا بالاختيار.** حين يكون فرعٌ موازٍ قد أخذ الرقم نفسه: يُؤخذ رقمٌ أعلى من الأعلى، وتُدمج ملاحظتا الطرفين بالترتيب الزمني فوق كامل السجل القديم. **إسقاط ملاحظة أي طرف يكسر سجلّ الإصدارات إلى الأبد** لأن لا مصدر آخر لها. وتُعاد كل الحُرّاس والمثبتات **بعد** الدمج.

**#409 — البوابة تُشتقّ من الفحص الحيّ لا من التصميم.** قبل كتابة أي كود لميزةٍ خلف بوابة، يُستعلَم عن **حالة البوابة الفعلية للمستخدم المستهدَف**. هنا كان التصميم الموثَّق («تحقّق أدمن») سيمرّ من بوابات المستأجر فيرتدّ من أول نقرة، لأن حسابَي الأدمن يحملان `ai_features_enabled=false` — أمرٌ لا يظهر بأي قراءة للكود.

**#410 — البرومبت ليس ضماناً: أي مخرج AI يحمل أرقاماً تُقرأ كحقيقة يلزمه فحصٌ حتميّ بعد التوليد.** حُرِست الحمولة بمئة توكيد ولم يُفحَص المخرج قط، فانزاح رقمٌ بخانة واحدة تحت أشدّ قاعدة نسخٍ يمكن كتابتها. الضمان الوحيد فحصٌ بلا AI بالحلقة: كل رقم بالمخرج موجودٌ حرفياً بالحمولة، بلا قائمة بيضاء لأن كل رقم مشتقّ ممنوع أصلاً.

**#411 — الحارس يُبلّغ بصيغة المصدر لا بالمقنَّنة.** الرقم المخالف يُعرض **كما ظهر بالمخرج** (هندياً أو بفاصلة آلاف) لا بصيغته المُقنَّنة، وإلا بحث القارئ عن «999» في نصٍّ يكتب «٩٩٩» فيفقد التحذيرُ قيمته.

**#412 — مصداقية إشارة التحذير أثمن من تغطيتها الكاملة.** العدد المكتوب لفظاً يتجاوز أي حارس رقميّ بنيوياً، ومع ذلك لم يُبنَ كاشفٌ لفظيّ: كلماتُه شائعة وتُنتج إنذارات كاذبة. حين يكون الخيار بين تغطيةٍ أوسع وإنذارٍ يبقى ذا معنى، **تُختار المصداقية** ويُوثَّق الخطر المتبقّي صراحةً — قيمة أي إشارة كلها في أن ظهورها يعني شيئاً.

**#413 — حين تُلتَفّ المحظورات دلالياً، أزل السطح لا تُضف حظراً.** «لا توجد» المحظورة تُكتب «دون»، و«منتظم» تُكتب «شهري»، والاتجاه يُكتب «بشكل طبيعي». إن تكرّر الالتفاف فالعطب بالسطح الذي فُتِح لا بالكلمة: هنا كان طلبُ ربط كل مؤشّر «بمعناه التجاري» هو ما فتح باب الاختلاق، فأُغلق العقد نفسه (النقطة تصف ولا تستنتج) بدل ملاحقة الكلمات.

**#414 — تضخّم قائمة القواعد يأكل البنية.** ثماني قواعد أبقت العناوين سليمة، وخمس عشرة أسقطتها: الانتباه ينتقل إلى الامتثال وينضغط الشكل. القواعد تُجمَّع بأبوابٍ مسمّاة تحت مبدأ حاكم، ويُقاس طول البرومبت كمؤشّر انحدار.

**#415 — التعليل يسبق الحظر أثراً.** القواعد التي كُتبت معها علّتها («العدد اللفظي يتعذّر التحقّق منه آلياً فيمرّ خطؤه بلا كشف» · «المدخل لقطةٌ بلا مرجعٍ يُقاس عليه») امتُثلت أكثر من الحظر المجرّد عبر خمس جولات.

**#416 — نطاق الحظر يُنَصّ صراحةً وإلا قُرئ مقصوراً على آخر موضعٍ ذُكر.** «لا في متن ولا في عنوان نقطة» فُهمت مقصورةً على النقاط فتسرّبت الكلمة لسطر الإجراء. يُكتب النطاق كاملاً: بالسطر الافتتاحي وبالنقاط وبسطر الإجراء سواء.

**#417 — أي قيمة داخل مثالٍ بالبرومبت قابلة للنسخ إلى المخرج** (امتداد #399). المثال بقيمةٍ حقيقية الشكل («342 يوم») قد يُنسخ، **وحارس الأرقام يمرّره** لو صادف قيمة المستأجر. تُوصَف الصيغةُ وصفاً بلا قيم، ويُحرَس البرومبت من دخول أي رقم لاتيني.

**#418 — حقائق أي ملخّص تطابق ما تعرضه الشاشة لا ما يقوله عمودٌ واحد.** أي تصنيف يُشتقّ من دورة حياة لها أكثر من ختم يجب أن **يعيد استعمال ترتيب طبقة العرض نفسها** لا أن يخترع ترتيباً موازياً: `dismissed_at` يختم الخروج ولا يلمس `status`، فقراءة `status` وحده تجعل الملخّص يناقض البطاقة التي تحته.

**#419 — كل رقم بالحقائق يحمل نطاقه، والحارس الرقميّ لا يمسك الرقم الصحيح في نطاقٍ خاطئ.** التسمية تُقرأ داخل سياق بقية السطور لا وحدها: «إجمالي المرضى» وسط سطورٍ عن اليوم تُقرأ «حضر اليوم». الوقاية بالتسمية عند المصدر، ويُحرَس آلياً بمنع أي سطر رقميّ بلا كلمة نطاق.

**#420 — قاعدةٌ أثبتها الاختبار الحي على سطحٍ ليست مقفولةً حتى تُنقل إلى كل سطحٍ يشاركه البنية.** الميزات التي تتشارك «أرقام محسوبة مسبقاً + برومبت يمنع الحساب» تتشارك أصنافَ الخطأ نفسها؛ ونقلُ الحارس وحده دون القواعد ترك ثغرتين حيّتين.

**#421 — التوكيد النصّي على برومبت يقرأ النصّ الفعّال بعد فكّ لُحمة التسلسل.** أي عبارة يقسمها سطر مصدر (`" + "`) تُفشِل البحث النصّي زوراً؛ يُسطَّح المصدر قبل أي `indexOf`، وإلا صار كل توكيد برومبت مصدرَ إشارةٍ كاذبة.

**#422 — معاينة المنتج بصفحة التسويق تُولَّد من المحرّك الحيّ ثم تُجمَّد، ولا تُرسم يدوياً.** العميل يقارن المعاينة بحسابه، فالمطابقة يجب أن تكون بالبناء لا بالانضباط. والتجميد مشروع: مخرَج المحرّك يُنزع منه التفاعل والتفاصيل غير المرئية بحجم العرض وتُوحَّد تعريفاته المكرّرة، فيبقى الشكل ويسقط الثمن.

**#423 — الحارس الواقع بعد بداية الجسم ليس حارساً بل تأخيراً.** ما يمنع الرسم يجب أن يسبق وجود ما يُرسَم؛ وأي تحقّق يقع داخل `<body>` يعني أن المستخدم رأى ما لا يفترض أن يراه مهما قصر الزمن.

**#424 — النوم الوقائي دَينٌ مخفيّ: يُستبدل بإثبات الجهوزية لا يُضاف.** قبل إضافة أي `setTimeout` احترازيّ، يُثبَت أن الحالة المخيفة ممكنة أصلاً؛ وهنا كانت مستحيلة (العميل يُنشأ بـIIFE متزامن) والثمن وميضٌ لكل زائر غير مسجَّل.

**#425 — الحارس المعتمد على أصلٍ خارجي يفشل مفتوحاً حين يفشل الأصل.** `if (!x) return;` داخل حارسٍ أمني يعني «لا تحرس» لا «احرس بحذر»؛ فليكن للحارس مسارٌ مكتفٍ ذاتياً يغطّي الحالة القاطعة بلا أي تبعية.

**#426 — التحويل التصحيحي يقع بـ`replace` لا `href`.** الصفحة التي لا يفترض أن تُرى لا يجوز أن تدخل الـhistory، وإلا أعادها زرّ الرجوع وأعاد معها العيب نفسه.

**#427 — التعليق التوثيقي الذي يذكر وسماً حرفياً يخدع الحارس النصّي.** أي فحص يبحث عن وسمٍ خامّ يجب أن يرتكز على بداية السطر أو على مُحلِّل DOM، وإلا التقط التوثيق الذي يشرحه.

**#428 — حين يتذبذب المقياس الزمني، ابحث عن المقياس الثنائي تحته.** «كم استغرق» عرضةٌ لضجيج الإقلاع والشبكة، بينما «هل وقع أصلاً» حاسمٌ ومستقرّ — والدليل المقنع للمالك وللمراجعة معاً هو الثاني، ويُقاس قبل وبعد بنفس الأداة.

**#429 — مفتاح التخزين عقدٌ بين طبقات: يُقرأ حيّاً من مصدره لا يُنسخ.** حين ينسخ مستهلكٌ اسمَ مفتاح، فإعادة تسميته بالمصدر تُميت المستهلك **بصمت** (لا خطأ، فقط سلوك مفقود). فيُحرَس بمرآةٍ تستخرج القيمة من مصدرها وتطابقها على كل نسخة.

**#430 — القيمة اللاتينية/الرقمية داخل سياق RTL تُعزَل عند نقطة الإنتاج، والعزل يُثبَت بتشغيل UBA لا بفحص السلسلة.** أي قيمة تقنية (بريد · رابط · هاتف) تُحقن بنصٍّ عربي معرَّضةٌ لانقلاب الرسم إن بدأت برقم، لأن الأرقام ليست محرفاً قوياً فيرث المحايدُ التالي اتجاهَ الفقرة. العلاج بسطحين متناظرين: **نصّ** ⇒ لفّ بـLRM عند **نقطة الاستبدال** (لا بالنصّ المخزَّن — كي لا تراه الإدارة ولا تحذفه ولا يدخل العدّادات)، و**DOM** ⇒ صنف `unicode-bidi:isolate;direction:ltr` عند نقطة الرسم. ثلاثة شروط تجعله صحيحاً: (أ) **كل** مواضع الاستبدال تُعالَج معاً وإلا انحرفت المعاينة عن الإنتاج عن الاختبار؛ (ب) العزل لا يُطبَّق على قيمة قد تكون عربية، ويُشرَط حين يحمل السطر رمزاً مقدَّماً يُنقَل قلبُه بلا داعٍ؛ (ج) أي محاذاة **مُستنتَجة** من الاتجاه تُثبَّت صراحةً قبل قلبه. ويُفضَّل LRM على LRI/PDI لأن العازلات الحديثة قد لا تُطبَّق بمصيِّرات قديمة (مَقيس، لا مفترَض). والتحقّق يكون بتشغيل الرسالة الفعلية عبر تطبيق UBA ومقارنة الرسم قبل/بعد — فالسلسلة صحيحة في الحالتين ولا تكشف شيئاً. **ولحظة توضيح العيب لإنسان: اكتب المثال بسطرٍ لاتينيٍّ خالص، وإلا قلبته الخوارزمية نفسها وبدا التصحيح كأنه لم يحدث.**

**#431 — الهجرة الشرطية التي «تحترم تعديلات الإدارة» تفشل صامتةً بالتصميم، فعقد المرآة DB↔FALLBACK يحتاج فحصاً لا وعداً.** `UPDATE … WHERE body = <النصّ المتوقَّع بايت-بايت>` يُنفّذ صفر صفوف متى حرّرت الإدارة حرفاً واحداً — وهو سلوكٌ مقصود وصحيح، لكن أثره أن الكود يتقدّم والـDB يتجمّد **بلا أي إشارة**. حدث حرفياً: M66 توقّعت `0000` وسطرَ دعم وخاتمةَ تعجّب، والصفُّ الحيّ حمل `000000` وبلا سطر دعم وخاتمةَ نقطة، فبقي قالب الترحيب شهوراً يَعِد الأطباء بكلمة مرور لا وجود لها. **الإلزام:** (أ) بعد تطبيق أي هجرة شرطية، تُقرأ الحالة الحيّة ويُقارَن `md5(body)` بالـDB مع `md5` النصّ المُضمَّن المستخرَج حيّاً من الكود — التطابق هو الدليل الوحيد؛ (ب) عند الانحراف، المسار الأصحّ غالباً ليس هجرةً ثانية بل زرّ «↩ افتراضي» القائم بالواجهة (يعيد الجسم إلى `FALLBACK_TEMPLATES` ويُسجَّل بـ`updated_by`)؛ (ج) أي قالب يخاطب المستأجر يُراجَع مضمونه كلما تغيّر نموذج الحساب — نصٌّ صحيحُ الصياغة على نموذجٍ ميّت أخطرُ من نصٍّ ركيك، لأنه يُقرأ تعليماتٍ فيُتَّبع فيفشل.

**#432 — العلاج يُطبَّق على ما ثبت اعتلالُه فقط؛ وتوسيعُه «للاتساق» تغييرٌ سلوكيّ يحتاج دليله المستقل.** ولد الانحدار من نيّة حسنة: القياس أثبت انقلاب متغيّر واحد، فطُبّق العلاج على أربعة لأن الثلاثة الباقية «من نفس العائلة». لكن المحرف معدوم العرض ليس تجميلاً — **كل مُصيِّر يقرأ النصّ يراه**، فكسر تحويلَ واتساب للرابط إلى رابط قابل للنقر (والهاتف والبريد كانا مرشَّحين لنفس الكسر). **الإلزام العمليّ:** (أ) إن أنتج القياس قائمةَ «متأثّر» وقائمةَ «سليم»، فالعلاج يقتصر على الأولى ويُوثَّق سببُ استبعاد الثانية؛ (ب) توسيع النطاق لاحقاً يحتاج قياساً جديداً لا تعميماً؛ (ج) **يُبنى حارس على النطاق نفسه** (توكيد أن القائمة تساوي المتوقَّع حرفياً) فيوقف المثبتُ أي توسيع صامت. والصياغة الأعمّ: «لن يضرّ» ليست حجّة هندسية — **الحياد يُثبَت لا يُفترض**، وأرخصُ إثباتٍ له سؤالٌ واحد: مَن **غيرُ** العين يقرأ هذا النصّ؟

**#433 — التوكيد النصّي أعمى عن النطاق؛ والحارس يُبنى على شكل العطب لا على شكل الكود.** مرّ باغُ «متغيّر خارج النطاق» إلى المستخدم **مرّتين بيومٍ واحد** لأن كل طبقات الفحص كانت عمياء عنه بالبنية: `node --check` يمرّره (سليمٌ نحوياً)، والتوكيدات النصّية/regex ترى وجودَ السلسلة لا صلاحيةَ المرجع، والمثبت الذي **لا يُشغِّل** الدالة لا يكتشف ReferenceError. **الإلزام:** (أ) أي توكيدٍ على حقنٍ بالـDOM يُستكمَل بتشغيلٍ حقيقيّ بسياق `vm` أو بمحلّلٍ يفهم النطاق؛ (ب) حين يصل صنفُ عطبٍ إلى المستخدم، يُبنى حارسٌ يمسك **الصنف** لا الحالة، ويُقبَل فقط بعد أن يُعضّ بالعطب الأصلي **حرفياً**؛ (ج) المحلّل الساكن يجب أن يحاكي دلالةَ اللغة لا أن يفرض صرامةً أشدّ — الإسنادُ لاسمٍ غير معلَن يُنشئ عالمياً ولا يرمي، وفحصُ `typeof` لا يرمي؛ ومن يبلّغ عنهما ينتج ضجيجاً يُعلِّم تجاهُلَ الحارس. والقاعدةُ الأعمّ: **حارسٌ ينتج إنذاراتٍ كاذبة أسوأ من غياب حارس، لأنه يُدرِّب على تجاهل الأحمر.**

**#434 — تفسيرُ سلوكٍ بأنه «مقصود» ليس جواباً على حاجةٍ لم تُلبَّ.** حين أبلغ المالك أن البطاقة تعرض رقماً مختلفاً، كان التحليل صحيحاً (الحقل عمليٌّ لزرّ الواتساب لا مُعرّفٌ للدخول) وكان الجواب **ناقصاً**: بعد افتراق الحقلين لم يعد للأدمن سطحٌ يرى فيه رقم الدخول. تبريرُ التصميم يُنهي سؤالَ «هل هذا خطأ؟» ولا يُنهي سؤالَ «كيف أرى ما أحتاجه؟». **الإلزام:** إذا انتهى التشخيص إلى «مقصودة»، يُسأل صراحةً: ما الحاجةُ التي دفعت المستخدم للإبلاغ، وهل بقيت بلا تلبية؟ وإن بقيت فالإصلاح واجبٌ ولو كان السلوك سليماً. والعلاجُ المفضَّل **مشروط** (يظهر عند الافتراق فقط) فلا يُثقَل السطحُ العاديّ بضجيجٍ لحالةٍ نادرة.

**#435 — الثوابت المعمارية المكتوبة تُكسَر بقرار المالك بعد عرض الكلفة، وتُحدَّث وثيقتُها في الكومِت نفسه.** كان مكتوباً بـ`ci-guards.yml`: «الحُرّاس built-in فقط — صفر تبعيات npm». وحارسُ النطاقات يحتاج محلّلاً نحوياً حقيقياً لا يُكتب باليد. **الإلزام:** (أ) لا يُكسَر ثابتٌ موثّق من طرف المنفّذ — تُعرَض الكلفة والبدائل ويُطلَب قرارٌ صريح؛ (ب) يُخفَّف الأثر لأقصى حدّ (`--no-save` ⇒ لا lockfile ولا تلوّث؛ أداةُ بناءٍ لا تصل المستخدم)؛ (ج) **يُحدَّث نصُّ الثابت في الكومِت نفسه** — فوثيقةٌ تَعِد بما لم يعد صحيحاً أخطرُ من غياب الوثيقة، لأنها تُقرَأ لاحقاً كضمانة. والمبدأ الأعمّ: تكلفةُ الثابت تُقاس بما يمنعه فعلاً — وصنفُ عطبٍ وصل المستخدم مرّتين بيومٍ واحد يفوق ثمنَ تبعيةِ تطويرٍ واحدة.

**#436 — «المراقبة تعمل» و«المراقبة مفيدة» سؤالان منفصلان؛ والحدث بلا هوية ضجيجٌ مُكلِف.** أُعيد تشغيل Sentry فبدا الأمر منتهياً، بينما التقارير كانت تصل **بلا مستخدمٍ ولا إصدارٍ ولا بيئة** — فلا تُسمّي المتضرّر ولا النشرة ولا تفصل الإنتاج عن التجربة. **الإلزام:** أي مراقبةٍ تُفعَّل تُختبَر بسؤالين لا بسؤال: (أ) هل يصل الحدث؟ (ب) هل يكفي وحده لتحديد **مَن** تضرّر و**أي نشرةٍ** و**أي بيئة**؟ وإن سقط الثاني فالتفعيل ناقص. **وتُشتقّ وسومُ الإصدار من مُعرِّفٍ قائمٍ بالفعل** (توكن كسر الكاش هنا) لا من مصدرٍ جديدٍ يحتاج مزامنةً — فالوسمُ المتخلّف عن الواقع أسوأ من غيابه لأنه يوجّه التشخيص إلى نشرةٍ خاطئة. **والهوية تُرسَل بمُعرِّفٍ مبهمٍ حصراً** (UUID) لا ببريدٍ أو اسم: تُكتسب قابليةُ التصرّف بلا تصدير بيانات، ويُبنى **توكيدٌ ينهار إن أُضيف حقلٌ شخصيّ** لا مجرّد تعليقٍ يوصي. وأخيراً: كل نداءات المراقبة داخل `try` — **مراقبةٌ تُسقِط التطبيق أسوأ من غياب مراقبة**.

**#437 — المضيف الخارجي الواحد قد يحتاج أكثر من توجيهٍ بالـCSP؛ والسماح بتحميل السكربت ليس سماحاً بما يجلبه هو لاحقاً.** فُتح `browser.sentry-cdn.com` في `script-src` فحُمّلت الحزمة، ثم ظهر انتهاكٌ ثانٍ من `connect-src` لخريطة المصدر — أي أن التوجيه الذي اشتكى أولاً لم يكن كلّ ما يلزم. **الإلزام:** (أ) عند إضافة أي مضيفٍ خارجي تُراجَع **التوجيهات كلها** (`script-src` · `connect-src` · `img-src` · `frame-src` …) لا التوجيهُ المُبلِّغ وحده؛ (ب) **يُقاس أثر الانتهاك قبل إصلاحه**: هنا كان الأثر جودةَ التشخيص لا وصولَ التقارير، لأن مسار الإرسال يمرّ بمضيفٍ آخر مسموحٍ أصلاً — وتسميةُ الأثر بدقّة تمنع الذعر وتوجّه المستخدم إلى الفحص الحاسم بدل رسالة الكونسول؛ (ج) الفحص الحاسم لأنبوبٍ خارجيّ هو **وصولُ الحمولة إلى وجهتها**، لا خلوُّ الكونسول من الأحمر.

**#438 — ما لا يُعرَف محلياً يُكاش تلميحاً مربوطاً بهوية، وكلُ تحويلٍ مبكّر يحمل ميزانية قفزة.** الحارس المتزامن لا يحسم إلا ما يُقرأ محلياً؛ وما يحتاج رحلة شبكة يُخزّن **تلميحاً مربوطاً بهوية المستخدم** (وإلا ورِثَه من يليه على الجهاز)، **وعلى نتيجة نظيفة حصراً** — فالخطأ ليس دليل نفي، ومسحُ التلميح عند كل انقطاع يقتل الميزة عند من تسوء شبكته. **والتلميح توجيهٌ لا تصريح**: الفرض يبقى سيرفر-سايد، ومزوّر المفتاح يرتدّ بلا صفٍّ واحد — ولولا ذلك لما جاز الاختصار أصلاً. 🔴 **وأي زوج صفحات يحوّل أحدهما إلى الآخر شرطياً يحتاج كاسر حلقة لا يعتمد على نداءٍ ناجح**، لأن النداء سيفشل بالضبط في الظرف الذي وُضِع له. ولا يُرى هذا الصنف بمراجعة كلّ قطعةٍ على حدة — **القرار الصحيح بقطعة قد يكون هو نفسه فاتحَ الحلقة مع قطعةٍ أخرى**، فتُتتبّع فروع الفشل متقاطعةً لا منفردة.

**#439 — الحارس الذي يمنع رجوع دَين يجب أن يرمّز الصنف لا الحالة التي أُصلحت.** v146 حذفت نوم `50ms` من خمس صفحات ثم حرست **الرقم `50` على تلك الخمسة بالذات**؛ و`auth.html` تحمل `150` وليست منها — **فأفلتت من بعدين معاً** وبقي الدَين أشهراً على أول صفحةٍ يراها العميل. **الإلزام:** عند كتابة حارس منع-رجوع، يُسأل أولاً: **ما الصنف الذي يمثّله ما أُصلح؟** ثم يُجرَد الصنف كلّه على الشجرة بنمطٍ معمّم (`\d+` لا رقم حرفيّ)، وتُوسَّع قائمة الأسطح لتشمل كل حاملٍ للنمط لا من مسّه الإصلاح. **والحارس المحدود بالحالة أخطر من غياب حارس** — لأنه يمنح طمأنينةً كاذبة: يُقرأ بالجرد أن الصنف محروس، فلا يُعاد فحصه أبداً.

**#440 — قبل حراسة تكرارٍ، اجرد مداه؛ فقد يكون العلاجُ حذفَه لا حراسته.** المرآة تُحسِن حين يكون التكرار مقصوداً ومحدوداً، **وتضرّ حين تُثبّت تكراراً كان ينبغي ألّا يوجد** — إذ تمنحه شرعيةً مكتوبة وتجعل حذفه لاحقاً يبدو نقضاً لالتزام. **الإلزام:** قبل تسجيل أي مجموعة مرايا، يُسأل «كم سطحاً سيحمل هذا خلال ربع سنة؟» فإن تجاوز الجواب اثنين، **فالمصدر الواحد هو العلاج والمرآة تأجيلٌ لتكلفةٍ متصاعدة**. 🔴 **وربحُ المصدر الواحد أكبر من منع الانحراف:** المرآة تمنع التباعد مستقبلاً فحسب، **أمّا المصدر الواحد فينشر إصلاحاً قائماً إلى كلّ الأسطح بأثرٍ رجعيّ** — كما ربح أربعة مسارات حصانةَ درس هامبورغ بلا سطرٍ مكتوبٍ لها.

**#441 — الدالةُ المشتركة بين العرض والتصدير ليست تكراراً يُوحَّد بل تضادٌّ يُفصل ويُحرَس.** العرضُ للبشر يريد المحليّ والمقروء (أرقاماً هندية بواجهةٍ عربية)، **والتصدير للآلة يريد الحتميّ والقابل للفرز**؛ ومتى خدمت دالةٌ واحدة الغرضين انتصر أحدهما على الآخر صامتاً. **الإلزام:** عند الفصل، **يُحرَس الطرفان معاً لا الجديدُ وحده** — صفر نداءٍ للمُنسّق العرضيّ بمسارات التصدير، **وبقاءُ صيغته العرضية كما هي** — وإلّا وحّدهما لاحقاً من يقرأ «تنسيقان بملف واحد» بحسن نيّة فيقلب الواجهة لإصلاح عمود. **والقرينة العملية:** عدّ مواضع الاستدعاء **قبل** التعديل لا بعده — عدُّ هذه الجلسة أخطأ ثمانيةً بدل سبعة، وكشفه المثبتُ لا العين.

**#442 — المثبتُ يُختبَر قبل أن يُصدَّق، ومحلُّ الاختبار هو حدود المطابقة لا منطق التوكيد.** التوكيدات تُكتب بعنايةٍ ويُهمَل ما تُبنى عليه: حدودُ التقطيع وعدّادات السلاسل الفرعية. **الإلزام:** (أ) كل عدّاد سلسلةٍ فرعية يُثبَّت على فاصلٍ **لا يكون بادئةً لمعرِّفٍ شقيق** (`sub-card-na">` لا `sub-card-na`، وإلّا طابق `sub-card-name`)؛ (ب) كل مستخرِجٍ يقطّع مخرجاً إلى وحدات **يوكّد أولاً على عددها وشكلها** قبل أي توكيدٍ على محتواها، وإلّا فقد يُوكَّد على شظيّةٍ مبتورة؛ (ج) عند سقوط توكيدٍ يبدو صحيحاً، **يُفحَص المثبتُ قبل الكود** — وطباعةُ المخرج الفعليّ مرّةً واحدة أرخص من إعادة كتابة الكود على تشخيصٍ خاطئ. 🔴 **والحجّة ليست حجم الإزعاج بل اتجاهه:** الحدُّ الواسع ينتج هنا فشلاً كاذباً صاخباً، **وينتج بنفس آليته نجاحاً عبثياً صامتاً** — والثاني يَشحن الكود ومثبتُه أخضر.

**#443 — سطحُ المستأجر لا يجوز أن يعرض عن الصفّ نفسه أقلّ ممّا يعرضه السطح العامّ؛ والقياسُ حقلٌ بحقل لا انطباعٌ بصريّ.** حين تقرأ عدّةُ أسطحٍ صفّاً واحداً، ينحرف الأفقرُ صامتاً لأنّ لا أحد يفتح الاثنين جنباً إلى جنب — وينكشف حين يفعل المالكُ ذلك بصورتين. **والانحراف ليس تجميلياً حين يخصّ حقلاً مفروضاً:** إخفاءُ حدٍّ يُفرَض سيرفر-سايد عمّن يدفع بينما يراه زائرٌ مجهول يقلب اتجاه المعلومة على القرار المالي. **الإلزام:** (أ) عند تعديل أي سطحٍ يقرأ صفّاً مشتركاً، يُجرَد **جردُ حقولٍ** مقابل الأسطح الأخرى لا فرقٌ بصريّ؛ (ب) كل حقلٍ يظهر عامّاً ويغيب عن المالك يحتاج **سبباً مكتوباً** (كاستثناء خطة التجربة) وإلّا فهو عطب؛ (ج) الأولوية للحقول المفروضة (السقوف · البوابات · الحدود) قبل الحقول التسويقية.

**#444 — العنوانُ الجامع ادّعاءٌ عن كلّ ما تحته؛ فتحقّق من العضوية صنفاً صنفاً، وفي الاتجاهين.** حين يطلب بلاغٌ نقلَ عناصر تحت عنوانٍ يعلن خاصّيةً مشتركة («خارج معادلة الربح» · «للقراءة فقط» · «لا يؤثّر») فالتجميع الوارد في البلاغ **فرضيّةٌ لا واقعة**: افحص الخاصّية لكلّ عنصرٍ في الكود الحيّ، واستبعد ما لا يحملها **وضُمّ ما يحملها ولم يُذكَر**. المجموعة يجب أن تُغلَق بالاتجاهين وإلّا صار العنوان كاذباً — وعنصرٌ ناقصٌ من المجموعة يترك رقماً بلا تفسيرٍ في غير محلّه، أمّا عنصرٌ زائدٌ فيها فيمنح رقماً حقيقياً حصانةً لا يستحقّها. والخطأ الثاني أخطر: الموضع السيّئ يربك، والوسم السيّئ يُضلّ.

**#445 — قبل حذف نصٍّ «غير مفهوم»، افصل الشرح عن الإشارة.** السطر الواحد قد يحمل شرحاً ثابتاً (وهو المشكوّ منه غالباً) وقيمةً **مشتقّةً من الحالة** ملتصقةً به. احذف الثابت ورقِّ المتغيّر بدل أن يذهبا معاً؛ وإن لم يكن الفصل واضحاً فاعرض الخيارين على صاحب الطلب قبل الكتابة — فهو يصف ما أزعجه لا ما يجب أن يبقى، والفرق بينهما مسؤوليّة المنفِّذ لا المُبلِّغ.

**#446 — الحقلُ الذي تقرأ منه يُثبَت حيّاً قبل أن يُقرأ منه، لا يُستنتج من اسمه.** `treatment_key` اسمٌ يوحي بأنه مفتاح العلاج، وكان فارغاً بكل صفٍّ بالإنتاج؛ و`description` اسمٌ يوحي بالوصف، وكان موضعَ السنّ؛ واسمُ العلاج عاش بعمودٍ اسمه `type`. الكود شُحن ومثبتُه أخضر لأن البيانات المعلَّبة بُنيت على **الافتراض ذاته** الذي بُني عليه الكود — فالمثبت صادق على عالمٍ لا وجود له. القاعدة: قبل أي تجميعٍ أو عرضٍ من جدول، شغّل `select … group by` على الإنتاج وانظر ما **يوجد فيه فعلاً**، ثم ابنِ بيانات المثبت من تلك النتيجة لا من الذهن. (تخصيصٌ لقاعدة #19 على مستوى العمود لا الملف.)

**#447 — مرساةُ نصٍّ عربيٍّ تُستخرج من الملف ولا تُخمَّن، ولو حرفَ تشكيلٍ واحد.** بجراحة النقل فشلت مرساةٌ كتبتُها بالذاكرة لأن الملف يحوي «تُحمَّل» وكتبتُ «تُحمّل» — شدّةٌ وفتحةٌ مقابل شدّةٍ وحدها، فرقٌ لا تراه العين بالمراجعة. القاعدة: أي كتلةٍ عربيةٍ طويلة تُستخرَج بـ`index`/`rindex` على **مرساتين قصيرتين ثابتتين** (معرّف برمجي أو علامةٌ لاتينية) ثم تُقصّ من الملف، ولا تُكتَب كاملةً بالسكربت. والملاحظة المطمئنة: نمط **assert-قبل-write** أوقف الجراحة بلا كتابةٍ جزئية، فالفشل كان نظيفاً ومجّانياً — وهذا هو مقصد النمط.

**#448 — نصوصُ العرض ومحلّلاتُ الإدخال طبقتان لا طبقة، ولا يشملهما أمرُ لغةٍ واحد.** حين يطلب المالك «كل الكتابة بالفصحى» فهو يتكلّم عمّا **يقرؤه**، لا عمّا **يفهمه الكود**؛ وتطبيقُ الطلب حرفياً على `NL_MONEY_WORDS` و`nlPeriod` كان سيقتل قدرةً جوهرية بلا أن يطلبها أحد — والطبيب يكتب بالعامية غالباً. القاعدة: قبل تنفيذ أي أمرٍ لغويّ، افصل الطبقتين وسمِّهما للمالك واستأذن؛ ثم احرس الفصلَ بالمثبت **بالاتجاهين** (نفيُ اللهجة عن العرض، وإثباتُ بقائها بالفهم) لأن حارساً باتجاهٍ واحد يدعو الجلسةَ التالية إلى «توحيدٍ» يمحو ما بقي عمداً.

**#449 — عقدُ «صفر رقم من النموذج» يشمل كلَّ قيمةٍ تحدّد نطاقاً، والتاريخُ أخطرُها.** الرقمُ المنزاح يُرى أحياناً؛ أمّا التاريخُ المنزاح بيومٍ فيُنتج **عدداً صحيحاً تماماً بنطاقٍ خاطئ تماماً**، ولا يمسكه حارسُ الأرقام بنيوياً لأنه لا يقارن النطاقات. فكلُّ ما يحدّد المدى — تاريخ · يوم أسبوع · فترة · عتبة — يُستخرج بكودٍ حتميّ بالعميل، ويبقى للنموذج **التصنيفُ وحده**. وحين يسأل المالك «هل يفهم النموذج هذه الصيغة؟» فالجواب الصحيح ليس «نعم/لا» بل **تصحيحُ موضع السؤال**: النموذج لا يُفترض به أن يفهمها أصلاً.

**#450 — الطفرةُ التي لا تعضّ بلاغُ نقصٍ في المثبت، لا شهادةُ سلامةٍ للكود.**
حين تُطفَّر آليّةٌ ويبقى المثبتُ أخضر، الاستنتاجُ الكسول أنّ الآليّة زائدة فتُحذَف. والاستنتاجُ الصحيح أنّ **المثبت لم يختبر الحالة التي تجعلها حاملة**. والسببُ البنيويّ المتكرّر: حارسان متتاليان يتقاطع أثرُهما في السيناريو المُختبَر ويفترقان في غيره — فيُغطّي أحدُهما غيابَ الآخر أمام توكيدٍ **يعدّ ولا يصف**. **الإجراء:** عند طفرةٍ لا تعضّ، ابحث عن السيناريو الذي يفترق فيه الحارسان (غالباً: **المسارُ الناجح** لا الفاشل) قبل أن تحكم على الآليّة بالزيادة.

**#451 — أعِد قراءةَ ملفّ السياق من معرفة المشروع لحظةَ التحديث، لا من نسخةٍ أُخذت أوّلَ الجلسة.**
مسارُ `/mnt/project` **يتغيّر أثناء الجلسة** حين ترفع جلسةٌ موازية نسخةً أحدث. والنسخةُ المأخوذة أوّلَ الجلسة تصلح للقراءة والاستشهاد، **ولا تصلح قاعدةً للبناء** — إذ البناءُ فوقها يُنتج شوكةً تدهس كلَّ ما صدر بينهما، وإثباتاتُ الإضافة **لا تكشفها** لأنّها تفحص الاتّساقَ مع القاعدة لا حداثتَها. **الإجراء (إلزاميّ قبل أيّ بناء):** `ls -la /mnt/project/` ⇐ خُذ أعلى رقم ⇐ قارنه برقم نسختك ⇐ إن اختلف فأعِد النسخَ وابنِ من جديد. وأضِف إلى الإثباتات إثباتاً سابعاً: **«رقمُ القاعدة == أعلى رقمٍ موجودٍ الآن بمعرفة المشروع»**.

**#452 — العملةُ بُعدُ قراءةٍ كما هي بُعدُ كتابة.** كلُّ خريطةِ تحميلٍ (`mapping`) لصفٍّ يحمل مبلغاً **يجب** أن تحمل `currency` معه، وكلُّ سطحِ عرضٍ يوسم **بعملة الصف** لا بوسم العيادة. حارسُ وسمِ العملة يغطّي الكتابةَ فقط — القراءةُ مسؤوليةُ هذه القاعدة.

**#453 — أيُّ حقلِ سعرٍ يُملأ برمجياً من مصدرٍ يحمل عملة، يجب أن يقلب مبدّلَ عملتِه معه**، محروساً بـ`try/catch` وبشرطِ وجودِ العملة (فالكاشُ القديمُ بلا عملةٍ لا يُلمَس). ملءُ الرقمِ وحدَه كتابةُ مبلغٍ بوحدةٍ كاذبة.

**#454 — عمودٌ `NOT NULL DEFAULT`: التحويلُ عند الحمولة، لا بتغييرِ عقدِ الدالة.** حين يتضارب عقدُ دالةٍ عميلٍ (`null` = لا قيمة) مع قيدٍ بالـDB، يُحوَّل عند نقطةِ الإرسال فقط (`|| {}`)؛ تغييرُ الدالة يكسر منطقاً داخلياً يعتمد الـ`null`.

**#455 — الجلساتُ غيرُ المكتملة لا تستقبل توزيعاً يدوياً** (تكافؤ OpenDental الافتراضي). أيُّ سطحٍ يعرض صفوفَ توزيعٍ يجب أن يعكس أهليةَ باني التوزيع التلقائي **حرفياً**، وإلا وُلِد صفٌّ مخزَّنٌ يوقظ المعالجةَ الذاتيةَ إلى الأبد.

**#456 — اللقبُ المهنيّ مكوّنٌ لا نصٌّ داخل الاسم.** أيُّ لاحقةٍ أو سابقةٍ تُكتب داخل سلسلةِ الاسم تفقد صيغتَها القانونية بالتعريف — سبعُ صيَغ على أحد عشر حساباً هي النتيجةُ الحتمية لا الاستثناء. المكوّناتُ تُخزَّن والعرضُ يُركَّب. والإدخالُ المركَّب يحقّق ذلك **بلا عمودٍ جديد** إن بقي التخزينُ سلسلةً — فينجو كلُّ قارئٍ قائم.

**#457 — الاعتمادُ الجديد على أصلٍ مشترك داخل مسارٍ حرج يجب أن يتدهور رشيقاً لا أن يرمي.** الدرسُ ليس الوحدةَ بل **الشكل**: ميزةٌ تجميلية مُنحت القدرةَ على إسقاط صفحةٍ كاملة. وسباقُ النشر واقعٌ موثّق (v131) لا احتمالٌ نظريّ. فأيُّ نداءٍ لوحدةٍ مشتركة بمسار إقلاعٍ يُلَفّ بحارس وجود، والغيابُ يُعيد السلوكَ السابق حرفياً — والحارسُ يُفرَض آلياً بمسحٍ أسطوليّ لا بالانتباه.

**#458 — مثبتٌ يُثبت الإقلاعَ دون الحفظ لا يُثبت الميزة.** الإقلاعُ يُثبت أن الصفحة لم تنكسر؛ والعقدُ الذي وُجدت الميزةُ لأجله هو ما تكتبه. مسارُ الحفظ يُشغَّل فعلاً وتُفحَص حمولاتُه — وإلا كان حفظٌ يُسقط اللقبَ بصمت يبدو كميزةٍ تعمل.

**#459 — كائنُ الحالة المشترك بين إقلاعَي مثبتٍ يُلوّث الثاني بمخرج الأول.** حين يُزامن الكودُ حالةً محلياً (كـ`user_metadata` بعد الحفظ)، يبدأ الإقلاعُ التالي من نتيجةِ سابقه فيمرّ التوكيدُ على حالةٍ ملوَّثة — نجاحٌ كاذب من صنفِ «الستَب الكريم يخفي ما جاء المثبتُ ليكشفه». لكلِّ إقلاعٍ نسختُه.

**#460 — منطقةُ العلاج شرطُ ظهورٍ لا وسمَ حفظٍ فقط.** حين يملك النظامُ بُعداً يصف *أين ينطبق العلاج*، فاستعمالُه للتوجيه وحدَه يترك الواجهةَ تعرض ما لا ينطبق. الفلترةُ عند العرض هي المعيارُ المهنيّ (OpenDental يرفض عدمَ التطابق أصلاً)، والتوجيهُ الذكيّ يبقى شبكةَ أمانٍ لا بديلاً عن قائمةٍ صادقة.

**#461 — التوجيهُ الصامت يُنتج سيناريو كذبٍ لا يمسكه أيُّ حارس.** الصفُّ سليمٌ والمالُ سليمٌ ولا استثناءَ يُرمى — والعطبُ أن الطبيبَ نقر موضعاً وسُجِّل غيرُه. صنفٌ لا يظهر إلا بالاستعمال الحيّ، وعلاجُه الوحيد ألّا يُعرض ما سيُعاد توجيهُه. **قريبٌ من صنف «الرقم الصحيح بالنطاق الخاطئ» (#144): كلاهما صحيحٌ آلياً وكاذبٌ دلالياً.**

**#462 — قاعدةُ الأهلية تُشتقّ من الحالة السريرية لا من نيّة المستخدم.** علاجُ موقعِ القلع على سنٍّ قائمٍ يُنتج سجلاً غيرَ متماسك (زرعةٌ بلا قلع). والحجبُ مشروعٌ فقط لأن المسارَ الصحيح يبقى قريباً: `isExtracted` عمياءُ عن الحالة فالقلعُ **المخطَّط** يفتح الطريقَ فوراً. **حجبُ ما لا بديلَ قريباً له تعطيلٌ لا حراسة.**

**#463 — الرفضُ بالبناء أصدقُ من الرفضِ بتوست.** عنصرٌ يظهر ثم يُرفض عند اختياره يُعلّم الطبيبَ أن القائمةَ لا يُعتمد عليها. إن كان المسارُ ممنوعاً، فليكن غيرَ قابلٍ للوصول بنيوياً — والتوستُ لِما لا يمكن حجبُه بنيوياً وحدَه.

**#464 — نقلُ بطاقةٍ لا ينقل عقدها.** حين يُستنسخ نمطُ عرضٍ قائم (بطاقة · سطرٌ فرعيّ · شارة) إلى سطحٍ جديد، يجب جردُ **العقود الملحقة به** لا شكلِه وحده: `revSub` كان عقداً غيرَ مرئيّ ببطاقة الإيرادات (يظهر عند الاسترداد وحده) فسقط بالنقل وظهر بلاغاً حيّاً. القاعدة: قبل نقل أي مكوّن عرضٍ ماليّ، اقرأ **كلَّ فروعه الشرطية** لا مساره الافتراضي.

**#465 — الرقمُ الصحيحُ الذي لا يُطرح خطأُ عرضٍ كامل.** صنفٌ لا يمسكه حارسٌ ولا بروفر ولا حارسُ الأرقام: كلُّ رقمٍ صحيحٌ بمفرده والعطبُ في **العلاقة بينها**. أيُّ سطحٍ يعرض ثلاثةَ أرقامٍ تربطها معادلةٌ يجب أن يعرض **ما يجعل المعادلة تُغلق بصرياً** — وإلا فالقارئُ يطرح ويجد فجوةً فيفقد الثقة بالأرقام كلها.

**#466 — عقدُ إسقاط الملخّص الذكي مربوطٌ بتغيّر البيانات لا بإعادة الرسم.** قاعدةُ v143 («ملخّصٌ قديم فوق أرقام جديدة أسوأ من لا ملخّص») تسري حين **تتغيّر الأرقام**؛ أمّا تغييرُ إعدادِ عرضٍ فلا يبرّر إسقاطه، وإسقاطُه يكلّف الطبيبَ نداءَ AI من سقفه الشهري. أيُّ مسارٍ يريد تحديثاً جزئياً يعلّق نفسَه **بمُعرِّف عنصرٍ ثابت** ويستبدله بمكانه، بارتدادٍ دفاعيٍّ لإعادة الرسم الكاملة عند غيابه.

**#467 — سعرُ الصرف بطبقة المستأجر عرضٌ لا تحويل.** لا يُكتب أيُّ مبلغٍ محوَّلٍ بالقاعدة أبداً: كلُّ صفٍّ يبقى بعملته، والسعرُ يُستهلك لحظةَ الرسم وحدها. وأيُّ سطحٍ جديدٍ يستهلكه يجب أن يُبقي الطبقتين **مرسومتين منفصلتين فوقه** — التوحيدُ إضافةٌ فوق الفصل لا بديلٌ عنه.

**#468 — التعليقُ ليس نطاقاً.** حصرُ قاعدةِ CSS يعيش في **محدِّدها** حصراً؛ وعنوانُ قسمٍ أو تعليقٌ يقول «هذه لصفحات كذا» لا يحصر شيئاً. أيُّ قاعدةٍ تُكتب تحت عنوان نطاقٍ ضيّق يجب أن يحمل محدِّدُها ذلك الحصر فعلياً (صنفٌ على `body` · محدِّدٌ لعنصرٍ لا يوجد إلا هناك)، وإلا فهي قاعدةٌ أسطولية بنيّةٍ محلّية — وهذا بالضبط ما أخفى خلفيةَ النمط الفاتح شهوراً.

**#469 — التوكنُ يُقاس محسوباً لا مُعلَناً.** وجودُ `--x: قيمة` بالملف لا يعني أن القيمة تصل الشاشة: قاعدةٌ لاحقةٌ أعلى وزناً قد تدوسها بصمت، ولا `node --check` ولا أيُّ حارسٍ نصّيّ يرى ذلك. عند أيّ بلاغٍ بصريّ يُقرأ **الأثرُ المحسوب** على الصفحة أولاً، لا الإعلانُ بمصدره — امتدادٌ مباشر للقاعدة #19 إلى طبقة الأنماط.

**#470 — سلّمُ الارتفاع يُحرَّك ككتلة.** تعديلُ درجةٍ واحدة من `--bg`/`--bg2`/`--bg3` يُقاس **مقابل جارتيها** قبل الاعتماد: تعميقُ خلفية الصفحة وحدها كان سيُلصقها بالسطح الداخليّ ويُسقط الدرجةَ الثالثة كلياً. أيُّ تغييرٍ بلونٍ بنيويّ يُرفَق بجدول نسبِ الفصل بين الدرجات المتجاورة **بالثيمين**.

**#471 — تعريفٌ محلّيٌّ يكرّر توكناً أسطوليّاً ينحرف حتماً.** رقائقُ «اسأل بياناتك» كُتبت بأنماطٍ سطرية اخترعت لنفسها لوناً بدل قراءة توكن الرقاقة القائم، فوقعت على لون حاويتها وبقيت مخفيةً بالثيمين من يوم مولدها. أيُّ عنصرِ واجهةٍ له نظيرٌ مسمّىً بالأسطول (`.filter-chip` · `.search-input` · `.card`) يقرأ **توكناتِ ذلك النظير**؛ والانحرافُ عنها يحتاج سبباً مكتوباً لا صمتاً.

**#472 — المودالُ المشترك الذي يُفتح من أكثر من مسار: كلُّ مسارٍ مسؤولٌ عن تهيئته كاملةً بنفسه.** إعادةُ استعمال عناصر الـDOM مشروعة، أما إعادةُ استعمال **حالتها المُهيّأة** فليست — لأن الحالة تبقى بعد إغلاق المودال ولا يملك المسارُ التالي أن يعرف من هيّأها.

**#473 — ظهورُ عنصرٍ لم يُهيّئه المسارُ الحالي بقايا لا ميزة.** والاختبارُ الصحيح فتحُ المسار **بارداً**: تحميلُ صفحةٍ جديد ثم الدخولُ إليه مباشرةً، لا بعد مسارٍ آخر. وما يعمل بالتسلسل ويسقط بالبرودة **أسوأ من العطل الدائم** لأنه لا يُعرف متى يُعتمد عليه، ولا يُبلَّغ عنه إلا صدفةً.

**#474 — إصلاحُ عرَضٍ قد يكشف أخاه من الجذر نفسه.** لا تُغلَق المهمّةُ عند اختفاء العرَض؛ السؤالُ الواجب: **ما الذي كان هذا العرَضُ يخفيه؟** وحين يعود المستخدمُ ببلاغٍ ثانٍ بعد إصلاحٍ ناجح، الفرضيةُ الأولى أنهما عرَضان لجذرٍ واحد لا أن الإصلاحَ كسر شيئاً.

**#475 — تعليقٌ يدّعي تغطيةَ مساراتٍ متعددة يجب أن يُثبَت بحارسٍ لا بالثقة.** التعليقُ الكاذب أسوأ من غيابه: غيابُه يترك السؤالَ مفتوحاً، ووجودُه يُغلقه بجوابٍ خاطئ — و«يخدم المسارات الثلاثة» أوقف السؤالَ سنةً كاملة.

**#476 — المحاذاةُ بين صفوفٍ متوازية تُفرض بالبناء لا بالعين.** خانةٌ تُرسم إن احتاجها أيُّ صف، ثم يرسمها كلُّ صفٍّ ولو فارغة. **وتوكيدُ المحاذاة يجب أن يكون موضعياً لا عددياً**: تساوي عدد الخانات لا يثبت أن العنوان تحت نظيره.

**#477: المفتاحُ الذي لا يُكتب لا يستطيع أن يدوس.** بحمولةٍ مشتركة بين الإنشاء والتعديل، أيُّ حقلٍ لا يملك المسارُ الحاليُّ قراراً فيه يجب أن **يغيب عن الحمولة** لا أن يُكتب بقيمته المقروءة — الغيابُ مناعةٌ بنيوية والكتابةُ الصحيحة اليوم تصير دوساً غداً بأول مسارٍ جديد.

**#478: الفراغُ الذي صار معنى يُطارَد بكلّ ارتداداته.** حين يكتسب حقلٌ دلالةً للقيمة الفارغة، كلُّ `x ? x : افتراضي` عليه بالأسطول ينقلب من حمايةٍ إلى تدميرٍ صامت — وتلك الارتداداتُ كُتبت يوم كان الفراغ مستحيلاً فلا يراجعها أحد.

**#479: بابان لفعلٍ واحد يجب أن يعطيا النتيجة نفسها.** حين يُفتح السطحُ ذاته من مسارين، أيُّ قرارٍ ضمنيّ يتّخذه أحدهما دون الآخر يصنع فرقاً لا يقدر المستخدم أن يتوقّعه — والعلاجُ مُسنَدٌ واحد يُحمَل من كل باب، محروسٌ بعدٍّ بنيويّ لا بالانتباه.

**#480: الآليةُ التي لا تُعلن عن نفسها تساوي غيابها.** الأثرُ الجانبيُّ لحقلٍ قائم قد يكون أنظفَ هندسياً من ضابطٍ جديد، لكنه بلا لصيقةٍ تشرحه يبقى معلوماً لمن كتبه وحده — والوثيقةُ ليست بديلاً عن سطرٍ بالشاشة.

**#481: الجمعُ عابرَ العملات يقع وقت القراءة وحارسُ العملة يفحص الكتابة.** حارسٌ يفحص طرفاً واحداً من الدورة يترك الطرفَ الآخر مكشوفاً بالكامل، والنجاحُ المتكرّر لحارس الكتابة يُنتج ثقةً كاذبة بأن الصنف كلَّه مغطّى.

**#482: المثبتُ يرث افتراضات ميزته.** إصلاحُ عقدٍ يوجب مراجعةَ المثبت الذي كُتب معه — وإلّا صار المثبتُ يحرس العطبَ ويمنع إصلاحه بخضرةٍ كاذبة.

**#483: الوحدةُ ليست أقلَّ قابليةً للتصحيح من الرقم.** السماحُ بتعديل المقدار مع قفل وحدته تناقضٌ لا حماية — ورقمٌ صحيح تحت وحدةٍ خاطئة خطأٌ كامل بقاعدة النطاقات نفسها. أيُّ حقلٍ يُعدَّل يجب أن تُعدَّل وحدته معه أو يُقفل الاثنان معاً.

**#484: الحارسُ الذي يمسك باغاً ليس دليلاً على أنه يحرس الشيء الصحيح.** حين يرتدّ قيدٌ على مسارٍ معطوب، يبدو العطبُ عطبَ القيد — فيُفتح القيدُ ويصير الفشلُ الصريح تشويهاً صامتاً. **افحص لماذا وصل المسارُ إلى القيد قبل أن تمسّ القيد.**

**#485: الحمايةُ التي تفرض فعلَ كتابةٍ واعياً تُغني عن مودال تأكيد.** حين يستحيل تنفيذُ الفعل الخطر بلا إعادة إدخال البيانات، يصير التأكيدُ حشواً — والتصميمُ الذي يُبطل الحاجة إلى السؤال أفضل من التصميم الذي يسأل.

**#486: الحمولةُ تُحاكَم بمحتواها لا بشكلها.** «حمولةٌ بمتغيّر» ليست دليلاً على أنها تكتب مالاً؛ أيُّ حارسٍ يحكم على الشكل يُنتج إنذاراتٍ كاذبة تأكل مصداقيته — والحلُّ حلُّ التعريف وإسناداته لا تشديدُ الشكل.

**#487 — التطابقُ يثبت الاتفاق لا الصواب.** حارسُ المرايا يقيس أن النسختين متطابقتان؛ فلو سقط شرطٌ من الاثنتين معاً بقيتا متطابقتين وكلتاهما كاذبة، والحارسُ أخضرُ بحقّ. **كلُّ مرآةٍ ذات دلالةٍ مالية تحتاج تثبيتَ قيمةٍ مستقلاً** بمثبت المنطق الحرج مقيساً على النسختين، لا تطابقاً وحده.

**#488 — البُعدُ الجديد يجعل كلَّ متجهٍ قديم فراغياً تجاهه.** حين يُضاف بُعدُ قسمةٍ (العملة)، تمرّ كلُّ المتجهات السابقة سواء وُجد العزلُ أم لا لأنها كُتبت قبل وجود البُعد. **كلُّ كتلةٍ تُلمس تكسب متجهاً يحمل البُعد الجديد ويُعضّ**، وإلا فالخضارُ يشهد على الشيء الخطأ.

**#489 — الحارسُ يغطّي كلَّ أشكال النمط أو يُنتج خضاراً كاذباً.** نمطُ التراكم له شكلان (`+=` و`reduce`) ونمطُ التقاط القيمة له شكلان (الحقلُ مباشرةً أو عبر مُعرِّفٍ وسيط). تغطيةُ شكلٍ واحد تترك ثقباً بحجم النمط وتُغلق الملفَّ نفسياً — **وهو أخطرُ من غياب الحارس لأنه يمنع البحثَ اليدوي.** ورقمُ حارسٍ لم يُعضّ رقمٌ لا يُبنى عليه قرارُ نطاق.

**#490 — العقدُ يتّسع للشكل الصحيح، والكودُ لا يُجبَر على شكلٍ يرضي الحارس.** حين يرفض حارسٌ كوداً صحيحاً بشكلٍ آخر (الفلترةُ بمرشِّحٍ سابق بدل الفهرسة)، يُوسَّع العقدُ بوضوحٍ لا يُعاد كتابةُ الكود. والقياسُ يقع على **أضيق نطاقٍ دلاليّ** (سلسلة التكرار) لا على الدالة كلها، وإلا مرّت دالةٌ فيها مُراكمٌ محروسٌ وآخر عارٍ.

**#491 — الاستثناءُ يُصرَّح حيث لا يكسر شيئاً.** الملفُّ المقفول بايت-بايت لا يُلمس ولو بتعليق؛ استثناؤه يعيش **داخل الحارس** بالاسم ومعه ثابتُه مكتوباً. والاستثناءُ الذي يمكن الاستغناءُ عنه بتوسيع العقد **لا يُكتب أصلاً**.

**#492 — الافتراضُ لا يُقرأ حالةً.** أيُّ حقلٍ يفتح على قيمةٍ **غير مخزَّنة** يكذب على صاحبه: يجب أن يعرض الفراغَ صراحةً بخيارٍ مسمّى، ويشرحَ النقصَ حيث يُطلب فعل. وواجهةٌ تعرض ما ليس محفوظاً أسوأ من واجهةٍ تعرض نقصاً.

**#493 — ثابتُ الامتناع يفرض بابَ اكتسابٍ عند نقطة الإنشاء.** دالةٌ **تمتنع بالتصميم** عن اختراع قيمةٍ (`display` لا تخترع لقباً) تفرض على النظام مسارَ إدخالٍ صريحاً عند **التسجيل** لا عند الإعدادات وحدها — وإلا صار الامتناعُ فجوةً دائمةً تُسدّ بخطوةٍ لا يعرف المستخدمُ الجديد أنها مطلوبة.

**#494 — المُقنَّنُ يُقنَّن أمام عين صاحبه.** مُدخَلٌ حرّ يُعاد تشكيلُه عند الحفظ يجب أن يُعاد تشكيلُه **مرئياً** قبله (رفعٌ إلى المنتقي عند مغادرة الحقل) — والتقنينُ أثناء الكتابة ممنوع لأنه يقصّ الحرفَ من تحت الإصبع.

**#495 — شكلُ الضابط جزءٌ من معناه.** حبّتان بمعنى واحد على شاشةٍ واحدة تأخذان شكلاً واحداً؛ والشكلُ يُشدّ **بالاسم** لا بمسحٍ عام، كي لا يُجرّ ضابطٌ من صنفٍ آخر (اختيارٌ من متعدد · حقلُ مودال) إلى شكلٍ لا يناسبه.

**#496 — إصلاحُ نصف التنافر يُبقيه.** إذا كان العرَضُ المبلَّغ **اختلافَ عنصرين**، فمعالجةُ أحدهما تُبقي البلاغَ قائماً بالصورة نفسها — فالعنصرُ الثاني من الصنف نفسه يدخل السكوب ولو لم يُشَر إليه.

**#497 — التمدُّدُ يُصرَّح بالاسم لا يُشتقّ من الموضع.** أيُّ قاعدةٍ تعتمد `:last-child` أو `:first-child` لتوزيع مساحةٍ بعمودٍ مرن تنكسر بصنفين لا يرميان خطأً: **إعادةُ ترتيبٍ** تنقل الأثر لعنصرٍ لا يستحقّه، و**إخفاءُ عنصرٍ** بـ`display:none` لا يُخرجه من الـDOM فيبقى حاملَ الأثر أو يتركه بلا حامل. **الإلزام:** العنصرُ الذي يجب أن يتمدّد يُسمّى صراحةً.

**#498 — سعرٌ واحد باتجاهين، لا سعران.** أيُّ سطحٍ يعرض تحويلاً بالاتجاهين يجب أن يشتقّ الاتجاهين من **سعرٍ مخزَّنٍ واحد** بالقلب الرياضي، لا أن يخزّن سعراً لكل اتجاه: السعران المستقلّان ينحرفان بأول تحديثٍ لأحدهما دون الآخر فيُنتجان رقماً **صحيحَ الشكل كاذبَ المعنى** لا يمسكه حارسٌ ولا بروفر لأن كلَّ رقمٍ سليمٌ بمفرده. **والإلزام يمتدّ للواجهة:** حقلُ الإدخال يبقى واحداً وسطرُ إعلان السعر يبقى بصيغته الأصلية بالوضعين — لأن حقلين يوحيان بسعرين ولو كان المخزَّن واحداً.

**#499 — طفرةٌ لا تعضّ إشارةُ حذفٍ قبل أن تكون إشارةَ توكيدٍ ضعيف.** حين تمرّ طفرةٌ متعمَّدة، الاحتمالُ الأول أن التوكيد أعمى — **والثاني، وهو الأخطر لأنه يُسكِت، أن الكودَ المطفور ميتٌ أصلاً**. فقبل تقوية التوكيد يُسأل: هل لهذا السطر أثرٌ يمكن أن ينكسر؟ وسطرُ ترجيعٍ بمسارٍ لم يُسنِد شيئاً بعدُ **يَعِد بحمايةٍ لا يقدّمها** ويُضلّل من يقرؤه لاحقاً فيبني عليه؛ وقد يكون **خاطئاً دلالياً** بفرعٍ آخر (ترجيعُ حالةٍ حُفظت فعلاً). **الإلزام:** يُحذف لا يُحرَس.

**#500 — الرفض ليس الفشل الوحيد.** أيُ ارتدادٍ معلّقٍ بـ`.catch` وحده يفترض أن الشبكة **تُرفَض**، وسوكيتٌ مُعلّق لا يُرفَض أبداً — فالمسار البديل يموت بلا أن يُستدعى، والنسخة التي بُنيَ لأجلها حاضرة طوال الوقت. **والأخطر أنّه لا يرمي خطأً ولا يمسكه حارس** — يُقرأ «بطءاً» لا عطلاً. **الإلزام:** كلُ ارتدادٍ لنسخةٍ محليّة يُحرَس **بمهلة لا برفض**.

**#501 — الإنقاذ سباقٌ لا قطع.** قطعُ الطلب بمهلة (`AbortController`) يقتل **الطلب البطيء الناجح** ويخلق انحداراً حيث لا نسخة محليّة. **الإلزام:** الطلب لا يُقطع أبداً، والفرع البديل **يبقى معلّقاً حين لا يملك ما يقدّمه** فلا يفوز بالسباق ⇒ **صفر انحدار بنيويّاً لا بالحرص**. ودليلُ الدعوى توكيدٌ صريح على حالة «بلا نسخة».

**#502 — كسرُ الكاش فعلٌ ذو أثرٍ أوفلاين.** التوكن يدور على الأصول كلّها ولو لم يتغيّر محتواها، فتصير كلُ مفاتيح الكاش المحليّ غريبةً دفعةً واحدة — والتسخين يغطي الصفحات ولا يغطي أصولها. **الإلزام:** أيُ مسارٍ يبحث بمفتاحٍ موسومٍ بنسخة يجب أن يملك **ارتداداً لنفس المورد بوسمٍ آخر عند الانقطاع**، **خدمةً بلا تخزين** حتّى لا يُخلّد جسمٌ قديم تحت وسمٍ جديد (v131).

**#503 — الستالة تُعلَن حيث لا يراها المستعمِل.** حين تُخدَم نسخةٌ محفوظة و**المتصفّح يظنّ نفسه متّصلاً**، تكون كلُ إشارات الانقطاع القائمة صامتة بالتصميم — فرقمٌ مالي قديم يُقرأ حاضراً. **الإلزام:** إعلانٌ مستقلّ لا يتراكب مع إشارة الانقطاع، **ويشفى ذاتيّاً** بأول قراءةٍ ناجحة — إعلانٌ يعلَق يصير ضجيجاً يُتجاهَل.

**#504 — إصلاحُ صنفٍ متعدّدِ الأسطح يُختَم بمسحٍ نصّيّ مصنَّف، لا بجردٍ من الذاكرة.** v200 عالجت ترتيبَ الطبقات بموضعين وv202 بثالث، وكلتاهما كُتبت بصياغةِ من أغلق الباب — وبقيت **ثلاثةُ أسطحٍ** أثقلُها قراءةً حيّةً عند المالك. **الإلزام:** كلُّ إصلاحٍ لصنفٍ قد يتكرّر يُنهى بمسحٍ على **نمطه النصّيّ** عبر الأسطول، وتُفرَز نتائجُه صنفين بالقراءة لا بالاسم — *موضعُ عرضٍ* (الترتيبُ فيه معنى) و*حلقةُ حسابٍ* (الترتيبُ فيه بلا معنى) — ويُسجَّل الجردُ بالسياق. **وما لم يُصلَح يُسمّى صراحةً** (انظر «المتبقّي المعلوم» أدناه): علاجٌ جزئيٌّ يُعلن نفسه كاملاً أسوأ من علاجٍ مؤجَّلٍ مكتوب، لأنه يُغلق باب البحث عن البقية.

**#505 — رتّب عند الإخراج، لا داخل حلقة الحساب.** حين يكون الترتيبُ حاجةَ عرضٍ فوق حسابٍ لا يبالي به، **لا تُمسّ الحلقة**: تبقى تمشي على المجال كاملاً بترتيبها الحرفيّ، ويُشتقّ الترتيبُ من القائمة الناتجة عند الإخراج وحده — بمصدرٍ واحد وبـ`try/catch` يُبقي المثبَّت عند أي خطأ. مكسبان: **صفر خطر انحدارٍ حسابيّ بالبناء**، ودعوى «عرضٌ صرف» تصير **قابلةً للإثبات** بتوكيدٍ أن كلَّ رقمٍ بايت-مطابقٌ بين الوضعين — وهو التوكيدُ الذي يجب أن يرافق كلَّ تغييرِ ترتيبٍ فوق طبقةٍ مالية.

**#506 — «فشلت القراءة» و«القيمةُ الفارغة المقصودة» حالتان لا حالة.** أيُّ ارتدادٍ fail-open فوق قيمةٍ يملكها المالك يجب أن يفرّق بينهما **بعلم وصولٍ** لا بفحص القيمة، لأن `''` و«غائب» يتساويان بأي فحصٍ للقيمة. وبلا هذا التفريق يبتلع الارتدادُ — وهو حمايةٌ صحيحة — قراراً صريحاً للمالك **بصمتٍ تامّ**: لا خطأ يُرمى ولا حارس يحمرّ، والشاشةُ تعرض قيمةً قرّر صاحبُها إزالتها.

**#507 — إعدادٌ واحد بأكثر من سطحٍ يحتاج سياسةَ غيابٍ واحدة مصرَّحة.** حين يُقرأ المفتاحُ نفسه بخمسة أماكن، لا يكفي أن يكون كلُّ مكانٍ صحيحاً بمفرده: انحرافُ سياساتِ الغياب **لا يرمي خطأً** بل يُنتج شاشتين تناقضان بعضهما (اللاندينج يُخفي وصفحةُ الشروط تعرض) — والمالكُ يرى الاثنتين فلا يعرف أيّهما يصدّق. **الإلزام:** تُصرَّح سياسةُ الغياب مرةً واحدة، وتُطبَّق على الأسطح كلّها بالكتلة نفسها، ويُسجَّل جردُها بالسياق.

**#508 — نطاقُ الإخفاق يحدّد صياغته: العنصرُ النائب الظاهر عقدٌ صالحٌ داخل واجهة المشغِّل، باطلٌ بمخرَجٍ يغادر إليه العميل.** «اتركه حرفياً ليراه الأدمن» صوابٌ بمعاينةٍ داخلية وخطأٌ بمتنِ رسالةٍ تصل طبيباً دافعاً. وحين يُطهَّر المخرَج، **يبقى النطاقُ ضيّقاً بالاسم**: مكنسةٌ عامّة تُخفي أعطالاً حقيقية بدل أن تُظهرها — يُكنَس ما ثبت أنه يخصّ المستقبِل لا ما «قد» يكون فارغاً.

**#509 — الحارسُ يحرس ما يراه، ونطاقُه يُشتقّ من بنيةٍ قد تكون هي نفسها موضعَ النقص.** حارسُ وسم العملة يستمدّ قوّته من أن جردَه مشتقٌّ من أعمدة الجداول لا مكتوبٌ باليد — **وهذا بعينه ما أعماه**: جدولٌ لا يحمل عمودَ عملةٍ أصلاً يسقط من الجرد، فالثغرةُ الوحيدة التي لا يراها هي **الثغرةُ الكاملة**. **الإلزام:** كلُّ حارسٍ يشتقّ نطاقَه من سمةٍ ما يجب أن يُسأل مرّةً واحدة صراحةً: «ماذا لو كانت السمةُ نفسها غائبة؟» — والجواب يُكتب بالسياق لا بالذاكرة. وفحصُ «أعمدةُ مبلغٍ بلا عمود عملة» صار سؤالاً يُطرح على المخطّط كلّه عند كل جدولٍ ماليٍّ جديد.

**#510 — البياناتُ القديمة لا تُدار باستدلالٍ حرّ بل بأضيق ثابتٍ سريريّ يصمد فيها.** حين تغيب البنيةُ الصريحة (`unit_id`)، الإغراءُ أن يُخترع تمييزٌ من الشكل — و«دعامتان متلاصقتان ⇒ وحدتان» شكلٌ يصدق ويكذب بالتساوي. البديلُ أن يُنتزع **ثابتٌ من المجال نفسه** لا من الشكل: «كلُّ جسرٍ يحمل ≥1 pontic» — فيصير القرارُ مشتقّاً من واقعٍ سريريّ لا من تخمينٍ هندسي. وما لا يصمد فيه الثابتُ (الوحدةُ الأقدم بلا صفوف PONTIC) **يُعزَل صراحةً ويُترك بسلوكه السابق** بدل توسيع الاستدلال فوقه.

**#511 — توسيعُ النطاق يوقظ استدلاليّاتٍ كانت نائمةً بأمان.** استدلاليةُ «الداخليّ = pontic» كانت غيرَ ضارّةٍ ما دام النطاقُ يقصّ عند الدعامة الملاصقة؛ ولحظةَ اتّسع النطاق صارت **أداةَ إتلافٍ للبيانات**. **الإلزام:** أيُّ توسيعٍ لنطاق عمليةٍ مدمِّرة يستوجب جردَ كلِّ فرعٍ شرطيّ يقرأ «الموضع داخل النطاق» — فالفروعُ التي تعتمد على الحدود تتبدّل دلالتُها بتبدّل الحدود، بلا أن يتغيّر سطرٌ واحد منها.

**#512 — عمودان يُقارَنان نصّاً يجب أن يكونا من نوعٍ واحد، وإلا فالفرزُ يكذب حتماً لا احتمالاً.** `timestamptz` تصل `…T00:00:00+00:00` و`date` تصل `2026-08-13`؛ ومقارنةُ سلسلتين إحداهما بادئةُ الأخرى تُرتِّب الأطولَ أعلى **دائماً**. فأيُّ قيدٍ موحَّد يخلط صفوفاً من جدولين يجب أن يُشتقّ مفتاحَ فرزه من قيمةٍ **مقنَّنة** (يومٌ محليّ · طابعٌ زمنيّ) لا من السلسلة الخام مهما بدت متشابهة. والفحصُ الواجب قبل أي فرزٍ مختلط: اقرأ نوعَ العمودين من `information_schema` لا من اسمهما.

**#513 — مفتاحُ الفرز يُشتقّ من نفس منبع التاريخ المعروض.** الصفُّ يكتب تاريخه بـ`toLocaleDateString` المحلية، فقصُّ `slice(0,10)` من سلسلةٍ UTC يخلق انحرافاً يظهر ثلاثَ ساعاتٍ باليوم فقط — وهو أخبثُ من الباغ الذي يعالجه. القاعدة: **الفرزُ والعرضُ من دالةٍ واحدة أو من اشتقاقٍ مكافئٍ لها بالتصميم**، لا من صيغتين تتصادفان أغلبَ الوقت.

**#514 — لا مقاصّة بين طرفين مستقلّين: الرقمُ الصافي يمحو ما لا سطحَ آخر يعرضه.** ذمّةُ كلّ مورّدٍ التزامٌ قائمٌ بذاته والرصيدُ عند غيره أصلٌ مستقل، فعرضُ الفرق يُخفي أحد الطرفين. والاختبارُ الحاسم قبل أي تجميع: **هل يوجد بالصفحة نفسها سطحٌ يستردّ منه القارئُ الطرفَ المخفيّ؟** إن لم يوجد فالتجميعُ محوٌ لا اختصار — والعرضُ الإجماليّ (سطران) هو الصواب، وبوابةُ الظهور تُفحص على الإجمالي لا على الصافي وإلا اختفت طبقةٌ كاملة بصافيها الصفر.

**#515 — الحارسُ الأخضر بعدّادٍ متحرّك أخطرُ من الحارس الأحمر.** حُرّاس الأشكال يمسكون صِيَغاً معدودة (`+=` · `-=` · `reduce`)؛ فإعادةُ كتابة موضعٍ بصيغةٍ مكافئةٍ دلالياً لكن خارج قائمته تُخرجه من الرقابة **بصمتٍ والبوابة خضراء**. القاعدة: **أرقامُ الحُرّاس تُقرأ وتُقارن قبل/بعد كل تعديل يمسّ موضعاً محروساً** — وأيُّ هبوطٍ بالعدّ هو انحدارُ تغطيةٍ يُعامَل معاملةَ الاحمرار، والصيغةُ تُعاد لما يراه الحارس بدل أن يُوسَّع الحارسُ على عجل.

**#516 — القاعدةُ الصحيحة باستثناءٍ خاطئ تُنتج بالضبط ما وُضعت لتمنعه.** v133 أسّست «القالبُ لا يخزّن اسمَ الحالة» ثم أعفت منها الرسالةَ الحرة بحجّةٍ عن **مصدر** النصّ («مخرجُ النموذج ينزل بالحقل») بينما السؤالَ الحاكم عن **حالته**: ينزل مَحلولاً أم بعناصرَ نائبة. **الإلزام:** أيُّ استثناءٍ من قاعدةٍ أُسِّست يُكتب معه **الفحصُ الذي يُثبته** لا المبرّرُ الذي يشرحه — ويُعاد تشغيلُ الفحص عند كل توسيعٍ للقاعدة، فالمبرّرُ يبقى مقنعاً بعد أن يبطل، والفحصُ يفشل.

**#517 — إصلاحُ طرفٍ واحدٍ من عقدٍ ذي طرفين أسوأُ من تركه.** تجريدُ الاسم عند الحفظ **وحده** كان سيُخرج «مرحباً {الاسم}» حرفياً إلى مريض — أوضحُ فضيحةً من اسمٍ خاطئ، وسببُه أن أحد السطحين لا يحلّ العنصرَ النائب أصلاً وبعقدٍ مقصود. **الإلزام:** كلُّ تغييرٍ يمسّ ما **يُخزَّن** يستوجب جردَ كل قارئٍ لذلك المخزون وإثباتَ أنه يفكّ ما رُمّز — وإلا فالتغييرُ نصفُ عقدٍ لا إصلاح.

**#518 — سؤالُ التحقّق ليس عبئاً بل أداةُ كشف.** ثلاثٌ من علل هذه الكتلة لم يبلّغ عنها أحد: ظهرت لأن المالك طلب **التأكّد** («تأكّد أن القوالب لي») أو طلب **مراجعةَ ما نُفِّذ**. **الإلزام:** بعد كل نشرةٍ تمسّ بياناتٍ يعيد المستخدم استعمالها، يُقرأ **محتوى** ما خُزِّن فعلاً لا مسارُ تخزينه فقط — الأولُ يكشف ما لا يكشفه الثاني، والفرقُ بينهما هو الفرقُ بين «الكود صحيح» و«البيانات صحيحة».

**#519 — ما يبدو طلبَ واجهةٍ قد يكون تشخيصاً ناقصاً لمعمارٍ صحيح.** طلبُ «اجعل زرَّ واتساب يفتح مودالاً» كان علاجاً معقولاً لعرَضٍ حقيقيّ، لكن البحثَ أظهر أن الموضعَ صحيحٌ أصلاً والمعطوبَ هو **المدخل** — فالعلاجُ المطلوب كان سيُكلّف نقرةً على كل إرسالٍ بأداةٍ وُجدت للدفعات. **الإلزام:** يُبحَث النمطُ الصناعيّ قبل تنفيذ طلبِ واجهةٍ يغيّر تدفّقاً قائماً، ويُعرَض البديلُ بكلفته مقابل كلفة الطلب — والقرارُ للمالك، لكن **بمعلومةٍ لا بامتثال**.

**#520 — علمُ «نجح الجلب» ليس علمَ «ساهم المصدر».** `OV_PAY.loaded` تعني أن الاستعلامَ عاد بلا خطأ، لا أن صفّاً واحداً نجا من الفلترة — والسطحُ الذي **يسمّي مصدر رقمه** بناها على الأولى. **الإلزام:** كلُّ سطحٍ يعلن مصدرَ رقمٍ يشتقّ الإعلانَ من **عدّاد المساهمة الفعلية** لا من نجاح الجلب؛ وإذا لم يكن العدّادُ موجوداً فهو جزءٌ من الإصلاح لا خارجه.

**#521 — الاسمُ طرفٌ من العقد كالمحتوى.** الاحتياطُ كان يبني TSV صحيحاً بنوع MIME صحيح وBOM صحيح ثمّ يسمّيه `.csv` — فينقض الاسمُ ما صانه المحتوى، وإكسل يقرأ الامتدادَ لا الـMIME. **الإلزام:** أيُّ ملفٍ يُولَّد للمستخدم يُحكَم عليه بثلاثيّته كاملة — **المحتوى والـMIME والامتداد** — ونجاحُ اثنين لا يشفع لخطأ الثالث.

**#522 — تعليقٌ يعِد بما لا يفعله الكودُ لا يُصدَّق ويُقاس.** «يخدم المسارات الثلاثة» (v201) و«يُستخدم لتوحيد MRR» كلاهما تعليقٌ صحيحُ النيّة، لكن الأول كان كاذباً والثاني ناقصاً (لا يذكر أن التغيير لا ينتشر). **الإلزام:** عند تدقيق ميزةٍ يُبنى الحكمُ على **تشغيل** مستهلكيها لا على قراءة تعليقها، ويُعدُّ كلُّ مستهلكٍ بالاسم — فالتعليقُ يوثّق نيّةَ كاتبه لا سلوكَ اليوم.

**#523 — المُثبِّتُ الذي يثبّت العطبَ يحمرّ عند الإصلاح، وهذه إشارةُ صحّةٍ لا فشل.** توكيدا التدقيق «صفر موضع يُبطل الكاش» كانا **توصيفَ الباغ مكتوباً بصيغة عقد**. **الإلزام:** توكيدٌ يحمرّ بعد إصلاحٍ مقصود يُقرأ أولاً على أنه **كان يثبّت الحالة المعطوبة** — يُراجَع نصُّه قبل مراجعة الكود، ويُقلَب للعقد المصحَّح لا يُحذَف (درس v205).

**#524 — رقمُ عرضٍ لا يعجب المالك يُفحَص قبل أن يُعالَج.** السؤالُ الأول: **هل الرقمُ كاذبٌ أم الواقعُ كذلك؟** هنا كان الواقعُ صحيحاً (ثلاثةُ اشتراكاتٍ مفعّلة) والوسمُ وحده كاذباً. **الإلزام:** يُمنع منعاً باتاً اقتراحُ تعديلِ حالةٍ حقيقية (مُدَد · حالاتُ حساب · صفوفُ بيانات) لأجل تحريك رقمِ عرض — وإن تبيّن أن الواقعَ يحتاج تصحيحاً فالتصحيحُ يُبرَّر **بالواقع** لا بالرقم.

**#525 — الميزةُ التي تُبنى فوق مُدخَلٍ تجريبيّ تُسلَّم ومعها إفصاحٌ صريح عن حدود معناها.** الرقمُ الصحيحُ رياضياً فوق مُدخَلٍ لا يمثّل الواقع **يبدو موثوقاً وهو ليس كذلك** — وهذا أخطر من رقمٍ خاطئٍ ظاهر الخطأ. **الإلزام:** عند تسليم ميزةٍ يعتمد مخرجُها على إعدادٍ ضبطه المالكُ للاختبار، يُذكَر ذلك **بنصّ التسليم** مع القيمة الحيّة وقتَها والمخرَج الناتج عنها — ويُمنع تعديلُ الإعداد نيابةً عنه (#524).

**#526 — الرفضُ الصامت لإدخالٍ فاسد نصفُ إصلاح: ما يُرفض يُعلَن، وما يُعلَن يُشرَح عند نقطة الإصلاح.** الكودُ الذي يكتشف الفساد يملك التشخيصَ كاملاً؛ وإخفاءُ القدرة بدل إعلان السبب يُلقي على المستخدم عبءَ تشخيصٍ **أُنجز أصلاً** — وقد يعجز عنه تماماً (هنا اضطرّ المالكُ لطلب فحص الكود ليعرف لماذا اختفى زرّ). **الإلزام:** حين يُسقط حارسٌ سطحاً بسبب بياناتٍ فاسدة، يبقى السطحُ مرئياً بحالةٍ مُعلَنة، أو يُوضَع تنبيهٌ موجزٌ **بجانب الحقل مصدر الفساد** — والإخفاءُ الكامل محفوظٌ لحالة **غياب البيانات** (حالةٌ مقصودة) لا لحالة **فسادها** (خطأٌ قابل للإصلاح). والفرقُ بين الحالتين يجب أن يظهر بالكود صراحةً كفرعين لا كفرعٍ واحد.

**#527 — الرسالةُ الشارحة الموجودة سلفاً خلف بابٍ مخفيّ تساوي غيابَها.** حارسُ `openWaHub` كان مكتوباً وصحيحاً ولا يبلغه أحد. **الإلزام:** عند إضافة أي حارسٍ يعرض رسالةَ تفسير، يُتحقَّق **بمسارٍ حقيقيّ** أن للمستخدم طريقاً لبلوغها — ومثبِّتُ الميزة يوكّد ذلك صراحةً (هنا: نصُّ التوست حيٌّ **و**حارسُه يسبق الرسم **و**الزرُّ ظاهرٌ بالحالة التي تصل إليه)، وإلا فالرسالةُ توثيقٌ للمطوّر لا واجهةٌ للمستخدم.

**قاعدة #528 (جديدة):** إعادةُ المحاولة على موردٍ **مقفول** تفاقم لا تعالج ما لم يُضمَن موتُ المحاولة السابقة كاملةً — و`timeout` لا يضمنه لشجرة عمليات. تنفع بالتنزيل (بلا حالةٍ مشتركة)، وتضرّ بـ`apt`.

#### قاعدة #529 — سياسةُ كلمة السر عقدٌ بطرفين، وتوحيدُها يشمل **تفعيلَ الزرّ** لا الحارسَ وحده

حين تُرفع سياسةُ Auth من الداشبورد، يصير للنظام **عقدان**: ما يفرضه الخادم وما تَعِد به الواجهة. وتوحيدُهما لا يكتمل بتعديل حارسِ الحفظ وحده — كلُّ ما **يُفعِّل** مساراً (تعبيرُ `dirty` · تفعيلُ زرّ · لصيقةٌ نصّية) جزءٌ من العقد، وإبقاءُ أحدها على العتبة القديمة يعني واجهةً تسمح بما يرفضه السطرُ التالي.

**والقياسُ يسبق الجرد:** السطوحُ تُستخرج بمسحٍ أسطوليّ للعتبة القديمة، لا بقائمةٍ تُكتب من الذاكرة — وهي هنا **خمسةُ ملفاتٍ لا ثلاثة**، والرابعُ (`admin-settings.js`) لم يكن ليظهر بأيّ جردٍ يدويّ لأنه لا يحمل نصّاً عربياً يُبحث عنه.

#### قاعدة #530 — التقييدُ المحصورُ بخطةٍ مدفوعة يُقاس بالخطر الفعليّ لا بوجود الخيار

خيارُ أمانٍ خلف Pro **ليس سبباً كافياً للترقية بذاته**. القرارُ يُبنى على سطحِ الهجوم الحقيقيّ: منصّةٌ **بلا self-serve** — التسجيلُ يمرّ عبر المالك — سطحُها لكلمات السر المسرَّبة ضيّقٌ جداً، فالانتظارُ حتى تصير الترقيةُ مطلوبةً لأسبابٍ أقوى (PITR · الدعم) قرارٌ صحيح لا تأجيلٌ كسول.

**والشرطُ الملازم:** يُسجَّل **بنقطة مراقبةٍ صريحة** بالفارق المعروض ومتى يُغلق — بندٌ «مُنفَّذ جزئياً» بلا تسجيلٍ يُقرأ لاحقاً «مُنفَّذ».

#### قاعدة #531 — عنصرٌ عائم يصطدم بالمحتوى يُعالَج بجعله **قابلاً للسحب مع لزقٍ وحفظ**، لا بنقله لموضعٍ ثابتٍ آخر

الزاويةُ الثابتة تحلّ صفحةً وتكسر أخرى، والحلُّ المحصور بصفحةٍ يترك الصنف قائماً. النمطُ المرجعيّ Messenger chat heads / فقاعات Android: يُسحب، يلزق بأقرب حافة، يُحفَظ جهةً ونسبةً لا بكسلاً. **وشرطان لازمان:** (١) نقرة ≠ سحب بعتبةٍ صريحة، **ولا pointer capture قبل بدء السحب فعلاً** — الالتقاطُ المبكر يعيد توجيه الـclick للحاوية فتموت نقرةُ الزر ونقرةُ Playwright معها؛ (٢) بلا حفظٍ يكون الافتراضُ هو السلوكَ السابق بايت-مطابقاً عبر متغيّرات CSS، فالميزةُ تنزل صامتةً ولا تكسر صفحةً تعيد ضبط الزوايا (الأدمن).

#### قاعدة #532 — بوابةُ الخادم تقرأ كلَّ ما يقرؤه حارسُ العميل
حارسٌ سيرفري يعكس حارساً عميلياً (`ai-assist` ↔ `ensureAccountAccessible`) يجب أن يقرأ **الأعمدة نفسها** ويطبّق **الفلسفة نفسها** (fail-open على المفقود/المجهول، fail-closed على القيم المعروفة الحاجبة): الدالة كانت تعرف الخطة والتجاوز ولا تعرف الحالة، فحارسُ العميل وحده يحمي سطحاً يُنادى بالـJWT مباشرةً. وأي فحصٍ لطبقة AI يبدأ بمثبتٍ يشغّل الدالة **المترجَمة** لا نصَّها: الفجوة هنا لم تكن قابلةً للرؤية بالـgrep.

#### قاعدة #533 — قيمةُ الضبط لكل خطة تسكن حيث تقرؤها البوابة ⭐ v243
حين تحتاج بوابةٌ سيرفرية قيمةَ ضبطٍ لكل خطة (سقف/حد/علم)، ضعها **داخل العمود الذي تجلبه البوابة أصلاً** (`entitlements` jsonb) لا عموداً جديداً ولا جدولاً جانبياً: استعلامٌ واحد، مصدرُ حقيقةٍ واحد، وحفظُ الأدمن ينقلها مجاناً لأن المحرِّر ينسخ الصفَّ نسخاً عميقاً. والشرطان: (1) تحقّقٌ صارم من النوع عند القراءة (number منتهٍ > 0) مع fallback مُعلن — jsonb لا يفرض أنواعاً؛ (2) الزرعُ بالـmigration «عند الغياب فقط» كي لا تدهس إعادةُ التشغيل قيمةَ المالك.

⤵️ V243EOF

**آخر تحديث:** 24 آب 2026 (v242 — **تدقيقٌ موسّع لطبقة الذكاء الاصطناعي (16 ميزة) + بوابةُ حالة الحساب بـ`ai-assist` + خرائطُ أخطاء الـAI**) — **الحالة الحيّة: HEAD = `a6b8739`** · `release` = **`a6b8739`** (متطابقان، متحقَّق بـ`git ls-remote --heads` — رُقّي بعد ~90 ثانية من الـpush) · **SW `v240` → `v241`** · **توكن الفليت `20260822a` → `20260824a`** (كسرٌ إلزاميّ: `pp-extras.js` أصلٌ مرقّم مشترك تغيّر) · **صفر migration** (131 آخرها، التالي **132**) · **Edge Function `ai-assist` v49 → v50** (نشرها CI `edge-deploy.yml` تلقائياً، `verify_jwt=false` كما هو) · **الحُرّاس 17/17 خضر** · **مثبَتان: 36/36 (الدالة المترجَمة) + 16/16 (الخرائط) وأربعُ طفراتٍ عضّت** · **صفر لمس للطبقة المالية** · **صفر لمس لـ`book.html`** · **أربعُ كومِتات ذرّية** (`0807d83` → `c8896f5` → `4cca1c3` → `a6b8739`) · ✅ **مرّت من بوابة CI كاملةً**.

> **ما يميّز هذه الكتلة:** طلبُ المالك «تشييك موسّع على كل موديولات الذكاء الصناعي» — قراءةٌ أولاً بلا لمس، ثم خطةٌ بمراسٍ، ثم «ابدأ». الحكمُ: **16 ميزة كلها سليمةٌ بنيوياً وآمنة وتعمل حيّاً** (230 نداءً ناجحاً بـ`ai_usage_log` آخر 60 يوماً، صفر مخرجٍ فارغ)، وفجوةٌ واحدة ذات أثر: الدالة كانت تقرأ `plan` و`ai_override` ولا تقرأ **`status`** — والطردُ عند الإيقاف client-side فقط (`signOut({scope:'local'})`)، فحسابٌ موقوف/مرفوض/غيرُ مقبولٍ بعدُ يحتفظ بـJWT صالح ويستطيع نداء `ai-assist` مباشرةً (يفعّل `ai_features_enabled` بنفسه — RLS تسمح) ويستهلك السقف الشهري (1000 نداء) من مفتاح Anthropic. أُثبتت بالمثبت قبل الإصلاح (suspended/new → 200) وأُغلقت بسطرٍ واحد مرآةَ `ensureAccountAccessible`.

#### قاعدة #534 — وسمُ الصفّ الحامل لعملته يتبع عملتَه هو، والفراغُ يتبع محرّكَ حسابه ⭐ v244
كلُّ صفٍّ يحمل عمود `currency` (خطة · جلسة · طلب مخبر · راتب · مصروف…) يُوسَم بعملته هو لا بعملة العيادة، حتى بالسطوح «الثانوية» (بطاقات الملخّص · أوصاف التدقيق · أسطر الملخّص بالمودالات · قوالب الرسائل) — v181/v208/v221/v225 أغلقت السطوح الرئيسية وبقيت خطةُ الأقساط بثلاثة مواضع لأن جردَ «أين يُطبع مبلغُ هذا الصف؟» لم يشمل بطاقته ولا قالبَ رسالته. والقيمةُ الفارغة (صفٌّ ما قبل هجرة عملته) تُوسَم بما يعتبره **محرّكُ حسابها** لا بعملة العيادة: إن قسمها `ppPlanCalc` ليرةً فوسمُها ليرة ولو كانت العيادةُ دولارية — الاتساقُ بين الرقم ووسمه يعلو على أي افتراضٍ عن نيّة الطبيب. وقالبُ رسالةٍ يطبع مبلغاً لا يحمل وحدةً محفورة بل عنصراً نائباً للوحدة يُحلّ من الصف نفسه.

⤵️ V244EOF

**آخر تحديث:** 29 آب 2026 (v243 — **أسقفُ نداءات الـAI لكل خطة (Migration 132) + حدٌّ لحظي — إغلاقُ الشقّ الأكبر من نقطة المراقبة #70 قبل أول عميل مدفوع**) — **الحالة الحيّة: HEAD = `2fe6231`** · `release` = **`2fe6231`** (متطابقان، متحقَّق بـ`git ls-remote --heads` بعد الـpush) · **SW `v241` → `v242`** · **توكن الفليت `20260824a` → `20260829a`** (كسرٌ إلزاميّ: `pp-extras.js` + `admin-plans.js` أصلان مرقّمان تغيّرا) · **Migration 132 مطبَّقة حيّاً ومؤكَّدة بالاستعلام** (التالي **133**) · **Edge Function `ai-assist` v50 → v51** (نشرها CI `edge-deploy.yml` تلقائياً) · **الحُرّاس 17/17 خضر** قبل كل كومِت · **ثلاثة مثبَتات: 22/22 (الدالة المترجَمة) + 14/14 (الخرائط، تطابق مرآة بايت-بايت) + 10/10 (طبقة الأدمن) — وخمسُ طفراتٍ عضّت** · **صفر لمس للطبقة المالية** · **صفر لمس لـ`book.html`** · **ثلاثةُ كومِتات ذرّية** (`9df5574` → `2480c4c` → `2fe6231`) · ✅ **مرّت من بوابة CI** · ✅ **live-verified بصورة المالك** (حقل السقف يعرض 300 على خطة Pro) — «تم».

> **ما يميّز هذه الكتلة:** جلسةٌ وُلدت من استشارة تسعير (قرار المالك: الـAI يبقى مُضمَّناً بـPro/Max لا إضافةً منفصلة، والـoverride أداةُ مبيعات/هدايا لا منتَجاً) — فانكشف أن سقف الكلفة الوحيد كان ثابتاً واحداً بالكود (`MONTHLY_CALL_CAP=1000` للجميع) ونقطةُ المراقبة #70 تُطالب بإغلاقه قبل أول عميلٍ مدفوع. **الاتجاه المعماري:** السقفُ صار قيمةَ كتالوجٍ لكل خطة تسكن **داخل `entitlements` نفسِه** — العمود الذي تقرؤه بوابةُ الخطة أصلاً — فبوابةُ ai-assist تجلب البوابةَ والسقفَ باستعلامٍ واحدٍ قائم، صفرُ استعلامٍ جديد.

#### قاعدة #535 — عرضٌ لا يقرأ الفترة لا يحمل أزرارَ فترة ⭐ v245
أيُّ عرضٍ يشتقّ محتواه من «الآن» (القادم من اليوم · نافذةُ تذكير · طابور) يُعلن ذلك بهيدره ويُخفي أدواتِ التنقّل الزمني، ولا يُترك على الفرع الافتراضي لمعالجاتٍ مشتركة تحرّك حالةً لا يقرؤها. وأدواتُ الفترة حين تُبقى تُرسى على **حدٍّ ثابت** (اليوم الأول للشهر · السبتُ للأسبوع) لا على اليوم الجاري، وإلا انفجر الصنفُ بنهايات الشهور. **زرٌّ يفعل شيئاً غيرَ ما يقول أسوأ من زرٍّ غائب** (نظير v179: أداةٌ تكذب بشأن ما تفعله أسوأ من غيابها).

⤵️ V245EOF

**آخر تحديث:** 30 آب 2026 (v244 — **مراجعةٌ كاملةٌ وموسّعة لبطاقة المريض (21 جولة) بطلب المالك + إغلاقُ ملاحظتها الوحيدة: وسمُ عملة خطة الأقساط يتبع عملةَ الخطة**) — **الحالة الحيّة: HEAD = `71ad3cf`** · `release` = **`71ad3cf`** (متطابقان، متحقَّق بـ`git ls-remote --heads` بعد ~75 ثانية من الـpush) · **SW `v243` → `v244`** · **توكن الفليت `20260829a` → `20260830a`** (كسرٌ إلزاميّ: `pp-plan.js` أصلٌ مرقّم مشترك تغيّر محتواه) · **صفر migration** (132 آخرها، التالي **133**) · **Edge Function `ai-assist` v51 بلا مساس** · **الحُرّاس 17/17 خضر** قبل كل كومِت · **مثبَت 28/28 (الدوال الحيّة بسياق vm · مخرجُ الليرة بايت-مطابق لـHEAD · ثلاثُ طفراتٍ عضّت) + إقلاعُ الصفحة كاملةً بـjsdom نظيف** · **صفر لمس للطبقة المالية** · **صفر لمس لـ`book.html`** · **ثلاثةُ كومِتات ذرّية** (`3a4b33a` → `88ce140` → `71ad3cf`) · ✅ **مرّت من بوابة CI** · ⏳ بانتظار «تم» المالك بعد الفحص الحيّ (خطةٌ دولارية تجريبية على عيادةٍ مفعّلة تعدد العملات).

> **ما يميّز هذه الكتلة:** طلبُ المالك «مراجعة كاملة وموسّعة لبطاقة المريض بكل تفاصيلها — رتّب العناصر ثم افحص كلَّ واحدةٍ على حدة (مخطط الأسنان · قوالب الحفظ بالموديولات · كل شيء)». الحكم بعد 21 جولة: **البطاقةُ سليمةٌ بنيوياً ومنطقياً وسلوكياً بكل عناصرها إلا موضعاً واحداً** من صنف «رقمٌ صحيح تحت وحدةٍ كاذبة» (عائلة v181/v208) فاتته الجولاتُ السابقة — وأُغلق بالجلسة نفسها. والملاحظاتُ المنهجية أدناه أهمُّ من الإصلاح: ما فُحص وطلع نظيفاً يُسجَّل كي لا يُعاد فحصه بلا داعٍ (قاعدة #499 بصيغتها التوثيقية).

#### قاعدة #536 — رقمُ الهجرة يُقرأ بأمرٍ لا يقصّ ولا يخلط ⭐ v246
`ls migrations | grep -E '^[0-9]+_' | sort -n | tail -1` — فلترُ الأرقام **قبل** الفرز والقصّ. أيُّ أمرٍ يترك ملفاتَ غيرِ الأرقام بالقائمة (README · `_rls_audit`) يزحزح `tail` عن آخر رقمٍ حقيقي. ويُقابَل الرقمُ الناتج بترويسة ملف السياق («آخر هجرة») **قبل** كتابة الملف لا بعد الكومِت. الخطأُ وقع اليوم بأمرٍ «صحيحٍ» ظاهراً.

#### قاعدة #537 — رمزُ خروج الحُرّاس لا يمرّ عبر أنبوب ⭐ v247
`bash scripts/validate.sh >/tmp/v.log 2>&1; rc=$?; tail -1 /tmp/v.log; [ $rc -eq 0 ] && git commit …` — **أبداً** `validate.sh | tail && git commit`: الأنبوب يُرجع رمزَ آخر أمرٍ فيه. الخطأُ وقع اليوم ومرّ كومِتٌ أحمر محلياً.

#### قاعدة #538 — المالكُ ليس مستفيداً على أي سطح دفعات ⭐ v247
أيُّ سطحٍ يسجّل `provider_payouts` (اليوم: `payouts.html` · `provider-reports.html`) يستثني `is_owner===true` (و`_employeeRole==='owner'` حيث تُدمج الطرق). السبب بنيويّ: المحاسبةُ تعدّ كلَّ دفعةٍ مصروفاً، وأرباحُ المالك سحبٌ من حقوق الملكية. سطحٌ ثالث مستقبليّ يرث القاعدة، وتتبّعُ سحوبات المالك — إن طُلب — ميزةٌ مستقلة بجدولها لا صفٌّ بجدول الدفعات.

#### القاعدة #539 — حارسٌ أخضر على جدولٍ خارج خريطته ليس حراسةً، وضمُّه للخريطة ليس كافياً ⭐ v252
الحارسُ يرى ما يعرف شكلَه. سجلُّ تاريخ الأسعار كان خارج الخريطة **وحمولتُه بشكلٍ لا يقرؤه الحارسُ أصلاً** (`push({...})` قبل النداء) — فلو ضُمّ بلا تعليم الحارس ذلك الشكل لبقي صامتاً وهو يظنّ نفسه حارساً. **قبل الاطمئنان لحارس: أثبت أنه يرى المسار فعلاً بطفرةٍ تُحمّره** (#442/#484 مطبَّقتين على الحارس لا على الكود).

#### القاعدة #540 — الإصلاحُ سطحُ خطرٍ جديد يُدقَّق كما يُدقَّق الكودُ الأصلي ⭐ v253
«حذفٌ ثم إدراج» عيبُه تفريغٌ صامت، و«إدراجٌ ثم حذف» عيبُه ازدواجٌ صامت — والثاني أخطر لأنه يمسّ المخزون. **كلُّ قلبٍ لترتيب عمليتين يخلق فشلاً جزئياً معكوساً؛ سَمِّه واحكم عليه قبل الشحن.** والمعيارُ الحاكم: الحالةُ المجهولة تُرفض لا تُفترض فارغة (fail-closed حيث الكتابةُ تراكمية).

#### القاعدة #541 — سجلُّ التغيير يُكتب بعد نجاح التغيير لا قبله ⭐ v252
سجلٌّ يسبق الكتابةَ يوثّق **نيّةً** لا **واقعاً**: أربعةٌ من خمسة صفوفٍ حيّة وثّقت حفظاً رفضته القاعدة. والسجلُّ يرث وحدةَ ما يسجّله صراحةً — الاشتقاقُ يعطي وحدةَ السياق لا وحدةَ الرقم.

#### القاعدة #542 — كلُّ قائمة تصنيفاتٍ بالصفحة الواحدة مصدرٌ واحد ⭐ v252
ثلاثُ نسخٍ عاشت بالصفحة (المنتقي بالماركب · خريطةُ البطاقة · خريطةُ الطباعة) وانحرفت الثالثةُ عند 11 من 13 **بلا أن يرمي شيء** — علاجٌ بتصنيفٍ منسيّ يختفي من مستندٍ يُسلَّم للمريض. والمصدرُ الواحد يُتبَع بقاعدةٍ ثانية: **المفتاحُ المجهول يُلحق بالذيل لا يُسقط**، فبياناتٌ أقدمُ من الخريطة تبقى مرئية.

#### القاعدة #543 — التقطيعُ عقدُ استعلامٍ لا تحسينُ أداء، وكلُّ ارتدادٍ يغيّر معنى الرقم يجب أن يُعلَن ⭐ v255
قائمةٌ غير محدودة داخل `.in()` تكبر مع بيانات العميل حتى تتجاوز حدَّ طول العنوان، **والخطأُ العائد لا يحمل اسمَ الجدول** فيسقط بفرع «مفقود» ويُبتلع — فتنقلب الصفحةُ إلى ارتدادها الأدنى بصمت. وشرطان لا واحد: (١) كلُّ `.in()` بقائمةٍ مشتقّةٍ من بيانات المستخدم تُقطَّع؛ (٢) الارتدادُ الذي يغيّر **معنى** الرقم (لا شكلَه) يُعلَن بسطحٍ يراه القارئ — الأرقامُ تُعرض ولا تُحجب، لأن حجبَها يمنع عملاً مشروعاً وإخفاءَ سببها يسمح بقرارٍ على رقمٍ لا يعنيه.

#### القاعدة #544 — تغييرُ المحرّك يوجب المرور على نصّه الشارح وعلى اختباره ⭐ v255
M73 استبدلت استدلالَ نافذة ±90 يوم بإسنادٍ صريح، وبقي **شهران** والملاحظةُ تشرح المحذوف وTest E يقيس عقداً أضعف من العقد الجديد. ولا يرمي شيءٌ بالحالتين: النصُّ يُقرأ ويُصدَّق، والاختبارُ يمرّ فيُطمئن. فبعد أيّ تغييرٍ بمحرّك: النصوصُ التي تشرحه، والاختباراتُ التي تقيسه، والتعليقاتُ التي تدّعي عقدَه — ثلاثتُها من نطاق التغيير لا خارجه.

#### القاعدة #545 — التسامحُ العدديّ وحدةُ قياسٍ لا ثابتٌ ⭐ v255
`TOLERANCE = 1` كُتب يوم كانت الليرةُ الوحدةَ الوحيدة، وبقي بعد M125 يسري على طبقةٍ تُحفظ بالسنت فصار **مئةَ ضعفٍ** من التساهل المقصود. أيُّ عتبةٍ رقمية مكتوبةٍ بوحدةٍ ضمنية تُراجَع عند أوّل تعدّدٍ للوحدات.

#### القاعدة #546 — التوزيعُ اليدويّ المثبَّت تثبيتٌ على جلسةٍ حيّةٍ لا على معرّف ⭐ v256
كلُّ حفظٍ حرفيٍّ لصفٍّ ماليٍّ يشير لكيانٍ آخر يجب أن يتحقّق من أن الكيانَ ما زال موجوداً وبالحالة التي تُسوّغ الإشارة، وإلا يعود المالُ لحوضه المتحرّك. `ON DELETE SET NULL` بالقاعدة يخبر المحرّكَ أن الجلسةَ ماتت — تجاهلُه يصنع صفاً لا معنى له يُعاد إدراجُه إلى الأبد.

#### القاعدة #547 — الفعلُ المالي الواحد بسطحَين يستدعي التبعةَ نفسها ⭐ v256
إكمالُ الجلسة ببطاقة المريض وبصفحة المواعيد فعلٌ محاسبيٌّ واحد (Income Transfer)، فما يليه يجب أن يكون واحداً. عند مراجعة أيِّ سطحٍ يقلب حالةً ماليةً تُجرَد كلُّ الأسطح التي تقلب الحالةَ نفسها ويُقارَن ما يلي القلبَ فيها — الفجوةُ تعيش بين الملفات لا داخلها.

#### القاعدة #548 — الثوابتُ المحاسبية تُختبر على الحيّ أولاً ثم يُقرأ الكودُ بحثاً عمّا سيكسرها ⭐ v256
33 هويةً على القاعدة قبل سطرٍ واحد من قراءة الكود. الصفرُ الحيّ يقول إن العطبَ لم يقع، لا أنه لا يمكن أن يقع — وP1 وP2 كلاهما بصفر حالةٍ حيّة ومسارهما مفتوح.

#### القاعدة #549 — الدالةُ الذرّية `SECURITY DEFINER` تتحقّق من كلِّ معرّفٍ بالحمولة لا من الجذر وحده ⭐ v256
التحقّقُ من ملكية المريض لا يورّث الثقةَ لما تحته. كلُّ معرّفٍ يصل بالحمولة (دفعة · جلسة · طبيب) يُختبر بـ`EXISTS` على المالك، وكلُّ ثابتِ حفظٍ يُفرَض بالخادم، والخرقُ يرمي باسمه فتُرجَع المعاملة — لا يُسقَط الصفُّ بصمت.

#### القاعدة #550 — حقولُ دورة الحياة لا تركب حمولةً يتشاركها الإدراجُ والتحديث ⭐ v254 (مسجَّلة رجعياً)
`is_active`/`status`/`archived_at` وأمثالُها تُكتب **عند الإنشاء حصراً** ومن مسارِها المخصَّص المحروس بعدها. حملُها بحمولةٍ مشتركة يجعل كلَّ تعديلٍ قراراً صامتاً بدورة الحياة؛ وحين يقف خلف الحقل حدُّ خطةٍ بتريغر يتحوّل العيبُ من «تغييرِ حالة» إلى «رفضِ حفظٍ بلا سببٍ مفهوم». الفحص: أيُّ مفتاحٍ بحمولة `update` يمثّل **حالةً** لا بياناً.

#### القاعدة #551 — `var` المرفوع يقتل الحرّاس صامتاً، والمثبتُ يجب أن يُشعِل الحارس لا أن يمرّ بجانبه ⭐ v254 (مسجَّلة رجعياً)
قراءةُ متغيّرٍ قبل تعريفه بـ`var` تُعطي `undefined` لا خطأً، فالشرطُ المبنيّ عليه يكذب دائماً ولا أثرَ بالكونسول. لذلك: متغيّراتُ السياق (`orig*`/`prev*`) تُعرَّف بأعلى الدالة قبل أوّل قارئ؛ **وكلُّ مثبتٍ لحارسٍ يتضمّن متجهاً يستدعيه فعلاً** — وإلا فالاختبارُ يشهد لحارسٍ ميت (تكاملٌ مع صنف «كودٌ يَعِد بما لا يفعله»).

#### القاعدة #552 — قوائمُ البحث تُجلَب كاملةً وتُفلتَر عند الاستخدام ⭐ v254 (مسجَّلة رجعياً)
أيُّ مصفوفةٍ مساعدة يُبحث فيها بالمعرّف (`doctors`/`operatories`/`treatments`) تُحمَّل بلا فلترةِ نشاط؛ فلترةُ الجلب تجعل الصفَّ المرتبطَ «يختفي» فتُقرأ حقولُه فارغةً وتُكتب `null` فوق بياناتٍ سليمة. الفلترةُ مكانُها نقطةُ العرض/الاختيار، وكلُّ مستهلكٍ يفحص `is_active` بنفسه.

#### القاعدة #553 — القاعدة #19 تسري على مصدر السياق نفسه ⭐ v252
ملفُّ السياق بمعرفة المشروع قد يتدوّر **أثناء** الجلسة. لذلك: يُعاد التحقّق من اسمه ورقمه **لحظةَ الكتابة** لا لحظةَ القراءة؛ ويُقاس تطابقُ السلسلة مع **النسخة الأحدث** لا مع النسخة التي بدأت بها؛ وأيُّ ترقيمٍ جديد (قواعد · نقاط مراقبة) يُشتقّ من أقصى رقمٍ بالنسخة الأحدث لا من ذاكرة الجلسة. البناءُ فوق نسخةٍ وسطى يُنتج ملفاً يبدو سليماً بايتياً ويمحو تاريخاً كاملاً.

#### القاعدة #554 — «صلّح» أمرٌ بالدورة الكاملة لا طلبُ وصفة ⭐ v253
بلاغُ المالك (خاصةً بصورة) يعني: استنساخٌ بالـPAT من هذا الملف → قراءةُ الكود الحيّ لا الذاكرة (#19) → تعديل → `scripts/validate.sh` → كسرُ فليت/SW حسب طبيعة الأصل → كومِت بصيغة المشروع → push `main` → ترويج `release` → `ls-remote` → تقرير «نُفِّذ ودُفع» بالـHEAD. وصفُ الحلّ بدل تنفيذه انحرافٌ حتى لو كان الوصفُ صحيحاً بايت-بايت. غيابُ connector مسمّى لا يُعفي: `bash` + PAT هو الطريق الأصلي. يُستثنى فقط ما يستوجب قرارَ المالك قبل التنفيذ (مساسٌ مالي · هجرة · تغييرُ سلوكٍ لم يُطلب) — وحينها يُسأل سؤالٌ واحد محدَّد لا تُسرد خطوات.

#### القاعدة #555 — كلُّ عنصرِ واجهةٍ يرسمه المتصفّح خارج DOM يحمل `color-scheme` بالثيمين ⭐ v253
لوحاتُ `<select>` · منتقياتُ التاريخ والوقت · `<input type=color>` · شريطُ التمرير · مربّعاتُ `confirm/prompt` — يرسمها المتصفّح بألوان النظام لا بتوكنات الثيم، فتوكنٌ صحيح بـ`:root` لا يصلها. الحلُّ الوحيد المضمون `color-scheme: dark|light` على العنصر بالثيمين معاً (الفاتحُ مُصرَّحٌ به لا موروث)، مع تلوينٍ صريح للأجزاء التي تقبل CSS (`option`) احتياطاً. والمكانُ الواحد: كتلةُ `color-scheme` بـ`theme.css` (سطر ~696) — أيُّ عنصرٍ جديد من هذا الصنف يُضاف هناك لا بصفحته. امتدادٌ للقاعدة #469: التوكنُ يُقاس محسوباً على العنصر الحقيقي، واللوحةُ الأصلية ليست حتى بالـDOM لتُقاس.

#### القاعدة #556 — قلبُ حالة صفّ المخطّط يطابق العلاجَ لا السطحَ وحده ⭐ v254
`teeth_status` صفٌّ واحد لكل سطح، فأيُّ مسارٍ يقلب/يحذف صفَّ سطحٍ نيابةً عن جلسة (إكمال · حذف · إكمالٌ جماعي) يقيّد الكتابة بـ`treatment_key` علاجِ الجلسة (من `ledger_sessions.treatment_key` أو بالاسم عبر `sessionTreatmentKey`)، ويترك صفَّ علاجٍ آخر بحاله مع إعلام المستخدم. المسارات الآن اثنان (`syncToothStatusOnComplete` ↔ `_apptSyncToothStatusOnComplete`) — مرآةٌ دلالية إلزامية. وكلُّ إدراج جلسةٍ سنّية يحمل `treatment_key`.

#### القاعدة #557 — ما لا يحمله صفُّ السطح يُعرض من سجل الجلسات لا يُخترَع له صفّ ⭐ v254
حين تتشارك جلستان سطحاً واحداً، التلميحُ يُلحق الغائبَ من سجل الجلسات موسوماً «(سجل الجلسات)»، والحفظُ فوق صفٍّ مخطّط لعلاجٍ آخر يمرّ بتأكيدٍ صريح — لا كتابةَ صفٍّ ثانٍ ولا تغييرَ للمفتاح الأساسي بلا قرارٍ معماري (#87).

#### القاعدة #558 — الوسمُ يتبع الطبقةَ أو الصفَّ، وعملةُ العيادة ليست ارتداداً ⭐ v255
كلُّ مبلغٍ معروضٍ يُوسَم بعملةِ مصدره: الملخّصُ بعملة طبقته (`f.cur` / الطبقة المعروضة)، والصفُّ بعملته (`row.currency`). `curLbl()` تعني «عملةَ العيادة» ولا تصلح ارتداداً لصفٍّ أو طبقةٍ لهما عملة — والمرآةُ `USD ? '$' : curLbl()` معطوبةٌ بالاتجاه الآخر بالتعريف. وخانةُ ملخّصٍ متغيّرةُ العملة لا تحمل `[data-cur]` أبداً (يعيد `paint()` كتابتَها بعملة العيادة).

#### القاعدة #559 — الاسمُ المشتقّ لمبلغٍ مالٌ بقدر العمود الذي وُلد منه ⭐ v255
حارسُ الجمع القرائي يعرف أعمدةَ المال بأسمائها؛ فأيُّ صفٍّ مشتقٍّ يعيد تسميةَ مبلغٍ (`debit`/`credit`/`bal` بكشف الحساب) يفلت من نظره ويجمع العملات بصمت. كلُّ اسمٍ مشتقٍّ جديدٍ لمبلغٍ يُضاف لقائمة `MONEY` بنفس الكومِت الذي يولّده — **وحارسٌ أخضرُ لا يعني نظافةً، يعني أن ما يعرفه نظيف.**

#### القاعدة #560 — ادّعاءُ «نظيف» يُفرَض بالقاعدة ويُراقَب بجدول، لا يُوصَف ⭐ v255
أيُّ هويةٍ ماليةٍ يعتمد عليها سطحان أو أكثر (البطاقة والمحاسبة) تُفرَض بقيدٍ بالقاعدة حيث يسمح تسلسلُ المعاملات، وما لا يمكن فرضُه يدخل `scripts/finance-integrity.sql` ويُشغَّل ليلياً بفشلٍ أحمر. والحُرّاس النصّيون يفحصون **الكود** — فحصُ **البيانات** مسؤوليةٌ منفصلةٌ ودائمة.

**#561 — بابان لنفس الفعل: أحدهما سيكون الأضعف.** ستةُ بلاغاتٍ بجلسةٍ واحدة، وأربعةٌ منها نمطٌ واحد: إرسالٌ بلا حفظ بجانب حفظٍ وإرسال · جدولةٌ تساوي تعديلاً · جلسةٌ بلا سنٍّ بجانب مودال السن · صلاحيةٌ ببابٍ واحد من ثلاثة. عند إضافة بابٍ ثانٍ لفعلٍ قائم: إمّا يُحذف الأول، أو يُوحَّد المساران، أو يُكتب حارسٌ يمنع التباعد. ثلاثتُها نُفِّذت هنا.

**#562 — توحيدُ المسار لا استنساخُه.** حين ينقص مدخلٌ ما يملكه مدخلٌ آخر، الحلُّ أن يسلّم الناقصُ للكامل (`openNewSessionEntry` → `openToothModal`)، لا أن يُنسخ منطقُ الكامل إليه. نسخُ ~300 سطر كان سيصنع مرآةً ثالثة بلا حارس.

**#563 — الوسمُ عقدٌ لا زينة.** «رصيد سابق» على زرٍّ لا يفعلها = باغٌ كامل: المستخدم يبحث عن الميزة حيث كُتبت. وكذلك «إرسال» على زرٍّ لا يحفظ.

**#564 — البوابةُ الحمراء تُقرأ قبل أن تُتجاوَز.** الدفعُ اليدوي إلى `release` مسموحٌ للطوارئ فقط؛ تكرارُه يحوّل البوابة إلى زينة. وتغييرُ واجهةٍ صحيحٌ قد يكسر اختباراً آلياً — الاختبارُ يُحدَّث بنفس الكومِت أو بالذي يليه مباشرةً، ولا يُدفَع شيءٌ إلى `release` قبل الخضار.

#### القاعدة #565 — fail-open للمرونة يُراجَع حين تختفي حالتُه ⭐ v258
كلُّ `return true` مبرَّر بـ«حسابٌ موروث/RLS خبّأت الصفّ» يحمل تاريخَ صلاحية: حين يثبت الاستعلامُ الحيّ أن الحالةَ المبرِّرة لم تعد موجودة (صفر صفٍّ موروث)، يصير الاستثناءُ باباً خلفياً. الفصلُ الصحيح: **خطأُ القراءة** وحده fail-open (عطلٌ عابر)، و**غيابُ البيانات** fail-closed أو شفاءٌ ذاتي مرئي للمشغّل.

#### القاعدة #566 — الخطوتان بلا معاملة تُغلقان من الطرفين ⭐ v258
كلُّ إجراءٍ يمرّ بنظامين (auth ثم قاعدة) يحتاج: فحصاً مسبقاً يمنع الفشلَ المتوقَّع قبل الخطوة الأولى، **و**بوابةً بعديّة لا تُدخل حالةَ «نصف مكتمل». الاعتمادُ على أحدهما وحده يترك نافذة (شبكةٌ تنقطع بين الخطوتين).

#### القاعدة #567 — قيدُ سلامةٍ جديد يُثبَت بعمليةِ الحذف الكاملة داخل معاملةٍ تُلغى ⭐ v258
FK CASCADE صحيحٌ نظرياً أفشل الحذفَ كله بسبب تريغرِ تدقيقٍ صحيحٍ آخر. قبل تطبيق أي قيد/تريغر على مسار الحذف: `BEGIN` ← كيانٌ وهمي كامل ← الحذفُ الحقيقي ← عدُّ الأصفار ← `ROLLBACK`. ما لا يُثبَت هكذا لا يُطبَّق.

#### القاعدة #568 — الحذفُ يبدأ بما لا تتسلسل القاعدةُ إليه ⭐ v258
ما يعيش خارج القاعدة (تخزين/خدمات خارجية) يُمسح **أولاً** وفشلُه يُجهض العملية؛ ثم الحسابُ والتسلسل؛ ثم الصفوفُ المتبقّية idempotent. الترتيبُ العكسي (صفٌّ ثم auth «best-effort») ينتج يتيماً صامتاً.

#### القاعدة #569 — رسائلُ خطأ الـAI تُسمّى بأسبابها بكل سطح ⭐ v312
أيُّ سطحٍ ينادي `ai-assist` يقرأ الكودَ من `resp.error.context.json()` ويعرضه بخريطةٍ عربية مرآةَ `prmAiErrText`؛ والردُّ العامُّ الوحيدُ المسموح هو ما لا كودَ له. «تعذّر فهم السؤال» على `quota_exceeded` كذبةٌ تُضيّع وقتَ الطبيب وتُخفي الحدَّ الحقيقي. وأيُّ دالةٍ تُرجع سلسلةً فارغة عند الفشل تخلط **فشلَ الخدمة** بـ**سوء الفهم** — تُرجع كائناً `{value, code}`.

#### القاعدة #570 — الحدُّ الزمني على عمود timestamptz يُبنى محلياً ⭐ v312
النصُّ العاري `'YYYY-MM-DDT00:00:00'` يُفسَّر UTC؛ كلُّ نافذةِ تاريخٍ على عمود timestamptz تُبنى من منتصف الليل **المحلي** وتُرسل ISO بإزاحة المتصفّح، ونصفَ مفتوحةٍ (`gte` + `lt` اليوم التالي) لا `lte 23:59:59`. (تمديدُ #27 من الفلاتر إلى بناء الحدود.)

#### القاعدة #571 — مطابقةُ اسم المريض: الكاملُ أولاً والمفردُ احتياط ⭐ v312
مطابقةُ الكلمات وحدها تجرُّ مرضى لم يُسأل عنهم (لقبٌ مشترك)؛ الاسمُ الكامل (≥ كلمتين) يُلتقط وحده إن ورد، ويُصرَّح بتعدّد المطابقين حين تُستعمل الكلمةُ المفردة.

#### القاعدة #572 — التحليلُ الحتمي يرفض بدل أن يسقط على الافتراضي ⭐ v312/v313
كلُّ محلّلٍ حتمي (تاريخ · فترة · كمية) يُرجع حالةَ **بطلانٍ صريحة** عند مدخلٍ مستحيل (31/2 · من 31/2 إلى 5/3) بدل السقوط الصامت على «اليوم/هذا الشهر»؛ والسقوطُ الصامت يعطي «رقماً صحيحاً بنطاقٍ خاطئ» وهو أخطرُ من لا جواب (§0.6-ب). ويُميَّز الفرعُ **الصريح** عن الافتراضي بعلمٍ (`explicit`) كي لا يُضيَّق سؤالٌ لم يُقيَّد بفترة.

#### القاعدة #573 — النقلُ بين الصفحات: السلوكُ حرفيٌّ والعرضُ يُعاد بناؤه ⭐ v314
موديولٌ يُنقل بين صفحتين ينتقل بمعرّفاته ودوالّه **بايت-حرفياً** (فلا يُعاد تشخيصُ سلوكه لاحقاً) بينما تُعاد كتابةُ **عرضِه** بأصناف الصفحة المستقبِلة — أصنافُ الصفحة المصدر غيرُ معرَّفةٍ هناك (v164 بالاتجاه المعاكس، وهذه الجولة بالاتجاه العائد). وكلُّ بوابةٍ خاصة بالصفحة المصدر (`stgAiInit`) تُحذف مع الموديول لا تُترك يتيمة.

#### القاعدة #574 — مركزُ الأدوات المطوي بالداشبورد ⭐ v314/v315
الأدواتُ العامّة (غيرُ الخاصة بمريض) تُجمع ببطاقةٍ واحدة بتبويبات، **مطويةٍ افتراضياً**، وحالتُها بالجهاز — كي يبقى الداشبوردُ تشغيلياً أولاً (نبضُ اليوم ومواعيدُ اليوم فوق مباشرة)؛ وبوابةُ الدور تُطبَّق على **البطاقة كلها** لا على تبويبٍ واحد، وإلا رأى الموظفُ بقيةَ التبويبات (بلاغُ v315 الحيّ).

#### القاعدة #575 — الجدولُ العريض على الشاشة الضيقة يصير بطاقةً بالصفّ نفسه ⭐ v328
غلافُ `overflow-x:auto` بشريطٍ مخفيّ **ليس حلاً** — هو بالضبط ما جعل الصفوف «تتحرك» والأزرارَ غيرَ مرئية. الجدولُ الذي يتجاوز مضيفه يأخذ `m-cards` وأصنافَ الخلايا (`mc-title` · `mc-side` · `mc-side2` · `mc-full` · `mc-actions` · `mc-hide` · `mc-only`)، والعتبةُ تُقاس بعرض الجدول الفعلي وتُربط بالمضيف (`container: mc / inline-size`) لا بعرض الشاشة. **ممنوع** تكرارُ الصفّ أو أزراره لنسخة موبايل (يكسر `data-test` وأقفال `xGuarded`).

#### القاعدة #576 — مساعدُ السمات الذي يُصدر `class` لا تُضاف قبله `class` ⭐ v329
`dtHoverAttrs` تُصدر `class="tip"`؛ سمةُ `class` ثانية على الوسم نفسه **يُسقطها المحلّل بصمت** بلا خطأ ولا تحذير. أيُّ صنفٍ إضافي على خليةٍ تحمل التلميح يمرّ عبر `_mcAttrs(cls, ts)`. والفحص: `grep` على `class=[^>]*class=` بكل وسمٍ مُركَّب.

#### القاعدة #577 — `cache-bust.sh` يُشغَّل على شجرةٍ لا تعديلَ فيها إلا التوكن ⭐ v328
ضمانتُه الثالثة («كلُّ سطرٍ متغيّر يحوي `?v=`») تفشل إن كانت بالصفحة تعديلاتُ ميزة غيرُ مكوَّمة، **وأمرُ الاسترجاع الذي يطبعه (`git checkout -- <كل الصفحات>`) يمحو تلك التعديلات**. التسلسل: كومِتُ الميزة (الحُرّاس خضر) ← `cache-bust.sh <token>` ← كومِتُ الفليت ← SW + CHANGELOG. وإن فشل: أعِد الصفحاتِ غيرَ المعدّلة وحدها وأرجِع التوكن بالصفحة المعدّلة بـ`sed`. **والتوكن بتاريخ اليوم صراحةً** — ساعةُ الحاوية قد تكون UTC ليوم أمس (أنتجت `20260915a` تلقائياً).

#### القاعدة #578 — كلُّ نصٍّ حرّ يدخل `innerHTML` يُهرَّب، ولو كان من داخل العيادة ⭐ v329/v330
«بياناتُ المستأجر نفسه» ليست ثقة: السكرتيرةُ تكتب اسمَ مريضٍ أو نوعَ عمل، والطبيبُ المالك يفتحه. الحقولُ الحرّة المعروفة: اسمُ المريض · نوعُ العمل (`أخرى`) · اسمُ المخبر · اللون · الملاحظات · الوصف. والصفحةُ بلا `escapeHtml` عام (`index.html`) تُعرّف مهرِّباً محلياً بجانب الاستعمال.

#### القاعدة #579 — الجلسةُ المربوطة بموعدٍ لم يبدأ مخطّطة؛ الربطُ يقترح ولا يفرض ⭐ v331
أيُّ مدخلٍ يربط علاجاً بموعد: موعدٌ لم يبدأ ⇒ `planned` بتاريخ الموعد (فيعمل «إكمال الموعد + المخطّطة»)؛ موعدُ اليوم والمريضُ حاضر (`arrived_at`/`seated_at`/`dismissed_at`) ⇒ `completed`. المنتقي يبقى بيد المستخدم، والتاريخُ الآلي وحده يُعاد عند فكّ الربط. `last_visit` وخصمُ المواد للمنجز فقط.

#### القاعدة #580 — طبيبُ الموعد وطبيبُ الجلسة: لا اتجاهَ صامت ⭐ v332
الموعدُ حجزٌ (عمود طبيب + وقت)، والجلسةُ إنتاجٌ (نسبة + تقارير). عند الاختلاف **سؤالٌ بخيارين** والافتراضيُّ «اتركهما»؛ النقلُ يُطبَّق بعد نجاح الكتابة الأساسية، ويحذّر من التداخل ولا يمنع، وأيُّ تغييرٍ في المدخلات يُسقط القرار. `unifyProviders` بالإكمال يبقى كما هو (الجلساتُ ← طبيبُ الموعد).

#### القاعدة #581 — مدخلٌ بلا منطقةٍ منقورة: الإجراءُ أولاً ثم منطقتُه ⭐ v333
فلترُ «منطقة المعالجة» حقٌّ للنقر على منطقة؛ مدخلٌ بلا منطقة (شبكةُ أرقام، بحث، اختصار) يعرض كلَّ ما يصلح للسن ويبني المنطقةَ بعد اختيار العلاج بحسب `target_part`. **والوضعُ يُمرَّر طلباً لمرّةٍ واحدة يُستهلك أولَ سطرٍ في الدالة المستقبِلة** — لا علمٌ عامٌّ يعيش بعد الفتحة.

#### القاعدة #582 — تحديثُ Supabase بلا صفوف ليس نجاحاً ⭐ v334
`update().eq(...)` يُرجع `error: null` حين لا يطابق شيء (حذفٌ موازٍ · RLS · مفتاحٌ خاطئ). كلُّ تحديثٍ يتبعه توستُ نجاح أو سجلُّ نشاط أو تعديلٌ محلي: `.select('id')` ثم التحقق من العدد قبل الإعلان.

#### القاعدة #583 — كلُّ استعلامٍ يغذّي وسمَ مبلغٍ يجلب `currency`، والوسمُ من عملة الصف ⭐ v331
`_rowCur` يقرأ الغائبَ ليرة ⇒ صفُّ دولارٍ بلا عمود = «ل.س» بصمت. `curLbl()` لعملة العيادة (عناوين، إدخالٌ جديد)، و`curLblOf(row.currency)` / `_apptCurLblOf(row.currency)` لأي مبلغٍ مخزَّن. الفحص: `grep "cost) + ' ' + curLbl()"`.

#### القاعدة #584 — الحارسُ السلوكي يشغّل الملفَّ الحيّ لا نسخةً منه، وبلا تبعيات ⭐ v333
حين تكون الدالةُ داخليةً (مثل `isAllowed` داخل `openToothModal`) لا تُستخرج — يُشغَّل الملفُّ كاملاً بـvm فوق DOM مزيّف داخل الحارس. لا jsdom/Playwright بالحُرّاس (CI يثبّت `acorn` فقط)؛ هما للإثبات المحلي. والفحوصُ غير المتزامنة تُدفع إلى `ASYNC_CHECKS` لا `process.exitCode` بعد طباعة الحكم.

#### القاعدة #585 — تصحيحُ بيانات الإنتاج يدوياً: شروطٌ صريحة + `RETURNING` + فحصُ سلامة ⭐ v331
قبل التعديل: عدُّ المتأثّر بالمعيار نفسه، والتحقق من صفر توزيعات وصفر حركات مخزون. التعديلُ بمعيارٍ ضيّق (النوع + الشرط + `NOT EXISTS`) و`RETURNING`، وأيُّ تعديلٍ ثانٍ بشرط القيمة القديمة. بعده `finance-integrity.sql` كاملاً. **وموافقةُ المالك على الصفوف بأسمائها** ضمن الخطة.

#### القاعدة #586 — أختامُ الحضور تثبّت يومَ الموعد ⭐ v335
الختمُ لا يُسجَّل إلا بيوم الموعد، فهو جزءٌ من هويّة الزيارة: **منتهٍ** (حالةٌ منتهية أو `dismissed_at`) ⇒ التاريخُ والوقت مقفولان؛ **حاضر** (`arrived_at`/`seated_at`) ⇒ التاريخُ مقفول والوقتُ حرّ؛ المخطَّطُ بلا تاريخ خارج القفل. الزيارةُ التالية = **موعدٌ جديد** لا نقلُ القديم، والأختامُ لا تُصفَّر لتسهيل النقل. الخروجُ من القفل: حذفُ الختم الخاطئ أو تغييرُ الحالة المنتهية أولاً.

#### القاعدة #587 — قفلُ الفعل مصدرٌ واحد يقرؤه كلُّ بابٍ له ⭐ v335
`apptMoveLock`/`apptMoveBlocked` هما المرجع؛ يقرؤهما المودالُ (عرضاً) وحارسُ الحفظ (منعاً قبل الحمولة) والسحبُ الأسبوعي، ويُدافع `pp-appt.js` عن الجدولة. **أيُّ مسارٍ جديد يغيّر `appointments.date`/`time`/`is_planned` يمرّ به.** الواجهةُ المقفلة طبقةُ وضوح، والحارسُ بالحفظ هو الحماية. حرّاسُ #227 بالسحب تبقى كما هي (مرآةٌ دلالية).

#### القاعدة #588 — «القديم» بسجلّ النشاطات لقطةٌ قبل الكتابة ⭐ v335
أيُّ `logAudit` يحمل `oldValue` يقرأ من نسخةٍ مأخوذة **قبل** الكتابة وقبل أي إعادة تحميل، لا من المصفوفة المحلية بعدها. الفحص: كلُّ `logAudit` بعد `await load…()` يُراجَع.

#### القاعدة #589 — القيمةُ المقترحة تمرّ بتحقّق حقلها ⭐ v335
أيُّ `prompt`/حقلٍ مملوءٍ مسبقاً يُعرض بالصيغة التي يقبلها تحقّقه (موافقٌ بلا تعديل = نجاح)، والتحليلُ يتسامح مع الصيغة التي يعرضها النظامُ نفسه (هنا AM/PM). والفشلُ يُعلَن بتوست لا بـconsole.

#### القاعدة #590 — «بلا نتيجة» حالةٌ صريحة لا تخمين ⭐ v336
سجلٌّ تجاوز زمنُه ولم تُسجَّل نتيجتُه (موعدٌ ماضٍ بلا أختامٍ ولا حالةٍ منتهية) **لا يُصنَّف بما يُرجَّح** (حضوراً ولا غياباً)؛ يُعرض فئةً مستقلة بتنبيه، وفعلُه يقود إلى **الباب الذي يملك الكتابة** لحسمه. دمجُه بفئةٍ قريبة يُفسد كلَّ إحصاءٍ مبنيٍّ عليها (نسبةُ الحضور، تنبيهُ الغياب).

#### القاعدة #591 — سطحُ العرض يقرأ معيارَ القفل نفسَه ⭐ v336
أيُّ سطحٍ يصنّف المواعيد (منتهٍ/حاضر/قادم) يستعمل معيارَ `apptMoveLock` (#587) حرفياً — حالةٌ منتهية **أو** ختمُ خروج — لا معياراً موازياً. وأيُّ فعلٍ يغيّر الموعد من سطحٍ جديد **يُحال إلى الباب المقفول** (`?editAppt=`) بدل بناء محرّرٍ ثانٍ؛ و«إعادةُ الحجز» إنشاءٌ لا نقل (#586).

#### القاعدة #592 — اختيارٌ يُكتب قبل بناءٍ غير متزامن يضيع ⭐ v336
دالةٌ تعيد بناء `<select>` بعد `await` **تستقبل القيمةَ المطلوبة وتستعيدها بعد البناء**؛ والمنادي لا يعتمد على `.value =` متزامنٍ بعد نداءٍ غير منتظَر. **الفحص:** كلُّ `populate*()` بلا `await` يليه `.value =` على العنصر نفسه. والإثباتُ يؤخّر الجلبَ صناعياً (الجلبُ الفوري يُخفي الباغ).

#### القاعدة #593 — عنصرٌ يُضاف لشريطٍ مشترك يُقاس بعدد الأسطر قبل/بعد على كل العروض ⭐ v336
«يبدو جيداً» على عرضٍ واحد ليس قياساً. المعيارُ **مطابقةُ ما قبل التعديل** على سلّم العروض كاملاً بخطّ المنصة الفعلي، والتعديلُ الموازِن (هنا الحشوة) يُختار بالحساب لا بالتجريب، ويُثبَّت بتوكيدٍ يعدّ الأسطر.

#### القاعدة #594 — خطافُ التحديث بأول سطر نقطةِ المرور ⭐ v336
سطحٌ مشتقٌّ من بياناتٍ تتغيّر بمساراتٍ كثيرة يُحدَّث من **نقطة المرور القائمة** (الدالة التي تناديها كلُّ المسارات) **بأول سطرٍ قبل أي خروجٍ مبكر**، محروساً بـ`try` و`typeof` — لا بنشر نداءٍ عند كل مسار (يُنسى واحدٌ حتماً). والحارسُ يوكّد الموضعَ لا الوجود.

#### القاعدة #595 — الصفحةُ التي تُعدَّل بياناتُها من صفحةٍ أخرى تعالج bfcache ⭐ v336
`pageshow` بـ`event.persisted` ⇒ إعادةُ التحميل بالمسار القائم (هنا `onPTRRefresh`)؛ والشرطُ `persisted` إلزامي (التحميلُ العادي يمرّ بالإقلاع أصلاً فلا يُكرَّر). والتوكيدُ يطلق الحدثَ بالحالتين.

#### القاعدة #596 — الفعلُ الذي يكتب بالمال يُطلق من سطحٍ ثانٍ ببابه الموحّد ⭐ v338
سطحٌ جديد يملك **الجزءَ البسيط** من الفعل (ختمٌ واحد) ويُحيل **الجزءَ الماليَّ الأثر** (إكمالُ العلاجات · التسليم · التوزيع) إلى بابه القائم (`?dismiss=`) **قبل أي كتابة**، بسؤالٍ يسمّي سببَ الإحالة. لا نسخةَ ثالثة من مسار الإكمال (#561). والحارسُ يوكّد **ترتيبَ** التحويل قبل التحديث لا وجودَه فقط.

#### القاعدة #597 — شرطُ «صفٍّ واحد» يُتحقَّق منه مقابل طابور الأوفلاين ⭐ v338
قبل اشتراط عدد الصفوف المُعادة على جدولٍ من جداول الطابور (`appointments` · `audit_log` · `ledger_payments`) يُقرأ ما يُعيده `synthWriteResponse` لتلك الطريقة، ويُختبر المسارُ بـ`set_offline(True)` — وإلا صار الشرطُ الذي يحمي من «نجاحٍ بلا صفوف» فشلاً كاذباً بلا اتصال. والتوستُ يقول إن الكتابة مؤجَّلة.

#### القاعدة #598 — زرُّ الحالة يعيد فحصَ الحالة قبل الكتابة ⭐ v338
الزرُّ المرسوم يصف لحظةَ رسمه؛ عند النقر تُحسب المرحلةُ من البيانات الحالية بالدالة نفسها التي رسمته، واختلافُها ⇒ إعادةُ رسمٍ وتوستٌ بلا كتابة. والاختبارُ يغيّر البيانات محلياً **بلا إعادة رسم** ثم ينقر.

#### القاعدة #599 — العلَمُ المشتقّ بمرايا يُصلَح بالمرايا كلها أو لا يُصلَح ⭐ v337
حين يكون الخللُ الظاهر بسطحٍ واحد نتيجةَ علَمٍ مشتقّ (`dual`/`cur`) تحسبه ثلاثةُ تطبيقاتٍ بنيوياً مختلفة، يُصلَح **بمصدر القرار في الثلاثة معاً** لا بترقيعِ العرض، ويُضاف متجهٌ مخلوطٌ يشغّل الثلاثة حيّةً ويقارن العلَم نفسه — تكافؤُ الأرقام وحده (F/G) لا يرى انحرافَ العلَم.

#### القاعدة #600 — «النشاط» ليس «الحساب» ⭐ v337
طبقةُ العملة «حسابٌ» بحركةٍ ماليةٍ فعلية (منجز · دفعة · توزيع · تسوية). المخطّطُ تقديرٌ خارج الرصيد: يُعرض بعملته حيث يُعرض المخطّط (تبويبُ المدفوعات · الخطة · الملخّص الذكي موسوماً)، **ولا يصنع صناديقَ أو شاراتٍ أو تنبيهاتِ «حسابين»**. أيُّ سطحٍ جديد يقرّر «ثنائي؟» يستعمل دالةَ المال لا دالةَ النشاط.

#### القاعدة #601 — وسمُ العملة مرةً واحدة، وموضعُه يتبع المبلغ ⭐ v339–v341
الوسمُ يلتصق بالمبلغ حين يوجد مبلغ، وبالكلمة حين لا مبلغ («مسدّد $»)، ولا يتكرّر بالشارة الواحدة. والمخرجاتُ التي تكتب المبلغ رقماً عارياً (Excel) تُبقي الوسمَ على الكلمة. **قالبُ الشارة دالةٌ واحدة (`payBadgeHtml`) يقيّمها الحارس حيّةً** — لا قالبٌ مضمَّن يُنسخ للحارس.

#### القاعدة #602 — طبقةُ الشرح المؤقتة ⭐ v342
أيُّ طبقةٍ تفاعلية فوق المخطط لا تكتب بياناتٍ سريرية: (1) بالذاكرة وحدها — صفر DB وصفر تخزين محلي (جهازُ العيادة مشترك)، والحفظُ استثناءٌ صريح بزرّ؛ (2) تُمسح بكل مسارات الخروج (✕ · Escape بعد فحص المودالات · تبديل التبويب) بتصفير البكسلات والذاكرة؛ (3) تتنافى مع أوضاع المخطط الأخرى، والمداخلُ الأربعة ترفض بأعلاها قبل أي `await`؛ (4) الإحداثياتُ بوحدات المخطط نسبةً لخطّ المنتصف السنّي، والتصغيرُ عبر متغيّرٍ على `body` لا على `#jawWrap` (نسخةُ الطباعة تستنسخه بسماته).

#### القاعدة #603 — مفتاحُ التخزين ASCII والاسمُ المعروض منفصل ⭐ v343
مفتاحُ أيّ كائنٍ بـSupabase Storage يمرّ بـ`SyDentFiles.sanitizeName` ويطابق `isValidKey` (ASCII \w + رموزٌ محدّدة)؛ الاسمُ الذي يراه المستخدم ويُنزَّل به يُحفظ بعمودٍ منفصل (`file_name`) كما هو. لا مسارَ رفعٍ جديد يبني مفتاحه بنفسه.

#### القاعدة #604 — المحاكي يطبّق قيودَ الخادم الحقيقي ⭐ v343
كلُّ خادمٍ وهمي بعُدّة الإثبات يطبّق التحقّقات التي يطبّقها الخادمُ الحقيقي على المدخلات التي تمسّها الميزة (مفاتيح التخزين · القيود · الترميز)، ويعيد رسالةَ الخطأ نفسها؛ وإلا فالإثباتُ ينجح على العطل. وحين يُبلَّغ عن فشلٍ حيّ فاتَ الإثبات: يُصلَح المحاكي أولاً ويُعاد إنتاجُ الرسالة حرفياً قبل إصلاح الكود.

#### القاعدة #605 — الشريطُ اللاصق فوق مساحة رسم ⭐ v342
أيُّ شريطٍ لاصق يعلو مساحةً تفاعلية يُقاس تداخلُه بمسار الفتح الحقيقي على الجوال بالوضعين (خصوصاً العرضي القصير)؛ الملاءمةُ بالعرض وحده لا تكفي — تُضاف ملاءمةُ الارتفاع تحت الشريط، والشريطُ يصغر على الشاشات الضيّقة/القصيرة، والصفحةُ تُمرَّر عند الفتح ليستقرّ المحتوى تحته.

#### القاعدة #606 — مستوى الوصول يُحسب بالقاعدة ويُقرأ مرةً لكل صفحة ⭐ v354
`tenant_access_level()` مصدرٌ واحد؛ العميل لا يعيد حسابه، ويقرؤه عبر `SyDentSub.load()` مرةً، وfail-open عند الخطأ (القاعدةُ لا تفشل مفتوحة).

#### القاعدة #607 — السياساتُ المقيِّدة تُضاف فوق القائمة ولا تُعيد كتابتها ⭐ v354
RESTRICTIVE تتركّب مع PERMISSIVE. **كلُّ جدولِ بياناتِ عيادةٍ جديد يستدعي `_sub_guard_table` بهجرته**، أو يُضاف لاستثناءات المنصة صراحةً — توكيدُ M141 وV10 يُسقطان غير ذلك.

#### القاعدة #608 — شاشةُ الحجب طبقةٌ فوق الصفحة لا استبدالٌ لـbody ⭐ v354
المحمّلاتُ الجارية تجد عناصرها فلا تنهار؛ CSS يُخفي الباقي؛ والطبقةُ `position:fixed` لأن body مرنٌ بأغلب الصفحات.

#### القاعدة #609 — نبضُ الحضور عبر دالةٍ SECURITY DEFINER ⭐ v354
كي يبقى الحسابُ المنتهي مرئياً بالأدمن رغم منع الكتابة.

#### القاعدة #610 — الجدارُ المالي: لا أسماءَ دوال التوزيع بـ`supabase-init.js` ⭐ v354
الحارسُ على الخادم؛ ووحدةُ الحذف تسكن **قبل** قسم توصيل الأوفلاين لأن حارس PWA يمسح ذلك القسم بحثاً عن `ledger_sessions`.

#### القاعدة #611 — وضعُ القراءة سمةٌ تُخفي، وسجلُّ معالجاتٍ مصنَّف يضمن الاكتمال ⭐ v355–v360
`data-sub-write` للعناصر المفردة؛ والصفحاتُ الكبيرة بسجلّ (كتابة · حراسة · قراءة · خامل) يولّد CSS بأسماء المعالجات. **معالجٌ جديد بلا تصنيف يُسقط V11** — القرارُ يُتّخذ عند الإضافة لا عند البلاغ.

#### القاعدة #612 — مداخلُ الكتابة الضمنية تُحرس بأول سطر، والروابطُ العميقة تنتظر المستوى الحيّ ⭐ v356–v361
السحبُ والنقرُ المزدوج ونقرُ الصف/البطاقة/السن: `blockReadOnly()` قبل أي `await` أو كتابة. `?open=`/`?action=`/`?pay=`: `await SyDentSub.load()` ثم القرار. الصفُّ الحامل لبيانات يبقى ظاهراً ويُحرس بدالته — لا يُخفى.

#### القاعدة #613 — تعديلُ المدة تاريخٌ فقط، والاستئنافُ يعيد الحساب كما كان ⭐ v357
التقصيرُ لا يوقف ولا يحظر · «إعادة تفعيل» لا تغيّر الخطة · «إعادة تجربة» للتجربة وحدها ومرفوضةٌ للمدفوع بالواجهة والدالة معاً (نمط Chargebee/Stripe). **الحسابُ المدفوع لا يعود تجربةً بأي مسار.**

#### القاعدة #614 — القائمةُ تحت RLS تعود فارغةً لا خطأً ⇒ كلُّ مسارِ حذفٍ يتحقّق بعدٍّ من الخادم ⭐ v362
قبل المحو: عددٌ حقيقي والقائمةُ مساويةٌ له وإلا لا حذف؛ بعده: العددُ صفر وإلا لا يُحذف الحساب؛ فشلُ العدّ fail-closed. والصلاحيةُ الاستثنائية للمحجوب **نافذةٌ زمنية يفتحها المسارُ نفسه** لا فتحٌ دائم.

#### القاعدة #615 — الطابورُ الأوفلاين يتوقّف مع الاشتراك ولا يُستهلك ⭐ v363
لا محاولة ولا عدّاد ولا كنس ما دام المستوى غير full؛ والإيقافُ يُعلَن بالشارة.

#### القاعدة #616 — عروضُ التابلت جزءٌ من المسح البصري ⭐ v363
768/820/1024 تُقاس مع 390 و1280؛ وشريطُ أدواتٍ بأكثر من أربعة أزرار يلتفّ تحت 1100px (الشريط الجانبي ظاهرٌ فوق 820 فيأكل 240px).

#### القاعدة #617 — لونُ المعنى من النظام الموحّد وحده ⭐ v350
كلُّ لون حالةٍ/تحذيرٍ/مرحلة يأتي من `tone` أو توكنات `-bg/-bd/-ink/-fg/-soft/-fill/-solid` بـ`theme.css`؛ لونُ البيانات من `.cbadge`؛ لا rgba/hex من لوحة الداكن بأي صفحةٍ أو JS. الأسطحُ الكبيرة `-soft` لا `-bg`.

#### القاعدة #618 — حارسُ الألوان يُثبَّت مع الصفحة ⭐ v350
`check-colors.js` يُسقط الزيادةَ والنقصانَ؛ كومِتُ الصفحة يحمل `color-baseline.json` المحدَّث. الاستثناءُ الجديد يُضاف لترويسة الحارس بسببه، لا للخط الأساسي بصمت.

#### القاعدة #619 — تحويلُ صفحةٍ يسحب رقعَها الفاتحة ⭐ v368/v378
أيُّ `:root[data-theme="light"] .<صنف>` قديم (بـ`theme.css` أو ملف الصفحة) يلمس صنفاً حُوّل يُسحب بنفس الكومِت — تخصيصُه (0,2,1) يدوس قاعدةَ الصفحة بصمت.

#### القاعدة #620 — لا شفافيةَ على الحالة الطبيعية ⭐ v379
`opacity` على بطاقةٍ كاملة تُبهت الشاراتِ والأزرار والنص معاً؛ الحالةُ الطبيعية (عميلٌ مقبول، صفٌّ عادي) بلا شفافية، والإبهامُ للمرفوض/المؤرشف وحده.

#### القاعدة #621 — توكنُ الكاش لا يُستعمل مرتين بتاريخ الريبو ⭐ v380
`cache-bust.sh` يفرضها (`git log -S`). يُفضَّل التشغيلُ **بلا توكن** كي يتقدّم التلقائيّ؛ جلستان متوازيتان لا تمرّران حروفاً صريحة.

#### القاعدة #622 — حدُّ لون البيانات يُمزج نحو الحبر ⭐ v351
الألوانُ الباستيل من الكتالوج (`#b5e0ff` · `#ffff4d` …) تختفي حين يُمزج حدُّها نحو الأبيض؛ `color-mix(var(--bc) 60%, #102a43)` يضمن ≥2.5:1 لكل لون.

**#623 (تحديثُ المخرج المجمّد باللاندينغ):** معاينةُ المخطط نصٌّ مجمّدٌ من `buildTooth` (تقريبُ منزلةٍ عشريةٍ واحدة + معرّفاتُ `sd*` مشتركة) — تُحدَّث **جراحياً بالترتيب**: كتلُ الأسنان الوجهية تُطابَق مع `UPPER_T+LOWER_T` مطروحاً منها الأسنانَ المرسومةَ ghost، ويُستبدل `d` كلِّ جذرٍ بموضعه من `anat.roots` الجديدة (فينقلبُ z-order تلقائياً)، وتُنقل الأقنيةُ بعد آخر جذر. **الاستبدالُ النصّي العام محظور**: مسارات أسنانٍ مختلفة قد تكون متطابقةً قبل التعديل ومختلفةً بعده (12/22 · 16/17/18). ويُختم بتحقّقٍ بعدي (صفرُ مسارٍ قديم + حضورُ كل جديد) ورسمٍ بصري.

#### القاعدة #624 — خليةُ الجدول لمعنى واحد، وقواعدُ الموبايل القديمة تُفحص ⭐ v353
جدولٌ يُعاد بناؤه بأعمدةٍ جديدة يُفحص ضد قواعد `nth-child` القديمة (قاعدةُ إخفاء «العمود الثالث» أخفت شارةَ السن)، ويُستثنى منها باسمه؛ و`data-test` المستعمل بـE2E يبقى بورودٍ واحد بالمصدر.

#### القاعدة #625 — الحسابُ المالي المشترك موديولٌ واحد بين ماركرَين ⭐ v382
أيُّ معادلةٍ تستهلكها صفحتان (`SyDentPayroll` · `SyDentCurBag` · `SyDentXlsx`) تعيش بـ`supabase-init.js` بين `SYDENT_<X>_MODULE_START/END`، نقيّةً بلا DB/DOM، ويستخرجها `check-critical-logic.js` حيّةً بمتجهاتٍ خاصة بها. لا مرآةَ تُنسخ لصفحةٍ ولو سطراً.

#### القاعدة #626 — الدفعةُ تُصنَّف قبل أن تُخصم ⭐ v382
كلُّ قارئٍ لـ`provider_payouts` يمرّ بـ`SyDentPayroll.payoutParts(po, model, salaryDueFn)` ويخصم مكوّنَه فقط: صفحةُ الرواتب تخصم الراتبَ من الراتب والحصّةَ من الحصّة؛ تقاريرُ الأطباء دفترُ حصّة الإنتاج حصراً (الراتبُ الثابت والمكافأةُ ودفعاتُ «بدون» خارجه ويُقال ذلك بالبطاقة). التفصيلُ المخزَّن يحكم؛ وبلا تفصيل يُصنَّف بنموذج الموظف (راتبٌ أولاً بالمختلط).

#### القاعدة #627 — اقتراحُ الدفعة دفترٌ جارٍ يعلن كلَّ حركة ⭐ v382
الحصّة = كلُّ ما كُسب حتى نهاية الفترة − كلُّ ما سُدِّد من الحصّة عن الفترات حتى نهايتها **بترتيب `period_start` لا `paid_at`**؛ الدفعةُ المفتوحة للتعديل تُستثنى؛ القصُّ عند الصفر. الراتبُ = أيامُ الفترة الفعلية − المدفوعُ منه بنسبة التداخل (محصورٌ بالفترة). كلُّ رصيدٍ سابق أو مقدَّم أو راتبٍ مدفوع جزئياً أو إنتاجٍ/رصيدٍ بعملةٍ أخرى **سطرٌ بالتلميح** — لا رقمَ يُدمج بصمت.

#### القاعدة #628 — التفصيلُ إمّا صريحٌ مطابق أو معدوم ⭐ v382
تطبيقُ الاقتراح يفتح التفصيلَ ويملؤه؛ القسمُ المغلق يُحفظ أصفاراً (لا حقولَ خفية)؛ المفتوحُ يُرفض إن خالف المبلغَ بأكثر من 0.005؛ البندُ الوحيد يتبع المبلغَ المكتوب؛ مودالُ التعديل لا يستبدل المبلغَ المحفوظ بمجموع التفصيل.

#### القاعدة #629 — `timestamptz` يُقرأ يوماً محلياً لا قصّةَ UTC ⭐ v382
`.slice(0,10)` على `paid_at`/`created_at` محظور؛ يُستعمل `_localDay`/`_payoutDay` (مرآةُ `inLocalRange` بالمحاسبة و`_payoutDay` بتقارير الأطباء). الإحصاءُ والفلترُ ومودالُ التعديل والجدولُ يقرؤون اليومَ نفسه.

#### القاعدة #630 — قراءةُ «كل التاريخ» بصفحات 1000 معلَنةُ الفشل ⭐ v382
أيُّ استعلامٍ بلا نافذةٍ زمنية (جلساتُ الرواتب) يمرّ بـ`_fetchAll*` (`order('id').range`) ويفلتر الحالةَ عند الخادم؛ الفشلُ توستٌ لا مصفوفةٌ فارغة (صفرٌ كاذب).

#### القاعدة #631 — نسبةُ الطبيب بتاريخ سريان ⭐ v384
`clinic_doctors.share_history` هو مصدرُ الحساب (`rateAt` لكل جلسة بتاريخها)؛ `share_percent` للعرض والتوافق فقط. تغييرُ النسبة يُضيف مدخلاً بتاريخ «تسري من» (افتراضياً اليوم؛ تاريخٌ سابق لتصحيح إدخال) ولا يُعيد حسابَ ما قبله؛ التحوّلُ لراتب/بدون يسجّل 0. سجلٌّ فارغ ⇒ الحاليةُ على كل التاريخ (المسارُ القديم حرفياً). المدخلُ المعطوب يُسقَط لا يُدوَّر.

#### القاعدة #632 — نهايةُ فترة الدفعة الافتراضية تتبع نموذجَ التعويض ⭐ v383
راتب/راتب+نسبة ⇒ آخرُ الشهر الحالي؛ نسبة ⇒ اليوم. تبديلُ الموظف يعيد الضبطَ ما لم يلمس المالكُ التاريخَ؛ التعبئةُ الصريحة والفلترُ والتعديلُ لا تُمسّ.

#### القاعدة #633 — السلوكُ الواحد يُسلَك بأشكالٍ كثيرة: احرس السلوكَ لا الشكل ⭐ v448
الإغلاقُ بنقرةٍ خارجية ظهر بستة أشكال، ونجا الخامس (حلقةٌ على كل الـoverlays) من جولةٍ كاملة فبقيت 34 نافذةً تمحو نماذجَ معبّأة. قبل إعلان سلوكٍ مُصلَحاً: **عُدَّ كلَّ أشكال سلكه بالملفات الحيّة** (سمة · مستمعُ عنصر · مستمعُ مستند/نافذة · مقارنةٌ بمساعد · حلقةٌ عامّة · دالةٌ نائمة)، واحرس السلوك، و**أثبت الحارسَ أحمرَ بكل شكل**.

#### القاعدة #634 — «وحّدتُ الشكل» لا تعني شيئاً حتى تُقاس بالمتصفح ⭐ v449
إضافةُ الفئة وحذفُ CSS المحلي لا يكفيان — قواعدُ الصفحة الباقية تغلب (`.btn-primary{flex:1}` · حقول `content-box` · `width:100%` على زرّ ذيل). كلُّ ادّعاءٍ بصريٍّ يُقاس بالبكسل بالمتصفح ويُثبَّت بتوكيدٍ دائم.

#### القاعدة #635 — التوحيدُ يشمل **تنسيقَ الحقول** لا الإطارَ وحده ⭐ v450
حقلا الصفّ الواحد على استقامةٍ واحدة (أيُّ عنصرٍ يُحقن — كمبدّل العملة — يجلس **بجانب** الحقل لا فوقه) · اللصيقاتُ والحقولُ بالطقم · أزرارُ الذيل بحجمٍ واحد والأساسيُّ آخرُها · العلاجُ **بالمكوّن المشترك** لا برقعةٍ بصفحة (قاعدةُ المالك: لا حلولَ مؤقتة).

#### القاعدة #636 — قبل حذف CSS محلي: اقرأ قيمه وترجمها ⭐ v452
قاعدةُ مودالٍ محلية قد تحمل `max-width` **للصفحة كلها** (كشفُ الحساب انكمش 1000→480 صمتاً). تُقرأ القيمُ أولاً وتُترجَم إلى فئة حجمٍ صريحة، وعرضُ كل نافذةٍ مثبَّتٌ بجدول `EXPECTED_W` — تغييرُ حجمٍ قرارٌ مُعلَن لا أثرٌ جانبي.

#### القاعدة #637 — طقمُ المحرّر يشمل **كلَّ نصٍّ حرٍّ يخرج للمريض** ⭐ v444
أي نافذةٍ فيها نصٌّ حرٌّ للمريض + قوالبُ و/أو مساعدٌ ذكيّ تتبع طقم «الرسالة الحرة» مهما كانت القناة (واتساب · طباعة · حفظ) — «التعليمات» ليست «نموذجاً». والبنفسجيُّ بالمنصة يعني «ذكاء اصطناعي» وحده: كلُّ زرِّ إطلاق ذكاءٍ `wa-ai-btn` داخل `wa-ai-card` محكومٍ بالبوابة (أزرارُ التنقّل التي تفتح نافذةَ المساعد مستثناة).

#### القاعدة #638 — احترمْ طبيعةَ كل نافذة ⭐ v443
نوافذُ البيانات بلا نقرٍ خارجي؛ نوافذُ القراءة تحتفظ به **بسمةٍ صريحة** وتُسجَّل بـ`READ_ONLY`. ورقةٌ بتصميمٍ خاصّ (منتقي الألوان · درجُ العميل · شريطُ تقدّم غيرُ قابلٍ للإغلاق) **استثناءٌ مُعلَن** يكسب السلوكَ دون فرض الإطار. النوافذُ المبنيّة بالجافاسكربت لا يراها جردُ الـHTML — **تُفتَّش يدوياً** وتُربط بـ`SyModal.scan()`.

#### القاعدة #639 — الخطورةُ تتبع الفعل لا نصَّ الرسالة ⭐ v458
`danger: true` يُقرَّر بما يفعله الزرّ (حذف · إيقاف · تعطيل · تجاهلُ تعديلات · استبدالُ نصٍّ بالأصلي)، لا بوجود «حذف» في الرسالة — رسالةٌ بمتغيّر تُفلت. وتكون **ديناميكيةً** حين يعتمد الفعلُ على الحالة (تفعيل/تعطيل ⇒ `danger: !newState`). حارسٌ يُسقط تأكيدَ حذفٍ بلا علامةٍ صريحة.

#### القاعدة #640 — لا تحدّد «الدالةَ الحاضنة» بالنصّ — استعمل محلّلاً نحوياً ⭐ v462
الكاشفُ النصّي أخطأ ثلاثَ مرّات: أقربُ `function(` ردُّ نداءٍ مجهول (`find(function(x){…})`) · أقربُ دالةٍ مسمّاة دالةٌ مساعدةٌ **متداخلة** داخل الحاضنة. فاتت بسببه عشراتُ المواضع وحارسٌ مرّ صامتاً. أيُّ تحويلٍ آليٍّ للكود يعتمد على البنية يمرّ بـ**acorn** (مثبَّتٌ بالـCI أصلاً: `npm install acorn acorn-walk --no-save`).

#### القاعدة #641 — الشاهدُ يطابق الصفحةَ ولا يجمّلها ⭐ v462
المثبتُ العامّ كان يحقن العُدّة بكل شاهد ⇒ صفحةُ الدخول «مرّت» بـEscape وa11y لم تكونا عندها منذ v453. **الشاهدُ لا يضيف إلا ما تحمّله الصفحةُ فعلاً**، وحارسٌ نصّيٌّ يطابق الاستعمالَ بالتحميل.

#### القاعدة #642 — «أخضرُ محلياً» ليس «وصل للمنصة» ⭐ v459
`validate.sh` لا يشغّل وظيفة `e2e`؛ والنشرُ (`promote` → فرع `release` → Cloudflare) مشروطٌ بالبوابة كلِّها. ثلاثُ دفعاتٍ متتالية حمراء **ولم يُنشر شيء** والمالك يرى النسخةَ القديمة. **بعد كل دفع:** انتظر حتى `git ls-remote origin release` = `HEAD`؛ إن لم يتحرّك فالبوابةُ حمراء — ابحث السبب قبل أي خطوةٍ تالية. (الـPAT الحاليّ بلا صلاحية قراءة Actions ⇒ مراقبةُ `release` هي الدليل.)

#### القاعدة #643 — تغييرُ آليةِ واجهةٍ يلمس الاختبارات التي تعتمدها ⭐ v459
استبدالُ `confirm` الأصلي كسر مثبتات E2E التي تقبله بـ`page.on('dialog')`. قبل تغيير أيّ آليةٍ يمرّ بها E2E (حوار · تنقّل · توقيت): ابحث في `e2e/` عمّن يعتمدها وحدّثه بالدفعة نفسها.

#### القاعدة #644 — ما كان يحجب لم يعد يحجب ⭐ v462
`alert/confirm` الأصليّان يوقفان التنفيذ؛ `SyDialog` وعد. تنبيهٌ يسبق مغادرةَ الصفحة (تسجيلُ خروج · `location.href`) يجب أن يكون `await SyDialog.alert(...)` وإلا ضاعت رسالتُه. ودالةٌ متزامنة تصير `async` فقط بعد التأكّد أن مستدعيها لا يقرأ قيمتَها.

#### القاعدة #645 — عُدّةٌ واحدة بملفٍّ بلا اعتماد ⭐ v462
مكوّنٌ تحتاجه صفحتان بسياقَين مختلفين (العيادة والأدمن) لا يعيش داخل ملفٍّ له آثارٌ جانبية لأحدهما — يُفصل إلى ملفٍّ مستقلّ (`sy-modal.js`) بدل نسخه، ويُحرس ضدّ عودة النسخة الثانية.

#### القاعدة #646 — تعريفُ «منجَز» لأي جولة واجهات ⭐ v438–v462
(١) الفحصُ على **الملف الحيّ** لا شاهدٍ مقتطع · (٢) ملاحقةُ السلوك **بكل أشكاله** (#633) · (٣) **قياسٌ بالمتصفح** للشكل والتنسيق (#634–#636) · (٤) إثباتُ كلِّ حارسٍ جديدٍ **عكسياً** · (٥) التأكّدُ أن توكن الفليت تغيّر بالملفات المعدّلة · (٦) قراءةُ سطر «كل الحُرّاس خضر» لا افتراضُه · (٧) **انتظارُ ترقية `release`** (#642) · (٨) إخبارُ المالك بما **لم** يُنجَز صراحةً.

#### القاعدة #647 — «هذا المسار لا يفعل X» يُثبَت بتتبّع السلسلة لا ببحثٍ في ملف ⭐ v464
الصفحاتُ تُسلّم لبعضها (`?dismiss=`، `location.href`، نوافذ مشتركة). قبل إعلان غياب سلوكٍ عن مسار: تتبّعْ **كلَّ** نقطة دخولٍ حتى الدالة التي تكتب فعلاً. قولٌ خاطئٌ للمالك أسوأ من «لا أعرف بعد».

#### القاعدة #648 — المراجعةُ تطارد توسيعَ النطاق ⭐ v465
كلُّ شرطٍ جديد على حالة الجلسة (`completed`، `planned`) يُسأل: ماذا يفعل ببياناتٍ **قديمة** و**بلا وسم** و**لمريضٍ بلا الميزة**؟ ويُضاف سيناريو ببياناتٍ كهذه قبل الشحن.

#### القاعدة #649 — مساران لنفس النتيجة يلتقيان بمخططٍ واحد ⭐ v468
حين يصل مساران من الواجهة إلى الحالة نفسها (زر «إزالة الجسر» ↔ الحذف من الجدول · إنجازٌ بملف المريض ↔ بالمواعيد)، سيناريو يُثبت **تطابقَ الحالة النهائية** بينهما.

#### القاعدة #650 — الثابتُ العامّ يسبق التوكيدَ الخاص ⭐ v468
توكيدٌ داخل سيناريو يفحص ما توقّعتَه؛ الثابتُ المطبَّق بعد **كل** خطوةٍ بكل السيناريوهات يفحص ما لم تتوقّعه (I1 كشف طفرةً لم يكتشفها توكيدٌ صريح). ثابتٌ جديد ⇒ أعد تشغيل كل السيناريوهات القديمة.

#### القاعدة #651 — التوستُ الأخير يروي أسوأ نتيجةٍ للعملية كلِّها ⭐ v468
عمليةٌ متعدّدة الخطوات لا تُختم بنجاح الخطوة الأولى إن فشلت لاحقة؛ ⚠️ يسبق ✅.

#### القاعدة #652 — توكنُ الفليت بالتفرّد لا بالتاريخ ⭐ v466
جلساتٌ متوازية بساعاتٍ مختلفة تجعل التواريخ غيرَ رتيبة. عند نفاد أحرف اليوم: أولُ توكنٍ غيرِ مستعمل (`git log -S"?v=<T>"`) بصيغة `YYYYMMDD` + حرف، ويُذكر بالكومِت أنه صريح.

#### القاعدة #653 — البوابةُ مقروءةٌ الآن: اقرأها ولا تستنتجها ⭐ سياق 281
يعدّل **إجراءَ** القاعدة #642 (المبدأُ باقٍ: «أخضرُ محلياً» ليس «وصل للمنصة»). بعد كل دفع:
```bash
T=$(git config --get remote.origin.url | sed -n 's|https://\([^@]*\)@.*|\1|p')
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/AyhamGhnaim/SyDent/actions/runs?branch=main&per_page=1" \
  | python3 -c "import sys,json;r=json.load(sys.stdin)['workflow_runs'][0];print(r['head_sha'][:7],r['status'],r['conclusion'])"
```
تُنتظر حتى `completed` بـ`head_sha` = `HEAD`؛ **`failure` ⇒ يُقرأ سجلُّ الوظيفة الفاشلة ويُصلَح قبل أي خطوةٍ تالية**. ومطابقةُ `release` = `HEAD` تبقى الدليلَ الثاني على النشر الفعلي.

#### القاعدة #654 — الرموزُ السرّية: مكانٌ واحد، ولا طباعة، وتحقّقٌ بلا كشف ⭐ سياق 281
(١) **قرارُ المالك:** رمزُ الدفع الحاليّ مكتوبٌ **بنسخة ملف السياق المرفوعة لمعرفة المشروع وحدها** (قسم «رمز GitHub الحالي» بهذه الكتلة) كي تقرأه كلُّ محادثة — **ولا يُكتب بنسخة المستودع** (`docs/`) ولا بأي كودٍ أو كوميت: تاريخُ git لا يُمحى، وGitHub قد يرفض دفعاً يحوي رمزاً. يُحقن بـ`git remote set-url`. (٢) **لا يُطبع**: كلُّ أمر git يمرّ بـ`sed` الإخفاء، وقراءتُه من سطر الأوامر عبر here-doc لا عبر `echo`. (٣) لمعرفة أيّ رمزٍ تسرّب: **مقارنةُ تطابقٍ وآخرُ أربعة أحرف** لا عرضُ الرمز. (٤) بعد الإبطال **يُثبَت موتُه** (401) لا يُفترض. (٥) قبل حذف أي رمز: **ابحث عن استعماله كسرٍّ بالـworkflows** (`grep secrets. .github/workflows/`) — `BACKUP_PAT` مثالٌ حيّ. (٦) صلاحياتٌ دنيا ومستودعٌ واحد.

#### القاعدة #655 — ثلاثةُ ألوانٍ بمعنى ثابت، مربوطةٌ بالمعالج ⭐ سياق 282
أخضرُ يتقدّم (واحدٌ بالصف) · برتقاليٌّ يُعيد أو يوقف قابلاً للتراجع · أحمرُ يُتلف · والباقي محايد. اللونُ يُقرَّر بقائمةٍ مُعلَنة بالحارس لا بذوق الصفحة، وأيُّ لونٍ جديد يمرّ بها.

#### القاعدة #656 — «مصطفّ» يُقاس عبر الصفوف لا داخل الصف ⭐ سياق 282
جدولٌ أزرارُ صفوفه متغيّرة يتقافز حتى لو كان كلُّ زرٍّ «موحّداً». خاناتٌ ثابتة + امتدادٌ فوق الغائب + **طيُّ ما لا يستعمله أيُّ صفّ** + التصاقٌ بنهاية الصف، ويُثبت بمقارنة حوافّ الأزرار بين الصفوف.

#### القاعدة #657 — الإثباتُ العكسي الذي لا تشغّله البوابة يتقادم بصمت ⭐ سياق 282
حالةٌ «لم تُطبَّق — المرساةُ تغيّرت» تعني أن الحارس لا يحمي شيئاً. كلُّ `--self-test` يدخل `validate.sh`.

#### القاعدة #658 — الوقتُ داخل نصٍّ عربي يُعزل اتجاهُه ⭐ سياق 282
«02:32 PM» بسطرٍ عربي يُرسم «PM 02:32». بالواجهة: `SyDT.time12` (LRI…PDI)؛ برسائل الواتساب: LRM حوله؛ وبالخلايا: `.ltr-val`. التحقّقُ بصورة، لا بالنص.

#### القاعدة #659 — قاعدةُ إخفاءٍ متجاوبة تُقيَّد بجدولها ⭐ سياق 282
`.data-table td:nth-child(N){display:none}` بلا فئة أخفت عنوانَ بطاقة المخبر وزرَّ الشراء لأشهر. قيّدها بفئة الجدول المقصود، وقِس ظهورَ العناصر الحرجة بالمثبت.

#### القاعدة #660 — التلميحُ العائم داخل حاوية تمرير يُقَصّ ⇒ اعرض المعلومة بمكانها ⭐ سياق 282

#### القاعدة #661 — «موحّد» بلقطة المالك لا بشاشتي: الفاتحُ يُقاس ⭐ سياق 282
صبغةٌ مقروءةٌ بالداكن قد تبدو رماديةً بالفاتح وبكاميرا الهاتف. الأساسيُّ بالفاتح مُصمَت، ويُراجَع بثيم المالك الفعلي.

#### القاعدة #662 — «يعمل» يُثبت بالتوصيل لا بالشكل ⭐ سياق 282
بعد أي ترحيلٍ للأزرار: مثبتُ التوصيل (نفسُ المعالجات والصلاحيات) + قابليةُ النقر بالمتصفح + E2E الحيّ. سؤالُ المالك «عم تراجع عمل الزرار؟» كشف أن القياس كان للشكل وحده.

#### القاعدة #663 — تصادمُ الجلسات المتوازية: رقمُ نسخةٍ ورمزُ فليتٍ واحد ⇒ أعد التأسيس وارفع التالي ⭐ سياق 282
دفعت جلستان v482 بالرمز نفسه (`20260922v`). الحل: إسقاطُ كومِت الفليت المحلي · `rebase` · رفعُ النسخة التالية (v483) · رمزٌ جديد · CHANGELOG بالمدخلين. اسحب قبل رفع النسخة **وقبل** اختيار الرمز.

#### القاعدة #664 — إزالةُ الرسم لا تُيتّم جلسته ⭐ سياق 283
أيُّ زرٍّ جديد يحذف صفوفَ `teeth_status`: يلتقط `removedRowsOf` قبل الحذف، ويضيف `removalSessionsNote` للتأكيد، ويمرّ بعد النجاح على `followUpRemovedSessions` ثم `removalToast`. لا نافذةَ جلساتٍ مكتوبةً يدوياً ولا توستَ ✅ بعد فشل.

#### القاعدة #665 — المنجزُ قرارٌ ماليّ ⭐ سياق 283
يُعرض بعد المخطّط وبنافذةٍ مستقلة · للمالك وحده · «أبقِها» مُركَّز (danger) · بمطابقةٍ دقيقة (سطح + مفتاح، صفٌّ منجز) لا تاريخُ السن كلّه · لا يُعاد السؤال عنه من المسار اليتيم.

#### القاعدة #666 — أحرفُ الفليت لليوم تنفد ⭐ سياق 283
26 حرفاً ليومٍ واحد تُستهلك مع جلساتٍ متوازية كثيرة (20260922a–z نفدت). مرّر توكناً صريحاً بتاريخ الغد **بعد** التحقق أنه لم يُستعمل (`git log -S"?v=<التوكن>"`) — `20260923a` كان مستعملاً من كتلة 282.

**ملاحظةُ تشغيل:** `validate.sh` كاملاً يتجاوز حدَّ 300 ثانية لأداة التنفيذ ⇒ محلياً `SY_SKIP_RA_DOM=1` والبوابةُ تشغّل مثبتَ أزرار الصفوف. فشلُه المحلي (10: المواعيد 320/360 · الأطباء 390) قياساتُ خطٍّ بالحاوية — أخضرُ بالـCI.

#### القاعدة #667 — البنيةُ تُقاس بمحلّلٍ لا بمواضع النصّ ⭐ سياق 284
توكيدٌ قاس «الرمزُ بعد أولِ `</g>` يلي فتحَ التعتيم» فمرّت منه طفرةٌ وضعت الرمزَ **داخل** التعتيم: أولُ `</g>` كان مجموعةً داخلية. أيُّ توكيدٍ عن **العلاقة البنيوية** (هذا داخل ذاك · هذا خارجه · المجموعة مغلقة) يُقاس بمحلّلٍ حقيقي — `DOMParser` + `querySelector('.a .b')` — لا بـ`indexOf`. امتدادٌ لـ#640 من الدوالّ إلى SVG المرسوم.

#### القاعدة #668 — حالةٌ سريريةٌ جديدة = سطرٌ بالمكتبة + رايةٌ + المسندُ الواحد ⭐ سياق 284
لا تُلمس مواضعُ الرسم الثلاثون: (١) سطرٌ بـ`COND_DEFS` بنطاقٍ تشريحي (#668 يرث v434: الموضعُ جزءٌ من المعلومة) · (٢) رايةُ رسمٍ (`draw`) يقرؤها `condDrawFlag` من **الخريطة المفلترة** — وأيُّ غلافٍ يُفتح **بعد كل المخارج المبكرة** ويُغلق **قبل طبقة الرموز** · (٣) أثرٌ بنيويٌّ (بريو · جسور) عبر **المسند الواحد** الذي تقرؤه كلُّ المواضع، لا بتعديل مواضع النداء. «غير بازغ» بُني هكذا بالكامل، وهو النمطُ المرجعي لـ«السن الزائد» إن اختير مستوى الحالة.

#### القاعدة #669 — الحارسُ الذي يعتمد على الشبكة يقيس الشبكة ⭐ سياق 285
أيُّ مثبتٍ يقيس بكسلات (قصّ · التفاف · محاذاة) **يجب أن يكون هرميّاً**: خطوطٌ وأصولٌ محلية تُلبّى بـ`page.route`، وما لا نسخةَ له يُلبّى بـ404 صريح. إخفاقٌ يظهر بلا شبكة ويختفي معها = حارسٌ معطوب لا كودٌ معطوب. ولا يُحلّ بتخفيف العتبة (يخفي أخطاءً حقيقية) ولا بتجاهل الوضع غير المتصل (يقتل الحارس).

#### القاعدة #670 — ما تعتمد عليه الواجهةُ لتُرسم صحيحاً يُستضاف معها ⭐ سياق 285
خطٌّ أو مكتبةٌ يتوقّف عليهما شكلُ الواجهة لا يُجلبان من طرفٍ ثالث: سوقُنا فيه حجبٌ وشبكاتٌ بطيئة، والـPWA يَعِد بالعمل بلا اتصال. يُستضاف الأصلُ بنفس الأصل، يُسخَّن بالـSW، ويُكاش immutable باسمٍ ثابت (تغييرُه = اسمٌ جديد)، ويُحذف مضيفُه من CSP. **والاختبارُ يقرأ نسخةَ الإنتاج نفسها** — نسختان = انحرافٌ مؤكَّد.

#### القاعدة #671 — مثبتٌ محليٌّ خارج الريبو يتقادم بلا إنذار ⇒ ثابتٌ ذاتيّ لا لقطة ⭐ سياق 285
مقارنةُ «بايت-مطابق مع لقطة vNNN» تنكسر حين تُعدّل جولةٌ لاحقة الملفَّ شرعاً — فتُنتج إخفاقاتٍ كاذبة تُضيّع التدقيق. المثبتُ الذي يعيش خارج البوابة يُكتب على **ثابتٍ ذاتي** (مثلاً: «بلا مخطّط ⇒ شريطُ الزيارات لا يضيف شيئاً» · «نفسُ البناء مع تحييد الإضافة ⇒ نفسُ المخرجات») ويحمّل **الكودَ الحقيقي** لا بدائل. (امتدادٌ للقاعدة #657.)

#### القاعدة #672 — ملفُّ السياق نسختان: عاملةٌ خفيفة وأرشيفٌ حرفي ⭐ سياق 286 (**عُدِّلت بـ#682 — عاد ملفّاً واحداً**)
الملفُّ العامل (`docs/SyDent_Context_new_md_NNN.md`) يحمل ما تبدأ به أيُّ جلسة فقط: الحالةَ الحيّة · ما تبقّى مفتوحاً · القواعدَ كلَّها مجمّعةً مرتّبة · فهرسَ الجلسات بسطرٍ لكلٍّ. **التفاصيلُ والبراهين والنقاشات تعيش بالأرشيف الحرفي** (`docs/archive/`) وبـ`CHANGELOG.md`. كتلةُ كلِّ جولةٍ جديدة تُضاف موجزةً فوق الحالة الحيّة؛ وحين يتجاوز العاملُ ~700KB تُنقل كتلُ الجولات للأرشيف (تُلحق به حرفياً لا تُعاد كتابتها) ويبقى منها سطرُ الفهرس وقواعدُها. **الحذفُ ممنوع — النقلُ فقط**، ويُثبَت بمثبتٍ: كلُّ رقم قاعدة موجود بالعامل، والأرشيفُ بايت-مطابق لما نُقل.

#### القاعدة #673 — كلُّ كتابةٍ على جدولٍ محروس مصنّفةٌ بجردٍ في المثبت ⭐ سياق 287
حارسٌ يُربط بمساراتٍ معدودة يتقادم حين يُضاف مسارٌ جديد. مثبتُ حارس التعارض يجرد **كلَّ** `.from('appointments').insert/update/upsert(` بالمنصة (بأضيق دالةٍ حاوية بمطابقة الأقواس، لا آخرِ دالةٍ مُعلنة قبلها) ويصنّفها guarded/stamp/other بسببٍ مكتوب؛ موضعٌ غيرُ مصنّف = أحمر. أمسك كتاباتِ السلسلة والأسرة لحظةَ إضافتها.

#### القاعدة #674 — التفاعلُ يُثبَت بآليته الحقيقية لا باسمٍ مفترض ⭐ سياق 287
زرُّ «حجز وقت» فتح نافذتَه بفئة `active` بينما العُدّةُ تُظهر بـ`open` — فلم يُفتح شيءٌ ومرّ المثبت. أيُّ توكيدٍ عن الإظهار/الإخفاء/الحالة يقرأ القاعدةَ الفعلية من مصدرها (`theme.css` هنا) ويقارنها بما يكتبه الكود.

#### القاعدة #675 — الصفحاتُ تُسطّح input ⇒ مربّعاتُ الاختيار صريحة، والصفوفُ قابلةٌ للانكماش ⭐ سياق 287
قاعدةُ `input{width:100%;appearance:none;padding}` تحوّل كلَّ checkbox إلى شريطٍ رمادي وتمطّ الشرائح. النمطُ المعتمد: **شريحةٌ يغطّيها input مخفي** (`position:absolute;inset:0;opacity:0`) مع حالتي `:has(input:checked)` و`:focus-visible`، أو مربّعٌ صريح (`appearance:checkbox` بقياسٍ ثابت). وأيُّ صفّ حقولٍ على الجوال شبكةُ `repeat(n, minmax(0,1fr))` بخلايا وحقولٍ `min-width:0`؛ حقلُ الوقت على iOS بلا مظهر النظام.

#### القاعدة #676 — نافذةٌ مشتركةٌ بين صفحتين = وحدةٌ تحقن مودالَها ⭐ سياق 287
لا نسختا HTML (انحرافٌ مؤكَّد). الوحدةُ تحقن معالمَها عند أول فتح، معرّفاتُها ببادئةٍ خاصة مثبَتٍ تفرّدُها ضد الصفحتين، وتستعمل كاشاتِ الصفحة المضيفة إن وُجدت وإلا تجلب بنطاق الطبيب؛ CSSُها بطقمٍ في `theme.css`.

#### القاعدة #677 — تغييرُ افتراضيٍّ يشكّل البيانات المخزّنة يستوجب تدقيقَ ما حُفظ به ⭐ سياق 287
حين صار «إلى» الفارغ = دائماً بقي صفٌّ حيّ محفوظٌ بالافتراضي القديم (نهايةٌ = يومُ بدايته) لا ينطبق على أي يوم. بعد أيِّ تغييرٍ كهذا: استعلامٌ حيّ عن الصفوف المتأثّرة وتصحيحُها. والتعديلُ لا يُزيح قيمةً مخزّنة بصمت (تفريغُ «من» يُبقي البدايةَ الأصلية).

#### القاعدة #678 — الإنشاءُ الدفعي: الأساسُ بالمسار المحروس، والبقيةُ بفحصٍ مسبق واحد ⭐ سياق 287
السلسلةُ والأسرةُ: الموعدُ الأول يمرّ بحارس الحفظ المعتاد، ثم **استعلامٌ واحد** لكل التواريخ/الأوقات عبر المصدرين المشتركين (`SyDentConflict.find` + `SyDentBlocks.blocking`) وحوارٌ بثلاثة خيارات (غيرُ المتعارض · رغمه · الأساسُ وحده)، ثم إدخالٌ دفعةً واحدة لصفوفٍ مستقلة غير مؤكَّدة بلا أختام. لا حوارَ لكل صفّ ولا قاعدةَ حيّة تُعاد قراءتها.

#### القاعدة #679 — «لا يظهر» يُشخَّص من البيانات الحيّة وقواعد العرض قبل أي تعديل ⭐ سياق 287
بلاغُ «اليوم لا يظهر ببوابة الحجز» كان قاعدةً قائمة (اليومُ يُخفى بعد نهاية الدوام بساعة الجهاز) لا خللاً. الترتيب: الصفوفُ الحيّة ← ما تُعيده الدالةُ العامة ← قاعدةُ العرض بالواجهة ← ساعةُ الجهاز والمنطقة الزمنية؛ ومسارُ الحفظ/التعديل يُعاد تشغيلُه على الوحدة الحيّة (jsdom) قبل افتراض خلل.

#### القاعدة #680 — البوابةُ العامة لا ترى إلا ما يخصّ المريض ⭐ سياق 287
المريضُ لا يختار كرسياً ولا طبيباً ⇒ تُغلق فترةٌ بالبوابة فقط إن كانت عامّة، أو إن شملت الفتراتُ الخاصّة **كلَّ** الأطباء النشطين أو **كلَّ** الكراسي النشطة (NOT EXISTS مزدوج، ولا إغلاقَ مع صفرِ أطباء). التغطيةُ الجزئية لا تمسّ المرضى.

#### القاعدة #681 — تشغيلُ البوابة الطويل منفصلاً ⭐ سياق 287
`validate.sh` كاملاً يتجاوز حدَّ أداة التنفيذ (300 ثانية)، و`nohup … &` داخل استدعاءٍ ينتهي يُقتل معه. يُشغَّل بـ`setsid bash -c '… > log; echo EXIT $? >> log' < /dev/null &` ثم يُستطلع السجلّ باستدعاءاتٍ لاحقة حتى سطر `EXIT`.

#### القاعدة #682 — ملفُّ السياق ملفٌّ واحد شامل ⭐ سياق 287 (قرار المالك)
الفصلُ إلى عاملٍ وأرشيف (#672) أُلغي: معرفةُ المشروع تحمل ملفّاً واحداً، والأرشيفُ المنفصل لم يكن فيها. البنية: **الرأسُ العامل** (الحالة الحيّة · المفتوح · الخلاصة · الافتتاح · القواعد مجمّعة · الفهرس) ثم **«التاريخ الكامل حرفياً»** (أحدثُ كتلةٍ مفصّلة أولاً، ثم ما قبلها كما هو). كتلةُ كلِّ جولة: موجزٌ فوق الحالة الحيّة + تفاصيلُها أعلى التاريخ. يبقى من #672 مبدآها: **لا حذف — النقلُ فقط**، والتحقّقُ أن كلَّ سطرٍ أُزيل من الرأس صار بالتاريخ. لا مجلدَ `docs/archive/`.


#### القاعدة #683 — ملفُّ السياق يُسلَّم بنسختين دائماً، دون أن يطلب المالك ⭐ سياق 287 (قرار المالك)
كلَّ مرّةٍ يُحدَّث فيها ملفُّ السياق — بأي محادثة ولأي سبب — تُسلِّم المحادثةُ **نسختين** في الرد نفسه، **تلقائياً دون طلب**:
1. **نسخة الريبو** (`docs/SyDent_Context_new_md_NNN.md`): **بلا توكن** — العناصرُ النائبة `__TOKEN_ONLY_IN_PROJECT_COPY__` و`<<PAT_REDACTED…>>` كما هي (#654). تُدفع للريبو.
2. **نسخة معرفة المشروع** (ملفٌّ مرفق بـ`/mnt/user-data/outputs/` بنفس الاسم): **التوكنُ الفعلي** بكل موضعٍ نائب (قسم «🔑 GitHub PAT» · أمرُ الـclone بـ«🛠️ أوامر البداية» · أسطرُ «رمز GitHub الحالي»). **هي التي يرفعها المالك** بدل الملف القديم بمعرفة المشروع.

**قبل التسليم يُتحقَّق (ويُذكر بالرد بسطر):** (أ) clone فعلي للريبو بالتوكن المأخوذ من نسخة المشروع ينجح؛ (ب) بقسمة النسختين على المواضع السرّية، **كلُّ النصّ غير السرّي متطابقٌ حرفياً**؛ (ج) نسخةُ الريبو خاليةٌ من أي `github_pat_` كامل. **مصدرُ التوكن:** نسخةُ معرفة المشروع الحالية (`/mnt/project/SyDent_Context_new_md_*.md`) أو `.git/config` للجلسة؛ لا يُطبع بالمخرجات أبداً.

**لماذا:** بجولة 287 رُفعت نسخةُ الريبو لمعرفة المشروع ⇒ المحادثةُ التالية وجدت العنصرَ النائب بدل التوكن فلم تستطع فتح الريبو الخاص. المالكُ لا يريد أن يتذكّر ذلك ولا أن يطلبه كل مرّة — التذكّرُ مسؤوليةُ المحادثة.

#### القاعدة #684 — لا معادلةَ ماليةً ثانية: تبديلُ السياق على الدوالّ نفسها ⭐ سياق 288
أيُّ عرضٍ مالي جديد (شهرٌ بالاتجاه · يومٌ بالكشف · طبقةُ عملة · رصيدُ مريض) لا يعيد كتابةَ الصيغة: يُحسب بالدوالّ القائمة (`computeSummary` · `computeAdjustmentTotals` · مرآةُ `computeDashFinancials`) بعد تبديل المصفوفات العامّة على صفوفه ثم إرجاعها بايت‑بايت (نمطُ `computeLayersByCurrency`)، والمثبتُ يقارن كلَّ ناتجٍ بالحساب المباشر على الصفوف نفسها **ويُثبت الحفظ** (Σ الأجزاء = الكلّ) على متجهاتٍ وعشوائيات. درسُ v507/v509: التقادمُ بلا هذا كان سيعطي رصيداً غير رصيد اللوحة، والاتجاهُ بلا هذا كان سيزدوج توزيعَ الدفعات.

#### القاعدة #685 — طرقُ الدفع مصدرٌ واحد: `pay-methods.js` ⭐ سياق 288
القائمةُ (مفتاحٌ · تسميةٌ عربية · نقدٌ ماديّ؟) والمُطبِّع `norm()` بملفٍّ واحد؛ كلُّ منتقٍ يُبنى منه أو يحمل مفاتيحَه حرفياً، وكلُّ قيدِ `CHECK` بالقاعدة (`provider_payouts.payment_method_valid`) يطابق مفاتيحَه **والمثبتُ يقارن القائمتين**. دفعاتُ المرضى تُخزَّن بالتسمية العربية (عقدٌ قائم — لا ترحيل)، والمصروفاتُ والرواتبُ بالمفتاح؛ المجهولُ ⇒ «أخرى» ولا يُسقَط رقمٌ أبداً.

#### القاعدة #686 — كلُّ صفحةٍ تحمل مرساةً لزرّ الدور ⭐ سياق 288
`supabase-init.injectHeaderButton` يرسي زرَّ «المالك 👑» بـ`.topbar` ثم `.header-actions` ثم `.header`/`header`، وإلا طفا مثبَّتاً أعلى اليسار **فوق عنوان الصفحة بالهاتف** (لقطة المالك بالمحاسبة). صفحةٌ برأسٍ مختلف (`.page-header`) تحمل `.header-actions` صراحةً، ويُقاس بمتصفحٍ حقيقي ألا يتداخل الزرُّ مع العنوان بـ390 و1280.

#### القاعدة #687 — البطاقاتُ الثانوية لا تؤخّر البطاقةَ الرئيسية ⭐ سياق 289
بطاقةٌ مستقلة البيانات (ملخّص أمس · الهدف · الفجوات) تُحمَّل بدالةٍ غير مُنتظَرة `(async function(){…})()` وترسم بطاقتَها حين تجهز؛ لا تُضاف `await` تسلسلية قبل رسم البطاقة التي يراها المستخدم أولاً («مواعيد اليوم»). ما يدخل صفَّ البطاقة الرئيسية نفسها (أعلامُ الهدل) وحده يُنتظر. المثبتُ يتحقّق أن الثلاث ليست `await`.

#### القاعدة #688 — إعداداتُ الصفحة تُحمَّل مرةً واحدة قبل كل مستهلكيها ⭐ سياق 289
`loadDashWaState` (واتساب · فترةُ الاستدعاء · أيامُ/ساعاتُ العمل · الأهداف · العملة) كان يُحمَّل بعد الهدل وملخّص أمس فكانت القيمُ تسقط للافتراضات **بصمت** (6 أشهر · كلُّ الأيام) — لا خطأ ولا أثر ظاهر إلا بمراجعة متصفح. أيُّ عمودٍ جديد يُضاف لاستعلام الإعدادات القائم (لا استعلامٌ ثانٍ)، والمثبتُ يثبت ترتيب التحميل.

#### القاعدة #689 — الرقمُ الجزئي يُعلَن ولا يُجمَّل ⭐ سياق 289
حين لا تكفي البيانات لرقمٍ كامل (موعدٌ بلا بنودٍ مسعَّرة · هدفٌ حالي على أشهرٍ سابقة) يُعرض ما يُعرف بدقة + ما قُدِّر معلَّماً «تقديري» + عددُ ما لا يُعرف «بلا تسعير»، وتُكتب الحدودُ بسطرٍ بالواجهة — رقمٌ جزئيٌّ صادق أفضل من كاملٍ مضلِّل.

#### القاعدة #690 — الروابطُ العميقة تعبّئ ولا تحفظ ⭐ سياق 289
`?slot=YYYY-MM-DDTHH:MM[&pid=]` و`?editAppt=<id>&moveTo=…` تفتح النافذةَ بالقيم معبّأة (والمريضُ بالاسم المسجّل عبر مساره الطبيعي `onFPatientInput`)، بصيغةٍ صارمة وإلا تُتجاهل، وتُحذف من الرابط بعد القراءة، و**لا كتابةَ ولا حفظَ تلقائي** — القرارُ للمستخدم بزرّ الحفظ (والمثبتُ ومراجعةُ المتصفح يثبتان صفرَ PATCH).

#### القاعدة #691 — قوائمُ `.in()` بمقاطع 150، والاقتراحُ يفشل بأمان ⭐ سياق 289
أيُّ `.in(col, ids)` قد يطول بعدد المرضى/الجلسات يُقسَّم بمقاطع 150 (طولُ رابط PostgREST — نمطُ `loadTrend`). وحين يفشل استعلامٌ يحدّد **من يُستثنى** من اقتراح (من له موعدٌ قادم) لا يُقترح أحد — اقتراحٌ غائب أسلمُ من اقتراح مريضٍ محجوزٍ أصلاً.

#### القاعدة #692 — حارسُ المتصفح: `wait_for_timeout` لا `time.sleep` ⭐ سياق 289
Playwright المتزامن لا يخدم مسارات الشبكة المصطنعة (`route`) إلا داخل نداءاته؛ `time.sleep` يجمّد الطلبات فتبدو الصفحةُ عالقةً أو النقرُ بلا أثر (تعثّرُ «وصل» المتقطّع وصفحةُ مواعيدٍ فارغة بهذه الجولة). الانتظارُ دائماً `page.wait_for_timeout` أو `wait_for_selector`، وتشغيلُ حارسين بنفس المنفذ معاً ممنوع.

#### القاعدة #693 — ثابتُ المرساة المالية يُفرض بالقاعدة لا بالعميل ⭐ سياق 290
حقلٌ تُحسب عليه نافذةٌ مالية (`lab_orders.date_sent` — #196) لا يُحمى بتعديل الواجهة وحده: نسخةٌ قديمة مخزّنة بالكاش ستظل تكتبه. الثابتُ يُفرض بتريغر BEFORE UPDATE (M160: `redo → sent` يُبقي `date_sent` الأصلي)، والواجهةُ تكفّ عن كتابته أيضاً، والمثبتُ يقرأ ملفَّ الهجرة ويطفّره. ويُتحقَّق حيّاً بمعاملةٍ مُرجَعة أن مجاميعَ الشهر لم تتحرّك.

#### القاعدة #694 — كلُّ عمود ربطٍ جديد لجدولٍ مملوك يحتاج حارسَ ملكية ⭐ سياق 290
فحصُ المفتاح الأجنبي بـPostgres **لا يمرّ بـRLS**: مستخدمٌ يعرف معرّفَ صفٍّ لعيادةٍ أخرى يستطيع ربطَ صفّه به (لا تسريب، لكن ربطٌ عابرٌ للمستأجرين). أيُّ عمود `*_id` جديد يشير لجدولٍ مملوك يُحرس بتريغر SECURITY INVOKER يشترط أن الهدفَ للمالك نفسه (ولنفس المريض حين يُعقل) — M163 — ويُتحقَّق حيّاً بمحاولةٍ أجنبية مرفوضة وأخرى خاصّة ماضية.

#### القاعدة #695 — القرارُ التخطيطي بعرض الحاوية لا الشاشة ⭐ سياق 290
حين تقتسم الصفحةَ قائمةٌ جانبية، `@media` بعرض الشاشة يكذب (1280 تترك 982px للمحتوى). جدولٌ يتحوّل لبطاقات يقرّر بـ`container-type: inline-size` على قسمه، بعتبةٍ مقيسةٍ من العرض الطبيعي للجدول ببياناتٍ واقعية لا من لقطةٍ واحدة، ويُقاس على مقاساتٍ عدّة (1920/1600/1440/1280/700/390) أن كلَّ زرٍّ داخل الشاشة.

#### القاعدة #696 — المصدرُ الناقص يدلّ على مكان إعداده ⭐ سياق 290
حسابٌ آليّ يحتاج إعداداً غيرَ موجود (مدّةُ المخبر لعلاجٍ ما) لا يسكت ولا يخترع افتراضاً: يعرض سطراً يسمّي الناقص برابطٍ عميق يفتح **ذلك العنصر نفسه** والمؤشرُ على الحقل (يعبّي ولا يحفظ — #690)، ويُقرأ الإعدادُ مع كل فتح كي يظهر تعديلُه فوراً.

#### القاعدة #697 — تعديلٌ عام بـ`theme.css` يُتبع بمسحٍ منصّي ⭐ سياق 290
قاعدةٌ على محدِّدٍ عام (`.modal-overlay input[type=date]` · `.form-row > *` · `#syFabDock` تحت أي نافذة) تمسّ صفحاتٍ لم تُفتح بالجولة. قبل الإغلاق: كلُّ نافذةٍ بكل صفحة تُفتح قسراً على 390 و1280 ويُقاس أن لا حقلَ منضغطٌ أو فائض ولا صفّ فائض، ويُتأكَّد ألّا نافذةَ مفتوحةٌ ثابتاً تُخفي الزرَّ العائم.

#### القاعدة #698 — حوارٌ ينتظر المستخدم لا يُستدعى بـ`page.evaluate` المنتظِر ⭐ سياق 290
`page.evaluate('()=>redoLabOrder(id)')` ينتظر وعداً لا يُحسم إلا بنقرةٍ بالحوار ⇒ الحارسُ يتجمّد حتى المهلة. الحوارُ يُفتح بلا انتظار (`'()=>{fn(id)}'`) ثم يُنقر كما ينقر الطبيب. ومعه: عميلٌ مصطنع + `service_workers='block'` — وإلا خدم الـSW الحقيقيُّ المخزَّن مكتبةَ Supabase الحقيقية بعد أول تنقّل.

#### القاعدة #699 — كلُّ قراءة نافذةٍ زمنية تمرّ بجالبٍ مصفّح ⭐ سياق 291
حدُّ PostgREST 1000 صفّ للطلب يقصّ بصمت. قاعدة #630 كانت لـ«كل التاريخ»؛ لكن «هذه السنة» و«كل الفترات» والاتجاهُ 12 شهراً كلُّ التاريخ عملياً بعيادةٍ مشغولة — وكانت قراءاتُ التقارير والمحاسبة كلُّها بطلبٍ واحد (الإنتاجُ والتحصيل وكلُّ تبويبٍ فوقهما يقصر). كلُّ قراءةٍ بنافذة تمرّ بـ`_fetchAll*`/`_pagedAcc` (`order('id').range` بصفحات 1000، توقّفٌ عند الناقصة، الخطأُ يُرمى/يُرجَع لا يُبتلع) والفشلُ توستٌ لا صفر. **الإثبات بعميلٍ مصطنع يفرض الحدّ** (بدونه يمرّ الكودُ غيرُ المصفّح): السابقُ حمّل 1000 من 2500.

#### القاعدة #700 — شريطُ تنقّلٍ لا يُخفي عناصره بتمريرٍ أفقي بلا إشارة ⭐ سياق 291
`overflow-x:auto` + `scrollbar-width:none` على تبويباتٍ/أقسامٍ/شرائح = عناصرُ خارج الشاشة لا يعرف المستخدم بوجودها (صورةُ المالك: «ما طلع التبويب»). على الهاتف تلتفّ أو تصير شبكة (container query — #695). **ومراجعةُ المتصفح تقيس أن كلَّ عنصرٍ ظاهرٌ كاملاً بلا تمرير** — النقرُ الآلي يمرّر العنصرَ للرؤية تلقائياً فيُخفي العيب؛ والمسحُ المنصّي على 390 يبحث عن حاوياتٍ بعناصر خارجها.

#### القاعدة #701 — تبويبُ تقريرٍ جديد يقسّم جلسات المحرّك القائم ⭐ سياق 291
تقريرٌ فوق المال (العلاجات · الجدد · الملخّص) لا يعيد الجلب ولا الجمع بطريقته: يأخذ الجلساتِ نفسَها التي يرسم منها التبويبُ القائم (كلُّ جلسات الفترة أو `computeProviderStats(id).sessions` للأطباء الظاهرين) داخل `withCurrencyLayer`/`withCtx`، ويقسّمها فقط، والمثبتُ يطابق المجموعَ ببطاقات الأطباء بكل نطاق وطبقة. مجموعٌ يحتاجه سطحان يُستخرج لدالّةٍ واحدة يقرؤها الاثنان (`clinicTotals()`) — تطبيقٌ لـ#684.

#### القاعدة #702 — تعريفٌ واحد لكل مفهوم عبر التبويبات ⭐ سياق 291
«المريض الجديد» (أوّلُ علاجٍ منجز، لا تسجيل، ولا رصيدَ سابقاً قبله) و«الزيارة» (علاجٌ منجز لا مخطّط ولا رسم غياب ولا رصيد مُرحَّل) تُعرَّفان بدالّةٍ واحدة (`SyRptNew.pickNew` · `isVisit`) يستهلكها كلُّ تبويب (الجدد · الاحتفاظ · الملخّص) — فالرقمُ نفسُه بكل مكان («جدد 4» بالاحتفاظ = تبويب الجدد). والسياقُ الذي يُحكم منه يحمل الحقولَ التي يقرؤها التعريف (`type`/`description` بـ`priorCtx`).

#### القاعدة #703 — المقارنةُ بين فترتين ⭐ سياق 291
الأعدادُ والمبالغ بنسبةٍ مئوية، والنسبُ **بنقاطٍ مئوية** (60% ⇒ 43% = ▼ 17 نقطة لا ▼ 28%)؛ أكياسُ العملات تُقارن بالعملة الموجودة بالطرفين (دولارٌ ظهر حديثاً لا يعطّل مقارنة الليرة) و«بعملتين» حين تتعدّد؛ مقياسٌ سيّئ (غياب · مفقودون · مخبر) صاعدٌ أحمر وصعودُه من صفر «▲ من صفر» لا «جديد»؛ الغائبُ «—» لا صفر؛ والنسبةُ تُعرض من حدٍّ أدنى للعيّنة (3) وإلا «عيّنة صغيرة».

#### القاعدة #704 — كلُّ نسبةٍ وسهمٍ داخل نصٍّ عربي معزولٌ LTR ⭐ سياق 291
«26.9%» و«▲ 25%» و«+3» داخل سطرٍ عربي تنقلب («%26.9» · «%25 ▲» · «3+»). تُلفّ بـ`<bdi dir="ltr">` (أو `direction:ltr; unicode-bidi:isolate` على صنف الفرق)، والكلمةُ العربية المرافقة («نقطة») خارج العزل.

#### القاعدة #705 — التبويبُ الثانوي يُحمَّل كسولاً بحارس تسلسل ⭐ سياق 291
بياناتُ تبويبٍ غير ظاهر (أسماء · مواعيد · سنةٌ ماضية) لا تُجلب مع الصفحة (#687): تُجلب حين يُفتح التبويب، تُخزَّن بمفتاح الفترة، وتُسقَط مع كل تحميلٍ جديد للفترة؛ وكلُّ تحميلٍ يحمل رقمَ تسلسل فلا يرسم إلا الأحدث (تحميلٌ أبطأ لفترةٍ سابقة لا يطغى على اللاحقة).

#### القاعدة #706 — كلُّ قراءةٍ جماعية تمرّ بـ`window.SyDentFetchAll`، والجردُ آليّ ⭐ سياق 291 (v548)
تعميمُ #699 على المنصة: أيُّ `select` على جدولٍ جماعي (مرضى · مواعيد · جلسات · دفعات · توزيعات · ذمم · مخابر · مصاريف · سجلّات) بلا range/limit/single/head ولا قيدِ صفٍّ/مريض ولا `.in()` يُلفّ بـ`window.SyDentFetchAll(function(){ return <الاستعلام>; })` — بنّاءٌ جديد لكل صفحة (البنّاءُ قابلٌ للتغيير فلا يُعاد استعمالُه)، `id` كاسرُ تعادل بعد الترتيب الأصلي، والشكلُ `{data, error}` نفسُه. `prove-fetchall` يجرد كلَّ الملفات ويحمّر البوابة لأي قراءةٍ غير مصفّحة ليست بقائمة الاستثناء المسبَّبة (يومٌ واحد · مريضٌ واحد · مصفّحٌ يدوياً)، ويكشف الاستثناءَ البائت. الوحداتُ التي قد تُحمَّل بلا `supabase-init` (مثبتات) تستعمل `window.SyDentFetchAll || (b => b())`.

#### القاعدة #707 — «نقداً» شكلُ المال لا حسابُه؛ والإقفالُ لقطة ⭐ سياق 291 · تتمة 2 (v549 · M165)
طريقةُ الدفع (`payment_method`) تقول **كيف** دُفع المال، ولا تقول **من أيِّ صندوق** خرج. الخارجُ النقدي يحمل `cash_source` (`drawer` · `outside` · فارغ = `drawer` حفاظاً على كل صفٍّ قديم)، وقيدٌ بالقاعدة يمنعه على غير النقدي، والكتابةُ عبر `SyDentPayMethods.sourceForStore` (غيرُ النقدي ⇒ null). العمودُ يدخل **معادلةً واحدة**: «صافي الدرج نقداً» — المصروفُ والربحُ والذممُ والتقاريرُ لا تراه. المتوقَّعُ السالب علامةُ مصدرٍ خاطئ غالباً ⇒ تنبيهٌ ظاهر وتأكيدٌ صريح لا منعٌ (قد يكون بالدرج رصيدٌ سابق). `day_closings` لقطةُ مساءلة (المتوقَّع والمعدود لحظةَ الإقفال) **لا تتحدّث** بتعديل الدفتر بعدها — الكشفُ يُنبّه («تغيّر الدفترُ بعد الإقفال») والمالكُ يعيد الإقفال بيده.

#### القاعدة #708 — جلسةٌ موازية دفعت أثناء العمل ⭐ سياق 291 · تتمة 2
قبل الكومِت: `git fetch` ثم `git stash` → `pull --rebase` → `stash pop`، وحلُّ التعارض **بإبقاء عمل الآخر وإضافة عملك فوقه** (مثال v549: توكنُ الفليت الجديد + وسمُ `pay-methods.js` · `SyDentFetchAll` + عمودُ `cash_source`). ثم **البوابةُ كاملةً من جديد** ومثبتاتُ المتصفح على النسخة المدمجة، ورقمُ الإصدار والتوكنُ التاليان يُحسبان **بعد** الدمج (v548 أخذتها الموازية ⇒ v549).


#### القاعدة #709 — البطءُ يُقاس قبل أن يُصلَح: جولاتٌ لا زمنُ سيرفر ⭐ سياق 293
Chromium حقيقي بعميل Supabase مصطنع يؤخّر **كل طلب 400ms** (رحلة سوريا ↔ أوروبا) + **تتبّعُ مُطلِق كل طلب** (لفُّ `sb.from/rpc` بمكدّس الاستدعاء) قبل أي تعديل. القراءةُ الأولى («الإقلاعُ المشترك يحجب الصفحة») كانت خطأً صحّحه التتبّع: الإقلاعُ يعمل بالتوازي، والمسارُ الحرج **سلسلةُ كل صفحةٍ نفسها**. زمنُ السيرفر من سجلات `edge_logs` الحيّة (47ms). حارسُ `scripts/dom-smoke/perf-budget` يُبقي جولات كل صفحة تحت ميزانيتها، واختبارُه الذاتي يحقن سلسلةً متتالية فيحمرّ.

#### القاعدة #710 — الجلبُ المبكر يُستهلك بموضعه الأصلي ⭐ سياق 293
القراءاتُ المستقلة تُطلَق معاً قبل أول انتظار وتُغلَّف `settle` (`{r}|{e}`) ثم تُستهلك **بمواضعها الأصلية وبالترتيب نفسه** بـ`take` يُعيد رميَ الخطأ — فترتيبُ الرسم وفحوصُ الحجب ومعالجةُ الأخطاء كما كانت، ولا رفضَ غير ملتقَط. التبعياتُ داخل المجموعة تبقى متسلسلة. أيُّ تغيير بشكل القراءة المالية (`.in` ⇒ نطاقُ الطبيب المصفّح) يُثبَت بتكافؤٍ بـvm على الدالة الحيّة قبل الشحن.

#### القاعدة #711 — رسمٌ مقفولٌ ببوابة حين يسبق الجلبُ فحصاً أمنياً ⭐ سياق 293
إن بدأ الجلبُ قبل فحصٍ يقرّر العرض (الطبيبُ المعطَّل · فلترُ وضع الطبيب): **الرسمُ وحده** ينتظر البوابة؛ الفحصُ الفاشل يلغيه بلا رسم؛ أولُ نداءٍ عاديٍّ للنافذة نفسها يتبنّى الجلبَ المبكر؛ ونافذةٌ مختلفة تنتظر انتهاءَ القديم صامتاً ثم تجلب — فلا يكتب قديمٌ فوق أحدث.

#### القاعدة #712 — المراقبُ لا يُطلق نفسه، والعنصرُ المرافق مستثنى ⭐ سياق 293
`classList.remove` يكتب السمةَ **ولو بلا تغيير** ⇒ `MutationObserver` على `class` يتحقّق من وجود ما يُزال قبل أن يكتب (حلقةٌ جمّدت بطاقة المريض بالفحص). وكلُّ عنصرٍ يُنشئه مُعزِّزٌ عام (منتقي التاريخ المرافق) يُعلَّم ويُستثنى من الفحص والمراقب (حلقةٌ جمّدت المحاسبة). كلاهما أُمسك بمتصفحٍ حقيقي قبل الشحن.

#### القاعدة #713 — قواعدُ الصفحات تنطبق على العناصر المرافقة ⭐ سياق 293
قاعدةٌ صفحية على `input[type=date]` (عرض 100%) مطّت المنتقي الشفّاف فوق الحقل فمنعت الكتابة ⇒ العنصرُ المرافق يُحصر بـ`!important`. وحقلٌ LTR داخل صفحةٍ RTL يأخذ **مواضعَ فيزيائية** (left/right) لا منطقية. والقواعدُ القديمة المكتوبة لـ`type=date` تُوسَّع بمحدِّدٍ إضافي لا تُعدَّل (حارسٌ قد يقرأ نصَّها حرفياً).

#### القاعدة #714 — شاراتُ السلامة تُعرف بنصّها ⭐ سياق 293
«لا يُطوى أبداً» = التحذيرُ الطبي والحساسية و«انتظار» **بنصّها** — شاراتُ الالتزام والتذكير تبدأ بـ⚠️ أيضاً وليست سلامةً سريرية (لقطةُ المالك). منطقُ السقف بمصدرٍ واحد `SyDentBadgeCap` لكل الأسطح، ولا يُلمس بُناةُ الشارات المحروسون بالمرايا.

#### القاعدة #715 — مفتاحُ إعدادٍ جديد يقرؤه المستأجر = توسيعُ سياسة القراءة بالهجرة نفسها ⭐ سياق 293
تطبيقٌ ثانٍ للقاعدة #256: M167 أضافت `shamcash_account` ونسيت `p_platform_settings_tenant_read` فما كانت العيادةُ لتراه (أُصلح بـM168). كلُّ مفتاحٍ جديد يُفحص **كدور authenticated** بكتلةٍ متراجَعة قبل الشحن، لا بالمحاكاة وحدها (المحاكاةُ لا تطبّق RLS).

#### القاعدة #716 — فشلُ الشبكة ليس «غير موجود» ⭐ سياق 293
أيُّ شاشة خطأ تفرّق بين «لم يُعثر» و«تعذّر الاتصال» (رسالةُ الخطأ · `navigator.onLine`)، والثانيةُ تعرض «إعادة المحاولة». وما ينتظر الشبكةَ طويلاً (قراءةٌ دون اتصال لا تُحسم) يقول ذلك بعد مهلة بدل هيكلٍ صامت.

#### القاعدة #717 — التنبيهاتُ الآلية إشارةٌ لا سجلّ ⭐ سياق 293
قاعدةُ تنبيه لا تُطلَق على أفعال المالك نفسه، ولا تتكرّر لكل حدثٍ بعد العتبة (مرةً لكل مجموعة، صامدةً أمام الإدراج الجماعي بالطابع نفسه)؛ السجلُّ نفسُه لا يتغيّر. تنظيفُ القديم **أرشفةٌ لا حذف**. الـtriggerُ الحيّ يُطابَق بالمستودع ببصمة (md5 بعد نزع التعليقات) ومرآة `db/schema.sql`.

#### القاعدة #718 — حركاتُ المخزون عبر RPC ذرّي، والثابتُ بتريغرين ⭐ سياق 294
أيُّ تغييرٍ متكرّر لكمية صنف (الخصمُ بعد الجلسة · «انتهت» · اعتمادُ الجرد · الاستلام) يمرّ بدالّةٍ واحدة بالقاعدة (SECURITY INVOKER ⇒ RLS وبوابةُ الاشتراك سارية) تقفل صفوفَ الأصناف **بترتيب `item_id`** (لا تشابك بين شاشتين) وتكتب الحركة والدفعة والكمية بخطوةٍ واحدة — لا قراءةَ-ثم-كتابةٍ من المتصفح. ثابتُ «الدفعاتُ المفتوحة ≤ الكمية» يُفرض بتريغرين: حارسُ الدفعة يرفض النموّ فوق الكمية، وتريغرُ الصنف يقصّ الدفعات FEFO عند أي إنقاصٍ من مسارٍ آخر ⇒ النسخُ المخزّنة القديمة تصمد بلا كسر (امتدادُ #693).

#### القاعدة #719 — رتبةُ `ORDER BY` تُحدَّث مع كل عمودٍ يُضاف للـSELECT ⭐ سياق 294
`ORDER BY 1, 4` كان رتبةَ `ordinality`؛ إضافةُ `batch_id` قبله جعلت 4 تشير لعمودٍ آخر بصمت. كلُّ تعديلٍ لدالّةٍ قائمة يُراجع الرُّتب الرقمية، والمثبتُ يقرأ الرتبةَ الصحيحة (طفرة «الرتبة الخطأ»).

#### القاعدة #720 — جدولٌ مملوك جديد = RLS المالك + `_sub_guard_table` + حارسُ ملكية — بنفس الهجرة ⭐ سياق 294
لا نسخَ يدويةً لسياسات بوابة الاشتراك (الحارسُ يعدّ الجداول ويقرأ الدالّة المشتركة)، وكلُّ عمود ربطٍ (حتى لجدولٍ آخر بالجولة نفسها، أو لـ`expenses`) بحارس ملكية BEFORE INSERT/UPDATE OF (#694). الفحصُ الحيّ: مالكٌ ثانٍ لا يرى ولا يكتب، وحسابُ القراءة يُرفض بكل RPC.

#### القاعدة #721 — رابطُ المال العميق: المبلغُ من القاعدة، والربطُ بعد الحفظ مرةً واحدة ⭐ سياق 294
«💸 سجّلها مصروف» يمرّر معرّفَ الاستلام والعملةَ فقط؛ صفحةُ المصاريف تقرأ المبلغَ والمورّدَ من القاعدة وتعبّئ ولا تحفظ (#690)، والحفظُ مسارُها القائم وحده، ثم يُربط الاستلامُ بعمود عملته **ما دام فارغاً** (`.is(col, null)`) ⇒ لا فاتورةَ مرتين؛ والإغلاقُ أو إضافةٌ جديدة تفكّ الربط.

#### القاعدة #722 — نقلُ حسابٍ مالي لملفٍّ مشترك يُثبَت بمرجعٍ للمعادلة السابقة ⭐ سياق 294
حين تُنقل صيغةٌ مالية لوحدةٍ مشتركة (`mat-cost.js`)، المثبتُ يحمل الصيغةَ السابقة مرجعاً ثابتاً ويقارن على مئات العيّنات العشوائية بتطابقٍ حرفي، ويثبت أن كلَّ تفصيلٍ (صنف · علاج · طبيب) يحفظ المجموعَ لكل عملة (امتدادُ #684).

#### القاعدة #723 — ورقةُ المورّد بلا أسعار، والطباعةُ متزامنةٌ داخل النقرة ⭐ سياق 294
ما يُرسل للمورّد (واتساب · نسخ · طباعة · Excel) يحمل الأصنافَ والكميات فقط؛ الكلفةُ التقديرية لكل عملة تُعرض للطبيب داخل النافذة. `window.print()` يُستدعى بلا `await` قبله (iOS)، بجذر طباعةٍ مستقل وفئةٍ على `body` تُزال بـ`afterprint` (نمطُ lab-slip).

#### القاعدة #724 — الأشهرُ رقمية حتى بالتقارير ⭐ سياق 294
قرارُ v487 («التاريخ بس أرقام») يشمل عناوينَ الأشهر بالجداول: `09/2026` لا «أيلول 2026». أسماءُ الأشهر محصورةٌ بعناوين التقويم (`check-sydt`).

#### القاعدة #725 — مخلّفاتُ البوابة لا تُكومَت ⭐ سياق 294
`validate.sh` يترك `_ra/` (لقطاتُ مراجعة أزرار الصفوف) بالشجرة ⇒ لا `git add -A` بعده؛ أضف الملفاتِ بأسمائها أو احذف `_ra/` قبل الكومِت. كومِتٌ حملها مرّةً أُعيد بـ`reset --soft` قبل الدفع.

#### القاعدة #726 — بوابةٌ انقطعت ليست نتيجة ⭐ سياق 294
سجلُّ `validate.sh` بلا سطر `EXIT` (انتهت الرسالةُ أو المهلة وهو يعمل) لا يُعتدّ به: تُعاد البوابةُ كاملةً على الشجرة النهائية قبل الدفع، ويُذكر ذلك بالرد.

### قواعد معرّفة داخل فقراتٍ مشتركة

**(#175)**
**[أ — بناء الكتالوج من الحيّ لا من الصور (`18b800c`)]:** الصور لا تُظهر `treatment_key` ولا الألوان الدقيقة ولا `category`/`needs_lab`/`layman_name` ⇒ طُبِّقت **قاعدة #19**: تصدير JSON فعلي من `public.treatments` للحساب المرجعي `drayhamghnaim2@gmail.com` بكل الحقول مرتَّباً بـ`sort_order` (**24 صفاً**)، ثم **توليد كود الـJS برمجياً من الـJSON** (صفر نسخ يدوي). حُذفت `EXTRA_TEMPLATES`(6) و`DEFAULTS`(10) واستُبدلتا بمصفوفة واحدة **`CLINIC_CATALOG`** (24 صفاً · `price:0` على كلٍّ · `sort_order` صريح 1..24 verbatim). و`buildDefaultTreatmentRows()` صارت سطراً واحداً بلا أي إعادة فرز — **حُذف منطق `isProtectedTreatment` sort + `_orderOf`** لأن اشتقاق الترتيب كان يخالف ترتيب العيادة المرجعية (يقدّم المحميّة للأعلى). `insertMissingDefaults`/`resetToDefaults`/`autoSeedDefaultsIfNeeded` **بلا مساس** ⇒ قاعدتا #141/#175 سارية: الاستعادة إضافية لا تدميرية.

**(#184 · #185 · #186)**
v94 (سابقة) — المحور ٣ (أمان الإطلاق) — البند ١ (دوران الأسرار) — HEAD 88161d1 على main (فوق d4a3daf)، commit واحد 88161d1، صفر migration (التالي 71)، صفر cache-bust
   • السياق: خطة 6 محاور لـ«نام مرتاح وأنت تاركه» (تشغيلية لا ميزات): ١ تعافي ✅ · ٢ مراقبة ✅ · ٣ أمان إطلاق 🔄 (هون) · ٤ نظافة معروف · ٥ أتمتة · ٦ توثيق/bus-factor. خطة المحور ٣ = 3 بنود مرتّبة بالأولوية: (١) دوران أسرار [بند هذه الجلسة] (٢) CAPTCHA (٣) custom SMTP/تدرّج DMARC.
   • (أ) حذف workflow يتيم (commit 88161d1): كان .github/workflows/.github/workflows/update.yml — مسار متداخل خطأ فGitHub Actions لا يشغّله إطلاقاً (ميت)، لكنه لو انتقل/شُغّل يدوس index.html بنسخة mock قديمة جداً («rename DentSyr to SyDent»). وكان المستهلك الوحيد لسرّ PAT_TOKEN. حذف ملف واحد، صفر مساس بالـ3 workflows الحقيقية (backup/deploy/keep-alive).
   • (ب) PAT جديد least-privilege: التوكن القديم Syrdent-token (ينتهي 22 تموز 2026، كان admin على 4 ريبوهات) → بُدّل بـSyDent-dev: SyDent فقط · Contents R&W + Workflows R&W + Metadata R · ينتهي 2027-06-23. مُتحقَّق حياً (clone + dry-run push ✅). بُدّل بملف السياق هذا (هو التوكن الجاري الآن، بقسم 🔑 GitHub PAT أدناه).
   • (ج) حذف سرّ PAT_TOKEN من GitHub → الأسرار صارت 7: BACKUP_PAT / R2_ACCESS_KEY_ID / R2_ACCOUNT_ID / R2_SECRET_ACCESS_KEY / SUPABASE_DB_URL / SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY.
   • ⏳ معلّق من البند ١: (1) حذف التوكن القديم Syrdent-token من GitHub — مؤجّل لبعد أول push حقيقي بالجديد (بند CAPTCHA) للتأكد عملياً قبل سدّ الباب على القديم. (2) تدوير مفاتيح S3/R2 (ظهرت بسكرينشوتات جلسات سابقة) — مؤجّل لقُبيل الإطلاق بقرار المالك: كله تجريبي صفر عميل حقيقي → المخاطرة نظرية (أسوأ حالة: وصول لنسخ تجريبية بـbucket sydent-backups فقط، لا بيانات إنتاج). ⚠️ تدوير شامل للأسرار (S3/R2 + أي سرّ ظهر) = إلزامي قبل أول عميل حقيقي.
   • التالي: البند ٢ (CAPTCHA) — Cloudflare Turnstile (مجاني، محترم للخصوصية، منسجم مع Cloudflare Pages) → تفعيل بـSupabase Auth Dashboard + wiring widget بـauth.html (signup). ثم البند ٣ (custom SMTP/تدرّج DMARC — Resend مُعدّ مسبقاً، الافتراضي محدود). ثم المحاور ٤ نظافة (Migration 70 المعلّقة + تطبيق/live-test + H-bundle: H2 XSS أولاً + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد بدل يدوي ×21 + حُرّاس 4-copy mirror) · ٦ توثيق موحّد للنشر/الاستعادة/الأسرار (bus factor).
   • قواعد جديدة #184–#186. #184 (تدوير PAT least-privilege): fine-grained + ريبو واحد فقط + Contents&Workflows R&W لا أكثر + انتهاء سنة لا «بلا انتهاء»؛ تحقّق حي بـclone + dry-run push قبل الاعتماد؛ بدّل القيمة بملف السياق فوراً؛ Workflows R&W ضروري لأنّ النشر يلمس ملفات .github/workflows. #185 (workflow يتيم/متداخل = لغم): ملف تحت مسار .github/workflows متداخل لا يُشغَّل لكنه خطير لو نُقل/شُغّل؛ احذفه + احذف أي سرّ صار بلا مستهلك بعده. #186 (تأجيل تدوير الأسرار لقُبيل الإطلاق): مقبول حين كله تجريبي بلا عميل حقيقي (مخاطرة نظرية)؛ تدوير شامل إلزامي قبل أول عميل حقيقي (checklist الإطلاق).

**(#186 · #214 · #215)**
🆕 v111 — جلسة التصليب الأمني + إغلاق الاختبارات الحيّة + تحديث التوثيق (٥ تموز) — HEAD 1a2f578 (كود، فوق 70886ef) + 29d996c (توثيق)، صفر migration/مالي/RLS/cache-bust، book.html بلا مساس (مستثنى من X-Frame-Options)، live-tested ✅
   • تدقيق شامل بداية الجلسة: 92/100 — جاهزة للبيتا المضبوطة (2-4 عيادات أصدقاء)
   • (أ) تصليب أمني ثلاثي (1a2f578، كومِت واحد فوق 70886ef): (١) تعقيم ألوان الـDB — الثغرة الرئيسية (#218): ألوان العلاجات كانت تُحقن خام بسمة style بـ3 صفحات (appointments/treatments/patient-profile)؛ سكرتيرة تحقن payload كسر-style عبر API متجاوزةً SyDentLock فينفّذ بجلسة المالك → helper _sanHex (قائمة سماح hex، fallback #0d8577) عند نقطة تحميل العلاجات لا عند الرندر؛ النُسخ الثلاث متطابقة md5 432a3c1a؛ node يصدّ 10/10 حقن. (٢) escapeHtml بـpatient-profile:8608 تهرّب الاقتباس المفرد ' (المجموعة الكانونية كاملة). (٣) ملف _headers جديد (Cloudflare Pages): X-Frame-Options DENY (book.html مستثنى ليبقى قابلاً للتضمين) + nosniff + Referrer-Policy + HSTS + Permissions-Policy؛ بلا CSP صارمة عمداً (تحتاج ضبط نطاقات دقيق، خطأ يكسر بصمت)
   • (ب) إغلاق اختبارات حيّة معلّقة (بصور المالك): إنهاء المراقبة (سيناريوهان — ✕ بالبانر يقلب الحالة condition→existing_other ويُبقي اللون #214؛ تهدئة per-watch تُخفي القائم وتُظهر الجديد عبر teeth_status_history changed_at>recalled_at #215) + Bug #1 Income Transfer (live: تجريبي منجز0/مدفوع50k/مقدّم50k → رسم عدم حضور 15k → منجز15k/مدفوع50k/مقدّم35k، حفظ 15+35=50 مثالي، الرصيد غطّى الرسم تلقائياً؛ applyNoShowFee→reallocateAfterNoShowFee مرآة reallocatePatientFunds؛ محاكاة node 11/11؛ كومِت b911c94 القديم غير موجود، الفعلي «Bug #1 fix Phase X6»). 🏆 كل الاختبارات المعلّقة أُغلقت (H-bundle كان مقفولاً بالكود الحي)
   • (ج) تحديث التوثيق: وثيقتا التسليم AR+EN (edaac39→1a2f578: HEAD + 66 SQL + M78 + المحور ٣ تصليب + قائمة إلزامي محدّثة + Bug#1/المراقبة DONE + #218 + #1–#218) + PDF مُعاد (WeasyPrint 69 + Noto Naskh 8 صفحات) — كلها مُلتزَمة بالريبو 29d996c · ملف المنصة الشامل (خارج الريبو): أُصلح PAT ميت مكشوف بالقسمين 0.2/0.3 (Syrdent-token القديم المحذوف v96) + تنبيه قِدَم يوجّه لوثيقة التسليم — downloadable
   • قبل أول عميل مدفوع (تشغيلي، صفر كود): تدوير S3/R2 #186 (أهم بند) + BACKUP_PAT expiry + تدرّج DMARC + restore-test (~ساعة، موثّق بدليل DR) + تحقّق curl لرؤوس _headers بعد نشر Cloudflare + resolve SYDENT-WEB-1 بـSentry + suspend خدمات Render/Vercel اليتيمة
   • HEAD 1a2f578 (كود) + 29d996c (توثيق) · فليت 20260703a بلا تغيير · migrations بلا تغيير (74–78 مطبّقة ✓، التالي 79) · قاعدة جديدة #218 · بنية جديدة: ملف _headers بجذر الريبو

**(#187 · #188)**
v95 (سابقة) — جلسة إصلاحات (سجل تدقيق + UX) — HEAD e69a403 على main (فوق 88161d1)، commitان ec20764→e69a403، صفر migration، cache-bust 20260622a→20260624a
   • (أ) إصلاح سجل التدقيق (commit ec20764، live-tested ✅): 4 استدعاءات logAudit بـpatient-profile.html (روشتة + تعليمة post-op، إنشاء/حذف) كانت بصيغة underscore (prescription_created إلخ) فتُرفض بالفحص الصارم !includes('.') الذي يعمل return قبل الـinsert → الأحداث لم تُكتب بـaudit_log إطلاقاً. + كانت تمرّر توقيعاً positional خاطئاً بدل logAudit(actionType, opts). صُلّحت لصيغة نقطة + opts-object مُغنى بـpatientId/patientName + إضافة prescription./postop_note./adjustment. لـVALID_ACTION_PREFIXES بـsupabase-init.js. cache-bust فليت 20260622a→20260624a (20 ملف، book.html مستثناة، قاعدة #21).
   • (ب) 3 تحسينات UX (commit e69a403، HTML-only، صفر أصل مشترك → بلا cache-bust، live-tested ✅): (1) audit-log.html زر ✕ يخفي بانر التنبيهات الذكية، dismissAlerts() تخزّن آخر تنبيه بـlocalStorage (مفتاح per-owner)، يبقى مخفياً عبر reload لكن يرجع مع تنبيه أحدث. (2) admin.html بطاقة العميل الجديد .req-card.new كانت غير مرئية باللايت (صبغة --yellow-dim فوق --bg2 أبيض) → override خاص بالـlight (:root[data-theme=light]) بحد #ea580c + خلفية برتقالية، بلا مساس بـtheme.css المشترك، الدارك ثابت. (3) doctors.html إخفاء زر التعديل عن بطاقة المالك (editBtn = d.is_owner ? '' : <زر>) — اسم المالك مُزامَن من auth فالتعديل بالبطاقة كان يُدهَس.
   • قواعد جديدة #187 (logAudit بصيغة نقطة + بادئة بالقائمة + توقيع opts-object؛ الفحص الصارم يفقد الحدث صامتاً) + #188 (override خاص بثيم بخصوصية أعلى داخل ملف الصفحة = يغلب الأساس بلا cache-bust؛ افحص --bg2 لكل ثيم قبل شدّة الصبغة).
   • التالي (المحاور المتبقّية من «نام مرتاح»): المحور ٣ أمان الإطلاق — البند ٢ CAPTCHA (Cloudflare Turnstile) ثم البند ٣ custom SMTP/DMARC · المحور ٤ نظافة (Migration 70 المعلّقة + تطبيق/live-test + H-bundle: H2 XSS + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor).

**(#188)**
🆕 v100 — تلميع لوحة التحكم: لوغو السايدبار + ألوان/منطق «نبض اليوم» — HEAD 669bee3 على main (فوق 150d5a8)، 4 commits 428f275→04b9480→52da9f1→669bee3، صفر migration/مالي/RLS/بنية، sidebar.js cache-bust 20260630a→20260630b (16 ملف)، index.html تعديلات inline (بلا ?v=)، live-tested ✅ كله
   • السياق: جلسة تلميع UI بحتة بطلب المالك عبر سكرينشوتات متتالية. صفر مساس بالمنطق المالي/RLS/البنية. قبلها commitان غير موثّقين بـv99 (وُثّقا الآن): e35e6fa (payouts/inventory full-width مثل expenses — إزالة max-width لصالح flex:1) + 150d5a8 (إلغاء تفعيل البطاقة المرتبطة لكل الأدوار السريرية عند حذف الموظف + تنظيف DB لـ11 صف clinic_doctors يتيم + 2 payouts تجريبية، scoped للمالك 9d2956…).
   • (أ) اللوغو — sidebar.js (.sb-logo-icon، commitان 428f275 ثم 669bee3): المالك أراد إزالة المربع الأخضر (خلفية #d6f0e0 + بوردر + radius 10px) وإظهار رسم السن فقط أكبر → 428f275 شال المربع وكبّر السن 28→40px والحاوية 38→44px. ثم «السن طاير بالهوا» → 669bee3 أضاف إطار مربع border-only (1.5px solid rgba(var(--green-rgb),0.28) + radius 12px) بلا خلفية، الحاوية 44→46px، السن 40→34px (هامش داخل الإطار). السن نفسه SVG fill ثابت #1ed99a (لم يتغيّر). auth.html لوغوها أصلاً بلا مربع (متّسق). admin.html sidebar مستقل (غير متأثّر). cache-bust فليت sidebar.js 20260622a→20260630a→20260630b على 16 ملف يستدعيه (ليست كل الـ22 — admin/auth/landing/book/pending/reset لا تستدعي sidebar.js).
   • (ب) منطق «نبض اليوم» — index.html renderDashPulse (04b9480، سطر ~2197): كان (a.seated_at||a.arrived_at)→dp-live (أخضر) للاثنين → فُصلا ليطابقا تعريف «غرفة الانتظار» بالكود (arrived_at NOT NULL AND seated_at NULL، أسطر 1971/1999-2000): seated_at→dp-live (أخضر/جاري الآن)، arrived_at بدون جلوس→dp-wait (برتقالي/بانتظار). الترتيب النهائي: cancelled/no_show/broken→dp-x · dismissed_at/completed→dp-done · seated_at→dp-live · arrived_at→dp-wait · confirmed→dp-conf · else→dp-wait. الجذر لـ«البرتقالي ما يطلع»: الحالة الافتراضية لأي موعد = confirmed (appointments.html fStatus سطر 4712) + بوابة الحجز P5 (التي تخلق pending) غير حية → لا موعد يصل dp-wait؛ + الهيكس القديم #d97706 غامق على الكحلي.
   • (ج) ألوان «نبض اليوم» أقوى بالدارك (04b9480، CSS سطر ~614-618): حُوّلت الألوان الأربعة لمتغيّرات CSS (--dp-done/--dp-conf/--dp-wait؛ --dp-live=var(--green)) بقيم :root الفاتحة = الأصلية تماماً (صفر تغيير على اللايت) + override :root[data-theme="dark"]: بانتظار #d97706→#f59e0b، مؤكد #3b82f6→#5b9dff، مكتمل #94a3b8→#aab6c9. نقاط الـlegend بُدّلت من هيكس inline لـvar(--dp-*) فتبقى مطابقة للكتل بالمودين تلقائياً. لا تعارض اسم --dp-* (تحقّق grep قبل).
   • (د) تباين شباك «نبض اليوم» بالدارك (52da9f1): خلل حقيقي — بالدارك خلفية الكرت (--bg-card=--bg3=#132840) ونفس الـtrack (.dp-track=--bg3) لون واحد بالضبط → الشباك مخفي (بس البوردر الأخضر الخفيف يفصل). باللايت لا مشكلة (كرت أبيض --bg2=#fff vs track رمادي --bg3=#edf2f7). الحل (دارك فقط، override بخصوصية أعلى :root[data-theme="dark"] #dpCard .dp-track): خلفية #0c1d33 (أغمق من الكرت = شباك غاطس) + border-color rgba(46,232,158,0.30) + box-shadow inset 0 1px 4px rgba(0,0,0,0.4) عمق. الـbase (.dp-track) ما زال var(--bg3) فاللايت سليم.
   • فحوص كل commit: validator inline (vm.Script على بلوكات JS index الداخلية = 3 بلوكات، 0 أخطاء) + node vm.Script على sidebar.js + secrets scan نظيف + تأكيد diff (كل HTML سطر cache-bust واحد فقط؛ sidebar.js/index.html التعديلات المقصودة فقط) + توازن وسوم SVG (svg/g/path 1/1/2). live-tested كله ✅ (عبدو شحرور بغرفة الانتظار→برتقالي، ابلغ جالس→أخضر؛ شباك الدارك بان واضح؛ اللوغو بإطار أنيق).
   • صفر قواعد جديدة (جلسة تلميع). مبادئ مطبّقة: Rule #19 (live-test أرّخ كل خطوة + كشف أن «اللون الواحد» كان بيانات لا خلل) + Rule #21 (cache-bust فليت للأصل المشترك sidebar.js؛ index.html inline بلا ?v=) + #188 (override بخصوصية أعلى داخل ملف الصفحة يغلب بلا cache-bust — طُبّق على dp-* dark vars + dp-track dark) + فحص --bg2/--bg3 لكل ثيم قبل الحكم على التباين.
   • التالي (بلا تغيير عن v99): المحور ٤ تتمّة نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor) · تدوير S3/R2 إلزامي قبل أول عميل حقيقي (#186) · البند ٣ custom SMTP (Resend) + تدرّج DMARC.

**(#189 · #190 · #191)**
🆕 v96 — المحور ٣ (أمان الإطلاق) — البند ٢ (CAPTCHA) مكتمل + live-tested end-to-end + حذف Syrdent-token + توثيق خط المخزون — HEAD 3992bf6 على main (فوق f7b10ff)، commit واحد 3992bf6 لهذه الجلسة فوق خط مخزون من 6 commits، آخر migration FILE 72 (التالي 73)، cache-bust 20260624a (بلا تغيير)
   • السياق: خطة 6 محاور لـ«نام مرتاح وأنت تاركه»: ١ تعافي ✅ · ٢ مراقبة ✅ · ٣ أمان إطلاق 🔄 (البند ١ دوران أسرار ✅ + البند ٢ CAPTCHA ✅ هون؛ يبقى البند ٣ custom SMTP/DMARC) · ٤ نظافة · ٥ أتمتة · ٦ توثيق/bus-factor.
   • (أ) CAPTCHA — Cloudflare Turnstile (commit 3992bf6، live-tested ✅): Supabase Captcha toggle عام يطال كل auth endpoints لا signup فقط → wiring بـ4 نقط: auth.html (signInWithPassword الدخول + signUp + resetPasswordForEmail) + settings.html (signInWithPassword إعادة التحقق قبل حذف الحساب). widget «SyDent» Managed hostname sydent.app. Site Key علني 0x4AAAAAADr7FjcBLQHJKhcS بالكود؛ Secret بلوحة Supabase فقط (Attack Protection → Turnstile، مفعّل). helper مشترك بالـhead (مُعرَّف قبل api.js غير المتزامن) يكشف requestTurnstile/getTurnstileToken/resetTurnstile على خريطة name→widgetId + explicit render (login مزروع، register/forgot/delete كسول عند الإظهار) + token single-use → reset بعد كل محاولة (finally للنماذج المرئية). 4 حاويات cf-turnstile-box. صفر asset مشترك → بلا cache-bust؛ book.html لم يُمسّ.
   • اكتشاف حاسم (Rule #19): ملف v94/v95 افترض HEAD 88161d1/e69a403 لكن main الحقيقي كان f7b10ff (خط مخزون نزل بعد 25/6) — كُشف عند فشل أول push (rejected) → reset --hard origin/main + إعادة تطبيق نظيفة فوق الـHEAD الحقيقي بـtoken 20260624a.
   • مختبَر حياً: widgets ظهرت + «✓ Success»؛ managed أحياناً يطلب checkbox «Verify you are human» (سلوك Cloudflare طبيعي حسب المخاطر، لا خلل)؛ reset-password نجح end-to-end بعد تفعيل Supabase (التوكن انقبل سيرفرياً = إثبات).
   • (ب) حُذف Syrdent-token القديم (تم بعد نجاح أول push بـSyDent-dev) → بقي SyDent-dev (Jun2027) + sydent-backup (⚠️ بلا انتهاء — يُرجَّع least-privilege بالمحور ٤).
   • (ج) خط المخزون موثّق (6 commits bc1ac6e→f7b10ff، كله inventory.html + migrations، صفر cache-bust): Migration 71 (inventory_items.expiry_date DATE + تنبيهات قرب الانتهاء) + Migration 72 (جدول inventory_batches per-shipment FEFO + RLS batch_owner_all + هجرة expiry لمرة واحدة) — طبقة عرض/تنبيه لا تمسّ منطق الكميات + دليل إدخال مواد + ملاحظة عزل المخزون عن المحاسبة.
   • قواعد جديدة #189 (Supabase Captcha toggle عام يطال كل auth endpoints → wiring بكل نقاط النداء؛ اختبر بـCAPTCHA مطفي ثم فعّل لتجنّب نافذة عمياء) + #190 (Turnstile helper: مُعرَّف قبل api.js غير المتزامن + explicit render مزروع/كسول + token single-use reset بعد كل محاولة + Site Key بالكود/Secret بالسيرفر + صفر asset مشترك → بلا cache-bust) + #191 (طبقة مخزون مساعدة inventory_batches FEFO منفصلة عن منطق خصم الكميات على inventory_items.quantity → إضافية آمنة بلا مساس مالي/كمّي).
   • ⏳ معلّق/التالي: حالة تطبيق Migrations 70/71/72 تُتحقَّق (70 معلّقة من v90؛ 71/72 ملفات جديدة) · تدوير S3/R2 إلزامي قبل أول عميل حقيقي (Rule #186) · البند ٣ custom SMTP (Resend) + تدرّج DMARC · المحور ٤ نظافة (sydent-backup PAT بلا انتهاء → least-privilege + H-bundle H2 XSS + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor).

**(#192 · #193)**
🆕 v97 — ربط المريض بطلب الحجز (Match-or-Create) عند تأكيد الطلب + بمسار التعديل — HEAD 9664ed3 على main (فوق 6a5388e = docs developer-handoff غير موثّق، watch-point #15)، commitان da70382→9664ed3، صفر migration/مالي/cache-bust، book.html بلا مساس، live-tested ✅ كل السيناريوهات، appointments.html فقط
   • المشكلة: تأكيد طلب لمريض جديد كان يحفظ بـpatient_id=null (الاسم لا يطابق بطاقة) → التذكير «لا يوجد رقم» رغم أن الطلب يحمل رقماً؛ والمريض القديم بدّو ربط الطلب ببطاقته. الجذر: confirmBookingRequest تضع الهاتف بالملاحظات نصاً فقط + submitAppt تحلّ patient_id بمطابقة اسم (.eq('name').maybeSingle() — null للجديد، تفشل صامتاً للمكرّر).
   • (أ) da70382: صندوق #bookingResolveBox بعد fPatient (مخفي افتراضياً) → bookingResolvePatient(req) يكشف تكرار بالرقم المطبّع ثم الاسم → 🔗 اربط بمطابقة + ➕ إنشاء بطاقة (اسم+هاتف الطلب) + بحث ربط بموجود + ↪️ بدون بطاقة. الـid يُخزَّن بـ_bookingConfirmCtx.patientId وsubmitAppt تفضّله على مطابقة الاسم (يقفل هشاشة الأسماء المكرّرة، نمط OpenDental link-by-id). INSERT يطابق patients.html (local_id max-seq، dob:null/gender:''/payment:متبقي/status:جديد/last_visit:today) + logAudit('patient.create') + تحديث patientsCache فوراً. كل الأزرار type=button (فخ <form onsubmit=submitAppt> + saveBtn type=submit) + حقل البحث يمنع Enter. openModal يخفي الصندوق + closeModal يصفّره.
   • (ب) 9664ed3: editAppt يعرض نفس الصندوق لما a.patient_id فاضي (الهاتف من الملاحظات «📞» بـregex) → الربط/الإنشاء يُحفظ عند «حفظ التعديلات» عبر submitAppt UPDATE (apptData.patient_id)؛ المواعيد ذات البطاقة → الصندوق مخفي وctx بلا مساس؛ يُعاد استخدام _bookingConfirmCtx بـid:null فالـINSERT-hook bookingMarkConfirmed لا يشتغل بالتعديل.
   • (ج) قرار مؤكَّد من المالك (Rule #194): الربط بمريض موجود → الموعد/التذكير يأخذ رقم البطاقة (resolvePatientPhoneForAppt عبر patient_id)، لكن صف booking_requests يبقى بالرقم/الاسم الأصليين كما سُجّلا بالبوابة (سجل intake ثابت، يوثّق مَن حجز — حالة عبدو شحرور→بطاقة تجريبي). سلوك صحيح ومقصود، صفر تعديل (نمط Dentrix/CareStack).
   • قواعد جديدة #192 (match-or-create + link-by-id، صندوق بالتأكيد والتعديل) + #193 (أزرار ديناميكية داخل <form onsubmit> لازم type=button + Enter-guard للحقول) + #194 (booking_requests سجل intake ثابت لا يُدهَس عند الربط؛ رقم البطاقة للتذكير ورقم الطلب للسجل). watch-point #15 (handoff 6a5388e موثّق-ذاتياً غير مسجّل بالسياق).
   • التالي (المحاور المتبقّية من «نام مرتاح»): المحور ٣ — البند ٣ custom SMTP (Resend) + تدرّج DMARC · المحور ٤ نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72 + H-bundle H2 XSS + live-test شريط offline) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor). فكرة اختيارية: عرض «🔗 مربوط ببطاقة: X» جنب الطلب بتبويب طلبات الحجز.

**(#196 · #197)**
🆕 v99 — إصلاح إسناد تكلفة المخبر للطبيب المعالج (lab cost provider attribution) — HEAD 8ac2e40 على main (فوق 838d1b7)، Migration 73 مطبّقة ✓، 3 commits 080e1ca→bfea1b2→8ac2e40، صفر مساس مالي بنيوي، صفر cache-bust (صفحات inline + migration)، live-tested ✅
   • المشكلة (المالك): تكلفة المخبر لمجد بركة صحيحة بنافذة الشهر لكن «تقفز» للمالك أحمد بنوافذ أخرى/أوسع (الإجمالي محفوظ دائماً). الجذر: lab_orders بلا عمود طبيب معالج (فقط doctor_id=المالك) → التقارير تستنتج الطبيب بـheuristic (مطابقة المخبر بجلسة لنفس المريض+السن ±90 يوم مرساتها sessions المفلترة بالنافذة) → جلسة الطبيب الحقيقي خارج النافذة فيلتصق المخبر بجلسة المالك داخلها. نفس الـheuristic بـprovider-reports وaccounting.
   • القرار (نمط OpenDental labcase.ProvNum، تأكّد بالبحث): provider_id صريح على lab_orders معبَّأ من الموعد لحظة الإنشاء، لا استنتاج بالعرض + توحيد نافذة المخبر على date_sent (cash-basis) فالتقريران متطابقان. خيار المالك: حذف الطلبات التجريبية غير المُسند بدل backfill-بالمطابقة.
   • Migration 73 (73_lab_orders_provider_id.sql، مطبّقة ✓): ADD COLUMN provider_id UUID REFERENCES clinic_doctors(id) ON DELETE SET NULL + index idx_lab_orders_provider_id + backfill من appointments.provider_id. النتيجة: 14 طلب → غير مُسند 10 (1,231,000)، أحمد 2 (45,666)، مجد 2 (25,000) — أكّد أن 540k القديم وهمي من الـheuristic. ثم DELETE للـ10 غير المُسند (تجريبية).
   • (أ) 080e1ca (M73 + 3 ملفات): labs.html (dropdown «الطبيب المعالج» + auto-fill من الموعد + resolution اختيار>موعد>null) · provider-reports.html (استبدال heuristic بـproviderLabCost(provId)=Σ cost حيث provider_id===provId أو !provider_id لغير المُسند؛ نافذة date_sent + timezone + استثناء rejected؛ توزيع نسبي بالتفاصيل/الطباعة) · accounting.html (نفس الإسناد بـcomputeOneProviderRow + bucket غير مُسند/محذوف؛ providerIdsInData يشمل lab providers؛ Test E يتشدّد لمساواة، Tests A–D بلا مساس).
   • (ب) bfea1b2 (إكمال patient-profile.html — المسار الرئيسي «+ طلب جديد» و«حفظ + إرسال لمخبر»): كان لا يحفظ provider_id إطلاقاً (الحقل+populate+sync بالـworking tree لكن غير مربوطين بالحفظ) → saveToothAndOpenLab يمرّر pendingProviderId (طبيب الجلسة) + editLabOrder populate/fallback من الموعد + _saveLabOrderInner يقرأ labOrderProvider ويكتب provider_id (اختيار>موعد>null) + graceful fallback معمّم.
   • (ج) 8ac2e40 (توحيد): labs.html editLabOrder يطابق patient-profile — الطلب القديم بلا provider_id مربوط بموعد يتعبّأ من الموعد بدل «غير مُحدّد».
   • مراجعة شاملة نهائية (بطلب المالك): كل مسارات الكتابة مغطّاة (إنشاء/تعديل بـprovider_id = labs+patient-profile؛ تغيير الحالة فقط لا يلمس provider_id = labs status-workflow + appointments.autoDeliverLinkedLabs + index dashboard deliver) + قراءة provider-reports↔accounting متطابقة + كتابة labs↔patient-profile متطابقة + simulation حفظ القيمة 10/10 + توزيع نسبي 6/6 + JS سليم + div (94/589/145/97) + صفر أسرار. live-tested ✅.
   • قواعد جديدة #196 (إسناد تكلفة المخبر بـprovider_id صريح، نمط ProvNum، لا استنتاج بالعرض، مفلتر بـdate_sent → ثابت بأي نافذة) + #197 (مسارات كتابة lab_orders المتعددة لازم تتطابق: labs+patient-profile بمنطق resolution واحد؛ مسارات الحالة فقط لا تلمس provider_id).
   • التالي (المحاور المتبقّية من «نام مرتاح»): المحور ٣ البند ٣ custom SMTP (Resend) + تدرّج DMARC · المحور ٤ تتمّة نظافة (sydent-backup PAT بلا انتهاء → least-privilege + حالة تطبيق Migrations 70/71/72) · ٥ أتمتة (سكربت cache-bust واحد + حُرّاس 4-copy mirror) · ٦ توثيق موحّد (bus factor) · تدوير S3/R2 إلزامي قبل أول عميل حقيقي (#186). فكرة اختيارية: عرض «🔗 مربوط ببطاقة: X» جنب الطلب بتبويب طلبات الحجز.

**(#199 · #204)**
🆕 v103 — جلستان: تدقيق UI شامل (6 دفعات) + إصلاح الجسور المتجاورة وتدقيق منظومة المخطط — HEAD 2fd16d8 على main (فوق 54f1c88)، 8 commits، صفر migration/مالي/RLS، book.html بلا مساس بكل الدفعات، live-tested ✅ كلها
   • جلسة (أ) — UI الأسطول، 6 commits بترتيب التنفيذ:
   • (1) 368081a تباين: توكن --on-accent جديد (لايت #ffffff / دارك #0a1628) لأي نص فوق var(--green) — باللايت الأخضر #0d8577 غامق فكان النص الكحلي عليه 4.0:1؛ رقعة theme.css اللايت اتوسّعت 19 selector (btn-add/btn-save/btn.primary/chip.active/method-chip.active/count-badge/k3-toggle/cal today/tx-tab-active/planned-schedule×2/doc-default-on/ob×2/checkbox::after×3/evf/btn-save-support) + --text3 لايت #8fa6b8→#64748b (2.35:1❌→4.76:1✅ عالكروت) + --yellow لايت #d97706→#b45309 (3.19→5.0:1، +dim) + 5 إنلاين→var(--on-accent) (completeApptBtn/dcmConfirmBtn/toothPlannedCompleteBtn/رابط provider-reports/قاعدة .toast بـexpenses محلياً — استُثنيت من الرقعة العامة: 10 صفحات toast خلفيتها bg3) + شاشة انتهاء الاشتراك بـindex→متغيرات. bust 20260702a.
   • (2) 4b8a735 الهوية: 16 إيموجي السايدبار → Lucide SVG رسمية (npm lucide-static، stroke=currentColor → تتلون مع الثيم/active؛ 🚫→ban، 💬→message-circle؛ .sb-icon flex + svg 17px) + font-synthesis-weight:none بقاعدة الخط الشاملة (~180 استخدام 800/900 → Plex 700 حقيقي — Plex Arabic أقصاه 700، الـfaux-bold كان يشوّه العربي) + شيل استيراد Cairo من 21 صفحة (ميت — theme.css يلغيه بـ!important؛ −2 طلب/صفحة؛ بقي عمداً: book.html:10 + قالبا الطباعة provider-reports:1311/treatments:1464 لأن نوافذ الطباعة لا ترث theme.css). bust 20260702b.
   • (3) 5c0c3a7 تلميع: سكرول بار موحّد بالثيمين (thin + thumb على --border2؛ 14 صفحة كانت بأبيض افتراضي بالدارك؛ القواعد المخصصة تغلب بالخصوصية) + :focus-visible أخضر (أزرار/روابط/select) + prefers-reduced-motion عام + توكنات --r-sm/md/lg/full + تطبيع 104 إعلان radius (9→10/7→8؛ pills غير متأثرة) + table.providers بـaccounting display:block+overflow-x ≤820 + #detailsBody بـprovider-reports overflow-x + شيل margin/hamburger 980px القديمة بـinventory (sidebar.js يديرهما — كانت تُظهر همبرغرَين بين 821-980). bust 20260702c.
   • (4) ddd526c حالات: مكوّن .sy-skel shimmer (لايت 45%/دارك 7%) + placeholders ساكنة (index todayAppts+recentPatients ×3، patients tableBody ×5 colspan=7) — صفر JS، الرندر يكتب فوقها + .jaw-wrap padding 16→24px بmargin ‎-8px معوّض (تخطيط متطابق + مساحة رسم للبادجات ±7px مع scale 1.12 — أغلق المؤجّل #2 من v101). bust 20260702d.
   • (5) 1e1f977 توست موحّد: window.showToast(msg,isErr) قانوني بـsidebar.js (#syToast كسول + CSS ذاتي: أسفل-وسط --bg3 بحد --green يمين-RTL/أحمر عالخطأ) — متوافق مع التوقيعات الأربعة، 531 استدعاء بلا مساس؛ sidebar.js بالـhead بلا defer بكل الـ14 → التوقيت آمن؛ حُذف: 14 تابع محلي + 14 div ثابت + 34 قاعدة CSS (audit-log كان #toast ID-based)؛ sub-toast بـsubscription نظام منفصل تُرك. صافي −238 سطر. bust 20260702e.
   • (6) 570a886 إيموجي: 369 مقشوطة من الكروم الثابت بـ18 صفحة (regex على مقاطع HTML خارج <script>: إيموجي يسبق نص عربي بعناوين/أزرار/تبويبات/hints)؛ باقٍ عمداً ~2,198 (رسائل JS ✅/⚠️ + أيقونات منفردة + فارغات 🦷) — SVG انتقائي لاحقاً. بلا bust.
   • مؤجّل بقرار: توحيد المودالات (31 تعريفاً — للمستلم، --r-* جاهزة) · زر ثيم auth · إغناء landing (قبيل الإطلاق).
   • جلسة (ب) — مخطط الأسنان: المُبلَّغ (سكرينات) جسران متجاوران (32-33-34 + 35-36-37، قلع 33+36) → الدعامتان الداخليتان 34/35 بلا جذور (رُسمتا pontic) + إطباقي المقلوع المجسور منقّط فاضٍ. تحقق أولاً (Rule #19): git diff برّأ commits اليوم — باغ قديم بحالة لم تُجرَّب.
   • (7) 8b7dcc4 إصلاح الرسم: Bug#1 = findPontics حالة(c) legacy كان مسحُ الأجناب يقفز فوق المقلوعين (34 يعبر فجوة 33 ليجد 32...) → الحارس: مرشّح غير-مقلوع لا يمسح عبر فجوة أبداً (سن حقيقي جنب فجوة = دعامتها)؛ حالة(b) تبقى تعبر (فجوات متعددة). Bug#2 = ponticSet محلي والإطباقي بلا وعي → chartPonticSet مستوى-الموديول + فرع إطباقي يرسم silhouette مليان بلون الجسر (مفتاح PONTIC/WHOLE الخام). مثبت node 5/5 (متجاورين/legacy-3/legacy-4/فجوة-مزدوجة/دعامة-مشتركة). patient-profile فقط، بلا bust.
   • (8) 2fd16d8 تدقيق المنظومة كاملة + 6 إصلاحات: [حرج-1 #197] saveToothAndOpenLab كان صفاً واحداً — والجسر LAB_REQUIRED فمساره الطبيعي «حفظ+مخبر» → WHOLE=bridge يمحو القلع وصفر دعامات = الجذر الأرجح للبلاغ الأصلي؛ استُخرج persistSpecialTreatment() (جسر/حافظ/مسح-الزرع + الحرّاس، يرجع blocked/handled+unit) والمساران يستدعيانه — التباعد مستحيل بنيوياً؛ وصف المخبر «جسر يشمل الأسنان …». [حرج-2] undoExtraction كان توسيع الوحدة يعبر أي جسر/مقلوع → حذف جسر يمحو جاره؛ الحد: دعامتان غير مقلوعتين متلاصقتان (وحدة واحدة بينها pontic دائماً) — node 6/6. [حرج-3 #195] XSS: أسماء العلاجات المخصصة + fill خام بـinnerHTML بعشر نقاط (دهليزي ×6 + إطباقي عبر row() يغطي 7 + legend) → escapeHtml. [4] حارس: الجسر من السن المفقود فقط (نمط حارس الحافظ) — سليم كان يصير DB-pontic بلا قلع. [5] clearToothStatus bridge-aware → الحاذف الوحدوي (دفاع عميق: المودال أصلاً يُظهر «إزالة الجسر» بدل «سليم» على عضو جسر — else-if، تحقق كودي + توضيح للمالك). [6] تطبيع الخريطة المحلية بـisExtractionKey (لا يدوس مفاتيح قلع مخصصة).
   • التدقيق أكّد سليماً: رياضيات الوحدة + target_part المخصصة + provider_id بكل صفوف الوحدة (#196) + حرّاس اللبنية + band&loop + مسح-قبل-الزرع + MOD subsumption + استثناء WHOLE/PONTIC بالفلتر + «حنكي» + SURFACE_FILL_OPACITY. موثّق بلا تغيير: findBridgeAbutments يقفز الزرعات بصمت.
   • live-tested ✅: كل دفعات UI بالثيمين + تطبيق جسر عبر «حفظ+مخبر» بوحدة كاملة + حارس السليم 🌉 + حذف 33 لا يمسّ 36 + إزالة من دعامة 14 نظّفت 14-15-16 والـ15 رجع منقّطاً + حافظ مسافة + زرعة 28.
   • قواعد جديدة #199–#204: #199 --on-accent لأي نص فوق الأخضر (رقعة اللايت = الشبكة الاحتياطية) · #200 توست موحّد — ممنوع showToast/.toast/#toast محلي (استثناء موروث sub-toast) · #201 persistSpecialTreatment = المسار الوحيد لجسر/حافظ/زرع من كلا مسارَي الحفظ · #202 ثوابت المتجاورين (رسم: لا مسح عبر فجوة لمرشّح غير-مقلوع؛ حذف: توقف عند دعامتين متلاصقتين؛ chartPonticSet يغذّي الإطباقي) · #203 الجسر من المفقود حصراً · #204 خط وإيموجي (Plex فقط عبر theme.css، لا Cairo بصفحات جديدة إلا قوالب الطباعة/book؛ >700 يُرسم 700؛ كروم ثابت بلا إيموجي؛ ✅/⚠️ بالرسائل جائز).
   • التالي: توحيد المودالات (للمستلم) · ترحيل sub-toast · SVG انتقائي للـ2,198 · زر ثيم auth + landing قبيل الإطلاق · المحور ٤ (sydent-backup PAT انتهاء + حالة 70/71/72) · ٥ أتمتة (سكربت cache-bust) · ٦ توثيق · S3/R2 (#186) · DMARC · Sentry tunnel.

**(#204)**
طلبُ المالك: رمزٌ واحد لكل أسطح «المساعد الذكي». v321 نفّذها **أيقونة SVG** بنمط lucide عملاً بقاعدة **#204** (الكرومُ الثابت بلا إيموجي)، على **خمسة أسطح** — ومنها **مرآةُ عنوان قسم الإعدادات داخل مسار الخطة المحجوبة** (النصُّ يرد مرّتين: حيّةٌ وسلسلةُ JS تُرسم لعميلٍ بخطةٍ بلا AI؛ وإغفالُها كان سيُبقي الرمزَ القديم بموضعٍ لا يُرى بالتجربة).

**(#205 · #206 · #207 · #208)**
🆕 v104 — جلسة تطويرات مخطط الأسنان A–E + مخطط اللثة Perio v1 — HEAD a9b45b8 على main (فوق 2fd16d8 + 3 كومِتات تدقيق أمني موازية)، 9 commits + Migrations 74–77 (كلها مطبّقة ✓)، cache-bust فليت 20260703a، book.html بلا مساس، live-tested ✅ كلها
   • قبل الجلسة (موازية، وُثّقت الآن): 87c0191 حذف deploy.yml اللغم الحي (workflow_dispatch يدوس index.html) · 9ae5568 إغلاق 12 موقع تهريب جزئي #195 بـsettings+patient-profile (escapeHtml القانوني) · ab2de4e تطهير 5 ملفات ميتة من الجذر (server.js حقبة DentSyr + package.json + Next.js scaffold + مكررات) → ⚠️ خدمة Render يتيمة — suspend من الداشبورد (watch-point #16)
   • A (1382d06 + M74 teeth_status.review_at): مراقبة→مراجعة مجدولة — شرائح 3/6/12/بلا بمودال السن، كتابة بالمسارات الثلاثة عبر _reviewAtVal()، بانر renderWatchBanner() (مستحق/قادم)، دمج بقائمة الاستدعاء prmRecallList بـpatients.html. تم ✅
   • B (bd07e70 + fix a959686): وضع الفحص الأولي — زر + شريط sticky، وسم دفعات بحالات غير-مالية فقط (existing/condition، صفر ledger)، نقطة اعتراض وحيدة أعلى openToothModal، undo stack. الباغ: t.treatment_key على TREATMENTS الممـappة = undefined → .id (#205). live 14 وسماً ✅
   • C (1da8ab2 + M75 ledger_sessions.phase): خطة علاج مرحلية — شرائح [١][٢][٣][—] لصفوف المخطط، طباعة/نسخ بنمط الروشتات، معزول مالياً 100% (phase تسمية عرض). تم ✅
   • 257a8ad: نفس باغ .treatment_key بمسار «+ علاج جماعي» الفارغ (سطر 7088)
   • E (8022c3b + M76 teeth_status_history append-only + trigger SECURITY DEFINER + baseline seed + RLS select-own): عرض تاريخي read-only — زر + شريط كهرماني، reconstructTeethMapAt (تواريخ محلية _fmtYmd/_histShift)، read-only عبر الممر الموحّد، قفل متبادل exam↔history، كنس طبقات «الآن» من مصادرها الأربعة (orthoForArch/renderWatchBanner/addPhotoBadges/addLabBadges)، liveTeethMapRef يُستعاد بلا مساس. v1 = history-only: السجل يؤرّخ لحظة الكتابة لا تاريخ الجلسة («السابق/التالي» أول يوم by-design — قرار معتمد؛ أُثبت السفر بتحريك changed_at بالـSQL). تم ✅
   • D (b6233c2 + M77 perio_exams+perio_measurements): مخطط اللثة v1 — تبويب «اللثة»: جدولا فكّين (UPPER_T/LOWER_T)، 6 نقاط عمق/سن (0-19) بإدخال auto-advance (رقمان أو رقم≠1؛ Enter/مسافة تقدّم؛ Backspace فارغ يرجع؛ تخطّي المعطّل)، BOP ×6، حركة 0-3، تلوين حي ≥4 كهرماني/≥6 أحمر، مؤشرات فورية (٪BOP + ≥4 + ≥6 + أسنان مفحوصة)، المقلوع معطّل من الخريطة الحية حتى داخل العرض التاريخي (perioIsExtracted swap-restore)، فحوصات مؤرّخة (إنشاء + نسخ آخر فحص + dirty guards + حذف CASCADE)، مقارنة بالسابق (أحمر تدهور/أخضر تحسّن + «كان: X»، قفل + تعطيل حفظ)، طباعة printRoot/printing، حفظ bulk upsert onConflict(exam_id,tooth_num) + حذف المفرَّغ عبر perioLoadedTeeth، تدقيق perio.create/update/delete + بادئة perio. بـVALID_ACTION_PREFIXES (supabase-init.js) + جولة cache-bust value-agnostic → 20260703a بتحقق تناظري (16/20/21/21/2 + book صفر بنيوياً). M77: CHECKs (11-48 / 0-19 / 0-3) + UNIQUE(exam_id,tooth_num) + FK CASCADE + RLS مالك + indexes. تم ✅ بصور: 31 سناً مفحوصاً (44 مستثنى تلقائياً) · 5 مواقع ≥6مم بالضبط · BOP 1٪ = 2 من 186 — الرياضيات تطابق
   • 40b0dae: white-space:nowrap على خلايا الشبكة — النقاط الثلاث بسطر واحد والسكرول الأفقي يمتص التمدد (من ملاحظة الصورة الحية)
   • a9b45b8: إزالة إيموجي شارات التقويم (باني chip() سطر 4292) + قرار منتج: الشارات حصرية لحالات الأجهزة المستمرة (تقويم)؛ العلاجات الحدثية (تبييض/تنظيف) بالجلسات + تلوين المخطط — لا chips
   • حوادث الجلسة (استُردّت كلها): (1) surrogate-pair escapes للإيموجي فجّرت كتابة python بعد تفريغ open-write → patient-profile.html فرغ لحظياً؛ git checkout + إعادة بمحارف حقيقية. (2) فزع «التعقيم المزدوج»: طبقة النقل تضاعف الباكسلاش بالاتجاهين — الحسم عدّ رقمي (chr(92) وطباعة أعداد)؛ الملف كان سليماً. (3) فزع census: أنكور «D: periodontal charting» مسك تعليق CSS المطابق فقاس 6700 سطر — rfind/ماركرات مميزة؛ «المزدوجان» بسطر 1968 = بناء regex قديم صحيح. (4) فاصلة منقوطة داخل && كسرت البوابة + مسار ملف السياق v102→v103 تغيّر خلال الجلسة (تحديث موازٍ — Rule #19)
   • قواعد جديدة #205–#208: #205 TREATMENTS بالذاكرة مفتاحها .id (= treatment_key نصاً؛ الـUUID بـdbId) — تمرير .treatment_key على الممـappة undefined صامت (باغان بنفس الجلسة) · #206 حسم البايتات رقمي حصراً (chr(92) + طباعة أعداد؛ العرض والإدخال كلاهما يضاعف الباكسلاش) + أنكورات بلا محارف حساسة (الإيموجي نفسه أنكور مثالي) + ماركرات كتل مميزة الإطار أو rfind عند التشارك · #207 emoji بمحارف حقيقية حصراً بالـheredocs (surrogate escapes = تفريغ ملف) + asserts الأنكور قبل أي open-write · #208 بوابات shell صريحة: لا فاصلة منقوطة داخل سلاسل && الحرجة، وأنبوب ينتهي بـhead يبتلع فشل grep — استعمل if صريحة وفحص المتغيرات
   • HEAD a9b45b8 · cache-bust فليت 20260703a (16/20/21/21/2، book صفر) · migration FILE = 77 (74–77 مطبّقة ✓، التالي 78)
   • التالي: suspend خدمة Render اليتيمة (داشبورد، يدوي) · تحديث وثائق التسليم (تشير لملفات محذوفة) · Perio v2 مرشّح (انحسار/furcation/لبنية) · باقي بنود v103 (توحيد المودالات للمستلم · sub-toast · SVG انتقائي · ثيم auth · landing · المحور ٤/٥/٦ · S3/R2 #186 · DMARC · Sentry tunnel)

**(#213)**
- **المثبت 173 تأكيداً** (كان 152): أُضيف تقاربُ الذروات لكلِّ رحى دائمة، وثباتُ سلوك اللبنية، ونسبُ الجذع الثلاث، وثباتُ الحنكي في المنتصف.
- **إعادةُ تصوير لقطتَي اللاندينغ** (فاتحة/غامقة) بعد v392 وv394 — تطبيقُ القاعدة #624؛ v393 لبنيةٌ فقط فلم تُعد.
- كسرُ الفليت ثلاثَ مرات (`20260918e/f/g`) لأن `pp-dental.js` و`patient-profile.css` أصولٌ بتوكن؛ كلُّ مرةٍ بكومِتٍ مستقل بعد كومِت المحتوى (#213).
- الحُرّاس الثمانية عشر خضر قبل كلِّ كومِت وبعده؛ حارسُ الألوان لم يتأثّر لأن الخلفية توكنٌ موجود.

**(#218)**
**العيوبُ الستة**
| # | العيب | الإصلاح |
|---|---|---|
| **🔴 F1** | `row` تحمل `is_active:true` ثابتاً وتُستعمل للإدراج **وللتحديث** ⇒ أيُّ تعديلٍ على موظفٍ **معطَّل** يعيد تفعيلَه بصمت: تحت الحدّ مقعدٌ يُستهلَك دون قرار، وعند الحدّ يرفض تريغر M44 الحفظَ كلَّه فتظهر «فشل الحفظ» عارية | الحقلُ خرج من الحمولة المشتركة إلى فرع `if (!editingId)` حصراً (حيث يُحسَب `sort_order`) — التفعيل/التعطيل مسارُ `toggleActive` وحده وهو المحروس بفحص الحدّ |
| **🔴 F2** | تحذيرُ «مكّنتَ الوصول ولم تُدخِل رقمَ سر» **لم يشتعل قطّ**: `origEmp` تُقرأ بالسطر 1502 وتُعرَّف بالسطر 1535، و`var` المرفوع = `undefined` لا خطأ ⇒ الشرطُ كاذبٌ دائماً منذ يوم كتابته | التعريفُ نُقل قبل بلوك الـPIN (والمتأخّر حُذف) — صفر مساسٍ بمنطق اشتقاق `doctorId` بعده |
| **🟠 F3** | (#218) `avatarColor` تُرجع `emp.color`/`linked.color` خامَين من القاعدة ويُحقنان بسمة `style` | `_safeCardColor()` عند نقطة القراءة: hex صارمٌ عبر `SyDentColorPicker.sanitizeHex` مع **قبولٍ حرفيّ لـ`var(--green)` وحدها** — خمسةُ صفوفٍ حيّة تخزّنها، ومنعُها كان سيُبيِّض بطاقاتِ المالك |
| **🟠 F4** | `doctors` تُفلتَر `is_active !== false` عند **الجلب**، وكلُّ مستهلكيها يبحثون بالمعرّف ويفحصون النشاطَ بأنفسهم ⇒ بطاقةٌ معطّلة تختفي فيُقرأ التخصصُ فارغاً وCase 2 يكتب `clinic_doctors.role = null` (صفٌّ واحدٌ حيٌّ بهذه الحالة) | حذفُ الفلترة عند الجلب؛ `_pickRandomDoctorColor` يفلتر النشطين بنفسه فلا يتأثّر |
| **🟡 F5** | «أخر» → «آخر» · جملتان عاميّتان · زرُّ تعطيل القفل نصُّه ينحرف بعد أوّل تشغيل (`🗑` بالـ`finally` وحده) ولونُه `#ef5350` محفور · تعليقٌ ميت | تصحيحٌ نصّيّ + `var(--red)` + حذف |
| **🟢 F6** | فشلُ `loadData` يعرض «لا يوجد موظفون بعد» (تشخيصٌ كاذب) · وفحصُ الاسم الفارغ يقع **بعد** تأكيد «راتبٌ بلا مبلغ» | حالةُ خطأٍ يحميها علمُ `_loadFailed` من دهس `renderList` · ونقلُ فحص الاسم لأعلى الدالة قبل أيّ `confirm()` |

**(#222)**
سابقاً: جلسة v115 = صفحة تدريب فيديو `learn.html` (source-agnostic youtube/R2، بلا DB/migration — إضافة فيديو = سطر بالمصفوفة) + ربط السايدبار (عنصر «مركز التعلّم» بالنظام، كل الأدوار/الخطط، cache-bust فليت 20260708a) + إصلاحا باغين (السايدبار غير الظاهر: نسيان initSidebar('learn')؛ تباين التبويب باللايت: override أخضر محلي #188) + بحث منافس Kizen (فجوات مؤكَّدة بوثيقة Backlog؛ P1 = قناة فيديو [منجز] + CSV import). HEAD 287ad44 · فليت 20260708a · migrations 74–78 ✓ التالي 79 · قاعدة جديدة #222 (كل صفحة tenant لازم تستدعي initSidebar). سابقاً: v114 حادثة أمنية تشغيلية (الريبو كان public → private + Revoke service_role المسرَّب، صفر كود، HEAD 9d5d359) · v113 إغلاق آخر XSS (تهريب حقول المريض patients.html/index.html)

**(#224)**
سابقاً: v117 استيراد المرضى من CSV (بند P1 #2 من باك-لوغ Kizen): زر «استيراد CSV» + مودال بمعاينة حيّة + parser داخلي RFC-4180 (بلا مكتبة) + تحقّق لكل صف + INSERT يطابق اليدوي (local_id مولّد #62) + حدّ الخطة يرفض الدفعة كاملة + كشف ترميز UTF-8/Windows-1256. commitان 11b8248 + bee8520، ملف واحد patients.html inline، live-verified ✅. قاعدة #224. المتبقّي من الباك-لوغ: P2 (XLSX/charts المستأجر/per-role/قوالب صلاحيات/AP/e-signature) + P3 مؤجّل.

**(#225)**
── (الافتتاح السابق v118 وما قبله — محفوظ حرفياً أدناه) ──
مرحباً د. أيهم 👋
آخر commit: cc2d475 على main (v118 — إصلاح طباعة مخطط اللثة). جلسة v118 = بلاغ المالك: طباعة/PDF مخطط اللثة فاضية (شرطات/نقاط) بينما الشاشة فيها الأرقام والنقاط. الجذر: perioPrint/perioPrintArch يقرآن perioRows (نسخة تحميل الفحص فقط، لا تُحدَّث عند الكتابة ولا بعد الحفظ — perioSave يرفع للـDB بلا re-fetch) بينما القيم بخانات DOM. الحل WYSIWYG: perioSnapshotFromDom() يلتقط القيم الحيّة من input/dot + perioPrintArch(arr,ling,src) يقرأ src[t] بالمواضع الثلاثة + perioPrint يبني perioSrc ويمرّرها. commit واحد cc2d475، ملف واحد patient-profile.html inline، صفر migration/مالي/RLS/cache-bust، book.html/المرايا بلا مساس، live-verified ✅ (الأعماق والنقاط تُطبع مطابقة للشاشة). قاعدة #225 (طباعة الشبكات القابلة للتحرير = WYSIWYG من DOM لا من الموديل). HEAD cc2d475 · فليت 20260708b · migrations 74–78 ✓ التالي 79.

**(#226)**
---
**آخر تحديث:** 4 آب 2026 (v205 — **تضييق نطاق عزل BiDi إلى البريد المُصنَّع وحده + رابط الدخول يصل قابلاً للنقر**) — **الحالة الحيّة: HEAD = `0ce55b5`** (كومِتان فوق `daca9df`: `93f9242` الإصلاح ثم `0ce55b5` كسر الكاش) · `release` = **`0ce55b5`** (`ci-guards #226` خضراء بـ1m53s و`promote` رقّى الإنتاج) · **SW `v147`→`v148`** · توكن الفليت **`20260804a`→`20260804b`** · **صفر migration** (آخر ملف = 123، التالي 124 بلا تغيير) · صفر سيرفر · صفر لمس مالي · الحُرّاس الاثنا عشر خضر بالكومِتين · **live-verified ✅ بصورة واتساب من جهاز المالك** («تم»).

**(#227)**
> **ما يميّز هذه الكتلة:** الخللُ لم يكن بالقفل بل **بالبابِ الأضعف لنفس الفعل** (قاعدة #561): حارسا السحب (#227) يمنعان نقلَ الموعد المنتهي، ومودالُ التعديل — والتحويلُ لـ«مخطّط» ثم الجدولةُ من ملف المريض — بلا حارس. **وأثرُ الأختام الغريبة عن يومها أوسعُ من رسالة «منتهٍ»** وكلُّه مثبتٌ بالكود (القسم أ). **والفحصُ الموسّع لم يكن شكلياً:** أمسك ثغرةً ثانية (نقلُ مريضٍ حاضرٍ ليومٍ آخر بالسحب الأسبوعي) وخللين قائمين (سجلُّ نشاطات يسجّل القديمَ = الجديد، واقتراحُ حذف الختم يرفضه تحقّقُه نفسه).

**(#228 · #230)**
── (الافتتاح السابق v121 وما قبله — محفوظ حرفياً أدناه) ──
مرحباً د. أيهم 👋
آخر commit: cd19b9b على main (v121 — PWA أوفلاين، المراحل 0+0.1+1 كاملة live-verified ✅). المنصة صارت PWA hybrid تعمل بلا إنترنت:
• القشرة تفتح offline — sw.js (HTML network-first آمن لـpretty-URL 308 + أصول ?v= cache-first + خطوط SWR فقط + deny-list صريحة supabase/sentry + GET فقط + KILL_SWITCH + SW_VERSION v1) + offline.html (ثابتة RTL صفر JS) + تسجيل بذيل theme.js (book.html مستثنى بنيوياً) + /sw.js no-cache بـ_headers.
• سماحية الجلسة — لفّ sb.auth.getUser (الـ14 صفحة تناديه مباشرة): فشل شبكة + جلسة sydent.auth محلية = مستخدمها بدل null (لا طرد لصفحة الدخول offline)؛ أخطاء auth الحقيقية أونلاين تحوّل كما هي؛ jwt الصريح مستثنى. الجذر: jsDelivr يُخدَم من HTTP cache المتصفح offline فالفحص كان يعمل ويفشل شبكياً.
• قراءة كل شيء offline — موديول SyDentOffline أعلى supabase-init.js عبر createClient global.fetch: قراءات GET جداول REST فقط تُخزَّن بـIndexedDB بمفتاح uid|url|accept|range (عزل مستأجرين كامل) وتُخدَم عند فشل الشبكة؛ 4xx/5xx تمرّ بلا تقنيع؛ كتابة جدول offline = toast واضح + نفس TypeError؛ RPC بلا لمس؛ sbSignOut يمسح الكاش؛ 16/16 fake-indexeddb على الكود الحي. صفر تعديل على أي صفحة.
قرار المالك الحاكم: offline = قراءة + مواعيد فقط؛ الدفعات/الجلسات offline ملغاة نهائياً — ولا مسار offline يلمس ledger_*/payment_splits/realloc_patient_splits (GET فقط يُكاش بنيوياً).
نافذة انتقالية معروفة (لا باغ): الصفحة المكاشة تحمل نسخة JS لحظة كاشها — تُشفى بأول زيارة أونلاين لكل صفحة (HTML network-first).
HEAD cd19b9b · فليت 20260710c · migrations 74–78 ✓ التالي 79 · قواعد جديدة #228–#230.

**(#231 · #232)**
── (الافتتاح السابق v122 وما قبله — محفوظ حرفياً أدناه) ──
مرحباً د. أيهم 👋
آخر commit: 268c05d على main (v122 — مشروع PWA مكتمل رسمياً 🏁: المراحل 0→3 كلها live-verified).
SyDent الآن PWA كامل: يفتح بلا نت (SW v2) · يقرأ كل شيء بلا نت (SyDentOffline عبر global.fetch) · يكتب المواعيد بلا نت ويزامنها تلقائياً (outbox + UUID عميلي + overlay + drain معزول uid + شارة «⏳ بانتظار المزامنة») · يتنصّب كتطبيق (أيقونات PNG + بطاقة تثبيت؛ iOS إرشادية) · offline.html تعرض الصفحات المتوفرة · تحديث خلفي REFRESH_PAGES مخنوق 6س.
الجدار المالي محروس آلياً: الحارس السادس scripts/check-offline-guard.sh (صرنا «الحُرّاس الستة») يكسر البناء لو طبقة الأوفلاين لمست ledger_*/payment_splits/realloc أو توسّعت whitelist الطابور عن (appointments|audit_log) الحرفية أو حقن UUID عن appointments.
مفاتيح تشغيلية: فليت 20260710h · SW_VERSION v2 · IndexedDB sydent-offline v2 (rest_cache + outbox) · رسالة رفض الجدار عربية عبر error.message (ممنوع إدخال مطابقة نصية على 'Failed to fetch') · offline+كاش غائب = فشل فوري · suites الاختبار (16 قراءة + 22 كتابة) تُعاد كتابتها كل جلسة بـnode+fake-indexeddb على الموديول المستخرَج بين الماركرين · قاعدة #232: لا push إلا خلف بوابة خضراء (اختبارات + حُرّاس) بنفس الأمر المشروط.
migrations 74–78 ✓ التالي 79 · قواعد #231–#233 جديدة.

**(#233)**
**[أ-٥ — iOS]** آبل لا تطلق `beforeinstallprompt` إطلاقاً (قاعدة #233) ⇒ على iOS تظهر **نسخة إرشادية بزر واحد** («تمام») ونص «زر المشاركة ⬆️ بشريط سفاري ثم إضافة إلى الشاشة الرئيسية»، **بلا زر تثبيت أصلاً**. مؤكَّد حياً بالنمطين.

**(#234)**
── (الافتتاح السابق v123 وما قبله — محفوظ حرفياً أدناه) ──
مرحباً د. أيهم 👋
آخر commit: b6e77fb على main (v123 — ربط التقويم بالمخبر، live-verified ✅). الفجوة المسدودة: علاجات التقويم (regional، tooth_num=null) ما كان إلها أي مسار لإنشاء طلب مخبر ولا لتسجيل تكلفته — المسار الجماعي كان يخفي زر المخبر دائماً.
• Migration 79 مطبّقة ✓: lab_orders.session_id (FK ledger_sessions، ON DELETE SET NULL + index) — ربط سريري بحت، المحاسبة معزولة (labsTotal بـdate_sent + إسناد provider_id M73 بلا مساس).
• زر «حفظ + إرسال لمخبر» بالمودال الجماعي (regionalLabBtn منفصل عن toothLabBtn — تنافٍ متبادل) يظهر لفئة التقويم كاملة أو needs_lab؛ يحفظ الجلسة ثم يفتح مودال المخبر معبّى (session_id + provider + notes) عبر wrapper consume-once بلا نسخ للفرع الجماعي.
• pendingLabSessionId عبر open/edit/payload + graceful strip pre-M79؛ بونص: المسار السنّي (تعويضات/حافظ) صار يربط جلسته أيضاً؛ labs.html بلا مساس عمداً (PATCH semantics تحفظ الربط).
• حافظ المسافة تبيّن أنه شغّال أصلاً (needs_lab:true بمسار السن) — لا تعديل.
HEAD b6e77fb · فليت 20260710h بلا تغيير · Migration FILE 79 (مطبّقة ✓، التالي 80) · قاعدة جديدة #234 · الحُرّاس الستة خضر.
⚠️ watch-point #18: كومِتان موازيان غير موثّقين بعد — 3ee643d (دفعات offline إنشاء-فقط owner-approved) + 823987b (hardening) — حارس PWA صار يسمح «دفعات-إنشاء-فقط» بالطابور، يُعدّل بيان v121؛ لو ما وصل توثيقهما بإصدار لاحق وثّقهما.
التالي: تدوير الأسرار الشامل قبل أول عميل مدفوع (S3/R2 #186 + Resend + PAT) ثم DMARC→reject والاستعادة الحية.

**(#235 · #238)**
```
مرحباً د. أيهم 👋
آخر توثيق: v364 (سياق 270 — بوابة الاشتراك · 17 أيلول 2026). HEAD وقتها: 95ec8b2 = release (آخرُه كومِتُ حارسٍ بلا رفع نسخة) · فليت 20260917m (التالي 20260917n) · SW v364 · آخر هجرة 143 (التالي 144) — تحقق من HEAD الفعلي أول كل جلسة (#19).
الجولة باختصار: M141 (tenant_access_level · 188 سياسة RESTRICTIVE على 48 جدولاً + 4 تخزين · الحجز يُغلق) + SyDentSub (writeGate/applyPageGate) · وضعُ القراءة بكل صفحات القائمة (data-sub-write + سجلّات معالجات مصنّفة، V11) · الأدمن: التقصير تاريخٌ فقط والاستئناف كما كان وإعادة التجربة للتجربة وحدها (V12) · M142 نافذة المحو + حذف الحساب من صفحة الاشتراك (SyDentAccountDelete) · الطابور الأوفلاين ينتظر التجديد · تجاوز العرض على التابلت.
🔴 قبل أي جدول جديد: _sub_guard_table بهجرته (#607). قبل أي زرّ جديد بصفحةٍ مسجّلة: صنّفه بسجل V11 (#611). أي مسار حذف تحت RLS: عدٌّ من الخادم (#614).
بانتظار «تمام» صريحة: v360 (الصفحات الـ12) · v362 (الحذف) · v363. مراقبة: #129 HIBP (Pro) · #130 أول حذف حيّ على حساب تجريبي جديد.
التالي: قوائم الشغل بملفات المشروع (Remaining Gaps · Hardening · AI Backlog).
⤵️ (افتتاح v180 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v180 (جلسة الفوترة الكبرى — 27 تموز، live-verified ✅). HEAD وقتها: a696e86 · فليت 20260727h · SW v60 (تحقق من HEAD الفعلي أول كل جلسة — #19).
جلسة v180 باختصار: 16 كومِتاً — Migration 104 (دورة ربعية 90 يوم، وقيد ثالث بـsubscription_payments اكتُشف أثناء التنفيذ) · Migration 105 (تسعير بالدولار: أسعار يدوية لا تحويل، الافتراضي ليرة، سعر صرف للتقارير فقط، العملة تُقفل على الاشتراك) · Migration 106 (features_all + مداواة بيانات) + ثلاثة إصلاحات وميزتان صغيرتان.
🔴 خطأ ١: الصفر كان يُعامَل كسعر ⇒ الليرة بقيت معروضة بـ«0 ل.س» بعد مسح أسعارها. الجذر: العمود القديم price غير الظاهر بالمحرر يُزامَن تلقائياً إلى 0 عند مسح الثلاثة — فالكتابة والقراءة تغذّيان بعضهما. #332: العقد يُعرَّف على كل القيم لا على NULL وحدها، والحارس عند نقطة إرجاع واحدة.
🔴 خطأ ٢ (الأخطر): سطر تشذيب قديم بـsavePlanEdits كان يعمل String(s).trim() على كل عنصر ⇒ الميزة المخفية انحفظت حرفياً '[object Object]' وظهرت بصفحة الأسعار العامة. #333 (String العمياء فوق مصفوفة غير متجانسة = تدمير بيانات) · #334 (لا تُدخل شكلاً جديداً بعمود يقرأه عميل مخزَّن قديماً — افصل العمود بحسب الجمهور) · #335 (الفحص الذي يستدعي مساعدةً مباشرةً لا يثبت شيئاً عن المسار الحقيقي — e2e يقود نقطة الدخول ويؤكّد على الحمولة).
⚠️ تشخيصي الأول لخطأ ٢ كان «كاش قديم» وكان خاطئاً — المراجعة الثانية بطلب المالك هي التي كشفت السبب. الطلب «راجع الخطة مرة ثانية» له قيمة إثباتية عالية.
Migrations 106 ✓ (التالي 107) · مجموعة مرايا H (planFeatureItems/planVisibleFeatures ×3) · الطبقة المالية بلا مساس · book.html بلا مساس.
التالي: تفكيك admin.html · فجوات تسميات التدقيق · وثيقة التسليم v7→v8 · DMARC→reject.
⤵️ (افتتاح v179 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v179 (الشوط الثاني للتفكيك — 27 تموز، live-verified ✅). HEAD وقتها: 3419561 · فليت 20260726i · SW v50 (تحقق من HEAD الفعلي أول كل جلسة — #19).
جلسة v179 باختصار: 14 كومِتاً — خمسة استخراجات (patient-profile.css 813 · pp-wa.js 648 · pp-clinical.js 1,769 · pp-dental.js 4,981 · pp-plan.js 674) نزّلت patient-profile.html من 15,933 إلى 7,119 سطراً (−55%) · إصلاح فجوة تدقيق payment_plan على 4 سطوح (7568b75 — باغ قديم من Backlog #3 لا من التفكيك) · إصلاح جذع rebuildToothMaps (aec53a1).
🔴 أهم حدث: بوابة promote حجبت 3 نشرات مكسورة عن الإنتاج (ci-guards #88/#89/#90 حمر) — وكاش المتصفح أخفى ذلك، فبدا وكأن إصلاحاً مدفوعاً لا يعمل. الترتيب التشخيصي الإلزامي (#329): ls-remote ← اقرأ SW_VERSION من الإنتاج مباشرة ← Actions ← Cloudflare. لا تلمس SW/كاش قبل استنفادها.
🔴 الجذر: `var X = f();` تنفيذٌ لا إعلان — تسرّب مع الاستخراج ٩ فرمى ReferenceError وأسقط كل دوال المخطط. #330: فحص النقاء يشمل صنف «نداء داخل مُهيّئ». #331: كنس jsdom لكل صفحات dist + برهان تسجيل الدوال إلزامي قبل أي كومِت استخراج.
Migrations 103 ✓ (التالي 104) · الطبقة المالية لا تُستخرج أبداً (قرار نهائي) · book.html بلا مساس · admin.html لم يُلمس بعد.
التالي: تفكيك admin.html (A1 خطط/اشتراكات · A2 عرض/فلاتر · A3 قوالب واتساب/تصدير) · فجوات تسميات التدقيق (adjustment/perio/family) · وثيقة التسليم v7→v8 · DMARC→reject.
⤵️ (افتتاح v134 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v134 (جلسة الدعم العام — 17 تموز، live-verified ✅). HEAD وقتها: ec84e9c · فليت 20260716a (تحقق من HEAD الفعلي أول كل جلسة — #19).
جلسة v134 باختصار: 3 كومِتات — d21e39a (M84: سياسة anon whitelist لمفتاحَي الدعم + seed الإيميل + عرض أولي بالفوتر وprivacy) · dc3991f (إعادة تصميم بتوجيه المالك: زر «الدعم» واحد → popover بالإيميل والرقم فقط، jsdom 9/9) · ec84e9c (M84.1: حذف سياسة drift خارج-الشجرة p_platform_settings_public_support_phone — subset من tenant_read، العدّ رجع 4). admin.html صفر تعديل (Section H من X11 = مصدر القيم). الرقم يتطبّع لدولية wa.me بنسختين متطابقتين (مرآة #167 خارج #211).
⚠️ فكرة مطروحة بلا قرار: status page عبر BetterStack (مجانية من المونيترات + رابط فوتر).
Migrations حتى 84.1 ✓ (التالي 85) · صفر cache-bust بالجلسة · book.html بلا مساس · التالي: تدوير الأسرار الإلزامي قبل أول عميل + BetterStack heartbeat (4 خطوات) + live-test بانر الانتهاء + قرار retention + DMARC→reject والاستعادة الحية + resolve SYDENT-WEB-1.
⤵️ (افتتاح v129 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v129 (جلسة النقاط العمياء — 15 تموز). HEAD وقتها: a066536 · فليت 20260713c (تحقق من HEAD الفعلي أول كل جلسة — #19).
جلسة v129 باختصار: 4 كومِتات — ebcbc0b (privacy.html + روابط landing/auth/book.html [استثناء book موثّق بموافقة صريحة — سطر خصوصية ثابت] + robots/sitemap، «تم» ✅) · 2eeb775 (heartbeat BetterStack بbackup.yml — الكود جاهز، ⏳ 4 خطوات داشبورد على المالك: Heartbeat 1day/grace6h + سرّ BETTERSTACK_HEARTBEAT_URL + تشغيل يدوي + تأكيد Up) · a066536 (بانر انتهاء الاشتراك بلوحة المستأجر — ⏳ live-test: قصّر انتهاء حساب تجريبي). + وثيقة Offboarding Runbook v1 (خارج الريبو — تأكد أنها بالـproject knowledge).
⚠️ قراران مفتوحان: retention الباكبات (git أبدي + R2 copy-only يتعارضان مع وعد الـ60 يوم — الحد الأدنى rclone delete من R2 عند كل offboarding) + بندا المطوّر (recovery codes + الفيديوهات).
⚠️ watch-point #19: كومِتات PWA theme-color (3606a91/8fc67ff/b3a2c0f) + فليت 20260713c غير موثّقة — لصاحب جلستها.
Migrations حتى 81 ✓ (التالي 82) · book.html صار فيه سطر الخصوصية (الاستثناء الوحيد الموثّق — القاعدة «بلا مساس» تبقى سارية لما عداه) · التالي: تدوير الأسرار الإلزامي قبل أول عميل ثم DMARC→reject والاستعادة الحية.
⤵️ (افتتاح v127 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v127 (التدقيق الموسع + إصلاح A5 — 13 تموز، live-verified ✅). HEAD وقتها: ac7c834 · فليت 20260711d (تحقق من HEAD الفعلي أول كل جلسة — #19).
جلسة v127 باختصار: تدقيق تقني/أمني شامل كله أخضر (أسرار صفر، ريبو private مؤكَّد، RLS/autoGate/عزل مالي/headers سليمة) + كومِتان: 17917a6 (robots + حذف ملفَي classic-backup — استرجاع الـRedesign صار عبر git history/الوسم pre-redesign-20260612) و ac7c834 (باغ A5 بـpatients.html: استعلام treatments بـowner_id والعمود doctor_id → 400 مبلوع بصمت).
درسان حرجان: (١) #240 التدهور الرشيق يسجّل console.warn ولا يبلع بصمت — هيك نجا باغ A5 من كل التدقيقات؛ (٢) #241 عمود المالك per-table: doctor_id = treatments/labs/patients/appointments/ledger_*/operatories/perio_*/lab_orders؛ owner_id = clinic_settings/clinic_employees(مستأجر)/audit_log/inventory_*/patient_recalls/expenses/staff_messages — تحقق من السكيما قبل أي استعلام جديد، 42703 = 400 صامت.
فجوة تشغيلية: الـPAT بلا Actions scope (least-privilege صحيح) → حالة backup.yml تُفحص يدوياً من تبويب Actions/BetterStack.
حالة الأوفلاين والرسائل بلا تغيير (v126): staff_messages خارج outbox بقرار؛ عقد الدفعات المحروس كما هو.
Migrations حتى 81 ✓ (التالي 82) · الطقوم تُعاد كل جلسة · heredoc يأكل الهروبات (#237) · البوابة الخضراء قبل أي push (#232).
التالي: تدوير الأسرار الإلزامي قبل أول عميل (S3/R2 + Resend + Service Key + PAT) ثم DMARC→reject والاستعادة الحية.
⤵️ (افتتاح v126 والإصدارات الأسبق أدناه — محتوى تراكمي بلا حذف)
مرحباً د. أيهم 👋
آخر توثيق: v126 (الرسائل الداخلية — M80+M81 مطبّقتان، live-verified ✅ بدورين). HEAD وقتها: 8914d22 · فليت 20260711d (تحقق من HEAD الفعلي أول كل جلسة — الريبو الحيّ هو الحقيقة #19).
الميزة الجديدة: ودجت 💬 عائم بكل صفحات العيادة (ذيل sidebar.js بين ماركرَي SYDENT_MSGS) — رسالة موجَّهة + تم✓/تأكيد-الكل + بادج + polling 30ث + أزرار جاهزة قابلة للتعديل من الإعدادات (مصدرها الوحيد window.SyDentMsgs) + كنّاس retention (acked>7d). ONLINE-ONLY بقرار: staff_messages خارج outbox الـPWA — لا تُدخلها أبداً (الجدار يصدّ الكتابة offline بالتصميم).
دروس حرجة من الجلسة: (١) عدّاد pg_policies إلزامي بذيل كل migration — اللصق الجزئي + «Run and enable RLS» = RLS بلا policy = 42501 default-deny؛ (٢) [hidden] يُغلب بأي author display rule مهما كانت الـspecificity — override [سيلكتور][hidden]{display:none} إلزامي وjsdom أعمى عنها؛ (٣) localStorage يُحقن بvm contexts للاختبارات.
حالة الأوفلاين (بلا تغيير): يفتح بلا نت · يقرأ كل شيء · يكتب المواعيد · يسجّل الدفعات (إنشاء-فقط) — الجلسات والرسائل online حصراً بقرار. عقد الدفعات المحروس آلياً (حارس v2) كما هو: التوزيع online حصراً، صفر splits/realloc/FIFO بكامل الطبقة.
مفاتيح تشغيلية: Migrations حتى 81 ✓ (التالي 82) · الطقوم تُعاد كل جلسة بnode (msgtest 16/16+27/27، offtest 16/16+33/33) · heredoc يأكل الهروبات — الملفات البايتية عبر python (#237) · تغيير سطر محروس = تحديث واعٍ لمرساة الحارس · البوابة الخضراء قبل أي push (#232) · قواعد #235–#237 + مرشّحتان #238–#239.
التالي: تدوير الأسرار الإلزامي قبل أول عميل (S3/R2 + Resend + Service Key + PAT) ثم DMARC→reject والاستعادة الحية.
⤵️ (افتتاح الإصدارات السابقة والمحتوى التراكمي أدناه — محفوظ بلا حذف):
```

**(#235)**
مرحباً د. أيهم 👋
آخر توثيق: v124 (الدفعات offline — Phase 2.1 مكتملة live-verified ✅ مع اختبارات الحفظ A–E). الريموت وقتها: b6e77fb (جلسة المخبر v123 فوق كومِتَي الدفعات 3ee643d+823987b — تحقق من HEAD الفعلي أول كل جلسة).
حالة الأوفلاين النهائية: يفتح بلا نت · يقرأ كل شيء · يكتب المواعيد · **يسجّل الدفعات (إنشاء-فقط)** — الجلسات online حصراً بقرار المالك حتى تثبت الحاجة بالبيتا.
عقد الدفعات المحروس آلياً (حارس v2 — لا يُلتف عليه): واقعة append-only بUUID عميلي؛ تعديل/حذف دفعة offline مرفوض عربياً؛ التوزيع (FIFO/splits) online حصراً — صفر ذكر لsplits/realloc/buildFifo بكامل supabase-init.js؛ onSynced حدثٌ لا نداء مالي؛ مستمع البروفايل يعيد استخدام loadAll←reallocatePatientFunds←syncPaymentStatus حرفياً، وإلا self-heal عند أول فتح.
مفاتيح تشغيلية: فليت 20260710j (v123 قد رفعته — اعتمد الأحدث) · الطقمان 16/16+33/33 (يُعادان كل جلسة بnode+fake-indexeddb) · الممرَّر عبر العميل يفشل فوراً عند offline · توست الجدار يُكتم 1.5ث بعد توست طابور · heredoc يأكل الهروبات — الملفات البايتية عبر python · تغيير سطر محروس = تحديث واعٍ لمرساة الحارس · قواعد #235–#237.

**(#237)**
حارس التراكب بـ`check-mirrors.js` (السطر ~539) كان **يفرض حرفياً** `background:transparent` — رفضُه للتعديل سلوك صحيح (نمط #237: التغيير البنيوي لسطر محروس = تحديث واعٍ للمرساة). حُدِّث ليفرض النمط المُرقّى: (ابن `.45` + ظل + قاعدة الأب `:has`) على **ثلاثة أسطح** (انضمت appointments.html) + أزواج ترتيب الـDOM توسّعت **3→8** (rx/postOp×2/implant + زوج المواعيد modalOverlay→apptMatDeductModal) + سطر الملخّص «تعتيم المُكدَّس ×2»→«×3».

**(#237)**
**(د) زر تحديث للتطبيق المثبّت (`142ad7a`، sidebar.js):** بلاغ المالك «بالتطبيق المثبّت عالكمبيوتر ما فيني حدّث الصفحة — بدي زر متل السهم الدائري بالمتصفح». توضيح تصميمي: شريط عنوان الـOS لا يقبل زراً إلا بـWindow Controls Overlay (تعقيد كبير: manifest + إعادة تثبيت لكل مستخدم + Chromium فقط + drag-regions). **البديل الأبسط والاحترافي:** موديول جديد بذيل sidebar.js بين ماركرَي `SYDENT_PWA_RELOAD_START/END` (نمط موديول الرسائل) — زر ⟳ عائم دائري 46px **جنب فقاعة الرسائل** (`bottom:14px; inset-inline-end:68px`، نفس ستايل `syMsgFab` حرفياً). **البوابة المزدوجة:** مثبّت (`display-mode: standalone`) **و** دسكتوب (`hover:hover and pointer:fine`) — **الموبايل مستثنى عمداً (عنده pull-to-refresh)** بطلب المالك الصريح، والمتصفح العادي مستثنى (عنده زر التحديث الأصلي). الضغط → دوران CSS + `location.reload()` (يجيب أحدث نشر لأن الـSW network-first للـHTML، فيحلّ مشكلة التحديثات بالتطبيق المثبّت). iOS المثبّت مشمول (`navigator.standalone` عبر matchMedia). node 6/6 على الكود الحي بين الماركرين (يظهر بالحالة الصح · مستثنى بالموبايل والمتصفح · الضغط دوران+reload · idempotent عبر `__sydentPwaReloadWire`) · قاعدة #237: باكسلاش واحد فقط (`\u21BB`). cache-bust فليت `20260716a`→`20260718a` (تناظر +86/−86 كلها `?v=`).

**(#238 · #241 · #305)**
**قاعدة مرشّحة #304 (المسح النمطي يُعمَّم على الأسطول لا على ملف البلاغ):** حين يُكتشف عيب من صنف نمطي (متغيّر CSS غير معرّف · عمود خاطئ · هروب ناقص · مرآة منحرفة)، **المسح والإغلاق يجب أن يشملا كل ملفّات الأسطول لا الملف المُبلَّغ عنه وحده**، والتحقّق يكون **لكل ملف على حدة** (يعرّف المتغيّر محلياً؟ يرثه من الشيت المشترك؟) لا بمسح عام واحد — `54e204c` أغلق `appointments.html` وتُرك `admin.html` مفتوحاً ١٩ يوماً لأن الإغلاق وُثّق بصيغة «متغيّرات CSS ✅» بلا ذكر النطاق. **صيغة التوثيق الصحيحة تذكر الملفّات المشمولة صراحةً.** نفس صنف #241 (خريطة عمود المالك per-table) و#238 (العدّ الحيّ يكشف الـdrift). **قاعدة مرشّحة #305 (اختيار البديل عند إصلاح متغيّر CSS = من عمق التداخل الفعلي لا بالتخمين):** قبل استبدال متغيّر خلفية غير معرّف، **اقرأ الحاوية الأب الفعلية بالـDOM** (أيّ `.card`/`.section` يلفّه وبأيّ `--bg*`) واختر الدرجة **التالية** لها ليبقى التباين الهرمي؛ الاستبدال الأعمى بقيمة واحدة لكل المواضع يُسطّح التدرّج البصري ويبدو «معطوباً بشكل مختلف».

**(#238 · #250 · #264)**
**قواعد سارية مؤكَّدة:** #79 (تحديث تراكمي زيرو-حذف) · #107 (السياق لا يُكوَّم بgit) · #195 (كل قيمة عبر escapeHtml) · #211 (مرايا بايت-بايت) · #238 (ذيل تحقق pg_policies) · #250 (strip-and-retry ما-قبل-migration) · #264 (بانر/عنصر شرطي مخفي افتراضياً) · #265 (خرائط تسميات تدقيق مزدوجة) · #267 (بيانات الفحص المؤرَّخ بطبقة الفحص لا مودال الكيان) · #268 (القيم المشتقة تُحسب بالعرض لا تُخزَّن) · #269 (كاشف strip-retry يفتاح على اسم عموده/جدوله حصراً).

**(#238)**
**Migration 93 (`93_perio_v2_recession_furcation.sql`، نمط additive، مطبّقة ✓):** `ALTER TABLE perio_measurements ADD COLUMN IF NOT EXISTS` لـ**6 أعمدة انحسار** (`rec_mb·rec_b·rec_db·rec_ml·rec_l·rec_dl smallint CHECK 0-19`) + **عمود تشعب** (`furcation smallint CHECK 0-3`: NULL=لم يُفحَص · 0=فُحص وسليم · 1-3=Glickman I/II/III). **CAL لا يُخزَّن — مشتق دائماً بالواجهة.** RLS بلا مساس. ذيل تحقق #238 (عدّ الأعمدة الجديدة=7 + `pg_policies` على `perio_exams`+`perio_measurements`=2 بلا تغيير).

**(#238)**
**(أ) `e34ad14` — الفصل + التحذير الحر (Migration 92):** `MEDICAL_FLAGS_DEFS` قُلِّصت من 8 لـ6 (نُزعت penicillin_allergy/drug_allergy) + `ALLERGY_FLAGS_DEFS` جديدة (بنسلين/أدوية أخرى بتسميات قصيرة) + 3 دوال جديدة: `allergyFlagLabels(flags)` (يفلتر مفاتيح الحساسية من medical_flags) · `warnParts(rec)` (الأعلام + النص الحر M92) · `allergyParts(rec)` (chips الحساسية + النص الحر مع إسقاط التكرار الحرفي) — **كلها مرآة ×3 بايت/سلوكياً** (patients ↔ patient-profile ↔ appointments)، محروسة بتوسيع `check-mirrors.js` قسم F (11 متجه سجل تشمل trim/dedupe/unknown-key). **Migration 92 (`92_patient_medical_flags_other.sql`، مطبّقة ✓):** `ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS medical_flags_other TEXT` (nullable, additive, صفر RLS، idempotent، ذيل تحقق #238 — العمود text nullable + عدّ سياسات patients بلا تغيير). **المودالان (تعديل + إضافة):** chips الحساسية انتقلت تحت حقل الحساسيات بلون برتقالي (CSS جديد `.mf-chip.alg.on` بـ accent-color `var(--yellow)`) + input نصي حر جديد `eMedOther`/`fMedOther` تحت chips التحذيرات → عمود M92. **مسارات الحفظ:** تدمج حاويتَي chips بمصفوفة `medical_flags` الموحّدة + تحمل `medical_flags_other` مع **strip-and-retry ما-قبل-M92** (نمط #250) مرتَّب **قبل** retry الـM87، وريجكس M87 شُدِّد بـ`(?!_other)` (negative lookahead) كي لا يبتلع خطأ عمود M92. **select المواعيد** كسب سلسلة fallback ثلاثية (full → no `_other` → base) و`patientsCache` يحمل `medical_flags_other`. **9 مواضع عرض** حُدِّثت بفصل نظيف: بطاقة الملف (تاغ أحمر warnParts + تاغ برتقالي allergyParts) · صفوف المعلومات · طباعة الملف (صفوف منفصلة) · الروشتة ×4 (share/hint/print/copy سطر سلامة مدموج) · شارة/تلميح المواعيد. **كل نص حر عبر `escapeHtml`/`textContent`/`prmEsc` (#195).**

**(#238)**
**Migration 91 (`91_implant_log.sql`) — نمط M58 (post_op_notes) حرفياً:** جدول `implant_log` (id · owner_id→auth.users CASCADE · patient_id · `tooth_num TEXT NOT NULL` (يطابق teeth_status/M55) · brand · ref_no · lot_no · diameter NUMERIC · length NUMERIC · placed_at DATE · loaded_at DATE · notes · created_at) + RLS `implant_log_owner_all` (owner_id=auth.uid()) + فهرس `(owner_id, patient_id, created_at DESC)` + ذيل تحقّق Rule #238 (`to_regclass` + policies + index). **صفوف متعددة لكل سن مسموحة** (إعادة زرع) — العرض أحدث أولاً.

**(#239)**
**(أ) `subscription.html`** — الحالةُ ما عادت تُبذر بالرقم المثبَّت (`support: ''`)، واللودرُ يحمل `psSeen` لكل مفتاح ولا يطبّق الارتداد إلا حين لا يصل صفُّ الهاتف؛ وتطبيعُ #167 (رقم · إسقاط `00` · trunk `0`→`963`) بلا مساس. و`renderSupport` صارت تُخفي كلَّ قناةٍ على حدة **وتُخفي الكرتَ كلّه** حين لا تُضبط قناة، وتنزع `href` وتُفرّغ النصّ فلا يبقى أثرٌ بائت عند إعادة الرسم. والكرتُ يُشحن بالماركب حاملاً `hidden` فلا يومض قبل التحميل — ومع تجاوزَين صريحَين `[hidden]{display:none}` لأن للكرت والأزرار قاعدةَ `display` من مصدر المؤلّف (**قاعدة #239**).

**(#240)**
**(ب) `privacy.html`** — بندُ التواصل كلّه ملفوفٌ بـ`<section id="pvContact" hidden>`، والإيميلُ الثابت بالماركب صار داخل غلافٍ مستقلّ. المنطقُ ثلاثيّ: الصفُّ وصل بقيمة ⇒ يُستبدل · وصل فارغاً ⇒ يُخفى الغلافُ وتُنزع `mailto:` · لم يصل ⇒ **الثابتُ يقف كما هو**. والفاصلُ ` · ` صار عنصراً مستقلاً لا يُرسَم إلا بين قناتين حيّتين معاً — وإلا لقرأ السطرُ «… الشروط: · واتساب: …» بفاصلٍ معلَّق. والقسمُ كلّه يُكشَف عند أيّ قناةٍ ويُخفى عند غيابهما، **وفرعُ `catch` يكشفه بالثابت** فيبقى الفشلُ fail-open حرفياً (#240).

**(#242)**
**[ح — الميزات الثلاث المُسلَّمة]**
1. **مكتبة قوالب رسائل الواتساب (M109)** — سطحان يتشاركان **نفس الجدول** فقوالب الطبيب واحدة بين بطاقة المريض وقائمة المتابعة: `waTpl*` (pp-wa.js، صف `ppWaTplRow` بمودال الكتابة) و`prmTpl*` (patients.html، صف `prmTplRow` بمودال المعاينة). **القالب يُحفظ بنصّه الخام بعناصره النائبة ويُحلّ لحظة التطبيق** ⇒ قالب واحد يخدم كل المرضى وكل الأقساط. استبدال كامل لا إلحاق (بخلاف Quick Notes). إخفاء افتراضي حتى يؤكّد الجلب أن الجدول متاح (graceful pre-M109 · #264) بلا توست مزعج. `waTplOptionsHtml(list, esc)` نقيّة والهارب مُمرَّر كبارامتر (`escapeHtml`↔`prmEsc`) — **وهذا بالضبط ما أبقى الجسم متطابقاً بايت-بايت**.
2. **العناصر النائبة الذكية** — الميزتان تعرفان الآن `{clinic_phone}` `{booking_link}` `{installment_amount}` `{due_date}` `{remaining_total}`؛ والقائمة **تتمدّد تلقائياً** مع أي سطح جديد لأنها مشتقّة من الخريطة نفسها لا من ثابت. العنصر المخترَع يبقى حرفياً + توست يسمّيه (نمط #242) فلا يُبتلع بصمت.
3. **توحيد سطوح المتابعة** — التبويبات الثلاثة (استدعاء · ميلاد · أقساط) بمنطق واحد: **واتساب = إرسال مباشر بالقالب** (صفر نقرة إضافية على المسار اليومي)، وزر ثانٍ يفتح المعاينة. `prmAiDraftInst` نظير `prmAiDraft` حرفياً ويولّد فوراً بنيّة **مشتقّة من السطح** فلا يكتب الطبيب شيئاً. **`prmAiRun` نواة توليد واحدة** يستهلكها الزرّ وحقلُ النيّة ⇒ استحالة انحرافهما. ⚠️ **قرار مُراجَع:** الجولة الأولى جعلت `planWa`/`prmDoWaInst` يفتحان المعاينة بدل الإرسال المباشر؛ المراجعة أظهرت أن ذلك يضيف نقرتين لمسار الاستدعاء (بسبب زر «✓ تم» المنفصل) ويترك تبويب الميلاد شاذاً ⇒ **رُجِع عنه بـ`patients.html` وأُبقي على المعاينة ببطاقة المريض** (`planWa`) حيث لا «تم» ولا تبويبات.

**(#243)**
**[اكتشاف جانبي — ليس باغاً]:** تعديل «الاسم» من مودال الأدمن لم يغيّر عنوان بطاقة العميل. الفحص على الكود الحيّ: `saveEdit()` يكتب `trial_requests.name` بنجاح، لكن عنوان البطاقة يقرأ **الاسم الحيّ** `clinic_settings.clinic_name` (`admin.html` سطر ~8944: `var _clinic = (r.user_id && clinicNameByUid[r.user_id]) ? ... : ''`) ويرجع لـ`r.name` فقط عند غيابه — **تصميم مقصود** (نمط «الاسم الحيّ» #243: الأدمن لا يدهس تسمية الطبيب). التغيير الفعلي يتم من إعدادات المستأجر نفسه. تُرك كما هو (تجميلي بحت).

**(#244)**
**التأطير الصحيح (أهم ما بالبند):** **قاعدة #223 لم تُخرَق** — السطوح الأربعة لـ`labs` سليمة، والحارس الثاني عشر `check-plan-gating.js` يفرضها ويمرّ أخضر. الفجوة **سطح خامس: مستهلِك داخل صفحة أخرى**، والحارس لا يغطّيه بالتصميم — نفس صنف `{booking_link}` بـ`pp-wa.js`. و**قاعدة #244 لا تنطبق**: تحقّقت أن `book.html` فيه **صفر** إشارة للمخابر والـRPCs العامة الوحيدة `booking_*` ⇒ لا سطح anon لـ`labs`/`lab_orders`. وأهم من ذلك: **بوابة صفحة labs.html نفسها عميل-سايد** (`__sydentRenderPlanBlock` يعيد كتابة `body`) ⇒ بوابة عميل ببطاقة المريض **مكافئة بالقوة تماماً** لما هو منشور، وRPC خادمي للمخابر وحدها كان سيتجاوز مستوى إنفاذ المنصة كلها.

**(#252 · #253 · #254)**
**قواعد جديدة #252–#254. #252 (ترقيم المرضى الذرّي بلا إعادة استخدام):** المعرّف الظاهر (`local_id` P001) فريد وثابت ولا يُعاد إصداره بعد الحذف (معيار OpenDental PatNum / AHIMA MRN)؛ per-tenant SaaS يبنيه صراحةً عبر عدّاد high-water-mark (`patient_seq`، لا ينقص) + دالة تخصيص ذرّية (`next_patient_seq`، upsert row-lock + GREATEST self-heal) + unique index `(doctor_id, local_id)` صمام أمان؛ كل موقع توليد يستدعي الـRPC ويبقي المنطق القديم fallback حرفياً (تدهور رشيق pre-migration)؛ الاستيراد يخصّص دفعة (n=rows). **#253 (تدقيق الحذف بمرجع باقٍ لا محذوف):** `audit_log.patient_id` عليه FK نحو patients فإدراج تدقيق حذف يشير للصف المحذوف = 23503→409 يضيّع السجل بصمت؛ مرّر `patientId: null` ووثّق الـuuid بـ`oldValue` (حرج مع ترقيم عدم-إعادة-الاستخدام: السجل هو الأثر الوحيد للرقم المحذوف)؛ نمط عام: تدقيق حذف كيان يشير لفاعل باقٍ أو ينقل معرّف الكيان لحقل بلا FK. **#254 (Portal للقوائم المنبثقة تحت أسلاف محوّلة):** أي قائمة `position:fixed` داخل عنصر عليه (أو سلفه) `transform` على `:hover` تُفسَّر إحداثياتها بفضاء ذلك العنصر لا الـviewport (مواصفة CSS: السلف المحوَّل = الحاوية المرجعية للـfixed) → لا تظهر/تقفز/ترفّ؛ الحل نقلها لـ`<body>` عند الفتح (مرجع مخزّن على الزر لأنها تفقد علاقة الشقيق) + تنظيف اليتائم عند إعادة الرسم؛ التموضع من `getBoundingClientRect` مع clamp للـviewport + قلب قرب الحافة + إغلاق عند السكرول.

**(#259 · #260 · #261 · #262)**
**قواعد جديدة #259–#262. #259 (كشف الحساب WYSIWYG display-only):** كشف حساب المريض عرض فقط من المصفوفات المحمّلة (`sessions`/`payments`/`adjustments`) بصفر استعلام/كتابة/migration؛ الصفوف = منجز (مدين) + دفعات (دائن) + تسويات (خصم/إعدام دائن، استرداد مدين عبر `adjKindLabel`)؛ رصيد سابق = مجموع ما قبل الفترة؛ صندوق الملخّص = `computeFinancials` على كامل الحساب (يطابق البطاقة حرفياً — معيار النجاح `closing = trueBalance − رصيد مقدّم`)؛ الطباعة عبر `printRoot`+`body.printing`+`window.print()` sync (iOS)؛ كل نص حر عبر `escapeHtml` (#195). **#260 (خطط الأقساط نموذج مشتق بالكامل — عزل مالي مطلق):** لا عمود `next_due` ولا hook على مسار الدفعات؛ الاستحقاق يُشتق حيّاً (`covered` منذ start_date مقصوص عند total → `k` → `start+k×period` بقصّ نهاية الشهر) فتسجيل الدفعة بالمسار العادي يحرّكه تلقائياً بصفر كتابة (offline-proof/self-healing)؛ دالتا الاشتقاق (`PlanAddPeriod`/`PlanCalc`) مرآة سلوكية patients↔patient-profile محروسة بـcheck-mirrors قسم D2 على متجهات تشمل الكبيسة وعبور السنة؛ الحساب ثنائي الاتجاه نمط Dentrix (الإجمالي↔القسط↔العدد)؛ Auto-Debit مرفوض (سوق يدوي) → تذكير واتساب. **#261 (مفاتيح ثابتة بالـDB + تسميات عرض للحقول المنظّمة):** أي حقل منظّم بمجموعة قيم (مصدر المريض) يخزّن مفاتيح إنكليزية مستقرة بـCHECK (`friend`/`search`/…) والتسميات العربية بطبقة العرض عبر دالة `label` (نمط أكواد التيارات)؛ الـDEFS مرآة بايت-بايت ×N + دالة الـlabel سلوكياً بـcheck-mirrors؛ التسميات ثوابت فقط = صفر سطح XSS؛ الاستيراد يقبل التسمية العربية أو المفتاح → المفتاح المستقر (مجهول → فارغ)؛ CHECK محروس بالاسم عبر DO block (idempotent). **#262 (علم عرض/تذكير بصفة boolean + graceful strip-from-payload):** أي علم عرض جديد على جدول قائم (asap) = `BOOLEAN NOT NULL DEFAULT false` + فهرس جزئي `WHERE flag` + طبقة عرض/تذكير صفر-جدولة؛ الـgraceful pre-migration يشطب العمود من الـpayload **نفسه** (لا من نسخة) فتخلو منه كل نسخ الـretry اللاحقة تلقائياً + `warnOnce` مرة/جلسة (يعمّم #250 لأعمدة الـpayload المتعددة النسخ)؛ الشارة/التوست ثوابت فقط (صفر XSS)؛ التوسعة لبوابة anon (`book.html`) خارج النطاق دائماً.

**(#263 · #264)**
**قواعد جديدة #263–#265. #263 (سجل توثيقي طبّي-قانوني معزول — نمط الزرعة):** أي سجل توثيقي جديد مرتبط بسن/مريض (implant_log) = جدول مستقل نمط M58 (owner_id CASCADE + RLS owner_all + `tooth_num TEXT` يطابق teeth_status/M55 + فهرس owner+patient+created_at DESC + ذيل #238)؛ **طبقة توثيق بحتة: صفر كتابة مالية، صفر تغيير هندسة المخطط**؛ graceful pre-migration بكاشف جدول-مفقود (42P01/PGRST205) نمط `_isPaymentSplitsTableMissing` → توست «يلزم Migration N»؛ حارس الطبيب غير النشط (Phase 4.1) على الكتابة؛ `logAudit` create/delete بوصف مُحلّ (الحذف يحلّ الوصف من الكاش **قبل** الحذف)؛ كل نص حر عبر `escapeHtml` (#195)؛ صفوف متعددة لكل سن مسموحة (أحدث أولاً). **#264 (بانر شرطي بمودال متعدد المسارات — إخفاء افتراضي إلزامي):** أي عنصر شرطي يُدرج بمودال له مسارات `return` مبكرة (openToothModal: regional/exam/batch/history) **يجب إخفاؤه افتراضياً عند كل فتحة** بأنكور يسبق كل مسارات الـreturn (وليس فقط إظهاره شرطياً)، وإلا يتسرّب من فتحة سابقة عبر المسار المبكر؛ الإظهار الشرطي يوضع بعد ضبط عنوان المودال بالمسار الطبيعي. **#265 (خرائط تسميات التدقيق مزدوجة — سدّ الفجوة القديمة عند أي مفتاح جديد):** أي `action_type` جديد يُسجَّل عبر `logAudit` يلزمه (١) بادئته بـ`VALID_ACTION_PREFIXES` بـ`supabase-init.js` (وإلا تحذير console soft + يستلزم cache-bust أسطولي)، (٢) تسميته العربية بخريطتين: `actionLabels` المسطّحة بـ`patient-profile` (تبويب النشاطات) و`entityMap` المشتقّة بـ`audit-log.html` (السجل المركزي)؛ عند إضافة أي مفتاح، افحص المفاتيح السريرية القديمة (prescription/postop_note) — قد تكون ناقصة من زمن P1/P6 وتُرسم خاماً، فسدّها بنفس الكومِت.

**(#270)**
**قواعد v150 (#270–#274) سارية.** **HEAD `baeb850` · SW_VERSION v11 · Migrations حتى 98 (التالي 99) · باكلوغ AI: #1 ✅ · #2 ✅ (أساس مشترك ✅) · النسخة المنشورة لـai-assist = محتوى `97e33ad` (ميزتان + 3 بوابات) · التالي (كله بانتظار رصيد Anthropic): شحن 5$ → اختبار #1+#2 الحيّ + بناء تجاوز الأدمن per-account + AI #3 chatbot (بعد حسم قراريه) · والأولويات القائمة: تدوير Resend + PAT `SyDent-dev` + DMARC→reject + restore-test.** ⤵️ V151EOF

**(#270 · #271 · #272 · #273 · #274)**
**قواعد مرشّحة جديدة:** **#270 (بوابة الميزة غير-الصفحة):** ميزة AI/غير-صفحة تُبوَّب بنمط `booking` (تُضاف لـ`PLAN_ENTITLEMENT_DEFS` + تُفرَض عند الميزة)، لا نمط الأسطح الأربعة. **#271 (فرض بوابات الـAI سيرفر-سايد):** opt-in + الخطة يُفحصان بالـEdge Function (السيرفر هو الحدّ الأمني؛ العميل UX)؛ fail-open. **#272 (إنسان بالحلقة للمحتوى السريري):** AI يقترح، الطبيب يراجع/يعدّل/يؤكّد، ثم يُحفَظ — ممنوع حفظ تلقائي. **#273 (تجريد الهوية قبل API خارجي):** سياق سريري فقط، لا معرّف مريض. **#274 (تسجيل استهلاك non-fatal):** فشل العدّاد لا يوقف الميزة.

**(#277 · #278 · #279 · #280)**
**آخر تحديث:** 21 تموز 2026 (v154) — **جلسة تحسينات ملف المريض: (أ) بطاقات بارزة + فواصل رأسية · (ب) قوالب سجل الزرعات (نظير قوالب التعليمات، Migration 99) · (ج) عزل bidi لسطر المواصفة · (د) إعادة ترقيم الميغريشن 98→99 — 4 كومِتات `9d09f1e`→`c8b74b9`→`9df7d25`→`fa23ea8` فوق `a89c472`، `patient-profile.html` inline + `sw.js` + ملف migration، صفر مساس مالي (طبقة توثيق فقط)، صفر cache-bust (SW bump بدله)، الحُرّاس السبعة خضر بكل كومِت، live-verified ✅ بصور المالك.** **(أ) `9d09f1e` بطاقات بارزة + فواصل (بلاغ المالك بصورة: بطاقات تبويب الملف ملتصقة/غير مفهومة):** الجذر — `.card` (سطر 124) بلا `margin-bottom` بينما `.two-col`/`.chart-card` عندهم 20px، فبطاقات `#familyCard`/`#plannedApptsCard`/`#implantsCard` (كلها `.card`) تلتصق فوق بعض. الحل: (١) `#familyCard,#plannedApptsCard,#implantsCard,#adjustmentsCard,#paymentPlanCard{margin-bottom:20px}` (IDs لا الكلاس العام حتى لا تتضاعف مسافة بطاقتي `.two-col`؛ ضُمّت بطاقتا تبويب الحسابات بطلب المالك)؛ (٢) `box-shadow:var(--shadow-card)` على `.card` و`.chart-card` — التوكن theme-aware المستعمل أصلاً بـ`kpi`(index)/`shub-card`(settings)/`treat-card`(treatments) فيطلع صح بالوضعين تلقائياً. SW v12→v13. **(ب) `c8b74b9` قوالب سجل الزرعات (Migration 99، live-tested ✅) — نسخة رابعة حرفية من نمط `post_op_templates`:** الطلب (المالك): سجل الزرعات لازم يكون فيه قوالب نفس طريقة قوالب الروشتات والتعليمات. البحث: 3 عائلات قوالب قائمة بنفس النمط (`prescription_templates`/`post_op_templates`/`clinical_note_templates`)، كلها نسخ من بعض. **Migration 99 (`99_implant_templates.sql`، مطبّقة ✓):** جدول `implant_templates` نسخة طبق الأصل من M95/M56 (id/owner_id FK CASCADE/name NOT NULL/brand/ref_no/diameter NUMERIC/length NUMERIC/notes/created_at + RLS `owner_id=auth.uid()` + index owner_id) — **الحمولة = المواصفة القابلة لإعادة الاستخدام فقط** (ماركة/Ref/قطر/طول/ملاحظات)؛ **مستثنى عن قصد:** `lot_no` (رقم تشغيلة فريد لكل زرعة فيزيائية) + `placed_at`/`loaded_at` (تواريخ خاصة بكل إجراء). **UI في `#implantModal`:** بيكر «تعبئة من قالب» (`#implantTemplatePick` + زر «القوالب») أعلى قسم الإضافة + خانة «احفظ كقالب» (`#implantSaveAsTemplate` + حقل اسم `#implantTemplateName`) قبل الفوتر — ستايل مطابق حرفياً لمودال التعليمات. **مودالان:** `#implantTemplatesModal` (قائمة/تعديل/حذف) + `#implantTemplateEditModal`. **8 دوال** نظير post_op: `loadImplantTemplates`/`implantPopulateTemplatePicker`/`implantApplyTemplate`/`openImplantTemplatesModal`/`renderImplantTemplatesList`/`openImplantTemplateEdit`/`saveImplantTemplate`/`deleteImplantTemplate` + 3 state vars (`IMPLANT_TEMPLATES`/`_implantEditingTemplateId`/`_saveImplantTplInFlight`) + حارس `_isImplantTplTableMissing`. **الربط:** `openImplantLog` يعبّي البيكر + يصفّر خانة الحفظ (lazy-load نظير postop)؛ `saveImplantLog` لو الخانة مفعّلة يحفظ قالباً من نفس المواصفة **بـtry/catch منفصل + toast موحّد (`_tplMsg`)**: فشل حفظ القالب أو غياب الجدول pre-migration لا يمسّ نجاح حفظ السجل الأساسي أبداً. `implantApplyTemplate` يملأ ilBrand/ilRef/ilDiameter/ilLength/ilNotes فقط — **لا يلمس ilLot/ilPlaced/ilLoaded**. graceful pre-migration: البيكر فاضي + toast «يلزم Migration 99». proof 27 تأكيد + الحُرّاس السبعة (توازن DIV للمودالين). SW v13→v14. **(ج) `9df7d25` عزل bidi لسطر مواصفة الزرعة (بلاغ المالك بصورة: `Ref: sw — Lot: 54 — مم Swies — ø4.3×11` مبعثر):** الجذر — مزيج تقني لاتيني-الطابع (Ref/Lot/⌀/أرقام + «مم» العربية) داخل بطاقة RTL يُعيد المتصفّح ترتيب مقاطعه بصرياً (bidi) رغم أن البيانات مخزّنة صح. الحل عند المصدر: `_implantSpecLine` يلفّ الناتج بـ`<span dir="ltr" style="unicode-bidi:isolate;">…</span>` (يعيد `''` عند الفراغ فيبقى fallback الـ`|| '—'` سليماً) — يغطّي بطاقة الزرعات + قائمة المودال؛ ونفس العزل بـ`renderImplantTemplatesList`. تغيير شكلي بحت (البيانات + escapeHtml بلا مساس). الناتج المنطقي الثابت: `Swies — ⌀4.3×11 مم — Ref: sw — Lot: 54`. SW v14→v15. **(د) `fa23ea8` إعادة ترقيم الميغريشن 98→99 (Rule #19):** كشف عند تحديث السياق أن رقم 98 محجوز أصلاً لميغريشن ميزات AI (طُبّق DB-only بلا ملف مرقّم، v150) وملف السياق يوثّق «التالي 99» — فسُمّي ملف الزرعات بالغلط `98_`. `git mv 98→99_implant_templates.sql` + تحديث كل مراجع الكود (توستات + تعليقات) Migration 98→99؛ الجدول مطبّق فعلاً وشغّال (الـSQL number-agnostic — لا إعادة تطبيق). SW v15→v16. **قواعد مرشّحة #277–#280. #277 (بطاقات بارزة + فواصل):** الإبراز عبر توكن الظل الموحّد `--shadow-card` (theme-aware، نظير kpi/shub-card/treat-card) لا قيمة محفورة؛ والفواصل بين البطاقات المتلاصقة عبر margin-bottom على الـIDs (الأصل `.card` بلا margin يخلّيها تلتصق؛ الـIDs تتجنّب مضاعفة مسافة بطاقات `.two-col`). **#278 (قوالب الزرعات = نسخة post_op رابعة):** load/populate/apply/openModal/renderList/openEdit/save/delete + بيكر + حفظ-كقالب + graceful pre-migration؛ الحمولة = المواصفة القابلة لإعادة الاستخدام فقط (ماركة/Ref/قطر/طول/ملاحظات)، وLot#/التواريخ مستثناة (خاصة بكل سجل فيزيائي)؛ حفظ-كقالب داخل مسار حفظ السجل بـtry/catch منفصل + toast موحّد فلا يمسّ نجاح الحفظ الأساسي. **#279 (عزل bidi للسلاسل التقنية داخل RTL):** أي سلسلة لاتينية-الطابع (Ref/Lot/⌀/أرقام + وحدات عربية كـ«مم») تُعرض داخل حاوية RTL تُلفّ بـ`<span dir=ltr style=unicode-bidi:isolate>` عند المصدر (تعيد `''` عند الفراغ لتبقى fallbacks الـ`|| '—'` سليمة) — يمنع إعادة ترتيب المقاطع بصرياً دون تغيير البيانات. **#280 (أرقام الميغريشن لا تُعاد — امتداد #19):** قبل تسمية ميغريشن جديد تحقّق من «التالي N» بملف السياق **والريبو الحي**؛ بعض الميغريشنات مطبّقة DB-only بلا ملف مرقّم فتترك فجوة (98 = AI-features DB-only)، فأخذ آخر رقم-ملف +1 قد يصطدم برقم محجوز منطقياً. **HEAD `fa23ea8` · SW_VERSION v16 · Migration 99 (`implant_templates`) مطبّقة ✓ (التالي 100) · بنية جديدة: جدول `implant_templates` + بيكر/مودالا القوالب + 8 دوال بـpatient-profile.html · التالي (بلا تغيير): الشغلات الأمنية — تدوير Resend API key [إلزامي قبل أول عميل مدفوع] + PAT `SyDent-dev` احترازي + DMARC→`p=reject` + restore-test؛ ومؤجّلات AI.** ⤵️ V154EOF

**(#281 · #282 · #283 · #284 · #285 · #286 · #287 · #288 · #289)**
**قواعد مرشّحة #281–#289. #281:** الحُرّاس يجب أن تعمل في CI على push/PR لا محلياً فقط (Cloudflare ينشر تلقائياً من الفرع → forgotten local run = كود مكسور للإنتاج). **#282:** فصل النشر عن الدمج عبر فرع `release` + promote-on-green = «الكود يصل ≠ يُنشر»؛ يحافظ على سرعة push-to-main مع بوابة محكمة حتى مع الدفع المباشر. **#283:** النشر يُنشر أصول الويب فقط (build-publish denylist) — لا تُخدَم ملفات المصدر/العمليات (docs/scripts/migrations/db/*.md/*.pdf/*.sql) على الدومين. **#284:** حارس XSS يغطّي القوالب الفرعية (HTML مخزّن بمتغيّر) لا الإسناد المباشر فقط، ويستهدف حقول النص الحر؛ الحالات الآمنة تُوثَّق بـ`xss-ok` داخل `${}`. **#285:** تدوير أي سرّ = إنشاء-جديد + تبديل + **تحقّق بإرسال/استدعاء حقيقي** + حذف-القديم (اختبار-قبل-الحذف = صفر انقطاع). **#286:** CSP تُطلق Report-Only → **تحقّق الرأس واصل (Response Headers) + صفر مخالفات console** → enforce (لا enforce أعمى). **#287:** `<meta http-equiv="Cache-Control">` داخل الصفحات تسبب كاش متصفح عنيداً وتتعارض مع رؤوس HTTP — يُفضَّل الاعتماد على رؤوس HTTP الحقيقية (تنظيف الـmeta backlog). **#288:** schema-snapshot = schema-as-code يلتقط الجداول الأساسية الغائبة عن ملفات الميغريشن (1–9)؛ يجعل الريبو قابلاً لإعادة البناء. **#289:** تواريخ انتهاء التوكنات تُتحقَّق من GitHub الحيّ لا من الذاكرة/التوثيق (الذاكرة قالت «ينتهي 22 تموز 2026» بينما الحيّ Jun 2027 — والملف كان صحيحاً).

**(#290 · #291 · #292)**
**قواعد مرشّحة #290–#292. #290 (ميزة AI جديدة = feature string على `ai-assist` القائم):** أي ميزة AI إضافية تُبنى كـ(system prompt + فرع build بالـEdge Function) + زر داخل حاوية `body.ai-on` — **بلا migration/mirror/أسطح-بوابة** (البوابة والـopt-in سيرفر-سايد تغطّيان كل الـfeatures تلقائياً). قراءة `ledger_sessions` للعرض/التلخيص مشروعة (صفر كتابة = لا خرق للعزل المالي). **#291 (مخرجات AI للمريض/الإرسال الخارجي = نص عادي بلا markdown):** أي مخرج موجّه للمريض أو لواتساب يُمنع فيه markdown (`#`/`*`/`**`) بقاعدة صريحة بالـprompt (يظهر حرفياً بواتساب)؛ العناوين نص عادي متبوع بنقطتين، والرموز التعبيرية الوظيفية (⚠️) مسموحة نقطياً. **#292 (المبالغ المالية بمخرجات AI):** فرض كتابة كل مبلغ بالأرقام + فواصل الآلاف ومنسوخاً حرفياً من المدخل (لا حروف، لا إعادة حساب) — يمنع تباين الصياغة بين التوليدات وأي خطأ بالمبالغ.

**(#293 · #294 · #295 · #296 · #297)**
**قواعد مرشّحة #293–#297. #293 (تكافؤ التطبيق الثالث للصيغة — امتداد #276):** صيغة رصيد مطبَّقة بسطح بنيوي ثالث (لوحة `index.html`) تُقفَل بنفس هارنس التكافؤ async+mock مع إعادة استخدام متجهات بلوك D؛ يغلق «اللوحة تعرض رصيداً مختلفاً عن الملف/القائمة». **#294 (قفل محرّك P&L المحاسبة):** الإيراد/المصاريف/التسويات على مستوى العيادة + هويّة صافي الربح تُقفَل ككتلة؛ كتلة هويّة `render()` (حساب بحت) تُقتَصّ بمرساة نصّية (صفر DOM) وتُربَط بالمكوّنات عبر ثابت `netProfit=(revenue−refunds)−totalExpenses`؛ de-dup الـlegacy (دفعة إلها splits لا تُعدّ مرتين) = الفخّ الصامت الحرج. **#295 (قفل المال الخارج):** دفعة الطبيب (`computeSuggestion`) وأداء الطبيب (`computeProviderStats`) نقيّان فوق globals+بارامترات → قابلان للحارس؛ حارس منع الدفع المزدوج (طرح ما دُفع سابقاً في فترة متداخلة، `breakdown_share` فقط عند التفصيل) = القفل الحرج؛ `resolveSharePct`/`providerLabCost` يُستخرجان معها. **#296 (قفل دالة معتمدة DOM+تاريخ):** دالة عرض تكتب DOM وتقرأ التاريخ الحالي (`computeStats`) تبقى قابلة للحارس بحقن `Date` ثابت + `$`/`fmtAmount` shims وقراءة `textContent`؛ تُقفَل حدود النوافذ (`>=` شامل + تعشيش `today≤week≤month≤year`). **#297 (اكتمال توسيع الحارس):** بعد 12 بلوكاً استُنفد السطح المالي/الحرج النقي أو القابل للعزل بـshim خفيف؛ المتبقّي (`next_patient_seq` SQL · reallocate/save/persist كتابة DB) خارج النمط → توثيق-عقد/تكامل، مؤجّل بقرار.

**(#298 · #299)**
**قواعد مرشّحة #298–#299. #298 (وسوم الكاش meta = no-op بعد SW network-first):** وسوم `http-equiv` Cache-Control/Pragma/Expires بقايا ما قبل الـSW؛ المتصفّح يتجاهلها والآلية الفعلية = `_headers` (صفر cache-control على HTML، فقط `/sw.js`) + SW network-first، فحذفها **آمن (no-op بلا regression)** بشرط صفر حارس/JS/build يعتمد عليها؛ وأيّ تعديل HTML-only لا يمسّ الأصول الخمسة المشتركة = **صفر cache-bust وصفر SW bump** (network-first يكفي — سابقة v156)؛ وحارس «صفر تغيير بنيوي» بـ`cache-bust.sh` يرفض تشغيله فوق diff غير-`?v=` (فالترتيب: تنظيف بكومِت منفصل قبل أيّ bump مستقبلي). **#299 (a11y: `for`/`id` مفضّل على aria-label للـlabel المرئي):** الحقل ذو label مرئي غير مربوط يُصلَح بإضافة `for="id"` للـlabel القائم (الاسم الـaccessible = النص المرئي، **Label-in-Name بالبناء، صفر تكرار/drift**، والضغط يفوكس الحقل) لا بـaria-label (يكرّر النص ويخاطر بالانحراف عند تغيّر الـlabel المرئي)؛ والتغطية بمودال كامل أنفع لقارئ الشاشة من حقول متناثرة.

**(#301)**
**قاعدة مرشّحة #300 (DR drill = عملية تشغيلية توثيق-فقط، لا تغيّر الريبو):** تمرين التعافي لا يُنتج أيّ commit فلا يمسّ HEAD/SW/migrations؛ يُوثَّق كملخّص جلسة + إغلاق البند بالـRebuild Runbook والـHardening Plan، **مع التحقّق من HEAD/SW الحيّ عبر GitHub API قبل تدوين الحالة** (Rule #19 — الملف الحيّ لا البرومبت/الذاكرة؛ صحّحنا هنا `4d9ae31`→`69487c2`، SW16→v17، و«شحن Anthropic» المتقادم). ثوابت الاسترجاع المثبّتة: **psql 17+** إلزامي (GSSAPI مع الـpooler) · **الترتيب roles→schema→data** حصريّ · **`SET session_replication_role=replica`** على data يتجاوز قيود الـFK/triggers · أخطاء `already exists` و`permission denied` على جدولَي Supabase-AI النظاميين **متوقّعة وغير ضارّة** خارج النطاق. **قاعدة مرشّحة #301 (توثيق ما لا يُحدَّث):** قبل الاعتماد على «الملف محدَّث» تحقّق من الملف الفعلي بـproject knowledge (الرَنبوك بقي فارغاً رغم أن النص كُتب بجلسة سابقة لأن إنشاء الملفات كان مطفّياً) — والادّعاء بأن ملفاً حُدِّث يجب أن يطابق حالته الفعلية.

**(#305)**
**قاعدة مرشّحة #304 (CI deploy للـEdge Functions):** النشر عبر `edge-deploy.yml` حصراً (push يلمس `supabase/functions/**` أو dispatch يدوي) — لا نسخ-لصق بالداشبورد إلا كـfallback طارئ؛ `--no-verify-jwt` لا يُحذف أبداً من أوامر الـdeploy (مثبَّت أيضاً بـ`config.toml`)؛ أسرار الـfunctions (مثل `ANTHROPIC_API_KEY`) تُدار من داشبورد Supabase لا من الـCI؛ وعند رفض push بسبب جلسات موازية: fetch+rebase+إعادة الحُرّاس قبل الإعادة (لا force أبداً). **قاعدة مرشّحة #305 (فصل الأعراض عن البند الجاري):** أخطاء console المكتشفة أثناء تحقّق بند ما تُشخَّص فوراً (Rule #19) لكن تُفصل كبند جديد ولا تعطّل إغلاق البند الجاري إذا ثبت أنها غير مرتبطة به.

**(#307)**
**قاعدة مرشّحة #306 (تعديل CSP/`_headers` لا يصل للـService Worker الشغّال):** الـSW يحتفظ بسياسة الأمان التي خُدم بها لحظة التثبيت؛ فأي تعديل على `_headers` (CSP أو غيره) يؤثّر على طلبات تمرّ عبر الـSW **يتطلّب رفع `SW_VERSION` في نفس الجلسة** وإلا بقي العامل القديم يطبّق السياسة القديمة إلى الأبد — ولا ينفع hard refresh ولا نشر Cloudflare. الأعراض المميِّزة: الخطأ يقتبس قائمة directive قديمة ومصدره `sw.js:<line>` لا الصفحة. **قاعدة مرشّحة #307 (`connect-src` يحكم كل fetch مهما كان نوع المورد):** السماح بمورد في `style-src`/`font-src`/`script-src` يغطّي التحميل التصريحي (`<link>`/`<script>`) فقط؛ أي جلب برمجي (`fetch()`/XHR — سواء من الصفحة أو من داخل الـSW أو أثناء تسخين كاش الأوفلاين) يخضع لـ`connect-src` حصراً. عند اعتراض الـSW لأصول خارجية يجب أن تُدرج نفس الأصول في `connect-src` أيضاً.

**(#309 · #310 · #311)**
**قواعد مرشّحة #309–#311. #309 (سكّ جلسة E2E بلا كابتشا):** حين تكون حماية الكابتشا مفعّلة على مستوى المشروع (تطال sign-in وpassword grant)، لا يُحَل الاختبار الآلي بمفتاح كابتشا اختباري (يُرفض سيرفرياً) ولا بتعديل كود الإنتاج؛ يُحَل بمسار admin معفى: `generate_link` → استهلاك (`verify` بـtoken_hash، واحتياطاً fragment الـaction_link) → تركيب الجلسة بصيغة الـ`storageKey` الحيّة المستخرَجة من الكود لا من الذاكرة → حقنها كـ`storageState`؛ ومفتاح السرّ يبقى بأسرار الـCI حصراً (لا متصفح — #123 محفوظة)، ولا يُوسَّع سطح أي دالة إنتاجية لأجل الاختبار. **#310 (إعادة المحاولة الصاخبة والانتقائية):** تُعاد فقط الحالات غير الحتمية (403 المرصود · 5xx · فشل شبكة)، و**401/404/422 لا تُعاد أبداً** كي لا يختبئ خطأ إعداد وراء تأخير؛ كل محاولة تُسجَّل بحالتها ويُصرَّح بالإنقاذ عند حدوثه فيورّث الفشلُ معلومةً؛ ويُصرَّح بالتوثيق أن الإصلاح مرجَّح لا مؤكَّد مع ذكر المسارات البديلة. **درس تابع:** `Number(null) === 0` — أي دالة تصنّف رموز حالة تحتاج حارساً صريحاً لـ`null/undefined/''` وإلا صُنِّفت «فشل شبكة». **#311 (عزل بيئة الاختبار):** مجلد `e2e/` معزول (تبعياته لا تلمس الجذر) ومستثنى من `build-dist.sh` بمرساة صريحة مع **خطوة إثبات داخل الـCI** (`dist` بلا `e2e`)؛ الأسرار `process.env` حصراً و`storageState` untracked؛ الحُرّاس تفحص جذر الريبو فقط (`readdirSync(ROOT)`/`*.html`) والوحيد العابر للشجرة (`check-cdn-order.sh:24`) يستثني `e2e` و`node_modules` — فأي حارس عابر مستقبلاً يجب أن يستثنيهما.

**(#309 · #310 · #311 · #312 · #313 · #314 · #315)**
**قاعدة مرشّحة #308 (الاستضافة الذاتية للأصول الخارجية الحرجة):** كل أصل خارجي حرج يُستضاف ذاتياً باسم **مُرقَّم بالنسخة** + SHA-256 موثَّق بـ`vendor/README.md` + فحص سلامة قبل الاعتماد؛ **صفر أوسمة عائمة** (`@2`) — الوسم العائم يعني أن إصدار طرف ثالث يصل لكل العيادات بلا commit؛ الاسم المُرقَّم يجعل الترقية commit صريحاً وصفر-كاش بنيوياً (خارج `cache-bust.sh`). **قاعدة مرشّحة #309 (استثناء `book.html` المعماري):** القاعدة «لا يُمسّ» تحمي من التغييرات **السلوكية**؛ تغيير مصدر مكتبة ليس سلوكياً — لكنه **يبقى قراراً يُعرَض على المالك صراحةً** قبل التنفيذ، ويُوثَّق. **قاعدة مرشّحة #310 (`activate` يجب أن يورّث لا أن يُبيد):** حذف كاشات الإصدار السابق بلا ترحيل يمسح تغطية الأوفلاين عند كل رفعة SW؛ الأصول ذات المفاتيح الدقيقة (URL) تُنسَخ بأمان، أما **الصفحات فتُعاد جلبها طازجة لا تُنسَخ** (HTML قديم قد يشير لأصول أُزيلت)، مع قائمة محفوظة للاستئناف لو جرى الترحيل بلا اتصال. **قاعدة مرشّحة #311 (الكاش عبر pretty-URL redirect):** مع Cloudflare Pages، رابط `*.html` يقفز 308؛ رفض `redirected` بكاش التنقّلات يعني أن الصفحة **لا تُكاش أبداً**؛ الحل: كاش الاستجابة النهائية بمفتاح URL النهائي + **غسل علم `redirected`** بإعادة بناء الجسد (Chrome يرفض خدمتها للتنقّلات). **قاعدة مرشّحة #312 (`type === 'cors'` مواطن أول بالكاش):** أي مورد يُجلب بنمط CORS (وأبرزه ملفات الخطوط من CSS) لا يكون `basic` ولا `opaque`؛ شرط كاش يقبل الاثنين فقط **يُسقط الخطوط صامتاً للأبد**. **قاعدة مرشّحة #313 (باراميترات النيّة أحادية الاستهلاك):** أي باراميتر يفتح مودالاً/يشغّل فعلاً يجب أن يُستهلك مرة ثم يُمسح بـ`replaceState`، **ومشروطاً بنوع تنقّل حقيقي** (`navigate`) — لأن مدخلات التاريخ القديمة تبقى حاملةً له بعد الإصلاح، وreload/back-forward يجب ألا يعيدا تشغيل الفعل. **قاعدة مرشّحة #314 (الحارس يُختبَر بالعضّ قبل اعتماده):** أي حارس جديد يُثبَت بكسر متعمّد للسلوك الذي يحرسه (نظيف 0 → مكسور 1 → مستعاد 0)؛ فشل العضّ = ثغرة تغطية بالحارس لا سلامة بالكود — وقد حدث فعلاً هذه الجلسة. **قاعدة مرشّحة #315 (التوقّع ليس تشخيصاً):** «سيختفي بعد جلسة أونلاين» قيلت للمالك عن أسطر الخطوط وكانت **خاطئة**؛ إعادة اختباره كشفت باغاً عمره من عمر الميزة. أي عرَض يتكرّر بعد تفسيره بـ«طبيعي» يُعاد فتحه بتحقيق كودي لا بتطمين.

**(#312)**
**[📄 وثيقة التسليم: ملحق ج ثم v4 → v5]:** أُضيف **ملحق ج** (يَجُبّ ب): طبقة E2E كاملة (الخمس سيناريوهات · المستأجر المعزول · سكّ الجلسة · عقد التنظيف الذاتي بترتيب FK المالي) · التشغيل محلياً وبالـCI و**أن `.github/actions/e2e-run` مصدر الحقيقة الوحيد** · قفل `e2e-tenant` المشترك · حالة البوابة وصمّامها · **دليل فرز حين يحمرّ E2E** (اقرأ الـcall log — `resolved to` تعني العنصر موجود والمشكلة بحالته؛ استخرج العقود بأرقام أسطر؛ **لا تُصلح بـ`waitForTimeout`**؛ **ولا تعطّل اختباراً لتمرير كومِت**) · سياسة `data-test` وجرد الـ**14** سمة · باغ الشارات وقاعدة #318 · القواعد #312–#318 · فجوة الترحيلات (ثم أُغلقت بنفس الجلسة) · جدول المتبقّي.

**(#312 · #313 · #314 · #315)**
**قواعد مرشّحة #312–#315. #312 (لا يُخمَّن عقدٌ أبداً):** أسماء بارامترات RPC، ومحدِّدات DOM، ودلالات العرض (أي صفوف يعرضها العرض أصلاً) تُستخرَج من الكود الحي بأرقام أسطر قبل كتابة أي توكيد — خرقها كلّف أربع جولات من أصل سبع. **#313 (صفر مهلة عمياء):** كل `await` بالاختبارات محكوم بمهلة خاصة أقصر من ميزانية الاختبار — نداءات الشبكة بـ`AbortSignal.timeout`، وأفعال المتصفح بـ`actionTimeout`/`navigationTimeout` (افتراض Playwright «بلا مهلة» هو منبع الفشل الصامت)؛ ويُسجَّل كل نداء بحالته وزمنه فيشرح الفشلُ نفسه. **#314 (ظاهر ≠ جاهز):** ظهور عنصر (سايدبار/overlay) لا يدلّ على اكتمال تهيئة الصفحة أو المودال؛ يُنتظَر على **إشارة الصفحة نفسها** (متغيّر حالة عبر `waitForFunction`)، وأي تفاعل يقع بعد `await` داخلي يُغلَّف بحلقة تقارب مع فخّ استقرار يكشف الدوس المتأخر. وأي واجهة تُعيد الرندر أو تكنس عناصر Portal تُلامَس بحلقة ذرّية لا بنقرتين منفصلتين. **#315 (توكيد إيجابي بلغة الكود):** يُوكَّد على الصنف المشتقّ من الحالة (`status-*`) لا على النص المعروض — النص مقرون باللغة و`not.toHaveText` ينجح صدفةً بأي تغيّر عرضي؛ ويُتحقَّق أولاً أن العرض المستهدَف **يعرض** الصف المُوكَّد عليه أصلاً.

**(#316 · #317 · #318)**
**قواعد مرشّحة #316–#318. #316 (المودال قد يعيد تعبئة حقوله بعدك):** استدعاء تعبئة `async` غير-awaited داخل فاتح المودال يدوس أي قيمة كُتبت قبل عودته ⇒ يُغلَّف الاختيار بحلقة تقارب ذات فخّ استقرار، **وأي إعادة نقر على زر حفظ بلا حارس in-flight تُقيَّد ببصمة الارتداد حصراً** (وإلا تُنشأ سجلات مكرّرة). **#317 (مرسوم ≠ مرئي):** العنصر داخل لوحة غير نشطة موجود بالـDOM ومخفي؛ التوكيد داخل المساعدات على **الوجود**، والمرئي بعد فتح تبويبه صراحةً وانتظار `.active` — ولا يُخلط بين «لم يُكتب» و«لم يُعرض». **#318 (ليس كل ما يُكتب يُعاد رسمه):** بعد أي عملية تغيّر حالة مشتقّة، تُدقَّق **قائمة الرندر لكل مسار يستدعي المُحدِّث** لا المسار المُصاب وحده — الصنف الواحد يسكن عادةً عدة مسارات (هنا 3 من 10)، والمرجع هو المسار الشقيق الصحيح لمطابقة الترتيب بايتياً.

**(#316 · #317 · #318 · #319 · #320)**
**قواعد مرشّحة #316–#320. #316 (المخرج المهيكل يُبنى بالعميل لا بالموديل):** أي تجميع/فرز/جمع بمخرج AI يُحسب deterministic بالعميل ويُمرَّر جاهزاً بالحمولة، والبرومبت يُلزَم بنسخه حرفياً — الموديل للصياغة لا للحساب أو التمييز. **#317 (التسمية للمريض ≠ التسمية السريرية):** أي معرّف تقني موجّه للمريض (رقم سن FDI…) يُترجَم لاسم مفهوم بالاصطلاح المحلي للسوق المستهدف، والرقم يُبقى بين قوسين للدقة؛ الاصطلاح يُؤخذ من المالك لا من المرجع الأكاديمي (قاطع/رباعية/الرحى الثالثة). **#318 (التوجيه المشترك = دالة واحدة):** وضعان يشتركان بدلالة النقر (الفحص الأولي والتحديد المتعدد) يستدعيان **الدالة نفسها** (`examRouteSurface`) — أي نسخ للمنطق يولّد انحرافاً صامتاً، وأي إصلاح بها ينفع الوضعين معاً. **#319 (التفريع على `target_part` هشّ — اشتقّ من الأثر لا من النية):** التسميات والقرارات العرضية تُشتق من **كود السطح المكتوب فعلياً**، لا من `target_part` المُعلَن؛ القيم النادرة (`both`) تسقط للفرع الافتراضي بصمت وتنتج نصاً كاذباً. عند الحاجة للتفريع على النوع، تُغطّى **كل** القيم الحيّة المستخرجة من `treatments.html` لا المتذكَّرة. **#320 (الوحدة السريرية = وحدة الحفظ):** إدخال متعدد المواضع يُدمج بوحدات سريرية قبل الحفظ (أسطح السن الواحد = ترميم واحد؛ جذوره = معالجة واحدة) وبنفس بنّائي الأكواد القانونية للمسار الفردي — الواجهة تعرض العدد **بعد** الدمج كي لا يوهم المستخدم بجلسات وأسعار مضاعفة.

**(#318)**
**[🔧 إصلاح الإنتاج #318 — `8ea217c`]:** دُقّقت **كل** مواقع `reallocatePatientFunds()` العشرة، فتبيّن أن الصنف يصيب **ثلاثة** مسارات لا واحداً — كلها مسارات تغيير دفعات: **`savePayment` (12372)** · **`delPayment` (11843)** · **مستمع المزامنة الأوفلاين `sydent-payments-synced` (17489، حارس try/catch محفوظ)**. السبعة الباقية كانت سليمة أصلاً، ومنها المسار الشقيق (`saveManualSplits`/`revertToFifo`) الذي صار الترتيب الجديد **مطابقاً له بايتياً**. وأُضيفت `renderRecentSessions` كذلك لأنها تقرأ `computeSessionPaid` هي أيضاً ⇒ كانت بايتة بدورها.

**(#318)**
**[البراهين — أربع مجموعات على كود حي مُستخرَج]:** `prove` المالي **23/23** (منها: `fmt` الحية مستخرَجة بـ`vm` ومقارنة بـ`digitsOf` على متجهات السيناريو والحواف · عتبة `fullyPaid = sessPaid >= cost − 0.5` الحية · تفرّد السمات الست · مسار الكنس المالي مزدوج القيد ورفض الحذف الأعمى · `ymdLocal(-1) < اليوم`) · `render` إصلاح #318 **28/28** (كل مسار realloc يعيد الرسم · **ترتيب الرندر-بعد-التوزيع** · حارس try/catch المستمع · الثلاثة السليمة سلفاً بلا مساس · **صفر نداء كتابة** بالأسطر المعدَّلة) · البرهان البنيوي لـب٣ **14/14** على الـYAML الثلاثة **بعد parse فعلي** (منها: `promote.needs == guards` حصراً · شرط push-only · المجموعة المشتركة وبلا إلغاء وسطي · **صفر خطوات تشغيل منسوخة** بالغلافين · `shell: bash` بكل خطوة composite · تمرير الأسرار الصريح · اسم artifact فريد) · يُضاف: `tsc --noEmit` نظيف · `playwright test --list` يسجّل **٥ specs** · `build-dist` ثم إثبات `dist` بلا `e2e` **وبلا `.github`** · الحُرّاس التسعة. **مطبّ انصاد قبل الدفع:** نقطتان داخل قيمة `name` غير مقتبسة كسرتا الـYAML — صادهما البرهان البنيوي (لولاه لكان الفشل على GitHub).

**(#319 · #320 · #321)**
**[قواعد مرشّحة #319–#321]. #319 (الدليل قبل الاستنتاج — وإن تطابقا):** استُنتج مضمون الترحيلات الأربعة بدقّة من فرق قيم الـEdge عن القيد، **ولم يُكتب حرفٌ حتى وُثّق بلقطة رسمية**. الاستنتاج الصحيح لا يُغني عن الدليل، لأن **صحته لا تُعرف قبل التحقق** وما يُكتب في `migrations/` يُعاد تشغيله على قاعدة إنتاج. وقبل مطالبة المالك بعمل يدوي: **يُفتَّش عن أتمتة قائمة تنتج الدليل نفسه** — `schema-snapshot` كان موجوداً بمشغّل يدوي طوال الوقت. **#320 (رقم الإصدار يتبع المحتوى):** أي إعادة تصدير بعد تعديل جوهري ترفع الرقم؛ الاسم المستقرّ فوق محتوى متغيّر يُنتج نسخاً متعارضة بمعرفة المشروع. **#321 (شروط الـCI المتلازمة):** حين يعتمد `job` على آخر بـ`needs` ولكليهما `if`، **الشرطان يتلازمان**؛ اختلافهما يُنتج تخطّياً صامتاً يبدو أخضر — تُوثَّق العلاقة عند المصدر لا بالذاكرة.

**(#321)**
**قواعد مرشّحة #321–#323. #321 (التجميع يتبع الوحدة السريرية — هجيناً لا واحداً):** مخرجُ العرض يُجمَّع حسب **الوحدة التي يفهمها المريض**: سنٌّ بعدة علاجات ⇒ خطة مراحل واحدة لهذا السن (والترتيب هو الرسالة)، وعلاجٌ واحد على عدة أسنان ⇒ بندٌ واحد للعلاج. لا يُفرض نمطُ تجميعٍ وحيد على الحالتين، والقسم الفارغ لا يُكتب عنوانه (فيبقى التوافق الخلفي حرفياً). **#322 (سقف المخرجات لكل ميزة + حارس `stop_reason` إلزامي):** كل ميزة AI لها سقف توكينات مستقل مقدَّر من أطول مخرج واقعي (والعربية تُقاس بكثافتها لا بعدد الكلمات)، **ويُفحَص `stop_reason` بعد كل نداء** مع إعادة محاولة بسقفٍ مضاعف — السقف الموحّد يُنتج فقداً صامتاً لا خطأً مرئياً، وهو أخطر من الفشل الصريح. وكل قصٍّ للمدخل (`slice`) يُراجَع عند تغيّر شكل الحمولة. **#323 (الرتبة السريرية تُراجَع بمثالٍ حقيقي لا بالمنطق المجرّد):** أي ترتيبٍ يمثّل تسلسلاً سريرياً يُختبر على حالة حقيقية من بيانات المالك قبل الإقرار — الترتيب الأول هنا كان مقلوباً (الحشوة قبل اللبية) ومرّ منطقياً حتى أظهره المثبت على سن 38.

**(#339)**
**[ب — عائق الفروع: `release` كان متأخراً بأربعة كومِتات]** بُني العمل فوق `release` (`fa0f7fd`) بينما `main` كان متقدّماً بأربعة كومِتات غير مُرقّاة (إصلاحات بطاقة الجلسات الأخيرة) وعليه **SW v70** والتوكن **`20260728f`**، فتعارض الكومِت في `sw.js` حصراً. الحل: إعادة البناء فوق `main` (cherry-pick) ورفع النسخة إلى **v71** وإعادة تشغيل `cache-bust` إلى **`20260728g`** مع الحفاظ على سلسلة تعليقات الـSW كاملة `71→70→69→68…`. **قاعدة مرشّحة #339 (ابنِ فوق `main` لا فوق `release`):** `release` هو ناتج بوابة الترقية وقد يتأخّر عن `main` بكومِتات مُنتظِرة؛ أي عمل جديد يُبنى فوق **`main`** حصراً، وإلا فتعارضٌ مضمون في `sw.js` وتوكن الفليت (وكلاهما «سطر واحد يتغيّر بكل جلسة»). التحقّق قبل البدء: مقارنة `main` و`release` عبر GitHub API.

**(#339)**
**قواعد مرشّحة #338 (بيانات التأسيس تُزرع عند إنشاء الكيان لا عند أول زيارة سطح) · #339 (auto-heal يشترط دليل ملكية صريح، ويُنشئ لا يخمّن) · #340 (توسعة تريغر محروس بحارس تماثل ⇒ طبقة معزولة بدل إعادة التعريف).**

**(#345)**
**[هـ — خطأ تحريري وقع وأُمسك]** أثناء إضافة فرع `monthly_digest` في `ai-assist` استُبدل **سطر رأس فرع `postop_instructions`** فانكسرت البنية صامتةً (الفرع صار كتلة معلّقة). أُمسك بفحص TypeScript parser حقيقي (`ts.createSourceFile` + `parseDiagnostics`) قبل أي commit. **قاعدة مرشّحة #345 (افحص TS بمحلّل حقيقي لا بتجريد يدوي):** الـEdge Functions تُفحَص بـ`typescript` فعلياً؛ تجريد الأنواع بالتعابير النمطية ثم `vm.Script` يعطي إنذاراً كاذباً (فشل على `: Record<...>`) ويُفوّت الكسر البنيوي الحقيقي.

**(#346 · #347)**
**[و — الحالة النهائية]** **HEAD = `5ba3bf8` (main) · SW `v74` · الفليت `20260728i` · Migrations مطبَّقة حتى 111 ✓ (التالي 112) · الحُرّاس الاثنا عشر خضر · `book.html` بلا مساس · صفر بند حرج.** **قاعدتان مرشّحتان: #346 (موضع الكود يحدّد تغطيته — قبل إضافة أو نقل أي عنصر واجهة مشترك تُبنى مصفوفة «أي صفحة تحمّل أي أصل» آلياً من وسوم `<script src>` الحقيقية لا من `grep` نصّي يلتقط التعليقات؛ وعلاقة الاحتواء بين أصلين — إن ثبتت — تجعل النقل ربحاً بلا خسارة وبلا مرآة تُحرَس)** و**#347 (`z-index` ليس رقماً عالمياً — القيمة الصحيحة بورقة قد تكون كارثية بورقة أخرى لأن سُلَّم الطبقات محلي لكل ورقة؛ ولا يُعدَّل عقدٌ شُحن على عشرات الصفحات لأجل ورقة واحدة: يُحوَّل الرقم إلى متغيّر قيمته الافتراضية **هي** السلوك القائم حرفياً، ويُحصَر التجاوز بورقة الاستثناء مع توثيق سُلَّمها بالتعليق)**. **التالي:** الدَّين المعماري التدريجي (تفكيك المونوليث · تسليم المطوّر · DMARC→reject) + مراجعة تسمية `sidebar.js`. ⤵️ V186BEOF

**(#347)**
**الحالة الحيّة بعد التوحيد:** **HEAD = `5ba3bf8` (main) · SW_VERSION `v74` · الفليت `20260728i` · Migrations مطبَّقة حتى 111 ✓ (التالي **112**) · الحُرّاس الاثنا عشر خضر · `book.html` بلا مساس · الطبقة المالية بلا كتابة واحدة · صفر بند حرج.** **قواعد مرشّحة مضافة بهذا اليوم:** #346 و#347 (من v186-ب). **المتبقّي عامّاً — دَين معماري تدريجي فقط:** تفكيك المونوليث (`patient-profile.html` · `admin.html`) · إنهاء handoff للمطوّر القادم · DMARC→`p=reject` · توحيد صيغة الأرقام (ar-SY ↔ en-US) · مراجعة تسمية `sidebar.js` (صار مضلِّلاً لما يحمله) · #3 chatbot الحجز (محجوب بقراريه) · #4-ب المستقبلي · **مؤجّل:** تدوير التوكنات (2027) + CSP nonces. ⤵️ V187EOF

### قواعد معرّفة داخل ترويسات جلسات (مقتطفات)

**#176** — …#176 (auto-seed آمن):** owner-only + in-flight guard + graceful-pre-migration + علم لمرة واحدة `clinic_settings.treatments_seeded`؛ `insertMissingDefaults` يرسل post_extraction مع strip-and-retry على 42703/PGRST204 — النمط البديل الآمن عن `__m61T` على القوائم الفارغة. **⚠️ الريبو كان متقدّماً بـ`6a651e7` (style(brand): two-tone SyDent wordmark، جلسة موازية، cache-bust فليت `20260621a`) قبل هذه الجلسة — v89 context كان على `9d824a7`.** **HEAD `6872256` · cache-bust `20260621a` (بلا تغيير — `treatments.html` inline فقط) · آخر migration FILE = 70 (`70_treatments_seeded_flag.sql` ⏳ بانتظار التطبيق، التالي 71).** ⤵️ سابقاً (v89): 19 يونيو 2026 (v89) — **تمييز التسجيل الجديد + نظام إشعارات بصفحة الأدمن (`admin.html` فقط، commitان `522f717`→`9d824a7`، صفر cache-bust — inline فقط).** الطلب: عند تسجيل عيادة جديدة تظهر البطاقة بلون مميّز ليلتقطها الأدمن + إشعارات بالصفحة. **(أ) تمييز البطاقة (CSS، `.req…

**#178** — …#178 (سلامة فوق الكمال):** عند سدّ فجوة UX تمسّ صفحات ناضجة كثيرة، الحل العام المعزول (كاشف اتصال على مستوى supabase-init، صفر مساس بـload/مالية) أأمن من ربط كل صفحة على حدة — يطابق فلسفة «الأبسط والأكثر احترافية». **HEAD `5ee3660` · cache-bust `20260622a` · آخر migration FILE = 70 (`70_treatments_seeded_flag.sql` ⏳ بانتظار التطبيق، التالي 71) · بنية جديدة: ريبو باكب خاص `AyhamGhnaim/SyDent-backups` + workflow `.github/workflows/backup.yml` + 3 secrets/vars (`SUPABASE_DB_URL`، `BACKUP_PAT`، `BACKUP_ENABLED`).** ⤵️ سابقاً (v90): 21 يونيو 2026 (v90) — **قائمة العلاجات الافتراضية: كل الأسعار = 0 + تصحيح «يطبّق على» + auto-seed لمرة واحدة للحساب الجديد (commit `6872256`، Migration 70 ⏳ بانتظار التطبيق، صفر cache-bust — `treatments.html` inline + ملف migration فقط).** الطلب (المالك): عند فتح طبيب جديد (عميل) حساباً، العلاجات الافتراضية لازم (1) كل أسعارها = 0، (2) تكون دليلاً تعليمياً بسطوح تطبيق ص…

**#179** — …#179–#180. (الـendpoints التشغيلية بقسم «بنية المشروع»؛ خطوات الاستعادة بـ`SyDent_DR_Runbook.md`.)** ⤵️ سابقاً (v91): 22 يونيو 2026 (v91) — **جلسة تصليب جاهزية الإنتاج (مُحفّزة ببوست إنستغرام عن ثغرات كود الـAI): نسخ احتياطي تلقائي يومي مجاني (DONE + live-tested ✅) + شريط انقطاع الإنترنت العام (DONE، ⏳ live-test) + مراجعة rate-limit/حمل-API + فحص أسرار شامل (نظيف) + مراجعة admin.html (لا تعديل) — commitان `3eb73f6`→`5ee3660`، cache-bust فليت `20260621a`→`20260622a`.** **(أ) النسخ الاحتياطي التلقائي (commit `3eb73f6`، DONE + live-tested):** Supabase free tier **بلا نسخ احتياطي تلقائي** (مؤكَّد من الـdocs الرسمية). الحل المجاني: workflow `.github/workflows/backup.yml` يومي عبر GitHub Actions + Supabase CLI `db dump`. **محروس بـrepo variable `BACKUP_ENABLED=='true'`** (no-op نظيف حتى التفعيل → آمن للـcommit قبل الإعداد). triggers: workflow_dispatch + cron `0 2 * * *` (2 صباحاً). permissions: con…

**#180** — …e R2 (`sydent-backups`) عبر rclone بـ`backup.yml` — db dump كان ميتاداتا لا بايتات الصور. HEAD `e69e6cb`، صفر migration/cache-bust، live-tested ✅. 5 أسرار GitHub جديدة (S3/R2) → المجموع 8. قواعد #179–#180. (الـendpoints التشغيلية بقسم «بنية المشروع»؛ خطوات الاستعادة بـ`SyDent_DR_Runbook.md`.)** ⤵️ سابقاً (v91): 22 يونيو 2026 (v91) — **جلسة تصليب جاهزية الإنتاج (مُحفّزة ببوست إنستغرام عن ثغرات كود الـAI): نسخ احتياطي تلقائي يومي مجاني (DONE + live-tested ✅) + شريط انقطاع الإنترنت العام (DONE، ⏳ live-test) + مراجعة rate-limit/حمل-API + فحص أسرار شامل (نظيف) + مراجعة admin.html (لا تعديل) — commitان `3eb73f6`→`5ee3660`، cache-bust فليت `20260621a`→`20260622a`.** **(أ) النسخ الاحتياطي التلقائي (…

**#181** — …#181–#183.** ⤵️ v92 — **المحور ١ (DR): سدّ فجوة نسخ ملفات المرضى Storage (`patient-files`)→Cloudflare R2 (`sydent-backups`) عبر rclone — db dump كان ميتاداتا لا بايتات. HEAD `e69e6cb`، صفر migration/cache-bust، live-tested ✅، 5 أسرار GitHub جديدة (المجموع 8)، قواعد #179–#180. restore-test مؤجَّل للمبرمج المستلم. خطة 6 محاور لـ«نام مرتاح».** ⤵️ v91 — **تصليب جاهزية الإنتاج: نسخ احتياطي تلقائي يومي مجاني (GitHub Actions + Supabase CLI db dump → ريبو خاص `SyDent-backups`، محروس بـ`BACKUP_ENABLED`، DONE + live-tested ✅) + شريط انقطاع إنترنت عام (IIFE بـ`supabase-init.js`، `window.SyDentNet`، cache-bust فليت `20260622a`، ⏳ live-test) + مراجعة rate-limit (Auth defaults جيدة، تُركت) + فحص أسرار شامل (نظيف، `sb_publishable` فقط) + مراجعة admin.html (لا تعديل). GAP Draft/Auto-save مُستبعَد بقرار (سبب أمني: draft مريض بجهاز مشترك). commitان `3eb73f6`→`5ee3660`. قواعد #177–#178. بنية جديدة: ريبو باكب +…

**#182** — …#182 (نمط Sentry Loader):** سطر سكربت خارجي كأول سكربت بعد charset بكل الصفحات؛ صفر مساس بملف محلي مشترك → صفر cache-bust؛ Error-only بإطفاء الباقي من الـdashboard؛ DSN علني آمن؛ افحص CSP (`_headers`/meta) + تعارض error handler قبل التنفيذ. **…

**#183** — …#183 (تدقيق الاستخدام التجاري للخطط المجانية):** قبل تبنّي أداة مجانية لمنتج SaaS، تحقّق من بند الاستخدام التجاري بشروط الخدمة (UptimeRobot حظره ديسمبر 2024 → BetterStack البديل). **HEAD `d4a3daf` · cache-bust `20260622a` (بلا تغيير) · آخر migration FILE = 70 (⏳) التالي 71.** ⤵️ سابقاً (v92): 23 يونيو 2026 — **المحور ١ (DR): سدّ فجوة نسخ ملفات المرضى Storage (`patient-files`)→Cloudflare R2 (`sydent-backups`) عبر rclone بـ`backup.yml` — db dump كان ميتاداتا لا بايتات الصور. HEAD `e69e6cb`، صفر migration/cache-bust، live-tested ✅. 5 أسرار GitHub جديدة (S3/R2) → المجموع 8. قواعد #179–#180. (الـendpoints التشغيلية بقسم «بنية المشروع»؛ خطوات الاستعادة بـ`SyDent_DR_Runbook.md`.)** ⤵️ سابقاً (v91): 22 يونيو 2026 (v91) — **جلسة تصليب جاهزية الإنتاج (مُحفّزة ببوست إنستغرام عن ثغرات كود الـAI): نسخ احتياطي تلقائي يومي مجاني (DONE + live-tested ✅) + شريط انقطاع الإنترنت العام (DONE، ⏳ live-test) + مراجعة…

**#200** — …#200 (توست موحّد):** `window.showToast` بـsidebar.js هو الوحيد؛ **ممنوع** تعريف `showToast` محلي أو `.toast` CSS أو `<div id=toast>` بأي صفحة (استثناء موروث: `sub-toast` بـsubscription لحين ترحيله). **…

**#201** — …#201 (persistSpecialTreatment = المسار الوحيد):** أي كتابة جسر/حافظ-مسافة/زرع تمر حصراً عبر `persistSpecialTreatment()` من **كلا** مسارَي الحفظ؛ ممنوع إعادة تنفيذ منطق الوحدة inline (تصليب بنيوي لـ#197). **…

**#202** — …#202: دعامتان متلاصقتان = حدود وحدتين) يقصّ الوحدة عند المزدوجة (يتيم الدعامة الخارجية أو يحذفها وحدها)، و**الأخطر** heuristic «الداخلي WHOLE=bridge = pontic قديم» كان سيكتب `WHOLE='extracted'` على **دعامة داخلية حقيقية** = إفساد بيانات سن موجود؛ (٣) الاستنتاج بالتجاور **ينهار بنيوياً** مع الدعامات المتعددة (لا يفرّق «مزدوجة بوحدة واحدة» عن «وحدتان متلاصقتان») — نفس الصنف الذي أنتج باغ الجسرين المتجاورين v103 → **الحل = تخزين الوحدة صراحةً** (مكافئ Tooth Range عند OpenDental)؛ (٤) العلاجات المخصصة `target_part='bridge'` تدخل نفس مسار #201 تلقائياً (طلب المالك «نفس التفاعل من قائمة العلاجات» = مضمون بنيوياً)؛ (٥) `upsertTeethStatusWithFallback` سلسلة fallback M74 = النمط الجاهز للنشر-قبل-الميغريشن (لا `__m61`)؛ (٦) trigger التاريخ M76 بأعمدة صريحة — إضافة عمود لا تكسره (لا ينسخه فقط، مقبول: العرض التاريخي read-only ورسمه صحيح بلا unit_id). **(ج) Migration 85 (مطبّقة ✓):** `ALTER TABLE teeth_st…

**#203** — …#203 (الجسر من المفقود):** يُطبَّق بالنقر على السن المقلوع حصراً (الدعامات تُشتق)؛ سن حاضر → toast منع (نمط حارس الحافظ). **…

**#212** — …#212 (بيرل/sed بسكربتات bash بعلامات أحادية حصراً والمتغيرات عبر ENV — التسعير المزدوج يجعل ${1} معاملاً موضعياً ويشوّه الاستبدال؛ وكل `VAR=$(cmd)` تحت set -e يُحمى بـ`|| true` + فحص صريح صاخب وإلا مات السكربت بصمت) و…

**#216** — …#216–#217.** ⤵️ **الإصدار:** v108 — **جلسة اللاندينج + مزامنة الكرسي↔الطبيب (٤ تموز، ست جلسات صغيرة متتابعة): (أ) مزامنة soft ثنائية بقوالب المواعيد (settings + appointments) — الكرسي مصدر حقيقة الطبيب (Open Dental/Dentrix)؛ اختيار كرسي→طبيب و طبيب→كرسي-نشط-وحيد + تحذير كهرماني غير مانع (textContent) + بادج تناقض على البطاقات (روح #210)؛ soft دائماً صفر قفل؛ jsdom 16/16؛ «تم». (ب→و) موك لوحة اللاندينج → تطابق المنصة: سايدبار كامل 4 أقسام/16 عنصراً SVG + 4 KPI حقيقية + نبض اليوم + شبكة عمودين (موعد سريع/مواعيد اليوم/غرفة الانتظار/طلبات المخابر) بنمط dash-grid؛ إيموجي/تبويب-وهمي/حالات-غير-موجودة مُزالة. (هـ) الفصحى: 12 عبارة عامية→MSA + loanwords هاتف/جهاز لوحي/حاسوب (مسح jsdom، صفر بقايا). (و) «صفحة الأسعار»→«صفحة الاشتراك». 6 commits `54aac5d`→`3b55fd4`، صفر migration/مالي/cache-bust، book.html بلا مساس، live-test الواجهيات معلّق (Ctrl+Shift+R بعد النشر). HEAD `3b55fd4` · فليت `20260703a` بلا تغيير · migrations بلا تغيير (74–77 ✓، التالي 78) · صفر قواعد جديدة (تطبيق #71/#195/#210 القائمة).** ⤵️ **الإصدار:** v107 — **جلسة الدفعة 3+4+6+8+9 (٤ تموز): وثيقتا التسليم محدَّثتان لواقع edaac39 + ملحق أ + PDF مُعاد · المحور ٥ ✅ (cache-bust.sh بقائمة سماح الأصول الخمسة + check-mirrors.js) · المحور ٦ ✅ (OPERATIONS_AR + الفاليديترات الخمسة سكربتات repo) · #200 fleet-wide (sub-toast رُحّل) · زر ثيم auth · landing مُغنى (بطاقات فارقة/FAQ/CTA) · حالات فارغة 🦷/🔍 → SVG بـ7 مواقع · إصلاح UTC جذري (مرآة YmdLocal + toDay=24 موقعاً + كاتبا review_at) · حافة القلع مقفولة (A5 نقطة خنق + فلترة نقية node 8/8) · قاعدتان…

**#217** — …#217 (auto-default حسب التصنيف يتبع نمط applyCategoryLabDefault بحارس user-touched + editingId + no-op + toast + listener مستقل؛ إعادة تسمية التصنيفات تتطلب مزامنة 5 مواقع مع تثبيت مفاتيح DB)    • HEAD e7e41d2 · فليت 20260703a بلا تغيير · Migration FILE 78 (مطبّقة ✓، التالي 79) 🆕 v108 — جلسة اللاندينج + مزامنة الكرسي↔الطبيب (٤ تموز، ست جلسات صغيرة متتابعة) — HEAD 3b55fd4 على main (6 commits فوق a6f39e5)، صفر migration/مالي/RLS/cache-bust، book.html بلا مساس، live-test الواجهيات معلّق    • (أ) مزامنة الكرسي↔الطبيب بقوالب المواعيد (54aac5d، settings.html + appointments.html): المُبلَّغ (صورتان) — القوالب تخزّن أزواج طبيب/غرفة تناقض تعريف الكرسي (زراعة: مجد على كرسي3 كرسي وحيد؛ زراعة سويسري: وحيد على كرسي2 كرسي مجد)، الحقلان مستقلان والنظام صامت. المرجع Open Dental/Dentrix: الكرسي مصدر حقيقة الطبيب (operatories.default_provider_id)، اختياره يعبّي الطبيب soft قابل للتعديل لا قفل.    • settings: on…

**#229** — …#229 (فشل الشبكة ≠ تسجيل خروج):** `getUser` نداء شبكة وjsDelivr يُخدَم من HTTP cache المتصفح وهو offline فالفحص يعمل فعلاً؛ فشل شبكة + جلسة `sydent.auth` محلية = أعِد مستخدمها بدل null؛ أخطاء auth الحقيقية أونلاين تحوّل كما هي؛ نداء jwt الصريح مستثنى. **…

**#236** — …#236 (herestrings لا printf|grep -q تحت pipefail). watch-point #18 أُغلق (دفعات offline v124 موثّقة). HEAD `1d9a929` · فليت `20260711a` · migrations بلا تغيير (74–79 ✓، التالي 80).** ⤵️ **الإصدار:** v124 — **جلسة الدفعات offline — Phase 2.1 (10 تموز منتصف الليل): بقرار المالك، تسجيل الدفعات يعمل بلا إنترنت كواقعة append-only إنشاء-فقط، والتوزيع المالي online حصراً بمسارات الصفحة القائمة — صفر كود مالي جديد بكامل الطبقة، محروس آلياً (حارس v2: حظر مطلق splits/realloc/FIFO بكامل supabase-init + الموديول لا يذكر إلا ledger_payments + عقود حرفية للأفعال والحقن). `3ee643d`: whitelist ثلاثية + أفعال-لكل-جدول + UUID للدفعات (uuid مثبت بMigration 64) + overlay المدفوعات (رصيد مؤقت حي + عزل مرضى) + onSynced hook + حدث sydent-payments-synced + مستمع البروفايل يكمل التوزيع بالتسلسل القائم حرفياً (وإلا self-heal) + رتق syncPaymentStatus + رسالة نجاح offline-aware. `823987b` (تدقيق ما قبل الاختبار): فشل فوري للممرَّر offline (كان realloc سيعيد بطء الحفظ) + كتم توست الجدار 1.5ث بعد طابور + صدى created_at بعد stringify. بوابتان رفضتا بحق (فرضيات قديمة + مرساة الحارس بعد تغيير بنيوي) + حادثة أكل الهروبات بالنقل (الحارس أُعيد عبر python بأنماط بلا backslashes). الطقمان 16/16+33/33. live-verified ✅ تم بعد البروتوكول الكامل + Ctrl+Shift+D (A–E مرّت). HEAD الجلسة `823987b` (الريموت الآن b6e77fb لجلسة المخبر v123 فوقه، كومِتاي محفوظان والحُرّاس خضر عليه) · فليت 20260710j · قواعد…

**#245** — …#245 (Edge Function نشر يدوي) · التالي: تدوير الأسرار قبل أول عميل + BetterStack heartbeat + live بانر الانتهاء + قرار retention + DMARC→reject.** ⤵️ ⤵️ **الإصدار:** v131 — **(ملاحظة تنظيمية، بلا تغيير كود/جلسة):** إعادة إصدار نظافة لتوحيد رقم ملف السياق بعد ظهور نسخ متعددة/فاضية بمعرفة المشروع؛ المحتوى مطابق حرفياً لـv130 (صفر تعديل على الجسم، PAT/ref/migrations مؤكَّدة). **احذف كل نسخ v130 والأقدم من معرفة المشروع وأبقِ v131 وحده كمرجع.** HEAD `33d6756` · فليت `20260715a` · migrations 80+81 ✓ التالي 82. ⤵️ **الإصدار:** v130 — **جلسة تحسينات منظومة رسائل الواتساب بالأدمن (15 تموز مساءً): ست تعديلات على قوالب/رقاقات الواتساب (صور المالك) — 6 كومِتات `5af6e7a`→`33d6756` فوق `544809f`، صفر migration/مالي/RLS/cache-bust، الحُرّاس الستة خضر، live ✅ ×6. (أ) عناوين قوالب الواتساب بالإعدادات بارزة (`.wa-tpl-title` 16px/800/أخضر + فاصل مقطّع + إيموجي). (ب) رقاقات حدود الخطط أوضح ديناميكياً (فارغ→«موظفون/مرضى بلا حدود»، صفر→«بلا موظفين إضافيين»، رقم→«حتى N») بـlanding+admin + إصلاح باغ landing «حتى 0 موظف». (ج) معاينة/اختبار القوالب تستبدل متغيّرات القالب الحالي فقط لا العامة (المعاينة كانت تكذب: {price} بالترحيب يُعرض وهمياً لكن الإرسال الفعلي يتركه حرفياً) + تحذير «غير مدعومة بهذا القالب». (د) `{plan_name}` بالتذكير كان hard-coded فارغاً → ديناميكي عبر planDisplayName بالمواقع الثلاثة (رسالة «في باقة ينتهي» فاضية كانت الباغ). (هـ) الاسم الحي (ownerNameByUid) بكل رسائل الواتساب الست بدل اسم التسجيل المجمّد. (و) الإيميل الحي برسالة الترحيب عبر توسيع Edge Function admin-ops owner_names لترجع `{map, emails}` من auth.users + خريطة ownerEmailByUid + fallback رجعي (خطوة يدوية: نشر admin-ops من Supabase — مؤكَّد «تم»). تدقيق التجديد: price/trial_end/plan_name ديناميكية سليمة صفر تعديل. HEAD `33d6756` · فليت `20260715a` · migrations 80+81 ✓ التالي 82 · قواعد مرشّحة…

**#246** — …قاعدة مرشّحة #246 (كشف مفتاح platform_settings للعموم = سياسة anon whitelist صريحة `key IN (...)` حصراً لا سياسة عامة؛ الصفحة العامة بلا Supabase تقرأه بـfetch REST خفيف بالمفتاح الـpublishable بدل تحميل المكتبة — تحميل supabase-init بصفحة عامة جديدة يستلزم skip الـautoGate + isPublicPage + cache-bust فليت، فالـfetch أرخص وأأمن؛ وأي drift سياسات يُكشف بعدّ #238 ويُصفَّر بميغريشن X.1) · التالي: تدوير الأسرار الإلزامي قبل أول عميل + BetterStack heartbeat (4 خطوات) + live-test بانر الانتهاء + قرار retention الباكبات + DMARC→reject والاستعادة الحية + resolve SYDENT-WEB-1.** ⤵️ **آخر تحديث:** 16 تموز 2026 — **جلسة بوابة الحجز كموديول خطة + العبارة السنوية (v133): سؤال المالك «فينا نضيف بوابة الحجز للموديولات يلي بالخطط؟» + «شوف شو بيحتاج نظام تعديل وإضافة الخطط» → نعم بنيوياً + تنفيذ كامل — commit واحد `09a8f6d` (7 ملفات، +169/−7) فوق `c09fb2d` + **Migration 83 (مطبّقة ✓ بسكرين شوت: subtitle_yearly_col=1 · fn_h…

**#247** — …قاعدة مرشّحة #247 (الوحدة التركيبية بـunit_id صريح):** كل صفوف الجسر الواحد تتشارك uuid واحداً يولَّد بـpersistSpecialTreatment (#201 المسار الوحيد)؛ الحذف/التجميع يقرأ uuid حصراً والاستنتاج بالتجاور fallback للصفوف NULL القديمة فقط (#202/#203 تبقيان legacy-scope)؛ قاعدة الدعامة `isAbut=!isExtracted` (كل حاضر بالوحدة = retainer — مزدوجة/pier)؛ heuristic «الداخلي=pontic» **محظور** على وحدات uuid (يفسد دعامة حقيقية)؛ الـchips والحفظ يمران بresolver واحد؛ أهلية التمديد = الجار **المباشر** الحاضر غير المزروع غير اللبني بسقف 2/جهة (فجوة = جسر ثانٍ لا تمديد)؛ العمود عام (`unit_id`) لإعادة الاستخدام بالأجهزة متعددة الأسنان؛ legacy walk يتوقف عند أي جار uuid. **التالي:** نظرة على علاجات التقويم والعلاجات الجماعية (جراحة…) وطريقة تطبيقها (طلب المالك بهذه الجلسة) + إكمال تدوير Resend + الـPAT الرئيسي + BetterStack heartbeat + live بانر الانتهاء + قرار retention + DMARC→reject.** ⤵️ **آخر تحديث:** 17 تموز 2026 — **جل…

**#248** — …قاعدة مرشّحة #248 (المناطق المتعددة):** أي مسار حفظ إقليمي يقبل مجموعة مناطق يمرّ بحلقة واحدة معمَّمة — insert+audit لكل منطقة، مرساة واحدة (الجلسة الأولى) للـrealloc/lab، break عند أول فشل، توست عدّاد، والأنواع أحادية المنطقة تمر بنفس الحلقة بعنصر واحد فيبقى سلوكها byte-identical؛ chips القيم الثابتة الداخلية لا تحتاج escaping لكن أي توسعة بقيم ديناميكية تخضع لـ#195. **التالي:** جلسة multi-tooth bulk بالبرومت الجاهز + تدوير Resend + الـPAT الرئيسي + BetterStack heartbeat + live بانر الانتهاء + قرار retention + DMARC→reject.** ⤵️ **آخر تحديث:** 17 تموز 2026 — **جلسة الجسور الطويلة — دعامات متعددة + unit_id صريح (v136): سؤال المالك «جسر طويل بأكثر من سن مفقود — علمياً لازم أكثر من دعامة أنسي ووحشي، كيف نحلها؟ شوف المنافسين» → بحث OpenDental أولاً ثم دراسة موسعة للكود الحي ثم تنفيذ كامل — commit واحد `fd592f9` فوق `ec84e9c` + Migration 85 (`85_bridge_unit_id.sql`، مطبّقة ✓)، ملفان فقط (`patient-profile.html`…

**#249** — …#249 (التحديد المتعدد الدفعي):** الاعتراض بالقمع الوحيد openToothModal بنمط exam حرفياً + الوضع مالي حصراً (completed/planned عبر CSS body-scoped) وغير المالي لexam mode؛ اللوحة = العلاجات السنّية الكاملة الأربعة فقط (السطحية/الجذرية/الجسور/الحافظ/الجماعية لمساراتها — فلسفة OpenDental: tooth-range لا يُحلقن)؛ الحفظ بحلقة M85.2 (insert+audit لكل سن، مرساة أولى، break أول فشل، توست عدّاد، realloc×1 بعد الكل) بمخرجات byte-identical للمسار المفرد (الحذف اللاحق بلا حالات خاصة)؛ التحقق قبل الفتح يُجهض مسمّياً + إعادة تحقق بالحلقة؛ consume-once مزدوج المفتاح؛ حلقات التحديد تُعاد بذيل renderTeeth؛ خصم المواد توست واحد بمضاعف عدد الجلسات (باراميتر default=1). **…

**#251** — …قاعدة مرشّحة #251 (قفل نطاق العلاج المحمي):** أي علاج يجتاز `isProtectedTreatment` (هندسة مخطط مخصصة) يُقفَل حقل «يطبَّق على» بمودال تعديله (setTargetLock عبر pointer-events + تلميح) — لأن target_part يغذّي الهندسة **وكاشفات الحماية ذاتها** فتغييره يكسر الرسم ويفكّ الحماية بصمت؛ الإضافة/النسخ حران دائماً (custom_ = مسار التخصيص المشروع، معفى من isProtectedTreatment)؛ ودفاع عميق بالحفظ يفرض القيمة المخزّنة بتجاهل الواجهة؛ بقية الحقول (اسم/لون/مخبر/سعر/ملاحظات/تصنيف) تبقى قابلة للتعديل بقرار المالك. **HEAD `ba5a299` · فليت `20260716a` بلا تغيير · Migration 85 مطبّقة ✓ (التالي 86) · التالي:** تنظيف جلسات الجسور التجريبية المكررة من مالية المريض التجريبي + تدوير Resend + الـPAT الرئيسي + BetterStack heartbeat + live بانر الانتهاء + قرار retention + DMARC→reject. ⤵️ **آخر تحديث:** 18 تموز 2026 — **جلسة التحديد المتعدد للأسنان + التطبيق الدفعي M86 + تطبيق Migration 85 حياً + إصلاحا الجسور (v138): تنفيذ برومت mul…

**#255** — …قاعدة مرشّحة #255 (تباين النص على الأسطح الملوّنة عبر الثيمين):** أي نص محفور `#hex` فوق سطح `var(--green)` يُستبدَل بمتغيّر ثيم-محلي (`--on-green`) يقلب قيمته بين الثيمين (داكن على الأخضر الفاتح للثيم الداكن، أبيض على الأخضر الغامق للثيم الفاتح) — لأن `--green` نفسه يغمق بالثيم الفاتح فالنص الغامق يضيع؛ يمتدّ…

**#256** — …قاعدة مرشّحة #256 (كشف مفتاح platform_settings للمستأجرين = توسيع whitelist صريح):** الصفحة العامة (anon) والصفحة المسجّلة (tenant) لهما سياستان منفصلتان على `platform_settings` (M84 anon whitelist + M42/M85 tenant whitelist)؛ أي مفتاح جديد يُعرَض للمستأجرين يتطلّب migration يعيد بناء `p_platform_settings_tenant_read` بإضافة المفتاح للـ`key IN (...)` — الاعتماد على سياسة anon وحدها يترك المستأجر يقرأ فراغاً صامتاً (ظهر باللاندينج واختفى بالاشتراك)؛ ذيل تحقّق pg_policies إلزامي (#238). **HEAD `1181cf2` · فليت `20260718a` بلا تغيير (subscription.html inline — مو asset مشترك) · Migration FILE 85 (`85_tenant_read_support_email.sql`، ⏳ يطبّقها المالك؛ عدّاد الميغريشن: 86 مطبّقة من v140 فرقم 85 هون ملف مستقل بمساره الخاص — التالي بعد 86 يبقى 87) · بنية جديدة: كرت الدعم `.sub-support` بذيل `.sub-wrap` + `renderSupport()`/`subCopyEmail()` + متغيّر `--on-green` + سياسة tenant_read موسّعة بـsupport_email · التالي:**…

**#257** — …قاعدة مرشّحة #257 (التصدير/الاستيراد الجدولي = xlsx حقيقي عبر SheetJS كسول التحميل):** أي تصدير/استيراد جدولي يستهدف مستخدمين على Excel/WPS بلغات نظام متنوّعة يُبنى ملفاً xlsx حقيقياً (SheetJS محمَّل عند الاستخدام فقط، ورقة RTL للعربي) لا CSV — CSV يعاني من فاصل الـlocale الأوروبي (`;`) والترميز؛ يبقى مسار CSV fallback (مع `sep=,` + كشف فاصل تلقائي `,`/`;`/tab + إنقاذ الخانة الواحدة + كشف ترميز UTF-8/Windows-1256) لغياب الإنترنت؛ خلايا تاريخ Excel تُحوَّل لـISO حتمياً (`getFullYear/Month/Date` لا `toISOString` تفادياً لانزياح التوقيت ولا `dateNF` لغموض m/d)؛ كشف التكرار بمفتاح اسم-مطبّع+هاتف-مطبّع معاً (لا الهاتف وحده — العائلات تتشارك رقماً)، يُتخطّى افتراضياً مع opt-in صريح؛ وأي `<input type=checkbox>` تحت قاعدة `input{appearance:none}` عامة يحتاج `appearance:auto`+`accent-color` inline لإظهار علامة التحديد (امتداد #239 من [hidden] لرسم الـcheckbox). **HEAD `469ca0f` · فليت `20260718a` بلا تغيير (patient…

**#258** — …قاعدة مرشّحة #258 (متغيّرات القوالب الديناميكية بعقد الفراغ-الحرفي):** أي متغيّر منصّة جديد يُضاف لقوالب الواتساب بالأدمن يُكشَف كـchip بـ`TPL_VAR_DEFS` (array-driven، صفر تعديل render) + قيمة معاينة بـ`TPL_MOCK_VARS` + يُدمَج شرطياً بكل مسارات الإرسال الخمسة عبر `supportPhoneVars()` الموحّدة (المصدر الوحيد)؛ العقد: القيمة الفارغة = المفتاح يُحذَف فيبقى `{var}` حرفياً بالرسالة كتنبيه إداري لا مسافة فاضية (يمتدّ نمط `support_phone` #38 و#242)؛ القيمة الحية من `PLATFORM_SETTINGS_CACHE` المُحدَّث بحفظ Section H فينعكس بلا reload. **HEAD `ae85663` · فليت `20260718a` بلا تغيير (صفحتان inline — لا أصل مشترك) · Migration بلا تغيير (86 مطبّقة، 85 ملف مستقل ⏳ يطبّقها المالك، التالي 87) · بنية: توسيع `supportPhoneVars()` + chip `{support_email}` بالقوالب الأربعة + سؤال أوفلاين جديد بـFAQ · التالي:** تطبيق Migration 85 (تحقّق policies=4) + تنظيف جلسات الجسور التجريبية + تدوير Resend + الـPAT الرئيسي + BetterStack hea…

## 🗂️ فهرس الجلسات (من الأحدث للأقدم — التفاصيل بالأرشيف)
> سطرٌ لكل كتلة جلسة كما ورد بترويستها. للتفاصيل: ابحث بالأرشيف عن رقم النسخة أو الكلمة.

- 2 → 3 تشرين الأول 2026 (**سياق 294** — **جولةُ المخزون والمواد المستهلكة مغلقةٌ بالسبعة**: خصمٌ ذرّي مربوطٌ بالجلسة وFEFO (M169) · كميةُ الطلب و«جهّز الطلبية» (M170) · الجردُ الدوري (M171) · الموردون والطلبياتُ والاستلامُ الجزئي (M172) · رقمُ الدفعة LOT وتتبّعُه للمريض (M173) · تبويبُ المواد بدالّة كلفةٍ واحدة · كشفُ المخزون + فحصٌ شامل، **v568 → v575** · 85 حارساً.)
- 30 أيلول → 2 تشرين الأول 2026 (**سياق 293** — **ملاحظاتُ Deep Code الـ21** على البنية الحالية: 18 مشحونة/مُغلقة (v550 → v567 · M166–M168)، الأداءُ بحارس ميزانية، الحقلُ الموحّد للتاريخ، التنبيهات 328 ⇒ 9، إيصالُ شام كاش، ومراجعةٌ شاملة — الباقي #7 · #5 · #6.)
- 30 أيلول 2026 (**سياق 291 · تتمة 2** — **مصدرُ النقد للمدفوعات الخارجة** «من الدرج / من خارج الدرج» (M165): المصروفات · الرواتب · المخابر · كشفُ اليوم وتنبيهُ المتوقَّع السالب، **v549**.)
- 30 أيلول 2026 (**سياق 292** — بحثُ جولة المخزون والمواد المستهلكة: القائمةُ المرتّبة بسبعة بنود تنتظر موافقة المالك.)
- 30 أيلول 2026 (**سياق 291 · تتمة** — **جولةُ «قصّ 1000 صفّ» بكل المنصة**: `window.SyDentFetchAll` + جردٌ آلي بالبوابة، 40 قراءةً بـ13 ملفاً، **v548**.)
- 30 أيلول 2026 (**سياق 291** — **جولةُ مقارنة التقارير مغلقةٌ بالسبعة**: «التقارير» بسبعة تبويبات — العلاجات · المرضى الجدد ومصادرهم · الحضور والغياب · الاحتفاظ · مين حوّل المريض (M164) · ملخّص الفترة للطباعة والواتساب · Excel المحاسبة بأوراق؛ + الفحصُ الشامل: قراءاتُ الفترة مصفّحة (قصُّ 1000) وأشرطةٌ مخفية بثلاث صفحات، **v539 → v547**.)
- 29 أيلول 2026 (**سياق 290** — **جولةُ مقارنة المخابر مغلقةٌ بالستة**: الإعادةُ دورةٌ موثّقة (M160) · الاستحقاقُ التلقائي من صفحة العلاجات (M161) · «بدها تحرّك» · ورقةُ الطلب · أداءُ المخبر · المرفقات (M162) + مراجعةُ الإغلاق (بطاقاتٌ بعمودين · حارسُ الملكية M163)، **v523 → v537** · Migrations **160–163** · 48 حارساً. التفاصيل: كتلة 290 بقسم «التاريخ الكامل».)
- 28 أيلول 2026 (**سياق 289** — **جولةُ مقارنة لوحة التحكم/الهدل الصباحي مغلقةٌ بالخمسة**: أعلامُ الهدل + الاستدعاء · «وصل» للكل بتأكيدٍ ضمني · ملخّصُ أمس · الإنتاجُ مقابل الهدف (M159) · الفجوات ومن يملؤها · اليوم/الغد · خطُّ الهدف بالاتجاه الشهري + مراجعةُ الإغلاق، **v514 → v522** · Migration **159** · 42 حارساً. التفاصيل: كتلة 289.)
- 27–28 أيلول 2026 (**سياق 288** — **جولةُ مقارنة المالية مغلقةٌ بالأربعة**: تقادمُ الذمم · كشفُ اليوم وطرقُ الدفع الموحّدة · الاتجاهُ الشهري · إقفالُ الصندوق (M158) + مراجعةٌ نهائية ولقطةُ رأس الصفحة، **v507 → v513** · Migration **158** · 36 حارساً. التفاصيل: كتلة 288 بقسم «التاريخ الكامل».)
- 26–27 أيلول 2026 (**سياق 287** — **جولةُ مقارنة المواعيد والتقويم مغلقةٌ بالسبعة**: حارسُ التعارض · التزامُ المريض · الحجوزاتُ المغلقة وساعاتُ العمل مربوطةً بالبوابة · «غابوا» · التكرار · الأسرة، **v495 → v506** · Migrations **154–157** · 33 حارساً. التفاصيل: كتلة 287 بقسم «التاريخ الكامل».)
- 25 أيلول 2026 (**سياق 285** — مراجعةُ الحالات السريرية وأزرارُ إزالتها (**v490–v491**) · تدقيقُ جولة Curve (v410–v428) على الكود الحالي · **خطُّ الواجهة مستضافٌ ذاتياً ومثبتاتُ DOM هرميّة (v492–v493)**. لا ترحيل.)
- 23 أيلول 2026 (**سياق 284** — «غير بازغ» (C3) يُغلق جولةَ الرسم، **v489**. لا ترحيل.)
- 23 أيلول 2026 (**سياق 283** — أزرارُ الإزالة بمخطط الأسنان لا تُيتّم جلساتها، **v479 · v482 · v488**. لا ترحيل.)
- 23 أيلول 2026 (**سياق 282** — جولةُ توحيد أزرار الصفوف بكل المنصة + التاريخُ والوقت الموحّدان، **v469 → v487**. Migration **153** وحدها.)
- 22 أيلول 2026 (**سياق 281** — تدويرُ رمز GitHub المسرَّب وإغلاقُه، وصلاحيةُ قراءة البوابة مباشرةً، وتنسيقُ العمل بين الجلسات المتوازية. **لا كود ولا ترحيل** بهذه الكتلة.)
- 22 أيلول 2026 (**سياق 280** — «خيارات خطة العلاج» (M145) من التدقيق الشامل إلى الإغلاق: ستُّ نسخٍ متتالية وُلدت كلُّها من طلبات المالك «راجع… تأكّد… صلّح»، ومثبتٌ دائمٌ بالريبو يشغّل الكود الحقيقي).
- 22 أيلول 2026 (**سياق 279** — جولتان متّصلتان: **فحصُ نوافذ المنصة كلِّها** أماناً وسلوكاً وشكلاً (v438–v455) ثم **الحوارُ الموحّد بدل نوافذ المتصفّح** (v456–v462)، وبينهما وضوحُ «تقارير الأطباء» (v452). صفر ترحيل — آخر Migration …
- 21 أيلول 2026 (**سياق 278** — جولتان متتاليتان: «نواقص بروفايل المريض بعد مقارنة Curve» (v408–v428) ثم **جولةُ الرسم** (v429–v437): القلعُ المخطّط · مكتبةُ الحالات السريرية بترحيل 152 · والحارسُ التاسع عشر — **مثبت DOM حيّ ينقر كم…
- 19 أيلول 2026 (**سياق 277** — جولةُ «علاجات الأطفال وصفحة العلاجات»: من بلاغٍ واحدٍ بصورة («تصنيف الأطفال غير موجود عند تطبيق علاج على سن») إلى ستِّ نسخ، ترحيلين، وبلاغٍ نظاميٍّ لم يُطلب فحصُه — طبيبٌ معطَّلُ الحساب بقي قابلاً للا…
- 19 أيلول 2026 (**سياق 276** — جولةُ «خيارات خطة العلاج البديلة»: مقارنةٌ مع Curve Dental انتهت ببندٍ واحدٍ يستحقّ الأخذ، ثم سبعُ جولاتٍ متتالية حتى اكتمل).
- 19 أيلول 2026 (**سياق 275** — جولةُ «خلفيةُ المخطط وهندسةُ ذروة الجذر والفرجة»: «لسا في مشكلة بخلفية المخطط عالفاتح — شوف كيف بالغامق الأسنان أوضح» ← أربعُ خلفياتٍ ببروتوتايب ← اختيار **B** · «ذروةُ جذور الأسنان الخلفية لازم تكون …
- 18 أيلول 2026 (**سياق 274** — جولةُ «واقعيةُ مخطط الأسنان»، امتدادُ كتلة 272: «ممكن نطوّر شكل الأسنان أكثر خصوصاً الجذور المتعددة» ← رأيٌ مسبَّبٌ ثم بروتوتايبان بالمحادثة ← **v385** (تيجان + لا تناظر الجذور + عمق إطباقي) ← «القواط…
- 18 أيلول 2026 (**سياق 273** — جولةُ «الرواتب والحصص بلا أخطاء صامتة»: بلاغُ المالك «راتب السكرتيرة 100$ ينقسم على 30 والشهر 31 يوماً يزيد الاقتراح» ← «راجع بشكل موسّع ودقيق جداً وشوف الباغز غير المرئية» ← فحصان متتاليان (الثاني بط…
- 17 أيلول 2026 (**سياق 272** — جولةُ «تصحيح هندسة جذور مخطط الأسنان»: بلاغُ المالك بصور (Dentrix + المخطط الحيّ): «الضاحك الأول العلوي — الجذور لازم تكون ورا بعض بالمنظر الدهليزي لا جنب بعض؛ كبّر عرض الجذر واعمل عكفة بالذروة… وراجع…
- 17 أيلول 2026 (**سياق 271** — جولةُ «توحيد ألوان الوضع الفاتح»: شكوى المالك («لا فرق بين الأحمر والبرتقالي والأصفر باللايت، والداكن ضاوي») ← **v347–v349** لوحةُ الحالات والنغمات ← «وحّد كل الصفحات» ← خطةٌ أُقرّت ← **v350–v353** (ا…
- 16 أيلول 2026 (**سياق 268** — جولةُ «العملةُ التي لا حسابَ فيها»: بلاغُ المالك بصورة (ليلى الحموي: «لا علاج منجز $» و«0 $» بصناديق مريضةٍ حسابُها بالليرة) ← تشخيصٌ عُرض وأُقرّ «صلّح كل شي» ← **v337** ← ثلاثةُ بلاغاتٍ متتالية على ش…
- 16 أيلول 2026 (**سياق 267** — جولةُ «أزرار الحضور بتبويب المواعيد»: بلاغُ المالك بصورةٍ حيّة بعد v336 («المريض عندو موعد اليوم، مو المفروض يكون في زر وصل-جلس-خرج بتبويب المواعيد؟») ← فحصٌ قراءةً فقط لسطحَي الأختام القائمين (صفحة ا…
- 16 أيلول 2026 (**سياق 266** — جولةُ «تبويب المواعيد ببطاقة المريض»: طلبُ المالك بصورة (تبويبُ مواعيد بعد «تعليمات» وقبل «سجل النشاطات» فيه السابقة والفائتة والقادمة، و«ادرس الموضوع بشكل موسع وحط خطة… بشكل احترافي») ← دراسةٌ قراءةً…
- 16 أيلول 2026 (**سياق 265** — جولةُ «الموعدُ الذي تمّت زيارتُه لا يُنقل»: بلاغُ صورٍ «موعدٌ لم يأتِ بعد يقول منتهٍ ولا يتحرّك، ولوحةُ التحكم بلا زرّ وصل» ← تشخيصٌ بالقاعدة وسجلّ النشاطات ← فحصٌ موسّع بطلب المالك («تأكّد إن الخطة ش…
- 16 أيلول 2026 (**سياق 264** — جولةُ «الجلسة الحرّة وطبيبُ الموعد ومدخلُ السن»: بلاغُ صورٍ «جلسة بلا سن مربوطة بموعد انحفظت منجزة» ← الحالةُ من منتقٍ لا ثابتة + عملةُ علاجات الموعد (v331) ← «طبيبُ الموعد يتبع طبيبَ الجلسة» بعد مراج…
- 16 أيلول 2026 (**سياق 263** — جولةُ «بطاقة المريض على الموبايل»: بلاغُ صورة «طلبات المخابر عم تتحرك» ← فحصُ التبويبات العشرة بقياسٍ آلي ← بطاقاتٌ للجداول العريضة (v328) ← مراجعةٌ ذاتية بطلب المالك كشفت خطأً أدخلتُه وثغرةَ XSS قائم…
- 15 أيلول 2026 (**سياق 262** — جولةُ «اسأل بياناتك» الكبرى: العملةُ بُعدُ قسمةٍ لا حقل · نواةُ زمنٍ واحدة بلا سقوطٍ صامت · إظهارُ القدرات المخبوءة · وجولةُ صقلٍ من ستّ تغذياتٍ راجعة حيّة — **11 إصدارَ SW من v317 إلى v327** بأحد عشر…
- 15 أيلول 2026 (**سياق 261** — جولةُ «المساعد الذكي» بلوحة التحكم: فحصُ «اسأل بياناتك» ثم توسيعُه ثم جمعُ أسطح الـAI العامّة بمركزٍ واحد — **5 إصداراتِ SW من v312 إلى v316** بخمس كومِتات) — **الحالة الحيّة (متحقَّقٌ منها بـ`git ls-…
- 14 أيلول 2026 (**سياق 260** — إصلاحُ وتطويرُ صفحة تقارير الأطباء ببلاغٍ من المالك: **4 إصداراتِ SW من v306 إلى v309** بأربع كومِتات، كلُّها `provider-reports.html` وحدها) — **الحالة الحيّة (متحقَّقٌ منها بـ`git ls-remote` لحظةَ ال…
- 13 أيلول 2026 (v257 — **تعقيبُ المالك بصورتين على v261: رأسُ بطاقةِ المريض ثنائيِّ العملة يعرض طبقةً واحدة بينما شريطُ المدفوعات يعرض الطبقتين — «أليس من المفروض أن يعرض فوق أيضاً ما هو متبقٍّ من العملتين؟» (v270)**) — **الحالة ال…
- 13 أيلول 2026 (v256 — **جلسةُ ستّة بلاغات من الشاشة: قناةُ إرسالٍ واحدة لأمر المخبر (v264) ← زرُّ الجدولة يفتح بوضع الجدولة (v265) ← «جلسة جديدة» صارت chart-first (v266) وصقلُها (v267) وتصحيحُ وسمها (v268) ← صلاحيةُ المخزون تُدخَل…
- 13 أيلول 2026 (v255 — **بلاغُ المالك بصورتين: خربطةُ العملة ببطاقة المريض — حسابٌ دولاريٌّ بعيادةِ ليرة يُقرأ «ل.س» ولا ينفصل إلا بإضافة جلسةِ ليرة (v261) ← ثم «راجع نظام المحاسبة بشكل أوسع وأعمق» فكشفَ الفحصُ الحيُّ دفعتين بلا تو…
- 12 أيلول 2026 (v254 — **بلاغُ المالك بصورتين: السن 36 — إعادةُ معالجةٍ منجزة ووتدٌ فايبر مخطّط على الجذور نفسها؛ التلميحُ يقول إن الوتد أُنجز والجلسةُ تقول مخطّط، وإعادةُ المعالجة المنجزة بلا أثرٍ بالمخطّط (v260) — فحصٌ موسّع قبل …
- 12 أيلول 2026 (v253 — **جلسةُ بلاغَين بصورةٍ من المالك: خياراتُ `<select>` الأصلية غيرُ مقروءة بالنمط الداكن (v258) · فلترُ الفترة بصفحة الرواتب صار كالمصاريف — يفتح فارغاً مع «إعادة ضبط» (v259) — وحادثةٌ إجرائية: المساعدُ وصفَ ال…
- 2 أيلول 2026 (v251 — **جلسةُ استلامٍ خارجية: تقييمُ جاهزيةٍ حياديّ ثم ثلاثُ هجراتٍ تشغيلية — فهارسُ المفاتيح الأجنبية (M135) · إعادةُ كتابة سياسات RLS بـ`(select auth.uid())` (M136) · حدُّ معدّلٍ لمُحلِّل الدخول (M137) — وسجلُّ إص…
- 2 أيلول 2026 (v250 — **فحصٌ شاملٌ وموسّع لنظام المحاسبة بكل تفرّعاته بطلب المالك — بطاقةُ المريض · المخابر · الرواتب · المصاريف · تقاريرُ الأطباء · المحاسبة: ثمانيةُ بنودٍ ونشرةٌ واحدة (v256) + Migration 134؛ أخطرُها مالٌ يتجمّد ب…
- 1 أيلول 2026 (v249 — **فحصٌ شاملٌ وموسّع لصفحة المحاسبة بطلب المالك: تسعةُ بنودٍ بنشرةٍ واحدة (v255)، أخطرُها ارتدادٌ صامت للإيراد الخام كان ينتظر أوّلَ عيادةٍ حقيقية**) — **الحالة الحيّة: HEAD = `c36a3da`** · `release` = **`c36a3…
- 1 أيلول 2026 (v248 — **فحصٌ شاملٌ وموسّع لصفحة قائمة العلاجات بطلب المالك: عشرةُ بنودٍ بنشرةٍ واحدة (v252) ← مراجعةٌ ذاتية بطلبه كشفت فجوةً أدخلتُها بالإصلاح نفسه (v253)**) — **الحالة الحيّة: HEAD = `88938d2`** · `release` = **`88…
- 1 أيلول 2026 (v247 — **فحصٌ شاملٌ وموسّع لصفحة تقارير الأطباء بطلب المالك: بلاغُ صورةٍ عن صفّ «المتبقي بعد المدفوع» (v249) ← تدقيقٌ كاملٌ بثماني مراحل خرج بستّة عيوب (v250) ← سؤالُ المالك عن زرّ الدفعة على بطاقته (v251)**) — **الح…
- 31 آب 2026 (v246 — **إصلاحان من بلاغَي المالك بالجلسة نفسها: (١) سباقُ شاشة الحجب مع `loadDashboard` (بلاغ Sentry) · (٢) شاراتُ الانتباه الموحّدة بلوحة الأدمن + إشعارٌ حيّ لطلبات الترقية/التجديد (Migration 133)**) — **الحالة الحيّ…
- 31 آب 2026 (v245 — **مراجعةٌ كاملةٌ وموسّعة لصفحة المواعيد بطلب المالك + إغلاقُ أربعة عيوبٍ بدلالة التنقّل (أخطرها قفزُ شهرٍ كاملٍ عند التنقّل من يوم 31)**) — **الحالة الحيّة: HEAD = `720c9a8`** · `release` = **`720c9a8`** (متطابق…
- 30 آب 2026 (v244 — **مراجعةٌ كاملةٌ وموسّعة لبطاقة المريض (21 جولة) بطلب المالك + إغلاقُ ملاحظتها الوحيدة: وسمُ عملة خطة الأقساط يتبع عملةَ الخطة**) — **الحالة الحيّة: HEAD = `71ad3cf`** · `release` = **`71ad3cf`** (متطابقان، متحق…
- 29 آب 2026 (v243 — **أسقفُ نداءات الـAI لكل خطة (Migration 132) + حدٌّ لحظي — إغلاقُ الشقّ الأكبر من نقطة المراقبة #70 قبل أول عميل مدفوع**) — **الحالة الحيّة: HEAD = `2fe6231`** · `release` = **`2fe6231`** (متطابقان، متحقَّق بـ`g…
- 24 آب 2026 (v242 — **تدقيقٌ موسّع لطبقة الذكاء الاصطناعي (16 ميزة) + بوابةُ حالة الحساب بـ`ai-assist` + خرائطُ أخطاء الـAI**) — **الحالة الحيّة: HEAD = `a6b8739`** · `release` = **`a6b8739`** (متطابقان، متحقَّق بـ`git ls-remote --…
- 22 آب 2026 (v241 — **حاويةٌ عائمة قابلة للسحب للزرّين العائمين (`#syFabDock`) تلزق بأقرب حافة بنمط Messenger**) — **الحالة الحيّة: HEAD = `d9aaaec`** · `release` = **`d9aaaec`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW…
- 16 آب 2026 (v236 — **مبدّلُ عملة عرض التوحيد بنظرة الأدمن العامة، ودرسٌ عن أرقامٍ صحيحةٍ فوق سعرٍ تجريبي**) — **الحالة الحيّة: HEAD = `5b134ff`** · `release` = **`5b134ff`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v2…
- 13 آب 2026 (v235 — **ثلاثةُ أسطحٍ تُعلن ما لا يفعله الكود، وتدقيقٌ لميزةٍ ماليةٍ عرضية بطلب المالك**) — **الحالة الحيّة: HEAD = `c49fb26`** · `release` = **`c49fb26`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v230` → …
- 13 آب 2026 (v234 — **جردُ القوالب على مستوى المنصة: سبعُ عللٍ بخمس عائلات، ثم ثلاثُ عللٍ تتالت خلف بلاغِ مالكٍ واحد، وحارسٌ سابع عشر يمنع عودتها**) — **الحالة الحيّة: HEAD = `5ab9bf7`** · `release` = **`5ab9bf7`** (متطابقان، متحقَ…
- 13 آب 2026 (v233 — **رسمُ عدم الحضور: قيدٌ بالماركب منع رقماً مشروعاً، وعملةٌ كانت تطفو، وحبّتان تمدّدتا**) — **الحالة الحيّة: HEAD = `9c1c919`** · `release` = **`9c1c919`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v2…
- 13 آب 2026 (v232 — **رقمان كانا يكذبان بصمت: واحدٌ رتّب نفسه بصيغة عمود، وواحدٌ محا نصفَه بمقاصّة**) — **الحالة الحيّة: HEAD = `f915e2b`** · `release` = **`f915e2b`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v221` → `…
- 13 آب 2026 (v231 — **جسرٌ يترك دعامةً معلّقة، وقالبٌ يحفظ رقماً بلا وحدته: بلاغان، وجذرٌ مشترك اسمه «الصواب الذي لا يراه حارس»**) — **الحالة الحيّة: HEAD = `bbcb3f2`** · `release` = **`bbcb3f2`** (متطابقان، متحقَّق بـ`git ls-remot…
- 13 آب 2026 (v230 — **مسحُ الأدمن لمعلومات الدعم صار يُطاع: خمسةُ أسطحٍ بثلاث سياسات، والثابتُ الذي وحّدها**) — **الحالة الحيّة: HEAD = `70fde66`** · `release` = **`70fde66`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v…
- 12 آب 2026 (v229 — **ترتيبُ طبقات العملة يتبع عملة العيادة: علاجٌ جزئيّ اكتُشِف بسؤالٍ لا ببلاغ، وجردٌ يقول أين بقي**) — **الحالة الحيّة: HEAD = `a3ab317`** · `release` = **`a3ab317`** (متطابقان، متحقَّق بـ`git ls-remote --heads` …
- 11 آب 2026 (v228 — **النسخة حاضرة والمسار إليها مقطوع: إنقاذ القراءة والتنقّل، ثم ارتداد الأصل بأي توكن**) — **الحالة الحيّة: HEAD = `a0adf11`** · `release` = **`a0adf11`** (متطابقان، متحقّق بـ`git ls-remote --heads` لا بـActions …
- 10 آب 2026 (v227 — **جلستان: تبديلُ بطاقتَي اللوحة · والإجمالي الموحّد بعملةٍ يختارها الطبيب**) — **الحالة الحيّة: HEAD = `ad960e5`** · `release` = **`ad960e5`** (متطابقان، متحقَّق بـ`git ls-remote --heads` لا بـActions API) · **S…
- 10 آب 2026 (v226 — **اللقبُ المهني: الافتراضُ الذي كان يُقرأ حالةً**) — **الحالة الحيّة: HEAD = `c3c9155`** · `release` = **`c3c9155`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v209` → `v210` → `v211` → `v212`** · **ك…
- 10 آب 2026 (v225 — **الجمعُ عابرَ العملات وقت القراءة: عشرون موضعاً أُغلقت، والحارسُ السادس عشر وُلد**) — **الحالة الحيّة: HEAD = `6874ffb`** · `release` = **`6874ffb`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v207` …
- 10 آب 2026 (v224 — **وحدةُ الرقم صارت قابلةً للتصحيح: التبديلُ يُفرّغ، والقفلُ انحصر بما له أبناء**) — **الحالة الحيّة: HEAD = `4d6de3b`** · `release` = **`4d6de3b`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v206` → `…
- 10 آب 2026 (v223 — **جلسةُ المخابر: ذمّةٌ بلا عملة · بابٌ مسدود · التزامٌ لم يُرسَل — وتدقيقٌ شاملٌ ختمها**) — **الحالة الحيّة: HEAD = `c6e0b7f`** · `release` = **`c6e0b7f`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v…
- 10 آب 2026 (v222 — **المودالُ المشترك: بقايا مسارٍ آخَر تُقرأ ميزةً**) — **الحالة الحيّة: HEAD = `3772865`** · `release` = **`3772865`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v198` → `v201`** (ثلاث رفعات) · **ثلاثة…
- 9 آب 2026 (v221 — **خلفيةُ النمط الفاتح تصل الشاشة أخيراً**) — **الحالة الحيّة: HEAD = `710edb5`** · `release` = **`710edb5`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v195` → `v198`** (ثلاث رفعات) · **كسرٌ صفحيّ واحد…
- 9 آب 2026 (v220 — **سعرُ صرف التقارير ينزل لطبقة المستأجر**) — **الحالة الحيّة: HEAD = `4901fd2`** · `release` = **`4901fd2`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v191`→`v195`** (أربع رفعات) · **توكن الفليت `2026…
- 9 آب 2026 (v219 — **منطقةُ العلاج شرطُ ظهورٍ لا وسمَ حفظٍ فقط**) — **الحالة الحيّة: HEAD = `80397e3`** · `release` = **`80397e3`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v187`→`v191`** (أربع رفعات، منها `v188` سابقة…
- 9 آب 2026 (v218 — **اللقبُ مكوّنٌ لا نصّ… وحادثةُ الاعتمادِ غيرِ المحروس**) — **الحالة الحيّة: HEAD = `fdb61ed`** · `release` = **`fdb61ed`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v185`→`v187`** (رفعتان) · **توكن ا…
- 9 آب 2026 (v217 — **العملةُ بُعدُ قراءةٍ أيضاً: من الحفظ الصحيح إلى الوسم الصحيح**) — **الحالة الحيّة: HEAD = `07618b5`** · `release` = **`07618b5`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · **SW `v181`→`v185`** (أربعُ رفعا…
- 9 آب 2026 (v216 — **تعدد العملات (ل.س/$): العملةُ بُعدُ قسمةٍ فوق المعادلات، لا رقمٌ يُحوَّل**) — **الحالة الحيّة: HEAD = `c5f0967`** · `release` = **`c5f0967`** (متطابقان، متحقَّق بـ`git ls-remote --heads` لا بـActions API — الـP…
- 8 آب 2026 (v215 — **onboarding العيادات القديمة: الدينُ السابق جلسةٌ لا تسوية، والبطاقةُ التجريبية عزلٌ بثابتٍ لا بقائمةِ افتراضات**) — **الحالة الحيّة: HEAD = `42b1461`** · `release` = **`42b1461`** (متطابقان، متحقَّق بـ`git ls-r…
- 7 آب 2026 (v214 — **انتهاءُ الجلسة بطبقة الأدمن يتدهور صامتاً: العطبُ ليس الارتدادَ بل استحالةَ ملاحظته**) — **الحالة الحيّة: HEAD = `a23a73d`** · `release` = **`a23a73d`** (متطابقان، متحقَّق بـ`git ls-remote --heads`) · كومِتُ هذ…
- 7 آب 2026 (v213 — **«اسأل بياناتك» عبر ثلاثة محاور بطلب المالك: الفصحى للعرض والعامية للفهم · العتبة يكتبها الطبيب لا الكود · وثلاثة أصناف جديدة بمحلّل تواريخ حتميّ**) — **الحالة الحيّة: HEAD = `a23a73d`** (كومِتان بالجلسة: `34e31…
- 7 آب 2026 (v212 — **شريط «اسأل بياناتك» شُحن ثم كشف live test ثلاث عللٍ فيه، ونقلُ مولّد المنشور إلى هاب AI بالإعدادات كشف علّةً رابعة بالعرض**) — **الحالة الحيّة: HEAD = `b9525c4`** (أربعة كومِتات بالجلسة: `6f978e6` → `545dbf8` →…
- 7 آب 2026 (v211 — **صفحة المحاسبة تفصل القوائم الأساسية عن المعلومات التكميلية: البلاغ صنّف ثلاث بطاقات فخالفه الكود في واحدة وأضاف رابعة لم تُشخَط**) — **الحالة الحيّة: HEAD = `56f4886`** (كومِتا الجلسة `93ee3cd` ثم `56f4886`، وا…
- 6 آب 2026 (v210 — **تكافؤ بطاقات الخطط بصفحة اشتراك الطبيب مع البطاقات العامة: الطبيب الدافع كان يرى عن الصفّ نفسه أقلّ ممّا يراه زائرٌ مجهول**) — **الحالة الحيّة: HEAD = `ac834ce`** (كومِتا الجلسة `69c8aba` ثم `ac834ce`) · `relea…
- 5 آب 2026 (v209 — **تصدير إكسل موحَّد من مصدر واحد: ستة أسطح · حذف مرآة بدل حراستها · ثلاثة أعطاب تواريخ كانت تُفرِغ التصدير من معناه**) — **الحالة الحيّة: HEAD = `e8fc76f`** (كومِتات هذه الجلسة `4f3d2bf` ثم `a695f75` ثم `2617ed7`…
- 5 آب 2026 (v208 — **إلغاء وميضَي التحويل قبل الرسم: شيل لوحة التحكم وصفحة الدخول + مجموعة المرايا Q**) — **الحالة الحيّة: HEAD = `e8fc76f`** · `release` = **`e8fc76f`** (مُرقّى) · **SW `v150`→`v151` ثم `v157`→`v158`** · توكن الفلي…
- 5 آب 2026 (v207 — **سياق Sentry: الإصدار والبيئة وهويةُ المستأجر + إتمامُ إصلاح CSP بتوجيهين**) — **الحالة الحيّة: HEAD = `f33edd9`** · `release` = **`f33edd9`** (مُرقّى) · **SW `v156`→`v157`** · توكن الفليت **`20260805g`** · صفر …
- 5 آب 2026 (v206 — **قسم «معلومات الدخول» بطبقة المستأجر + Migration 124 + حارس النطاقات (الثالث عشر) + ثلاثة أعطاب قديمة كامنة**) — **الحالة الحيّة: HEAD = `b1de7ea`** · `release` يُرقّى بالبوابة · **SW `v151`→`v156`** · توكن الفل…
- 4 آب 2026 (v205 — **تضييق نطاق عزل BiDi إلى البريد المُصنَّع وحده + رابط الدخول يصل قابلاً للنقر**) — **الحالة الحيّة: HEAD = `0ce55b5`** (كومِتان فوق `daca9df`: `93f9242` الإصلاح ثم `0ce55b5` كسر الكاش) · `release` = **`0ce55b5`*…
- 4 آب 2026 (v204 — **عزل ثنائي الاتجاه للقيم اللاتينية/الرقمية بطبقة الأدمن + تصحيح قالب الترحيب المتجمّد على النموذج القديم**) — **الحالة الحيّة: HEAD = `daca9df`** (كومِتان فوق `1cf9eee`: `4be3b27` الإصلاح ثم `daca9df` كسر الكاش)…
- 3 آب 2026 (v203 — **معاينة المنتج باللاندينج تُولَّد من المحرّك الحيّ ثم تُجمَّد + إلغاء وميض شيل التطبيق بحارس متزامن قبل الرسم**) — **الحالة الحيّة: HEAD = `1cf9eee`** (كومِتان فوق `fea4e3b`) · `release` = **`1cf9eee`** (بوابة `…
- 3 آب 2026 (v202 — **البند #9 من الموجة الثانية (سرد churn-risk) بخمس جولات صقل + حارس أرقام حتميّ مشترك عمّم على الملخّصين + إصلاحا تصنيفٍ ونطاقٍ كشفهما الاختبار الحي**) — **الحالة الحيّة: HEAD = `fea4e3b`** (ثمانية كومِتات فوق `2…
- 3 آب 2026 (v201 — **توحيد هوية اسم العيادة: نقطة حقيقة واحدة بعلمٍ يصونه تريغر سيرفر-سايد + سجل تغيير الاسم بطبقة الأدمن**) — **الحالة الحيّة: HEAD = `22a543e`** (ثلاثة كومِتات فوق `93a9b90`) · `release` = **`22a543e`** (بوابة `ci…
- 3 آب 2026 (v200 — **البند #6 (صياغة أمر مخبر) بأربع جولات صقل + البند #8 (مولّد محتوى توعوي) بجولتين + إصلاح جذري لتسمم كاش الأصول المرقّمة + تعميم تصفير مودالات AI + القوالب الغنية بسلامة أرقام الأسنان + منع هلوسة اختصاص المحوَّل…
- 3 آب 2026 (v199 — **الموجة الثانية لميزات الذكاء الاصطناعي: خمسة بنود منفَّذة live-tested + ثلاث جولات صقل للبند الأول + hub «المساعد الذكي»**) — **الحالة الحيّة: HEAD = `b39c91b`** (تسعة كومِتات فوق `2100d27`) · **SW `v116`→`v125…
- 2 آب 2026 (v198 — **صفحة الإعدادات بتبويبات عرضية بنمط شريط الأدمن: `settingsGo` مرآة `adminGo` + إصلاح متمم لقياس الـtextareas داخل تبويب مخفي**) — **الحالة الحيّة: HEAD = `2100d27`** (كومِتان فوق `2a3fce6`) · **SW `v113`→`v115`*…
- 2 آب 2026 (v197 — **دفتر ذمم المخابر: Migration 118 `lab_payments` + كشف حساب لكل مخبر + شارات تغطية FIFO + إعادة تعريف «مستحق للمخابر» من وكيل حالة إلى ذمة حقيقية**) — **الحالة الحيّة: HEAD = `2a3fce6` (خمسة كومِتات فوق `6f22b12`…
- 1 آب 2026 (v196 — **جلسة إعادة تصميم لوحة الأدمن كاملة (ح1→ح4) + إصلاح جذري لحساب الدولار: MRR المنصة صار «دفترياً»**) — **الحالة الحيّة: HEAD = `469b9ae` (٩ كومِتات فوق `e892d00` — علماً أن `e892d00` نفسه [docs handoff v9، خطوة 5…
- 1 آب 2026 (v195 — **جلسة مزدوجة: خاتمة الخطوة 4 (تفكيك `patient-profile` و`admin`، خمسة استخراجات ١١–١٥) + ثلاث ميزات محاسبية بطبقة المنصة**) — **الحالة الحيّة: HEAD = `a3e97a5` (٢١ كومِتاً فوق `34adce7`) · SW `v93`→**`v103`** (عش…
- 1 آب 2026 (v194 — **جلسة الخطوة 3 كاملة: تفكيك `appointments.html` — ستة استخراجات، 7948→3540 سطراً**) — **الحالة الحيّة: HEAD = `34adce7` (ستة كومِتات فوق `7b0c00e`: `f8c2a14` · `c40b097` · `84a656c` · `b2fc21f` · `410fc05` · `34…
- 1 آب 2026 (v193 — **جلسة الفحص الشامل + المرحلة الأمنية أ: مزامنة وثيقة التسليم + Migrations 116–117**) — **الحالة الحيّة: HEAD = `7b0c00e` (كومِتان فوق `0c1266c`: `4c9220d` ثم `7b0c00e`) · SW `v91` بلا تغيير · الفليت `20260730e` …
- 1 آب 2026 (v192 — **جلسة انضباط تراكب المودالات: خصم المواد المؤجَّل + نمط iOS-sheet لتعتيم الأب**) — **الحالة الحيّة: HEAD = `0c1266c` (كومِت واحد فوق `53d4c7b`) · SW `v91` بلا تغيير · الفليت `20260730e` بلا تغيير (كسر كاش صفحيّ …
- 31 تموز 2026 (v191 — **جلسة خماسية متّصلة: المعلومات النقابية من نموذج التسجيل حتى رأس الروشتة**) — **الحالة الحيّة: HEAD = `c96a659` · SW `v84`→`v89` · الفليت `20260730a`→`20260730e` · Migrations مطبَّقة حتى **115** ✓ (التالي **1…
- 30 تموز 2026 (v190 — **جلسة ثلاثية: استرداد توثيق M86-lab المفقود · عمود «المريض» بتقارير الأطباء · ترتيب طلبات المخابر**) — **الحالة الحيّة: HEAD = release = `6b64ef3` · SW `v82`→`v84` · الفليت `20260729b`→`20260730a` · Migration…
- 29 تموز 2026 (v189 — **جلسة البنود الثلاثة المرصودة: بوابة خطة المخابر ببطاقة المريض · قوالب طلب المخبر (Migration 112) · تراكب المودالات · أسبقية ESC**) — **ستة كومِتات ميزة/إصلاح فوق `95781a9`: `3d5e5b5`(بوابة المخابر) → `b9ecca…
- 28 تموز 2026 (v188 — **جلسة صفحة الهبوط: قسم «نظرة عامة» + تصحيحان نصّيان ببطاقة الذكاء الاصطناعي**) — **كومِت واحد `d7b268d` فوق `5ba3bf8`، صفر migration، صفر JS، صفر منطق، SW `v74`→`v75`، الفليت `20260728i` بلا تغيير (لا أصل مشت…
- 28 تموز 2026 (v187 — **توحيد جلستين متوازيتين بيوم واحد**) — **هذا الملف يدمج نسختَي v186 اللتين أُنتجتا بمحادثتين متوازيتين على نفس الأساس `5facea6`، بصفر حذف من أيٍّ منهما.** التسلسل الزمني الحقيقي: v185 (`5facea6`) ← **v186-أ**…
- 28 تموز 2026 (v186-ب) — **جلسة اكتشاف التطبيق المثبَّت: (أ) بطاقة دعوة التثبيت عند أول فتح على متصفح جديد و(ب) زر التحديث العائم يصل أخيراً إلى صفحات الأدمن وتسجيل الدخول واللاندينج. أربعة كومِتات `e7b6046`→`5ba3bf8` فوق `2d1abf9`…
- 28 تموز 2026 (v186-أ) — **جلسة نصّية بحتة: مواءمة صفحة الهبوط ووصف المساعد مع الواقع الحيّ + ترقية المحاسبة إلى ميزة بيع من الدرجة الأولى. كومِتان `e147e57` و`2d1abf9` فوق `5facea6`، SW `v71`→`v72`، صفر migration · صفر منطق · صفر …
- 28 تموز 2026 (v185) — **جلسة بندين من باكلوغ الـAI: (أ) تجاوز الأدمن للذكاء الاصطناعي لكل حساب (Migration 110) و(ب) الملخّص الذكي للوحة المحاسبة — بند #8 (Migration 111). أربعة كومِتات `04fac7f`→`5facea6` فوق `1cfa8e1`، ميغريشنان …
- 28 تموز 2026 (v184-ب — **قسم مستردّ**، وُثِّق لاحقاً بجلسة v186) — **جلسة بطاقة «آخر الجلسات» بملف المريض: 4 كومِتات فوق `fa0f7fd` ⇒ HEAD `1cfa8e1`** — وهو الأساس الذي بُنيت عليه v185. صفر migration · صفر مالي · صفر RLS · `book.ht…
- 28 تموز 2026 (v184) — **جلسة منظومة رسائل الواتساب: مكتبة القوالب + العناصر النائبة الذكية + توحيد سطوح المتابعة — 14 كومِتاً `bce4372`→`fa0f7fd` فوق `1118e4b`، Migration 109 (`wa_message_templates`) **مطبَّقة مباشرةً عبر أداة Sup…
- 27 تموز 2026 (v183) — **جلسة إغلاق تفكيك admin: الحزام الأخير A1 (طبقة الخطط والاشتراكات) نزل بـ`admin-plans.js`، فانتهى أكبر ملف وحشي متبقٍّ عند 5,012 سطراً بعد 9,618 (−48%). ومعه حارس جديد يحوّل القاعدة #223 من توثيق بلا إنفاذ إ…
- 27 تموز 2026 (v182) — **جلسة اختطاف بطاقة الطبيب المعيَّن: باغ بنيوي كان يمحو هوية أول طبيب يُعيَّن في أي عيادة جديدة، ويترك جلساتها الأولى بلا طبيب — أُغلق من جذره عند لحظة التسجيل.** كومِتان `d565340` + `85a22b9` فوق `f8161a6` ·…
- 27 تموز 2026 (v181) — **جلسة عملة العيادة: الطبيب يختار ل.س أو $ مرة واحدة عند التسجيل، والخيار مقفول بعدها إلى الأبد.** كومِتان `8b331c6` + `f8161a6` فوق `a696e86` · **SW_VERSION v60→v61** · **التوكن `20260727h`→`20260727i`** · *…
- 27 تموز 2026 (v180) — **جلسة الفوترة الكبرى: دورة ربع سنوية + تسعير بالدولار + تحكّم كامل بقائمة الميزات — وثلاثة أخطاء أُمسكت أثناء التنفيذ أحدها كان يكتب نصاً تالفاً بصفحة الأسعار العامة.** ستة عشر كومِتاً `0886da5`→`a696e86` فو…
- 27 تموز 2026 (v179) — **جلسة الشوط الثاني للتفكيك: patient-profile نزل تحت النصف (15,933 → 7,119 سطراً، −55%)، وبوابة النشر أثبتت قيمتها عملياً بحجب ثلاث نشرات مكسورة عن الإنتاج.** أربعة عشر كومِتاً `79b0210`→`3419561` فوق `ca59c3…
- 26 تموز 2026 (v178) — **جلسة وثيقة التسليم v6→v7: إغلاق فجوة التوثيق بعد التفكيك، واكتشاف أخطر منها — نسخة إنجليزية متأخّرة عشرين يوماً تُقرأ كأنها حالية.** كومِت واحد: **`e4f8f26`** (توثيق بحت — صفر كود · صفر رفعة SW · صفر cache-…
- 26 تموز 2026 (v177) — **جلسة تفكيك الملفات الوحشية: أكبر دين معماري بالمشروع دخل التنفيذ لأول مرة، و−4,614 سطراً خرجت من الوحشين بأنبوب استخراج مُبرهَن.** اثنا عشر كومِتاً `3b48cfc`→`03e78c3` فوق `b1394bd` بثلاث دفعات · **SW_VERSI…
- 26 تموز 2026 (v176) — **تحديث تصحيحي: أرقام قديمة بالوثائق، وتمديد مستأجر الاختبار سنةً كاملة، وإصلاح صياغة نفّذته جلسة متوازية.** كومِت واحد: **`b1394bd`** (وثيقة التسليم v5→v6 — توثيق بحت، صفر كود). **`main` = `b1394bd`** · **SW…
- 26 تموز 2026 (v175) — **جلسة الكتالوج الافتراضي: استنساخ قائمة العلاجات المرجعية 1:1 لكل عيادة جديدة + قتل مصدر زرع خفيّ في الـDB + الحارس العاشر.** كومِتان: **`18b800c`** (JS: `CLINIC_CATALOG`) ثم **`395efca`** (M103 + حارس التما…
- 26 تموز 2026 (v172) — **المسار ب / الجلستان ب٢-ب + ب٣-١: السيناريو المالي منجز ومقبول، وE2E دخل بوابة النشر informational.** خمسة كومِتات `2114755`→`ab36deb` فوق `c6003e7`، **معيار القبول تحقّق مرتين: ست تشغيلات خضر متتالية لب٢-ب …
- 25 تموز 2026 (v171) — **المسار ب / الجلسة ب٢-أ: سيناريوهات Playwright الثلاثة (تنقّل · دورة المريض · دورة الموعد) — منجزة ومقبولة.** ستة كومِتات `05b5779`→`c6003e7` فوق `84f655c`، **معيار القبول تحقّق: ثلاث تشغيلات خضر متتالية بأر…
- 25 تموز 2026 (v170) — **استنساخ قائمة العلاجات المرجعية كـ«الافتراضي» لكل عيادة جديدة (`CLINIC_CATALOG`، 24 علاجاً، كل الأسعار 0).** كومِت واحد فوق `fbdb6c3`: **`18b800c`** · ملفّان فقط (`treatments.html` + `sw.js`) · **SW_VERSION…
- 25 تموز 2026 (v168) — **جلسة صقل «شرح الخطة للمريض»: (أ) تجميع هجين — سنٌّ بعدة علاجات = خطة مراحل واحدة متسلسلة · (ب) إصلاح بترٍ صامت كان يُسقط علاجات من الشرح.** كومِتان فوق `0a8d964`: `a8f7b4f`(التجميع الهجين + رتبة التسلسل الس…
- 25 تموز 2026 (v167) — **جلسة منتج مزدوجة (بلا بنية تحتية): (أ) صقل مخرجات ميزات AI الثلاث · (ب) إعادة تصميم «التحديد المتعدد» على مخطط الأسنان حتى تكافؤ كامل مع الفحص الأولي + دمج مواضع السن الواحد بجلسة مركّبة واحدة.** ستة كومِتا…
- 25 تموز 2026 (v166) — **المسار ب / الجلسة ب١: تأسيس Playwright Smoke E2E — بيئة معزولة + سكّ جلسة بلا كابتشا + workflow يدوي للبرهان.** كومِتان `e4bcfae`→`84f655c` فوق `cfe37be`، صفر migration (التالي 100)، **SW_VERSION v22 بلا تغ…
- 24 تموز 2026 (v165) — **جلسة المراجعة المستقلة + المسار أ (الاستضافة الذاتية) + إنقاذ طبقة الأوفلاين بالكامل + الحارس التاسع.** 7 كومِتات `b5664e3`→`2d07910`→`b067704`→`e244b9f`→`035f37d`→`af029f3`→`cfe37be` فوق `1ee9d06` · **SW_V…
- 24 تموز 2026 (v164) — **جلسة تنظيف الكونسول: إصلاح حجب CSP لجلب الخطوط/jsDelivr من سياق fetch + تبنّي الـService Worker للسياسة الجديدة. commit-ان `303ef66` ثم `1ee9d06` فوق `1d8cfca`** · ملفان فقط (`_headers` + `sw.js`) · صفر كود…
- 24 تموز 2026 (v163) — **جلسة أتمتة deploy الـEdge Functions عبر CI (بند الدَّين المعماري الأول) — مغلق حيّاً ✅.** commit واحد `1d8cfca` فوق `a67d10f` (تصليح CSS من جلسة موازية — rebase نظيف فوقه والحُرّاس خضر بعده) · 4 ملفات: work…
- 24 تموز 2026 (v162) — **جلسة تدقيق شامل (Hardening v5 + الريبو الحي + محرّكات المال الاثنا عشر) + إغلاق آخر بقايا `var(--card)` غير المعرّف بالأسطول.** commit واحد `a67d10f` فوق `69c5836` · **CSS-only بملف `admin.html` وحده** · صف…
- 22 تموز 2026 (v161) — **جلسة backlog صغير: ترقية GitHub actions من Node 20 إلى Node 24 (إزالة تحذيرات الإهمال قبل قطع 16 أيلول 2026). تعديل CI/YAML بحت: صفر كود تطبيق · صفر migration · صفر cache-bust · صفر مساس مالي · `book.html` …
- 22 تموز 2026 (v160) — **جلسة تصحيح قائمة «المتبقّي»: إغلاق بنود قديمة كانت تُنسخ خطأً كـ«دَين معماري متبقٍّ». عملية توثيقية بحتة: صفر commit · صفر مسّ للريبو/الكود.** لاحظ المالك أن H3/H4/Bug#1 منتهية — والتحقّق الحيّ (Rule #19) أ…
- 22 تموز 2026 (v159) — **جلسة تمرين التعافي من الكوارث (DR drill / بند 2.3) — نُفِّذ حيّاً ونجح + جولة توثيق/تصحيح. عملية تشغيلية بحتة: صفر commit · صفر مسّ للريبو/الكود · صفر migration.** استرجاعٌ فعليٌّ لآخر نسخة احتياطية على مشر…
- 22 تموز 2026 (v158) — **جلسة حزمة الجاهزية/التنظيف (a11y + تنظيف الكاش): بندان على ملفّات `.html` إنتاجية مخدومة — البند 1 حذف وسوم الكاش المتقادمة من 9 صفحات، والبند 2 ربط الـlabels المرئية بالحقول عبر `for`/`id` (a11y) بمودالين …
- 22 تموز 2026 (v157) — **جلسة توسيع شبكة أمان المحاسبة: ستّة بلوكات جديدة (G·H·I·J·K·L) للحارس السابع `scripts/check-critical-logic.js` — تغطية كل المنطق المالي/الحرج القابل للقفل بنمط الحارس. قراءة-فقط، صفر لمس إنتاج، صفر ملف `.ht…
- 21 تموز 2026 (v156) — **جلسة ميزة AI جديدة + صقل مخرجات: (أ) ميزة «شرح خطة العلاج للمريض» (AI #3، جديدة كلياً، موجّهة للمريض) · (ب) تحويل مخرجات «شرح الخطة» و«الملخّص الذكي» إلى نص عادي مهني منظّم (بلا markdown). مبنيّة على أساس A…
- 21 تموز 2026 (v155) — **جلسة تصليب أمني/تشغيلي شاملة (Hardening) — مراجعة مستقلة للمشروع من الريبو الحيّ → خطة → تنفيذ كامل مُثبت بالأدلة الحيّة. ليست جلسة ميزات: صفر مساس بمنطق المنتج عدا `_headers` (CSP) + متغيّرات CSS + تعليقات…
- 21 تموز 2026 (v154) — **جلسة تحسينات ملف المريض: (أ) بطاقات بارزة + فواصل رأسية · (ب) قوالب سجل الزرعات (نظير قوالب التعليمات، Migration 99) · (ج) عزل bidi لسطر المواصفة · (د) إعادة ترقيم الميغريشن 98→99 — 4 كومِتات `9d09f1e`→`c8b…
- 20 تموز 2026 (v153) — **إكمال شبكة أمان المحاسبة: بلوكات D+E+F للحارس السابع (`scripts/check-critical-logic.js`) + تسجيل المرشّحات المتبقّية. قراءة-فقط، صفر لمس إنتاج، صفر ملف `.html` بأي كومِت.** **تسلسل الكومِتات من `e9fb761` (ن…
- 20 تموز 2026 (v152) — **جلسة بناء شبكة الأمان: الحارس السابع «مثبت المنطق الحرج الدائم» (`scripts/check-critical-logic.js`) بثلاث بلوكات A/B/C — احتواء دَين تقني بحت، صفر إعادة هيكلة، صفر لمس إنتاج.** **3 كومِتات فوق `baeb850`:** …
- 20 تموز 2026 (v151) — **إكمال باكلوغ AI #2 (تلخيص ملف المريض) + تغيير أيقونة الـAI (✨→🤖) + نشر بوابة الخطة سيرفر-سايد (تصحيح v150) + قرار تأجيل تجاوز الأدمن والـchatbot لحين توفّر رصيد Anthropic.** **كومِتان فوق `6030fa1`:** `97e3…
- 20 تموز 2026 (v150) — **جلسة بناء ميزة الذكاء الاصطناعي الأولى (باكلوغ AI #1 — مساعد كتابة ملاحظة الجلسة) + أساسها المشترك، بمنهجية مراحل + الحُرّاس الستة خضر بكل كومِت + رفع SW ثلاثي (v6→v9).** **5 كومِتات فوق `c75819d`:** `19273…
- 20 تموز 2026 (v149) — **تحديث حالة (تصحيح توثيقي، صفر كود/commit/migration/cache-bust — HEAD `b91ae36` بلا تغيير، فليت `20260719d` بلا تغيير، Migrations حتى 97 التالي 98).** **تصحيح قائمة أولويات الأسرار:** بلوك v148 أعاد إدراج «S…
- 19 تموز 2026 (v148) — **جلسة إنجاز باكلوغ المنافسين بالكامل: البنود #10 (Perio v2) · #6 (ربط العائلة Household) · #9 (قوالب الملاحظات السريرية) · #7 (رابط تقييم غوغل + قالبه المحرَّر) — كلها live-confirmed ✅.** **باكلوغ المنافسين …
- 19 تموز 2026 (v147) — **جلسة البند #10 من باكلوغ المنافسين (Perio v2 — انحسار اللثة + CAL محسوب مشتق + تدريج تشعب الأرحاء) بمنهجية الـ5 مراحل + معالجة تصادم جلسة موازية (إعادة ترقيم الميغريشن 92→93).** **كومِت واحد `a4de0ad` فوق `…
- 19 تموز 2026 (v146) — **جلسة فصل الحساسيات عن التحذيرات الطبية ببطاقة المريض + تحذير حر + توسيع أصناف الحساسية + إعادة تنسيق مودال الطباعة + شارة حساسية بقائمة المرضى والمواعيد (بلاغ المالك بصور: خلط بين التحذيرات والحساسية بمودال…
- 19 تموز 2026 (v145) — **جلسة البند #8 من باكلوغ المنافسين العرب (سجل الزرعة — Implant Log) بمنهجية الـ5 مراحل + متابعة حية موسّعة (بطاقة على مستوى المريض + أوصاف تدقيق + إصلاح كاش مسمّم).** الترتيب المعتمد الجديد من المالك للبنود …
- 19 تموز 2026 (v144) — **جلسة أربعة بنود من باكلوغ المنافسين العرب دفعة واحدة (Backlog #2→#3→#4→#5) — تنفيذ متسلسل معتمد بمنهجية الـ5 مراحل لكل بند — 4 كومِتات `d68fc12`→`73093f6`→`a540971`→`9186c26` فوق `17917a6` + Migrations 88/8…
- 18 تموز 2026 (v143) — **جلسة متغيّر `{support_email}` بقوالب واتساب الأدمن + سؤال الأوفلاين بالأسئلة الشائعة (تعديلان صغيران بطلب المالك بصور) — كومِتان `45943b9`→`ae85663` فوق `469ca0f`، ملفان inline (`admin.html` + `landing.html…
- 18 تموز 2026 (تتمة) — **جلسة قفل «يطبَّق على» للعلاجات المحمية (v139): طلب المالك — علاجات التقويم (والمحمية عموماً: حافظ المسافة، قلع/زراعة/جسر المدمجة) لا يمكن حذفها (custom-geometry) ويجب أن يقتصر تعديلها بحيث لا يستطيع الطبيب …
- v182 — **جلسة اختطاف بطاقة الطبيب المعيَّن (27 تموز): كومِتان `d565340`+`85a22b9` · Migration 108 مطبَّقة ✓ · SW v61→v62 · التوكن `20260727i`→`20260727j` · الحُرّاس الأحد عشر خضر · مثبت node 4 سيناريوهات + حارسان بنيويان · صفر لمس…

---

## 🔑 GitHub PAT (سرّي — لا تطبعه في outputs)

```
<<GITHUB_PAT_REDACTED>>
```

**ينتهي:** 23 يونيو 2027 (UTC 2027-06-23 22:00)
**الاسم:** `SyDent-dev` (دُوِّر 24/6/2026 من `Syrdent-token` المنتهي 22 تموز 2026)
**الصلاحيات:** SyDent فقط · Contents R&W + Workflows R&W + Metadata R (least-privilege، fine-grained)
**Configured as:** `AyhamGhnaim` / `drayhamghnaim@gmail.com`

⚠️ يجب يكون في الـ `[remote "origin"]` URL في `.git/config` فقط. **لا تطبعه أبداً في outputs يشوفها المستخدم.** لو تسرّب → Revoke فوراً من GitHub Settings → أنشئ PAT جديد → حدّث هذا الملف.

---

## 🛠️ أوامر البداية

### 1. Clone مع PAT مدمج (يخزّن الـ token في .git/config)

```bash
cd /tmp && rm -rf SyDent && \
  git clone https://<<GITHUB_PAT_REDACTED>>@github.com/AyhamGhnaim/SyDent --depth 30 2>&1 | sed 's/github_pat_[^@]*/[PAT_HIDDEN]/g' && \
  cd /tmp/SyDent && \
  git config user.email "drayhamghnaim@gmail.com" && \
  git config user.name "AyhamGhnaim"
```

⚠️ ملاحظة (v35+): دائماً أضف `| sed 's/github_pat_[^@]*/[PAT_HIDDEN]/g'` لمنع تسريب الـ PAT في outputs.

### 2. إنشاء JS Validator (vm.Script per-block)

```bash
cat > /tmp/validate_js.js << 'EOF'
#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const path = process.argv[2];
if (!path) { console.error('Usage: node validate_js.js <file.html>'); process.exit(2); }
const src = fs.readFileSync(path, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, idx = 0, anyErr = false;
while ((m = re.exec(src)) !== null) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (/type\s*=\s*"[^"]*json/i.test(attrs)) continue;
  idx++;
  const body = m[2];
  const before = src.slice(0, m.index);
  const startLine = before.split('\n').length;
  try {
    new vm.Script(body, { filename: `${path}#inline${idx}@L${startLine}` });
    console.log(`✓ inline #${idx} (HTML line ${startLine}, ${body.split('\n').length} lines)`);
  } catch (e) {
    anyErr = true;
    console.error(`✗ inline #${idx} starting at HTML line ${startLine}:`);
    console.error('  ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n  '));
  }
}
if (idx === 0) { console.log('(no inline scripts found)'); }
process.exit(anyErr ? 1 : 0);
EOF
```

### 3. Push helper (with PAT redaction)

```bash
git push origin main 2>&1 | sed 's/github_pat_[A-Za-z0-9_]*/[PAT_HIDDEN]/g'
```

### 4. Script Order Validator (Phase 7.5 derived — Rule #28)

```bash
cd /tmp/SyDent && for f in *.html; do
  init_line=$(grep -nE '<script src="supabase-init\.js' "$f" | head -1 | cut -d: -f1)
  cdn_line=$(grep -nE '<script src="https://cdn\.jsdelivr\.net/npm/@supabase' "$f" | head -1 | cut -d: -f1)
  sidebar_line=$(grep -nE '<script src="sidebar\.js' "$f" | head -1 | cut -d: -f1)
  head_end=$(grep -n "</head>" "$f" | head -1 | cut -d: -f1)
  if [ -n "$init_line" ] && [ -n "$cdn_line" ] && [ "$cdn_line" -gt "$init_line" ]; then
    echo "🚨 $f: CDN($cdn_line) AFTER init($init_line)"
  fi
  if [ -n "$sidebar_line" ] && [ "$init_line" -gt "$sidebar_line" ]; then
    echo "🚨 $f: init($init_line) AFTER sidebar($sidebar_line)"
  fi
  if [ -n "$cdn_line" ] && [ "$cdn_line" -gt "$head_end" ]; then
    echo "🚨 $f: CDN($cdn_line) in body, </head>=$head_end"
  fi
done
echo "Done."
```

### 5. HTML balance check

```bash
python3 -c "
import re
with open('admin.html') as f: html = f.read()
print('Divs:', len(re.findall(r'<div[\s>]', html)), '/', html.count('</div>'))
print('Spans:', len(re.findall(r'<span[\s>]', html)), '/', html.count('</span>'))
print('Buttons:', len(re.findall(r'<button[\s>]', html)), '/', html.count('</button>'))
print('Anchors:', len(re.findall(r'<a[\s>]', html)), '/', html.count('</a>'))
"
```

---

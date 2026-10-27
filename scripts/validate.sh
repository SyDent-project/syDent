#!/usr/bin/env bash
# SyDent — validate.sh: تشغيل كل حُرّاس الجودة دفعة واحدة.
# الاستخدام: bash scripts/validate.sh   (من أي مكان داخل الريبو)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
S=scripts; FAIL=0
echo "═══ SyDent — الحُرّاس الثامن والأربعون ═══"
node "$S/validate-js.js"            || FAIL=1
python3 "$S/check-divs.py"          || FAIL=1
bash "$S/check-cdn-order.sh"        || FAIL=1
bash "$S/scan-secrets.sh" --all     || FAIL=1
node "$S/check-mirrors.js" | tail -1 || FAIL=1
bash "$S/check-offline-guard.sh"      || FAIL=1
node "$S/check-critical-logic.js" | tail -1 || FAIL=1
node "$S/check-xss.js"             || FAIL=1
node "$S/check-sw-logic.js"        || FAIL=1
node "$S/check-catalog-parity.js"   || FAIL=1
node "$S/check-datatest-census.js"  || FAIL=1
node "$S/check-plan-gating.js"      || FAIL=1
node "$S/check-scopes.js"           || FAIL=1
node "$S/check-demo-sandbox.js"      || FAIL=1
node "$S/check-template-scope.js"    || FAIL=1
node "$S/check-colors.js"            || FAIL=1
node "$S/check-guides.js"            || FAIL=1   # أدلة الأقسام: لكل قسم رئيسي دليلٌ مكتوب (guides.js)
node "$S/check-fusha.js"             || FAIL=1   # C1/C2: نصوص الواجهة بالفصحى — لا كلمات عامية شائعة
# v432: مثبت DOM حيّ — ينقر مودال السن كما ينقر الطبيب (يتخطّى نفسه بلا playwright)
python3 "$S/dom-smoke/run.py" | tail -1 || FAIL=1
node "$S/check-modal-behaviour.js" | tail -1 || FAIL=1
python3 "$S/dom-smoke/appointments/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/appt-head/run.py" | tail -1 || FAIL=1   # v592: رأسُ بطاقة الموعد — الحالةُ لا تركب فوق الشارات/«+N» (رسمٌ حقيقي)
python3 "$S/dom-smoke/appt-head/run.py" --self-test | tail -1 || FAIL=1   # v592: … وتحمرّ بإعادة absolute
python3 "$S/dom-smoke/patients/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/patient-profile/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/pages/run.py" | tail -1 || FAIL=1
node "$S/check-row-actions.js"       || FAIL=1
# v485: الإثباتُ العكسي للطقم بالبوابة — كان يُشغَّل يدوياً فتقادمت مراسيه منذ v482 بصمت
node "$S/check-row-actions.js" --self-test > /tmp/sy-ra-self.log 2>&1 && tail -1 /tmp/sy-ra-self.log || { cat /tmp/sy-ra-self.log; FAIL=1; }
node "$S/check-sydt.js"              || FAIL=1
node "$S/prove-removal-sessions/clear.js" || FAIL=1   # v488: جلساتُ ما تزيله أزرار المخطط (#664/#665)
node "$S/prove-removal-sessions/paths.js" || FAIL=1
# v576: jsdom أداةُ بناءٍ صرفة كـacorn؛ تُثبَّت هنا --no-save لأن رمزَ الدفع بلا نطاق workflow (لا يمسّ ci-guards.yml) — وعند التعذّر يتخطّى المثبتُ نفسه بوضوح
node -e "require('jsdom')" 2>/dev/null || npm install jsdom acorn --no-save --no-audit --no-fund --silent >/dev/null 2>&1 || true   # v600: acorn معه — تثبيتُ --no-save يقلّم ما ثُبّت قبله بـ--no-save (أسقط acorn بـCI فسقط مثبتُ خيارات الخطة)
node "$S/prove-chart-conditions.js" | tail -1 || FAIL=1   # v576: التماسُ المفتوح بخطّين على سنّين · الكسرُ إطباقياً بالراية · سهمُ الانطمار ذرويّ — jsdom على عُدّة dom-smoke + ٤ طفرات تعضّ (يتخطّى بلا jsdom)
node "$S/prove-chart-status.js" | tail -1 || FAIL=1   # v595: الحالةُ تُرسم على الإجراء نفسه (منجز صلب · مخطط تهشير · موجود أفتح · محوَّل منقّط) بلا تعتيم السن — 20 توكيداً + 9 طفرات تعضّ
node "$S/prove-chart-dx.js" | tail -1 || FAIL=1   # v606 (M179): التشخيصُ يبقى تحت العلاج — رمزٌ فوق المخطّط · «التشخيص/عولج» · «سبب العلاج» · الإزالةُ تعيد الحالة · المركّبُ يحمل حروفه — مساراتُ المودال والإزالة والفحص الحقيقية + ١٤ طفرة
node "$S/prove-plan-options/run.js" | tail -1 || FAIL=1   # v600: خياراتُ الخطة على الكود الحقيقي (377 توكيداً) — منها run6: بدائلُ السن نفسه بأي ترتيب (قلعٌ مخطّط = سنٌّ قائم · زرعةٌ على قلعٍ مخطّط جلسةُ خطة · جسرٌ بديل للزرعة)
python3 "$S/prove-plan-options/mutants.py" | tail -1 || FAIL=1   # v600: … وعشرُ طفراتٍ تعضّ (#637)
node "$S/prove-plan-cards.js" --self-test | tail -1 || FAIL=1   # v597: خياراتُ الخطة بطاقاتٌ مسمّاة بمحتواها + ضابطُ الصفّ (المرحلة · البديل) — 23 توكيداً + 10 طفرات تعضّ
node "$S/prove-extraction-wipe.js" --self-test | tail -1 || FAIL=1   # v608: القلعُ المنجز يُنهي السن — محوُ أسطحه وحالاته، حملُها dx على صفّ القلع، وعودتُها بإلغاء القلع (jsdom · 14 توكيداً · 5 طفرات)
node "$S/prove-condition-conflicts.js" --self-test | tail -1 || FAIL=1   # v609: الحالاتُ مقابل العلاجات على مسار الحفظ الحقيقي — التاجُ الكامل/مثبِّتُ الجسر يمحو أسطح التاج ويحمل حالاتها، الزرعة تحمل حالات السن، إزالة التاج تعيد الحالة، v610: حالةٌ على سطحٍ معالج = «ملاحظة على العلاج» (dx «!») بالوضعين العادي والفحص · v612: مظهرُ الحالة بمودال السن (jsdom · 34 توكيداً · 9 طفرات)
node "$S/prove-staff-msgs.js" --self-test | tail -1 || FAIL=1   # v579: الرسائل الداخلية — وصولٌ لحظي بقناة Realtime مرشَّحة بالعيادة (M175) · إعلانٌ واحد لكل رسالة (توست + نغمة) · لا AudioContext قبل لمسة · 🔕 يُحفظ · لا صوت بوضع القراءة · الاستطلاعُ احتياط — jsdom + ١٢ طفرة (يتخطّى بلا jsdom)
node "$S/prove-appt-conflict.js" --self-test | tail -1 || FAIL=1   # v495: حارسُ التعارض عند الحفظ — بإثباته العكسي
node "$S/prove-pt-reliability.js" --self-test | tail -1 || FAIL=1   # v497: مؤشّرُ التزام المريض — بإثباته العكسي
node "$S/prove-sched-blocks.js" --self-test | tail -1 || FAIL=1   # v498: الحجوزاتُ المغلقة (M154) — بإثباته العكسي
node "$S/prove-booking-card-layout.js" --self-test | tail -1 || FAIL=1   # v503: تخطيطُ بطاقة الحجز الإلكتروني على الجوال
node "$S/prove-noshow-list.js" --self-test | tail -1 || FAIL=1   # v504: قائمة «غابوا» + قاعدة M156 للبوابة
node "$S/prove-appt-series.js" --self-test | tail -1 || FAIL=1   # v505: المواعيدُ المتكرّرة (M157)
node "$S/prove-appt-family.js" --self-test | tail -1 || FAIL=1   # v506: حجزُ الأسرة المتتابع
node "$S/prove-appt-unconfirmed.js" --self-test | tail -1 || FAIL=1   # v534: «غير مؤكد» — خيار المودالين · صفرُ حالةٍ فارغة · أثرُ الدفعات التابعة · نبضُ اليوم موحّدٌ مع التقويم
node "$S/prove-acc-aging.js" --self-test | tail -1 || FAIL=1   # v507: تقادمُ ذمم المرضى — مرآةُ رصيد اللوحة + حفظُ الذمم
node "$S/prove-acc-daysheet.js" --self-test | tail -1 || FAIL=1   # v508: كشفُ اليوم + طرقُ الدفع الموحَّدة (pay-methods.js)
node "$S/prove-acc-trend.js" --self-test | tail -1 || FAIL=1   # v509: الاتجاهُ الشهري — computeSummary بتبديل السياق، حفظٌ، مرآةُ اللوادر
node "$S/prove-huddle-flags.js" --self-test | tail -1 || FAIL=1   # v514: أعلامُ الهدل الصباحي — رصيدٌ من dashFin · مخطّطٌ حرّ بـSyDentApptDead · مرآةُ التحذيرات ×4
node "$S/prove-dash-arrival.js" --self-test | tail -1 || FAIL=1   # v515: «وصل» لكل موعدٍ غير منتهٍ + التأكيدُ الضمني بالكتابة نفسها
node "$S/prove-dash-yesterday.js" --self-test | tail -1 || FAIL=1   # v517: ملخّصُ أمس — أرقامُ SyDentDaySheet رقماً برقم · آخرُ يوم عمل · الإقفال · ?ds=
node "$S/prove-dash-goal.js" --self-test | tail -1 || FAIL=1   # v518: الإنتاجُ مقابل الهدف — المجدولُ بكيس عملته · الشهرُ عبر SyDentDaySheet · M159
node "$S/prove-dash-gaps.js" --self-test | tail -1 || FAIL=1   # v519: الفجواتُ القابلة للتعبئة — الساعات · المشغول · قائمةُ الانتظار · العلاجُ بلا موعد · روابطُ ?slot=/?moveTo=
node "$S/prove-lab-redo.js" --self-test | tail -1 || FAIL=1   # v523: دورةُ إعادة المخبر — date_sent لا يتحرّك · السبب · M160 · السطحان
node "$S/prove-lab-due.js" --self-test | tail -1 || FAIL=1   # v524: الاستحقاقُ التلقائي بأيام الدوام · سقفُ موعد التركيب · الحفظُ يرفض ما بعده · الزرّ العائم
node "$S/prove-lab-worklist.js" --self-test | tail -1 || FAIL=1   # v527: «بدها تحرّك» — متأخر · قارب الموعد · بلا موعد تركيب (SyDentApptDead) · ?newFor= · الإعادةُ على اللوحة
node "$S/prove-lab-slip.js" --self-test | tail -1 || FAIL=1   # v528: ورقةُ طلب المخبر — تهريب · بلا تكلفة · الترخيص (M115) · الدفعة · print متزامن
node "$S/prove-lab-perf.js" --self-test | tail -1 || FAIL=1   # v532: أداءُ المخبر — مدّة الدورة الأولى بأيام الدوام · بالموعد · الإعادة · الحدود الدنيا
node "$S/prove-lab-files.js" --self-test | tail -1 || FAIL=1   # v535: مرفقاتُ الطلب — ملفاتُ المريض + lab_order_id (M162) · رفعٌ فوري/محجوز · الدفعة · الحد
node "$S/prove-rpt-treat.js" --self-test | tail -1 || FAIL=1   # v539: تبويبُ العلاجات بالتقارير — تقسيمٌ لا معادلة (= إنتاج تبويب الأطباء بكل نطاق/طبقة) · مرآةُ التصنيفات وهوية العلاج · الفترة السابقة
node "$S/prove-rpt-newpt.js" --self-test | tail -1 || FAIL=1   # v540: المرضى الجدد — أولُ علاجٍ منجز من كل التاريخ (لا رسم/رصيد سابق) · طبيبُ أول زيارة · مرآةُ المصادر · سجّلوا وما بلّشوا
node "$S/prove-rpt-att.js" --self-test | tail -1 || FAIL=1   # v541: الحضور والغياب — التصنيف مرآةُ SyDentReliability · النسب من المنتهي · الوقت الضائع · طبيبُ الموعد · المكرّرون
node "$S/prove-rpt-ret.js" --self-test | tail -1 || FAIL=1   # v542: الاحتفاظ — النشط خلال 12 شهراً · المفقودون · الجدد بتعريف المرضى الجدد · حجزوا الخطوة الجاية · الاتجاه
node "$S/prove-rpt-ref.js" --self-test | tail -1 || FAIL=1   # v544: مين حوّل المريض (M164) — الحارس · المنتقي بالمصدر والمالك · النموذجان والبطاقة · تقرير المُعرِّفين
node "$S/prove-rpt-sum.js" --self-test | tail -1 || FAIL=1   # v545: ملخّص الفترة — clinicTotals مصدرٌ واحد · الفترة/السابقة/السنة الماضية بمحرّكات التبويبات · الطباعة والنص
node "$S/prove-acc-xlsx.js" --self-test | tail -1 || FAIL=1   # v546: Excel المحاسبة — SyDentXlsx بأوراق (الواحدةُ كما كانت) · buildAccSheets من الطبقات نفسها · الفترة المطبَّقة
node "$S/prove-period-paging.js" --self-test | tail -1 || FAIL=1   # v547: قراءاتُ الفترة مصفّحة (1000 صفّ) بالتقارير والمحاسبة واتجاهها · الفشلُ لا يُبتلع · مقاطع 150
node "$S/prove-no-hidden-scroll.js" --self-test | tail -1 || FAIL=1   # v547: لا شريطَ يُخفي عناصرَه بتمريرٍ أفقي بلا إشارة (التقارير · الإعدادات · تصنيفات العلاجات)
node "$S/prove-fetchall.js" --self-test | tail -1 || FAIL=1   # v548: قصّ 1000 صفّ بكل المنصة — SyDentFetchAll + جردٌ آلي لكل قراءة جماعية بلا تصفيح (استثناءاتٌ مسبَّبة)
node "$S/prove-deepcode-b1.js" --self-test | tail -1 || FAIL=1   # v550: Deep Code دفعة ١ — شريطُ التنبيه الطبي اللاصق · لا «لا يوجد» قبل التحميل · هيكلُ التحميل · مسافةُ الزر العائم (والتنحّي بالتمرير محروسٌ غائباً — v579)
node "$S/prove-perf-calendar.js" --self-test | tail -1 || FAIL=1   # v551: Deep Code #1 — إقلاعُ التقويم دفعةٌ متوازية (12 جولة ⇒ 1–2) · أولُ رسمٍ ينتظر الدفعة · المواعيد/الجلسات/المخابر معاً
node "$S/prove-appt-quick-open.js" | tail -1 || FAIL=1   # v593: «موعد سريع» — الكتالوج/الأطباء مرةً بالإقلاع · أسماءُ المرضى مع الدفعة برابطٍ عميق · فتحُ النافذة بلا رحلات متسلسلة
node "$S/prove-appt-quick-open.js" --self-test | tail -1 || FAIL=1   # v593: … و5 طفرات تعضّ
node "$S/prove-intake.js" --self-test | tail -1 || FAIL=1   # v595: استمارةُ المريض الرقمية (M177) — مرايا المفاتيح ×3 · سطحٌ مستقلّ · ERR_MAP ≡ استثناءات الهجرة · بوابات الأمن · خطةُ الدمج اتحادٌ لا استبدال · الرسمُ بأزرارٍ حرفية · التوصيل ×6 — 10 طفرات تعضّ
node "$S/prove-portal.js" --self-test | tail -1 || FAIL=1   # v613: بوابةُ المريض الخفيفة (M180) — سطحٌ مستقلّ قراءةً محضة · RPC واحد STABLE بلا كتابة · كلُّ قسمٍ خلف مفتاحه · >1 خيار ⇒ لا بنود · تكافؤ SQL ↔ computeFinancials/ppPlanCalc على 300 عيّنة (#684) · صفُّ البطاقة بأزرارٍ حرفية · التوصيل ×7 — 12 طفرة تعضّ · v628 (M187): العلاجاتُ السابقة + الإلغاءُ وطلبُ التغيير · v629 (M188): تحصين · v630 (M189): المريض يختار وقتاً والطبيب يعتمده · v632 (M190): اعتمادُ الإلغاء · v633 (M191): إشعارُ الرفض — 70 طفرة
node "$S/prove-perio-compare.js" --self-test | tail -1 || FAIL=1   # v634: مقارنة فحوص اللثة (جولة فجوات المنافسين ③) — أيُّ فحصٍ أسبق أساساً · القيمةُ السابقة تحت كل عمق (بلا فأرة) · عدُّ التحسّن/التراجع/الثبات والنزف · تبديلٌ بلا تكديس وخروجٌ بلا أثر · طباعةُ المريض (جملة · جدول قبل/بعد · ▼/▲) — 9 طفرات
node "$S/prove-public-mobile.js" --self-test | tail -1 || FAIL=1   # v619: الصفحاتُ العامة على الموبايل (book · portal · intake) — رأسٌ ومرآةُ CSS بايت-بايت · Sentry غيرُ حاجب بلا توكن · كلُّ RPC بمهلةٍ وحارس · أهدافُ لمس 44 · ساعةُ الحجز دمشق (نيويورك ×2 لحظة · DST) — 10 طفرات
node "$S/prove-live.js" --self-test | tail -1 || FAIL=1   # v623: التحديثُ اللحظي (SyLive · M185) — النشرُ يغطّي كلَّ جدولٍ مُراقَب بعمود عزله الحقيقي · الصفحاتُ السبع والشريط · تجميع · لا رسمَ أثناء نافذةٍ/كتابةٍ/سحب · الحذفُ للمعروض فقط · التبويبُ المخفي · سقوطُ القناة واللحاق · جدارُ الأوفلاين المالي — v626 (M186): الأطباء · الموظفون · المستحقّات · سجلُّ النشاط (jsdom: لا وميض · لا فقدَ لما حُمِّل · مرساة · حبّةٌ باسم المريض · الفلاترُ المطبَّقة) + عمودُ العزل = عمودُ سياسة المالك · v627: حدثٌ تسبقه «عرض المزيد» لا يضيع · لا تكرار بالإزاحة · صمتُ فشل الأطباء — 32 طفرة
node "$S/prove-xray-upload.js" --self-test | tail -1 || FAIL=1   # v635 (M192): الأشعة ج1 — فحصُ الملف (DICM · 30MB) · الأشعة بلا ضغط · حصّةُ الخطة قبل الرفع وبالخادم (سياسةٌ مقيِّدة) · حذفٌ لا يترك يتيماً · حذفُ المريض يمسح مجلده أولاً · عدُّ كل أسنان الصورة · الخطُّ الزمني بتاريخ الالتقاط · حارسُ القراءة · الحذفُ الجزئي يُعلَن — 17 طفرة
node "$S/prove-xray-viewer.js" --self-test | tail -1 || FAIL=1   # v636: عارضُ الأشعة ج2 — تنقيةُ التعليقات · المليمترُ بالمعايرة · التكبيرُ حول نقطةٍ ثابتة · textContent لا innerHTML · فلاترُ CSS (سفاري) · حفظٌ مؤجَّل لا يضيع ولا يُكتب بالقراءة · المغادرةُ تُفرغ المعلّق · الحذفُ يُغلق العارض — 13 طفرة
node "$S/prove-xray-compare-dicom.js" --self-test | tail -1 || FAIL=1   # v637: الأشعة ج3 — DICOM على ملفاتٍ حقيقية (مطابقٌ لـpydicom بكسلاً ببكسل · 3 ترميزات = صورةٌ واحدة · MONOCHROME1 · JPEG Baseline · المضغوطُ يُعلَن) · المكتبةُ كسولةٌ وSHA-256 · مزامنةُ المقارنة النسبية · معرضُ السن وانتقاءُ صورتين · إرفاقُ صورة جلسة «أشعة» — 14 طفرة
node --no-warnings "$S/prove-portal-xrays.js" --self-test | tail -1 || FAIL=1   # v638 (M193): الأشعة ج4 — صورُ البوابة مطفأةٌ افتراضياً ومشارَكةٌ صورةً صورة · الدالةُ لمفتاح الخدمة وحده بنفس بوابات البوابة · الدالةُ الطرفية تُشغَّل فعلاً (توقيعٌ 15 دقيقة · لا مسار) · الصفحةُ بـhttps مهرّب بلا RPC جديدة · زرُّ المشاركة محروس — 12 طفرة
node "$S/prove-intraoral-camera.js" --self-test | tail -1 || FAIL=1   # v642: كاميرا الفم بالمتصفح — اختيارُ الكاميرا الخارجية · الأخطاءُ بأسمائها · لقطةٌ بكامل الدقّة والانعكاسُ كما يُرى · البثُّ يُوقف · اللقطاتُ صورٌ سريرية بالسن · حرّاسُ القراءة · Permissions-Policy للتطبيق لا للحجز — 10 طفرات
node --no-warnings "$S/prove-bridge-core.js" --self-test | tail -1 || FAIL=1   # v643 (M194): SyDent Bridge ج٢ — تجزئةُ المفتاح فقط · رمزٌ 8 أحرف 10 دقائق · لا جهازَ من العميل والإيقافُ نهائي · الطلبُ محروس والخادمُ وحده يُنجزه · الواردُ تحت _inbox وليس يتيماً · دوالُّ الجسر لمفتاح الخدمة · الدالةُ الطرفية تُشغَّل فعلاً (مفتاحٌ جديد · 401 · رفعٌ موقّع · حذفُ كائنٍ مرفوض) · العيادة: اقتران/إيقاف/التقاط/وارد محروسة — 13 طفرة
node "$S/prove-bridge-agent.js" --self-test | tail -1 || FAIL=1   # v644: برنامجُ SyDent Bridge لويندوز — استقرارُ الملف قبل الرفع · القديمُ لا يُرفع · لا رفعَ مرتين · DICM · 4 محاولات · 401 يمسح المفتاح · واجهةٌ محلية فقط · الحزمةُ المنشورة بـSHA-256 · SW يمرّر /downloads/ · v646: مستقبِلُ DICOM (AE · Part 10 · كتابةٌ ذرّية · ترميزاتٌ مضغوطة · جدارُ ويندوز) · v647: نوافذُ الأوامر مخفية · v648: TWAIN (التسلسلُ الكامل بمحاكاة · 32-bit) · v649: سكربتُ الواجهة يُفكّ ولا تُمسح بطاقةُ الاقتران أثناء الكتابة · v650: KeepAlive وV4/V5 — 18 طفرة
node "$S/prove-pwa-samsung.js" --self-test | tail -1 || FAIL=1   # v625: متصفحُ سامسونج يُوجَّه لـChrome بدل زرّ تثبيتٍ يُنتج تطبيقاً يحظره Google Play Protect — البطاقةُ العائمة وبطاقةُ الإعدادات · مفتاحُ رفضٍ مستقل · كروم وiOS كما كانا — jsdom + ٧ طفرات
node "$S/prove-perf-reports.js" --self-test | tail -1 || FAIL=1   # v552: Deep Code #1 — التقارير: المجموعاتُ الأربع والسياقان معاً · fetchCtx أربعُ قراءاتٍ بجولة وترتيبُ الأخطاء كما كان · ذاكرتا القفل معاً
node "$S/prove-perf-dashboard.js" --self-test | tail -1 || FAIL=1   # v554: Deep Code #1 — اللوحة: سبعُ قراءاتٍ مبكرة تُستهلك بمواضعها · تكافؤُ محفظة اللوحة (pre ≡ .in) · مصفّحة · البطاقاتُ الثانوية قبل الهدل
node "$S/prove-perf-shell.js" --self-test | tail -1 || FAIL=1   # v555: Deep Code #1 — الغلاف: قراءاتُ القائمة الخمس معاً · الخطة: الكتالوجُ مع طلب التجربة · القفل: الأطباء مع فحص الأدمن
node "$S/prove-lock-footer.js" --self-test | tail -1 || FAIL=1   # v556: Deep Code #5 — تذييلُ القائمة يتبع الشخصَ الفعّال بعد تبديل الموظف (نصٌّ لا HTML)
node "$S/prove-wa-desktop.js" --self-test | tail -1 || FAIL=1   # v652 (+v653 النافذةُ المسبقة): واتساب من الحاسوب بالتطبيق مباشرةً (SyDentWA · whatsapp://send) — التحويل · كشفُ الجهاز · التبويبُ الحالي لا صفحةَ wa.me · احتياطٌ بعد المهلة إن لم يغادر التركيز · النافذةُ المسبقة (المخبر) · التقاطُ الروابط بمرحلة الالتقاط · جردُ كلِّ فاتحٍ بملفات العيادة · الصفحاتُ العامة بلا مساس — 11 طفرة
node "$S/prove-perf-lists.js" --self-test | tail -1 || FAIL=1   # v557: Deep Code #1 — المرضى (دفاترٌ مبكرة مصفّحة ≡ .in · المتابعة والالتزام معاً) · المحاسبة (الإعداداتُ الثلاث مع المرجعية)
node "$S/prove-deepcode-g1.js" --self-test | tail -1 || FAIL=1   # v558: Deep Code #11 تعريفٌ واحد لمواعيد اليوم · #3 نسبُ البطاقات بحدّ ±999% وتفسير · #4 نصُّ المراجع
node "$S/prove-phone-tidy.js" --self-test | tail -1 || FAIL=1   # v559: Deep Code #13 — صيغةُ هاتفٍ واحدة عند كل حفظ · تلميحاتٌ لا تمنع (رقمٌ مشترك = عائلة · الاسم+الميلاد) · عرضٌ LTR
node "$S/prove-datefield.js" --self-test | tail -1 || FAIL=1   # v560: Deep Code #19 — حقلُ تاريخٍ موحّد يوم/شهر/سنة بكل جهاز · value بـYYYY-MM-DD كما كان · لا حلقة مراقب · المنتقي محصور
node "$S/prove-audit-alerts.js" --self-test | tail -1 || FAIL=1   # v561: Deep Code #10 — M166: لا تنبيهَ على أفعال المالك · القاعدة ٣ مرةً لكل مجموعة · أرشفةٌ لا حذف · أولويةُ حرج/للمراجعة
node "$S/prove-deepcode-ui1.js" --self-test | tail -1 || FAIL=1   # v562: Deep Code #9 بطاقاتُ الهاتف (محاسبة · دفعات · مصاريف) · #20 نافذةُ السن لا تغطّيه · #14 منطقةُ الخطر
node "$S/prove-appt-badges.js" --self-test | tail -1 || FAIL=1   # v563: Deep Code #15 — ثلاثُ شاراتٍ والباقي خلف +N · الطبيُّ و«انتظار» لا تُطوى أبداً
node "$S/prove-watch-renew.js" --self-test | tail -1 || FAIL=1   # v589: 🔁 «مراجعة اليوم» على المراقبة المستحقّة — تجديدُ review_at بنفس المدّة من سجل M76 · condition فقط · لا تلامس ✕ · مخفيةٌ بالقراءة — ٦ طفرات تعضّ
node "$S/prove-recall-watches.js" --self-test | tail -1 || FAIL=1   # v590: مراقباتُ الأسنان بالمتابعة — teeth_status بلا id ⇒ أعمدةُ ترتيبٍ مركّبة لـSyDentFetchAll · الحالاتُ السريرية ليست مراقبات · صاحبُ المراقبة يظهر مع موعده 📅 — ٦ طفرات تعضّ
node "$S/prove-shamcash-receipt.js" --self-test | tail -1 || FAIL=1   # v566: Deep Code #8 — M167 إيصالُ شام كاش: رقمٌ أو صورة (قيدٌ بالقاعدة) · حاويةٌ خاصة · عرضٌ موقَّع للمشرف
node "$S/prove-inv-consume.js" --self-test | tail -1 || FAIL=1   # v568: جولة المخزون 1 — M169 خصمٌ ذرّي بالقاعدة مربوطٌ بالجلسة · FEFO على الدفعات (المنتهي آخراً) · الثابتُ بتريغرين · حرّاسُ ملكية · النافذتان بعميلٍ مصطنع
node "$S/prove-inv-order.js" --self-test | tail -1 || FAIL=1   # v569: جولة المخزون 2 — M170 كميةُ الطلب · «جهّز الطلبية» (واتساب · نسخ · طباعة · إكسل) بلا أسعار للمورّد · isLow تعريفٌ واحد للصفحة واللوحة
node "$S/prove-inv-count.js" --self-test | tail -1 || FAIL=1   # v570: جولة المخزون 3 — M171 الجردُ الدوري: الفرقُ على ما رآه العادّ · النقصُ FEFO · السعرُ وقت الجرد · القيمةُ لكل عملة · ورقةٌ عمياء · بوابةُ الاشتراك وحرّاسُ الملكية
node "$S/prove-inv-po.js" --self-test | tail -1 || FAIL=1   # C3: جولة المخزون 4 — M172 الموردون والطلبيات والاستلامُ الجزئي: لا فوق المطلوب بلا تأكيد · قفلٌ بترتيب الصنف · الكميةُ قبل الدفعة · قيمةٌ لكل عملة · «سجّلها مصروفاً» يعبّي ولا يحفظ ويربط مرةً واحدة (#721) · بوابةُ الاشتراك وحرّاسُ الملكية
node "$S/prove-inv-trace.js" --self-test | tail -1 || FAIL=1   # C3b: جولة المخزون 5 — M173 رقمُ الدفعة LOT: الاستلامُ والشراءُ يحملانه · الخصمُ يأخذ الدفعةَ المختارة أولاً ثم FEFO · «المواد ورقم الدفعة» ببطاقة المريض · «تتبّع دفعة» ومرضاها Excel
node "$S/prove-inv-return.js" --self-test | tail -1 || FAIL=1   # v651: M195 مرتجعٌ للمورّد — حركةُ خصمٍ باسمها عبر RPC ذرّي (الدفعةُ المختارة ثم FEFO · لا يتجاوز المتوفّر) · «مرتجع» القديم إضافةٌ بالاسم · خارج كلفة المواد
node "$S/prove-mat-cost.js" --self-test | tail -1 || FAIL=1   # C3c: كلفةُ المواد بدالّةٍ واحدة للمحاسبة وتبويب «المواد» بالتقارير — مطابقةُ الصيغة السابقة على 400 عيّنة · كلُّ تفصيلٍ يحفظ المجموع لكل عملة · لا ترتيبَ بالمبلغ · أشهرٌ رقمية
node "$S/prove-inv-harden.js" --self-test | tail -1 || FAIL=1   # C3d: إحكامُ جولة المخزون — M174 قفلُ الصنف عند نموّ الدفعة فقط · تصفيرُ المنتهية · دوالُّ التريغرات مغلقةٌ أمام anon · كشفُ المخزون Excel بعملة كل صنف · LOT بالسجل
python3 "$S/db-bootstrap.py" --check | tail -1 || FAIL=1   # A9: خطةُ بناء مشروع Supabase جديد — كل migration بعد اللقطة (>175) لازم تكون بالخطة، وكل ملف ينقسم سليماً
# D1: فحصُ الشاشات — كل صفحة بـ360/412/768/1024/1366 بمتصفحٍ حقيقي (بلا Playwright يتخطّى نفسه؛ workflow «Responsive» يشغّله إلزامياً)
if [ -n "${SY_SKIP_RESPONSIVE:-}" ]; then
  echo "⏭ فحص الشاشات: يُشغَّل منفصلاً (SY_SKIP_RESPONSIVE)"
else
  node "$S/check-responsive.js" | tail -1 || FAIL=1
fi
node "$S/prove-ai-note-faith.js" --self-test | tail -1 || FAIL=1   # v641: أمانةُ ملاحظة الجلسة بالمساعد الذكي — اسمُ العلاج حرفياً · لا إجراءَ ولا سنَّ غير مسجّل · إعادةُ كتابةٍ ثم رفضٌ قبل الحقل · نموذجٌ أدقّ برجوعٍ آمن
node "$S/prove-backup-restore.js" --self-test | tail -1 || FAIL=1   # النسخة الاحتياطية المحلية ↔ الاسترجاع — ذهابٌ وإيابٌ عبر xlsx حقيقي · null≠'' · لا أسرار · إضافةٌ بلا كتابةٍ فوق
node "$S/prove-mode-steps.js" --self-test | tail -1 || FAIL=1   # شريط خطوات وضعَي التحديد المتعدد والفحص الأولي · عدّاد الأسنان · تراجع التحديد
node "$S/prove-landing-colors.js" --self-test | tail -1 || FAIL=1   # صفحة التعريف بألوان اللوغو (بعد theme.css) والتطبيق بلونه
python3 "$S/dom-smoke/perf-budget/run.py" | tail -1 || FAIL=1   # v555: حارسُ ميزانية الأداء — جولاتُ كل صفحة بمتصفحٍ حقيقي (400ms/طلب) ضمن ميزانيتها
python3 "$S/dom-smoke/perf-budget/run.py" --self-test | tail -1 || FAIL=1   # v555: … ويحمرّ بسلسلةٍ متتالية محقونة
node "$S/prove-dash-nextday.js" --self-test | tail -1 || FAIL=1   # v520: تبديلُ اليوم/يوم العمل القادم — التأكيد · التذكير · الهدلُ بيوم ذلك اليوم
if [ -n "${SY_SKIP_RA_DOM:-}" ]; then   # محلياً فقط لتقسيم التشغيل الطويل — البوابة (CI) لا تضبطه فتشغّله دائماً
  echo "⏭ مثبت أزرار الصفوف: يُشغَّل منفصلاً (SY_SKIP_RA_DOM)"
else
  python3 "$S/dom-smoke/row-actions/run.py" | tail -1 || FAIL=1
fi
# v488: العارضاتُ الحقيقية (لا نسخٌ مطابقة) — دوالُّ العرض والحفظ نفسُها بكل الحالات بمتصفحٍ حقيقي
if [ -n "${SY_SKIP_REAL_RENDER:-}" ]; then   # محلياً فقط لتقسيم التشغيل — البوابة تشغّله دائماً
  echo "⏭ مثبت العارضات الحقيقية: يُشغَّل منفصلاً (SY_SKIP_REAL_RENDER)"
else
  python3 "$S/dom-smoke/real-render/run.py" | tail -1 || FAIL=1
fi

echo ""
node "$S/check-currency-writes.js" || FAIL=1
node "$S/check-currency-reads.js"  || FAIL=1
echo "═══════════════════════════════════"
if [ "$FAIL" -ne 0 ]; then echo "⛔ فشل واحد على الأقل — لا تعمل commit."; exit 1; fi
echo "✅ كل الحُرّاس خضر."

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
# v432: مثبت DOM حيّ — ينقر مودال السن كما ينقر الطبيب (يتخطّى نفسه بلا playwright)
python3 "$S/dom-smoke/run.py" | tail -1 || FAIL=1
node "$S/check-modal-behaviour.js" | tail -1 || FAIL=1
python3 "$S/dom-smoke/appointments/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/patients/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/patient-profile/run.py" | tail -1 || FAIL=1
python3 "$S/dom-smoke/pages/run.py" | tail -1 || FAIL=1
node "$S/check-row-actions.js"       || FAIL=1
# v485: الإثباتُ العكسي للطقم بالبوابة — كان يُشغَّل يدوياً فتقادمت مراسيه منذ v482 بصمت
node "$S/check-row-actions.js" --self-test > /tmp/sy-ra-self.log 2>&1 && tail -1 /tmp/sy-ra-self.log || { cat /tmp/sy-ra-self.log; FAIL=1; }
node "$S/check-sydt.js"              || FAIL=1
node "$S/prove-removal-sessions/clear.js" || FAIL=1   # v488: جلساتُ ما تزيله أزرار المخطط (#664/#665)
node "$S/prove-removal-sessions/paths.js" || FAIL=1
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
node "$S/prove-deepcode-b1.js" --self-test | tail -1 || FAIL=1   # v550: Deep Code دفعة ١ — شريطُ التنبيه الطبي اللاصق · لا «لا يوجد» قبل التحميل · هيكلُ التحميل · مسافةُ الزر العائم وتنحّيه بالتمرير
node "$S/prove-perf-calendar.js" --self-test | tail -1 || FAIL=1   # v551: Deep Code #1 — إقلاعُ التقويم دفعةٌ متوازية (12 جولة ⇒ 1–2) · أولُ رسمٍ ينتظر الدفعة · المواعيد/الجلسات/المخابر معاً
node "$S/prove-perf-reports.js" --self-test | tail -1 || FAIL=1   # v552: Deep Code #1 — التقارير: المجموعاتُ الأربع والسياقان معاً · fetchCtx أربعُ قراءاتٍ بجولة وترتيبُ الأخطاء كما كان · ذاكرتا القفل معاً
node "$S/prove-perf-dashboard.js" --self-test | tail -1 || FAIL=1   # v554: Deep Code #1 — اللوحة: سبعُ قراءاتٍ مبكرة تُستهلك بمواضعها · تكافؤُ محفظة اللوحة (pre ≡ .in) · مصفّحة · البطاقاتُ الثانوية قبل الهدل
node "$S/prove-perf-shell.js" --self-test | tail -1 || FAIL=1   # v555: Deep Code #1 — الغلاف: قراءاتُ القائمة الخمس معاً · الخطة: الكتالوجُ مع طلب التجربة · القفل: الأطباء مع فحص الأدمن
node "$S/prove-lock-footer.js" --self-test | tail -1 || FAIL=1   # v556: Deep Code #5 — تذييلُ القائمة يتبع الشخصَ الفعّال بعد تبديل الموظف (نصٌّ لا HTML)
node "$S/prove-perf-lists.js" --self-test | tail -1 || FAIL=1   # v557: Deep Code #1 — المرضى (دفاترٌ مبكرة مصفّحة ≡ .in · المتابعة والالتزام معاً) · المحاسبة (الإعداداتُ الثلاث مع المرجعية)
node "$S/prove-deepcode-g1.js" --self-test | tail -1 || FAIL=1   # v558: Deep Code #11 تعريفٌ واحد لمواعيد اليوم · #3 نسبُ البطاقات بحدّ ±999% وتفسير · #4 نصُّ المراجع
node "$S/prove-phone-tidy.js" --self-test | tail -1 || FAIL=1   # v559: Deep Code #13 — صيغةُ هاتفٍ واحدة عند كل حفظ · تلميحاتٌ لا تمنع (رقمٌ مشترك = عائلة · الاسم+الميلاد) · عرضٌ LTR
node "$S/prove-datefield.js" --self-test | tail -1 || FAIL=1   # v560: Deep Code #19 — حقلُ تاريخٍ موحّد يوم/شهر/سنة بكل جهاز · value بـYYYY-MM-DD كما كان · لا حلقة مراقب · المنتقي محصور
node "$S/prove-audit-alerts.js" --self-test | tail -1 || FAIL=1   # v561: Deep Code #10 — M166: لا تنبيهَ على أفعال المالك · القاعدة ٣ مرةً لكل مجموعة · أرشفةٌ لا حذف · أولويةُ حرج/للمراجعة
node "$S/prove-deepcode-ui1.js" --self-test | tail -1 || FAIL=1   # v562: Deep Code #9 بطاقاتُ الهاتف (محاسبة · دفعات · مصاريف) · #20 نافذةُ السن لا تغطّيه · #14 منطقةُ الخطر
node "$S/prove-appt-badges.js" --self-test | tail -1 || FAIL=1   # v563: Deep Code #15 — ثلاثُ شاراتٍ والباقي خلف +N · الطبيُّ و«انتظار» لا تُطوى أبداً
node "$S/prove-shamcash-receipt.js" --self-test | tail -1 || FAIL=1   # v566: Deep Code #8 — M167 إيصالُ شام كاش: رقمٌ أو صورة (قيدٌ بالقاعدة) · حاويةٌ خاصة · عرضٌ موقَّع للمشرف
node "$S/prove-inv-consume.js" --self-test | tail -1 || FAIL=1   # v568: جولة المخزون 1 — M169 خصمٌ ذرّي بالقاعدة مربوطٌ بالجلسة · FEFO على الدفعات (المنتهي آخراً) · الثابتُ بتريغرين · حرّاسُ ملكية · النافذتان بعميلٍ مصطنع
node "$S/prove-inv-order.js" --self-test | tail -1 || FAIL=1   # v569: جولة المخزون 2 — M170 كميةُ الطلب · «جهّز الطلبية» (واتساب · نسخ · طباعة · إكسل) بلا أسعار للمورّد · isLow تعريفٌ واحد للصفحة واللوحة
node "$S/prove-inv-count.js" --self-test | tail -1 || FAIL=1   # v570: جولة المخزون 3 — M171 الجردُ الدوري: الفرقُ على ما رآه العادّ · النقصُ FEFO · السعرُ وقت الجرد · القيمةُ لكل عملة · ورقةٌ عمياء · بوابةُ الاشتراك وحرّاسُ الملكية
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

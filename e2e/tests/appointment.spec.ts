// ════════════════════════════════════════════════════════════════════════
// السيناريو ٣ — دورة الموعد · يغطّي: التقويم · الحالات · اقتراحات المريض
// ════════════════════════════════════════════════════════════════════════
import { test, expect, acceptSyDialog } from '../fixtures/base';
import { e2eName, ymdLocal } from '../lib/api.mjs';

test('٣ — حجز موعد ← يظهر بالقائمة ← تغيير الحالة ← حذف', async ({ page, api }) => {
  await api.sweep('before');
  const pname = e2eName('appt-pat');

  try {
    // المريض يُنشأ بالـAPI (سرعة وحتمية) — الموعد وحده هو موضوع الاختبار
    const patient = await api.createPatient(pname);
    expect(patient && patient.id, 'فشل إنشاء مريض الاختبار').toBeTruthy();

    await page.goto('/appointments.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });

    // ⚠️ السايدبار يجري auth مستقلاً خاصاً به — ظهوره لا يعني أن init()
    // الصفحة اكتمل. openModal عبر evaluate أسرع من أي مستخدم بشري: بالجولة
    // الثالثة وصل و`currentUser` ما يزال null (يُعيَّن بسطر 7751 بعد getUser
    // و80ms)، فأعادت loadPatientNames «[]» بحارسها `if (!currentUser)` وفُتح
    // المودال بقائمة أسماء فارغة — فشل حتمي. الانتظار على إشارة الصفحة نفسها:
    // (currentUser متغيّر let أعلى النطاق — يُقرأ بتعبير نصّي بالنطاق العام)
    await page.waitForFunction(
      'typeof currentUser !== "undefined" && !!currentUser && !!currentUser.id',
      undefined, { timeout: 20_000 }
    );

    // حجز — الاختيار من قائمة الاقتراحات المخصصة (بديل datalist لـiOS)
    await page.evaluate(() => (window as any).openModal());
    await expect(page.locator('#modalOverlay')).toBeVisible({ timeout: 10_000 });
    // حزام: القائمة تحمّلت فعلاً — أي نكوص مستقبلي يفشل هنا بسطر مسمّى
    // بدل «اقتراح غائب» غامض بعد 10 ثوانٍ.
    await page.waitForFunction(
      'Array.isArray(_fpNames) && _fpNames.length > 0',
      undefined, { timeout: 15_000 }
    );
    await page.locator('#fPatient').click();
    // ⚠️ بادئة لا الاسم الكامل — سلوك مقصود بالمنصّة (fpMatches، السطر الأخير):
    //   «مطابقة حرفية وحيدة = الاسم مكتمل، لا داعي لاقتراح يطابق المكتوب»
    // كتابة الاسم كاملاً تُخفي الاقتراح عمداً — الجولة الثانية فشلت بهذا بالضبط.
    await page.locator('#fPatient').fill(pname.slice(0, -4));
    const suggestion = page.locator(`#fpSuggest .fp-item:has-text("${pname}")`).first();
    await expect(suggestion, 'قائمة اقتراحات المريض لم تظهر').toBeVisible({ timeout: 10_000 });
    await suggestion.click();
    // النقر يكتب الاسم المسجَّل حرفياً — وهو أساس ربط patient_id بالاسم
    await expect(page.locator('#fPatient')).toHaveValue(pname);

    const day = ymdLocal(1); // الغد — يتفادى حراس «الوقت الماضي»
    await page.locator('#fDate').fill(day);
    // ⚠️ #fTime مُرقّى بـtimepicker.js (data-tp-upgraded="1") — المدخل الأصلي
    // مخفي فـfill يفشل بـ«not visible» (فشل الجولة ٥ حرفياً). الضمانة المعلنة
    // برأس timepicker.js: «the original input keeps its id and its .value»،
    // والمنصّة نفسها تعبّئه برمجياً (appointments.html:5248) وsubmitAppt يقرأ
    // .value مباشرة (6639) ⇒ الحقن البرمجي هو المسار المعتمد لا التفافة.
    await page.evaluate(() => {
      const t = document.getElementById('fTime') as HTMLInputElement;
      t.value = '10:30';
      t.dispatchEvent(new Event('input',  { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#modalOverlay')).toBeHidden({ timeout: 15_000 });

    // يظهر بعرض القائمة
    await page.locator('#btnList').click();
    const row = page.locator(`[data-test="appt-row"]:has-text("${pname}")`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    const apptId = await row.getAttribute('data-appt-id');
    expect(apptId).toBeTruthy();

    // تغيير الحالة إلى «معلّق»
    await row.click();
    await expect(page.locator('#modalOverlay')).toBeVisible({ timeout: 10_000 });
    // ⚠️ «ظاهر» ≠ «جاهز» (نفس فصيلة سباق init): editAppt يفتح الـoverlay
    // (5268) ثم يعلّق على await شبكي (populateApptTypes، 5270) ثم يكتب
    // fStatus.value = حالة الموعد (5282). اختيارٌ يهبط بفجوة الـawait يُداس.
    // حلقة تقارب: الاختيار يثبت فقط بعد انتهاء تعبئة editAppt — نافذة
    // الـ400ms ليست انتظاراً أساسياً بل فخّ يكشف الدوس المتأخر داخل الحلقة.
    //
    // ⚠️ ولماذا 'pending' لا 'completed': renderList (4983، Gap 1) يستبعد
    // الحالات المنتهية عمداً — `!isFinishedStatus(a.status)` و
    // isFinishedStatus (2609) = completed|cancelled|broken|no_show. فاختيار
    // 'completed' يُنجح الحفظ ثم **يُخفي الصف من قائمة «القادمة»** بالتصميم
    // (توقيع الجولة ٦: أربعة رندرات قديمة ثم اختفاء العنصر). 'pending' يمرّ
    // بنفس مسار الكود (تعديل → تغيير حالة → حفظ → إعادة رندر) ويبقى مرئياً
    // فيسمح بالتوكيد ثم الحذف من القائمة. الإكمال المالي شغل ب٢-ب.
    await expect(async () => {
      await page.locator('#fStatus').selectOption('pending');
      await page.waitForTimeout(400);
      expect(await page.locator('#fStatus').inputValue()).toBe('pending');
    }).toPass({ timeout: 15_000 });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#modalOverlay')).toBeHidden({ timeout: 15_000 });

    const row2 = page.locator(`[data-test="appt-row"][data-appt-id="${apptId}"]`);
    await expect(row2).toBeVisible({ timeout: 15_000 });
    // توكيد إيجابي بالصنف (statusClass:2598 يشتق status-pending) — مستقل عن
    // اللغة وقاطع. والصنف يأتي من رندر تالٍ لـloadAppointments ⇒ هو نفسه
    // دليل أن الحالة حُفظت بقاعدة البيانات لا بالواجهة فقط.
    await expect(row2.locator('[data-test="appt-status"]'))
      .toHaveClass(/status-pending/, { timeout: 15_000 });

    // حذف — التأكيدُ صار حوارَ المنصة (SyDialog) منذ v456
    await row2.locator('[data-test="appt-delete"]').click();
    await acceptSyDialog(page);
    await expect(row2).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await api.sweep('after');
  }
});

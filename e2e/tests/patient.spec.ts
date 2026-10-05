// ════════════════════════════════════════════════════════════════════════
// السيناريو ٢ — دورة المريض · يغطّي: RPC next_patient_seq · RLS · التوجيه
// ════════════════════════════════════════════════════════════════════════
import { test, expect, acceptSyDialog } from '../fixtures/base';
import { e2eName } from '../lib/api.mjs';

test('٢ — إضافة مريض ← local_id ذرّي ← فتح الملف ← حذف', async ({ page, api }) => {
  await api.sweep('before'); // كنس بقايا تشغيلات فاشلة سابقة — ضمان صفر تراكم
  const name = e2eName('patient');

  try {
    console.log('E2E step: open patients.html');
    await page.goto('/patients.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });
    // نفس درس الموعد: السايدبار ≠ init الصفحة. submitPatient يقرأ currentUser،
    // ونجاح الجولة الثالثة كان حظّ توقيت (مسار النقر البشري أبطأ من init) —
    // الانتظار الصريح يحوّل الحظ إلى حتمية.
    await page.waitForFunction(
      'typeof currentUser !== "undefined" && !!currentUser && !!currentUser.id',
      undefined, { timeout: 20_000 }
    );

    // إضافة
    console.log('E2E step: open add-patient modal');
    await page.locator('[data-test="add-patient"]').click();
    await expect(page.locator('#modalOverlay')).toBeVisible();
    await page.locator('#fName').fill(name);
    await page.locator('#fPhone').fill('0955' + String(Date.now()).slice(-6));
    console.log('E2E step: submit patient form');
    await page.locator('#saveBtn').click();

    // الصف ظهر
    console.log('E2E step: wait for row');
    const row = page.locator(`[data-test="patient-row"]:has-text("${name}")`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // ⭐ التوكيد الجوهري: الترقيم الذرّي P### (Migration 86 / Rule #252)
    const localId = await row.locator('[data-test="patient-local-id"]').innerText();
    expect(localId.trim(), 'local_id يجب أن يكون بصيغة P### مولَّدة بالـRPC')
      .toMatch(/^P\d{3,}$/);

    // فتح الملف
    console.log('E2E step: open profile');
    const pid = await row.getAttribute('data-patient-id');
    expect(pid).toBeTruthy();
    await row.click();
    await expect(page).toHaveURL(new RegExp('patient-profile\\.html\\?id=' + pid), { timeout: 15_000 });
    await expect(page.locator('#pName')).toHaveText(name, { timeout: 15_000 });

    // حذف من قائمة النقاط الثلاث (confirm يُقبل تلقائياً بالـfixture)
    console.log('E2E step: delete patient');
    await page.goto('/patients.html', { waitUntil: 'domcontentloaded' });
    const row2 = page.locator(`[data-test="patient-row"]:has-text("${name}")`);
    await expect(row2).toBeVisible({ timeout: 15_000 });
    await row2.locator('[data-test="patient-menu"]').click();
    // ⚠️ أي re-render متأخّر (loadPrmMeta وأشباهه) يكنس قوائم الـPortal من
    // body عمداً (patients.html:1081 «Portal cleanup … remove them») — فقد
    // تختفي القائمة المفتوحة بين النقرتين (توقيع flaky الجولة ٥). الحل:
    // حلقة ذرّية (فتح → نقر) — إن كُنست القائمة أعيد فتحها، بسقف زمني صارم.
    await expect(async () => {
      const openDelete = page.locator('.dots-menu.open [data-test="patient-delete"]');
      if (!(await openDelete.isVisible())) {
        await row2.locator('[data-test="patient-menu"]').click();
      }
      await openDelete.click({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // v459: التأكيدُ صار حوارَ المنصة (SyDialog) لا نافذةَ متصفّح.
    await acceptSyDialog(page);
    await expect(row2).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await api.sweep('after'); // تنظيف ذاتي حتى عند الفشل
  }
});

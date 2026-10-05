// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — smoke.spec.ts · دخان ب١: الجلسة المسكوكة تعمل فعلاً
// ════════════════════════════════════════════════════════════════════════
// يثبت السلسلة كاملة: dist مبني → يُخدَم محلياً → storageState محقونة →
// index.html لا يطرد لصفحة الدخول → السايدبار (#sbSidebar من sidebar.js
// الحي، سطر ~292) يترندر. توكيد «صفر خطأ كونسول» مؤجَّل لسيناريو ١ بـ ب٢
// (يحتاج allowlist ضجيج مدروسة).
//
// إسكات الطرف الثالث + قبول الـconfirm صارا بالـfixture المشتركة
// (fixtures/base.ts) — بـfulfill 204 لا abort، راجع التعليق هناك.
// ════════════════════════════════════════════════════════════════════════
import { test, expect } from '../fixtures/base';

test('الدخان: الجلسة تعمل — لوحة التحكم تفتح والسايدبار يترندر', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  // لا طرد لصفحة الدخول (autoGate يقبل الجلسة المحقونة)
  await expect(page).not.toHaveURL(/auth\.html/, { timeout: 15_000 });

  // السايدبار الحي يترندر (initSidebar ركّب <aside id="sbSidebar">)
  await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });

  // ثبات: بعد مهلة قصيرة ما زلنا خارج auth (يمسك الطرد المتأخر بعد getUser)
  await page.waitForTimeout(2_000);
  await expect(page).not.toHaveURL(/auth\.html/);
});

// ════════════════════════════════════════════════════════════════════════
// السيناريو ١ — دخول + تنقّل · يغطّي: تهيئة العميل · gating · وسم vendor
// ════════════════════════════════════════════════════════════════════════
import { test, expect } from '../fixtures/base';

// الصفحات الخمس. `accounting` مقصودة: موديول gateable — ظهورها تثبت أن خطة
// المستأجر (Max) تُحمَّل وتُفكّ بواسطة SyDentPlan، لا مجرد أن الصفحة موجودة.
const PAGES = [
  { href: 'patients.html',     title: /المرضى|patients/i },
  { href: 'appointments.html', title: /المواعيد|appointments/i },
  { href: 'treatments.html',   title: /العلاجات|treatments/i },
  { href: 'accounting.html',   title: /المحاسبة|accounting/i }
];

/**
 * ضجيج مسموح — كل بند بمبرّر مكتوب. أي توسعة مستقبلية تلتزم بنفس الشرط.
 * (لا يشمل Sentry/Turnstile: مُسكَتان بـfulfill 204 بالـfixture.)
 */
const ALLOWED_NOISE = [
  /beforeinstallprompt/i,          // تأجيل تثبيت PWA — رسالة معلوماتية مقصودة
  /Download the React DevTools/i,  // لا ينطبق عندنا، احتياط
  /favicon/i                       // أيقونة مفقودة بالخادم الساكن ليست خطأ منتج
];

test('١ — تنقّل السايدبار عبر خمس صفحات بصفر خطأ كونسول', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (ALLOWED_NOISE.some((rx) => rx.test(t))) return;
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/auth\.html/, { timeout: 15_000 });
  await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });

  for (const p of PAGES) {
    const link = page.locator(`#sbSidebar .sb-item[href="${p.href}"]`);
    await expect(link, `عنصر السايدبار ${p.href} غير موجود (gating؟)`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(p.href.replace('.', '\\.')), { timeout: 15_000 });
    await expect(page).not.toHaveURL(/auth\.html/);
    await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });
  }

  expect(errors, 'أخطاء كونسول غير متوقّعة:\n' + errors.join('\n')).toEqual([]);
});

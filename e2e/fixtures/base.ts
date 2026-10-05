// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — fixtures/base.ts · لبنات مشتركة لكل السيناريوهات
// ════════════════════════════════════════════════════════════════════════
import { test as base, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { makeApi } from '../lib/api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CTX_PATH = path.join(HERE, '..', '.auth', 'ctx.json');

/**
 * إسكات الطرف الثالث بـ **fulfill 204 لا abort**.
 * الفرق حاسم: `abort()` يولّد بنفسه `Failed to load resource` بالكونسول،
 * فيُفشل توكيد «صفر خطأ كونسول» بسبب حجبنا نحن لا بسبب المنصّة.
 * الـ204 = طلب «نجح» فارغاً ⇒ صفر ضجيج وصفر وصول لمشروع Sentry الإنتاجي
 * (كي لا نلوّثه بأخطاء localhost ونحرق الحصة).
 */
export const THIRD_PARTY =
  /sentry-cdn\.com|ingest\.sentry\.io|ingest\.de\.sentry\.io|challenges\.cloudflare\.com/;

export async function silenceThirdParty(page: Page) {
  await page.route(THIRD_PARTY, (route) =>
    route.fulfill({ status: 204, body: '', contentType: 'text/plain' })
  );
}

/** يقبل أي `confirm()` أصلي — ما تبقّى منها قبل اكتمال تحويل SyDialog. */
export function autoAcceptDialogs(page: Page) {
  page.on('dialog', (d) => { d.accept().catch(() => {}); });
}

/**
 * يؤكّد حوارَ المنصة الموحّد (`SyDialog`) إن ظهر.
 * منذ v456 صار التأكيد **نافذةً داخل الصفحة** لا نافذةَ متصفّح، فمستمعُ
 * `page.on('dialog')` لا يراها ويتعلّق الاختبار — وهذا ما أسقط البوابة
 * ثلاثَ مرّات. الدالة تنتظر الحوارَ قليلاً ثم تنقر زرَّ التأكيد؛ وإن لم يظهر
 * (موضعٌ ما يزال على `confirm` الأصلي) تمرّ بصمت فيتكفّل المستمعُ أعلاه.
 */
export async function acceptSyDialog(page: Page, timeout = 5_000) {
  const ok = page.locator('.sy-dialog [data-sy-act="ok"]');
  try {
    await ok.waitFor({ state: 'visible', timeout });
  } catch {
    return false;          // لا حوارَ منصّة — المسارُ أصليٌّ أو انتهى فوراً
  }
  await ok.click();
  await page.locator('.sy-dialog').waitFor({ state: 'detached', timeout: 5_000 });
  return true;
}

function readCtx() {
  if (!fs.existsSync(CTX_PATH)) {
    throw new Error('E2E: .auth/ctx.json missing — did globalSetup run?');
  }
  return JSON.parse(fs.readFileSync(CTX_PATH, 'utf8'));
}

type Fixtures = { api: ReturnType<typeof makeApi> };

export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    await use(makeApi(readCtx()));
  },
  page: async ({ page }, use) => {
    await silenceThirdParty(page);
    autoAcceptDialogs(page);
    await use(page);
  }
});

export { expect };

// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — playwright.config.ts
// ════════════════════════════════════════════════════════════════════════
// المبدأ الحاكم: الاختبارات لا تضرب sydent.app — dist/ يُبنى محلياً ويُخدَم
// على localhost ضد Supabase الحقيقي بمستأجر تجريبي معزول.
//
// قرارات مقفولة (مبرَّرة بـ README):
//   serviceWorkers:'block' — sw.js يتسجّل على localhost ويكاش الصفحات
//     فبدون الحجب قد ترى الاختبارات dist قديماً (كاش عابر للتشغيلات).
//   workers:1 — نفس المستأجر لكل الاختبارات؛ التوازي = تعارض بيانات.
//   webServer: python3 http.server — بلا تبعية npm إضافية (بايثون مثبّت
//     بالـ CI والحاوية)؛ يخدم dist/ المبني للتوّ.
// ════════════════════════════════════════════════════════════════════════
import { defineConfig } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8080';
const PORT = new URL(BASE_URL).port || '8080';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // 60s: مهلة نداء الـAPI صارت 10s (api.mjs) فأي تعليق يُبلَّغ قبل انتهاء
  // ميزانية الاختبار — الهدف ألّا تُقطع التشخيصات قبل أن تُطبع.
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    storageState: path.join(HERE, '.auth', 'state.json'),
    serviceWorkers: 'block',
    /* مهلة لكل فعل متصفح (click/fill/…): افتراض Playwright «بلا مهلة» يعني
       أن فعلاً على عنصر غير قابل للتفاعل يلتهم ميزانية الاختبار كلها ويُنتج
       «Test timeout» أعمى — نفس درس مهلة الـAPI (#310) مطبَّقاً على المتصفح.
       بالمهلة، الفشل يسمّي نفسه: أي محدِّد، ولماذا (covered/not found/…). */
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'ar-SY',
    timezoneId: 'Asia/Damascus'
  },
  webServer: {
    // dist/ يُبنى قبل الاختبارات (bash scripts/build-dist.sh — خطوة CI/يدوية)
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ../dist`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});

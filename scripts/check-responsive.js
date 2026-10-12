/* D1 — responsive guard: every app page at phone, tablet and desktop widths, in a real Chromium.
   Fails on: a page wider than the screen (horizontal page scroll) · an open «أدوات» menu running off the screen ·
   a JavaScript error while the page renders. Pages are the built dist/ served offline with a fictional
   Supabase stub (scripts/responsive/fake-sb.js) — nothing leaves the machine.
   Without Playwright it skips itself (⏭️) like the other browser guards; `--require` makes a missing
   Playwright a failure (the dedicated CI workflow uses it). */
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REQUIRE = process.argv.includes('--require');

function loadPlaywright() {
  const tries = [path.join(ROOT, 'e2e', 'node_modules', '@playwright', 'test'), '@playwright/test', 'playwright'];
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = loadPlaywright();
if (!pw) {
  console.log((REQUIRE ? '❌' : '⏭️ ') + ' playwright غير مثبت — ' + (REQUIRE ? 'فحص الشاشات مطلوب هنا' : 'تخطّي فحص الشاشات'));
  process.exit(REQUIRE ? 1 : 0);
}

const PAGES = ['index.html', 'patients.html', 'patient-profile.html?id=demo', 'appointments.html', 'treatments.html', 'doctors.html',
  'employees.html', 'labs.html', 'radiology.html', 'accounting.html', 'expenses.html', 'payouts.html', 'provider-reports.html',
  'inventory.html', 'settings.html', 'audit-log.html', 'subscription.html', 'learn.html'];
const WIDTHS = [360, 412, 768, 1024, 1366];
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

(async () => {
  const DIST = path.join(ROOT, 'dist');
  execSync('bash ' + JSON.stringify(path.join(ROOT, 'scripts', 'build-dist.sh')), { stdio: 'ignore' });
  const stub = fs.readFileSync(path.join(__dirname, 'responsive', 'fake-sb.js'));
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const bad = [];
  let checked = 0;
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, locale: 'ar' });
    await ctx.addInitScript(() => { try { localStorage.setItem('sydent.auth', '{"x":1}'); } catch (e) {} });
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.hostname !== 'local.test') return r.abort();
      let p = u.pathname === '/' ? '/index.html' : u.pathname;
      if (p.includes('supabase-2')) return r.fulfill({ body: stub, contentType: 'application/javascript' });
      let f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
    });
    for (const p of PAGES) {
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      await pg.goto('http://local.test/' + p);
      await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => {
        const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
        const menus = [];
        document.querySelectorAll('.sd-page-head details.sd-menu').forEach(d => {
          d.open = true;
          const l = d.querySelector('.sd-menu__list');
          if (!l) return;
          const rc = l.getBoundingClientRect();
          if (rc.width && (rc.left < -1 || rc.right > vw + 1)) menus.push((d.id || 'menu') + ' ' + Math.round(rc.left) + '..' + Math.round(rc.right));
          d.open = false;
        });
        return { vw, sw, menus };
      });
      checked++;
      const why = [];
      if (r.sw > r.vw + 1) why.push('أعرض من الشاشة ' + r.sw + '/' + r.vw);
      if (r.menus.length) why.push('قائمة خارج الشاشة: ' + r.menus.join(', '));
      if (errs.length) why.push('خطأ JS: ' + errs[0].slice(0, 120));
      if (why.length) bad.push(w + 'px ' + p + ' — ' + why.join(' · '));
      await pg.close();
    }
    await ctx.close();
  }
  await browser.close();
  bad.forEach(b => console.log('FAIL', b));
  console.log((bad.length ? '❌' : '✅') + ' فحص الشاشات: ' + (checked - bad.length) + '/' + checked + ' (' + PAGES.length + ' صفحة × ' + WIDTHS.join('/') + 'px)');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('❌ فحص الشاشات تعطّل: ' + e.message); process.exit(1); });

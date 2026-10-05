# -*- coding: utf-8 -*-
# v555 — حارسُ ميزانية الأداء (DeepCode #1 · docs/DEEPCODE_REVIEW.md).
# البطءُ من سوريا ليس القاعدة (زمنُ السيرفر ~47ms) بل **عددُ الرحلات المتسلسلة**. هذا الحارس يفتح الصفحات الحيّة
# بـChromium حقيقي وعميل Supabase مصطنع يؤخّر **كل طلب LAT ثانية** (رحلة سوريا ↔ أوروبا)، ثم يعدّ «الجولات»:
# لحظاتُ بدء الطلبات مقسومةً على LAT (طلباتٌ تبدأ معاً = جولةٌ واحدة). أيُّ تعديلٍ يعيد قراءةً مستقلة إلى الانتظار
# المتسلسل يرفع العدد فوق الميزانية فتحمرّ البوابة. الميزانيةُ = القياسُ بعد v555 + جولةٌ واحدة هامشاً.
# --self-test: يحقن سلسلةَ 4 قراءاتٍ متتالية في صفحةٍ واحدة ويجب أن يحمرّ.
import os, sys, json, base64, asyncio, time, threading, http.server, socketserver, functools
try:
    from playwright.async_api import async_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي حارس ميزانية الأداء'); sys.exit(0)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
LAT = 0.4
BUDGET = {   # الصفحة: أقصى عدد جولات — القياسُ الحالي + هامشُ جولةٍ (تقريبُ الجولات يتذبذب ±1)
    'index.html': 7,                 # بعد v555: 5–6  (قبل: 11)
    'appointments.html': 5,          # بعد v555: 4    (قبل: 13)
    'patients.html': 6,              # بعد v557: 5    (قبل: 8)
    'provider-reports.html': 6,      # بعد v555: 4–5  (قبل: 17)
    'accounting.html': 6,            # بعد v557: 4–5  (قبل: 8)
}
UID = '11111111-1111-1111-1111-111111111111'
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
JWT = b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b64({'sub': UID, 'exp': 4102444800, 'role': 'authenticated', 'aud': 'authenticated'}) + '.sig'
USER = {'id': UID, 'email': 'o@x.io', 'aud': 'authenticated', 'role': 'authenticated', 'user_metadata': {'name': 'د. تجربة'}, 'app_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
SESSION = {'access_token': JWT, 'refresh_token': 'r', 'expires_at': 4102444800, 'expires_in': 99999999, 'token_type': 'bearer', 'user': USER}
TRIAL = {'id': 't1', 'user_id': UID, 'status': 'accepted', 'plan': 'yearly', 'expires_at': '2027-12-31T00:00:00Z', 'created_at': '2026-01-01T00:00:00Z'}
OWNER = {'id': 'e1', 'owner_id': UID, 'name': 'د. تجربة', 'role': 'owner', 'is_active': True, 'has_system_access': True}
INJECT = """(function(){var iv=setInterval(function(){if(!window.sb||window.__inj)return;window.__inj=1;clearInterval(iv);
  setTimeout(async function(){for(var i=0;i<4;i++){await window.sb.from('patients').select('id').limit(1);}},3500);},5);})();"""

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.ThreadingTCPServer.allow_reuse_address = True

async def measure(pw, port, page, inject=False):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
    await ctx.add_init_script("localStorage.setItem('sydent.auth', %s);" % json.dumps(json.dumps(SESSION)))
    if inject: await ctx.add_init_script(INJECT)
    pg = await ctx.new_page()   # الخطوط لا تدخل العدّ — Google تُلبّى فارغةً أدناه
    t0 = [None]; starts = []; errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    async def handle(route):
        req = route.request; u = req.url
        if 'sentry-cdn' in u or 'fonts.g' in u: return await route.fulfill(status=200, body='', content_type='text/javascript')
        if 'supabase.co' not in u: return await route.continue_()
        starts.append(time.time() - t0[0])
        single = 'vnd.pgrst.object' in (req.headers.get('accept') or '')
        await asyncio.sleep(LAT)
        if '/auth/v1/user' in u: return await route.fulfill(status=200, json=USER)
        if '/auth/v1/' in u: return await route.fulfill(status=200, json={})
        if '/rest/v1/trial_requests' in u: return await route.fulfill(status=200, json=TRIAL if single else [TRIAL])
        if '/rest/v1/clinic_employees' in u and req.method == 'GET': return await route.fulfill(status=200, json=OWNER if single else [OWNER])
        if '/rest/v1/rpc/' in u: return await route.fulfill(status=200, json=None)
        if req.method in ('POST', 'PATCH', 'DELETE'): return await route.fulfill(status=201, json=[])
        if single: return await route.fulfill(status=406, json={'code': 'PGRST116', 'message': '0 rows'})
        return await route.fulfill(status=200, json=[], headers={'content-range': '0-0/0'})
    await pg.route('**/*', handle)
    t0[0] = time.time()
    await pg.goto('http://127.0.0.1:%d/%s' % (port, page), wait_until='load')
    await pg.wait_for_timeout(7000)
    await b.close()
    return len(set(round(s / LAT) for s in starts if s < 7)), errs

async def main(self_test):
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]; fails = []
    async with async_playwright() as pw:
        if self_test:
            n, _ = await measure(pw, port, 'patients.html', inject=True)
            ok = n > BUDGET['patients.html']
            print(('✅' if ok else '❌') + ' perf-budget --self-test: حقنُ 4 قراءاتٍ متتالية ⇒ %d جولة (الميزانية %d) — %s' % (n, BUDGET['patients.html'], 'حمّر كما يجب' if ok else 'لم يحمرّ!'))
            return 0 if ok else 1
        for page, lim in BUDGET.items():
            n, errs = await measure(pw, port, page)
            good = n <= lim and not errs
            print(('PASS ' if good else 'FAIL ') + '%s: %d جولة (الميزانية %d)%s' % (page, n, lim, (' · خطأ JS: ' + errs[0][:80]) if errs else ''))
            if not good: fails.append(page)
    srv.shutdown()
    print(('✅' if not fails else '❌') + ' حارس ميزانية الأداء: %d/%d صفحة ضمن ميزانيتها (%.1f ث/طلب)' % (len(BUDGET) - len(fails), len(BUDGET), LAT))
    return 0 if not fails else 1

sys.exit(asyncio.run(main('--self-test' in sys.argv)))

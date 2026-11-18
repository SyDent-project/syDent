#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مثبتُ الجولات التعريفية (tour.js) بمتصفحٍ حقيقي على الصفحات الحقيقية نفسها.
الخلفيةُ مصطنعة بالكامل (لا شبكة): Supabase يُلبّى محلياً — حسابٌ مقبول بعيادةٍ جديدة فارغة + كتالوج العلاجات الافتراضي.
يمشي كما يمشي الطبيب، بالضغط على زر البطاقة وحده:
  • لوحة التحكم: تبدأ الجولة وحدها عند أول زيارة · 13 خطوة · تنتهي وتُختم «انتهت» فلا تعود بعد التحديث.
  • البطاقة التجريبية: الفصل التفاعلي كاملاً بـ«نفّذ عنّي» — السن 27 ← التاج ← «حفظ + إرسال لمخبر» ← «مخبر تجريبي» وموعد التركيب
    في نافذة الطلب ← الحفظ ← الطلب يظهر في تبويب المخابر.
  • بطاقة مريضٍ حقيقي: لا خطوات تفاعلية (الجولة لا تُنشئ شيئاً على مريضٍ حقيقي).
  • المخابر: الخطوات التي لا عنصر لها في عيادةٍ بلا مخابر لا تُعدّ.
  • كل خطوة: البطاقة داخل الشاشة ولا تغطّي العنصر، صفرُ تمريرٍ أفقي، وصفرُ خطأ JS — على اللابتوب والموبايل.
--self-test: يُخدَم tour.js بمعرّفٍ مكسور (زر الحفظ) فيجب أن يحمرّ."""
import os, sys, json, time, base64, threading, http.server, socketserver
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت الجولات'); sys.exit(0)
try:
    from _fonts.hermetic import hermetic_fonts
except Exception:
    hermetic_fonts = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SELF = '--self-test' in sys.argv
PORT = 8790 + (1 if SELF else 0)
UID = '11111111-1111-1111-1111-111111111111'

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
EXP = int(time.time()) + 86400 * 30
USER = {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 't@t.t', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
SESSION = {'access_token': b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b64({'sub': UID, 'role': 'authenticated', 'exp': EXP, 'aud': 'authenticated'}) + '.sig',
           'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 86400 * 30, 'expires_at': EXP, 'user': USER}

def catalog():
    s = open(os.path.join(ROOT, 'treatments.html'), encoding='utf-8').read()
    i = s.index('const CLINIC_CATALOG = ['); j = s.index('];', i) + 2
    import subprocess
    js = s[i:j].replace('const CLINIC_CATALOG', 'const C') + ';process.stdout.write(JSON.stringify(C))'
    rows = json.loads(subprocess.check_output(['node', '-e', js]).decode())
    for k, r in enumerate(rows):
        r.setdefault('id', 't%d' % k); r['doctor_id'] = UID
        if r.get('needs_lab'): r['lab_days'] = 4
    return rows
TABLES = {'trial_requests': [{'status': 'accepted', 'plan': 'pro', 'user_id': UID}], 'treatments': catalog(),
          'patients': [{'id': 'P1', 'doctor_id': UID, 'name': 'سامر خليل', 'phone': '0933000001', 'gender': 'ذكر', 'created_at': '2026-11-01T10:00:00Z'}]}
RPC = {'my_subscription_state': {'level': 'full', 'plan': 'pro', 'status': 'active'}}
TOUR_SRC = open(os.path.join(ROOT, 'tour.js'), encoding='utf-8').read()

def route(rt):
    u = rt.request.url
    if SELF and '/tour.js' in u:
        return rt.fulfill(status=200, content_type='application/javascript', body=TOUR_SRC.replace("$('#labOrderSaveBtn')", "$('#labOrderSaveButton')"))
    if '/auth/v1/user' in u: return rt.fulfill(status=200, content_type='application/json', body=json.dumps(USER))
    if '/auth/v1/' in u: return rt.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION))
    if '/rest/v1/rpc/' in u:
        n = u.split('/rest/v1/rpc/')[1].split('?')[0]
        return rt.fulfill(status=200, content_type='application/json', body=json.dumps(RPC.get(n)))
    if '/rest/v1/' in u:
        acc = rt.request.headers.get('accept', ''); tbl = u.split('/rest/v1/')[1].split('?')[0]
        if rt.request.method != 'GET': return rt.fulfill(status=201, content_type='application/json', body='[]')
        rows = TABLES.get(tbl, [])
        if 'vnd.pgrst.object' in acc:
            return rt.fulfill(status=200, content_type='application/json', body=json.dumps(rows[0])) if rows else rt.fulfill(status=406, content_type='application/json', body='{"code":"PGRST116"}')
        return rt.fulfill(status=200, content_type='application/json', headers={'content-range': '*/%d' % len(rows)}, body=json.dumps(rows))
    if '/functions/v1/' in u or '/storage/v1/' in u: return rt.fulfill(status=200, content_type='application/json', body='[]')
    if u.startswith('http://127.0.0.1:%d' % PORT): return rt.continue_()
    return rt.abort()

class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Q)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FAILS, N = [], [0]
def ok(tag, c, info=''):
    N[0] += 1
    if not c: FAILS.append(tag + (' — ' + str(info) if info != '' else ''))

GEO = """()=>{const sp=document.querySelector('.sdt-spot'),c=document.querySelector('.sdt-card');const s=sp.getBoundingClientRect(),k=c.getBoundingClientRect();
const T=window.SyDentTour&&SyDentTour.target();let cov=false;
if(T&&sp.classList.contains('on')){const L=[...document.querySelectorAll('.sdt-blk,.sdt-card,.sdt-scrim')];L.forEach(b=>b.style.visibility='hidden');const r=T.getBoundingClientRect();
 const y0=Math.max(r.top,s.top),y1=Math.min(r.bottom,s.bottom);const e=document.elementFromPoint(Math.min(Math.max(r.left+r.width/2,1),innerWidth-2),Math.min(Math.max((y0+y1)/2,1),innerHeight-2));
 cov=!(e&&(T.contains(e)||e.contains(T)));if(cov)window.__cov=(e?e.tagName+'#'+e.id+'.'+String(e.className).slice(0,50):'none')+' T='+JSON.stringify([r.top,r.bottom,r.left,r.right]);L.forEach(b=>b.style.visibility='');}
return {ttl:document.querySelector('.sdt-ttl').textContent,s:[s.top,s.bottom,s.left,s.right],c:[k.top,k.bottom,k.left,k.right],on:sp.classList.contains('on'),vh:innerHeight,vw:innerWidth,sx:document.documentElement.scrollWidth,cov:cov,act:!!document.querySelector('.sdt-wait:not([hidden])')}}"""

def walk(b, tag, path, w, h, sc, ls=None, until=None, maxn=40, lang='ar'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=sc, service_workers='block')
    ctx.route('**/*', route)
    L = {'sydent.auth': json.dumps(SESSION), 'sydent.lang': lang, 'sydent_theme': 'light', 'sydent.tour.autostart': '1'}; L.update(ls or {})
    ctx.add_init_script('(()=>{const L=%s;for(const k in L){try{if(localStorage.getItem(k)===null)localStorage.setItem(k,L[k])}catch(e){}}})()' % json.dumps(L))
    p = ctx.new_page(); errs = []
    if os.environ.get('TOUR_SLOW'):   # محلياً: محاكاة مشغّلٍ بطيء (CI) لكشف ما يتعلّق بالتوقيت
        ctx.new_cdp_session(p).send('Emulation.setCPUThrottlingRate', {'rate': int(os.environ['TOUR_SLOW'])})
    p.on('pageerror', lambda e: errs.append(str(e)))
    if hermetic_fonts:
        try: hermetic_fonts(p)
        except Exception: pass
    p.goto('http://127.0.0.1:%d/%s' % (PORT, path))
    titles, acts = [], 0
    try: p.wait_for_selector('.sdt-card.on', timeout=30000)
    except Exception:
        ok(tag + ': الجولة تبدأ وحدها عند أول زيارة', False); ctx.close(); return p, titles, errs, acts
    for i in range(maxn):
        p.wait_for_timeout(900)
        if not p.evaluate("!!document.querySelector('.sdt-card.on')"):
            p.wait_for_timeout(1200)
            if not p.evaluate("!!document.querySelector('.sdt-card.on')"): break
        # انتظر استقرار المشهد (الانتقال والتمرير الناعم ينتهيان) قبل القياس — المشغّل البطيء يحتاج وقتاً أطول
        g = p.evaluate(GEO); key = None
        for _ in range(30):
            k2 = json.dumps([g['ttl'], [round(x) for x in g['s']], [round(x) for x in g['c']], g['cov']])
            if k2 == key: break
            key = k2; p.wait_for_timeout(150); g = p.evaluate(GEO)
        s, c = g['s'], g['c']; t = g['ttl']
        if not titles or titles[-1] != t: titles.append(t)
        acts += 1 if g['act'] else 0
        ok('%s «%s»: البطاقة داخل الشاشة' % (tag, t), c[0] >= -1 and c[1] <= g['vh'] + 1 and c[2] >= -1 and c[3] <= g['vw'] + 1, c)
        ok('%s «%s»: البطاقة لا تغطّي العنصر' % (tag, t), not g['on'] or s[1] <= c[0] + 1 or s[0] >= c[1] - 1 or s[3] <= c[2] + 1 or s[2] >= c[3] - 1)
        ok('%s «%s»: العنصر ظاهرٌ غير مغطّى' % (tag, t), not g['cov'], p.evaluate('window.__cov||""') if g['cov'] else '')
        ok('%s «%s»: لا تمرير أفقي' % (tag, t), g['sx'] <= g['vw'] + 1)
        if until and until(p, t): break
        if lang == 'en':
            e = p.evaluate("[getComputedStyle(document.querySelector('.sdt-body')).direction, /[\\u0600-\\u06FF]/.test(document.querySelector('.sdt-card').innerText)]")
            ok('%s «%s»: الإنجليزية من اليسار وبلا حرفٍ عربي' % (tag, t), e[0] == 'ltr' and not e[1], e)
        if p.evaluate("document.querySelector('.sdt-next').textContent") in ('تمّ', 'Done'):
            p.click('.sdt-next'); p.wait_for_timeout(500); break
        p.click('.sdt-next')
    ok(tag + ': صفرُ خطأ JS', not errs, errs[:2])
    return p, titles, errs, acts

with sync_playwright() as pw:
    b = pw.chromium.launch()
    sizes = [('لابتوب', 1366, 768, 1), ('موبايل', 390, 844, 2)]
    for nm, w, h, sc in (sizes[:1] if SELF else sizes):
        if not SELF:
            p, T, E, _ = walk(b, nm + '/لوحة التحكم', 'index.html', w, h, sc)
            ok(nm + ': جولة اللوحة 13 خطوة', len(T) == 13, T)
            ok(nm + ': اللوحة تُختم «انتهت»', p.evaluate("localStorage.getItem('sydent.tour.v1.dashboard')") == '{"done":true}')
            p.reload(); p.wait_for_timeout(4500)
            ok(nm + ': لا تعود وحدها بعد انتهائها', not p.evaluate("!!document.querySelector('.sdt-card.on')"))
            ok(nm + ': زرّ «🧭 جولة تعريفية» في رأس الصفحة', p.evaluate("(document.querySelector('.sd-tour-btn')||{}).textContent||''").strip() == '🧭 جولة تعريفية')
            p.context.close()
        done = lambda p, t: t == 'الطلب في تبويب «المخابر»'
        p, T, E, A = walk(b, nm + '/البطاقة التجريبية', 'patient-profile.html?id=demo', w, h, sc, until=done, maxn=45)
        ok(nm + ': الفصل التفاعلي يصل إلى الطلب في تبويب المخابر', T and T[-1] == 'الطلب في تبويب «المخابر»', T[-4:])
        ok(nm + ': نافذة الطلب عرضت «مخبر تجريبي» وموعد التركيب', 'المخبر' in T and 'اربطه بموعد التركيب' in T)
        n = p.evaluate("document.querySelectorAll('#labOrdersContent .sy-act-primary, #labOrdersContent .sy-acts').length") if T else 0
        ok(nm + ': الطلب المحفوظ يظهر في تبويب المخابر', n > 0)
        p.context.close()
        if SELF: break
        p, T, E, A = walk(b, nm + '/المخابر', 'labs.html', w, h, sc)
        ok(nm + ': المخابر بلا مخابر = 7 خطوات (ما لا عنصر له لا يُعدّ)', len(T) == 7, T)
        p.context.close()
    if not SELF:
        ctx = b.new_context(viewport={'width': 1366, 'height': 768}, service_workers='block'); ctx.route('**/*', route)
        ctx.add_init_script('(()=>{try{localStorage.setItem("sydent.auth",%s);localStorage.setItem("sydent.lang","ar")}catch(e){}})()' % json.dumps(json.dumps(SESSION)))
        q = ctx.new_page(); q.goto('http://127.0.0.1:%d/patient-profile.html?id=P1' % PORT); q.wait_for_timeout(7000)
        ok('متصفحٌ آلي (E2E) بلا طلبٍ صريح: لا بدء ذاتي يحجب النقرات', not q.evaluate("!!document.querySelector('.sdt-card.on')") and q.evaluate("!!document.querySelector('.sd-tour-btn')"))
        ctx.close()
        p, T, E, A = walk(b, 'English/البطاقة التجريبية', 'patient-profile.html?id=demo', 1366, 768, 1, lang='en', until=lambda p, t: t == 'The order in the «Labs» tab', maxn=45)
        ok('English: الفصل التفاعلي يكتمل بالإنجليزية', T and T[-1] == 'The order in the «Labs» tab', T[-3:])
        p.context.close()
        p, T, E, A = walk(b, 'بطاقة مريض حقيقي', 'patient-profile.html?id=P1', 1366, 768, 1)
        ok('بطاقة حقيقية: لا خطوة تفاعلية', A == 0)
        ok('بطاقة حقيقية: شرحُ المخبر بلا تنفيذ', 'إرسال عملٍ إلى المخبر' in T and 'ابدأ من السن' not in T, T)
        p.context.close()
    b.close()
httpd.shutdown()
if SELF:
    if FAILS: print('✅ مثبت الجولات --self-test: معرّفٌ مكسور ⇒ أحمر (%d فشل)' % len(FAILS)); sys.exit(0)
    print('❌ مثبت الجولات --self-test: معرّفٌ مكسور مرّ أخضر'); sys.exit(1)
if FAILS:
    for f in FAILS[:15]: print('✗', f)
    print('❌ مثبت الجولات: %d فشل من %d — أولها: %s' % (len(FAILS), N[0], FAILS[0][:220])); sys.exit(1)
print('✅ مثبت الجولات (متصفح حقيقي): %d توكيداً — اللوحة · البطاقة التجريبية تفاعلياً · بطاقة حقيقية · المخابر · لابتوب وموبايل' % N[0])

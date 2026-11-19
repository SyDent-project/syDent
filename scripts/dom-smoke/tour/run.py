#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مثبتُ الجولات التعريفية (tour.js) بمتصفحٍ حقيقي على الصفحات الحقيقية نفسها.
الخلفيةُ مصطنعة بالكامل (لا شبكة): Supabase يُلبّى محلياً — حسابٌ مقبول بعيادةٍ جديدة فارغة + كتالوج العلاجات الافتراضي.
يمشي كما يمشي الطبيب، بالضغط على زر البطاقة وحده:
  • لوحة التحكم: تبدأ الجولة وحدها عند أول زيارة · 13 خطوة · تنتهي وتُختم «انتهت» فلا تعود بعد التحديث.
  • البطاقة التجريبية: الفصل التفاعلي كاملاً بـ«نفّذ عنّي» — السن 27 ← التاج ← «حفظ + إرسال لمخبر» ← «مخبر تجريبي» وموعد التركيب
    في نافذة الطلب ← الحفظ ← الطلب يظهر في تبويب المخابر.
  • نافذة الطلب البطيئة (شبكة الموبايل): تُفتح بعد 4 ثوانٍ من «حفظ + إرسال لمخبر» — الجولة تنتظرها ولا تعود إلى السن في الفراغ.
  • صفحة المرضى: البطاقة التجريبية سطرٌ مثبّت أعلى القائمة بلا رقم ولا تُعدّ، تختفي أثناء البحث، و«✕ حذف» يزيلها نهائياً.
  • بطاقة مريضٍ حقيقي: لا خطوات تفاعلية (الجولة لا تُنشئ شيئاً على مريضٍ حقيقي).
  • المخابر: الخطوات التي لا عنصر لها في عيادةٍ بلا مخابر لا تُعدّ.
  • نافذة سنٍّ بطيئة (الموبايل، بلاغ المالك): تُفتح بعد 3 ثوانٍ من النقر — الفصول لا تعود إلى أولها، وتصل إلى ختامها.
  • فصل المخبر والمخطط ممرَّرٌ إلى 46 (بعد فصلَي الحشوة والمعالجة): السن 27 يُمرَّر إليه، والمخبر يُختار بخطوة تنفيذ قبل «حفظ».
  • الطبيب يسبق الجولة: ينقر السن 15 بنفسه وهو على «مداخل أخرى» — الفصل يلحق به إلى «فئة العلاج» ولا يعود إلى أوله.
  • الجولة المفصّلة: زرّ «🧭 جولة مفصّلة» على بطاقةٍ حقيقية يفتح البطاقة التجريبية بقائمة الفصول (ومعه from)، وكل فصلٍ من الستة
    يُمشى بـ«نفّذ عنّي» حتى خطوة ختامه (الجلسة · الحشوة والأسطح MOD · المعالجة اللبية بكل الجذور · المخبر · الدفعات · الموعد) — بلا قفزٍ ولا تكرار.
  • المخزون: فارغاً 8 خطوات (البطاقات المخفية لا تُعدّ) · وبأصنافٍ ناقصة ودفعةٍ قاربت صلاحيتها 13 خطوة كاملة.
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
_soon = time.strftime('%Y-%m-%d', time.localtime(time.time() + 86400 * 10))
INV = {'inventory_items': [
    {'id': 'I1', 'owner_id': UID, 'name': 'بنج موضعي', 'unit': 'كبسولة', 'quantity': 3, 'reorder_level': 10, 'reorder_qty': 50, 'purchase_price': 2000, 'currency': 'SYP', 'is_active': True},
    {'id': 'I2', 'owner_id': UID, 'name': 'كمبوزيت — تطبيق', 'unit': 'تطبيق', 'quantity': 40, 'reorder_level': 5, 'reorder_qty': 25, 'purchase_price': 90000, 'currency': 'SYP', 'is_active': True},
    {'id': 'I3', 'owner_id': UID, 'name': 'قطن', 'unit': 'رول', 'quantity': 0, 'reorder_level': 3, 'is_active': True}],
  'inventory_batches': [{'id': 'B1', 'owner_id': UID, 'item_id': 'I2', 'quantity': 12, 'received_qty': 25, 'expiry_date': _soon, 'lot': 'A123', 'is_finished': False}]}
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

def walk(b, tag, path, w, h, sc, ls=None, until=None, maxn=40, lang='ar', init=None, begin=None):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=sc, service_workers='block')
    ctx.route('**/*', route)
    L = {'sydent.auth': json.dumps(SESSION), 'sydent.lang': lang, 'sydent_theme': 'light', 'sydent.tour.autostart': '1'}; L.update(ls or {})
    ctx.add_init_script('(()=>{const L=%s;for(const k in L){try{if(localStorage.getItem(k)===null)localStorage.setItem(k,L[k])}catch(e){}}})()' % json.dumps(L))
    if init: ctx.add_init_script(init)
    p = ctx.new_page(); errs = []
    if os.environ.get('TOUR_SLOW'):   # محلياً: محاكاة مشغّلٍ بطيء (CI) لكشف ما يتعلّق بالتوقيت
        ctx.new_cdp_session(p).send('Emulation.setCPUThrottlingRate', {'rate': int(os.environ['TOUR_SLOW'])})
    p.on('pageerror', lambda e: errs.append(str(e)))
    if hermetic_fonts:
        try: hermetic_fonts(p)
        except Exception: pass
    p.goto('http://127.0.0.1:%d/%s' % (PORT, path))
    titles, acts = [], 0
    if begin: begin(p)
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
        if g['cov']:   # العنصر غاب للتوّ (نافذةٌ تُغلق): الجولة تلحق به في نبضتها التالية (300 م.ث) — نقيس بعدها لا قبلها
            p.wait_for_timeout(450); g = p.evaluate(GEO)
        s, c = g['s'], g['c']; t = g['ttl']
        if not titles or titles[-1] != t: titles.append(t)
        acts += 1 if g['act'] else 0
        ok('%s «%s»: البطاقة داخل الشاشة' % (tag, t), c[0] >= -1 and c[1] <= g['vh'] + 1 and c[2] >= -1 and c[3] <= g['vw'] + 1, c)
        ok('%s «%s»: البطاقة لا تغطّي العنصر' % (tag, t), not g['on'] or s[1] <= c[0] + 1 or s[0] >= c[1] - 1 or s[3] <= c[2] + 1 or s[2] >= c[3] - 1)
        ok('%s «%s»: العنصر ظاهرٌ غير مغطّى' % (tag, t), not g['cov'], p.evaluate('window.__cov||""') if g['cov'] else '')
        ok('%s «%s»: لا تمرير أفقي' % (tag, t), g['sx'] <= g['vw'] + 1)
        ok('%s «%s»: العنصر المضاء داخل الشاشة أفقياً (المخطط يُمرَّر إليه)' % (tag, t), not g['on'] or (s[3] > 8 and s[2] < g['vw'] - 8), s)
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
            ok(nm + ': جولة اللوحة 14 خطوة (مع «خطوات البداية» لحسابٍ جديد)', len(T) == 14, T)
            ok(nm + ': اللوحة تُختم «انتهت»', p.evaluate("localStorage.getItem('sydent.tour.v1.dashboard')") == '{"done":true}')
            p.reload(); p.wait_for_timeout(4500)
            ok(nm + ': لا تعود وحدها بعد انتهائها', not p.evaluate("!!document.querySelector('.sdt-card.on')"))
            ok(nm + ': زرّ «🧭 جولة تعريفية» في رأس الصفحة', p.evaluate("(document.querySelector('.sd-tour-btn')||{}).textContent||''").strip() == '🧭 جولة تعريفية')
            p.context.close()
        done = lambda p, t: t == 'الطلب في تبويب «المخابر»'
        p, T, E, A = walk(b, nm + '/البطاقة التجريبية', 'patient-profile.html?id=demo', w, h, sc, until=done, maxn=45)
        ok(nm + ': الفصل التفاعلي يصل إلى الطلب في تبويب المخابر', T and T[-1] == 'الطلب في تبويب «المخابر»', T[-4:])
        ok(nm + ': نافذة الطلب عرضت «مخبر تجريبي» وموعد التركيب', 'المخبر' in T and 'اربطه بموعد التركيب' in T)
        ok(nm + ': لا خطوة تُقفز (25 خطوةً متتالية حتى تبويب المخابر)', len(T) == 25, T)
        n = p.evaluate("document.querySelectorAll('#labOrdersContent .sy-act-primary, #labOrdersContent .sy-acts').length") if T else 0
        ok(nm + ': الطلب المحفوظ يظهر في تبويب المخابر', n > 0)
        p.context.close()
        if SELF: break
        SLOW_LAB = "addEventListener('load',()=>{const o=window.openModal;window.openModal=function(id){if(id==='labOrderModal'){setTimeout(()=>o.apply(this,arguments),4000);return}return o.apply(this,arguments)}})"
        p, T, E, A = walk(b, nm + '/نافذة طلبٍ بطيئة', 'patient-profile.html?id=demo', w, h, sc, until=done, maxn=50, init=SLOW_LAB)
        ok(nm + ': نافذة الطلب البطيئة — لا رجوع إلى السن ولا خطوة مكرّرة (25 خطوة حتى تبويب المخابر)', len(T) == 25 and T[-1] == 'الطلب في تبويب «المخابر»' and T.count('ابدأ من السن') == 1, T)
        p.context.close()
        p, T, E, A = walk(b, nm + '/المخابر', 'labs.html', w, h, sc)
        ok(nm + ': المخابر بلا مخابر = 7 خطوات (ما لا عنصر له لا يُعدّ)', len(T) == 7, T)
        p.context.close()
        p, T, E, A = walk(b, nm + '/المخزون الفارغ', 'inventory.html', w, h, sc)
        ok(nm + ': المخزون الفارغ = 8 خطوات (البطاقات المخفية لا تُعدّ)', len(T) == 8, T)
        p.context.close()
        TABLES.update(INV)
        try:
            p, T, E, A = walk(b, nm + '/المخزون', 'inventory.html', w, h, sc)
            ok(nm + ': المخزون بأصنافٍ ونواقص وصلاحية = 13 خطوة', len(T) == 13, T)
            ok(nm + ': المخزون يمرّ على النواقص والصلاحية وسطر الصنف', all(x in T for x in ('أصناف تحتاج إعادة طلب', 'الصلاحية', 'سطر الصنف', 'حركة مخزون')), T)
            p.context.close()
            if nm == 'لابتوب':
                p, T, E, A = walk(b, 'English/المخزون', 'inventory.html', 1366, 768, 1, lang='en')
                ok('English: جولة المخزون 13 خطوة', len(T) == 13, T)
                p.context.close()
        finally:
            for k in INV: TABLES.pop(k, None)
    if not SELF:
        CH = {'d-sess': 13, 'd-fill': 8, 'd-endo': 8, 'd-lab': 19, 'd-pay': 6, 'd-appt': 5}
        for nm, w, h, sc in sizes:
            for k, n in CH.items():
                def begin(p, k=k):
                    p.wait_for_selector('.sdt-pick:not([hidden]) .sdt-ch', timeout=30000)
                    p.click('.sdt-ch[data-k="%s"]' % k)
                fin = lambda p, t: p.evaluate("!document.querySelector('.sdt-cend').hidden")
                p, T, E, A = walk(b, nm + '/فصل ' + k, 'patient-profile.html?id=demo&tour=detail&from=P1', w, h, sc, until=fin, maxn=40, begin=begin)
                ok(nm + ': فصل %s يصل إلى ختامه بـ%d خطوة متتالية' % (k, n), len(T) == n and len(set(T)) == len(T) and fin(p, ''), T)
                if k == 'd-fill':
                    ok(nm + ': الحشوة حُفظت سطراً واحداً على ثلاثة أسطح', p.evaluate("(window.sessions||[]).some(function(s){return String(s.tooth_num)==='46' && /^[MODBLV]{3}$/.test(s.surface||'') && s.surface.indexOf('M')>-1 && s.surface.indexOf('D')>-1})"))
                if k == 'd-endo':
                    ok(nm + ': المعالجة اللبية حُفظت على كل الجذور', p.evaluate("(window.sessions||[]).some(function(s){return String(s.tooth_num)==='47' && /R1/.test(s.surface||'') && /R2/.test(s.surface||'')})"))
                if k == 'd-pay':
                    ok(nm + ': فصل الدفعات لا يسجّل دفعة', p.evaluate("!document.querySelector('.modal-overlay.open')"))
                p.context.close()
        SLOW_TOOTH = "addEventListener('load',()=>{const o=window.openToothModal;window.openToothModal=function(){const a=arguments,t=this;return new Promise(r=>setTimeout(()=>r(o.apply(t,a)),3000))}})"
        for k, n in (('d-sess', 13), ('d-fill', 8), ('d-endo', 8)):
            def begin(p, k=k):
                p.wait_for_selector('.sdt-pick:not([hidden]) .sdt-ch', timeout=30000); p.click('.sdt-ch[data-k="%s"]' % k)
            fin = lambda p, t: p.evaluate("!document.querySelector('.sdt-cend').hidden")
            p, T, E, A = walk(b, 'موبايل/نافذة سنٍّ بطيئة ' + k, 'patient-profile.html?id=demo&tour=detail', 390, 844, 2, until=fin, maxn=45, begin=begin, init=SLOW_TOOTH)
            ok('موبايل: نافذة سنٍّ بطيئة — فصل %s يصل إلى ختامه بلا رجوعٍ ولا تكرار (%d)' % (k, n), len(T) == n and len(set(T)) == len(T) and fin(p, ''), T)
            p.context.close()
        def begin(p):   # بلاغ المالك: بعد فصلَي الحشوة والمعالجة كان المخطط ممرَّراً إلى 46/47 فيبقى السن 27 خارج الشاشة
            p.wait_for_selector('.sdt-pick:not([hidden]) .sdt-ch', timeout=30000)
            p.evaluate("document.querySelector('[data-occ-cell=\"46\"]').scrollIntoView({inline:'center',block:'nearest'})")
            p.click('.sdt-ch[data-k="d-lab"]')
        fin = lambda p, t: p.evaluate("!document.querySelector('.sdt-cend').hidden")
        p, T, E, A = walk(b, 'موبايل/المخبر بعد تمرير المخطط', 'patient-profile.html?id=demo&tour=detail', 390, 844, 2, until=fin, maxn=40, begin=begin)
        ok('موبايل: فصل المخبر والمخطط ممرَّرٌ بعيداً عن 27 — السن يُعرض ويصل الفصل إلى ختامه، والطلب محفوظ بمخبر', fin(p, '') and len(T) == 19 and p.evaluate("document.querySelectorAll('#labOrdersContent .sy-act-primary, #labOrdersContent .sy-acts').length") > 0, T)
        p.context.close()
        def begin(p):
            p.wait_for_selector('.sdt-pick:not([hidden]) .sdt-ch', timeout=30000); p.click('.sdt-ch[data-k="d-sess"]')
        def ahead(p, t):
            if t == 'مداخل أخرى' and not getattr(p, '_tapped', False):
                p._tapped = True; p.evaluate("document.querySelector('#nseGrid [onclick=\"nsePick(15)\"]').click()")
            return t == 'الأسطح'
        p, T, E, A = walk(b, 'موبايل/الطبيب يسبق الجولة', 'patient-profile.html?id=demo&tour=detail', 390, 844, 2, until=ahead, maxn=30, begin=begin, init=SLOW_TOOTH)
        ok('الطبيب يسبق الجولة (نقر السن بنفسه على نافذةٍ بطيئة): الفصل يلحق به ولا يعود إلى أوله', T and T[-1] == 'الأسطح' and T.count('كيف تُسجَّل جلسة؟') == 1, T)
        p.context.close()
        ctx = b.new_context(viewport={'width': 1366, 'height': 768}, service_workers='block'); ctx.route('**/*', route)
        ctx.add_init_script('(()=>{try{localStorage.setItem("sydent.auth",%s);localStorage.setItem("sydent.lang","ar")}catch(e){}})()' % json.dumps(json.dumps(SESSION)))
        q = ctx.new_page(); q.goto('http://127.0.0.1:%d/patient-profile.html?id=P1' % PORT); q.wait_for_selector('.sd-tour-detail', timeout=30000)
        q.click('.sd-tour-detail'); q.wait_for_selector('.sdt-pick:not([hidden]) .sdt-ch', timeout=30000)
        ok('بطاقة حقيقية: «🧭 جولة مفصّلة» يفتح البطاقة التجريبية بقائمة الفصول الستة', '/patient-profile.html?id=demo&tour=detail&from=P1' in q.url and q.evaluate("document.querySelectorAll('.sdt-ch').length") == 6, q.url)
        q.click('.sdt-ch[data-k="d-pay"]'); q.wait_for_timeout(1800); q.click('.sdt-next'); q.wait_for_timeout(1500); q.click('.sdt-next'); q.wait_for_timeout(1800); q.click('.sdt-x'); q.wait_for_timeout(700)
        ok('إغلاق الفصل (✕) يعيد إلى قائمة الفصول ويغلق نوافذه، و«ارجع لبطاقة المريض» فيها', q.evaluate("!document.querySelector('.sdt-pick').hidden && !document.querySelector('.sdt-pick-f').hidden && !document.querySelector('.modal-overlay.open') && !document.querySelector('.sdt-card.on')"))
        q.click('.sdt-ch[data-k="d-appt"]'); q.wait_for_timeout(1500)
        for i in range(8):
            if q.evaluate("!document.querySelector('.sdt-cend').hidden"): break
            q.click('.sdt-next'); q.wait_for_timeout(1300)
        q.click('.sdt-back'); q.wait_for_timeout(2500)
        ok('«ارجع لبطاقة المريض» يعيد إلى البطاقة الحقيقية، والفصل يُختم «تمّ»', q.url.endswith('patient-profile.html?id=P1') and q.evaluate("localStorage.getItem('sydent.tour.v1.d-appt')") == '{"done":true}', q.url)
        ctx.close()
        for nm, w, h, sc in sizes:
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=sc, service_workers='block'); ctx.route('**/*', route)
            ctx.add_init_script('(()=>{try{if(!sessionStorage.getItem("i")){sessionStorage.setItem("i",1);localStorage.setItem("sydent.auth",%s);localStorage.setItem("sydent.lang","ar")}}catch(e){}})()' % json.dumps(json.dumps(SESSION)))
            q = ctx.new_page(); perr = []; q.on('pageerror', lambda e: perr.append(str(e)))
            q.goto('http://127.0.0.1:%d/patients.html' % PORT); q.wait_for_selector('tr[data-patient-id]', timeout=30000); q.wait_for_timeout(600)
            g = q.evaluate("(()=>{const r=[...document.querySelectorAll('#tableBody tr')];const d=r[0];return {first:!!(d&&d.hasAttribute('data-demo-row')),n:r.filter(x=>x.hasAttribute('data-demo-row')).length,badge:document.getElementById('countBadge').textContent,seq:d?d.querySelector('.seq-badge').textContent:'',vis:d?d.getBoundingClientRect().height>0:false,sx:document.documentElement.scrollWidth<=innerWidth+1}})()")
            ok(nm + ': صفحة المرضى — البطاقة التجريبية أول سطر مع وجود مرضى', g['first'] and g['n'] == 1 and g['vis'], g)
            ok(nm + ': صفحة المرضى — بلا رقم ولا تُعدّ في «N مريض»', g['seq'] == '🧪' and g['badge'].strip().startswith('1 '), g)
            ok(nm + ': صفحة المرضى — لا تمرير أفقي', g['sx'], g)
            q.fill('#searchInput', 'سامر'); q.wait_for_timeout(500)
            ok(nm + ': صفحة المرضى — تختفي أثناء البحث', q.evaluate("!document.querySelector('#tableBody tr[data-demo-row]')"))
            q.fill('#searchInput', ''); q.dispatch_event('#searchInput', 'input'); q.wait_for_timeout(500)
            q.click('#tableBody tr[data-demo-row] .sy-act-danger'); q.wait_for_selector('[data-sy-act="ok"]', timeout=5000); q.click('[data-sy-act="ok"]'); q.wait_for_timeout(400)
            q.reload(); q.wait_for_selector('tr[data-patient-id]', timeout=30000); q.wait_for_timeout(600)
            ok(nm + ': صفحة المرضى — «✕ حذف» يزيلها ولا تعود بعد التحديث', q.evaluate("!document.querySelector('#tableBody tr[data-demo-row]')") and q.evaluate("localStorage.getItem('sydent.demoPatient.hidden')") == '1')
            ok(nm + ': صفحة المرضى — صفرُ خطأ JS', not perr, perr[:2])
            ctx.close()
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
print('✅ مثبت الجولات (متصفح حقيقي): %d توكيداً — اللوحة · البطاقة التجريبية تفاعلياً (ونافذة طلبٍ بطيئة) · الجولة المفصّلة بفصولها الستة · سطر البطاقة التجريبية بصفحة المرضى · بطاقة حقيقية · المخابر · المخزون · لابتوب وموبايل' % N[0])

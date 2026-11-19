# -*- coding: utf-8 -*-
# مثبتُ الإنجليزية لتقارير الأطباء (provider-reports.html) — النصُّ المبنيّ وقت التشغيل.
# prove-i18n يفحص النصَّ الثابت وحده؛ بطاقاتُ الأطباء والتفاصيل وكشفُ الحساب ونافذةُ الدفعة والتبويباتُ الستّ
# (العلاجات · المرضى الجدد · الحضور · الاحتفاظ · الملخّص · المواد) تُبنى من الكود فلا يراها.
# هنا تُفتح الصفحةُ الحقيقية بـChromium بالإنجليزية، فوق خادمٍ محلي للملفات الحيّة، وواجهةُ Supabase
# مُعترَضة بمعطياتٍ ثابتة بأربع حالات: base · rich (راتبٌ ثابت/مختلط · نسبٌ متغيّرة · مرضى مُحالون · مواعيد · مواد) ·
# empty · fail (قراءاتٌ تفشل ⇒ رسائلُ الخطأ). بعد كل حالة: SyI18n.missing (ما لم يترجمه المحرّك الحقيقي)
# بعد إسقاط البيانات (أسماء · علاجات · وحدات) يجب أن يكون فارغاً، ووسومُ الخانات (data-l) إنجليزية.
# الكشوفُ المطبوعة وملفاتُ Excel ونصُّ الواتساب عربيةٌ بالتصميم — خارج الفحص.
# --self-test: ثلاث طفرات (مفتاحٌ يُحذف · نمطٌ يُحذف · data-l يخرج من المحرّك) لا بدّ أن تحمّر.
# بلا playwright ⇒ يتخطّى نفسه ويخرج بـ0.
import os, sys, json, re, threading, functools, base64, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SELF = '--self-test' in sys.argv
AR = re.compile(r'[؀-ۿ]')

try:
    from playwright.sync_api import sync_playwright
    from _fonts.hermetic import hermetic_fonts
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت إنجليزية التقارير'); sys.exit(0)

UID = '11111111-1111-1111-1111-111111111111'
SB = 'https://nxkalpjrqvpglphmiuui.supabase.co'
TODAY = datetime.date.today()
def D(n): return (TODAY + datetime.timedelta(days=n)).isoformat()

def fixture(variant):
    docs = [dict(id='d1', owner_id=UID, name='د. أيهم', is_owner=True, is_active=True, provider_type='doctor', share_percent=None, color='#2ee89e', role='تقويم'),
            dict(id='d2', owner_id=UID, name='د. سامر', is_owner=False, is_active=True, provider_type='doctor', share_percent=30, color='#60a5fa'),
            dict(id='d3', owner_id=UID, name='د. رنا', is_owner=False, is_active=True, provider_type='hygienist', share_percent=20, color='#f472b6'),
            dict(id='d4', owner_id=UID, name='د. قديم', is_owner=False, is_active=False, provider_type='doctor', share_percent=25, color='#aaaaaa')]
    pats = [dict(id='p1', doctor_id=UID, name='محمد', created_at=D(-40) + 'T10:00:00Z'), dict(id='p2', doctor_id=UID, name='سارة', created_at=D(-5) + 'T10:00:00Z'),
            dict(id='p3', doctor_id=UID, name='خالد', created_at=D(-400) + 'T10:00:00Z')]
    def S(i, **o):
        r = dict(id=i, doctor_id=UID, patient_id='p1', status='completed', currency='SYP', cost=100000, date=D(-3), provider_id='d2', type='حشوة',
                 treatment_key='amalgam', tooth_num='16', created_at=D(-3) + 'T10:00:00Z'); r.update(o); return r
    sess = [S('s1'), S('s2', cost=300000, type='معالجة لبية', treatment_key='root-canal', date=D(-10), followup_state='open'),
            S('k1', cost=0, type='متابعة — معالجة لبية', treatment_key=None, tooth_num=None, parent_id='s2', date=D(-2)),
            S('s3', provider_id='d1', cost=500, currency='USD', type='زراعة', treatment_key='implant', patient_id='p2', date=D(-1)),
            S('s4', provider_id=None, cost=50000, type='تنظيف', treatment_key='cleaning', tooth_num=None, patient_id='p3', date=D(-4)),
            S('s5', provider_id='d3', cost=80000, type='تبييض', status='planned', date=D(-2)), S('s6', date=D(-50))]
    pays = [dict(id='y1', doctor_id=UID, patient_id='p1', amount=250000, currency='SYP', date=D(-3), method='cash'),
            dict(id='y2', doctor_id=UID, patient_id='p3', amount=50000, currency='SYP', date=D(-4))]
    splits = [dict(id='sp1', doctor_id=UID, payment_id='y1', session_id='s1', provider_id='d2', amount=100000, currency='SYP', is_unearned=False, patient_id='p1',
                   ledger_payments=dict(date=D(-3), currency='SYP'), ledger_sessions=dict(status='completed'))]
    labs = [dict(id='l1', doctor_id=UID, patient_id='p1', provider_id='d2', cost=40000, currency='SYP', date_sent=D(-6), status='sent', work_type='تاج')]
    payouts = [dict(id='po1', owner_id=UID, provider_id='d2', amount=20000, currency='SYP', paid_at=D(-2) + 'T10:00:00Z', payment_method='cash')]
    def A(i, **o):
        r = dict(id=i, doctor_id=UID, patient_id='p1', patient_name='محمد', date=D(-3), time='10:00', status='completed', provider_id='d2', duration=30, is_planned=False, type='فحص')
        r.update(o); return r
    appts = [A('a1', dismissed_at=D(-3) + 'T11:00:00Z'), A('a2', date=D(-2), status='no_show', patient_id='p2', patient_name='سارة', provider_id='d1'),
             A('a3', date=D(-1), status='cancelled', patient_id='p3', patient_name='خالد', provider_id='d1')]
    treats = [dict(id='t1', doctor_id=UID, treatment_key='amalgam', name='حشوة', category='restorative'), dict(id='t2', doctor_id=UID, treatment_key='root-canal', name='معالجة لبية', category='endodontics')]
    items, movs = [], []
    if variant == 'rich':
        docs[2].update(compensation_model='hybrid', monthly_salary=500000, salary_currency='SYP')
        docs += [dict(id='d5', owner_id=UID, name='د. راتب', is_owner=False, is_active=True, provider_type='doctor', share_percent=0, compensation_model='salary', monthly_salary=300, salary_currency='USD'),
                 dict(id='d6', owner_id=UID, name='د. بلا', is_owner=False, is_active=True, provider_type='assistant', compensation_model='none')]
        docs[1]['share_history'] = [dict(**{'from': D(-400), 'pct': 25}), dict(**{'from': D(-8), 'pct': 30})]
        payouts.append(dict(id='po2', owner_id=UID, provider_id='d3', amount=700000, currency='SYP', paid_at=D(-1) + 'T10:00:00Z', period_start=D(-30), period_end=D(0), payment_method='cash', notes='راتب وحصة'))
        payouts[0].update(period_start=D(-30), period_end=D(-1), payment_method='bank')
        pats += [dict(id='p4', doctor_id=UID, name='ليلى', created_at=D(-6) + 'T10:00:00Z', referral_source='friend', referred_by_patient_id='p1'),
                 dict(id='p5', doctor_id=UID, name='وائل', created_at=D(-7) + 'T10:00:00Z', referral_source='doctor_referral', referrer_name='د. خارجي'),
                 dict(id='p6', doctor_id=UID, name='منتظر', created_at=D(-2) + 'T10:00:00Z', referral_source='social')]
        pats[0]['referral_source'] = 'search'; pats[1].update(referral_source='friend', referred_by_patient_id='p1')
        sess += [S('s7', patient_id='p4', date=D(-5), type='تاج', treatment_key='crown'), S('s8', patient_id='p5', date=D(-4), type='غير موجود', treatment_key=None),
                 S('s9', patient_id='p4', provider_id='d3', date=D(-60), type='تنظيف', treatment_key='cleaning'), S('s10', patient_id='p3', date=D(-380)),
                 S('s11', patient_id='p2', description='رسم عدم الحضور', type='رسم عدم الحضور', cost=10000, treatment_key=None, tooth_num=None, date=D(-2))]
        labs.append(dict(id='l2', doctor_id=UID, patient_id='p4', provider_id='d2', cost=30000, currency='SYP', date_sent=D(-5), status='sent', tooth_num='21'))
        appts += [A('b1', date=D(-6), status='confirmed', arrived_at=D(-6) + 'T10:00:00Z', dismissed_at=D(-6) + 'T11:00:00Z'),
                  A('b2', date=D(-7), status='no_show', patient_id='p2', patient_name='سارة'), A('b3', date=D(-8), status='no_show', patient_id='p2', patient_name='سارة', duration=None),
                  A('b4', date=D(-9), status='cancelled', patient_id='p2', patient_name='سارة', time='17:30', type='تنظيف'), A('b5', date=D(-4), status='scheduled'),
                  A('b6', date=D(0), status='scheduled', time='23:59'), A('b7', date=D(3), status='scheduled', patient_id='p4'),
                  A('b8', date=D(-12), status='confirmed', arrived_at=D(-12) + 'T10:00:00Z', provider_id='d3', type='تقويم'), A('b9', date=D(-10), status='broken', patient_id='p3', patient_name='خالد')]
        for i in range(9):
            appts.append(A('x%d' % i, date=D(-15 - i), status='confirmed', arrived_at=D(-15 - i) + 'T10:00:00Z', dismissed_at=D(-15 - i) + 'T10:30:00Z', patient_id='p%d' % (1 + i % 3)))
        items = [dict(id='i1', owner_id=UID, name='كمبوزيت', unit='غ', purchase_price=5000, currency='SYP'), dict(id='i2', owner_id=UID, name='قفازات', unit='علبة', purchase_price=None, currency='SYP')]
        movs = [dict(id='m1', owner_id=UID, item_id='i1', change=-2, reason='consume', created_at=D(-3) + 'T10:00:00Z', provider_id='d2', session_id='s1', ledger_sessions=dict(type='حشوة')),
                dict(id='m2', owner_id=UID, item_id='i2', change=-1, reason='consume', created_at=D(-2) + 'T10:00:00Z', provider_id=None, session_id=None, ledger_sessions=None)]
    if variant == 'empty':
        sess, pays, splits, labs, payouts, appts = [], [], [], [], [], []
    T = dict(clinic_doctors=docs, patients=pats, ledger_sessions=sess, ledger_payments=pays, payment_splits=splits, lab_orders=labs, provider_payouts=payouts,
             appointments=appts, treatments=treats, inventory_items=items, inventory_movements=movs, account_adjustments=[],
             clinic_settings=[dict(owner_id=UID, clinic_name='عيادة الأمل', currency='SYP')],
             clinic_employees=[dict(id='e1', owner_id=UID, name='Owner', role='owner', is_active=True)],
             trial_requests=[dict(id='tr1', user_id=UID, status='accepted', plan='pro', created_at=D(-100) + 'T10:00:00Z')])
    # البياناتُ (أسماءٌ وعلاجاتٌ ووحداتٌ وملاحظات) — تمرّ عربيةً كما هي ولا تُعدّ نقصاً بالترجمة
    data = set()
    for rows in T.values():
        for r in rows:
            for k in ('name', 'patient_name', 'type', 'role', 'unit', 'notes', 'referrer_name', 'work_type', 'clinic_name'):
                if isinstance(r.get(k), str) and AR.search(r[k]): data.add(r[k])
            if isinstance(r.get('ledger_sessions'), dict) and r['ledger_sessions'].get('type'): data.add(r['ledger_sessions']['type'])
    return T, data

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
USER = dict(id=UID, aud='authenticated', role='authenticated', email='owner@x.test', user_metadata=dict(full_name='د. أيهم'), app_metadata={})
JWT = b64(dict(alg='HS256', typ='JWT')) + '.' + b64(dict(sub=UID, exp=4102444800, role='authenticated', aud='authenticated')) + '.sig'
SESSION = dict(access_token=JWT, refresh_token='r', token_type='bearer', expires_in=3600, expires_at=4102444800, user=USER)
FAIL_T = re.compile(r'^(ledger_payments|payment_splits|lab_orders|provider_payouts|treatments|appointments|inventory_items|patients)$')

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d' % srv.server_address[1]

def run(variant, mut=None, quick=False):
    """⇒ (left, info): left = نصوصٌ عربية لم تُترجم وليست بيانات · info = فحوصٌ إضافية"""
    T, data = fixture(variant)
    def is_data(s):
        t = s
        for d in sorted(data, key=len, reverse=True): t = t.replace(d, '')
        t = re.sub(r'(^|\s)[؀-ۿ]{1,2}($|\s)', ' ', t)   # الحرفان الأوّلان بدائرة الطبيب
        return not AR.search(t)
    def api(route, request):
        u = request.url; path = u.split(SB, 1)[1].split('?', 1)[0]; m = request.method
        H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range'}
        def js(body, status=200, extra=None):
            h = dict(H); h.update(extra or {})
            route.fulfill(status=status, content_type='application/json', headers=h, body=json.dumps(body))
        if m == 'OPTIONS': return route.fulfill(status=200, headers=H)
        if path.startswith('/auth/v1/user'): return js(USER)
        if path.startswith('/auth/v1/'): return js(SESSION)
        if path.startswith('/rest/v1/rpc/'):
            fn = path.rsplit('/', 1)[1]
            R = dict(my_access_level='full', is_platform_admin=False, my_subscription_state=dict(status='active', plan='pro', ends_at=D(300)))
            return js(R.get(fn))
        if path.startswith('/rest/v1/'):
            t = path.split('/')[3]; rows = T.get(t, [])
            if variant == 'fail' and FAIL_T.match(t) and m == 'GET': return js(dict(code='500', message='boom'), 500)
            if m not in ('GET', 'HEAD'): return js([])
            rng = '0-%d/%d' % (max(0, len(rows) - 1), len(rows))
            if 'vnd.pgrst.object' in (request.headers.get('accept') or ''):
                return js(rows[0], 200, {'content-range': rng}) if rows else js(dict(code='PGRST116', message='no rows'), 406)
            return js(rows, 200, {'content-range': rng})
        return js({})
    left, info = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}); hermetic_fonts(ctx)
        ctx.route(SB + '/**', api)
        ctx.route(re.compile(r'.*(sentry|realtime|websocket).*'), lambda r, q: r.abort())
        if mut:
            for fname, fn in mut.items():
                src = open(os.path.join(ROOT, fname), encoding='utf-8').read(); new = fn(src)
                assert new != src, 'طفرةٌ بلا مرساة: ' + fname
                ctx.route(re.compile(r'.*/' + re.escape(fname) + r'(\?.*)?$'),
                          lambda r, q, body=new: r.fulfill(status=200, content_type='application/javascript; charset=utf-8', body=body))
        ctx.add_init_script("try{localStorage.setItem('sydent.auth',%s);localStorage.setItem('sydent.lang','en');}catch(e){}" % json.dumps(json.dumps(SESSION)))
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE + '/provider-reports.html', wait_until='load')
        pg.wait_for_function("()=>window.SyI18n && document.querySelector('#provList .prov-card, #provList .empty-state')", timeout=20000)
        pg.wait_for_timeout(600)
        seen = set()
        def snap(label):
            pg.wait_for_timeout(650)
            for x in pg.evaluate("()=>(window.SyI18n.missing||[]).slice()"):
                if x in seen: continue
                seen.add(x)
                if not is_data(x): left.append(label + ' :: ' + x)
            for x in pg.evaluate("()=>[...document.querySelectorAll('[data-l]')].map(e=>e.getAttribute('data-l')).filter(v=>/[\\u0600-\\u06FF]/.test(v))"):
                if ('data-l ' + x) not in seen: seen.add('data-l ' + x); left.append(label + ' :: data-l «' + x + '»')
        def act(label, js):
            try: pg.evaluate(js)
            except Exception as e: errs.append(label + ': ' + str(e)[:160])
            snap(label)
        snap('doctors')
        info['english_card'] = pg.evaluate("()=>/Average session value/.test(document.getElementById('provList').innerText)") if variant != 'empty' else True
        if variant != 'empty' and not quick:
            act('details', "showDetails('d2','')"); act('details-x', "closeModal('detailsModal')")
            act('ledger', "openLedger('d2','')"); act('ledger-x', "closeModal('ledgerModal')")
            act('payout', "openPayoutModal('d2','')"); act('payout-x', "closeModal('payoutModal')")
            if variant == 'rich': act('ledger-mixed', "openLedger('d3','')"); act('ledger-mixed-x', "closeModal('ledgerModal')")
        for t in (['treat', 'att'] if quick else ['treat', 'new', 'att', 'ret', 'sum', 'mat']):
            act('tab-' + t, "setRptTab('%s')" % t); pg.wait_for_timeout(500); snap('tab-' + t)
        if not quick:
            act('treat-by-count', "setRptTab('treat'); var b=document.querySelector('[data-rt-sort=count]'); b&&b.click()")
            act('planned', "setRptTab('prov'); var s=document.getElementById('statusFilter'); s.value='completed_planned'; s.dispatchEvent(new Event('change'))")
        if variant != 'empty':
            pg.evaluate("()=>setRptTab('treat')"); pg.wait_for_timeout(600)
            info['data_l'] = pg.evaluate("()=>[...document.querySelectorAll('[data-l]')].map(e=>e.getAttribute('data-l')).slice(0,6)")
        else: info['data_l'] = []
        info['errs'] = errs
        b.close()
    return left, info

fails = []
def ok(name, cond, detail=''):
    if not cond: fails.append(name)
    if not SELF: print(('PASS ' if cond else 'FAIL ') + name + (('\n      ' + detail) if (detail and not cond) else ''))

if not SELF:
    for v in ('base', 'rich', 'empty', 'fail'):
        left, info = run(v)
        ok(v + ': every runtime string in English (data aside)', not left, '\n      '.join(left[:12]))
        ok(v + ': the page runs without a JS error', not info['errs'], '; '.join(info['errs'][:3]))
        ok(v + ': the doctor card reads in English', info['english_card'])
        if v == 'rich': ok(v + ': mobile column labels (data-l) in English', info['data_l'] and all(not AR.search(x) for x in info['data_l']), str(info['data_l']))
    print(('✅' if not fails else '❌') + ' i18n-reports: %d فشل' % len(fails))
    srv.shutdown(); sys.exit(1 if fails else 0)

MUTANTS = [
    ('a card label loses its entry', {'i18n-en.js': lambda s: s.replace("'متوسط قيمة الجلسة': 'Average session value', ", '', 1)}),
    ('the share pattern is gone', {'i18n-en.js': lambda s: s.replace("[/^(?:(.+?) • )?نسبة: (.+)$/,", "[/^XX$/,", 1)}),
    ('the engine stops reading data-l', {'theme.js': lambda s: s.replace("'alt', 'data-l'];", "'alt'];", 1)}),
]
bit = 0
for name, mut in MUTANTS:
    try:
        left, info = run('rich', mut, quick=True)
        red = bool(left) or not info['english_card'] or any(AR.search(x) for x in info['data_l'])
    except AssertionError as e:
        print('❌ ' + str(e)); red = False
    if red: bit += 1
    else: print('❌ طفرةٌ لم تعضّ: ' + name)
srv.shutdown()
print(('✅' if bit == len(MUTANTS) else '❌') + ' i18n-reports --self-test: %d/%d طفرات تعضّ' % (bit, len(MUTANTS)))
sys.exit(0 if bit == len(MUTANTS) else 1)

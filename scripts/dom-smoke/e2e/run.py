#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مثبتُ مسارات الموافقات والدوام والإجازات على الصفحات الحقيقية بمتصفحٍ حقيقي (انظر backend.py).
كلُّ سيناريو يفتح الصفحةَ نفسَها التي يفتحها المستخدم، ينقر ما ينقره، ويتحقّق ممّا يراه وممّا كُتب للقاعدة:
  card      — بطاقة المريض: تخطيطُ علاجٍ له نصُّ موافقة ⇒ يظهر حوارُ الموافقة حيث يعمل الطبيب · «لاحقاً» · سنٌّ ثانٍ ينضمّ
              بلا حوار · علاجٌ يُسجَّل منجزاً لا يأخذ موافقة (تنبيهٌ واحد) · «توقيع على هذا الجهاز» يفتح بوابةَ المريض
              على الموافقة نفسها، فيوقّع، فتعود «موقَّعة» بالبطاقة · الإلغاء لا يعود.
  open      — فتحُ بطاقةٍ فيها موافقة معلَّقة لا يعرض حواراً.
  tx        — صفحة العلاجات: تفعيلُ نصّ الموافقة وحفظُه وإيقافُه.
  appt      — المواعيد: تلميحُ الموافقة المعلَّقة تحت المريض · تنبيهُ الحجز خارج دوام الطبيب (إلغاء/تجاوز) ويومُ عطلته.
  emp       — الموظفون: الدوامُ الخاص · إجازةُ الطبيب تُنشئ حجزَه المغلق وتُعلن مواعيدَه · الحذف يزيل الاثنين.
  pay       — الرواتب: سطرُ «خصم مقترح» ظاهر، لا يُخصم شيء حتى يُضغط، والحفظُ يحمل المبلغَ والملاحظة.
  dash      — اللوحة: شارةُ «موافقة بانتظار التوقيع» على موعد اليوم.
--self-test: كلُّ طفرةٍ (ملفٌ يُخدَّم معدَّلاً) يجب أن تُسقط سيناريو واحداً على الأقل."""
import os, sys, json, time, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت المسارات على الصفحات الحقيقية'); sys.exit(0)
from backend import *
SELF = '--self-test' in sys.argv
PORT = 8830 + (1 if SELF else 0)
serve(PORT)
BASE = 'http://127.0.0.1:%d/' % PORT
FAILS, N = [], [0]
def ok(tag, c, info=''):
    N[0] += 1
    if not c: FAILS.append(tag + (' — ' + str(info)[:200] if info != '' else ''))

MUT = {}   # {'file.js': (find, replace)} — يُطبَّق على ما يُخدَّم (self-test)
def new_page(b, db, w=1366, h=768):
    ctx = context(b, db, w, h)
    def serve_mut(rt):
        name = rt.request.url.split('?')[0].split('/')[-1]
        if name in MUT:
            src = open(os.path.join(ROOT, name), encoding='utf-8').read(); a, r = MUT[name]
            if a not in src: raise RuntimeError('طفرةٌ بلا مرساة: ' + name)
            return rt.fulfill(status=200, content_type='text/html; charset=utf-8' if name.endswith('.html') else 'application/javascript; charset=utf-8', body=src.replace(a, r))
        return rt.fallback()
    ctx.route('http://127.0.0.1:%d/**' % PORT, serve_mut)
    p = ctx.new_page(); p.set_default_timeout(15000); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    return ctx, p, errs
def toasts_on(p):
    p.evaluate("(function(){window.__toasts=[];var o=window.showToast;window.showToast=function(m){window.__toasts.push(String(m));return o&&o.apply(this,arguments);};})()")
def dlg(p): return p.evaluate("(function(){var d=document.querySelector('.sy-dialog');if(!d)return null;var b=d.querySelector('.modal-box').getBoundingClientRect();return {text:d.innerText.replace(/\\n+/g,' | '),inView:b.top>=0&&b.left>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1};})()")
def until(p, fn, ms=15000):
    """ينتظر حتى يتحقّق شرطٌ على القاعدة (الطلباتُ تُجاب أثناء الانتظار) — بدل مهلةٍ ثابتة تخون على آلةٍ بطيئة."""
    t = time.time() + ms / 1000.0
    while time.time() < t:
        try:
            if fn(): return True
        except Exception: pass
        p.wait_for_timeout(120)
    return False
def wait_dialog(p, ms=15000):
    try: p.wait_for_selector('.sy-dialog', timeout=ms); p.wait_for_timeout(450); return True   # ورقةُ الهاتف تنزلق لمكانها
    except Exception: return False

CONSENT_TPL = {'id': 'ct1', 'owner_id': UID, 'treatment_key': 'extracted', 'title': 'الموافقة على قلع الأسنان', 'body': 'شرح لي الطبيب العلاج المقترح وبدائله. ' * 12}
def card_db():
    db = base_db(); db.rpc['consent_sync'] = make_consent_sync(db, UID); portal_rpcs(db, UID)
    db.t['consent_templates'] = [dict(CONSENT_TPL)]
    return db
def add_tooth(p, tooth, status):
    el = p.locator('rect.crown-surface[data-tooth="%s"]' % tooth).first
    el.scroll_into_view_if_needed(); p.wait_for_timeout(200); el.click()
    p.wait_for_selector('#toothModal.open, #toothModal.show'); p.wait_for_timeout(250)
    p.locator('#toothModal').get_by_text('قلع', exact=True).first.click(); p.wait_for_timeout(350)
    p.locator('#toothModal').get_by_text(status, exact=True).first.click(); p.wait_for_timeout(150)
    p.locator('#toothModal').get_by_text('حفظ كجلسة', exact=False).first.click()
def card_ready(p):
    p.wait_for_function("typeof PP_CONSENTS !== 'undefined' && Array.isArray(PP_CONSENTS) && !!document.querySelector('rect.crown-surface[data-tooth=\"26\"]') && typeof sessions !== 'undefined' && Array.isArray(sessions)", timeout=30000)
    p.wait_for_timeout(600); toasts_on(p)

def s_card(b, w=1366, h=768):
    T = 'card[%d]' % w
    db = card_db(); ctx, p, errs = new_page(b, db, w, h)
    p.goto(BASE + 'patient-profile.html?id=P1', wait_until='domcontentloaded'); card_ready(p)
    ok(T + ': البطاقة بلا موافقات — الصفُّ مخفي ولا حوار', p.evaluate("getComputedStyle(document.getElementById('consentRow')).display") == 'none' and not dlg(p))
    add_tooth(p, 26, 'مخطط')
    shown = wait_dialog(p)
    d = dlg(p) or {'text': '', 'inView': False}
    clear = p.evaluate("(function(){var t=document.getElementById('syToast'),c=document.querySelector('.sy-dialog .btn-sy-cancel');if(!c)return false;if(!t||!t.classList.contains('show'))return true;var a=t.getBoundingClientRect(),b=c.getBoundingClientRect();return a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right;})()")
    ok(T + ': لا إشعارَ يغطّي زرَّ «لاحقاً»', clear)
    ok(T + ': تخطيطُ القلع يُظهر حوارَ الموافقة حيث يعمل الطبيب', shown and 'موافقة المريض مطلوبة' in d['text'] and '«قلع» (السن 26)' in d['text'] and 'قبل التنفيذ' in d['text'], d['text'])
    ok(T + ': الحوارُ داخل الشاشة وفيه «التوقيع الآن» و«إرسال» و«لاحقاً»', d['inView'] and 'التوقيع الآن على هذا الجهاز' in d['text'] and 'إرسال رابط البوابة' in d['text'] and 'لاحقاً' in d['text'], d)
    cs = db.rows('patient_consents')
    ok(T + ': القاعدةُ تحمل موافقةً معلَّقة واحدة للسن 26 بنصّ العيادة', len(cs) == 1 and cs[0]['status'] == 'pending' and cs[0]['teeth'] == '26' and cs[0]['title'] == CONSENT_TPL['title'] and cs[0]['body'] == CONSENT_TPL['body'])
    if shown:
        p.screenshot(path='/tmp/shots/e2e_dialog_%d.png' % w) if os.path.isdir('/tmp/shots') else None
        p.locator('.sy-dialog .btn-sy-cancel').click(); p.wait_for_selector('.sy-dialog', state='detached')
    ok(T + ': «لاحقاً» لا يفتح شيئاً ولا يكتب رابطاً', len(ctx.pages) == 1 and not db.rows('patient_portals'))
    row = p.evaluate("(function(){var r=document.getElementById('consentRow');return {d:getComputedStyle(r).display,t:r.innerText.replace(/\\n+/g,' | ')};})()")
    ok(T + ': الصفُّ يعرضها معلَّقةً مع «توقيع على هذا الجهاز»', row['d'] != 'none' and 'بانتظار التوقيع: 1' in row['t'] and 'توقيع على هذا الجهاز' in row['t'], row)
    add_tooth(p, 27, 'مخطط'); p.wait_for_function("(function(){return window.__toasts.filter(function(t){return /27/.test(t);}).length>0;})()"); until(p, lambda: len(db.rows('patient_consents')[0]['session_ids']) == 2); p.wait_for_timeout(700)
    cs = db.rows('patient_consents')
    ok(T + ': سنٌّ ثانٍ ينضمّ للموافقة نفسها بلا حوارٍ ثانٍ', len(cs) == 1 and cs[0]['teeth'] == '26، 27' and len(cs[0]['session_ids']) == 2 and not dlg(p), [c['teeth'] for c in cs])
    add_tooth(p, 16, 'منجز'); p.wait_for_function("(function(){return window.__toasts.filter(function(t){return /16/.test(t);}).length>0;})()")
    try: p.wait_for_function("window.__toasts.some(function(t){return t.indexOf('بلا موافقة موقَّعة')>-1;})", timeout=15000)
    except Exception: pass
    p.wait_for_timeout(900)
    cs = db.rows('patient_consents'); ts = p.evaluate("window.__toasts")
    ok(T + ': علاجٌ سُجّل منجزاً مباشرةً لا يأخذ موافقة', len(cs) == 1 and len(cs[0]['session_ids']) == 2 and not dlg(p), cs)
    ok(T + ': …ويُنبَّه عنه مرةً واحدة', len([t for t in ts if 'بلا موافقة موقَّعة' in t]) == 1, ts)
    # «توقيع على هذا الجهاز» ⇒ تبويبُ البوابة على الموافقة نفسها
    p.locator('#consentRow').scroll_into_view_if_needed(); p.wait_for_timeout(200)
    cid = cs[0]['id']
    try:
        with ctx.expect_page(timeout=8000) as pop:
            p.locator('#consentRow [onclick*="ppConsentSignHere("]').click()
        q = pop.value; q.set_default_timeout(15000); qerrs = []; q.on('pageerror', lambda e: qerrs.append(str(e)[:200]))
        q.wait_for_url('**/portal.html?t=*', timeout=10000)
    except Exception as e:
        q = None; ok(T + ': «توقيع على هذا الجهاز» يفتح تبويباً', False, e)
    if q:
        tok = (db.rows('patient_portals') or [{}])[0].get('token', '')
        ok(T + ': التبويبُ هو بوابةُ هذا المريض (رابطٌ واحد أُنشئ للمالك والمريض)', len(db.rows('patient_portals')) == 1 and db.rows('patient_portals')[0].get('patient_id') == 'P1' and ('t=' + tok) in q.url, q.url)
        # من الصفّ بلا معرّف: البوابةُ تفتح وفيها بطاقةُ الموافقات
        q.wait_for_selector('#cnsCard'); ok(T + ': البوابةُ تعرض الموافقة المعلَّقة', 'بانتظار توقيعك' in q.evaluate("document.getElementById('cnsCard').innerText"))
        q.close()
    # من القائمة: زرُّ الموافقة نفسها يفتحها مباشرةً
    p.locator('#consentRow [onclick*="ppConsentOpen("]').click(); p.wait_for_selector('#ppConsentModal.open'); p.wait_for_timeout(200)
    li = p.evaluate("(function(){var b=document.querySelector('#ppConsentList [onclick*=\"ppConsentSignHere(\"]');if(!b)return null;var r=b.getBoundingClientRect(),m=document.querySelector('#ppConsentModal .modal, #ppConsentModal .modal-box').getBoundingClientRect();return r.width>0&&r.left>=m.left-1&&r.right<=m.right+1;})()")
    ok(T + ': بالقائمة زرُّ «توقيع على هذا الجهاز» داخل بطاقته', li is True, li)
    q = None
    try:
        with ctx.expect_page(timeout=8000) as pop:
            p.locator('#ppConsentList [onclick*="ppConsentSignHere("]').first.click()
        q = pop.value; q.set_default_timeout(15000); qerrs = []; q.on('pageerror', lambda e: qerrs.append(str(e)[:200]))
        q.wait_for_url('**/portal.html?t=*', timeout=10000)
    except Exception as e:
        ok(T + ': زرُّ القائمة يفتح تبويباً', False, e)
    if q:
        ok(T + ': الرابطُ يحمل معرّفَ الموافقة', ('&c=' + cid) in q.url, q.url)
        try: q.wait_for_selector('#cnsOv', timeout=10000); opened = True
        except Exception: opened = False
        ok(T + ': البوابةُ تفتح على الموافقة نفسها جاهزةً للقراءة والتوقيع', opened and CONSENT_TPL['title'] in (q.evaluate("(document.getElementById('cnsOv')||{}).innerText||''")))
        if opened:
            sheet = q.evaluate("(function(){var o=document.getElementById('cnsOv');var bad=[];o.querySelectorAll('*').forEach(function(e){var r=e.getBoundingClientRect();if(r.width&&(r.left<-1||r.right>innerWidth+1))bad.push(e.className||e.tagName);});return bad;})()")
            ok(T + ': ورقةُ التوقيع لا يخرج منها شيء عن الشاشة', not sheet, sheet[:3])
            q.check('#cnsAgree'); pad = q.locator('#sigPad'); pad.scroll_into_view_if_needed(); bb = pad.bounding_box()
            q.mouse.move(bb['x'] + 30, bb['y'] + 40); q.mouse.down()
            for i in range(1, 12): q.mouse.move(bb['x'] + 30 + i * 12, bb['y'] + 40 + (35 if i % 2 else 0))
            q.mouse.up(); q.wait_for_timeout(120)
            if os.path.isdir('/tmp/shots'): q.screenshot(path='/tmp/shots/e2e_portal_sign_%d.png' % w)
            q.click('#cnsGo'); q.wait_for_selector('#cnsOv', state='detached', timeout=10000)
            c = db.rows('patient_consents')[0]
            ok(T + ': التوقيعُ يصل القاعدة: موقَّعة باسم المريض وصورةِ توقيعٍ PNG', c['status'] == 'signed' and c.get('signer_name') == 'سامر خليل' and str(c.get('signature', '')).startswith('data:image/png;base64,') and len(c['signature']) > 400, {k: str(v)[:40] for k, v in c.items() if k in ('status', 'signer_name')})
            ok(T + ': صفرُ خطأ JS بالبوابة', not qerrs, qerrs[:2])
        q.close()
    p.bring_to_front(); p.evaluate("closeModal('ppConsentModal')")
    p.evaluate("ppConsentLoad(true);0"); p.wait_for_function("document.getElementById('consentRow').innerText.indexOf('موقَّعة: 1') > -1", timeout=8000)   # الإشعارُ اللحظي ينادي التحميلَ نفسَه
    ok(T + ': البطاقةُ تعرضها «موقَّعة» بعد التوقيع', 'بانتظار التوقيع' not in p.evaluate("document.getElementById('consentRow').innerText"))
    add_tooth(p, 28, 'مخطط')
    shown = wait_dialog(p)
    pend = [c for c in db.rows('patient_consents') if c['status'] == 'pending']
    ok(T + ': قلعٌ جديد بعد التوقيع يحتاج موافقةً جديدة (الموقَّعة تخصّ جلساتِها)', shown and len(pend) == 1)
    if shown:   # «التوقيع الآن» من الحوار نفسِه يفتح البوابة على الموافقة الجديدة
        q = None
        try:
            with ctx.expect_page(timeout=8000) as pop:
                p.locator('.sy-dialog .sy-dialog-choice').first.click()
            q = pop.value; q.wait_for_url('**/portal.html?t=*', timeout=10000)
        except Exception as e:
            ok(T + ': «التوقيع الآن» من الحوار يفتح تبويباً', False, e)
        if q:
            try: q.wait_for_selector('#cnsOv', timeout=10000); op = True
            except Exception: op = False
            ok(T + ': «التوقيع الآن» من الحوار يفتح البوابة على الموافقة الجديدة', op and pend and ('&c=' + pend[0]['id']) in q.url, q.url)
            q.close()
        p.bring_to_front(); p.wait_for_timeout(200)
        ok(T + ': الحوارُ يُغلق بعد الاختيار', not dlg(p))
    # الإلغاء لا يعود
    p.locator('#consentRow').scroll_into_view_if_needed(); p.locator('#consentRow [onclick*="ppConsentOpen("]').click(); p.wait_for_selector('#ppConsentModal.open')
    p.locator('#ppConsentList [onclick*="ppConsentVoid("]').first.click(); wait_dialog(p)
    dv = dlg(p) or {'text': ''}
    ok(T + ': حوارُ الإلغاء يقول إنها لا تعود، بزرٍّ مسمّى', 'ولا تُنشأ من جديد' in dv['text'] and dv['text'].strip().endswith('| إلغاء الموافقة'), dv['text'])
    p.locator('.sy-dialog .btn-sy-ok').click(); p.wait_for_selector('.sy-dialog', state='detached'); p.wait_for_timeout(500)
    p.evaluate("closeModal('ppConsentModal')"); n = len(db.rpc_calls); p.evaluate("ppConsentLoad(true);0"); until(p, lambda: len(db.rpc_calls) > n); p.wait_for_timeout(900)
    st = sorted(c['status'] for c in db.rows('patient_consents'))
    ok(T + ': الملغاةُ تبقى ملغاة بعد مزامنةٍ جديدة', st == ['signed', 'void'] and not dlg(p), st)
    ok(T + ': صفرُ خطأ JS ببطاقة المريض', not errs, errs[:2])
    ctx.close()

def s_open(b):
    db = card_db()
    db.t['ledger_sessions'] = [{'id': 'S1', 'doctor_id': UID, 'patient_id': 'P1', 'type': 'قلع', 'treatment_key': 'extracted', 'status': 'planned', 'tooth_num': '26', 'date': time.strftime('%Y-%m-%d'), 'cost': 3000, 'created_at': '2026-11-21T10:00:00+00:00'}]
    ctx, p, errs = new_page(b, db)
    p.goto(BASE + 'patient-profile.html?id=P1', wait_until='domcontentloaded'); card_ready(p); until(p, lambda: len(db.rows('patient_consents')) == 1)
    try: p.wait_for_function("document.getElementById('consentRow').innerText.indexOf('بانتظار التوقيع: 1') > -1", timeout=15000)
    except Exception: pass
    p.wait_for_timeout(900)
    ok('open: فتحُ بطاقةٍ فيها خطةٌ تحتاج موافقة يولّدها ويعرضها بالصف بلا حوار', len(db.rows('patient_consents')) == 1 and not dlg(p) and 'بانتظار التوقيع: 1' in p.evaluate("document.getElementById('consentRow').innerText"))
    ok('open: صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

def s_tx(b):
    db = base_db(); ctx, p, errs = new_page(b, db)
    p.goto(BASE + 'treatments.html', wait_until='domcontentloaded')
    p.wait_for_function("document.querySelectorAll('[onclick*=\"openConsentModal(\"]').length > 0", timeout=30000)
    sm = p.locator('details.trt-more:has([onclick*="openConsentModal(\'t11\')"]) > summary'); sm.scroll_into_view_if_needed(); sm.click()
    p.locator('[onclick*="openConsentModal(\'t11\')"]').click(); p.wait_for_function("getComputedStyle(document.getElementById('consentModal')).display !== 'none'")
    ok('tx: النافذة تفتح والمفتاح مطفأ والحقول مخفية', not p.evaluate("document.getElementById('cnsOn').checked") and p.evaluate("getComputedStyle(document.getElementById('cnsFields')).display") == 'none')
    p.locator('#consentModal .lab-toggle-switch').click(); p.wait_for_timeout(200)
    ok('tx: التفعيل يملأ نصَّ المكتبة للقلع', p.evaluate("document.getElementById('cnsTitle').value") == 'الموافقة على قلع الأسنان' and p.evaluate("document.getElementById('cnsBody').value.length") > 300)
    p.locator('#cnsSaveBtn').click(); p.wait_for_function("getComputedStyle(document.getElementById('consentModal')).display === 'none'")
    r = db.rows('consent_templates')
    ok('tx: الحفظُ يكتب صفَّ العيادة بمفتاح العلاج', len(r) == 1 and r[0]['owner_id'] == UID and r[0]['treatment_key'] == 'extracted' and len(r[0]['body']) > 300, r)
    ok('tx: البطاقة تحمل شارةَ الموافقة', p.evaluate("(function(){var b=document.querySelector('[onclick*=\"openConsentModal(\\'t11\\')\"]');var c=b.closest('details').parentElement.parentElement;return /موافقة/.test(c.innerText.replace('✍️ الموافقة',''));})()"))
    p.evaluate("openConsentModal('t11')"); p.wait_for_timeout(300)
    ok('tx: إعادةُ الفتح تُظهره مفعَّلاً بالنص المحفوظ', p.evaluate("document.getElementById('cnsOn').checked"))
    p.locator('#consentModal .lab-toggle-switch').click(); p.locator('#cnsSaveBtn').click(); p.wait_for_function("getComputedStyle(document.getElementById('consentModal')).display === 'none'")
    ok('tx: الإيقافُ يحذف صفَّ العيادة', len(db.rows('consent_templates')) == 0)
    ok('tx: صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

def next_sunday():
    d = datetime.date.today() + datetime.timedelta(days=3)
    while d.weekday() != 6: d += datetime.timedelta(days=1)
    return d
def s_appt(b):
    sun = next_sunday(); SUN = sun.isoformat(); TUE = (sun + datetime.timedelta(days=2)).isoformat()
    db = base_db()
    db.t['clinic_doctors'].append({'id': 'D1', 'owner_id': UID, 'name': 'د. سامر الأحمد', 'is_owner': False, 'is_active': True, 'provider_type': 'doctor', 'share_percent': 40, 'color': '#7c3aed'})
    db.t['clinic_employees'] = [{'id': 'E1', 'owner_id': UID, 'name': 'د. سامر الأحمد', 'role': 'doctor', 'doctor_id': 'D1', 'is_active': True, 'work_schedule': {'0': ['09:00', '14:00'], '1': ['09:00', '14:00']}}]
    db.t['patient_consents'] = [{'id': 'C1', 'owner_id': UID, 'patient_id': 'P1', 'treatment_key': 'extracted', 'title': 'x', 'body': 'x', 'session_ids': ['S1'], 'auto': True, 'status': 'pending', 'created_at': '2026-11-21T10:00:00Z'}]
    ctx, p, errs = new_page(b, db)
    p.goto(BASE + 'appointments.html', wait_until='domcontentloaded')
    p.wait_for_function("typeof openModal === 'function' && !!document.getElementById('fProvider') && typeof patientsCache !== 'undefined'", timeout=30000); p.wait_for_timeout(1500)
    def fill(t, d):
        p.evaluate("openModal()"); p.wait_for_timeout(450)
        p.fill('#fPatient', 'سامر'); p.wait_for_timeout(350)
        p.locator('#fpSuggest div').first.dispatch_event('pointerdown'); p.wait_for_timeout(500)
        p.evaluate("(function(d,t){var a=document.getElementById('fDate');a.value=d;a.dispatchEvent(new Event('change',{bubbles:true}));var b=document.getElementById('fTime');b.value=t;b.dispatchEvent(new Event('change',{bubbles:true}));var c=document.getElementById('fProvider');c.value='D1';c.dispatchEvent(new Event('change',{bubbles:true}));})('%s','%s')" % (d, t)); p.wait_for_timeout(250)
    saved = lambda n: [bd for t, m, bd, q in db.writes[n:] if t == 'appointments' and m == 'POST']
    fill('10:00', SUN)
    h = p.evaluate("(function(){var e=document.getElementById('fPatientConsentHint');return getComputedStyle(e).display+'::'+e.textContent;})()")
    ok('appt: تلميحُ الموافقة المعلَّقة تحت المريض', h.startswith('block') and 'بانتظار توقيعه' in h, h)
    n = len(db.writes); p.locator('#saveBtn').click(); until(p, lambda: len(saved(n)) == 1); p.wait_for_timeout(400)
    ok('appt: داخل دوام الطبيب يُحفظ بلا حوار', not dlg(p) and len(saved(n)) == 1)
    p.evaluate("typeof closeModal==='function'&&closeModal()"); p.wait_for_timeout(250)
    fill('15:00', SUN); n = len(db.writes); p.locator('#saveBtn').click(); shown = wait_dialog(p)
    d = dlg(p) or {'text': ''}
    ok('appt: خارج دوامه يظهر التنبيهُ باسمه وساعاته ولا يُكتب شيء قبل الجواب', shown and 'خارج دوام الطبيب' in d['text'] and 'د. سامر الأحمد' in d['text'] and '09:00' in d['text'] and 'الحجز رغم التعارض' in d['text'] and not saved(n), d['text'])
    if shown:
        p.locator('.sy-dialog .btn-sy-cancel').click(); p.wait_for_selector('.sy-dialog', state='detached'); p.wait_for_timeout(500)
        ok('appt: «إلغاء» لا يحجز', not saved(n))
        p.locator('#saveBtn').click(); wait_dialog(p); p.locator('.sy-dialog .btn-sy-ok').click(); until(p, lambda: len(saved(n)) == 1)
        s2 = saved(n)
        ok('appt: «الحجز رغم التعارض» يحجز (تنبيهٌ لا منع)', len(s2) == 1 and (s2[0][0] if isinstance(s2[0], list) else s2[0]).get('time', '').startswith('15:00'), s2)
    p.evaluate("typeof closeModal==='function'&&closeModal()"); p.wait_for_timeout(250)
    fill('10:00', TUE); p.locator('#saveBtn').click(); shown = wait_dialog(p)
    ok('appt: يومُ عطلته يُسمّى', shown and 'يوم عطلة د. سامر الأحمد' in (dlg(p) or {'text': ''})['text'])
    ok('appt: صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

def s_emp(b, w=1366, h=768):
    T = 'emp[%d]' % w
    F1 = (datetime.date.today() + datetime.timedelta(days=10)).isoformat(); F2 = (datetime.date.today() + datetime.timedelta(days=12)).isoformat()
    db = base_db()
    db.t['clinic_doctors'].append({'id': 'D1', 'owner_id': UID, 'name': 'د. سامر الأحمد', 'is_owner': False, 'is_active': True, 'provider_type': 'doctor', 'share_percent': 40, 'color': '#7c3aed'})
    db.t['clinic_employees'] = [
      {'id': 'E0', 'owner_id': UID, 'name': 'د. أيهم', 'role': 'owner', 'doctor_id': None, 'is_active': True, 'has_system_access': True, 'sort_order': 0, 'work_schedule': None, 'annual_leave_days': None},
      {'id': 'E1', 'owner_id': UID, 'name': 'د. سامر الأحمد', 'role': 'doctor', 'doctor_id': 'D1', 'is_active': True, 'has_system_access': True, 'provider_type': 'doctor', 'sort_order': 1, 'work_schedule': None, 'annual_leave_days': None},
      {'id': 'E2', 'owner_id': UID, 'name': 'ريم', 'role': 'secretary', 'doctor_id': None, 'is_active': True, 'has_system_access': True, 'provider_type': 'secretary', 'sort_order': 2, 'work_schedule': None, 'annual_leave_days': 14}]
    db.t['appointments'] = [{'id': 'A1', 'doctor_id': UID, 'patient_id': 'P1', 'patient_name': 'سامر خليل', 'date': F1, 'time': '10:00', 'duration': 30, 'status': 'confirmed', 'is_planned': False, 'provider_id': 'D1'}]
    ctx, p, errs = new_page(b, db, w, h)
    p.goto(BASE + 'employees.html', wait_until='domcontentloaded'); p.wait_for_function("document.querySelectorAll('.emp-card').length >= 3", timeout=30000); toasts_on(p)
    box = p.evaluate("[].every.call(document.querySelectorAll('.emp-card .sy-act'),function(b){var r=b.getBoundingClientRect(),c=b.closest('.emp-card').getBoundingClientRect();return r.width>0&&r.left>=c.left-1&&r.right<=c.right+1&&r.bottom<=c.bottom+1;})")
    ok(T + ': زرُّ «الدوام والإجازات» على كل بطاقة، وكلُّ الأزرار (والحذف) داخل بطاقاتها', p.evaluate("document.querySelectorAll('[onclick*=\"openStaffTime(\"]').length") == 3 and box and not p.evaluate("document.documentElement.scrollWidth>innerWidth"))
    p.locator('[onclick*="openStaffTime(\'E1\')"]').click(); p.wait_for_function("getComputedStyle(document.getElementById('staffTimeModal')).display !== 'none'")
    ok(T + ': الزرُّ يفتح نافذتَه وحدها (لا نموذجَ التعديل)', p.evaluate("getComputedStyle(document.getElementById('empModal')).display") == 'none' and 'سامر' in p.evaluate("document.getElementById('stTitle').textContent"))
    p.locator('#stCustom').check()
    for dn in (0, 1, 2): p.locator('#stOn_%d' % dn).check()
    p.evaluate("document.getElementById('stFrom_0').value='10:00';document.getElementById('stTo_0').value='14:00';")
    p.locator('#stSaveHours').click(); p.wait_for_function("window.__toasts.length > 0")
    e1 = next(e for e in db.rows('clinic_employees') if e['id'] == 'E1')
    ok(T + ': حفظُ الدوام يكتب الخريطةَ على صفّ الموظف وحده', e1['work_schedule'] == {'0': ['10:00', '14:00'], '1': ['09:00', '17:00'], '2': ['09:00', '17:00']} and all(e['work_schedule'] is None for e in db.rows('clinic_employees') if e['id'] != 'E1'), e1['work_schedule'])
    p.locator('#stTab_leaves').click()
    p.evaluate("(function(a,b){document.getElementById('stLKind').value='paid';document.getElementById('stLFrom').value=a;document.getElementById('stLTo').value=b;document.getElementById('stLNote').value='سفر';})('%s','%s')" % (F1, F2))
    p.locator('#stAddLeave').click(); p.wait_for_function("window.__toasts.length > 1")
    bl = db.rows('schedule_blocks'); lv = db.rows('staff_leaves')
    ok(T + ': إجازةُ الطبيب تُنشئ حجزاً مغلقاً باسمه لأيامها', len(bl) == 1 and bl[0]['provider_id'] == 'D1' and bl[0]['kind'] == 'leave' and bl[0]['doctor_id'] == UID and bl[0]['date_from'] == F1 and bl[0]['date_to'] == F2 and bl[0]['blocks_scheduling'] is True, bl)
    ok(T + ': …وسجلَّ إجازةٍ مربوطاً به', len(lv) == 1 and lv[0]['employee_id'] == 'E1' and lv[0]['owner_id'] == UID and lv[0]['block_id'] == bl[0]['id'] if bl else False, lv)
    ok(T + ': …وتُعلن مواعيدَه ضمنها', '1 موعد ضمنها' in p.evaluate("window.__toasts[window.__toasts.length-1]"), p.evaluate("window.__toasts"))
    ok(T + ': زرُّ حذف الإجازة ظاهرٌ داخل صفّه', p.evaluate("(function(){var d=document.querySelector('#stLeaves .sy-act-danger');if(!d)return false;d.scrollIntoView({block:'center'});var r=d.getBoundingClientRect(),c=d.closest('.st-leave').getBoundingClientRect(),m=document.querySelector('#staffTimeModal .modal-box').getBoundingClientRect();return r.width>0&&r.left>=m.left-1&&r.right<=m.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1;})()"))
    p.locator('#stLeaves .sy-act-danger').click(); wait_dialog(p); p.locator('.sy-dialog .btn-sy-ok').click(); p.wait_for_function("window.__toasts.length > 2")
    ok(T + ': حذفُها يزيل الإجازةَ وحجزَها', not db.rows('staff_leaves') and not db.rows('schedule_blocks'))
    p.evaluate("closeStaffTime()")
    p.locator('[onclick*="openStaffTime(\'E0\')"]').click(); p.wait_for_function("getComputedStyle(document.getElementById('staffTimeModal')).display !== 'none'")
    p.locator('#stTab_leaves').click()
    p.evaluate("(function(a){document.getElementById('stLKind').value='paid';document.getElementById('stLFrom').value=a;document.getElementById('stLTo').value=a;})('%s')" % F1)
    n = len(p.evaluate("window.__toasts")); p.locator('#stAddLeave').click(); p.wait_for_function("window.__toasts.length > %d" % n)
    bl = db.rows('schedule_blocks')
    ok(T + ': إجازةُ المالك (بلا ربط طبيب) تُغلق تقويمَ طبيب المالك', len(bl) == 1 and bl[0]['provider_id'] == 'D0', bl)
    ok(T + ': صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

def s_pay(b, w=1366, h=768):
    T = 'pay[%d]' % w
    db = base_db()
    db.t['clinic_employees'] = [
      {'id': 'E2', 'owner_id': UID, 'name': 'ريم', 'role': 'secretary', 'doctor_id': None, 'is_active': True, 'provider_type': 'secretary', 'sort_order': 2, 'compensation_model': 'salary', 'monthly_salary': 2600000, 'salary_currency': 'SYP', 'work_schedule': None},
      {'id': 'E3', 'owner_id': UID, 'name': 'منى', 'role': 'secretary', 'doctor_id': None, 'is_active': True, 'provider_type': 'other', 'sort_order': 3, 'compensation_model': 'salary', 'monthly_salary': 1000000, 'salary_currency': 'SYP', 'work_schedule': None}]
    db.t['staff_leaves'] = [
      {'id': 'L1', 'owner_id': UID, 'employee_id': 'E2', 'kind': 'unpaid', 'date_from': '2026-11-03', 'date_to': '2026-11-05'},
      {'id': 'L2', 'owner_id': UID, 'employee_id': 'E2', 'kind': 'absence', 'date_from': '2026-11-30', 'date_to': '2026-11-30'},
      {'id': 'L3', 'owner_id': UID, 'employee_id': 'E2', 'kind': 'paid', 'date_from': '2026-11-10', 'date_to': '2026-11-11'}]
    ctx, p, errs = new_page(b, db, w, h)
    p.goto(BASE + 'payouts.html', wait_until='domcontentloaded'); p.wait_for_function("typeof openModal === 'function' && typeof doctors !== 'undefined' && doctors.length >= 2", timeout=30000); p.wait_for_timeout(500)
    def pick(emp):
        p.evaluate("openModal()"); p.wait_for_timeout(400)
        p.evaluate("(function(v){var s=document.getElementById('fldProvider');s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));var a=document.getElementById('fldPeriodStart'),b=document.getElementById('fldPeriodEnd');a.value='2026-11-01';b.value='2026-11-30';a.dispatchEvent(new Event('change',{bubbles:true}));b.dispatchEvent(new Event('change',{bubbles:true}));})('%s')" % emp); p.wait_for_timeout(350)
    pick('E2')
    line = p.evaluate("(function(){var e=document.getElementById('hintLeave');var r=e.getBoundingClientRect(),m=document.querySelector('#modalOverlay .modal').getBoundingClientRect();return {d:getComputedStyle(e).display,t:e.textContent,inside:r.left>=m.left-1&&r.right<=m.right+1};})()")
    ok(T + ': السطرُ يعدّ الأيام ويقترح 4/26 من الراتب، داخل النافذة', line['d'] == 'block' and 'غياب 1' in line['t'] and 'إجازة غير مدفوعة 3' in line['t'] and '400,000' in line['t'] and '4 من 26' in line['t'] and line['inside'], line)
    ok(T + ': لا يُخصم شيء قبل الضغط', p.evaluate("document.getElementById('fldAmount').value + '|' + document.getElementById('fldSalary').value + '|' + document.getElementById('fldNotes').value") == '||')
    p.locator('#hintSuggest').click(); p.wait_for_timeout(200); p.locator('#hintLeave').click(); p.wait_for_timeout(250); p.locator('#hintLeave').click(); p.wait_for_timeout(200)
    v = p.evaluate("[document.getElementById('fldAmount').value, document.getElementById('fldSalary').value, document.getElementById('fldNotes').value]")
    ok(T + ': الضغطُ يخصم مرةً واحدة ويكتب الملاحظة', v[0] == '2200000' and v[1] == '2200000' and v[2] == 'خصم غياب/إجازة غير مدفوعة: 4 أيام (−400,000 ل.س)', v)
    n = len(db.writes); p.evaluate("savePayout();0"); until(p, lambda: any(t == 'provider_payouts' for t, m, bd, q in db.writes[n:]))
    sv = [bd for t, m, bd, q in db.writes[n:] if t == 'provider_payouts']
    r = (sv[0][0] if isinstance(sv[0], list) else sv[0]) if sv else {}
    ok(T + ': الحفظُ يحمل المبلغَ بعد الخصم والملاحظةَ لموظفه', r.get('amount') == 2200000 and r.get('breakdown_salary') == 2200000 and r.get('employee_id') == 'E2' and 'خصم غياب' in (r.get('notes') or ''), r)
    pick('E3')
    ok(T + ': موظفٌ بلا إجازات لا سطرَ له', p.evaluate("getComputedStyle(document.getElementById('hintLeave')).display") == 'none')
    ok(T + ': صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

def s_dash(b):
    TODAY = time.strftime('%Y-%m-%d'); db = base_db()
    db.t['patients'].append({'id': 'P2', 'doctor_id': UID, 'name': 'ليلى حسن', 'phone': '0933000002', 'gender': 'أنثى', 'created_at': '2026-11-01T10:00:00Z'})
    db.t['appointments'] = [
      {'id': 'A1', 'doctor_id': UID, 'patient_id': 'P1', 'patient_name': 'سامر خليل', 'date': TODAY, 'time': '10:00', 'duration': 30, 'status': 'confirmed', 'is_planned': False, 'provider_id': 'D0', 'type': 'قلع'},
      {'id': 'A2', 'doctor_id': UID, 'patient_id': 'P2', 'patient_name': 'ليلى حسن', 'date': TODAY, 'time': '11:00', 'duration': 30, 'status': 'confirmed', 'is_planned': False, 'provider_id': 'D0', 'type': 'فحص'}]
    db.t['patient_consents'] = [{'id': 'C1', 'owner_id': UID, 'patient_id': 'P1', 'treatment_key': 'extracted', 'title': 'x', 'body': 'x', 'session_ids': ['S1'], 'auto': True, 'status': 'pending', 'created_at': '2026-11-21T10:00:00Z'},
      {'id': 'C2', 'owner_id': UID, 'patient_id': 'P2', 'treatment_key': 'extracted', 'title': 'x', 'body': 'x', 'session_ids': ['S2'], 'auto': True, 'status': 'signed', 'created_at': '2026-11-21T10:00:00Z'}]
    ctx, p, errs = new_page(b, db)
    p.goto(BASE + 'index.html', wait_until='domcontentloaded')
    try: p.wait_for_function("[].some.call(document.querySelectorAll('.pt-flag'),function(e){return /موافقة بانتظار التوقيع/.test(e.textContent);})", timeout=30000); got = True
    except Exception: got = False
    chips = p.evaluate("[].map.call(document.querySelectorAll('.pt-flag'),function(e){var row=e.closest('[data-appt-id], .appt-item, li, tr')||e.parentElement.parentElement;return (/موافقة بانتظار/.test(e.textContent)?'C:':'-:')+row.innerText.replace(/\\n+/g,' ').slice(0,40);}).filter(function(x){return x[0]==='C';})")
    ok('dash: شارةُ «موافقة بانتظار التوقيع» على موعد صاحبها وحده', got and len(chips) == 1 and 'سامر' in chips[0], chips)
    ok('dash: صفرُ خطأ JS', not errs, errs[:2]); ctx.close()

SCEN = {'card': s_card, 'open': s_open, 'tx': s_tx, 'appt': s_appt, 'emp': s_emp, 'pay': s_pay, 'dash': s_dash}
MUTANTS = [
  ('الحوارُ لا يظهر عند تخطيط العلاج', 'card', 'pp-consent.js', "  if (fresh.length) ppConsentAsk(fresh);\n", ""),
  ('البطاقةُ لا تزامن عند تغيّر الخطة', 'card', 'pp-timeline.js', "ppConsentTouch()", "void 0"),
  ('المنجزُ مباشرةً بلا تنبيه', 'card', 'pp-consent.js', "  ppConsentWarnDone();\n  ppConsentWarnBare();", "  ppConsentWarnDone();"),
  ('«توقيع على هذا الجهاز» بلا معرّف الموافقة', 'card', 'pp-consent.js', "? '&c=' + id : '');", "? '' : '');"),
  ('البوابةُ تتجاهل معرّفَ الموافقة', 'card', 'portal.html', "if (want && want.status === 'pending') openConsent(want.id); }", "}"),
  ('«التوقيع الآن» من الحوار لا يفتح شيئاً', 'card', 'pp-consent.js', "  if (pick === 0) ppConsentSignHere(list[0].id);", "  if (pick === 0) void 0;"),
  ('الإشعارُ يغطّي زرَّ «لاحقاً» على الهاتف', 'card390', 'pp-consent.js', "if (tst) tst.classList.remove('show');", "void 0;"),
  ('حوارٌ عند فتح البطاقة', 'open', 'pp-consent.js', "      if (first) PP_CONSENTS.forEach(function (c) { _ppConsentAsked[c.id] = true; });   /* ما وُجد عند الفتح يعرضه الصفُّ بلا حوار */\n      else fresh = PP_CONSENTS.filter(", "      fresh = PP_CONSENTS.filter("),
  ('نصُّ الموافقة يُحفظ لعلاجٍ آخر', 'tx', 'tx-consent.js', "{ owner_id: uid, treatment_key: key, title: title, body: body }", "{ owner_id: uid, treatment_key: 'x', title: title, body: body }"),
  ('الحجزُ خارج الدوام بلا تنبيه', 'appt', 'sched-blocks.js', "  async function offHours(doctorId, from, to) {", "  async function offHours(doctorId, from, to) { return [];"),
  ('تلميحُ الموافقة غائبٌ عن نافذة الموعد', 'appt', 'appointments.html', '<script src="consent-pending.js', '<script src="consent-pending-x.js'),
  ('إجازةُ الطبيب لا تُغلق تقويمَه', 'emp', 'emp-time.js', "if (S.providerId && to >= today) {", "if (false) {"),
  ('إجازةُ المالك لا تُغلق تقويمَه', 'emp', 'emp-time.js', "if (!S.providerId && S.emp.role === 'owner') {", "if (false) {"),
  ('سطرُ الخصم غائب', 'pay', 'payouts.html', "  _updateSuggestionCore();\n  updateLeaveHint();", "  _updateSuggestionCore();"),
  ('خصمٌ صامت', 'pay', 'payouts.html', "  el.textContent = txt;\n  el.style.display = 'block';\n}", "  el.textContent = txt;\n  el.style.display = 'block';\n  if (r.amount > 0) { $('fldSalary').value = 1; }\n}"),
  ('شارةُ اللوحة غائبة', 'dash', 'huddle-flags.js', "if (e.consent)", "if (false)"),
]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    if not SELF:
        only = [a for a in sys.argv[1:] if a in SCEN]
        for name in (only or list(SCEN)):
            try: SCEN[name](b)
            except Exception as e: ok(name + ': السيناريو أكمل بلا استثناء', False, repr(e)[:300])
        if not only:
            for name in ('card', 'emp', 'pay'):   # الهاتف
                try: SCEN[name](b, 390, 844)
                except Exception as e: ok(name + '[390]: السيناريو أكمل بلا استثناء', False, repr(e)[:300])
        b.close()
        for f in FAILS: print('FAIL', f)
        print(('✅' if not FAILS else '❌') + ' مثبت المسارات على الصفحات الحقيقية: ' + str(N[0] - len(FAILS)) + '/' + str(N[0]))
        sys.exit(0 if not FAILS else 1)
    bit = 0
    only = [a for a in sys.argv[1:] if a in SCEN or a == 'card390']
    if only: MUTANTS = [m for m in MUTANTS if m[1] in only]
    dead = [t for t, sc, f, a, r in MUTANTS if a not in open(os.path.join(ROOT, f), encoding='utf-8').read()]
    if dead:   # مرساةٌ اختفت من الملف = طفرةٌ ميتة؛ لا تُحسب «عضّت» باستثناء
        for t in dead: print('  ✗ طفرةٌ بلا مرساة:', t)
        print('❌ مثبت المسارات على الصفحات الحقيقية: %d طفرة بلا مرساة' % len(dead)); sys.exit(1)
    for title, scen, fname, a, r in MUTANTS:
        MUT.clear(); MUT[fname] = (a, r); FAILS.clear(); N[0] = 0
        try:
            if scen == 'card390': s_card(b, 390, 844)
            else: SCEN[scen](b)
        except Exception as e: FAILS.append('exception ' + repr(e)[:120])
        if FAILS: bit += 1
        else: print('  ✗ طفرةٌ لم تعضّ:', title)
    b.close()
    print(('✅' if bit == len(MUTANTS) else '❌') + ' مثبت المسارات على الصفحات الحقيقية: %d/%d طفرات تعضّ' % (bit, len(MUTANTS)))
    sys.exit(0 if bit == len(MUTANTS) else 1)

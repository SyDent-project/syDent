# -*- coding: utf-8 -*-
# v441 — مثبت DOM الحيّ لنوافذ صفحة المرضى (الأربع الساكنة + محرّر الرسالة المبنيّ
# بالجافاسكربت). يفحص الملفات الحيّة نصّياً أولاً (درس v439) ثم بمتصفحٍ حقيقي.
import os, sys, re, glob, subprocess
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت نوافذ المرضى'); sys.exit(0)
subprocess.run(['node', os.path.join(ROOT, 'scripts/dom-smoke/patients/build-harness.js')], check=True)
os.chdir(ROOT)
fails = []
def ok(n, c):
    print(('PASS ' if c else 'FAIL ') + n)
    if not c: fails.append(n)

src = open(os.path.join(ROOT, 'patients.html'), encoding='utf-8').read()
# ١) لا سلك إغلاقٍ بنقرةٍ خارجية لنافذةٍ فيها بيانات — سمةً أو مستمعاً أو مقارنةَ هدف
for mid in ['modalOverlay', 'importModal']:
    inline = re.search(r'id="' + mid + r'"[^>]*onclick="[^"]*target\s*===?\s*this', src)
    listen = re.search(r"getElementById\(\s*'" + mid + r"'\s*\)\.addEventListener\(\s*'click'", src)
    ok('%s: لا إغلاق بنقرةٍ خارجية بالملف الحيّ' % mid, not inline and not listen)
ok('handleOverlayClick: الدالة القديمة محذوفة بالكامل (لا سلك نائم)',
   'function handleOverlayClick' not in src)
ok('prmAiOverlay: لا إغلاق بنقرةٍ خارجية (كان e.target === ov)', 'e.target === ov' not in src)
ok('prmAiOverlay: على العُدّة ويُربط سلوكه بعد البناء', "ov.className = 'modal-overlay sy-m" in src and 'SyModal.scan()' in src)
# ٢) بوابةُ الذكاء الاصطناعي: صفُّ الصياغة لا يُبنى إلا ببوابة العيادة + الخطة
ok('AI: PRM_AI_ON يبدأ false وصفُّ الصياغة خلف البوابتين',
   'var PRM_AI_ON = false;' in src and 'if (aiOn && PRM_AI_ON) {' in src
   and "if (window.SyDentPlan.can('ai_features') === false) PRM_AI_ON = false;" in src)
_gate = src.find('if (aiOn && PRM_AI_ON) {')
_lbl = src.find('aiLbl.textContent')
ok('AI: لا عنوانَ ولا تلميحَ ذكاءٍ خارج الصف المحكوم',
   _gate > -1 and _lbl > _gate and src.count('aiLbl.textContent') == 1)

base = 'file://' + os.getcwd() + '/_ph/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 820}); hermetic_fonts(pg)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + 'pat_light.html'); pg.wait_for_timeout(300)
    for i in ['modalOverlay', 'importModal', 'srcModal', 'prmModal']:
        pg.evaluate(f"document.getElementById('{i}').classList.add('open')"); pg.wait_for_timeout(250)
        r = pg.evaluate("""(id)=>{const ov=document.getElementById(id);const box=ov.querySelector('.modal');
          const h=ov.querySelector('.modal-header').getBoundingClientRect();const bd=ov.querySelector('.modal-body');
          const ft=ov.querySelector('.modal-footer');const f=ft?ft.getBoundingClientRect():null;const br=box.getBoundingClientRect();
          return {head:h.top>=0&&h.bottom<=innerHeight, foot:f?f.bottom<=innerHeight+1:true, body:!!bd,
                  bodyScrolls:bd?getComputedStyle(bd).overflowY=='auto':false, boxFits:br.height<=innerHeight+1,
                  role:box.getAttribute('role'), aria:box.getAttribute('aria-modal'), lock:document.body.classList.contains('sy-modal-lock')}}""", i)
        ok(f'{i}: رأس/جسم/ذيل + الذيل ظاهر + aria + قفل التمرير',
           r['head'] and r['foot'] and r['body'] and r['bodyScrolls'] and r['boxFits'] and r['role'] == 'dialog' and r['aria'] == 'true' and r['lock'])
        pg.evaluate(f"document.getElementById('{i}').classList.remove('open')"); pg.wait_for_timeout(120)
    # سلوك النقر خارج النافذة
    for i, should in [('modalOverlay', False), ('importModal', False), ('srcModal', True), ('prmModal', True)]:
        pg.evaluate(f"document.getElementById('{i}').classList.add('open')"); pg.wait_for_timeout(200)
        pg.mouse.click(12, 12); pg.wait_for_timeout(200)
        closed = not pg.evaluate(f"document.getElementById('{i}').classList.contains('open')")
        ok(f'{i}: النقر خارجه {"يغلق (قراءة)" if should else "لا يغلق (فيه بيانات)"}', closed == should)
        pg.evaluate(f"document.getElementById('{i}').classList.remove('open')"); pg.wait_for_timeout(100)
    # ما كُتب بنموذج المريض لا يضيع
    pg.evaluate("document.getElementById('modalOverlay').classList.add('open')"); pg.wait_for_timeout(200)
    pg.fill('#fName', 'مريض تجريبي'); pg.mouse.click(12, 12); pg.wait_for_timeout(200)
    ok('نموذج المريض: ما كُتب لا يضيع بنقرةٍ خارجية',
       pg.evaluate("document.getElementById('fName').value=='مريض تجريبي' && document.getElementById('modalOverlay').classList.contains('open')"))
    pg.evaluate("log=[]"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('نموذج المريض: Escape يغلق عبر دالة الصفحة', pg.evaluate("log.join()=='modalOverlay'"))
    # محرّر الرسالة المبنيّ بالجافاسكربت
    pg.evaluate("prmAiOpenPreview('رسالة', 'نصٌّ افتراضي', false)"); pg.wait_for_timeout(300)
    r = pg.evaluate("""(()=>{const ov=document.getElementById('prmAiOverlay');const box=ov.querySelector('.modal-box');
      return {open:ov.classList.contains('open'), kit:ov.classList.contains('sy-m'), head:!!ov.querySelector('.modal-head'),
              body:!!ov.querySelector('.modal-body'), foot:!!ov.querySelector('.modal-foot'), x:!!ov.querySelector('.modal-close'),
              role:box.getAttribute('role'), ai:!!document.getElementById('prmAiIntent')}})()""")
    ok('محرّر الرسالة: على العُدّة برأسٍ وجسمٍ وذيلٍ وزر ✕ وaria', r['open'] and r['kit'] and r['head'] and r['body'] and r['foot'] and r['x'] and r['role'] == 'dialog')
    ok('محرّر الرسالة: بطاقةُ المساعد لا تُبنى والبوابة مغلقة (لا عنوان ولا فراغ)',
       not r['ai'] and pg.evaluate("!document.querySelector('#prmAiOverlay .wa-ai-card')"))
    # الشكلُ المعياري: نفسُ طقم «الرسالة الحرة» — سطرُ المريض · قسمُ النص بعدّاد · تلميحُ المراجعة
    st = pg.evaluate("""(()=>{const o=document.getElementById('prmAiOverlay');return {
      info:!!o.querySelector('.wa-info-row'), sec:!!o.querySelector('.wa-msg-sec'),
      cnt:(o.querySelector('.wa-count')||{}).textContent||'', hint:!!o.querySelector('.wa-hint'),
      msg:!!o.querySelector('textarea.wa-modal-message'), send:!!o.querySelector('.wa-send-btn'),
      foot:!!o.querySelector('.modal-foot')}})()""")
    ok('محرّر الرسالة: الشكلُ المعياري (سطرُ المريض · قسمُ النص · عدّاد · تلميح · زرُّ واتساب)',
       st['sec'] and st['msg'] and st['hint'] and st['send'] and st['foot'] and 'حرف' in st['cnt'])
    # البوابةُ مفتوحة ⇒ بطاقةُ المساعد بشكل الرسالة الحرة حرفياً
    pg.evaluate("prmAiClose(); PRM_AI_ON=true; _prmAiCur={patient:{name:'مريض',phone:'0900000000'}}; prmAiOpenPreview('ع','نص',true)")
    pg.wait_for_timeout(250)
    card = pg.evaluate("""(()=>{const o=document.getElementById('prmAiOverlay');const c=o.querySelector('.wa-ai-card');
      return {card:!!c, head:!!(c&&c.querySelector('.wa-ai-head')), lbl:!!(c&&c.querySelector('.wa-sec-label')),
              field:!!(c&&c.querySelector('textarea.wa-field')), btn:!!(c&&c.querySelector('.wa-ai-btn')),
              info:!!o.querySelector('.wa-info-row'), order:!!(o.querySelector('.wa-ai-card')&&o.querySelector('.wa-msg-sec')&&
                (o.querySelector('.wa-ai-card').compareDocumentPosition(o.querySelector('.wa-msg-sec'))&4))}})()""")
    ok('محرّر الرسالة: بطاقةُ المساعد بشكل الرسالة الحرة (رأس · عنوان · حقل · زرٌّ كامل العرض) وفوق النص',
       all(card.values()))
    pg.evaluate("prmAiClose()"); pg.wait_for_timeout(120)
    pg.evaluate("PRM_AI_ON=false; _prmAiCur=null; prmAiOpenPreview('رسالة','نصٌّ افتراضي',false)"); pg.wait_for_timeout(200)
    pg.fill('#prmAiText', 'مسودّة الطبيب'); pg.mouse.click(6, 6); pg.wait_for_timeout(200)
    ok('محرّر الرسالة: المسودّة لا تضيع بنقرةٍ خارجية',
       pg.evaluate("!!document.getElementById('prmAiText') && document.getElementById('prmAiText').value=='مسودّة الطبيب'"))
    pg.evaluate("log=[]"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('محرّر الرسالة: Escape يغلقه عبر دالة الصفحة', pg.evaluate("log.join()=='prmAiOverlay' && !document.getElementById('prmAiOverlay')"))
    ok('صفر خطأ JS', not errs)
    m = b.new_page(viewport={'width': 390, 'height': 844}); hermetic_fonts(m); m.goto(base + 'pat_light.html')
    m.evaluate("document.getElementById('modalOverlay').classList.add('open')"); m.wait_for_timeout(350)
    r = m.evaluate("""(()=>{const ov=document.getElementById('modalOverlay');const box=ov.querySelector('.modal').getBoundingClientRect();
      const f=ov.querySelector('.modal-footer').getBoundingClientRect();return {w:Math.round(box.width),bottom:Math.round(box.bottom),foot:f.bottom<=innerHeight+1}})()""")
    ok('الموبايل: ورقة سفلية بعرض الشاشة وزرُّ الحفظ ظاهر', r['w'] == 390 and r['bottom'] == 844 and r['foot'])
    b.close()
import shutil; shutil.rmtree(os.path.join(ROOT, '_ph'), ignore_errors=True)
print('🧩 مثبت نوافذ المرضى:', ('⛔ ' + str(len(fails)) + ' فشل') if fails else '✅ كل التوكيدات خضر')
sys.exit(1 if fails else 0)

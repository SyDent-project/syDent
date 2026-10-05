# -*- coding: utf-8 -*-
# v443 — مثبت DOM الحيّ لنوافذ بطاقة المريض (34 نافذة). يفحص الملفات الحيّة نصّياً
# (درس v439) ثم يفتح كلَّ نافذةٍ بمتصفحٍ حقيقي ويتحقّق من البنية والسلوك.
import os, sys, re, glob, subprocess
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت نوافذ بطاقة المريض'); sys.exit(0)
subprocess.run(['node', os.path.join(ROOT, 'scripts/dom-smoke/patient-profile/build-harness.js')], check=True)
os.chdir(ROOT)
fails = []
def ok(n, c):
    print(('PASS ' if c else 'FAIL ') + n)
    if not c: fails.append(n)

READ_ONLY = {'pfLightbox', 'printChoiceModal'}     # لا بيانات ⇒ يجوز الإغلاق بنقرةٍ خارجية
src = open(os.path.join(ROOT, 'patient-profile.html'), encoding='utf-8').read()
js = src
for f in sorted(glob.glob(os.path.join(ROOT, 'pp-*.js'))):
    js += open(f, encoding='utf-8').read()
ids = re.findall(r'<div class="modal-overlay[^"]*" id="([^"]+)"', src)
ok('الجرد: 34 نافذة وكلُّها على العُدّة (sy-m)',
   len(ids) == 34 and len(re.findall(r'class="modal-overlay[^"]*\bsy-m\b', src)) == 34)
bad = []
for mid in ids:
    if mid in READ_ONLY: continue
    if re.search(r'id="' + mid + r'"[^>]*onclick="[^"]*target\s*===?\s*this', src) or \
       re.search(r"getElementById\(\s*'" + mid + r"'\s*\)\.addEventListener\(\s*'click'", js):
        bad.append(mid)
ok('لا إغلاق بنقرةٍ خارجية لأي نافذةٍ فيها بيانات (html + pp-*.js)', not bad)
ok('لا حلقةً تُلبس كلَّ النوافذ إغلاقاً بنقرةٍ خارجية (درس v448)',
   not re.search(r"querySelectorAll\(\s*'\.modal-overlay'\s*\)[\s\S]{0,400}?addEventListener\(\s*'click'", js))
ok('نافذتا القراءة تحتفظان بالإغلاق بنقرةٍ خارجية',
   all(re.search(r'id="' + m + r'"[^>]*target\s*===?\s*this', src) for m in READ_ONLY))
# طقمُ المحرّر: الرسالة الحرة (المرجع) والتذكير يتبعانه
for mid, need in [('ppWaComposeModal', ['wa-ai-card', 'wa-msg-sec', 'wa-count', 'wa-tpl-row', 'wa-hint']),
                  ('ppWaModal', ['wa-info-row', 'wa-msg-sec', 'wa-count', 'wa-hint'])]:
    a = src.index('id="' + mid + '"'); nxt = src.find('<div class="modal-overlay', a)
    seg = src[a:nxt if nxt > 0 else src.index('<script', a)]
    ok('%s: على طقم المحرّر المعياري' % mid, all(c in seg for c in need))
# بوابةُ الذكاء: كل سطح AI مخفيٌّ افتراضياً ويظهر بـbody.ai-on وحدها
css = open(os.path.join(ROOT, 'patient-profile.css'), encoding='utf-8').read()
ok('AI: أسطحُ الذكاء محكومةٌ بـbody.ai-on بالـCSS', css.count('body.ai-on') >= 3)
ok('AI: البوابةُ طبقتان (خطة + مفتاح العيادة)',
   'PP_AI_PLAN_OK' in js and "CLINIC_SETTINGS_WA.ai_features_enabled === true" in js)

base = 'file://' + os.getcwd() + '/_pp/'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900}); hermetic_fonts(pg)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + 'pp_light.html'); pg.wait_for_timeout(300)
    struct_bad, aria_bad, foot_bad = [], [], []
    for mid in ids:
        pg.evaluate("openModal('%s')" % mid); pg.wait_for_timeout(60)
        r = pg.evaluate("""(id)=>{const ov=document.getElementById(id);const box=ov.querySelector('.modal-box');
          const hd=ov.querySelector('.modal-head');const bd=ov.querySelector('.modal-body');const ft=ov.querySelector('.modal-foot');
          const br=box.getBoundingClientRect();const h=hd?hd.getBoundingClientRect():null;
          return {box:!!box, head:!!hd, body:!!bd, headVis:h?(h.top>=-1&&h.bottom<=innerHeight+1):false,
                  fits:br.height<=innerHeight+1, footVis:ft?ft.getBoundingClientRect().bottom<=innerHeight+1:true,
                  scroll:bd?getComputedStyle(bd).overflowY=='auto':false,
                  role:box.getAttribute('role'), aria:box.getAttribute('aria-modal'), lock:document.body.classList.contains('sy-modal-lock')}}""", mid)
        if not (r['box'] and r['head'] and r['body'] and r['scroll'] and r['fits'] and r['headVis']): struct_bad.append(mid)
        if not (r['role'] == 'dialog' and r['aria'] == 'true' and r['lock']): aria_bad.append(mid)
        if not r['footVis']: foot_bad.append(mid)
        pg.evaluate("closeModal('%s')" % mid); pg.wait_for_timeout(40)
    ok('البنية: الأربعُ والثلاثون برأسٍ وجسمٍ يتمرّر وصندوقٍ داخل الشاشة' + (' — كسر: ' + '، '.join(struct_bad) if struct_bad else ''), not struct_bad)
    ok('a11y: role=dialog + aria-modal + قفلُ تمرير الخلفية بالأربع والثلاثين' + (' — كسر: ' + '، '.join(aria_bad) if aria_bad else ''), not aria_bad)
    ok('الذيلُ ظاهرٌ بلا تمرير بكل نافذةٍ لها ذيل' + (' — كسر: ' + '، '.join(foot_bad) if foot_bad else ''), not foot_bad)
    # Escape يغلق الأعلى فقط عبر دالة الصفحة + التكديس يعطّل الأب
    pg.evaluate("log=[]; openModal('labOrderModal'); openModal('matDeductModal')"); pg.wait_for_timeout(250)
    ok('التكديس: الأبُ يتعطّل تحت الابن',
       pg.evaluate("getComputedStyle(document.querySelector('#labOrderModal .modal-box')).pointerEvents=='none'"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Escape يغلق الأعلى فقط عبر closeModal الصفحة',
       pg.evaluate("log.join()=='matDeductModal' && document.getElementById('labOrderModal').classList.contains('open')"))
    pg.evaluate("closeModal('labOrderModal')"); pg.wait_for_timeout(120)
    # ما كُتب لا يضيع بنقرةٍ خارجية
    pg.evaluate("openModal('sessionModal')"); pg.wait_for_timeout(200)
    ta = pg.evaluate("(()=>{const t=document.querySelector('#sessionModal textarea, #sessionModal input[type=text]');return t?t.id:''})()")
    if ta:
        pg.fill('#' + ta, 'نصٌّ مكتوب'); pg.mouse.click(8, 8); pg.wait_for_timeout(200)
        ok('مودال الجلسة: ما كُتب لا يضيع بنقرةٍ خارجية',
           pg.evaluate("document.getElementById('%s').value=='نصٌّ مكتوب' && document.getElementById('sessionModal').classList.contains('open')" % ta))
    else:
        ok('مودال الجلسة: حقلٌ نصّيٌّ للاختبار موجود', False)
    pg.evaluate("closeModal('sessionModal')"); pg.wait_for_timeout(100)
    # نافذةُ القراءة تُغلق بنقرةٍ خارجية
    pg.evaluate("openModal('pfLightbox')"); pg.wait_for_timeout(200)
    pg.mouse.click(8, 8); pg.wait_for_timeout(200)
    ok('معاينةُ الملف (قراءة): تُغلق بنقرةٍ خارجية', not pg.evaluate("document.getElementById('pfLightbox').classList.contains('open')"))
    # مودالُ التعليمات: الطقمُ المعياري يظهر فعلاً، والبوابةُ تُخفي بطاقةَ المساعد كلَّها
    pg.evaluate("document.body.classList.add('ai-on'); openModal('postOpModal')"); pg.wait_for_timeout(250)
    r = pg.evaluate("""(()=>{const o=document.getElementById('postOpModal');const c=o.querySelector('.wa-ai-card');
      const btn=c?c.querySelector('.wa-ai-btn'):null;const bw=btn?btn.getBoundingClientRect().width:0;
      const cw=c?c.getBoundingClientRect().width:1;
      return {card:!!c, vis:c?getComputedStyle(c).display!=='none':false, head:!!(c&&c.querySelector('.wa-ai-head')),
              full: bw/cw > 0.85, tpl:!!o.querySelector('.wa-tpl-row .wa-icon-btn'),
              sec:!!o.querySelector('.wa-msg-sec'), cnt:((o.querySelector('.wa-count')||{}).textContent||''),
              msg:!!o.querySelector('textarea.wa-modal-message'), hint:!!o.querySelector('.wa-hint')}})()""")
    ok('مودال التعليمات: الطقمُ المعياري ظاهرٌ بالمتصفح (بطاقةُ مساعدٍ بزرٍّ كامل العرض · صفُّ قوالبَ بأيقونة · قسمُ نصٍّ بعدّادٍ وتلميح)',
       r['card'] and r['vis'] and r['head'] and r['full'] and r['tpl'] and r['sec'] and r['msg'] and r['hint'] and 'حرف' in r['cnt'])
    pg.evaluate("document.body.classList.remove('ai-on')"); pg.wait_for_timeout(150)
    ok('مودال التعليمات: بطاقةُ المساعد تختفي كلياً عند تعطيل الذكاء (بلا عنوانٍ ولا فراغ)',
       pg.evaluate("getComputedStyle(document.getElementById('postOpAiRow')).display=='none'"))
    pg.evaluate("closeModal('postOpModal')"); pg.wait_for_timeout(100)
    # منتقي الوقت داخل نافذة: القائمةُ كاملةٌ داخل الجسم المتمرّر (زرُّ «تم» يُرى)
    pg.evaluate("""(()=>{const s=document.createElement('script');s.src='../timepicker.js';document.body.appendChild(s);})()""")
    pg.wait_for_timeout(500)
    pg.evaluate("openModal('apptModal')"); pg.wait_for_timeout(300)
    tp = pg.evaluate("""(()=>{const f=document.querySelector('#apptModal .tpw .tpw-field');if(!f) return {none:true};
      f.click(); return {ok:true}})()""")
    if tp.get('ok'):
        pg.wait_for_timeout(450)
        r = pg.evaluate("""(()=>{const pop=document.querySelector('#apptModal .tpw-pop');
          const pr=pop.getBoundingClientRect();const bd=document.querySelector('#apptModal .modal-body').getBoundingClientRect();
          return {clipped: pr.bottom>bd.bottom+1}})()""")
        ok('منتقي الوقت داخل النافذة: القائمةُ غيرُ مقصوصة (زرُّ «تم» يُرى)', not r['clipped'])
    else:
        ok('منتقي الوقت داخل النافذة: الحقلُ المرسوم موجود', False)
    pg.evaluate("closeModal('apptModal')"); pg.wait_for_timeout(100)
    ok('صفر خطأ JS', not errs)
    m = b.new_page(viewport={'width': 390, 'height': 844}); hermetic_fonts(m); m.goto(base + 'pp_light.html')
    m.evaluate("openModal('sessionModal')"); m.wait_for_timeout(350)
    r = m.evaluate("""(()=>{const ov=document.getElementById('sessionModal');const r=ov.querySelector('.modal-box').getBoundingClientRect();
      const f=ov.querySelector('.modal-foot');return {w:Math.round(r.width),bottom:Math.round(r.bottom),foot:f?f.getBoundingClientRect().bottom<=innerHeight+1:true}})()""")
    ok('الموبايل: ورقة سفلية بعرض الشاشة وزرُّ الحفظ ظاهر', r['w'] == 390 and r['bottom'] == 844 and r['foot'])
    m.evaluate("closeModal('sessionModal'); document.body.classList.add('ai-on')"); m.wait_for_timeout(100)
    small = []
    for mid in ids:
        m.evaluate("openModal('%s')" % mid); m.wait_for_timeout(90)
        n = m.evaluate("""(id)=>[...document.getElementById(id).querySelectorAll('button')]
          .filter(el=>{const h=el.offsetHeight;return h>0&&h<34}).length""", mid)   # v470: offsetHeight — ارتفاعُ التخطيط لا يتأثّر بحركة ظهور النافذة (scale) فلا يرفّ التوكيد
        if n: small.append(mid)
        m.evaluate("closeModal('%s')" % mid); m.wait_for_timeout(30)
    ok('الموبايل: لا زرَّ أصغر من هدف لمسٍ مقبول بأي نافذة' + (' — ' + '، '.join(small) if small else ''), not small)
    b.close()
import shutil; shutil.rmtree(os.path.join(ROOT, '_pp'), ignore_errors=True)
print('🧩 مثبت نوافذ بطاقة المريض:', ('⛔ ' + str(len(fails)) + ' فشل') if fails else '✅ كل التوكيدات خضر')
sys.exit(1 if fails else 0)

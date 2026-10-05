# -*- coding: utf-8 -*-
# v438 — مثبت DOM الحيّ لنوافذ صفحة المواعيد (16 توكيداً + صفر خطأ JS).
# بلا playwright مثبتاً ⇒ يتخطّى نفسه ويخرج بـ0 (نمط حارس acorn).
import os, sys, subprocess
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت نوافذ المواعيد'); sys.exit(0)
subprocess.run(['node', os.path.join(ROOT, 'scripts/dom-smoke/appointments/build-harness.js')], check=True)
os.chdir(ROOT)
base='file://'+os.getcwd()+'/_ah/'
fails=[]
def ok(n,c):
    print(('PASS ' if c else 'FAIL ')+n)
    if not c: fails.append(n)
# ── فحصٌ نصّي على الملفات الحيّة (لا الشاهد): لا سلكَ إغلاقٍ بنقرةٍ خارجية
# لأي نافذةٍ فيها بيانات — لا بالـHTML ولا بمستمعٍ بالجافاسكربت. (درس v439:
# مودال الموعد كان يُغلق بمستمعٍ منفصل بآخر الملف فنجا من تنظيف الـHTML وحده.)
import re, glob
DATA_MODALS = ['modalOverlay', 'apptMatDeductModal', 'waReminderModal', 'dismissedCompleteModal']
src = open(os.path.join(ROOT, 'appointments.html'), encoding='utf-8').read()
for f in sorted(glob.glob(os.path.join(ROOT, 'appt-*.js'))):
    src += open(f, encoding='utf-8').read()
for mid in DATA_MODALS:
    inline = re.search(r'id="' + mid + r'"[^>]*onclick="[^"]*target\s*===?\s*this', src)
    listen = re.search(r"getElementById\(\s*'" + mid + r"'\s*\)\.addEventListener\(\s*'click'", src)
    ok('%s: لا إغلاق بنقرةٍ خارجية بالملف الحيّ (html + js)' % mid, not inline and not listen)
ok('waitlistModal: الإغلاق بنقرةٍ خارجية باقٍ (قراءة فقط)',
   bool(re.search(r'id="waitlistModal"[^>]*onclick="[^"]*closeWaitlistModal', src)))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':820}); hermetic_fonts(pg)
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(base+'appt_light.html'); pg.wait_for_timeout(300)
    IDS=['modalOverlay','waitlistModal','apptMatDeductModal','waReminderModal','dismissedCompleteModal']
    for i in IDS:
        pg.evaluate(f"document.getElementById('{i}').classList.add('open')"); pg.wait_for_timeout(250)
        r=pg.evaluate("""(id)=>{const ov=document.getElementById(id);const box=ov.querySelector('.modal');
          const h=ov.querySelector('.modal-header').getBoundingClientRect();const bd=ov.querySelector('.modal-body');
          const f=ov.querySelector('.modal-footer').getBoundingClientRect();const br=box.getBoundingClientRect();
          return {head:h.top>=0&&h.bottom<=innerHeight, foot:f.bottom<=innerHeight+1, body:!!bd,
                  bodyScrolls:bd?getComputedStyle(bd).overflowY=='auto':false,
                  boxFits:br.height<=innerHeight+1, role:box.getAttribute('role'), aria:box.getAttribute('aria-modal'),
                  lock:document.body.classList.contains('sy-modal-lock')}}""",i)
        ok(f'{i}: بنية رأس/جسم/ذيل + الذيل ظاهر + aria', r['head'] and r['foot'] and r['body'] and r['bodyScrolls'] and r['boxFits'] and r['role']=='dialog' and r['aria']=='true' and r['lock'])
        pg.evaluate(f"document.getElementById('{i}').classList.remove('open')"); pg.wait_for_timeout(120)
    # backdrop behaviour
    for i,should in [('modalOverlay',False),('apptMatDeductModal',False),('waReminderModal',False),('dismissedCompleteModal',False),('waitlistModal',True)]:
        pg.evaluate("log=[]"); pg.evaluate(f"document.getElementById('{i}').classList.add('open')"); pg.wait_for_timeout(200)
        pg.mouse.click(12,12); pg.wait_for_timeout(200)
        closed=not pg.evaluate(f"document.getElementById('{i}').classList.contains('open')")
        ok(f'{i}: النقر خارجه {"يغلق (قراءة فقط)" if should else "لا يغلق (فيه بيانات)"}', closed==should)
        pg.evaluate(f"document.getElementById('{i}').classList.remove('open')"); pg.wait_for_timeout(100)
    # Escape closes via page close fn
    pg.evaluate("log=[]"); pg.evaluate("document.getElementById('modalOverlay').classList.add('open')"); pg.wait_for_timeout(200)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Escape يغلق مودال الموعد عبر دالة الصفحة', pg.evaluate("log.join()=='modalOverlay'"))
    # stacking: mat deduct over appointment modal
    pg.evaluate("document.getElementById('modalOverlay').classList.add('open');document.getElementById('apptMatDeductModal').classList.add('open')"); pg.wait_for_timeout(250)
    ok('التكديس: مودال الموعد يتعطّل تحت مودال الخصم', pg.evaluate("getComputedStyle(document.querySelector('#modalOverlay .modal')).pointerEvents=='none'"))
    pg.evaluate("log=[]"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Escape يغلق الأعلى فقط', pg.evaluate("log.join()=='apptMatDeductModal' && document.getElementById('modalOverlay').classList.contains('open')"))
    # typing survives an outside click
    pg.fill('#fNotes','نصٌّ مكتوب'); pg.mouse.click(12,12); pg.wait_for_timeout(200)
    ok('ما كُتب لا يضيع بالنقر خارج النافذة', pg.evaluate("document.getElementById('fNotes').value=='نصٌّ مكتوب' && document.getElementById('modalOverlay').classList.contains('open')"))
    ok('صفر خطأ JS', not errs)
    # dark + mobile
    d=b.new_page(viewport={'width':1200,'height':820}); hermetic_fonts(d); d.goto(base+'appt_dark.html')
    d.evaluate("document.getElementById('modalOverlay').classList.add('open')"); d.wait_for_timeout(350)
    m=b.new_page(viewport={'width':390,'height':844}); hermetic_fonts(m); m.goto(base+'appt_light.html')
    m.evaluate("document.getElementById('modalOverlay').classList.add('open')"); m.wait_for_timeout(350)
    r=m.evaluate("""(()=>{const ov=document.getElementById('modalOverlay');const box=ov.querySelector('.modal').getBoundingClientRect();
      const f=ov.querySelector('.modal-footer').getBoundingClientRect();return {w:Math.round(box.width),bottom:Math.round(box.bottom),foot:f.bottom<=innerHeight+1}})()""")
    ok('الموبايل: ورقة سفلية بعرض الشاشة والذيل ظاهر', r['w']==390 and r['bottom']==844 and r['foot'])
    b.close()
import shutil; shutil.rmtree(os.path.join(ROOT,'_ah'), ignore_errors=True)
print('🧩 مثبت نوافذ المواعيد:', ('⛔ ' + str(len(fails)) + ' فشل') if fails else '✅ كل التوكيدات خضر')
sys.exit(1 if fails else 0)

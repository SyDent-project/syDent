# -*- coding: utf-8 -*-
# v447 — مثبتُ DOM الحيّ العامّ: كلُّ صفحةٍ تُرحَّل تُضاف إلى PAGES فتُفحص نوافذُها
# بالمتصفح (بنية · a11y · ذيلٌ ظاهر · تمريرُ الجسم · موبايل · بقاءُ ما كُتب)
# إضافةً لفحصٍ نصّيٍّ على الملف الحيّ (لا سلكَ إغلاقٍ بنقرةٍ خارجية لنافذةٍ فيها بيانات).
import os, sys, re, json, subprocess
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PAGES = {                      # الصفحة: نوافذُ القراءة المسموح إغلاقها بنقرةٍ خارجية
    'treatments.html': set(),
    'doctors.html': set(),
    'employees.html': set(),
    'payouts.html': set(),
    'expenses.html': set(),
    'inventory.html': set(),
    'labs.html': set(),
    'provider-reports.html': {'detailsModal', 'ledgerModal'},
    'audit-log.html': set(),
    'settings.html': {'clinicNameSyncModal', 'waPreviewModal'},
    'learn.html': {'playerModal'},
    'subscription.html': set(),
    'auth.html': set(),
    'admin.html': {'evfModalOverlay', 'kbsModal'},
}
# لوحةُ الأدمن لا تحمّل sidebar.js (لا سايدبار فيها) ⇒ موديولُ سلوك العُدّة غائبٌ
# عمداً، ولها مديرُ Escape الخاصُّ بترتيب طبقاتها (closeTopmostOverlay). تُفحص
# بنيتُها وأحجامُها وسلوكُ النقر الخارجي، وتُستثنى توكيداتُ a11y وقفلِ التمرير.
NO_KIT_JS = set()   # v462: الأدمن تحمّل sy-modal.js الآن ⇒ لا استثناء
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي المثبت العامّ'); sys.exit(0)
subprocess.run(['node', os.path.join(ROOT, 'scripts/dom-smoke/pages/build-harness.js'),
                json.dumps(list(PAGES))], check=True)
os.chdir(ROOT)
fails = []
def ok(n, c):
    print(('PASS ' if c else 'FAIL ') + n)
    if not c: fails.append(n)

for page, read_only in PAGES.items():
    src = open(os.path.join(ROOT, page), encoding='utf-8').read()
    ids = [a or b for a, b in re.findall(r'<div (?:class="[^"]*\bmodal-overlay\b[^"]*" id="([^"]+)"|id="([^"]+)" class="[^"]*\bmodal-overlay\b[^"]*")', src)]
    ok('%s: كلُّ النوافذ على العُدّة (sy-m)' % page,
       len(ids) > 0 and len(re.findall(r'class="[^"]*\bmodal-overlay\b[^"]*\bsy-m\b|\bsy-m\b[^"]*\bmodal-overlay\b', src)) == len(ids))
    bad = []
    for mid in ids:
        if mid in read_only: continue
        if re.search(r'id="' + mid + r'"[^>]*onclick="[^"]*target\s*===?\s*this', src) or \
           re.search(r"getElementById\(\s*'" + mid + r"'\s*\)\.addEventListener\(\s*'click'", src) or \
           re.search(r"target[^;\n]{0,24}\.id\s*===?\s*'" + mid + r"'", src):
            bad.append(mid)
    ok('%s: لا إغلاق بنقرةٍ خارجية لنافذةٍ فيها بيانات' % page, not bad)
    if page == 'audit-log.html':
        ok('audit-log: نافذةُ اختيار التصدير المبنيّة بالجافاسكربت على العُدّة',
           "ov.className = 'modal-overlay sy-m open'" in src and 'SyModal.scan()' in src
           and 'escHandler' not in src)
    ok('%s: لا حلقةً تُلبس كلَّ النوافذ إغلاقاً بنقرةٍ خارجية' % page,
       not re.search(r"querySelectorAll\(\s*'\.modal-overlay'\s*\)[\s\S]{0,400}?addEventListener\(\s*'click'", src))

# v452: عرضٌ متوقَّعٌ لكل نافذة — درسُ حذف CSS محليّ كان يحمل max-width للصفحة
# كلِّها (كشفُ الحساب انكمش من 1000 إلى 480 صمتاً). تغييرُ الحجم يصير قراراً
# مُعلَناً يُحدَّث هنا، لا أثراً جانبياً.
EXPECTED_W = {
    'provider-reports.html': {'detailsModal': 960, 'ledgerModal': 960, 'payoutModal': 560},
    'labs.html': {'labOrderModal': 560, 'labModal': 560, 'labStmtModal': 720},
    'doctors.html': {'docModal': 560},
    'payouts.html': {'modalOverlay': 560},
    'treatments.html': {'treatModal': 620, 'materialsModal': 560},   # 620 قرارٌ مقصودٌ بستايل الصفحة
    'employees.html': {'empModal': 480, 'ownerPinModal': 480},
    'expenses.html': {'expModal': 480, 'catModal': 480},
    'inventory.html': {'itemModal': 480, 'moveModal': 480, 'historyModal': 720},
    'audit-log.html': {'archiveModal': 480},
    'settings.html': {'apptTypeModal': 480, 'operatoryModal': 480, 'deleteModal': 480,
                      'clinicNameSyncModal': 480, 'waPreviewModal': 480},
    'learn.html': {'playerModal': 720},
    'subscription.html': {'subOverlay': 480, 'subDelOverlay': 480},
    'auth.html': {'forgotModalOverlay': 480},
    'admin.html': {'editModal': 480, 'planModal': 480, 'payModal': 480,
                   'bkExtendOverlay': 480, 'evfModalOverlay': 720},
}

base = 'file://' + os.getcwd() + '/_pg/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for page in PAGES:
        stem = page.replace('.html', '')
        for theme, w, h in [('light', 1280, 900), ('dark', 1280, 900), ('light', 390, 844)]:
            pg = b.new_page(viewport={'width': w, 'height': h}); hermetic_fonts(pg)
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + '%s_%s.html' % (stem, theme)); pg.wait_for_timeout(200)
            tag = '%s [%s/%d]' % (page, theme, w)
            struct, aria, foot, small, over = [], [], [], [], []
            for mid in pg.evaluate("MODAL_IDS"):
                pg.evaluate("openModal('%s')" % mid); pg.wait_for_timeout(300)
                r = pg.evaluate("""(id)=>{const ov=document.getElementById(id);
                  /* صندوقُ النافذة: الفئاتُ المعيارية، وإلا أولُ عنصرٍ ابنٍ (أسطحُ الأدمن) */
                  const box=ov.querySelector('.modal-box, .modal, .modal-card, .sub-modal') || ov.firstElementChild;
                  if(!box) return {skip:true};
                  const bd=ov.querySelector('.modal-body');
                  const ft=ov.querySelector('.modal-foot, .modal-footer, .modal-actions');
                  const br=box.getBoundingClientRect(); let o=[];
                  box.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect();
                    if(r.width===0&&r.height===0) return;
                    if(r.right>br.right+1.5||r.left<br.left-1.5) o.push((el.id||el.className||el.tagName).toString().slice(0,22));});
                  const sm=[...box.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect();
                    return r.height>0&&r.height<34}).length;
                  return {body:!!bd, scroll:bd?getComputedStyle(bd).overflowY=='auto':false,
                          fits: br.bottom<=innerHeight+1 && br.top>=-1, w:Math.round(br.width),
                          foot: ft? ft.getBoundingClientRect().bottom<=innerHeight+1 : true,
                          role:box.getAttribute('role'), aria:box.getAttribute('aria-modal'),
                          lock:document.body.classList.contains('sy-modal-lock'), over:[...new Set(o)].slice(0,2), small:sm}}""", mid)
                if r.get('skip'): continue
                if not (r['body'] and r['scroll'] and r['fits']): struct.append(mid)
                if page not in NO_KIT_JS and not (r['role'] == 'dialog' and r['aria'] == 'true' and r['lock']): aria.append(mid)
                if not r['foot']: foot.append(mid)
                if r['over']: over.append('%s:%s' % (mid, r['over']))
                if w == 390 and (r['small'] or r['w'] != 390): small.append(mid)
                pg.evaluate("closeModal('%s')" % mid); pg.wait_for_timeout(40)
            ok(tag + ' البنية (جسمٌ يتمرّر وصندوقٌ داخل الشاشة)' + (' — ' + '، '.join(struct) if struct else ''), not struct)
            ok(tag + ' a11y وقفلُ التمرير' + (' — ' + '، '.join(aria) if aria else ''), not aria)
            ok(tag + ' الذيلُ ظاهر' + (' — ' + '، '.join(foot) if foot else ''), not foot)
            ok(tag + ' لا تجاوزَ لعرض الصندوق' + (' — ' + '، '.join(over) if over else ''), not over)
            if w == 1280:
                stretched = []
                for mid in pg.evaluate("MODAL_IDS"):
                    pg.evaluate("openModal('%s')" % mid); pg.wait_for_timeout(120)
                    n = pg.evaluate("""(id)=>{const ft=document.querySelector('#'+id+' .modal-foot, #'+id+' .modal-footer, #'+id+' .modal-actions');
                      if(!ft) return 0; return [...ft.querySelectorAll('button,a')].filter(b=>getComputedStyle(b).flexGrow!=='0').length}""", mid)
                    if n: stretched.append(mid)
                    pg.evaluate("closeModal('%s')" % mid); pg.wait_for_timeout(30)
                ok(tag + ' أزرارُ الذيل لا تتمدّد' + (' — ' + '، '.join(stretched) if stretched else ''), not stretched)
                misaligned = []
                for mid in pg.evaluate("MODAL_IDS"):
                    pg.evaluate("openModal('%s')" % mid); pg.wait_for_timeout(120)
                    n = pg.evaluate("""(id)=>{const out=[];
                      document.querySelectorAll('#'+id+' .form-row').forEach(function(row){
                        /* الحقولُ المخفيّة (منتقي لونٍ مستور…) لا رَسمَ لها ⇒ تُستثنى */
                        const tops=[...row.querySelectorAll(':scope > .form-group')].map(function(g){
                          const f=g.querySelector('input,select,textarea'); if(!f) return null;
                          const r=f.getBoundingClientRect(); if(r.width===0&&r.height===0) return null;
                          return Math.round(r.top);
                        }).filter(function(t){return t!==null});
                        if(tops.length>1 && Math.max.apply(null,tops)-Math.min.apply(null,tops)>2) out.push(tops.join('/'));
                      });
                      return out.length}""", mid)
                    if n: misaligned.append(mid)
                    pg.evaluate("closeModal('%s')" % mid); pg.wait_for_timeout(30)
                ok(tag + ' حقولُ الصفِّ الواحد على استقامةٍ واحدة' + (' — ' + '، '.join(misaligned) if misaligned else ''), not misaligned)
                wrong = []
                for mid, expw in (EXPECTED_W.get(page) or {}).items():
                    pg.evaluate("openModal('%s')" % mid); pg.wait_for_timeout(110)
                    got = pg.evaluate("""(id)=>{const ov=document.getElementById(id);
                      const b=ov.querySelector('.modal-box, .modal, .modal-card, .sub-modal') || ov.firstElementChild;
                      return b?Math.round(b.getBoundingClientRect().width):0}""", mid)
                    if abs(got - expw) > 2: wrong.append('%s %d≠%d' % (mid, got, expw))
                    pg.evaluate("closeModal('%s')" % mid); pg.wait_for_timeout(30)
                ok(tag + ' عرضُ كل نافذةٍ كما هو مُعلَن' + (' — ' + '، '.join(wrong) if wrong else ''), not wrong)
            if w == 390:
                ok(tag + ' الموبايل: عرضُ الشاشة وأهدافُ لمسٍ مقبولة' + (' — ' + '، '.join(small) if small else ''), not small)
            ok(tag + ' صفر خطأ JS', not errs)
            if theme == 'light' and w == 1280:
                first = pg.evaluate("MODAL_IDS")[0]
                pg.evaluate("openModal('%s')" % first); pg.wait_for_timeout(250)
                fid = pg.evaluate("""(id)=>{const t=document.querySelector('#'+id+' input[type=text], #'+id+' textarea');return t?t.id:''}""", first)
                if fid:
                    pg.fill('#' + fid, 'نصٌّ مكتوب'); pg.mouse.click(6, 6); pg.wait_for_timeout(200)
                    ok('%s: ما كُتب لا يضيع بنقرةٍ خارجية' % page,
                       pg.evaluate("document.getElementById('%s').value=='نصٌّ مكتوب' && document.getElementById('%s').classList.contains('open')" % (fid, first)))
                if page not in NO_KIT_JS:
                    pg.evaluate("log=[]"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
                    ok('%s: Escape يغلق عبر دالة الصفحة' % page, pg.evaluate("log.length>0"))
            pg.close()
    b.close()
import shutil; shutil.rmtree(os.path.join(ROOT, '_pg'), ignore_errors=True)
print('🧩 مثبت نوافذ الصفحات:', ('⛔ ' + str(len(fails)) + ' فشل') if fails else '✅ كل التوكيدات خضر')
sys.exit(1 if fails else 0)

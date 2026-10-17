# -*- coding: utf-8 -*-
# v592 — مثبتُ رأس بطاقة الموعد (العرضُ اليومي): شارةُ الحالة لا تركب فوق شارات الاسم ولا فوق «+N».
# (بلاغ المالك بصورة، 9 تشرين الأول 2026: «غير مؤكد» absolute بالزاوية فوق «حساسية» و«+1» على الهاتف.)
# (١) مرساةٌ نصّية على الملفات الحيّة: renderDay يلفّ الاسمَ والحالةَ بـ.appt-head، و.appt-status بلا absolute.
# (٢) رسمٌ حقيقي بـChromium (390/1280 × فاتح/داكن) على appointments.css وtheme.js الحيّين ببطاقةٍ مطابقةٍ لقالب
#     renderDay بخمس شارات (سقفُ الشارات ⇒ «+2»): صفرُ تقاطعٍ بين الحالة وأي شارة ظاهرة، «+N» ظاهر، لا خروجَ عن البطاقة.
# --self-test: إعادةُ `position:absolute` للحالة لا بدّ أن تحمّر. بلا playwright ⇒ يتخطّى نفسه ويخرج بـ0.
import os, sys, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SELF = '--self-test' in sys.argv
fails = []
def ok(n, c):
    if not c: fails.append(n)
    if not SELF: print(('PASS ' if c else 'FAIL ') + n)

views = open(os.path.join(ROOT, 'appt-views.js'), encoding='utf-8').read()
css = open(os.path.join(ROOT, 'appointments.css'), encoding='utf-8').read()
if SELF:   # الطفرة: الحالةُ تعود absolute بالزاوية (الخلل الأصلي)
    css = css.replace('flex: none; white-space: nowrap;', 'position: absolute; top: 8px; left: 10px;', 1)
    assert 'position: absolute; top: 8px; left: 10px;' in css

rd = views[views.index('function renderDay()'):views.index('// Phase 6 K3: Day view by Chair')]
ok('renderDay: الاسمُ وشارةُ الحالة داخل .appt-head', bool(re.search(
    r'<div class="appt-head">\s*<div class="appt-name">.*?</div>\s*<span class="appt-status \$\{statusClass\(e\.status\)\}">\$\{statusLabel\(e\.status\)\}</span>\s*</div>', rd, re.S)))
ok('renderDay: صفُّ زرّ الحضور بلا شارة حالة', rd.count('class="appt-status') == 1)
st = re.search(r'\.appt-status \{(.*?)\}', css, re.S).group(1)
ok('.appt-status بلا position:absolute', 'absolute' not in st)
ok('.appt-name يلتفّ (flex-wrap)', bool(re.search(r'\.appt-name\s*\{[^}]*flex-wrap: wrap', css)))
ok('.appt-head عمودان', bool(re.search(r'\.appt-head\s*\{[^}]*display: flex', css)))

try:
    from playwright.sync_api import sync_playwright
    from _fonts.hermetic import hermetic_fonts
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي رسم رأس البطاقة'); sync_playwright = None

if sync_playwright:
    badge = lambda cls, txt: ('<span class="tone %s" style="display:inline-block;border-width:1px;border-style:solid;'
                              'padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;margin-right:6px;">%s</span>' % (cls, txt))
    name = ('ياسر بوبس ' + badge('tone-purple', '🪑 كرسي2') + badge('tone-yellow', '⚠️ حساسية')
            + badge('tone-red', '⚠ \u20662/3\u2069') + badge('tone-blue', '⭐ VIP') + badge('tone-green', '👪 الأسرة'))
    def card(status, cls):   # مرآةُ قالب renderDay بعد v592 (الحالةُ بالرأس، الحضورُ بصفّه)
        return ('<div class="appt-block" style="--bc:var(--blue)"><div class="appt-head"><div class="appt-name">%s</div>'
                '<span class="appt-status %s">%s</span></div><div class="appt-type">حشوة كومبوزت (30 د)</div>'
                '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap"><span><button class="time-track-btn">📞 PM 08:44</button></span></div></div>'
                % (name, cls, status))
    html = ('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            '<link rel="stylesheet" href="theme.css"><style>%s</style><script src="theme.js"></script></head><body style="padding:12px">'
            '<div class="timeline"><div class="time-slot"><div class="slot-time">05:30 PM</div><div class="slot-content">%s</div></div>'
            '<div class="time-slot"><div class="slot-time">07:00 PM</div><div class="slot-content">%s</div></div></div></body></html>'
            % (css, card('غير مؤكد', 'status-scheduled'), card('مؤكد', 'status-confirmed')))
    hp = os.path.join(ROOT, '_ah_head.html')
    open(hp, 'w', encoding='utf-8').write(html)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for vw, theme in [(390, 'dark'), (390, 'light'), (1280, 'light'), (360, 'dark')]:
                pg = b.new_page(viewport={'width': vw, 'height': 800}); hermetic_fonts(pg)
                errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.goto('file://' + hp); pg.evaluate("t=>document.documentElement.setAttribute('data-theme',t)", theme)
                pg.evaluate("()=>{document.querySelectorAll('.appt-name').forEach(r=>{const k=[...r.children].filter(e=>e.tagName==='SPAN');window.SyDentBadgeCap.apply(r,k,r,3);});}")
                pg.wait_for_timeout(120)
                res = pg.evaluate("""()=>[...document.querySelectorAll('.appt-block')].map(c=>{const R=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width}};
                  const st=c.querySelector('.appt-status'), vis=[...c.querySelectorAll('.appt-name > *')].filter(e=>getComputedStyle(e).display!=='none'), plus=c.querySelector('.ab-plus');
                  const ov=(a,b)=>a.x<b.r-1&&b.x<a.r-1&&a.y<b.b-1&&b.y<a.b-1; const s=R(st);
                  const hits=vis.filter(e=>ov(R(e),s)).map(e=>e.textContent.trim());
                  const pairs=[];for(let i=0;i<vis.length;i++)for(let j=i+1;j<vis.length;j++)if(ov(R(vis[i]),R(vis[j])))pairs.push(i+'x'+j);
                  const cr=R(c); return {hits,pairs,plus:plus?plus.textContent:null,plusW:plus?R(plus).w:0,
                    out:vis.concat(st).some(e=>{const r=R(e);return r.r>cr.r+1||r.x<cr.x-1||r.b>cr.b+1})}})""")
                tag = '%d/%s' % (vw, theme)
                ok(tag + ': شارةُ الحالة لا تركب فوق أي شارة', all(not r['hits'] for r in res))
                ok(tag + ': الشاراتُ لا تتراكب', all(not r['pairs'] for r in res))
                ok(tag + ': «+2» ظاهر', all(r['plus'] == '+2' and r['plusW'] > 0 for r in res))
                ok(tag + ': لا خروجَ عن البطاقة', all(not r['out'] for r in res))
                ok(tag + ': صفرُ خطأ JS', not errs)
                pg.close()
            b.close()
    finally:
        try: os.remove(hp)
        except OSError: pass

if SELF:
    print(('✅' if fails else '❌') + ' appt-head --self-test: الطفرة (absolute) ' + ('تعضّ' if fails else 'نجت!'))
    sys.exit(0 if fails else 1)
print(('✅' if not fails else '❌') + ' appt-head: %d فشل' % len(fails))
sys.exit(1 if fails else 0)

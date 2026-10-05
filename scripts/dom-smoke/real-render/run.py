#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v488 — مثبتُ العارضات الحقيقية لجولة أزرار الصفوف (طلب المالك: «اعمل تشييك على كل المسارات والسيناريوهات»).
بخلاف dom-smoke/row-actions (نسخٌ مطابقة من الكود)، هذا يشغّل **دوالَّ العرض الحقيقية نفسها** من ملفات المنصة
بمتصفح حقيقي بـtheme.css وCSS الصفحة، بتغذيةٍ مصطنعة تغطّي كلَّ حالة، ثم يتحقّق من الناتج:
الخاناتُ المستعملة وحدها بالقالب · الامتدادُ فقط فوق خانةٍ بالقالب · لا عنصرٌ نائب متبقٍّ · اللونُ الصحيح لكل فعل ·
الترتيب · الاصطفافُ الفعلي عبر الصفوف بالمتصفح · صفرُ خطأ JS."""
import os, re, sys, json, tempfile
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
try:
    from playwright.sync_api import sync_playwright
except ImportError:   # نمطُ إخوته (acorn · مثبتات DOM): بلا Playwright تخطٍّ واضح لا إسقاطٌ للبوابة
    print('⏭️  playwright غير مثبت — تخطّي مثبت العارضات الحقيقية'); sys.exit(0)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
def rd(f): return open(os.path.join(ROOT, f), encoding='utf-8').read()
def fn_src(path, name):
    s = rd(path); i = s.index('function ' + name + '('); j = s.index('{', i); d = 0
    for k in range(j, len(s)):
        if s[k] == '{': d += 1
        elif s[k] == '}':
            d -= 1
            if d == 0: return s[i:k + 1]
    raise ValueError(name)
def iife(s, start):
    """يقتطع «window.X = (function () {…})();» كاملاً بموازنة الأقواس."""
    i = s.index(start); j = s.index('{', i); d = 0
    for k in range(j, len(s)):
        if s[k] == '{': d += 1
        elif s[k] == '}':
            d -= 1
            if d == 0:
                e = s.index(';', k); return s[i:e + 1]
def helpers():
    s = rd('supabase-init.js')
    a = s.index('window.SyDT = (function'); b = s.index('window.SySlots = {'); c = s.index('\n};', b) + 3
    extra = ''
    for start in ('window.SyDentCurPick = (function',):
        try: extra += iife(s, start) + '\n'
        except ValueError: pass
    fa = s.index('  window.SyDentFetchAll = async function (build) {'); fb = s.index('\n  };\n', fa) + 5   # v548: الجالبُ المصفّح الحقيقي
    return s[fa:fb] + '\n' + iife(s, 'window.SyDentCurBag = (function') + '\n' + extra + s[a:b] + s[b:c]
FAILS, N = [], [0]
# عميلُ Supabase مصطنع: الجلسةُ «معلّقة» للأبد فلا يحوّل الإقلاعُ إلى صفحة الدخول، والاستعلاماتُ سلسلةٌ لا تنتهي
STUBS = r"""() => {
  const never = () => new Promise(() => {});
  const chain = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : () => chain), apply: () => chain });
  window.sb = { auth: { getUser: never, getSession: never, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => chain, rpc: never, storage: { from: () => chain }, channel: () => chain, removeChannel() {} };
  window.initSidebar = () => {}; window.showToast = window.showToast || (() => {}); window.showMsg = window.showMsg || (() => {}); window.clearMsg = window.clearMsg || (() => {});
  window.escapeHtml = window.escapeHtml || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
}"""
def ok(tag, cond, info=''):
    N[0] += 1
    if not cond: FAILS.append(tag + (' — ' + str(info) if info != '' else ''))
def page_html(css, body):
    links = ''.join('<link rel="stylesheet" href="file://%s">' % os.path.join(ROOT, c) for c in css)
    return '<!doctype html><html lang="ar" dir="rtl" data-theme="light"><head><meta charset="utf-8">%s</head><body>%s</body></html>' % (links, body)

# قياسٌ مشترك: لكل جدولٍ بخانات — القالبُ من الخانات المستعملة · الامتداد · النائب · الاصطفاف عبر الصفوف
MEASURE = r"""(root) => {
  const R = document.querySelector(root);
  const conts = [...R.querySelectorAll('.sy-acts.sy-slots')];
  const html = R.innerHTML;
  return {
    leftover: /__SY_SLOTS__|data-span-if/.test(html),
    conts: conts.map(c => ({ tpl: c.style.getPropertyValue('--sy-slots').trim(), disp: getComputedStyle(c).display,
      btns: [...c.children].filter(b => b.dataset.slot).map(b => { const k = b.getBoundingClientRect();
        return { slot: b.dataset.slot, span: b.dataset.span || '', cls: b.className, t: b.textContent.trim(), L: k.left, R: k.right, oc: b.getAttribute('onclick') || '' }; }) }))
  };
}"""
def check_slots(tag, res, widths):
    ok(tag + ': لا عنصرٌ نائب متبقٍّ', not res['leftover'])
    used = sorted({b['slot'] for c in res['conts'] for b in c['btns']})
    want = ' '.join('[s%s] %s' % (k, widths[k]) for k in sorted(widths) if k in used)
    for i, c in enumerate(res['conts']):
        ok(tag + ' صف %d: القالبُ = الخاناتُ المستعملة وحدها' % (i + 1), c['tpl'] == want, (c['tpl'], want))
        ok(tag + ' صف %d: شبكة' % (i + 1), c['disp'] in ('inline-grid', 'grid'), c['disp'])
        slots = [b['slot'] for b in c['btns']]
        ok(tag + ' صف %d: الترتيبُ تصاعدي' % (i + 1), slots == sorted(slots), slots)
        for b in c['btns']:
            if b['span']:
                nxt = str(int(b['slot']) + 1)
                ok(tag + ' صف %d: «%s» يمتدّ فوق خانةٍ بالقالب وغائبةٍ بصفّه' % (i + 1, b['t']), nxt in used and nxt not in slots, (nxt, used, slots))
    by = {}
    for c in res['conts']:
        for b in c['btns']: by.setdefault(b['slot'], []).append(b)
    for sl, xs in by.items():
        Rs = [round(x['R'], 1) for x in xs]
        ok(tag + ' الخانة %s: عمودٌ واحد عبر الصفوف' % sl, max(Rs) - min(Rs) <= 0.75, Rs)
    return by

LAB_NAMES = ['مسودة', 'مُرسَل', 'مُستلَم', 'مفحوص', 'مُركَّب']
def lab_status_checks(tag, res, plan_ok):
    rows = res['conts']
    for i, nm in enumerate(LAB_NAMES):
        if i >= len(rows): break
        bt = rows[i]['btns']
        step = [b for b in bt if b['slot'] == '1']; redo = [b for b in bt if b['slot'] == '2']; d = [b for b in bt if b['slot'] == '4']
        ok(tag + ' ' + nm + ': خطوةٌ تالية ' + ('موجودة خضراء' if i < 4 else 'غائبة'), bool(step) == (i < 4) and (not step or 'sy-act-primary' in step[0]['cls']), [b['t'] for b in step])
        want_redo = plan_ok and nm in ('مُستلَم', 'مفحوص')
        ok(tag + ' ' + nm + ': «إعادة» ' + ('برتقالية' if want_redo else 'غائبة'), bool(redo) == want_redo and (not redo or 'sy-act-warn' in redo[0]['cls']), [b['cls'] for b in redo])
        ok(tag + ' ' + nm + ': «حذف» أحمر بالخانة الأخيرة', len(d) == 1 and 'sy-act-danger' in d[0]['cls'])

def page_parts(html_file, skip_src=('supabase-init.js', 'sidebar.js', 'timepicker.js', 'sy-modal.js', 'theme.js')):
    """جسمُ الصفحة بلا سكربتات · أوراقُ الأنماط المحلية · سكربتاتُها الخارجية المحلية بترتيبها · سكربتاتُها المضمَّنة (بلا حرّاس الدخول)."""
    src = rd(html_file)
    body = re.sub(r'<script[\s\S]*?</script>', '', re.search(r'<body[^>]*>([\s\S]*)</body>', src).group(1))
    css = [c.split('?')[0] for c in re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', src) if not c.startswith('http')]
    styles = re.findall(r'<style[^>]*>([\s\S]*?)</style>', src)
    parts = []
    for m in re.finditer(r'<script([^>]*)>([\s\S]*?)</script>', src):
        attrs, code = m.group(1), m.group(2)
        sm = re.search(r'src="([^"]+)"', attrs)
        if sm:
            f = sm.group(1).split('?')[0]
            if f.startswith('http') or f in skip_src or not os.path.exists(os.path.join(ROOT, f)): continue
            parts.append(rd(f))
        elif code.strip() and not (len(code) < 1500 and 'location.replace(' in code):
            parts.append(code)
    return body, css, styles, parts

def run():
    H = helpers()
    with sync_playwright() as p:
        br = p.chromium.launch()
        def mk(css, body, scripts, vw=1280):
            pg = br.new_page(viewport={'width': vw, 'height': 900}, timezone_id='Asia/Damascus', locale='ar-SY'); hermetic_fonts(pg)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            tmp = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8'); tmp.write(page_html(css, body)); tmp.close()
            first = 'file://' + tmp.name
            # سكربتاتُ الصفحة الحقيقية بلا جلسة تحوّل إلى صفحة الدخول — تُمنع كلُّ ملاحةٍ بعد الأولى فتبقى الصفحة المقيسة
            pg.route('**/*', lambda r: r.abort() if (r.request.is_navigation_request() and r.request.url != first) else r.continue_())
            pg.goto(first)
            pg.add_script_tag(content=H)
            for s in scripts: pg.add_script_tag(content=s)
            return pg, errs
        for t in (1,):
            pass
        # ═══ 1) تبويب المخابر ببطاقة المريض — renderLabOrders الحقيقية بكل الحالات × بوابة الخطة ═══
        for plan_ok in (True, False):
            tag = 'تبويب المخابر (خطةٌ %s)' % ('تسمح' if plan_ok else 'لا تسمح')
            pg, errs = mk(['theme.css', 'patient-profile.css'], '<div id="labOrdersContent"></div>',
                          [rd('pp-core.js'), rd('pp-clinical.js')])
            errs.clear()   # أخطاءُ التحميل من تبعياتٍ غائبة بالمنصة الحقيقية (ppGuarded…) ليست من العارض
            pg.evaluate("""(planOk) => {
              window.escapeHtml = window.escapeHtml || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
              window.allLabs = [{ id: 'L1', name: 'مخبر حسن' }];
              window.labsPlanOk = () => planOk; window.labsSyncCreateUI = () => {}; window.updateLabsBadge = () => {}; window.addLabBadges = () => {};
              const mkO = (id, st) => ({ id, status: st, work_type: 'تاج', lab_id: 'L1', tooth_num: 35, shade: 'a3', cost: 90, currency: 'USD',
                                          date_sent: st === 'draft' ? null : '2026-09-13T00:00:00+00:00', created_at: '2026-09-13T06:09:00+00:00' });
              window.labOrders = [mkO('a','draft'), mkO('b','sent'), mkO('c','received'), mkO('d','checked'), mkO('e','fitted')];
              try { labOrders = window.labOrders; allLabs = window.allLabs; } catch (e) {}
              renderLabOrders();
            }""", plan_ok)
            res = pg.evaluate(MEASURE, '#labOrdersContent')
            ok(tag + ': عُرضت الصفوفُ الخمسة', len(res['conts']) == 5, len(res['conts']))
            by = check_slots(tag, res, {'1': '160px', '2': '78px', '3': '82px', '4': '80px'})
            rows = res['conts']
            steps = [ [b for b in c['btns'] if b['slot'] == '1'] for c in rows ]
            redo = [ [b for b in c['btns'] if b['slot'] == '2'] for c in rows ]
            names = ['مسودة', 'مُرسَل', 'مُستلَم', 'مفحوص', 'مُركَّب']
            for i, nm in enumerate(names):
                has_next = i < 4
                ok(tag + ' ' + nm + ': خطوةٌ تالية ' + ('موجودة' if has_next else 'غائبة'), bool(steps[i]) == has_next, [b['t'] for b in steps[i]])
                if steps[i]: ok(tag + ' ' + nm + ': الخطوةُ خضراء', 'sy-act-primary' in steps[i][0]['cls'], steps[i][0]['cls'])
                want_redo = plan_ok and nm in ('مُستلَم', 'مفحوص')
                ok(tag + ' ' + nm + ': «إعادة» ' + ('موجودة برتقالية' if want_redo else 'غائبة'), bool(redo[i]) == want_redo and (not redo[i] or 'sy-act-warn' in redo[i][0]['cls']), [b['cls'] for b in redo[i]])
                d = [b for b in rows[i]['btns'] if b['slot'] == '4']
                ok(tag + ' ' + nm + ': «حذف» أحمر بالخانة الأخيرة', len(d) == 1 and 'sy-act-danger' in d[0]['cls'] and 'delLabOrder(' in d[0]['oc'])
            ok(tag + ': صفرُ خطأ JS', not errs, errs[:3])
            pg.close()

        # ═══ 2) صفحة المخابر — renderTable الحقيقية (الجدول والبطاقات من «actions» نفسها) ═══
        def inline_scripts(f):
            # حرّاسُ الدخول الصغيرة (تحويلٌ فوري بلا جلسة) لا تُحمَّل — الدوالُّ بالسكربت الرئيسي
            return [m for m in re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', rd(f))
                    if m.strip() and not (len(m) < 1500 and 'location.replace(' in m)]
        body = re.search(r'<body[^>]*>([\s\S]*)</body>', rd('labs.html')).group(1)
        body = re.sub(r'<script[\s\S]*?</script>', '', body)
        pg, errs = mk(['theme.css'], body, [])
        pg.add_style_tag(content='\n'.join(re.findall(r'<style[^>]*>([\s\S]*?)</style>', rd('labs.html'))))
        pg.evaluate(STUBS)
        for sc in inline_scripts('labs.html'):
            try: pg.add_script_tag(content=sc)
            except Exception: pass
        errs.clear()
        # سكربتاتُ الصفحة الحقيقية (بوابةُ الاشتراك/الشريط الجانبي) قد تعيد بناء الجسم بلا جلسة — يُعاد جسمُ الصفحة كما هو قبل العرض
        pg.evaluate("(b) => { document.body.innerHTML = b; }", body)
        out = pg.evaluate("""() => {
          const mkO = (id, st, due) => ({ id, status: st, work_type: 'زراعة', lab_id: 'L1', patient_id: 'P1', tooth_num: 44, shade: 'a3', cost: 90, currency: 'USD',
                                           date_sent: st === 'draft' ? null : '2026-09-13T00:00:00+00:00', date_due: due || null, created_at: '2026-09-13T06:09:00+00:00' });
          try {
            allOrders = [mkO('a','draft','2026-09-26'), mkO('b','sent'), mkO('c','received'), mkO('d','checked'), mkO('e','fitted')];
            currentFilter = 'all'; searchQuery = '';
          } catch (e) { return 'state: ' + e; }
          window.__fin = []; const _f = SySlots.finalize; SySlots.finalize = function (h, w) { const r = _f(h, w); window.__fin.push([String(h).length, r.length]); return r; };
          try { renderTable(); window.__cardsLen = document.getElementById('ordersCards').innerHTML.length; window.__cardsEl = document.getElementById('ordersCards'); } catch (e) { return 'render: ' + e + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 4).join(' | '); }
          return '';
        }""")
        ok('صفحة المخابر: العارضُ الحقيقي يعمل', out == '', out)
        if out == '':
            res = pg.evaluate(MEASURE, '#ordersBody')
            ok('صفحة المخابر (جدول): عُرضت الصفوفُ الخمسة', len(res['conts']) == 5, len(res['conts']))
            check_slots('صفحة المخابر (جدول)', res, {'1': '160px', '2': '78px', '3': '82px', '4': '80px'})
            cards = pg.evaluate("""() => { const h = document.getElementById('ordersCards').innerHTML;
              return { leftover: /__SY_SLOTS__|data-span-if/.test(h), slots: document.querySelectorAll('#ordersCards .sy-slots').length, n: document.querySelectorAll('#ordersCards .oc-actions').length, len: h.length, ids: document.querySelectorAll('[id=ordersCards]').length, atRender: window.__cardsLen, fin: window.__fin, same: window.__cardsEl === document.getElementById('ordersCards'), connected: window.__cardsEl && window.__cardsEl.isConnected }; }""")
            ok('صفحة المخابر (بطاقات): لا نائب ولا خانات', not cards['leftover'] and cards['slots'] == 0 and cards['n'] == 5, cards)
        ok('صفحة المخابر: صفرُ خطأ JS بعد العرض', not errs, errs[:3])
        pg.close()
        def mkpage(html_file, vw=1280):
            body, css, styles, parts = page_parts(html_file)
            pg, errs = mk(['theme.css'] + [c for c in css if c != 'theme.css'], body, [], vw)
            if styles: pg.add_style_tag(content='\n'.join(styles))
            pg.evaluate(STUBS)
            for sc in parts:
                try: pg.add_script_tag(content=sc)
                except Exception: pass
            pg.evaluate("(b) => { document.body.innerHTML = b; }", body)
            errs.clear()
            return pg, errs

        # ═══ 3) الجلسات ببطاقة المريض — renderSessions الحقيقية ═══
        SESS = [('مخطّطة + مخبر ممكن', 'planned', 'can'), ('مخطّطة بلا مخبر', 'planned', 'none'), ('منجزة + مخبر ممكن', 'completed', 'can'), ('منجزة بلا مخبر', 'completed', 'none')]
        for label, subset in (('كلُّ الحالات', [0, 1, 2, 3]), ('كلُّها منجزة', [2, 3]), ('كلُّها منجزة بلا مخبر', [3])):
            tag = 'الجلسات (' + label + ')'
            pg, errs = mkpage('patient-profile.html')
            out = pg.evaluate("""(rows) => {
              try {
                sessions = rows.map((r, i) => ({ id: 's' + i, status: r[1], date: '2026-09-1' + i, created_at: '2026-09-1' + i + 'T08:00:00+00:00', cost: 30000, paid: 0,
                                                   currency: 'SYP', treatment_name: 'حشوة', tooth_num: 16, _lab: r[2] }));
                window._ppSessLabState = s => s._lab; window._ppSessLabIsDraft = () => false;
                renderSessions();
              } catch (e) { return String(e) + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | '); }
              return '';
            }""", [SESS[i] for i in subset])
            ok(tag + ': العارضُ الحقيقي يعمل', out == '', out)
            if out == '':
                res = pg.evaluate(MEASURE, '#sessionsContent')
                ok(tag + ': عُرضت الصفوف', len(res['conts']) == len(subset), len(res['conts']))
                check_slots(tag, res, {'1': '84px', '2': '78px', '3': '80px'})
                for ci, si in enumerate(subset):
                    nm, st, lab = SESS[si]; bt = res['conts'][ci]['btns']
                    c1 = [b for b in bt if b['slot'] == '1']; c2 = [b for b in bt if b['slot'] == '2']; c3 = [b for b in bt if b['slot'] == '3']
                    ok(tag + ' ' + nm + ': «إكمال» ' + ('أخضر' if st == 'planned' else 'غائب'), bool(c1) == (st == 'planned') and (not c1 or 'sy-act-primary' in c1[0]['cls']))
                    ok(tag + ' ' + nm + ': «مخبر» ' + ('محايد' if lab == 'can' else 'غائب'), bool(c2) == (lab == 'can') and (not c2 or c2[0]['cls'].strip() == 'sy-act'))
                    ok(tag + ' ' + nm + ': «حذف» أحمر', len(c3) == 1 and 'sy-act-danger' in c3[0]['cls'])
                if label == 'كلُّها منجزة بلا مخبر':
                    ok(tag + ': القالبُ خانةُ الحذف وحدها (لا فراغ)', res['conts'][0]['tpl'] == '[s3] 80px', res['conts'][0]['tpl'])
            ok(tag + ': صفرُ خطأ JS', not errs, errs[:3])
            pg.close()
        # ═══ 4) بطاقاتُ الأدمن — renderList الحقيقية بكل حالات الحساب ═══
        pg, errs = mkpage('admin.html', 1100)
        STATES = [('جديد', {'state': 'new'}), ('تجربة', {'state': 'trial', 'plan': 'trial'}), ('مدفوع', {'state': 'paid', 'plan': 'pro'}),
                  ('مدفوع دائم', {'state': 'paid', 'plan': 'pro', 'isPermanent': True}), ('سماح', {'state': 'grace', 'plan': 'pro'}),
                  ('منتهٍ تجربة', {'state': 'expired', 'plan': 'trial'}), ('منتهٍ مدفوع', {'state': 'expired', 'plan': 'pro'}), ('موقوف', {'state': 'suspended', 'plan': 'pro'})]
        out = pg.evaluate("""(ST) => {
          try {
            allRequests = ST.map((x, i) => ({ id: 'r' + i, status: 'all', clinic_name: 'عيادة ' + x[0], doctor_name: 'د. تجربة', phone: '0934012433', email: 'a' + i + '@x.com',
                                               created_at: '2026-09-21T11:32:00+00:00', trial_end: '2026-10-21T00:00:00+00:00', plan: x[1].plan || 'trial', user_id: 'u' + i, _s: x[1] }));
            currentFilter = 'all'; try { expiringFilterActive = false; } catch (e) {}
            window.matchesSearch = () => true; window.applyAdvancedFilters = () => true; window.isExpiringSoon = () => false;
            window.computeAccountState = r => Object.assign({ state: 'trial', plan: 'trial', isPermanent: false, daysLeft: 10 }, r._s);
            renderList();
          } catch (e) { return String(e) + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | '); }
          return '';
        }""", [[n, st] for n, st in STATES])
        ok('الأدمن: العارضُ الحقيقي يعمل', out == '', out)
        if out == '':
            cards = pg.evaluate("""() => [...document.querySelectorAll('#reqList .req-actions')].map(c => ({
              kids: [...c.children].map(k => k.classList.contains('sy-acts-sep') ? 'SEP' : (k.classList.contains('sy-acts-grp') ? 'GRP' : k.tagName)),
              groups: [...c.querySelectorAll(':scope > .sy-acts-grp')].map(g => [...g.children].map(b => ({ t: b.textContent.trim(), cls: b.className, oc: b.getAttribute('onclick') || '', tag: b.tagName }))) }))""")
            ok('الأدمن: بطاقةٌ لكل حالة', len(cards) == len(STATES), len(cards))
            for (nm, st), c in zip(STATES, cards):
                tag = 'الأدمن (' + nm + ')'
                k = c['kids']
                ok(tag + ': مجموعاتٌ وفواصلُ متناوبة بلا فاصلٍ طرفيّ أو مزدوج', all(x in ('GRP', 'SEP') for x in k) and k[0] == 'GRP' and k[-1] == 'GRP' and all(k[i] != k[i + 1] for i in range(len(k) - 1)), k)
                allb = [b for g in c['groups'] for b in g]
                prim = [b for b in allb if 'sy-act-primary' in b['cls']]
                ok(tag + ': أخضرُ واحدٌ على الأكثر', len(prim) <= 1, [b['t'] for b in prim])
                if st.get('isPermanent'): ok(tag + ': بلا أخضر (لا فعلَ متقدّم)', not prim)
                else: ok(tag + ': الأخضرُ أولُ زرٍّ بأول مجموعة', bool(prim) and c['groups'][0][0]['t'] == prim[0]['t'], [b['t'] for b in allb][:2])
                last = c['groups'][-1]
                ok(tag + ': آخرُ زرٍّ أحمر (حذف/رفض)', 'sy-act-danger' in last[-1]['cls'] and ('deleteAccount(' in last[-1]['oc'] or 'reject(' in last[-1]['oc']), last[-1]['t'])
                for b in allb:
                    if 'suspendAccount(' in b['oc'] or 'demoteFromAdmin(' in b['oc']:
                        ok(tag + ': «' + b['t'] + '» برتقاليٌّ بمجموعة الإيقاف والحذف', 'sy-act-warn' in b['cls'] and b in last)
                    if b['tag'] == 'A':
                        ok(tag + ': رابطُ «' + b['t'] + '» بمجموعة المراسلات', any(b in g for g in c['groups'][1:2]) and b not in c['groups'][0] and b not in last)
                    if 'openCustomer360(' in b['oc'] or 'toggleActivity(' in b['oc'] or 'openEditModal(' in b['oc']:
                        ok(tag + ': «' + b['t'] + '» بمجموعة الملف والنشاط', b not in c['groups'][0] and b not in last)
        ok('الأدمن: صفرُ خطأ JS', not errs, errs[:3])
        pg.close()
        # ═══ 5) المواعيد — قائمةٌ (زرُّ المرحلة لليوم وحده) واتصالات (تأكيدٌ وهاتفٌ متفاوتان) — العارضان الحقيقيان ═══
        # زرُّ المرحلة يظهر لكل موعدٍ غير مؤكَّد (أولُ مراحله «📞 تأكيد») — لا لمواعيد اليوم وحدها
        for label, with_today in (('مؤكَّدٌ وغيرُ مؤكَّد', True), ('كلُّها مؤكَّدة', False)):
            pg, errs = mkpage('appointments.html')
            out = pg.evaluate("""(withToday) => {
              const pad = n => String(n).padStart(2, '0');
              const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
              const t0 = new Date(), t1 = new Date(Date.now() + 86400000), t2 = new Date(Date.now() + 2 * 86400000);
              try {
                const A = (id, date, time, st, phone, conf) => ({ id, date, time, status: st, patient_name: 'مريض ' + id, patient_phone: phone, type: 'فحص', duration: 30,
                                                                   confirmed_at: conf ? '2026-09-20T10:00:00+00:00' : null });
                appointments = [A('x', ds(t1), '10:00', 'scheduled', '0934012433', !withToday), A('y', ds(t1), '11:30', 'scheduled', '', true), A('z', ds(t2), '09:00', 'scheduled', '0934012433', true)];
                if (withToday) appointments.push(A('w', ds(t0), '23:30', 'scheduled', '0934012433', false));
                renderList(); renderCalls();
              } catch (e) { return String(e) + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | '); }
              return '';
            }""", with_today)
            tag = 'المواعيد (' + label + ')'
            ok(tag + ': العارضان يعملان', out == '', out)
            if out == '':
                res = pg.evaluate(MEASURE, '#listContent')
                ok(tag + ' قائمة: عُرضت الصفوف', len(res['conts']) >= 3, len(res['conts']))
                check_slots(tag + ' قائمة', res, {'1': '84px', '2': '82px', '3': '80px'})
                st = [b for c in res['conts'] for b in c['btns'] if b['slot'] == '1']
                ok(tag + ' قائمة: زرُّ المرحلة ' + ('بصفّي الموعدين غير المؤكَّدين' if with_today else 'غائبٌ وخانتُه مطويّة'), (len(st) == 2 and all('📞' in b['t'] for b in st)) if with_today else (not st and all('[s1]' not in c['tpl'] for c in res['conts'])), [c['tpl'] for c in res['conts']][:1])
                resc = pg.evaluate(MEASURE, '#callsContent')
                ok(tag + ' اتصالات: عُرضت الصفوف', len(resc['conts']) >= 1, len(resc['conts']))
                check_slots(tag + ' اتصالات', resc, {'1': '92px', '2': '76px', '3': '102px'})
                for c in resc['conts']:
                    for b in c['btns']:
                        if b['slot'] == '3': ok(tag + ' اتصالات: «تم التأكيد» أخضر', 'sy-act-primary' in b['cls'])
            ok(tag + ': صفرُ خطأ JS', not errs, errs[:3])
            pg.close()

        # ═══ 6) نافذةُ المتابعة بالمرضى — الأقساط · الاستدعاء · أعياد الميلاد (العارضات الحقيقية) ═══
        pg, errs = mkpage('patients.html')
        out = pg.evaluate("""() => {
          try {
            patients = [{ id: 'p1', name: 'ياسر', phone: '0934012433' }, { id: 'p2', name: 'ليلى', phone: '' }];
            window.prmInstList = () => [
              { plan: { id: 'pl1', patient_id: 'p1', installment_amount: 50000, currency: 'SYP' }, calc: { overdueDays: 3, nextDue: '2026-09-20', k: 1, count: 5, remaining: 200000 } },
              { plan: { id: 'pl2', patient_id: 'p2', installment_amount: 50000, currency: 'SYP' }, calc: { overdueDays: 0, nextDue: '2026-09-23', k: 2, count: 5, remaining: 150000 } }];
            window.prmRecallList = () => [{ p: patients[0], lastVisit: '2026-02-01' }, { p: patients[1], lastVisit: '2026-01-10' }];
            window.prmBirthdayList = () => [{ p: patients[0], daysLeft: 0 }, { p: patients[1], daysLeft: 3 }];
            renderPrmInst(); renderPrmRecall(); renderPrmBday();
          } catch (e) { return String(e) + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | '); }
          return '';
        }""")
        ok('المتابعة: العارضات الثلاثة تعمل', out == '', out)
        if out == '':
            for view, w, nm in (('#prmInstView', {'1': '90px', '2': '80px', '3': '112px'}, 'الأقساط'), ('#prmRecallView', {'1': '90px', '2': '80px', '3': '66px'}, 'الاستدعاء'), ('#prmBdayView', {'1': '90px', '2': '76px'}, 'أعياد الميلاد')):
                res = pg.evaluate(MEASURE, view)
                ok('المتابعة ' + nm + ': صفّان', len(res['conts']) == 2, len(res['conts']))
                check_slots('المتابعة ' + nm, res, w)
                ok('المتابعة ' + nm + ': صفُّ «بلا رقم» بلا واتساب', not any(b['slot'] == '1' for b in res['conts'][1]['btns']))
        ok('المتابعة: صفرُ خطأ JS', not errs, errs[:3])
        pg.close()

        # ═══ 7) سجلُّ النشاطات — renderLogs الحقيقية (العادي · المؤرشف بمريضٍ وبلا مريض) ═══
        for arch in (False, True):
            pg, errs = mkpage('audit-log.html')
            out = pg.evaluate("""(arch) => {
              try {
                window.isArchivedView = () => arch;
                allLogs = [{ id: 'g1', created_at: '2026-09-21T11:32:00+00:00', employee_name_snapshot: 'ريم', employee_role_snapshot: 'secretary', action_type: 'delete_payment', description: 'حذف دفعة', patient_id: 'P1', archived_at: arch ? '2026-09-21T12:00:00+00:00' : null },
                           { id: 'g2', created_at: '2026-09-20T06:10:00+00:00', employee_name_snapshot: 'ريم', employee_role_snapshot: 'secretary', action_type: 'update_settings', description: 'تعديل إعدادات', patient_id: null, archived_at: arch ? '2026-09-21T12:00:00+00:00' : null }];
                renderLogs();
              } catch (e) { return String(e) + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | '); }
              return '';
            }""", arch)
            tag = 'سجل النشاطات (' + ('مؤرشف' if arch else 'عادي') + ')'
            ok(tag + ': العارضُ يعمل', out == '', out)
            if out == '':
                info = pg.evaluate("""() => ({ html: document.getElementById('logContainer').innerHTML, dates: [...document.querySelectorAll('.lt-date')].map(x => x.textContent), hours: [...document.querySelectorAll('.lt-hour')].map(x => x.textContent) })""")
                ok(tag + ': التاريخُ أرقاماً', info['dates'][:2] == ['21/9/2026', '20/9/2026'], info['dates'])
                ok(tag + ': الوقتُ 12 ساعة معزولٌ', all(re.fullmatch('\u2066\\d\\d:\\d\\d [AP]M\u2069', h) for h in info['hours']), info['hours'])
                if arch:
                    res = pg.evaluate(MEASURE, '#logContainer')
                    check_slots(tag, res, {'1': '94px', '2': '94px'})
                else:
                    ok(tag + ': بلا خانات ولا نائب', 'sy-slots' not in info['html'] and '__SY_SLOTS__' not in info['html'])
            ok(tag + ': صفرُ خطأ JS', not errs, errs[:3])
            pg.close()
        # ═══ 8) وقتُ المصروف (M153) — فتحُ النافذة · الحفظ · التدهورُ الرشيق بلا M153 · التعديل (الدوالُّ الحقيقية) ═══
        CAPTURE = r"""(plan) => {
          window.__writes = []; let n = 0;
          const done = (res) => { const q = { eq: () => q, select: () => q, single: () => q, maybeSingle: () => q, order: () => q, limit: () => q, range: () => q, gte: () => q, lte: () => q, in: () => q, is: () => q, neq: () => q,
                                              then: (ok) => Promise.resolve(res).then(ok) }; return q; };
          window.sb.from = (t) => ({
            insert: (row) => { window.__writes.push({ t, op: 'insert', row: JSON.parse(JSON.stringify(row)) }); return done(plan[n++] || { data: Object.assign({ id: 'new' }, row), error: null }); },
            update: (row) => { window.__writes.push({ t, op: 'update', row: JSON.parse(JSON.stringify(row)) }); return done(plan[n++] || { data: Object.assign({ id: 'e1' }, row), error: null }); },
            select: () => done({ data: [], error: null }), delete: () => done({ data: null, error: null }) });
          window.SyDialog = { confirm: () => Promise.resolve(true), alert: () => Promise.resolve() };
        }"""
        pg, errs = mkpage('expenses.html')
        out = pg.evaluate("""async () => {
          try {
            currentUser = { id: 'u1' }; categories = [{ id: 'c1', name: 'مواد سنية', is_active: true }];
            window.SyDentCurPick = window.SyDentCurPick || { read: () => 'SYP', attach() {}, set() {} };   // احتياطٌ إن غاب المنتقي الحقيقي
            const sel = document.getElementById('eCategory'); sel.innerHTML = '<option value="c1">مواد سنية</option>';
            openExpenseModal();
            return { time: document.getElementById('eTime').value, date: document.getElementById('eDate').value };
          } catch (e) { return { err: String(e) }; }
        }""")
        ok('المصروف: فتحُ النافذة يعبّئ الوقتَ الآن (HH:MM)', re.fullmatch(r'\d\d:\d\d', out.get('time', '')) is not None, out)
        pg.evaluate(CAPTURE, [{ 'data': None, 'error': { 'code': 'PGRST204', 'message': "Could not find the 'expense_time' column of 'expenses'" } }])
        out = pg.evaluate("""async () => {
          try {
            document.getElementById('eAmount').value = '350000'; document.getElementById('eTime').value = '14:32';
            try { expenses = []; } catch (e) {}
            await saveExpense();
            return window.__writes;
          } catch (e) { return String(e); }
        }""")
        ok('المصروف: محاولتان (الأولى بالوقت · الثانية بلاه بعد 42703/PGRST204)', isinstance(out, list) and len(out) == 2, out if not isinstance(out, list) else len(out))
        if isinstance(out, list) and len(out) == 2:
            ok('المصروف: الوقتُ يُرسل «14:32:00»', out[0]['row'].get('expense_time') == '14:32:00', out[0]['row'].get('expense_time'))
            ok('المصروف: إعادةُ المحاولة بلا expense_time وبقيةُ الحقول سليمة', 'expense_time' not in out[1]['row'] and out[1]['row'].get('amount') == 350000 and out[1]['row'].get('date'), out[1]['row'])
        out = pg.evaluate("""() => {
          try { expenses = [{ id: 'e1', date: '2026-07-30', expense_time: '09:05:00', amount: 5, category_id: 'c1', payment_method: 'cash', currency: 'SYP' }];
                editExpense('e1'); return document.getElementById('eTime').value; } catch (e) { return 'ERR ' + e; }
        }""")
        ok('المصروف: التعديلُ يحمّل الوقتَ المحفوظ', out == '09:05', out)
        ok('المصروف: صفرُ خطأ JS', not errs, errs[:3])
        pg.close()

        # ═══ 9) وقتُ دفعة الراتب — الحفظُ بالوقت المختار وإزاحةِ يوم الدفع · بلا وقت ⇒ الآن ═══
        pg, errs = mkpage('payouts.html')
        pg.evaluate(CAPTURE, [])
        res = pg.evaluate("""async () => {
          const out = [];
          try {
            window.__toasts = []; window.showToast = (m) => window.__toasts.push(String(m));
            window.SyDentPayroll = Object.assign(window.SyDentPayroll || {}, { salaryFraction: () => 1 });
            currentUser = { id: 'u1' }; doctors = [{ id: 'pr1', name: 'د. مجد', _hasDoctorLink: true, doctorId: 'd1' }];
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const sel = document.getElementById('fldProvider'); if (sel) sel.innerHTML = '<option value="pr1">د. مجد</option>';
            for (const t of ['14:32', '']) {
              window.__writes = [];
              set('editingId', ''); set('fldProvider', 'pr1'); set('fldPeriodStart', '2026-09-01'); set('fldPeriodEnd', '2026-09-30');
              set('fldPaidAt', '2026-09-21'); set('fldPaidTime', t); set('fldAmount', '1000'); set('fldNotes', '');
              try { _savePayoutInFlight = false; } catch (e) {}
              await savePayout();
              const w = window.__writes.find(x => x.t === 'provider_payouts');
              out.push(w ? w.row.paid_at : null);
              if (!w) out.push('toasts:' + JSON.stringify(window.__toasts || []));
            }
          } catch (e) { return 'ERR ' + e; }
          return out;
        }""")
        ok('الراتب: حُفظت دفعتان', isinstance(res, list) and all(res), res)
        if isinstance(res, list) and all(res):
            ok('الراتب: الوقتُ المختار «14:32» بإزاحة +03:00 ليوم الدفع', res[0] == '2026-09-21T14:32:00+03:00', res[0])
            ok('الراتب: بلا وقت ⇒ الآن بيوم الدفع نفسه', re.fullmatch(r'2026-09-21T\d\d:\d\d:\d\d\+03:00', res[1] or '') is not None, res[1])
        ok('الراتب: صفرُ خطأ JS', not errs, errs[:3])
        pg.close()
        br.close()

run()
print('🧪 العارضات الحقيقية (%d توكيداً): %s' % (N[0], '✅ كل التوكيدات خضر' if not FAILS else '⛔ %d فشل' % len(FAILS)))
for f in FAILS[:40]: print('  ✗ ' + f)
sys.exit(1 if FAILS else 0)

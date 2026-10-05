# -*- coding: utf-8 -*-
# v469 — مثبتُ أزرار الصفوف بالمتصفح (#634: «وحّدتُ الشكل» لا تعني شيئاً حتى تُقاس).
# كلُّ زرٍّ على الطقم بكل صفحةٍ مُرحَّلة يُقاس بالثيمين وبمقاسَي الكمبيوتر والموبايل مقابل
# المرجع — أزرار «طلبات الحجز» كما قيست قبل الترحيل (القيمُ أدناه). قواعدُ الصفحة لا
# تستطيع تشويهَ الزرّ دون أن يحمرّ هذا المثبت.
import os, sys, json, subprocess, shutil
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _fonts.hermetic import hermetic_fonts   # v492
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('⏭️  playwright غير مثبت — تخطّي مثبت أزرار الصفوف'); sys.exit(0)

# المرجعُ مقيساً (appointments.css + theme.css قبل v469، أزرار طلبات الحجز)
GOLD = {
    'light': {'border': 'rgb(179, 195, 211)', 'bg': 'rgb(223, 231, 240)', 'text': 'rgb(16, 42, 67)', 'ico': 'rgb(90, 113, 132)'},
    'dark':  {'border': 'rgba(46, 232, 158, 0.15)', 'bg': 'rgba(0, 0, 0, 0)', 'text': 'rgb(225, 244, 238)', 'ico': 'rgb(138, 154, 181)'},
}
SIZE = {1280: {'h': 32, 'fs': '12.5px', 'ico_w': 32}, 390: {'h': 40, 'fs': '13px', 'ico_w': 44}}

subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'build-harness.js')], check=True, cwd=ROOT, stdout=subprocess.DEVNULL)
pages = json.load(open(os.path.join(ROOT, '_ra', 'pages.json')))
# للتكرار السريع محلياً: RA_ONLY=audit-log,labs يقيس صفحاتٍ بعينها (البوابةُ تقيسها كلها دائماً)
if os.environ.get('RA_ONLY'):
    pages = [p for p in pages if p in os.environ['RA_ONLY'].split(',')]
fails = []; n = [0]
def ok(name, cond, extra=''):
    n[0] += 1
    if not cond: fails.append(name + ((' — ' + str(extra)) if extra else ''))

MEASURE = """() => {
  const probe = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const rows = [...document.querySelectorAll('[data-row]')].map(r => {
    const acts = r.querySelector('.sy-acts');
    const item = acts ? acts.parentElement : null;
    const btns = acts ? [...acts.children].flatMap(c => c.classList.contains('sy-acts-grp') ? [...c.children] : [c]).filter(c => /^(BUTTON|A)$/.test(c.tagName)) : [];   // v486: وأزرارُ المجموعات   // قائمةُ ⋮ المخفية ليست زراً بالصف
    return {
      row: r.dataset.row, mobileHidden: r.dataset.mobileHidden === '1', desktopHidden: r.dataset.desktopHidden === '1', scrollTable: r.dataset.scrollTable === '1',
      titleHidden: [...r.querySelectorAll('.mc-title')].some(t => getComputedStyle(t).display === 'none'),
      actsDisplay: acts ? (acts.getClientRects().length ? getComputedStyle(acts).display : 'none') : 'none',   // مخفيٌّ بأحد أسلافه = مخفي
      actsDir: acts ? getComputedStyle(acts).flexDirection : 'row',
      actsGrid: acts ? acts.classList.contains('sy-acts-grid') : false,
      /* v484: بالجدول تلتصق الأزرارُ بنهاية الصفّ (يساراً) — المسافةُ بين حافّة الحاوية اليسرى وحافّة محتوى الخانة */
      endGap: (acts && item && item.tagName === 'TD' && getComputedStyle(item).display === 'table-cell')
        ? (acts.getBoundingClientRect().left - (item.getBoundingClientRect().left + parseFloat(getComputedStyle(item).paddingLeft))) : null,
      itemRect: item ? item.getBoundingClientRect().toJSON() : null,
      itemContentW: item ? (() => { const cs = getComputedStyle(item); return item.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth); })() : 0,
      actsRect: acts ? acts.getBoundingClientRect().toJSON() : null,
      btns: btns.map(b => { const s = getComputedStyle(b), k = b.getBoundingClientRect();
        return { kit: b.classList.contains('sy-act'), ico: b.classList.contains('sy-act-ico'), more: b.classList.contains('sy-act-more'),
          primary: b.classList.contains('sy-act-primary'), warn: b.classList.contains('sy-act-warn'), danger: b.classList.contains('sy-act-danger'),
          disabled: b.disabled === true, tt: b.classList.contains('time-track-btn') || b.classList.contains('appt-btn-stage'), txt: b.textContent,
          h: k.height, w: k.width, top: k.top, left: k.left, right: k.right,
          clipped: b.scrollWidth > b.clientWidth + 1, pl: s.paddingLeft, pr: s.paddingRight, bw: s.borderTopWidth, bc: s.borderTopColor, br: s.borderTopLeftRadius,
          bg: s.backgroundColor, c: s.color, fs: s.fontSize, fw: s.fontWeight, op: s.opacity, ws: s.whiteSpace }; }) };
  });
  /* v472: ألوانُ التنويعات تُحلّ من توكنات الثيم نفسها بالصفحة (لا قيمٌ محفورة) */
  const tok = (bg, bd, fg) => { const d = document.createElement('button'); d.style.cssText = 'background:' + bg + ';border:1px solid ' + bd + ';color:' + fg;
    document.body.appendChild(d); const s = getComputedStyle(d); const o = { bg: s.backgroundColor, bd: s.borderTopColor, fg: s.color }; d.remove(); return o; };
  return { rows, green: probe('var(--green)'), red: probe('var(--red)'), orange: probe('var(--orange)'), redInk: probe('var(--red-ink)'), greenFg: probe('var(--green-fg)'), orangeInk: probe('var(--orange-ink)'),
           tPrimary: document.documentElement.dataset.theme === 'light' ? tok('var(--green)', 'var(--green)', '#ffffff') : tok('var(--green-bg)', 'var(--green-bd)', 'var(--green-fg)'),
           tPrimaryHover: document.documentElement.dataset.theme === 'light' ? tok('var(--green2)', 'var(--green2)', '#ffffff') : tok('transparent', 'var(--green)', 'var(--green-fg)'), tWarn: tok('var(--orange-bg)', 'var(--orange-bd)', 'var(--orange-ink)'),
           sw: document.documentElement.scrollWidth, vw: window.innerWidth };
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for base in pages:
        for t in ('light', 'dark'):
            for vw in (1280, 390):
                pg = b.new_page(viewport={'width': vw, 'height': 900}); hermetic_fonts(pg)
                errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.goto('file://' + os.path.join(ROOT, '_ra', '%s_%s.html' % (base, t))); pg.wait_for_timeout(150)
                m = pg.evaluate(MEASURE); G = GOLD[t]; S = SIZE[vw]; tag = '%s %s %d' % (base, t, vw)
                ok(tag + ': لا تجاوزَ أفقيّ للصفحة', m['sw'] <= m['vw'] + 1, '%s>%s' % (m['sw'], m['vw']))
                for r in m['rows']:
                    rt = tag + ' [' + r['row'] + ']'
                    if vw == 390 and r['mobileHidden']:
                        ok(rt + ': يبقى مخفياً بالموبايل كما صمّمته الصفحة', r['actsDisplay'] == 'none', r['actsDisplay']); continue
                    if vw == 1280 and r['desktopHidden']:   # بطاقاتُ الموبايل المخفية بالكمبيوتر (المخابر)
                        ok(rt + ': مخفيٌّ بالكمبيوتر كما صمّمته الصفحة', r['actsDisplay'] == 'none', r['actsDisplay']); continue
                    ok(rt + ': الحاويةُ ظاهرة', r['actsDisplay'] != 'none')
                    ok(rt + ': عنوانُ البطاقة ظاهر (mc-title)', not r['titleHidden'])   # v471: عنوانُ بطاقة المخبر كان مخفياً على الهاتف
                    ok(rt + ': فيها أزرار', len(r['btns']) > 0)
                    if not r['btns']: continue
                    for x in r['btns']:
                        bt = rt + ' «' + x['txt'] + '»'
                        ok(bt + ': الارتفاع', abs(x['h'] - S['h']) < 0.6, x['h'])
                        if x['tt']: continue          # زرُّ مرحلة الوقت: استثناءٌ مُعلَن — ارتفاعُ الطقم فقط
                        ok(bt + ': على الطقم', x['kit'])
                        # v472: ثلاثةُ ألوانٍ بمعنى ثابت — أخضر يتقدّم · برتقالي يُعيد · أحمر يحذف؛ الباقي محايدٌ كالمرجع
                        want_bd, want_bg = G['border'], G['bg']
                        if x['primary']: want_bd, want_bg = m['tPrimary']['bd'], m['tPrimary']['bg']
                        if x['warn']:    want_bd, want_bg = m['tWarn']['bd'], m['tWarn']['bg']
                        ok(bt + ': الإطار', x['bw'] == '1px' and x['bc'] == want_bd and x['br'] == '8px', (x['bw'], x['bc'], x['br']))
                        ok(bt + ': الخلفية', x['bg'] == want_bg, x['bg'])
                        ok(bt + ': سطرٌ واحد', x['ws'] == 'nowrap', x['ws'])
                        if x['ico']:
                            ok(bt + ': مقاسُ الأيقونة', abs(x['w'] - S['ico_w']) < 0.6, x['w'])
                            want = ('18px', '700') if x['more'] else ('14px', '400')
                            ok(bt + ': لونُ الأيقونة وخطُّها', x['c'] == G['ico'] and (x['fs'], x['fw']) == want, (x['c'], x['fs'], x['fw']))
                        else:
                            pad = '6px' if r['actsGrid'] else '12px'   # .sy-acts-grid: الأزرار تملأ خلايا الشبكة بحشوة 6px
                            ok(bt + ': الحشوة', x['pl'] == pad and x['pr'] == pad, (x['pl'], x['pr']))
                            want_c = m['tPrimary']['fg'] if x['primary'] else m['orangeInk'] if x['warn'] else m['redInk'] if x['danger'] else G['text']
                            ok(bt + ': النصّ', x['c'] == want_c and x['fs'] == S['fs'] and x['fw'] == '700', (x['c'], x['fs'], x['fw']))
                        ok(bt + ': التسمية كاملة غير مقصوصة', not x['clipped'])
                        ok(bt + ': الشفافية', x['op'] == ('0.4' if x['disabled'] else '1'), x['op'])
                    if vw == 1280 and r['endGap'] is not None:
                        ok(rt + ': الأزرارُ ملتصقةٌ بنهاية الصفّ (يساراً)', abs(r['endGap']) <= 1.0, round(r['endGap'], 1))
                    ok(rt + ': فعلٌ أساسيٌّ أخضر واحدٌ على الأكثر', sum(1 for x in r['btns'] if x['primary']) <= 1)
                    tops = [round(x['top']) for x in r['btns']]
                    if vw == 1280 and r['actsDir'].startswith('row') and not r['actsGrid']:   # عمودُ أزرار بطاقة الموعد عمودٌ بتصميم الصفحة
                        ok(rt + ': الأزرارُ على سطرٍ واحد', max(tops) - min(tops) <= 1, tops)
                    if vw == 390 and r['itemRect'] and r['actsRect'] and not r['scrollTable']:   # جدولُ الرواتب يبقى جدولاً يتمرّر أفقياً بالهاتف — بتصميمه
                        # كالمرجع: بالموبايل تنزل الأزرار لسطرٍ خاصٍّ بعرض البطاقة (لا تُعصَر بجانب النصّ)
                        ok(rt + ': بالموبايل سطرٌ كامل العرض', r['actsRect']['width'] >= r['itemContentW'] * 0.85, (r['actsRect']['width'], round(r['itemContentW'], 1)))
                    if r['itemRect']:
                        L = min(x['left'] for x in r['btns']); Rr = max(x['right'] for x in r['btns'])
                        ok(rt + ': الأزرارُ داخل صفّها', L >= r['itemRect']['left'] - 1 and Rr <= r['itemRect']['right'] + 1, (L, Rr, r['itemRect']['left'], r['itemRect']['right']))
                # التمرير: أخضر للعادي وأحمر للحذف (بالكمبيوتر — الموبايل بلا تمرير)
                if vw == 1280:
                    for sel, want, lbl in (('.sy-act:not(.sy-act-danger):not(.sy-act-primary):not(.sy-act-warn):not(:disabled)', m['green'], 'أخضر'),
                                           ('.sy-act.sy-act-primary', m['green'], 'أخضر (أساسي)'), ('.sy-act.sy-act-warn', m['orange'], 'برتقالي'),
                                           ('.sy-act.sy-act-danger', None, 'أحمر')):
                        el = pg.query_selector('[data-row]:not([data-mobile-hidden]):not([data-desktop-hidden]) ' + sel)
                        if el:
                            try:
                                el.hover(timeout=3000)
                            except Exception:
                                ok(tag + ': التمرير ' + lbl + ' — الزرُّ لا يُبلَغ بالمؤشّر (عنصرٌ يغطّيه)', False); continue
                            pg.wait_for_timeout(260)
                            got = pg.evaluate("(e)=>{const s=getComputedStyle(e);return [s.borderTopColor,s.color,s.backgroundColor]}", el)
                            if want is None:      # الحذف: إطارٌ وخلفيةٌ حمراوان ونصٌّ أحمر
                                okd = pg.evaluate("(e)=>{const p=document.createElement('button');p.style.cssText='border:1px solid var(--red-bd);background:var(--red-bg)';document.body.appendChild(p);const s=getComputedStyle(p);const r=[s.borderTopColor,s.backgroundColor];p.remove();return r}", el)
                                ok(tag + ': التمرير ' + lbl, got[0] == okd[0] and got[2] == okd[1] and got[1] == m['redInk'], got)
                            elif lbl.startswith('أخضر ('):
                                ok(tag + ': التمرير ' + lbl, got[0] == m['tPrimaryHover']['bd'] and got[1] == m['tPrimaryHover']['fg'], got)   # v479: الفاتح مُصمَتٌ أغمق
                            elif lbl == 'برتقالي':
                                ok(tag + ': التمرير ' + lbl, got[0] == want and got[1] == m['orangeInk'], got)
                            else:
                                ok(tag + ': التمرير ' + lbl, got[0] == want and got[1] == want, got)
                            pg.mouse.move(2, 2)
                # v482: الخاناتُ الثابتة (.sy-slots) — عبر صفوف الجدول الواحد كلُّ خانةٍ بعمودها: الحذفُ فوق الحذف
                #       والتعديلُ فوق التعديل، والممتدُّ (data-span=2) يغطّي خانةَ جارته حتى حافّتها (طلب المالك).
                if vw == 1280:
                    groups = pg.evaluate("""() => {
                      const G = new Map();
                      document.querySelectorAll('[data-slot-row]').forEach(r => {
                        const acts = r.querySelector('.sy-acts.sy-slots'); if (!acts || !acts.getClientRects().length) return;
                        const tpl = acts.getAttribute('style') || '';
                        const key = r.parentElement; if (!key._gid) key._gid = Math.random();
                        const gk = key._gid + '|' + tpl;   // جدولٌ واحد بقالبِ خاناتٍ واحد
                        let g = G.get(gk); if (!g) { g = { tpl, rows: [] }; G.set(gk, g); }
                        g.rows.push({ row: r.dataset.row, disp: getComputedStyle(acts).display,
                          btns: [...acts.children].filter(c => c.dataset.slot).map(c => { const k = c.getBoundingClientRect();
                            return { slot: c.dataset.slot, span: c.dataset.span || '1', L: k.left, R: k.right, t: c.textContent.trim() }; }) });
                      });
                      return [...G.values()];
                    }""")
                    for g in groups:
                        names = '+'.join(r['row'] for r in g['rows'])
                        ok(tag + ' [' + names + ']: الخاناتُ شبكةٌ ثابتة', all(r['disp'] in ('inline-grid', 'grid') for r in g['rows']), [r['disp'] for r in g['rows']])
                        by = {}
                        for r in g['rows']:
                            for x in r['btns']: by.setdefault(x['slot'], []).append(x)
                        for sl, xs in sorted(by.items()):
                            Rs = [round(x['R'], 1) for x in xs]
                            ok(tag + ' [' + names + '] الخانة ' + sl + ': كلُّ أزرارها بعمودٍ واحد', max(Rs) - min(Rs) <= 0.75, [(x['t'], round(x['R'], 1)) for x in xs])
                            one = [round(x['L'], 1) for x in xs if x['span'] == '1']
                            if len(one) > 1: ok(tag + ' [' + names + '] الخانة ' + sl + ': بعرضٍ واحد', max(one) - min(one) <= 0.75, one)
                        if '2' in by:
                            s2L = min(x['L'] for x in by['2'])
                            for x in by.get('1', []):
                                if x['span'] == '2': ok(tag + ' [' + names + ']: «' + x['t'] + '» يمتدّ فوق خانة جارته حتى حافّتها', abs(x['L'] - s2L) <= 0.75, (round(x['L'], 1), round(s2L, 1)))
                        ordered = sorted(by.keys())
                        for a_, b_ in zip(ordered, ordered[1:]):   # بالعربية: الخانةُ التالية يسارَ سابقتها
                            aL = [x['L'] for x in by[a_] if x['span'] == '1']   # الممتدُّ يغطّي خانةَ جارته عمداً
                            if aL: ok(tag + ' [' + names + ']: الخانة ' + b_ + ' يسارَ ' + a_, max(x['R'] for x in by[b_]) <= min(aL) + 0.75)
                # v474: كلُّ زرٍّ ظاهر قابلٌ للنقر فعلاً — يُمرَّر إلى الشاشة ثم elementFromPoint بمركزه
                unreach = pg.evaluate("""() => [...document.querySelectorAll('[data-row] .sy-acts > button, [data-row] .sy-acts > a, [data-row] .sy-acts > .sy-acts-grp > button, [data-row] .sy-acts > .sy-acts-grp > a')]
                  .filter(b => getComputedStyle(b).display !== 'none' && b.getClientRects().length)
                  .filter(b => { b.scrollIntoView({ block: 'center', inline: 'center' }); const k = b.getBoundingClientRect();
                    const h = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2); return !(h && (h === b || b.contains(h))); })
                  .map(b => (b.closest('[data-row]').dataset.row) + ' «' + b.textContent.trim() + '»')""")
                ok(tag + ': كلُّ زرٍّ ظاهر قابلٌ للنقر (لا عنصرَ يغطّيه)', not unreach, unreach)
                # v486: فاصلُ المجموعات — خطٌّ رأسيٌّ رفيع بالكمبيوتر، وفاصلُ سطرٍ بالهاتف (كلُّ مجموعةٍ تبدأ سطرَها)
                seps = pg.evaluate("""() => [...document.querySelectorAll('[data-row] .sy-acts > .sy-acts-sep')].filter(x => x.getClientRects().length).map(x => {
                  const k = x.getBoundingClientRect(), a = x.parentElement.getBoundingClientRect(), n = x.nextElementSibling ? x.nextElementSibling.getBoundingClientRect() : null,
                        p = x.previousElementSibling ? x.previousElementSibling.getBoundingClientRect() : null;
                  return { w: k.width, h: k.height, aw: a.width, nextBelow: (n && p) ? n.top >= p.bottom - 0.5 : true }; })""")
                for i_, x in enumerate(seps):
                    if vw == 1280: ok(tag + ' فاصل ' + str(i_ + 1) + ': خطٌّ رأسيٌّ رفيع', x['w'] <= 1.5 and x['h'] >= 16, (x['w'], x['h']))
                    else: ok(tag + ' فاصل ' + str(i_ + 1) + ': المجموعةُ التالية تبدأ سطرَها', x['nextBelow'], x)
                ok(tag + ': صفر خطأ JS', not errs, errs)
                pg.close()
        # v470: شريطُ العرض بالصفحة (إن وُجد) — لا تبويبَ مقصوص ولا شارةَ خارج الشريط، من أضيق هاتف للكمبيوتر
        for t in ('light', 'dark'):
            for vw in (320, 360, 375, 390, 414, 560, 600, 820, 1024, 1280):
                pg = b.new_page(viewport={'width': vw, 'height': 700}); hermetic_fonts(pg)
                pg.goto('file://' + os.path.join(ROOT, '_ra', '%s_%s.html' % (base, t))); pg.wait_for_timeout(100)
                v = pg.evaluate("""() => { const tg = document.querySelector('.view-toggle'); if (!tg) return null;
                  const r = tg.getBoundingClientRect();
                  const bs = [...tg.querySelectorAll('.view-btn')].map(x => { const k = x.getBoundingClientRect();
                    return { t: x.textContent.trim(), clip: x.scrollWidth > x.clientWidth + 1, h: k.height, l: k.left, r: k.right }; });
                  const bad = [...tg.querySelectorAll('[id$=Badge]')].map(x => x.getBoundingClientRect()).filter(k => k.width > 0);
                  const lh = parseFloat(getComputedStyle(tg.querySelector('.view-btn')).lineHeight) || 22;
                  return { l: r.left, r: r.right, vw: innerWidth, bs, badIn: bad.every(k => k.left >= r.left - .5 && k.right <= r.right + .5),
                           oneLine: bs.every(x => x.h <= 46) }; }""")
                if v is None: pg.close(); continue
                tag = '%s %s %d شريط العرض' % (base, t, vw)
                ok(tag + ': داخل الشاشة', v['l'] >= -0.5 and v['r'] <= v['vw'] + 0.5, (v['l'], v['r']))
                ok(tag + ': لا تبويبَ مقصوص', not any(x['clip'] for x in v['bs']), [x['t'] for x in v['bs'] if x['clip']])
                ok(tag + ': كلُّ تبويبٍ بسطرٍ واحد', v['oneLine'], [(x['t'], x['h']) for x in v['bs']])
                ok(tag + ': الشاراتُ كاملةٌ داخل الشريط', v['badIn'])
                pg.close()
    b.close()
shutil.rmtree(os.path.join(ROOT, '_ra'), ignore_errors=True)
for f in fails[:25]: print('  ✗ ' + f)
print('🧩 مثبت أزرار الصفوف (%d توكيداً):' % n[0], ('⛔ ' + str(len(fails)) + ' فشل') if fails else '✅ كل التوكيدات خضر')
sys.exit(1 if fails else 0)

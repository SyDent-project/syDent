#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SyDent — مثبت DOM حيّ لمودال السن (مخطط الأسنان).

لماذا: كل مثبتاتنا قبل v432 نصّية (regex) أو داخل vm — تثبت أن الكودَ مكتوبٌ صحيحاً،
ولا واحدٌ منها ينقر زراً. جولةُ الحالات السريرية شُحنت خضراءَ بالكامل ثم قال المالك
«ما في شي»: لا حارسَ كان يستطيع أن يجيب عنه بآلة. هذا المثبت يسدّ تلك الفجوة —
يركّب مودالَ السن **المقتطَع من patient-profile.html نفسه** فوق ملفات pp-*.js
الحقيقية، ثم ينقر كما ينقر الطبيب: فتحُ السن ← شريحةُ «حالات سريرية» ← «كسر» ←
«حفظ كجلسة»، ويلتقط كل كتابةٍ وكل خطأ JS.

التشغيل:  python3 scripts/dom-smoke/run.py
المتطلّب: playwright + chromium. غيرُ متوفّر ⇒ خروجٌ بـ0 مع «تخطّي» (نمط حارس acorn).
"""
import json
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fonts.hermetic import hermetic_fonts   # v492
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

try:
    from playwright.sync_api import sync_playwright
except Exception:
    print("⏭️  playwright غير مثبت — تخطّي مثبت DOM")
    sys.exit(0)

subprocess.run(["node", str(HERE / "build-harness.js")], check=True, capture_output=True)
HARNESS = HERE / ".out" / "harness.html"

fails = []
oks = []


def check(name, cond, detail=""):
    (oks if cond else fails).append(name + ((" — " + str(detail)) if (detail and not cond) else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1100, "height": 900})
    hermetic_fonts(page)   # v492: خطٌّ محلي حتمي
    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.goto("file://" + str(HARNESS))
    page.wait_for_timeout(250)

    opened = page.evaluate("""async () => {
      await openToothModal(21, 'B');
      return { tabs: Array.from(document.querySelectorAll('#txTabs .tx-tab')).map(b => b.textContent.trim()),
               conds: _txAllowed.filter(t => t.is_condition).length,
               break: !!document.querySelector('#txTabs .tx-tabs-break'),
               lead: !!document.querySelector('#txTabs .tx-cond-lead'),
               errors: window.__ERRORS };
    }""")
    check("المودال يفتح بلا خطأ JS", not opened["errors"] and not page_errors, opened["errors"] or page_errors)
    check("شريحة «حالات سريرية» تظهر بشريط الشرائح",
          any("حالات سريرية" in t for t in opened["tabs"]), opened["tabs"])
    check("شريحةُ الحالات آخرَ الشريط بسطرها المستقل (v433: «حطها لحالها»)",
          len(opened["tabs"]) > 1 and "حالات سريرية" in opened["tabs"][-1], opened["tabs"])
    check("سطرُ الفصل وعنوانُ «وسمٌ سريري» فوقها", opened["break"] and opened["lead"], opened)
    check("المكتبةُ الأربع عشرة داخل قائمة العلاجات المسموحة (C3: +غير بازغ · v578: +تسوس/تآكل/انزياح · v580: +سن زائد)", opened["conds"] == 14, opened["conds"])
    # ── v577 (قرار المالك بصورة، 5 ت١ 2026): نافذةُ السن بمنتصف الشاشة دائماً على الحاسوب — لا إرساءَ جانبياً ──
    cen = page.evaluate("""async () => {
      /* المخططُ مرسومٌ فعلاً (وإلا فالإرساءُ يخرج مبكراً ولا يُقاس شيء) — سنٌّ بأقصى اليمين وأخرى بأقصى اليسار */
      renderTeeth(); try { renderOcclusal(); } catch (e) {}
      const r = {};
      for (const n of [18, 28]) {
        closeModal('toothModal'); await openToothModal(n, 'B');
        const m = document.getElementById('toothModal'), b = m.querySelector('.modal-box').getBoundingClientRect();
        r[n] = { dx: Math.abs((b.left + b.width / 2) - window.innerWidth / 2), cls: m.className, sel: document.querySelectorAll('.pp-tooth-sel').length };
      }
      closeModal('toothModal'); await openToothModal(21, 'B');
      return r;
    }""")
    check("v577: نافذةُ السن بمنتصف الشاشة لسنٍّ بأقصى اليمين وأخرى بأقصى اليسار (لا إرساءَ جانبياً)",
          all(v["dx"] < 4 and "pp-dock-left" not in v["cls"] and "pp-dock-right" not in v["cls"] and "pp-dock" in v["cls"] and v["sel"] > 0 for v in cen.values()), cen)

    tab = page.evaluate("""() => {
      switchTxTab('condition');
      const c = document.getElementById('toothOptsContainer');
      return { buttons: Array.from(c.querySelectorAll('button.topt')).map(b => b.textContent.trim()),
               hint: !!c.querySelector('.tx-cond-hint'), errors: window.__ERRORS };
    }""")
    named = [b for b in tab["buttons"] if "سليم" not in b]
    check("نقرُ الشريحة يعرض الحالات الأربع عشرة فعلاً", len(named) == 14, tab["buttons"])
    check("سطرُ التعريف فوق الشبكة", tab["hint"])

    if len(named) != 14:
        # لا جدوى من متابعة النقر بلا أزرار — تقريرٌ نظيف بدل انهيار
        for o in oks:
            print("  ✓ " + o)
        for f in fails:
            print("  ✗ " + f)
        print("⛔ مثبت DOM: " + str(len(fails)) + " فشل — الحالاتُ لا تظهر للطبيب أصلاً")
        browser.close()
        sys.exit(1)

    pick = page.evaluate("""() => {
      const c = document.getElementById('toothOptsContainer');
      const btn = Array.from(c.querySelectorAll('button.topt')).find(b => b.textContent.indexOf('قلح') >= 0);
      btn.click();
      const opts = Array.from(document.querySelectorAll('#toothStatusPicker .status-opt'));
      return { step2: document.getElementById('toothStep2').style.display,
               surface: currentSurface, status: pendingTreatStatus, key: pendingToothStatus,
               cost: document.getElementById('toothCost').value,
               costLocked: document.getElementById('toothCost').readOnly,
               visibleStatuses: opts.filter(b => b.style.display !== 'none').map(b => b.getAttribute('data-status')),
               review: document.getElementById('condReviewBox').style.display,
               errors: window.__ERRORS };
    }""")
    check("النقرُ يفتح الخطوة الثانية", pick["step2"] == "block", pick)
    check("v434: الحالةُ السطحية تُسجَّل على السطح المنقور لا على مركز التاج",
          pick["surface"] == "B", pick["surface"])
    check("الحالةُ مقفولةٌ على «مراقبة»", pick["status"] == "condition" and pick["visibleStatuses"] == ["condition"], pick)
    check("التكلفةُ صفرٌ ومقفولة", pick["cost"] == "0" and pick["costLocked"], pick)
    check("شرائحُ موعد المراجعة مخفية", pick["review"] == "none", pick["review"])

    saved = page.evaluate("""async () => {
      window.confirm = () => true;
      await saveToothTreatment();
      return { writes: window.__WRITES, toasts: window.__TOASTS, tooth: teethMap['21'] || null, errors: window.__ERRORS };
    }""")
    tables = [w["table"] for w in saved["writes"]]
    ts = [w for w in saved["writes"] if w["table"] == "teeth_status"]
    check("صفرُ سطرٍ بالسجل المالي", "ledger_sessions" not in tables, tables)
    check("كتابةٌ واحدة على teeth_status", len(ts) == 1, tables)
    if ts:
        pl = ts[0]["payload"]
        check("الحمولة: السطحُ المنقور · status=condition · review_at=null",
              pl.get("surface") == "B" and pl.get("status") == "condition" and pl.get("review_at") is None, pl)
        check("مفتاحُ الحالة يصل القاعدة", pl.get("treatment_key") == "cond-calculus", pl)
    check("التوستُ لا يسرّب رمزَ السطح الداخلي",
          all("COND" not in t for t in saved["toasts"]), saved["toasts"])
    check("المرآةُ المحلية تحمل الحالة على سطحها",
          bool(saved["tooth"]) and saved["tooth"].get("B") == "cond-calculus", saved["tooth"])
    check("صفرُ خطأ JS بكل الرحلة", not saved["errors"] and not page_errors, saved["errors"] or page_errors)

    drawn = page.evaluate("""() => {
      const html = buildTooth(21, chartFilterSM(teethMap['21']), true);
      /* v581: دهليزيُّ الأمامي لا يُرى من الأعلى — يُقاس «يُرى من الأعلى» على خلفيٍّ بالقلح نفسه */
      const occ = buildOcclusalTooth(27, { B: 'cond-calculus', __status: { B: 'condition' } }, true);
      const occAnt = buildOcclusalTooth(21, chartFilterSM(teethMap['21']), true);
      const anat = toothAnatomy(21);
      const bRect = anat.surfaces.B;
      const aSurf = condAnchorFor(anat, 'B', getCondition('cond-calculus'));
      const aTooth = condAnchorFor(anat, 'COND', getCondition('cond-abscess'));
      const aRoot = condAnchorFor(anat, 'R1', getCondition('cond-fracture'));
      return { facial: html.indexOf('cond-sym') >= 0, occ: occ.indexOf('cond-sym') >= 0, occAnt: occAnt.indexOf('cond-sym') >= 0,
               tipSurface: html.indexOf('دهليزي') >= 0 && html.indexOf('قلح') >= 0,
               onBRect: Math.abs(aSurf.y - (bRect.y + bRect.h / 2)) < 0.01,
               apexBelowCrown: aTooth.y > anat.cervicalY,
               rootAnchored: aRoot.y > anat.cervicalY && Math.abs(aRoot.x - 50) < 40 };
    }""")
    check("الرمزُ يُرسم بالمنظر الوجهي", drawn["facial"])
    check("v594: خريطةُ السطوح — حالةُ الدهليزي تُرسم من الأعلى على حزام B بالخلفي (كالحشوة) · لا بالأمامي · ووجهياً دائماً", drawn["occ"] and not drawn["occAnt"] and drawn["facial"])
    check("التلميحُ يسمّي السطحَ والحالة", drawn["tipSurface"])
    check("v434: مرساةُ الحالة السطحية على مستطيل سطحها بالضبط", drawn["onBRect"])
    check("v434: الخراجُ يُرسم عند ذروة الجذر لا بالتاج", drawn["apexBelowCrown"])
    check("v434: كسرُ الجذر يُرسم على الجذر", drawn["rootAnchored"])

    # ── v435: حالتان تغيّران تشريحَ الرسم، وتسمياتٌ علمية ──
    anat = page.evaluate("""() => {
      const T = { '11': {}, '12': { V: 'cond-recession', __status: { V: 'condition' } },
                  '13': { COND: 'cond-retained', __status: { COND: 'condition' } } };
      teethMap = T; const _t = rebuildToothMaps(); T_FILL = _t.fill; T_STROKE = _t.stroke;
      const read = (n) => {
        const h = buildTooth(n, chartFilterSM(teethMap[String(n)] || {}), true);
        const o = buildOcclusalTooth(n, chartFilterSM(teethMap[String(n)] || {}), true);
        const m = /class="gum-line" d="M [\\-0-9.]+ ([0-9.]+)/.exec(h);
        return { gum: m ? parseFloat(m[1]) : null, crownFill: h.indexOf('url(#cg') >= 0,
                 cej: h.indexOf('rgba(120,75,35,0.35)') >= 0,
                 roots: (h.match(/class="root-part"/g) || []).length,
                 hits: (h.match(/class="crown-surface"/g) || []).length,
                 occDashed: /stroke-dasharray="4 3"/.test(o), occSym: o.indexOf('cond-sym') >= 0 };
      };
      return { plain: read(11), recess: read(12), retained: read(13),
               names: COND_LIBRARY.map(c => c.name) };
    }""")
    check("v435: «انحسار لثوي» هو الاسم العلمي (لا «ارتداد») و«حساسية عاجية»",
          any("انحسار لثوي" in n for n in anat["names"])
          and not any("ارتداد" in n for n in anat["names"])
          and any("حساسية عاجية" in n for n in anat["names"]), anat["names"])
    check("v435: الانحسارُ يُزيح خطَّ اللثة المرسوم نحو الذروة فعلاً",
          anat["recess"]["gum"] is not None and anat["plain"]["gum"] is not None
          and anat["recess"]["gum"] - anat["plain"]["gum"] == 12, [anat["plain"]["gum"], anat["recess"]["gum"]])
    check("v435: خطُّ الـCEJ التشريحي لا يتحرّك مع الانحسار", anat["recess"]["cej"])
    check("v435: الجذرُ المتبقّي — لا تاجَ ولا مينا ولا خطَّ CEJ",
          (not anat["retained"]["crownFill"]) and (not anat["retained"]["cej"]), anat["retained"])
    check("v435: الجذرُ المتبقّي — الجذورُ تبقى مرسومة والسنُّ يبقى قابلاً للنقر",
          anat["retained"]["roots"] > 0 and anat["retained"]["hits"] > 0, anat["retained"])
    check("v435/437: الجذرُ المتبقّي إطباقياً — ظلٌّ منقّطٌ بلا مينا وبلا رمز",
          anat["retained"]["occDashed"] and not anat["retained"]["occSym"], anat["retained"])
    check("v435: سنٌّ سليمٌ لم يتغيّر (تاجٌ ومينا وخطُّ لثةٍ بمكانه)",
          anat["plain"]["crownFill"] and anat["plain"]["cej"] and anat["plain"]["gum"] is not None, anat["plain"])

    # ── v437: شكلُ الانحسار القديم بموضعٍ جديد · المنطمر أعلى وأصغر · لا رموزَ إطباقية · وارتفاعُ السن المنطمر وتصغيرُ ظلّه ──
    v437 = page.evaluate("""() => {
      teethMap = { '12': { V: 'cond-recession', __status: { V: 'condition' } },
                   '42': { V: 'cond-recession', __status: { V: 'condition' } },
                   '15': { COND: 'cond-impacted', __status: { COND: 'condition' } },
                   '11': {} };
      const _t = rebuildToothMaps(); T_FILL = _t.fill; T_STROKE = _t.stroke;
      const up12 = buildTooth(12, chartFilterSM(teethMap['12']), true);
      const lo42 = buildTooth(42, chartFilterSM(teethMap['42']), false);
      const imp = buildTooth(15, chartFilterSM(teethMap['15']), true);
      const impLo = buildTooth(15, chartFilterSM(teethMap['15']), false);
      const plain = buildTooth(11, chartFilterSM(teethMap['11']), true);
      const occImp = buildOcclusalTooth(15, chartFilterSM(teethMap['15']), true);
      const occPlain = buildOcclusalTooth(11, chartFilterSM(teethMap['11']), true);
      const symG = (h) => { const m = /<g class="cond-sym"([^>]*)>/.exec(h); return m ? m[1] : null; };
      const a12 = toothAnatomy(12);
      const anc = condAnchorFor(a12, 'V', getCondition('cond-recession'));
      const impShiftOf = (h) => { const m = /translate\\(0,([0-9.]+)\\)"/.exec(h); return m ? parseFloat(m[1]) : 0; };
      const impCan = buildTooth(13, { COND: 'cond-impacted', __status: { COND: 'condition' } }, true);
      return { triUp: symG(up12), triLo: symG(lo42),
               chevron: /<path d="M [^"]*L [^"]*L [^"]*" fill="none"/.test(up12) && /<line x1=/.test(up12),
               anchorOnCej: anc.y > a12.cervicalY && anc.y < a12.cervicalY + 12,
               impShift: impShiftOf(impLo),
               impCanine: impShiftOf(impCan), canineRootBot: toothAnatomy(13).rootBot,
               plainT: /<g transform="translate\\(0,210\\) scale\\(1,-1\\)"/.test(plain),
               occImp: /occ-impacted" transform="translate\\(50,50\\) scale\\(0\\.5\\)/.test(occImp),
               occImpWraps: occImp.indexOf('occ-impacted') < occImp.indexOf('url(#en'),
               occRetNoEnamel: (function(){ const h = buildOcclusalTooth(13, { COND: 'cond-retained', __status: { COND: 'condition' } }, true); return h.indexOf('url(#en') < 0 && /stroke-dasharray="4 3"/.test(h); })(),
               occImpClosed: (occImp.match(/<g /g) || []).length === (occImp.match(/<\\/g>/g) || []).length,
               occPlain: occPlain.indexOf('occ-impacted') < 0 };
    }""")
    check("v437: رمزُ الانحسار عاد لشكله القديم (سهمٌ تحت خطِّ الحافة) بالقلب المضاد",
          v437["chevron"] and v437["triUp"] is not None and "scale(1,-1)" in v437["triUp"], v437)
    check("v437: موضعُه صار بين التاج والجذر (بشريط الجذر المنكشف)",
          v437["anchorOnCej"], v437)
    check("v437: المنطمرُ ارتفع أكثر (26) ومقصوصٌ بطول الجذر فلا تُقطع الذروة",
          v437["impShift"] == 26 and v437["impCanine"] <= 206 - v437["canineRootBot"] + 0.01
          and v437["impCanine"] > 0, v437)
    check("v437: ظلُّ المنطمر الإطباقي أصغر (0.5) والمجموعةُ مغلقة",
          v437["occImp"] and v437["occImpClosed"] and v437["occPlain"], v437)
    check("v437: مجموعةُ التصغير تلفّ رسمَ السن فعلاً (لا ذيلَه فقط)", v437["occImpWraps"], v437)
    check("v437: الجذرُ المتبقّي إطباقياً بلا مينا إطلاقاً (الفرعُ قبل أول خطٍّ يُرسم)",
          v437["occRetNoEnamel"], v437)

    # ── C3 (v489): «غير بازغ» — بمكانه باهتاً بحدٍّ منقّط، ورمزُه خارج التعتيم، ولا بريو ──
    c3 = page.evaluate("""() => {
      teethMap = { '17': { COND: 'cond-unerupted', __status: { COND: 'condition' } },
                   '15': { COND: 'cond-unerupted', WHOLE: 'extracted', __status: { COND: 'condition', WHOLE: 'planned' } },
                   '18': {}, '16': { COND: 'cond-impacted', __status: { COND: 'condition' } } };
      const _t = rebuildToothMaps(); T_FILL = _t.fill; T_STROKE = _t.stroke;
      const f17 = buildTooth(17, chartFilterSM(teethMap['17']), true);
      const f15 = buildTooth(15, chartFilterSM(teethMap['15']), true);
      const f18 = buildTooth(18, chartFilterSM(teethMap['18']), true);
      const o17 = buildOcclusalTooth(17, chartFilterSM(teethMap['17']), true);
      const o18 = buildOcclusalTooth(18, chartFilterSM(teethMap['18']), true);
      /* تُقاس البنيةُ بمحلّلٍ حقيقي لا بمواضع النصّ — «أولُ </g>» قد يكون مجموعةً داخلية
         (الطفرةُ التي أدخلت الرمزَ داخل التعتيم مرّت من القياس النصّي؛ القاعدة #640). */
      const P = (h) => new DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
      const d17 = P(f17), d15 = P(f15);
      const iFade = f17.indexOf('class="tooth-unerupted"'), iClose = 1, iSym = 2, iDash = f17.indexOf('unerupted-outline');
      const fadeEl = d17.querySelector('.tooth-unerupted');
      const shift = (h) => { const m = /<g transform="translate\\(0,210\\) scale\\(1,-1\\)( translate\\(0,([0-9.]+)\\))?"/.exec(h); return m ? (m[2] ? parseFloat(m[2]) : 0) : null; };
      return {
        fade: iFade > 0 && /opacity="0\\.38"/.test(f17.slice(iFade, iFade + 80)),
        symOutsideFade: !!fadeEl && !!d17.querySelector('.cond-sym') && !fadeEl.querySelector('.cond-sym')
                        && !!fadeEl.querySelector('.root-part'),
        dashed: !!d17.querySelector('.unerupted-outline') && !fadeEl.querySelector('.unerupted-outline')
                && d17.querySelector('.unerupted-outline').getAttribute('stroke-dasharray') === '4 3',
        uSym: /class="cond-sym"[^>]*>\\s*<path d="M [^"]* Q [^"]* Q /.test(f17),
        notShifted: shift(f17) === 0,
        plannedXCrisp: !!d15.querySelector('.planned-x') && !!d15.querySelector('.tooth-unerupted')
                       && !d15.querySelector('.tooth-unerupted .planned-x'),
        plainUntouched: f18.indexOf('tooth-unerupted') < 0 && f18.indexOf('unerupted-outline') < 0,
        occWrapsEnamel: o17.indexOf('occ-unerupted') > 0 && o17.indexOf('occ-unerupted') < o17.indexOf('url(#en'),
        occClosed: (function(){ const od = P(o17); return !od.querySelector('parsererror') && !!od.querySelector('.occ-unerupted')
                        && !!od.querySelector('.occ-unerupted [fill^="url(#en"]') && !od.querySelector('.occ-unerupted .unerupted-outline'); })(),
        occNoSym: o17.indexOf('cond-sym') < 0 && o17.indexOf('unerupted-outline') > 0,
        occPlain: o18.indexOf('occ-unerupted') < 0,
        perio17: perioIsExtracted(17), perio15: perioIsExtracted(15), perio18: perioIsExtracted(18), perio16: perioIsExtracted(16),
        name: (getCondition('cond-unerupted') || {}).name, scope: (getCondition('cond-unerupted') || {}).cond_scope
      };
    }""")
    check("C3: «غير بازغ» عنصرٌ سنّيٌّ بالمكتبة باسمه", c3["name"] == "غير بازغ" and c3["scope"] == "tooth", c3)
    check("C3: الجسمُ باهتٌ (0.38) بمكانه — لا إزاحةَ كالمنطمر", c3["fade"] and c3["notShifted"], c3)
    check("C3: رمزُ «U» والحدُّ المنقّط خارج التعتيم (بكامل وضوحهما)",
          c3["symOutsideFade"] and c3["dashed"] and c3["uSym"], c3)
    check("C3: ✕ القلع المخطّط فوق سنٍّ غير بازغ يبقى واضحاً (خارج التعتيم)", c3["plannedXCrisp"], c3)
    check("C3: إطباقياً — ظلٌّ باهتٌ يلفّ المينا وحدٌّ منقّط، بلا رمز، والمجموعةُ مغلقة",
          c3["occWrapsEnamel"] and c3["occClosed"] and c3["occNoSym"], c3)
    check("C3: البريو يستثني غيرَ البازغ (ولو عليه قلعٌ مخطّط) ويُبقي السليمَ والمنطمر",
          c3["perio17"] and c3["perio15"] and not c3["perio18"] and not c3["perio16"], c3)
    check("C3: سنٌّ سليمٌ لم يتغيّر بالمنظرين", c3["plainUntouched"] and c3["occPlain"], c3)

    # ── v576: التماسُ المفتوح بين سنّين · الكسرُ إطباقياً · سهمُ الانطمار ذرويّ (بلاغ المالك بصورة، 5 ت١ 2026) ──
    v576 = page.evaluate("""() => {
      const P = (h) => new DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
      const set = (m) => { teethMap = m; const t = rebuildToothMaps(); T_FILL = t.fill; T_STROKE = t.stroke; };
      const F = (n, up) => P(buildTooth(n, chartFilterSM(teethMap[String(n)] || {}), up));
      const O = (n, up) => P(buildOcclusalTooth(n, chartFilterSM(teethMap[String(n)] || {}), up));
      const xs = (d) => Array.from(d.querySelectorAll('.cond-contact')).map(l => parseFloat(l.getAttribute('x1')));
      const r = {};
      set({ '16': { M: 'cond-open-contact', __status: { M: 'condition' } }, '15': {}, '17': {} });
      r.own = xs(F(16, true)).length === 1 && xs(F(16, true))[0] > 50 && F(16, true).querySelectorAll('.cond-sym').length === 0;
      r.neighbor = xs(F(15, true)).length === 1 && xs(F(15, true))[0] < 50 && xs(F(17, true)).length === 0;
      r.occPair = xs(O(16, true)).length === 1 && xs(O(16, true))[0] > 50 && xs(O(15, true)).length === 1 && xs(O(15, true))[0] < 50;
      set({ '11': { M: 'cond-open-contact', __status: { M: 'condition' } }, '21': {}, '55': { D: 'cond-open-contact', __status: { D: 'condition' } }, '16': {} });
      r.midlineMixed = xs(F(21, true)).length === 1 && xs(F(21, true))[0] < 50 && xs(F(16, true)).length === 1 && xs(F(16, true))[0] > 50;
      set({ '16': { D: 'cond-fracture', __status: { D: 'condition' } }, '26': { R1: 'cond-fracture', __status: { R1: 'condition' } }, '21': { B: 'cond-calculus', __status: { B: 'condition' } } });
      const of = O(16, true), fp = of.querySelector('.cond-sym path');
      r.occFracture = of.querySelectorAll('.cond-sym').length === 1 && !!fp && parseFloat(/M ([0-9.]+)/.exec(fp.getAttribute('d'))[1]) < 30 && F(16, true).querySelectorAll('.cond-sym').length === 1;
      r.occOnlyFlagged = O(26, true).querySelectorAll('.cond-sym').length === 0 && O(21, true).querySelectorAll('.cond-sym').length === 0;   /* v578/581: كسرُ الجذر لا · دهليزيُّ الأمامي لا يُرى من الأعلى */
      set({ '35': { COND: 'cond-impacted', __status: { COND: 'condition' } }, '15': { COND: 'cond-impacted', __status: { COND: 'condition' } }, '13': { COND: 'cond-abscess', __status: { COND: 'condition' } } });
      const arrow = (d) => { const p = d.querySelector('.cond-sym path'); const m = /M [0-9.\\-]+ ([0-9.\\-]+) L [0-9.\\-]+ ([0-9.\\-]+)/.exec(p.getAttribute('d')); return { down: (+m[2]) > (+m[1]), flip: /scale\\(1,-1\\)/.test(d.querySelector('.cond-sym').getAttribute('transform') || '') }; };
      const lo = arrow(F(35, false)), up = arrow(F(15, true));
      r.arrowApical = lo.down && !lo.flip && up.down && !up.flip && /scale\\(1,-1\\)/.test(F(15, true).querySelector('svg > g').getAttribute('transform'));
      r.othersFlipped = /scale\\(1,-1\\)/.test(F(13, true).querySelector('.cond-sym').getAttribute('transform') || '');
      return r;
    }""")
    check("v576: التماسُ المفتوح — خطٌّ واحد على حافّة السطح المنقور (لا رمزٌ بخطّين)", v576["own"], v576)
    check("v576: الجارُ يرسم خطَّه على حافّته المقابلة، والسنُّ البعيد لا يُمسّ", v576["neighbor"], v576)
    check("v576: الزوجُ نفسه بالمنظر الإطباقي", v576["occPair"], v576)
    check("v576: عبر الخطِّ الناصف (11↔21) والتسنينِ المختلط (55↔16)", v576["midlineMixed"], v576)
    check("v576: كسرُ سطح التاج يُرسم إطباقياً بمكان سطحه ويبقى وجهياً", v576["occFracture"], v576)
    check("v576/578: كسرُ الجذر بلا رمزٍ إطباقي (غيرُ مرئي)، وحالةُ السطح تُرى من الأعلى", v576["occOnlyFlagged"], v576)
    check("v576: سهمُ الانطمار نحو الذروة بالفكين (سفلي ↓ · علوي ↑ بقلب المجموعة وحده)", v576["arrowApical"], v576)
    check("v576: بقيةُ الرموز تحتفظ بالقلب المضاد بالعلوي", v576["othersFlipped"], v576)

    # ── v578: جذرٌ متبقٍّ بلا مثلث · تسوس (صلب) · تآكل (نقاط) · انزياح (سهمٌ نحو الجهة المنقورة) — ويُحفظان من المودال والفحص الأولي على السطح نفسه ──
    v578 = page.evaluate("""async () => {
      const P = (h) => new DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
      const set = (m) => { teethMap = m; const t = rebuildToothMaps(); T_FILL = t.fill; T_STROKE = t.stroke; };
      const F = (n, up) => P(buildTooth(n, chartFilterSM(teethMap[String(n)] || {}), up));
      const O = (n, up) => P(buildOcclusalTooth(n, chartFilterSM(teethMap[String(n)] || {}), up));
      const r = {};
      set({ '13': { COND: 'cond-retained', __status: { COND: 'condition' } }, '16': { O: 'cond-caries', M: 'cond-wear', __status: { O: 'condition', M: 'condition' } }, '15': { D: 'cond-drift', __status: { D: 'condition' } } });
      r.retainedNoSym = F(13, true).querySelectorAll('.cond-sym').length === 0 && O(13, true).querySelectorAll('.cond-sym').length === 0 && !!F(13, true).querySelector('.root-part');
      r.cariesWear = !!F(16, true).querySelector('.cond-fill rect') && !!O(16, true).querySelector('.cond-fill rect') && F(16, true).querySelectorAll('.cond-fill circle').length >= 4 && O(16, true).querySelectorAll('.cond-fill circle').length >= 4;
      const ar = (d) => { const p = d.querySelector('.cond-drift path'); if (!p) return null; const m = /M ([0-9.\\-]+) ([0-9.\\-]+) L ([0-9.\\-]+) ([0-9.\\-]+)/.exec(p.getAttribute('d')); return +m[3] - +m[1]; };
      r.driftDistal = ar(F(15, true)) < -5 && ar(O(15, true)) < -5;
      /* الكتابةُ: المودالُ والفحصُ الأولي يُرسيان الانزياحَ على الجهة، ويرفضان الإطباقي */
      window.confirm = () => true; window.SyDialog = window.SyDialog || {}; SyDialog.confirm = async () => true; SyDialog.alert = async () => {};
      teethMap = {}; window.__WRITES.length = 0; window.__TOASTS.length = 0; window.__examMode = false;
      await openToothModal(26, 'M'); pickToothTreatment('cond-drift', 'انزياح / ميلان'); await saveToothTreatment();
      const w1 = window.__WRITES.filter(x => x.table === 'teeth_status');
      r.driftModalM = w1.length === 1 && w1[0].payload.surface === 'M' && w1[0].payload.treatment_key === 'cond-drift' && w1[0].payload.status === 'condition';
      teethMap = {}; window.__WRITES.length = 0; window.__TOASTS.length = 0;
      await openToothModal(26, 'O'); const okO = _txAllowed.some(t => t.id === 'cond-drift'); if (okO) { pickToothTreatment('cond-drift', 'انزياح / ميلان'); await saveToothTreatment(); }
      r.driftRefusesO = window.__WRITES.filter(x => x.table === 'teeth_status').length === 0 && window.__TOASTS.some(t => t.indexOf('انزياح') >= 0);
      teethMap = {}; window.__WRITES.length = 0; window.__examMode = true; examSelectedKey = 'cond-caries'; examStatus = 'existing_other';
      await examStamp(26, 'O');
      const w2 = window.__WRITES.filter(x => x.table === 'teeth_status'); window.__examMode = false;
      r.cariesExamO = w2.length === 1 && w2[0].payload.surface === 'O' && w2[0].payload.treatment_key === 'cond-caries' && w2[0].payload.status === 'condition';
      r.lib13 = COND_LIBRARY.length === 14 && COND_LIBRARY.every(c => c.price === 0);
      return r;
    }""")
    check("v578: الجذرُ المتبقّي بلا مثلث بالمنظرين (الجذورُ وحدَها هي الرمز)", v578["retainedNoSym"], v578)
    check("v578: التسوسُ تعبئةٌ صلبة والتآكلُ نقاطٌ على سطحهما بالمنظرين", v578["cariesWear"], v578)
    check("v578: الانزياحُ سهمٌ نحو الجهة المنقورة (وحشيٌّ ⇒ يساراً بالربع 1) بالمنظرين", v578["driftDistal"], v578)
    check("v578: الانزياحُ يُحفظ من المودال على الجهة، ويرفض الإطباقي برسالة", v578["driftModalM"] and v578["driftRefusesO"], v578)
    check("v578: التسوسُ يُوسم من الفحص الأولي على السطح نفسه كحالة", v578["cariesExamO"], v578)
    check("v578/579: المكتبةُ 14 حالة كلُّها بصفر سعر", v578["lib13"], v578)

    # ── v580: السنُّ الزائد — وسمٌ على الجار بجهته (SX<الجهة>) من المودال والفحص الأولي · خليةٌ بين السنّين · قلعٌ حقيقي بالجلسة · إلغاؤه · ومنجزٌ يُخفيه ──
    v580 = page.evaluate("""async () => {
      window.confirm = () => true; window.SyDialog = window.SyDialog || {}; SyDialog.confirm = async () => true; SyDialog.alert = async () => {};
      if (typeof askDeletePlannedToothSessions === 'function') askDeletePlannedToothSessions = async () => ({ want:false, deleted:0 });
      /* الجلسةُ الماليةُ تمرّ بدوالَّ من patient-profile.html غيرِ محمَّلةٍ بالعُدّة — بدائلُ فارغة (لا تمسّ ما نقيسه: الكتابات) */
      ['reallocatePatientFunds','renderPayments','renderRecentSessions','renderTimeline','renderSessions','maybePromptMaterialDeduction','updatePatientLastVisit','refreshPlanSummary'].forEach(f => { if (typeof window[f] !== 'function') window[f] = async () => {}; });
      const r = {}, W = () => window.__WRITES.filter(x => x.table === 'teeth_status'), S = () => window.__WRITES.filter(x => x.table === 'ledger_sessions');
      const reset = () => { teethMap = {}; sessions = []; window.__WRITES.length = 0; window.__TOASTS.length = 0; window.__examMode = false; const t = rebuildToothMaps(); T_FILL = t.fill; T_STROKE = t.stroke; };
      /* ① الوسمُ من المودال: نقرةُ الإنسي على 12 ⇒ صفٌّ على SXM بحالة condition، بلا سطرٍ مالي */
      reset(); await openToothModal(12, 'M'); pickToothTreatment('cond-supernumerary', 'سن زائد'); await saveToothTreatment();
      r.tagModal = W().length === 1 && W()[0].payload.surface === 'SXM' && W()[0].payload.status === 'condition' && W()[0].payload.treatment_key === 'cond-supernumerary' && S().length === 0
                 && teethMap['12'] && teethMap['12'].SXM === 'cond-supernumerary';
      /* الخليةُ تظهر بين السنّين بالمنظرين بعد الرسم — بتخطيط الصفحة الحقيقي (jaw-row/jaw-wrap كما بـpatient-profile.html) لقياس الهندسة RTL */
      ['upperJaw','upperOcc','lowerOcc','lowerJaw'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('jaw-row', id.indexOf('Occ') > 0 ? 'row-occ' : 'row-buc'); });
      if (!document.getElementById('jawWrap')) { const wr = document.createElement('div'); wr.className = 'jaw-wrap'; wr.id = 'jawWrap'; wr.setAttribute('data-occview', 'all'); wr.setAttribute('data-dent', 'permanent'); const u0 = document.getElementById('upperJaw'); u0.parentNode.insertBefore(wr, u0); ['upperJaw','upperOcc','lowerOcc','lowerJaw'].forEach(id => wr.appendChild(document.getElementById(id))); }
      renderTeeth(); try { renderOcclusal(); } catch (e) {}
      const up = document.getElementById('upperJaw'), kids = Array.from(up.children).map(c => c.getAttribute('data-tooth-cell') || c.getAttribute('data-sx-cell') || '|');
      /* RTL: السابقُ بالـDOM = اليمينُ البصري = الإنسيُّ بالربع 1 (مثبتٌ بلقطة متصفح 5 ت١) — ويُقاس بالهندسة أيضاً */
      const cs = (sel) => document.querySelector(sel).getBoundingClientRect(), x12 = cs('#upperJaw [data-tooth-cell="12"]'), xsx = cs('#upperJaw [data-sx-cell="12:M"]'), x11 = cs('#upperJaw [data-tooth-cell="11"]');
      r.cellDrawn = kids.indexOf('12:M') === kids.indexOf('12') - 1 && xsx.left > x12.right - 2 && xsx.right < x11.left + 2 && !!document.querySelector('#upperOcc [data-sx-occ="12:M"]');
      /* ② الوسمُ من الفحص الأولي — نفسُ الصفِّ حرفاً بحرف؛ والإطباقيُّ مرفوض */
      reset(); window.__examMode = true; examSelectedKey = 'cond-supernumerary'; examStatus = 'existing_other';
      await examStamp(12, 'M'); const we = W();
      await examStamp(12, 'O'); const weO = W().length;
      window.__examMode = false;
      r.tagExam = we.length === 1 && we[0].payload.surface === 'SXM' && we[0].payload.status === 'condition' && weO === 1 && window.__TOASTS.some(t => t.indexOf('سن زائد') >= 0);
      /* ③ نقرةُ السن الزائد: القلعُ وحده بالقائمة، ولا حالاتَ */
      reset(); teethMap = { '12': { SXM: 'cond-supernumerary', __status: { SXM: 'condition' } } };
      teethMap['12'].COND = 'cond-abscess'; teethMap['12'].__status.COND = 'condition';   /* v583: خراجٌ على المضيف لا يظهر بنافذة زائده */
      await openToothModal(12, 'SXM');
      const _sxBtns = Array.from(document.querySelectorAll('#toothOptsContainer button')).map(b => b.textContent);
      r.onlyExtraction = _txAllowed.length >= 1 && _txAllowed.every(t => (t.target_part || 'crown') === 'extraction' && !t.is_condition)
                       && document.getElementById('toothModalTitle').textContent.indexOf('سن زائد إنسي') >= 0
                       && _sxBtns.some(t => t.indexOf('إزالة «سن زائد»') >= 0) && !_sxBtns.some(t => t.indexOf('خراج') >= 0);
      delete teethMap['12'].COND; delete teethMap['12'].__status.COND;
      /* ④ قلعٌ مخطّط: صفُّ SXM يحمل القلع بحالة planned + جلسةٌ حقيقية على السن 12 بالسطح SXM (لا WHOLE) ⇒ ✕ على الخلية والسنُّ 12 نفسه قائم */
      pickToothTreatment('extracted', 'قلع'); pickStatus('planned'); await saveToothTreatment();
      const w4 = W(), s4 = S();
      r.plannedExtraction = w4.length === 1 && w4[0].payload.surface === 'SXM' && w4[0].payload.treatment_key === 'extracted' && w4[0].payload.status === 'planned'
                          && s4.length === 1 && s4[0].payload.surface === 'SXM' && String(s4[0].payload.tooth_num) === '12' && s4[0].payload.status === 'planned'
                          && (s4[0].payload.description || '').indexOf('سن زائد إنسي') >= 0 && s4[0].payload.type === 'قلع — سن زائد إنسي'   /* v584: الاسمُ بكل القوائم */
                          && sessionToothChipText('12', 'SXM') === 'سن زائد لـ 12' && sessionToothChipText('12', 'WHOLE') === 'سن 12' && !teethMap['12'].WHOLE && !isExtracted(12) && !isExtractionPlanned(12) && getDominantStatus(12) !== 'planned';   /* مسانيدُ السن المجاور عمياءُ عن SX */
      renderTeeth();
      r.plannedX = !!document.querySelector('#upperJaw [data-sx-cell="12:M"] .planned-x') && !!document.querySelector('#upperJaw [data-tooth-cell="12"]');
      /* ⑤ إلغاءُ القلع المخطّط من المودال («سليم» على SX يمرّ بمسار الإلغاء لا بمسار السن المجاور) */
      window.__WRITES.length = 0; await openToothModal(12, 'SXM');
      r.cancelBtn = !!Array.from(document.querySelectorAll('#toothOptsContainer button')).find(b => b.textContent.indexOf('إلغاء قلع السن الزائد') >= 0);
      await clearToothStatus(); await new Promise(res => setTimeout(res, 50));
      const w5 = W();
      r.cancelled = w5.length === 1 && w5[0].payload.surface === 'SXM' && w5[0].payload.treatment_key === 'cond-supernumerary' && w5[0].payload.status === 'condition'
                  && teethMap['12'].SXM === 'cond-supernumerary' && teethMap['12'].__status.SXM === 'condition' && !teethMap['12'].WHOLE;
      /* ⑥ قلعٌ منجز ⇒ الخليةُ تختفي والسنُّ 12 يبقى */
      window.__WRITES.length = 0; await openToothModal(12, 'SXM'); pickToothTreatment('extracted', 'قلع'); pickStatus('completed'); await saveToothTreatment();
      renderTeeth(); try { renderOcclusal(); } catch (e) {}
      r.doneGone = !document.querySelector('#upperJaw [data-sx-cell="12:M"]') && !document.querySelector('#upperOcc [data-sx-occ="12:M"]')
                 && !!document.querySelector('#upperJaw [data-tooth-cell="12"]') && !isExtracted(12) && S().length === 1 && S()[0].payload.surface === 'SXM';
      /* ⑦ التحديدُ المتعدد لا يقبل السنَّ الزائد؛ والفحصُ الأولي يختم القلعَ وحده عليه */
      reset(); teethMap = { '12': { SXM: 'cond-supernumerary', __status: { SXM: 'condition' } } };
      window.__batchMode = true; batchToggleAt(12, 'SXM'); window.__batchMode = false;
      r.batchRefused = window.__TOASTS.some(t => t.indexOf('التحديد المتعدد') >= 0);
      window.__TOASTS.length = 0; window.__WRITES.length = 0; window.__examMode = true; examSelectedKey = 'cond-calculus'; examStatus = 'existing_other';
      await examStamp(12, 'SXM'); const wc = W().length;
      examSelectedKey = 'extracted'; examStatus = 'existing_other'; await examStamp(12, 'SXM'); const wx = W();
      window.__examMode = false;
      r.examSx = wc === 0 && wx.length === 1 && wx[0].payload.surface === 'SXM' && wx[0].payload.treatment_key === 'extracted' && !teethMap['12'].WHOLE;
      r.errors = (window.__ERRORS || []).length === 0;
      return r;
    }""")
    check("v580: «سن زائد» من المودال يُسجَّل على SXM كحالة بلا سطرٍ مالي", v580["tagModal"], v580)
    check("v580: خليةُ السن الزائد تُرسم بين 12 والخطِّ الناصف بالمنظرين", v580["cellDrawn"], v580)
    check("v580: الفحصُ الأولي يكتب الصفَّ نفسه ويرفض الإطباقي", v580["tagExam"], v580)
    check("v580: نقرةُ السن الزائد تعرض القلعَ وحده بعنوانه", v580["onlyExtraction"], v580)
    check("v580: قلعٌ مخطّط = صفُّ SXM + جلسةٌ حقيقية على 12 بالسطح SXM — والسنُّ 12 لا يُمسّ", v580["plannedExtraction"] and v580["plannedX"], v580)
    check("v580: إلغاءُ القلع المخطّط يعيد السنَّ الزائد حالةً (مسارٌ خاص لا «سليم» السن المجاور)", v580["cancelBtn"] and v580["cancelled"], v580)
    check("v580: القلعُ المنجز يُخفي الخليةَ ويبقي السنَّ 12 قائماً", v580["doneGone"], v580)
    check("v580: التحديدُ المتعدد يرفضه، والفحصُ الأولي يختم القلعَ وحده عليه", v580["batchRefused"] and v580["examSx"], v580)
    check("v580: صفرُ خطأ JS", v580["errors"], v580)

    # ── v581 (بلاغ المالك بأربع صور): نخرٌ على MOD يُرسم · نخرُ الحنكي الأمامي لا يمتدّ على الإنسي/الوحشي · إزالةُ التماس تزيل صفَّ الجار ──
    v581 = page.evaluate("""async () => {
      window.confirm = () => true; window.SyDialog = window.SyDialog || {}; SyDialog.confirm = async () => true;
      const P = (h) => new DOMParser().parseFromString(h.slice(h.indexOf('<svg'), h.lastIndexOf('</svg>') + 6), 'image/svg+xml');
      const r = {};
      /* النقرُ الحقيقي: شرائحُ M+O+D بالمودال ثم تسوس ⇒ صفٌّ واحد بمفتاح MOD يُرسم بثلاث تعبئات بالمنظرين */
      teethMap = {}; window.__WRITES.length = 0; const t0 = rebuildToothMaps(); T_FILL = t0.fill; T_STROKE = t0.stroke;
      await openToothModal(38, 'O'); currentSurfaces = ['M','O','D']; currentSurface = 'MOD';
      pickToothTreatment('cond-caries', 'تسوس (نخر)'); await saveToothTreatment();
      const w1 = window.__WRITES.filter(x => x.table === 'teeth_status');
      r.modWrite = w1.length === 1 && w1[0].payload.surface === 'MOD' && w1[0].payload.treatment_key === 'cond-caries';
      r.modDrawn = P(buildOcclusalTooth(38, chartFilterSM(teethMap['38']), false)).querySelectorAll('.cond-fill rect').length === 3
                && P(buildTooth(38, chartFilterSM(teethMap['38']), false)).querySelectorAll('.cond-fill rect').length === 3;
      /* الحنكيُّ بالسن 13: تعبئةٌ واحدة لا تمسّ شريطَي الإنسي/الوحشي (الهندسةُ بالإحداثيات) */
      const o13 = P(buildOcclusalTooth(13, { L: 'cond-caries', __status: { L: 'condition' } }, true)), l13 = o13.querySelector('.cond-fill rect');
      const h13 = o13.querySelector('.crown-surface[data-surface="L"]'), N = (el, a) => parseFloat(el.getAttribute(a));
      r.palatalInset = !!l13 && !!h13 && o13.querySelectorAll('.cond-fill rect').length === 1 && N(l13, 'x') >= N(h13, 'x') + 5 && N(l13, 'x') + N(l13, 'width') <= N(h13, 'x') + N(h13, 'width') - 5;
      /* إزالةُ تماسٍ سجّله الطبيبُ على الجارين ⇒ الصفّان يُحذفان وتختفي الخطوطُ كلُّها */
      teethMap = { '16': { M: 'cond-open-contact', __status: { M: 'condition' } }, '15': { D: 'cond-open-contact', __status: { D: 'condition' } } };
      window.__WRITES.length = 0;
      await removeCondition(16, 'M'); await new Promise(res => setTimeout(res, 30));
      const dels = window.__WRITES.filter(x => x.table === 'teeth_status' && x.op === 'delete').length;
      const lines = (buildTooth(16, chartFilterSM(teethMap['16'] || {}), true).match(/cond-contact/g) || []).length + (buildTooth(15, chartFilterSM(teethMap['15'] || {}), true).match(/cond-contact/g) || []).length;
      r.twinRemoved = dels === 2 && lines === 0 && !teethMap['16'] && !teethMap['15'];
      /* المرآةُ بالفحص الأولي: إلغاءُ الختم على تماسٍ مزدوج يزيل الصفّين كذلك */
      teethMap = { '16': { M: 'cond-open-contact', __status: { M: 'condition' } }, '15': { D: 'cond-open-contact', __status: { D: 'condition' } } };
      window.__WRITES.length = 0; window.__examMode = true; examSelectedKey = 'cond-open-contact'; examStatus = 'existing_other';
      await examStamp(16, 'M'); window.__examMode = false;
      const dels2 = window.__WRITES.filter(x => x.table === 'teeth_status' && x.op === 'delete').length;
      const lines2 = (buildTooth(16, chartFilterSM(teethMap['16'] || {}), true).match(/cond-contact/g) || []).length + (buildTooth(15, chartFilterSM(teethMap['15'] || {}), true).match(/cond-contact/g) || []).length;
      r.twinRemovedExam = dels2 === 2 && lines2 === 0;
      /* زرُّ إزالة تماسٍ سجّله الجار يظهر بمودال السن الذي يُرى عليه */
      teethMap = { '15': { D: 'cond-open-contact', __status: { D: 'condition' } } };
      await openToothModal(16, 'O');
      r.neighborBtn = Array.from(document.querySelectorAll('#toothOptsContainer button')).some(b => b.textContent.indexOf('مع السن 15') >= 0);
      closeModal('toothModal');
      r.errors = (window.__ERRORS || []).length === 0;
      return r;
    }""")
    check("v581: نخرٌ على MOD (شرائح المودال) يُحفظ صفاً واحداً ويُرسم بثلاث تعبئات بالمنظرين", v581["modWrite"] and v581["modDrawn"], v581)
    check("v581: نخرُ الحنكي بالسن 13 تعبئةٌ واحدة لا تمسّ الإنسي/الوحشي", v581["palatalInset"], v581)
    check("v581: إزالةُ التماس المفتوح تزيل صفَّ الجار المقابل فتختفي الخطوطُ كلُّها (المودالُ والفحصُ الأولي)", v581["twinRemoved"] and v581["twinRemovedExam"], v581)
    check("v581: زرُّ إزالة تماسٍ سجّله الجار يظهر على السن الذي يُرى عليه", v581["neighborBtn"], v581)
    check("v581: صفرُ خطأ JS", v581["errors"], v581)

    # ── v490: مراجعةُ الحالات العشر — تكافؤُ المسارين حرفاً بحرف، و«سليم» لا يحذف التاج ──
    v490 = page.evaluate("""async () => {
      window.confirm = () => true;
      window.SyDialog = window.SyDialog || {}; SyDialog.confirm = async () => true; SyDialog.alert = async () => {};
      if (typeof askDeletePlannedToothSessions === 'function') askDeletePlannedToothSessions = async () => ({ want:false, deleted:0 });
      if (typeof followUpRemovedSessions === 'function') followUpRemovedSessions = async () => ({ parts: [], warn: false });
      const clicks = ['B','O','V','M','D','R1','WHOLE'], diff = [];
      for (const cl of clicks) for (const c of COND_LIBRARY) {
        teethMap = {}; window.__WRITES.length = 0; window.__TOASTS.length = 0; window.__examMode = false;
        await openToothModal(26, cl);
        let m = 'REFUSED';
        if (_txAllowed.some(t => t.id === c.id)) {
          pickToothTreatment(c.id, c.name); await saveToothTreatment();
          const w = window.__WRITES.filter(x => x.table === 'teeth_status'); if (w.length) m = w[0].payload.surface;
          if (window.__WRITES.some(x => x.table === 'ledger_sessions')) m += '!LEDGER';
        }
        teethMap = {}; window.__WRITES.length = 0; window.__examMode = true; examSelectedKey = c.id; examStatus = 'existing_other';
        await examStamp(26, cl);
        const we = window.__WRITES.filter(x => x.table === 'teeth_status');
        let e = we.length ? we[0].payload.surface : 'REFUSED';
        if (we.length && (we[0].payload.status !== 'condition' || we[0].payload.review_at !== null)) e += '!STATUS';
        if (m !== e) diff.push(c.id + '@' + cl + ' modal=' + m + ' exam=' + e);
      }
      window.__examMode = false;
      /* «سليم» على قلحٍ دهليزيٍّ بسنٍّ متوَّج: يزول القلحُ وحدَه */
      const mk = (rows) => { const o = {}; rows.forEach(([sf,k,st]) => { o[sf]=k; (o.__status=o.__status||{})[sf]=st||'completed'; }); return o; };
      teethMap = { '26': mk([['V','cond-calculus','condition'],['CROWN_FULL','crown'],['O','treated']]) };
      await openToothModal(26, 'V'); await clearToothStatus();
      const left = Object.keys(teethMap['26'] || {}).filter(k => k[0] !== '_').sort().join(',');
      return { diff, left };
    }""")
    check("v490: المودالُ والفحصُ الأولي يُرسيان كلَّ حالةٍ من العشر على السطح نفسه لكل نقرة (70 خانة)",
          v490["diff"] == [], v490["diff"][:4])
    check("v490: «سليم» على حالةٍ سطحية يزيلها وحدَها — لا يحذف تاجَ السن ولا حشوتَه",
          v490["left"] == "CROWN_FULL,O", v490["left"])

    # ── v491: لكلِّ حالةٍ زرُّ إزالتها — العشرُ كلُّها، بأيِّ موضع، ولا يُحذف علاجٌ أبداً ──
    v491 = page.evaluate("""async () => {
      window.confirm = () => true;
      window.SyDialog = window.SyDialog || {}; SyDialog.confirm = async () => true; SyDialog.alert = async () => {};
      window.__examMode = false;
      const site = {'cond-fracture':'R1','cond-sensitivity':'V','cond-calculus':'V','cond-recession':'V','cond-abscess':'COND',
                    'cond-retained':'COND','cond-impacted':'COND','cond-white-spot':'B','cond-open-contact':'M','cond-unerupted':'COND'};
      const click = (sf) => (sf === 'COND' ? 'O' : sf);
      const res = [];
      for (const c of COND_LIBRARY) {
        const sf = site[c.id];
        teethMap = { '26': { CROWN_FULL: 'crown', O: 'treated', R2: 'root-canal', __status: { CROWN_FULL: 'completed', O: 'completed', R2: 'completed' } } };
        if (sf === 'O') { delete teethMap['26'].O; }
        teethMap['26'][sf] = c.id; teethMap['26'].__status[sf] = 'condition';
        await openToothModal(26, click(sf));
        const btns = Array.from(document.querySelectorAll('#toothOptsContainer .tx-cond-remove'));
        const mine = btns.find(b => b.textContent.indexOf(c.name) >= 0);
        const hasHealthy = Array.from(document.querySelectorAll('#toothOptsContainer button')).some(b => b.textContent.indexOf('سليم') >= 0);
        let removed = false, kept = '';
        if (mine) {
          window.__WRITES.length = 0;
          mine.click(); await new Promise(r => setTimeout(r, 30));
          const sm = teethMap['26'] || {};
          removed = !(sf in sm);
          kept = ['CROWN_FULL','O','R2'].filter(k => k !== sf && sm[k]).join(',');
        }
        res.push({ id: c.id, button: !!mine, first: btns.length > 0 && btns[0] === mine, removed, kept, hasHealthy });
      }
      /* حالتان على سنٍّ واحد ⇒ زرّان؛ وزرُّ الإزالة لا يحذف علاجاً مهما مُرِّر له */
      teethMap = { '26': { V: 'cond-calculus', COND: 'cond-abscess', O: 'treated',
                           __status: { V: 'condition', COND: 'condition', O: 'completed' } } };
      await openToothModal(26, 'B');
      const two = document.querySelectorAll('#toothOptsContainer .tx-cond-remove').length;
      window.__WRITES.length = 0; window.__TOASTS.length = 0;
      await removeCondition(26, 'O');
      const refusedTreatment = !!(teethMap['26'] && teethMap['26'].O === 'treated')
                               && window.__WRITES.filter(w => w.table === 'teeth_status').length === 0;
      return { res, two, refusedTreatment };
    }""")
    miss = [r for r in v491["res"] if not (r["button"] and r["removed"])]
    check("v491: لكلِّ حالةٍ من العشر زرُّ إزالةٍ باسمها — ويزيلها فعلاً", miss == [], miss[:3])
    check("v491: الإزالةُ لا تمسّ التاجَ ولا الحشوةَ ولا المعالجةَ اللبّية على السن نفسه",
          all(set(["CROWN_FULL", "R2"]).issubset(set(r["kept"].split(","))) for r in v491["res"]), [r for r in v491["res"]][:2])
    check("v491: زرُّ حالةِ السطح المنقور يأتي أولاً", all(r["first"] for r in v491["res"]), [r["id"] for r in v491["res"] if not r["first"]])
    check("v491: «سليم (إلغاء)» يبقى متاحاً بجانبها", all(r["hasHealthy"] for r in v491["res"]))
    check("v491: حالتان على السن ⇒ زرّان منفصلان", v491["two"] == 2, v491["two"])
    check("v491: زرُّ إزالة الحالة يرفض حذفَ علاجٍ مهما مُرِّر له", v491["refusedTreatment"], v491)

    # ── v494: استبدالُ حالةٍ بأخرى يسأل على أيِّ موضع (سطحٍ أو سنٍّ)، والرفضُ لا يكتب ──
    v494 = page.evaluate("""async () => {
      window.__examMode = false;
      window.SyDialog = window.SyDialog || {}; SyDialog.alert = async () => {};
      const run = async (rows, click, id, answer) => {
        teethMap = { '26': {} }; rows.forEach(([sf,k]) => { teethMap['26'][sf]=k; (teethMap['26'].__status=teethMap['26'].__status||{})[sf]='condition'; });
        let asked = null; SyDialog.confirm = async (o) => { asked = (o && o.message) || String(o); return answer; };
        window.__WRITES.length = 0;
        await openToothModal(26, click); pickToothTreatment(id, getCondition(id).name); await saveToothTreatment();
        const w = window.__WRITES.filter(x => x.table === 'teeth_status').length;
        return { asked, wrote: w > 0, now: teethMap['26'][click === 'O' ? 'COND' : click] };
      };
      const a = await run([['V','cond-sensitivity']], 'V', 'cond-calculus', false);
      const b = await run([['V','cond-sensitivity']], 'V', 'cond-calculus', true);
      const c = await run([['COND','cond-abscess']], 'O', 'cond-impacted', false);
      const d = await run([['V','cond-calculus']], 'V', 'cond-calculus', true);
      return { a, b, c, d };
    }""")
    check("v494: حالةُ سطحٍ فوق حالةٍ أخرى على السطح نفسه تسأل باسمَيهما، والرفضُ لا يكتب",
          v494["a"]["asked"] and "حساسية" in v494["a"]["asked"] and "قلح" in v494["a"]["asked"]
          and not v494["a"]["wrote"] and v494["a"]["now"] == "cond-sensitivity", v494["a"])
    check("v494: القبولُ يستبدلها", v494["b"]["wrote"] and v494["b"]["now"] == "cond-calculus", v494["b"])
    check("v494: حالةُ السن (COND) ما زالت تسأل", v494["c"]["asked"] is not None and not v494["c"]["wrote"], v494["c"])
    check("v494: الحالةُ نفسُها فوق نفسها لا تسأل", v494["d"]["asked"] is None and v494["d"]["wrote"], v494["d"])

    # ── وضعُ الفحص الأولي: المكتبةُ بصفّها المستقل، والوسمُ يكتب حالةً لا علاجاً ──
    page.evaluate("() => { window.__WRITES.length = 0; window.__TOASTS.length = 0; teethMap = {}; }")
    ex = page.evaluate("""() => {
      window.__examMode = true; examSelectedKey = null; examStatus = 'existing_other';
      renderExamBar();
      const row = document.getElementById('examCondRow');
      const btns = Array.from(document.querySelectorAll('#examCondPalette .exam-tx'));
      const main = Array.from(document.querySelectorAll('#examPalette .exam-tx')).map(b => b.textContent.trim());
      return { rowShown: row.style.display !== 'none', names: btns.map(b => b.textContent.trim()),
               separate: btns.length > 0 && main.every(m => btns.every(b => b.textContent.trim() !== m)),
               errors: window.__ERRORS };
    }""")
    check("الفحصُ الأولي: صفُّ الحالات ظاهر", ex["rowShown"])
    check("الفحصُ الأولي: الحالاتُ الأربع عشرة بصفٍّ مستقلٍّ عن علاجات العيادة",
          len(ex["names"]) == 14 and ex["separate"], ex["names"])

    ex_pick = page.evaluate("""() => {
      const btn = Array.from(document.querySelectorAll('#examCondPalette .exam-tx')).find(b => b.textContent.indexOf('قلح') >= 0);
      if (!btn) return { key: null };
      btn.click();
      return { key: examSelectedKey,
               statusHidden: document.getElementById('examStatusChips').style.display === 'none',
               noteShown: document.getElementById('examCondNote').style.display !== 'none',
               monthsHidden: document.getElementById('examMonthsRow').style.display === 'none' };
    }""")
    check("اختيارُ حالةٍ يُخفي شرائحَ الحالة ويُظهر سطرَ التعريف",
          ex_pick.get("key") == "cond-calculus" and ex_pick.get("statusHidden")
          and ex_pick.get("noteShown") and ex_pick.get("monthsHidden"), ex_pick)

    ex_stamp = page.evaluate("""async () => {
      examStatus = 'existing_other';   /* شريحةٌ مالية عمداً — لا يجوز أن تصل القاعدة */
      await examStamp(36, 'V');        /* v434: قلحٌ على اللثوي يبقى لثوياً */
      return { writes: window.__WRITES, tooth: teethMap['36'] || null, errors: window.__ERRORS };
    }""")
    ex_ts = [w for w in ex_stamp["writes"] if w["table"] == "teeth_status"]
    check("الفحصُ الأولي: صفرُ سطرٍ بالسجل المالي",
          all(w["table"] != "ledger_sessions" for w in ex_stamp["writes"]),
          [w["table"] for w in ex_stamp["writes"]])
    check("الفحصُ الأولي: كتابةٌ على teeth_status", len(ex_ts) == 1, ex_stamp["writes"])
    if ex_ts:
        pl = ex_ts[0]["payload"]
        check("الفحصُ الأولي: السطحُ المنقور (لثوي) + condition + بلا موعد رغم شريحةٍ مالية مختارة",
              pl.get("surface") == "V" and pl.get("status") == "condition" and pl.get("review_at") is None, pl)

    # v434: الكسرُ على الجذر المنقور · الحالةُ السنّية على COND · التماسُ المفتوح محصورٌ بالإنسي/الوحشي
    ex_more = page.evaluate("""async () => {
      window.__WRITES.length = 0; window.__TOASTS.length = 0;
      examPick('cond-fracture');      await examStamp(15, 'R1');
      examPick('cond-abscess');       await examStamp(14, 'O');
      window.__TOASTS.length = 0;
      examPick('cond-open-contact');  await examStamp(13, 'O');   /* مرفوض */
      const refusedToast = window.__TOASTS.join(' | ');
      const beforeOK = window.__WRITES.length;
      examPick('cond-open-contact');  await examStamp(13, 'M');   /* مقبول */
      return { rows: window.__WRITES.filter(w => w.table === 'teeth_status').map(w => ({ t: w.payload.tooth_num, s: w.payload.surface, k: w.payload.treatment_key })),
               refusedToast: refusedToast, refusedNoWrite: beforeOK === window.__WRITES.filter(w => w.table === 'teeth_status').length - 1,
               errors: window.__ERRORS };
    }""")
    rows = {(r["t"], r["k"]): r["s"] for r in ex_more["rows"]}
    check("v434: كسرٌ على الجذر R1 يُسجَّل جذرياً لا تاجياً",
          rows.get(("15", "cond-fracture")) == "R1", ex_more["rows"])
    check("v434: الخراجُ (حالةٌ سنّية) يبقى على السطح المحجوز COND",
          rows.get(("14", "cond-abscess")) == "COND", ex_more["rows"])
    check("v434: التماسُ المفتوح يُرفض على الإطباقي برسالةٍ تشرح نقطة التماس",
          "الإنسي" in ex_more["refusedToast"] and ex_more["refusedNoWrite"], ex_more)
    check("v434: التماسُ المفتوح يُقبل على الإنسي",
          rows.get(("13", "cond-open-contact")) == "M", ex_more["rows"])
    check("الفحصُ الأولي: صفرُ خطأ JS", not ex_stamp["errors"] and not page_errors,
          ex_stamp["errors"] or page_errors)

    page.evaluate("() => { window.__examMode = false; document.getElementById('toothModal').classList.add('open'); }")
    page.screenshot(path=str(HERE / ".out" / "modal.png"))
    browser.close()

for o in oks:
    print("  ✓ " + o)
for f in fails:
    print("  ✗ " + f)
print(("⛔ مثبت DOM: " + str(len(fails)) + " فشل") if fails
      else ("✅ مثبت DOM: " + str(len(oks)) + "/" + str(len(oks)) + " — الطبيبُ ينقر فيصل الأثرُ للقاعدة"))
sys.exit(1 if fails else 0)

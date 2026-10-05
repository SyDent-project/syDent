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
    check("المكتبةُ العشر داخل قائمة العلاجات المسموحة (C3: +غير بازغ)", opened["conds"] == 10, opened["conds"])

    tab = page.evaluate("""() => {
      switchTxTab('condition');
      const c = document.getElementById('toothOptsContainer');
      return { buttons: Array.from(c.querySelectorAll('button.topt')).map(b => b.textContent.trim()),
               hint: !!c.querySelector('.tx-cond-hint'), errors: window.__ERRORS };
    }""")
    named = [b for b in tab["buttons"] if "سليم" not in b]
    check("نقرُ الشريحة يعرض الحالات العشر فعلاً", len(named) == 10, tab["buttons"])
    check("سطرُ التعريف فوق الشبكة", tab["hint"])

    if len(named) != 10:
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
      const occ = buildOcclusalTooth(21, chartFilterSM(teethMap['21']), true);
      const anat = toothAnatomy(21);
      const bRect = anat.surfaces.B;
      const aSurf = condAnchorFor(anat, 'B', getCondition('cond-calculus'));
      const aTooth = condAnchorFor(anat, 'COND', getCondition('cond-abscess'));
      const aRoot = condAnchorFor(anat, 'R1', getCondition('cond-fracture'));
      return { facial: html.indexOf('cond-sym') >= 0, occ: occ.indexOf('cond-sym') >= 0,
               tipSurface: html.indexOf('دهليزي') >= 0 && html.indexOf('قلح') >= 0,
               onBRect: Math.abs(aSurf.y - (bRect.y + bRect.h / 2)) < 0.01,
               apexBelowCrown: aTooth.y > anat.cervicalY,
               rootAnchored: aRoot.y > anat.cervicalY && Math.abs(aRoot.x - 50) < 40 };
    }""")
    check("الرمزُ يُرسم بالمنظر الوجهي", drawn["facial"])
    check("v437: لا رمزَ حالةٍ بالمنظر الإطباقي (تكرارٌ بلا فائدة)", not drawn["occ"])
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
    check("الفحصُ الأولي: الحالاتُ العشر بصفٍّ مستقلٍّ عن علاجات العيادة",
          len(ex["names"]) == 10 and ex["separate"], ex["names"])

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

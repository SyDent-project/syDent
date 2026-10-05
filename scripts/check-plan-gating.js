#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   الحارس الثاني عشر — تماثل بوابة الخطط عبر أربعة سطوح (Rule #223)
   ═══════════════════════════════════════════════════════════════════════════
   تعطيل موديول لخطة ما ليس مفتاحاً واحداً، بل عقد بين أربعة سطوح مستقلة:

     (1) `PLAN_ENTITLEMENT_DEFS`  في admin-plans.js
             → مفاتيح المصفوفة التي يراها المشغّل في محرّر الخطط
             (كانت في admin.html حتى تفكيك admin — حزام A1، 27 تموز 2026)
     (2) `PAGE_MODULE`            في supabase-init.js
             → بوابة الصفحة نفسها (autoGate): أي صفحة تُحجب لأي موديول
     (3) `GATEABLE`               في sidebar.js
             → إزالة عنصر التنقّل من الشريط الجانبي
     (4) عنصر التنقّل             في sidebar.js · navItems
             → لكل موديول محجوب عنصرٌ بـid وhref مطابقين، وإلا فالإزالة
               تفشل بصمت (السطر: `if (!href) return;`)

   انحراف أي سطح عن البقية = فجوة صامتة، وهي أخطر من الخطأ الصريح:
     • مفتاح في (1) بلا (2) ⇒ المشغّل يطفئ الموديول والصفحة تبقى مفتوحة.
     • مفتاح في (2) بلا (3) ⇒ الصفحة تُحجب لكن الرابط يبقى ظاهراً بالشريط.
     • مفتاح في (3) بلا عنصر تنقّل مطابق ⇒ الإزالة تفشل بصمت.
     • مفتاح في (3) بلا (1) ⇒ موديول قابل للحجب بلا مفتاح يشغّله أبداً.

   استثناءات مقصودة (SERVER_ONLY): موديولات ليست صفحات بالشريط الجانبي،
   إنفاذها من الخادم لا من الواجهة — لذلك تُستثنى من (2)/(3)/(4) عمداً:
     • booking      → داخل RPC booking_clinic_info (بوابة الحجز العامة)
                       + قسم بـsettings.html + كتم {booking_link}
     • ai_features  → داخل Edge Function ai-assist (بوابتا الخطة والموافقة)
                       + بوابة العميل SyDentPlan.can('ai_features')
   الاستثناء نفسه محروس: يجب أن يبقى كل عنصر منه موجوداً في (1)، وإلا
   فقد صار الاستثناء كذبة توثيقية.

   لا يُنفَّذ أي كود من الملفات — استخراج نصّي + تقييم حرفيّات في سياق معزول.
   الخروج: 0 عند التطابق، 1 عند أي انحراف.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT  = path.resolve(__dirname, '..');
const PLANS = path.join(ROOT, 'admin-plans.js');
const INIT  = path.join(ROOT, 'supabase-init.js');
const SIDE  = path.join(ROOT, 'sidebar.js');

/* موديولات يُنفَّذ حجبها من الخادم — تُستثنى من سطوح الشريط والصفحة عمداً */
const SERVER_ONLY = ['booking', 'ai_features'];

const errors = [];
const fail = m => errors.push(m);
const J = a => '[' + a.join(', ') + ']';
const diff = (a, b) => a.filter(x => !b.includes(x));

/* ── مستخرج حرفيّات: يقتطع من مرساة حتى إغلاق متوازن ثم يقيّمه معزولاً ──── */
function evalLiteral(src, anchor, open, close, label) {
  const at = src.indexOf(anchor);
  if (at < 0) { fail(`${label}: المرساة «${anchor}» غير موجودة`); return null; }
  const from = src.indexOf(open, at);
  if (from < 0) { fail(`${label}: لم يُعثر على «${open}» بعد المرساة`); return null; }
  let depth = 0, end = -1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) { fail(`${label}: قوس غير مغلق`); return null; }
  try {
    return vm.runInNewContext('(' + src.slice(from, end + 1) + ')', Object.create(null), { timeout: 1000 });
  } catch (e) { fail(`${label}: فشل التقييم — ${e.message}`); return null; }
}

/* ── (1) PLAN_ENTITLEMENT_DEFS ─────────────────────────────────────────── */
const plansSrc = fs.readFileSync(PLANS, 'utf8');
const defs = evalLiteral(plansSrc, 'var PLAN_ENTITLEMENT_DEFS', '[', ']', 'PLAN_ENTITLEMENT_DEFS');
let defKeys = [];
if (Array.isArray(defs)) {
  defs.forEach((d, i) => {
    if (!d || typeof d.key !== 'string' || !d.key) fail(`PLAN_ENTITLEMENT_DEFS[${i}]: مفتاح مفقود أو غير نصّي`);
    else if (typeof d.label !== 'string' || !d.label.trim()) fail(`PLAN_ENTITLEMENT_DEFS: «${d.key}» بلا تسمية`);
    else defKeys.push(d.key);
  });
  const dup = defKeys.filter((k, i) => defKeys.indexOf(k) !== i);
  if (dup.length) fail(`PLAN_ENTITLEMENT_DEFS: مفاتيح مكرَّرة ${J([...new Set(dup)])}`);
}

/* ── (2) PAGE_MODULE ───────────────────────────────────────────────────── */
const initSrc = fs.readFileSync(INIT, 'utf8');
const pageModule = evalLiteral(initSrc, 'var PAGE_MODULE', '{', '}', 'PAGE_MODULE') || {};
const pmPages   = Object.keys(pageModule);
const pmModules = pmPages.map(p => pageModule[p]);

/* ── (3) GATEABLE + (4) navItems ───────────────────────────────────────── */
const sideSrc  = fs.readFileSync(SIDE, 'utf8');
const gateable = evalLiteral(sideSrc, 'const GATEABLE', '[', ']', 'GATEABLE') || [];
const navPairs = [...sideSrc.matchAll(/href:\s*'([A-Za-z0-9_.-]+\.html)'\s*,\s*id:\s*'([A-Za-z0-9_-]+)'/g)]
                   .map(m => ({ href: m[1], id: m[2] }));
if (!navPairs.length) fail('navItems: لم يُستخرج أي عنصر تنقّل (href+id) — تغيّرت البنية؟');

/* ── التوكيدات ─────────────────────────────────────────────────────────── */
if (defKeys.length && gateable.length) {

  /* أ) الاستثناء صادق: كل SERVER_ONLY موجود في DEFS */
  const ghostExc = diff(SERVER_ONLY, defKeys);
  if (ghostExc.length) fail(`استثناء SERVER_ONLY يشير لمفاتيح غير موجودة في PLAN_ENTITLEMENT_DEFS: ${J(ghostExc)}`);

  /* ب) الاستثناء لا يتسلل لسطوح الواجهة */
  const leaked = SERVER_ONLY.filter(k => gateable.includes(k) || pmModules.includes(k));
  if (leaked.length) fail(`موديول خادميّ ظهر في GATEABLE/PAGE_MODULE: ${J(leaked)} — إمّا أنه صار صفحة فيُزال من SERVER_ONLY، وإلا فهو خطأ`);

  /* ج) تطابق تامّ: DEFS − SERVER_ONLY == GATEABLE */
  const uiKeys  = defKeys.filter(k => !SERVER_ONLY.includes(k));
  const noGate  = diff(uiKeys, gateable);
  const noToggle= diff(gateable, uiKeys);
  if (noGate.length)   fail(`مفاتيح بمحرّر الخطط بلا حجب بالشريط (GATEABLE): ${J(noGate)}`);
  if (noToggle.length) fail(`موديولات بـGATEABLE بلا مفتاح بمحرّر الخطط: ${J(noToggle)}`);

  /* د) بوابة الصفحة تغطّي مجموعة GATEABLE نفسها بالضبط */
  const noPage  = diff(gateable, pmModules);
  const noSide  = diff(pmModules, gateable);
  if (noPage.length) fail(`موديولات تُزال من الشريط لكن صفحتها غير محجوبة (PAGE_MODULE): ${J(noPage)}`);
  if (noSide.length) fail(`موديولات بـPAGE_MODULE بلا إزالة من الشريط (GATEABLE): ${J(noSide)}`);
  const dupPm = pmModules.filter((m, i) => pmModules.indexOf(m) !== i);
  if (dupPm.length) fail(`PAGE_MODULE: موديول مرتبط بأكثر من صفحة ${J([...new Set(dupPm)])}`);

  /* هـ) لكل موديول محجوب عنصر تنقّل بـid مطابق — وإلا فشلت الإزالة بصمت */
  gateable.forEach(id => {
    const item = navPairs.find(n => n.id === id);
    if (!item) { fail(`GATEABLE «${id}»: لا عنصر تنقّل بهذا الـid — الإزالة تفشل بصمت (if (!href) return)`); return; }
    const page = pmPages.find(p => pageModule[p] === id);
    if (page && item.href !== page) {
      fail(`«${id}»: href بالشريط «${item.href}» لا يطابق صفحة PAGE_MODULE «${page}»`);
    }
  });

  /* و) كل صفحة مذكورة بـPAGE_MODULE موجودة فعلاً على القرص */
  pmPages.forEach(p => {
    if (!fs.existsSync(path.join(ROOT, p))) fail(`PAGE_MODULE: الصفحة «${p}» غير موجودة بالمستودع`);
  });
}

if (errors.length) {
  console.error('❌ حارس بوابة الخطط (Rule #223): ' + errors.length + ' انحراف');
  errors.forEach(e => console.error('   • ' + e));
  process.exit(1);
}
console.log('✅ حارس بوابة الخطط: السطوح الأربعة متماثلة (' + defKeys.length + ' مفتاحاً = ' +
            (defKeys.length - SERVER_ONLY.length) + ' موديول واجهة مع صفحة وعنصر تنقّل + ' +
            SERVER_ONLY.length + ' خادميّ: ' + J(SERVER_ONLY) + ').');
process.exit(0);

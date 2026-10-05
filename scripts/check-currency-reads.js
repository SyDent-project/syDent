#!/usr/bin/env node
/* SyDent — check-currency-reads.js (الحارس السادس عشر · قاعدة #481).
 *
 * الثابت: **كل مُراكم قرائيّ لمبلغ يجب أن يكون مقسوماً بالعملة.**
 *
 * وُلد من باغ v202: بطاقة «مستحق للمخابر» كانت تجمع تكاليف الليرة مع الدولار
 * برقمٍ واحد وتطرح منه كل الدفعات بلا تمييز، ثم تعرض الناتج تحت وسمٍ مفرد —
 * فعيادةٌ عليها عشرون ليرة وعشرون دولاراً تقرأ «أربعين». عاش من v181 إلى v202
 * ووصل أربعةَ مستأجرين. والسببُ البنيويّ أن check-currency-writes يفحص طرف
 * الكتابة حصراً، بينما **الجمعُ عابرَ العملات يقع وقت القراءة** — فلا حارس
 * بالأسطول كان يراه (قاعدة #481).
 *
 * ── أعمدة المبالغ: مشتقّة من مخطَّط القاعدة لا من قائمةٍ تُكتب باليد ─────────
 * درسُ الحارس الخامس عشر (v180): «جردي اليدوي للأسطح المالية غير موثوق».
 * القاعدة الاشتقاقية — ذراعان، على الجداول الحاملة لعمود عملة حصراً:
 *   (أ) numeric بمقياس = 2  ⇒ مبلغ يقيناً (المال وحده يحمل كسرين)
 *   (ب) اسمٌ يطابق اسمَ مال ⇒ يلتقط أعمدة numeric غير المقيَّدة، وهي تضمّ
 *       ledger_sessions.cost و ledger_payments.amount و treatments.price —
 *       أي أهمَّ ثلاثة أعمدة بالمنظومة. الذراع (أ) وحدها كانت ستُسقطها.
 * التقاطع مع «ليس مبلغاً» صفر: sort_order · quantity · reorder_level ·
 * share_percent · weekly_hours · tooth_num · phase · ortho_months ·
 * booking_slot_minutes · duration_days · max_employees — كلها تسقط آلياً،
 * فالعدّادات لا يلمسها الحارس (شرطٌ صريح من المالك).
 *
 * لإعادة الاشتقاق عند إضافة عمود مال (Supabase MCP · project rycqzpdhxabpqrdgtdzg):
 *   WITH cur AS (SELECT table_name FROM information_schema.columns
 *                WHERE table_schema='public' AND column_name ILIKE '%currency%'
 *                  AND data_type IN ('text','character varying','USER-DEFINED')
 *                GROUP BY table_name)
 *   SELECT c.column_name, c.data_type, c.numeric_scale
 *   FROM information_schema.columns c JOIN cur ON cur.table_name=c.table_name
 *   WHERE c.table_schema='public'
 *     AND c.data_type IN ('numeric','integer','bigint','double precision','real','smallint')
 *     AND (c.numeric_scale = 2 OR c.column_name ~ '(^|_)(amount|cost|price|total|salary|fee|paid)($|_)');
 *
 * ── العقد: يُرفض المُراكم إلا بأحد أربعة ───────────────────────────────────
 *   ١) مفهرس بالعملة        — bag[_rowCur(o)] · bag[c] · sum[e.cur] · b.bags[rc(p)]
 *   ١-ب) محروسٌ بشرط عملة   — الفلترة بحارسٍ مبكّر داخل **نفس نطاق التكرار**
 *        (if (_rowCur(s) !== sugCur) return;) مكافئةٌ دلالياً للفهرسة؛ الشكل
 *        هو الفرق وحده. والحصرُ بنطاق التكرار لا بالدالة كلها مقصود: دالةٌ
 *        فيها مُراكمان أحدهما محروس والآخر لا يجب أن تُرفض لا أن تمرّ.
 *   ٢) داخل غلاف طبقة عملة  — withCurrencyLayer · computeLayersByCurrency
 *   ٣) استثناءٌ مصرَّح       — تعليق `cur-ok` بالسطر نفسه (بسابقة xss-ok)،
 *        أو بقائمة EXEMPT أدناه حين يكون الملفُّ مقفولاً بايت-بايت فلا يُلمس.
 *
 * ── شكلا المُراكم المفحوصان ────────────────────────────────────────────────
 *   (أ) `acc += <مبلغ>` و `acc -= <مبلغ>`
 *   (ب) `arr.reduce(function(acc, r){ return acc + <مبلغ>; }, 0)`
 * الشكل (ب) أُضيف بعد أن أثبت المسح أنه يخفي ستةَ عشر موضعاً — حارسٌ يترك
 * ثقباً بحجم النمط الذي وُلد لأجله حارسٌ فارغ.
 *
 * ── حدٌّ معروف ومقبول ──────────────────────────────────────────────────────
 * المُراكم عبر دالةٍ وسيطة تُمرَّر المصفوفةَ ثم تُعيد رقماً واحداً لا يُتتبَّع
 * عبر حدود الملفات. المقابل هو تحليلُ تدفّقٍ عابرٍ للملفات بكلفةِ إنذاراتٍ
 * كاذبة تأكل مصداقية الحارس — وتآكلُ المصداقية أخطر من موضعٍ نادر يفلت.
 */
const fs = require('fs');
let acorn; try { acorn = require('acorn'); }
catch { console.log('⏭️  acorn غير مثبت — تخطّي حارس الجمع القرائي'); process.exit(0); }
process.chdir(require('path').resolve(__dirname, '..'));

/* أعمدة المبالغ — مخرَجُ الاستعلام أعلاه حرفياً (٢١ عموداً). */
const MONEY = new Set([
  'amount', 'cost', 'total', 'price', 'price_paid', 'purchase_price', 'paid_to_lab',
  'installment_amount', 'monthly_salary', 'no_show_fee_amount',
  'breakdown_bonus', 'breakdown_salary', 'breakdown_share',
  'price_monthly', 'price_monthly_usd', 'price_quarterly', 'price_quarterly_usd',
  'price_yearly', 'price_yearly_usd', 'old_price', 'new_price',
  // v261: أسماءٌ مشتقّة لا أعمدة — صفوفُ كشف الحساب (pp-plan.js stmtAllRows) تحمل
  // المبلغَ باسم debit/credit فكان الرصيدُ المتحرّك يجمع الليرة والدولار خارج
  // نظر الحارس. الاسمُ المشتقّ لمبلغٍ مالٌ بقدر العمود الذي وُلد منه.
  'debit', 'credit'
]);

/* استثناءاتٌ مصرَّحة بالاسم — حيث يكون التصريح داخل الملف ممنوعاً أو مضلّلاً.
 * كلٌّ منها آمنٌ بثابتٍ فوقه لا ببنيته، والثابتُ مذكورٌ صراحةً. */
const EXEMPT = [
  // الطبقة المالية مقفولة بايت-بايت بثلاث مرايا (check-critical-logic + check-mirrors):
  // تعليقٌ داخلها يكسر التطابق، ولمسُها لأجل راحة حارسٍ مخاطرةٌ بلا مقابل.
  // كلاهما يعمل داخل عملة الدفعة المحرَّرة، والجلساتُ المؤهَّلة مفلترةٌ سلفاً
  // بـ_rowCur(s) === _splitEditing.cur (v174/v182).
  ['patient-profile.html', 'saveManualSplits'],
  // أسطرُ جلسةٍ واحدة، والجلسةُ أحادية العملة بالبناء (M125) — الفلترة
  // بـsession_id تُغني عن فلترة العملة.
  ['patient-profile.html', 'computeSessionPaid'],
  // rptPlanMrr تُرجِع الليرة دائماً (تُوحّد الدولار بسعر التقارير — v103)،
  // فالمُراكم أحاديّ الوحدة بالبناء لا عابرٌ للعملات.
  ['admin-modules.js', 'rptLoad']
];

/* ── أدوات ────────────────────────────────────────────────────────────────── */
function sourceOf(p) {                       /* منقول حرفياً من check-scopes.js */
  const raw = fs.readFileSync(p, 'utf8');
  if (!/\.html?$/i.test(p)) return raw;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let out = '', last = 0, m;
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re.exec(raw))) {
    out += blank(raw.slice(last, m.index));
    out += blank(m[0].slice(0, m[0].indexOf('>') + 1));
    out += m[1];
    last = m.index + m[0].length - '</script>'.length;
  }
  out += blank(raw.slice(last));
  return out;
}
function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k in node) {
    if (k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, fn));
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
const T = (src, n) => src.slice(n.start, n.end).replace(/\s+/g, ' ').trim();
const CUR_EXPR = /\.currency\b|_rowCur\s*\(|rowCur\s*\(|\bcurrency\b|['"](SYP|USD)['"]/;
const CUR_NAME = /^(c|cur|curr|currency|_c|cu)$/i;
const NUMWRAP = /^(Number|parseFloat|parseInt|Math\.round|Math\.abs|Math\.max|Math\.min|toMinor|fromMinor)$/;

const files = fs.readdirSync('.').filter(f => /\.(html|js)$/.test(f) && f !== 'sw.js').sort();
const bad = [];
let scanned = 0, moneyAcc = 0;
const tally = { idx: 0, guard: 0, layer: 0, ann: 0, exempt: 0 };

for (const file of files) {
  const src = sourceOf(file);
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022, locations: true }); }
  catch (e) { console.log('⚠️  تعذّر تحليل ' + file + ': ' + e.message); continue; }
  scanned++;
  const rawLines = fs.readFileSync(file, 'utf8').split('\n');

  /* (أ) مُحلّلات العملة المحلية — دالةٌ قصيرة تقرأ عمود العملة. */
  const resolvers = new Set(['_rowCur', 'rowCur']);
  walk(ast, n => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init &&
        /Function|Arrow/.test(n.init.type) && T(src, n.init).length < 220 &&
        /\.currency\b/.test(T(src, n.init))) resolvers.add(n.id.name);
    if (n.type === 'FunctionDeclaration' && n.id && (n.end - n.start) < 400 &&
        /\.currency\b/.test(T(src, n))) resolvers.add(n.id.name);
  });
  const RES_RE = new RegExp('\\b(' + [...resolvers].join('|') + ')\\s*\\(');
  const CUR_CMP = new RegExp('(' + [...resolvers].join('|') + ')\\s*\\([^)]*\\)\\s*[!=]==' +
                             '|\\.currency[^\\n]{0,80}[!=]==|[!=]==[^\\n]{0,80}\\.currency');

  /* (ب) الدوال + أغلفة الطبقة (دالةٌ تُسند _filterCur لمصفوفاتها). */
  const fns = [], wrappers = new Set();
  walk(ast, n => {
    if (!/FunctionDeclaration|FunctionExpression|ArrowFunctionExpression/.test(n.type)) return;
    const nm = (n.id && n.id.name) || null;
    fns.push({ n, nm, s: n.start, e: n.end });
    if (nm && /=\s*_filterCur\s*\(/.test(T(src, n))) wrappers.add(nm);
  });
  const named = {}; fns.forEach(x => { if (x.nm) named[x.nm] = x; });
  const layerRanges = [];
  fns.forEach(x => { if (x.nm && wrappers.has(x.nm)) layerRanges.push([x.s, x.e]); });
  walk(ast, n => {                        /* ردود النداء المُمرَّرة لغلاف طبقة */
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
    if (!wrappers.has(n.callee.name)) return;
    n.arguments.forEach(a => { if (/Function|Arrow/.test(a.type)) layerRanges.push([a.start, a.end]); });
  });
  for (let pass = 0; pass < 4; pass++) {   /* إغلاق متعدٍّ على ما تناديه الطبقة */
    const add = [];
    walk(ast, n => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
      if (!layerRanges.some(([s, e]) => s <= n.start && n.end <= e)) return;
      const t = named[n.callee.name];
      if (t && !layerRanges.some(([s, e]) => s === t.s && e === t.e)) add.push([t.s, t.e]);
    });
    if (!add.length) break;
    add.forEach(r => layerRanges.push(r));
  }
  const inLayer = pos => layerRanges.some(([s, e]) => s <= pos && pos <= e);
  const fnAt = pos => { let b = null; for (const x of fns) if (x.nm && x.s <= pos && pos <= x.e) if (!b || (x.e - x.s) < (b.e - b.s)) b = x; return b ? b.nm : '(مجهول)'; };

  /* (ج) نطاق التكرار الأضيق المحيط بالموضع — حلقةٌ أو ردُّ نداء تكرار. */
  const iterNodes = [];
  walk(ast, n => {
    if (/^(For|ForIn|ForOf|While|DoWhile)Statement$/.test(n.type)) iterNodes.push(n);
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' &&
        !n.callee.computed && n.callee.property.type === 'Identifier' &&
        /^(forEach|map|filter|reduce|some|every)$/.test(n.callee.property.name)) {
      n.arguments.forEach(a => { if (/Function|Arrow/.test(a.type)) iterNodes.push(a); });
    }
  });
  const iterAt = pos => { let b = null; for (const n of iterNodes) if (n.start <= pos && pos <= n.end) if (!b || (n.end - n.start) < (b.end - b.start)) b = n; return b; };
  /* مصفوفاتٌ مفلترةٌ بالعملة: var eligible = list.filter(s => _rowCur(s) === cur) */
  const curArrays = new Set();
  walk(ast, n => {
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !n.init) return;
    const init = n.init;
    if (init.type !== 'CallExpression' || init.callee.type !== 'MemberExpression') return;
    if (init.callee.computed || init.callee.property.name !== 'filter') return;
    if (CUR_CMP.test(T(src, init))) curArrays.add(n.id.name);
  });
  const ARR_RE = curArrays.size ? new RegExp('\\b(' + [...curArrays].join('|') + ')\\b') : null;
  function curGuarded(pos) {
    /* يُصعَد بسلسلة نطاقات التكرار المتداخلة: يكفي أن يكون أحدها محروساً
     * بشرط عملة (بند ١-ب) أو يمرّ على مصفوفةٍ مفلترةٍ بالعملة (بند ١-ج).
     * الحلقةُ الداخلية ترث قسمةَ الحلقة التي تحويها — عزلُ الفحص بالنطاق
     * الأضيق وحده كان يرفض FIFO رغم أنه مقسومٌ عند مرشِّح جلساته. */
    const chain = iterNodes.filter(n => n.start <= pos && pos <= n.end);
    for (const it of chain) {
      const t = src.slice(it.start, it.end);
      if (CUR_CMP.test(t)) return true;
      if (ARR_RE && ARR_RE.test(t)) return true;
    }
    return false;
  }

  /* (د) تتبّع الوسم: مفاتيح وأكياس مربوطة بالعملة + مُعرِّفات تحمل قيمة مبلغ. */
  const curKeys = new Set(), curBags = new Set(), moneyLocals = new Set();
  function isMoneyScalar(e) {
    if (!e) return false;
    if (e.type === 'MemberExpression' && !e.computed && e.property.type === 'Identifier' && MONEY.has(e.property.name)) return true;
    if (e.type === 'MemberExpression' && e.computed && e.property.type === 'Literal' && MONEY.has(e.property.value)) return true;
    if (e.type === 'Identifier') return moneyLocals.has(e.name);
    if (e.type === 'LogicalExpression') return isMoneyScalar(e.left) || isMoneyScalar(e.right);
    if (e.type === 'ConditionalExpression') return isMoneyScalar(e.consequent) || isMoneyScalar(e.alternate);
    if (e.type === 'BinaryExpression' && /^[-+*/]$/.test(e.operator)) return isMoneyScalar(e.left) || isMoneyScalar(e.right);
    if (e.type === 'UnaryExpression') return isMoneyScalar(e.argument);
    if (e.type === 'CallExpression') {
      const c = e.callee;
      const nm = c.type === 'Identifier' ? c.name
               : (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier')
                 ? (c.object.name + '.' + c.property.name) : '';
      if (NUMWRAP.test(nm)) return e.arguments.some(isMoneyScalar);
    }
    return false;
  }
  for (let pass = 0; pass < 3; pass++) {
    walk(ast, n => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || !n.init) return;
      const it = T(src, n.init);
      if (CUR_EXPR.test(it) || RES_RE.test(it) || CUR_NAME.test(n.id.name)) curKeys.add(n.id.name);
      if (n.init.type === 'MemberExpression' && n.init.computed) {
        const idx = T(src, n.init.property);
        if (CUR_EXPR.test(idx) || RES_RE.test(idx) || curKeys.has(idx) || CUR_NAME.test(idx)) curBags.add(n.id.name);
      }
      if (isMoneyScalar(n.init)) moneyLocals.add(n.id.name);
    });
  }
  const idxIsCur = node => {
    const t = T(src, node);
    if (/\.(cur|curr|currency)$/i.test(t)) return true;   /* e.cur · row.currency */
    return CUR_EXPR.test(t) || RES_RE.test(t) || curKeys.has(t) || CUR_NAME.test(t);
  };
  function lhsScoped(lhs) {
    let cur = lhs, sawCur = false, base = null;
    while (cur && cur.type === 'MemberExpression') {
      if (cur.computed && idxIsCur(cur.property)) sawCur = true;
      base = cur.object; cur = cur.object;
    }
    if (sawCur) return true;
    const root = (base && base.type === 'Identifier') ? base.name
               : (lhs.type === 'Identifier' ? lhs.name : null);
    return !!(root && curBags.has(root));
  }

  /* (هـ) الحكم على موضعٍ واحد. */
  function judge(node, isMoney, lhsOk, label) {
    if (!isMoney) return;
    moneyAcc++;
    const line = node.loc.start.line;
    if (/cur-ok/.test(rawLines[line - 1] || '')) { tally.ann++; return; }
    const fn = fnAt(node.start);
    if (EXEMPT.some(([f, g]) => f === file && g === fn)) { tally.exempt++; return; }
    if (lhsOk) { tally.idx++; return; }
    if (curGuarded(node.start)) { tally.guard++; return; }
    if (inLayer(node.start)) { tally.layer++; return; }
    bad.push(file + ':' + line + '  ' + fn + '  →  ' + label);
  }

  walk(ast, n => {
    /* الشكل (أ): acc += / -= مبلغ — مع استبعاد بناء الماركب (سلسلةٌ بالطرف الأيمن). */
    if (n.type === 'AssignmentExpression' && (n.operator === '+=' || n.operator === '-=')) {
      let hasStr = false, isMoney = false;
      walk(n.right, x => {
        if ((x.type === 'Literal' && typeof x.value === 'string') || x.type === 'TemplateLiteral') hasStr = true;
      });
      if (hasStr) return;                       /* بناءُ نصٍّ لا جمعُ مال */
      isMoney = isMoneyScalar(n.right);
      judge(n, isMoney, lhsScoped(n.left), T(src, n).slice(0, 100));
      return;
    }
    /* الشكل (ب): arr.reduce(function(acc, r){ return acc ± مبلغ; }, 0) */
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' &&
        !n.callee.computed && n.callee.property.type === 'Identifier' &&
        n.callee.property.name === 'reduce' && n.arguments.length &&
        /Function|Arrow/.test(n.arguments[0].type)) {
      const cb = n.arguments[0];
      if (!cb.params.length || cb.params[0].type !== 'Identifier') return;
      const accName = cb.params[0].name;
      let isMoney = false;
      const check = expr => {
        if (!expr || expr.type !== 'BinaryExpression' || !/^[-+]$/.test(expr.operator)) return;
        const usesAcc = [expr.left, expr.right].some(x => x && x.type === 'Identifier' && x.name === accName);
        if (usesAcc && isMoneyScalar(expr)) isMoney = true;
      };
      if (cb.body.type !== 'BlockStatement') check(cb.body);
      else walk(cb.body, x => { if (x.type === 'ReturnStatement') check(x.argument); });
      if (!isMoney) return;
      /* المصفوفة مفلترةٌ سلفاً بالعملة بسلسلة النداء ⇒ مقسومة (bag-by-filter). */
      const chainOk = CUR_CMP.test(T(src, n.callee.object));
      judge(n, true, chainOk, T(src, n).slice(0, 100));
    }
  });
}

const total = moneyAcc;
console.log('مُراكمات قرائية لمبلغ: ' + total +
            ' · مفهرسة ' + tally.idx + ' · محروسة ' + tally.guard +
            ' · بغلاف طبقة ' + tally.layer +
            ' · مصرَّحة ' + (tally.ann + tally.exempt) + ' · مرفوضة ' + bad.length);
if (bad.length) {
  console.log('\n🔴 جمعٌ عابرَ العملات وقت القراءة (قاعدة #481) — اقسِم بالعملة أو صرِّح `cur-ok`:');
  bad.forEach(b => console.log('   ' + b));
  process.exit(1);
}
console.log('✅ حارس الجمع القرائي: كل مُراكم مبلغ مقسومٌ بالعملة (' + scanned + ' ملفاً · ' + MONEY.size + ' عمود مال).');

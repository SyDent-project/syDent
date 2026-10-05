/* ── مدقّق النطاقات (متعدّد الملفات) ──────────────────────────────────────────
   يحاكي نطاق المتصفّح: كل السكربتات المُحمَّلة بالصفحة تتشارك عالماً واحداً.
   فيجمع أولاً تصريحات المستوى الأعلى من الملفات المتشاركة، ثم يدقّق الملف
   الأخير بحثاً عن مُعرِّفٍ يُشار إليه من دالةٍ لا يعيش في نطاقها ولا بالعالم.

   يمسك تحديداً ما لا يمسكه غيره: `node --check` يمرّره (سليمٌ نحوياً)، والحُرّاس
   النصّية لا تراه، ولا يظهر إلا وقت التشغيل بيد المستخدم.
   الاستعمال: node scope_audit.js <ملف…> — آخر وسيطٍ هو المُدقَّق. */
const fs = require('fs');
let acorn; try { acorn = require('acorn'); }
catch { console.log('⏭️  acorn غير مثبت — تخطّي'); process.exit(0); }

const GLOBALS = new Set([
  'window','document','console','location','navigator','fetch','setTimeout','clearTimeout',
  'setInterval','clearInterval','JSON','Math','Date','Object','Array','String','Number','Boolean',
  'Promise','Map','Set','WeakMap','WeakSet','RegExp','Error','TypeError','parseInt','parseFloat',
  'isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','escape',
  'unescape','alert','confirm','prompt','localStorage','sessionStorage','requestAnimationFrame',
  'cancelAnimationFrame','Intl','URL','URLSearchParams','TextEncoder','TextDecoder','Blob','File',
  'FormData','AbortController','structuredClone','globalThis','undefined','NaN','Infinity',
  'arguments','XLSX','Sentry','crypto','performance','atob','btoa','queueMicrotask','history',
  'HTMLElement','Element','Node','Event','CustomEvent','MutationObserver','IntersectionObserver',
  'BroadcastChannel','Notification','Image','FileReader','DOMParser','getComputedStyle','print',
  'Symbol','Proxy','Reflect','BigInt','Function','matchMedia','open','close','scrollTo','screen',
  'ResizeObserver','Uint8Array','Uint16Array','Uint32Array','self','createImageBitmap','Int8Array','Float32Array','ArrayBuffer','DataView',
  'WebSocket','EventSource','Worker','caches','indexedDB','ImageData','OffscreenCanvas','Response',
  'Request','Headers','AbortSignal','ClipboardItem','SVGElement','CanvasRenderingContext2D',
  'Chart','Turnstile','turnstile','supabase','html2canvas','jspdf' // مكتبات CDN
]);

function sourceOf(p) {
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

function parse(p) {
  try { return acorn.parse(sourceOf(p), { ecmaVersion: 2022, locations: true }); }
  catch (e) { console.log('⚠️  تعذّر تحليل ' + p + ': ' + e.message); return null; }
}

function collectPattern(pat, fn) {
  if (!pat) return;
  if (pat.type === 'Identifier') fn(pat.name);
  else if (pat.type === 'ObjectPattern') pat.properties.forEach(pr => collectPattern(pr.value || pr.argument, fn));
  else if (pat.type === 'ArrayPattern') pat.elements.forEach(e => collectPattern(e, fn));
  else if (pat.type === 'AssignmentPattern') collectPattern(pat.left, fn);
  else if (pat.type === 'RestElement') collectPattern(pat.argument, fn);
}

function hoist(nodes, declare) {
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => collectPattern(d.id, declare));
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) declare(n.id.name);
    if (n.type === 'CatchClause' && n.param) collectPattern(n.param, declare);
    if (/Function(Expression|Declaration)|ArrowFunctionExpression/.test(n.type)) return;
    for (const k in n) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  nodes.forEach(walk);
}

/* نمطُ المشروع السائد لتصدير عالميّ: `window.X = …` — يُعلَن X عالمياً حقيقةً
   ولو لم يُصرَّح به. تُجمَع هذه من الملف **كلّه** بما فيه داخلُ الدوال والـIIFE،
   لأن التصدير كثيراً ما يقع داخل دالة تهيئة. */
function collectWindowExports(node, declare) {
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' &&
        !n.left.computed && n.left.object.type === 'Identifier' &&
        (n.left.object.name === 'window' || n.left.object.name === 'globalThis') &&
        n.left.property.type === 'Identifier') {
      declare(n.left.property.name);
    }
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(node);
}

/* اكتشافٌ ذاتي: أي ملف HTML يُمرَّر تُقرأ منه وسوم <script src> وتُضمّ ملفاتها
   المحلية إلى العالم — فلا يعتمد التدقيق على قائمةٍ يدوية تتعفّن. */
function pageScripts(htmlPath) {
  const raw = fs.readFileSync(htmlPath, 'utf8');
  const dir = require('path').dirname(htmlPath);
  const out = [];
  const re = /<script[^>]*\bsrc=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(raw))) {
    const src = m[1].split('?')[0];
    if (/^(https?:)?\/\//.test(src)) continue;      // CDN
    const p = require('path').join(dir, src);
    if (fs.existsSync(p)) out.push(p);
  }
  return [...new Set(out)];
}


/* الإسنادُ البسيط إلى اسمٍ غير معلَن يُنشئ متغيّراً عالمياً بالوضع غير الصارم
   ولا يرمي أبداً — بخلاف **القراءة** التي ترمي ReferenceError. المدقّق يهدف
   إلى الانهيارات وقت التشغيل لا إلى أسلوب الكتابة، فتُجمَع هذه الأسماء ضمن
   العالم ولا يُبلَّغ عنها. (لُوحظ النمط بالطبقة السنّية/المالية حيث تُشارَك
   قيمٌ بين دوال عبر عالميّاتٍ ضمنية — يعمل، لكنه ينكسر تحت 'use strict'.) */
function collectImplicitGlobals(node, declare) {
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') declare(n.left.name);
    if ((n.type === 'ForInStatement' || n.type === 'ForOfStatement') && n.left.type === 'Identifier')
      declare(n.left.name);
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(node);
}

/* بلا وسائط: يمسح كل صفحات جذر المستودع — فيصير قابلاً للوصل بـvalidate.sh
   بسطرٍ واحد بلا قائمةٍ يدوية تتعفّن. */
let argv = process.argv.slice(2);
if (argv.length === 0) {
  const root = require('path').resolve(__dirname, '..');
  const pages = fs.readdirSync(root).filter(f => /\.html?$/i.test(f)).sort();
  let bad = 0, ok = 0;
  for (const page of pages) {
    const r = require('child_process').spawnSync(
      process.execPath, [__filename, require('path').join(root, page)],
      { encoding: 'utf8' });
    if (r.status === 0) ok++;
    else { bad++; process.stdout.write(r.stdout); }
  }
  if (bad === 0) console.log('✅ حارس النطاقات: ' + ok + ' صفحة · صفر مُعرِّف يُقرأ خارج نطاقه');
  else console.log('❌ حارس النطاقات: ' + bad + ' صفحة فيها مُعرِّفات خارج النطاق');
  process.exit(bad ? 1 : 0);
}
let files = argv;
const target0 = files[files.length - 1];
if (/\.html?$/i.test(target0)) files = [...pageScripts(target0), ...files];
files = [...new Set(files)];
const world = new Set(GLOBALS);
const asts = new Map();
for (const f of files) {
  const ast = parse(f);
  if (!ast) continue;
  asts.set(f, ast);
  hoist(ast.body, n => world.add(n));
  collectWindowExports(ast, n => world.add(n));
  collectImplicitGlobals(ast, n => world.add(n));
}

/* يُدقَّق كل ملفات الصفحة لا الأخير وحده — البرنامج يعيش في المتصفّح ككلّ.
   تُستثنى حزم vendor المُصغَّرة من **التدقيق** (أنماطها المُصغَّرة تُربك أي
   محلّل نطاقات، وهي طرفٌ ثالث لا نملكه) لكنها تبقى ضمن **العالم** فتُرى
   تصديراتها العامة من كودنا. */
let anyFail = false;
const isVendor = (f) => /(^|\/)vendor\//.test(f) || /\.min\.js$/i.test(f);
for (const target of files) {
  if (isVendor(target)) continue;
  const ast = asts.get(target);
  if (!ast) continue;

  const scopes = [{ names: world }];
  const errors = [];
  const declare = n => scopes[scopes.length - 1].names.add(n);
  const known = n => scopes.some(s => s.names.has(n));

  const typeofGuarded = new Set();
  (function scanTypeof(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'UnaryExpression' && n.operator === 'typeof' && n.argument.type === 'Identifier')
      typeofGuarded.add(n.argument.name);
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(scanTypeof);
      else if (v && typeof v.type === 'string') scanTypeof(v);
    }
  })(ast);

  (function visit(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    const isFn = /Function(Expression|Declaration)|ArrowFunctionExpression/.test(node.type);
    if (isFn) {
      scopes.push({ names: new Set() });
      if (node.id) declare(node.id.name);
      node.params.forEach(p => collectPattern(p, declare));
      if (node.body.type === 'BlockStatement') hoist(node.body.body, declare);
    }
    if (node.type === 'Identifier' && parent) {
      const skip =
        (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
        (parent.type === 'Property' && parent.key === node && !parent.computed) ||
        (parent.type === 'MethodDefinition' && parent.key === node) ||
        (parent.type === 'VariableDeclarator' && parent.id === node) ||
        (parent.type === 'UnaryExpression' && parent.operator === 'typeof' && parent.argument === node) ||
        (/Function|ClassDeclaration/.test(parent.type) &&
          (parent.id === node || (parent.params || []).includes(node))) ||
        parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' ||
        parent.type === 'ContinueStatement' || parent.type === 'CatchClause';
      if (!skip && !known(node.name)) errors.push({ name: node.name, line: node.loc.start.line });
    }
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => visit(c, node));
      else if (v && typeof v.type === 'string') visit(v, node);
    }
    if (isFn) scopes.pop();
  })(ast, null);

  const seen = new Map();
  errors.filter(e => !typeofGuarded.has(e.name)).forEach(e => {
    if (!seen.has(e.name)) seen.set(e.name, []);
    seen.get(e.name).push(e.line);
  });
  if (seen.size) {
    anyFail = true;
    console.log('   ❌ ' + target + ':');
    for (const [n, l] of seen) console.log('      ' + n + '  ← سطر ' + [...new Set(l)].slice(0, 8).join(', '));
  }
}
if (!anyFail) console.log('✅ ' + target0 + ' (+' + (files.length - 1) + ' سكربت): صفر مُعرِّف خارج النطاق');
process.exit(anyFail ? 1 : 0);

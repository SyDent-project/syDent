/* مثبت تلميح الأدمن قبل الرسم — يعمل على الكود المستخرَج حيّاً لا على نسخة.
   البرهان الحاسم هنا ليس «التحويل يقع» بل «الحلقة لا تُغلق»: علامةٌ قديمة
   مع انقطاع شبكة كانت سترتدّ أبديّاً بين index.html وadmin.html، وحارسُ
   القفزة هو ما يمنع ذلك — ومنعُه مُنفَّذ فعلاً هنا لا مُدَّعى. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const T = (name, fn) => {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' — ' + e.message); fail++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const yes = (c, m) => { if (!c) throw new Error(m); };

/* ── استخراج حيّ ──────────────────────────────────────────────────────── */
const PAGES = ['index.html', 'patients.html', 'appointments.html', 'labs.html', 'patient-profile.html'];

function headLine(page) {
  const m = /<script>try\{var _pa=[^\n]*?<\/script>/.exec(read(page));
  if (!m) throw new Error(page + ': سطر التلميح غير موجود');
  return m[0];
}
function authLine() {
  const m = /<script>try\{if\(!location[^\n]*?<\/script>/.exec(read('auth.html'));
  if (!m) throw new Error('auth.html: سطر التلميح غير موجود');
  return m[0];
}
const headJs = line => line.replace(/^<script>/, '').replace(/<\/script>$/, '');

const INIT = read('supabase-init.js');

function slice(src, startMark, endMark, label) {
  const i = src.indexOf(startMark);
  if (i === -1) throw new Error('لم أجد ' + label);
  const j = src.indexOf(endMark, i);
  if (j === -1) throw new Error('لم أجد نهاية ' + label);
  return src.slice(i, j + endMark.length);
}
const PADM_BLOCK = slice(INIT, "  var PADM_KEY = 'sydent.padm';",
  "  function _padmClear() {\n    try { localStorage.removeItem(PADM_KEY); sessionStorage.removeItem(PADM_HOP); } catch (e) { }\n  }", 'كتلة PADM');
const IPA = slice(INIT, '  window.SyDentAuth.isPlatformAdmin = async function(userId) {', '\n  };', 'isPlatformAdmin');

/* ── بيئة الاختبار ───────────────────────────────────────────────────── */
function mkStore(blocked) {
  const m = new Map();
  const guard = () => { if (blocked) throw new Error('SecurityError: storage blocked'); };
  return {
    getItem: k => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: k => { guard(); m.delete(k); },
    _raw: m,
  };
}

function runHead(line, { padm, auth, hop, blocked, search, hash } = {}) {
  const ls = mkStore(blocked), ss = mkStore(blocked);
  if (!blocked) {
    if (padm != null) ls.setItem('sydent.padm', padm);
    if (auth != null) ls.setItem('sydent.auth', auth);
    if (hop != null) ss.setItem('sydent.padm.hop', hop);
  }
  const redirects = [];
  const ctx = vm.createContext({
    localStorage: ls, sessionStorage: ss,
    location: { replace: u => redirects.push(u), search: search || '', hash: hash || '' },
  });
  new vm.Script(headJs(line)).runInContext(ctx);
  return { redirects, ls, ss };
}

function mkAuthBlob(uid) {
  return JSON.stringify({ access_token: 'x.y.z', token_type: 'bearer', user: { id: uid, email: 'a@b.c' } });
}

async function runIpa(userId, sbResult, { seed, blocked, src } = {}) {
  const ls = mkStore(false), ss = mkStore(false);
  if (seed != null) ls.setItem('sydent.padm', seed);
  const lsx = blocked ? mkStore(true) : ls;
  const ssx = blocked ? mkStore(true) : ss;
  const win = { SyDentAuth: {}, sb: { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => { if (sbResult instanceof Error) throw sbResult; return sbResult; } }) }) }) } };
  const ctx = vm.createContext({
    window: win, localStorage: lsx, sessionStorage: ssx,
    console: { warn: () => {} },
  });
  new vm.Script(src || (PADM_BLOCK + '\n' + IPA)).runInContext(ctx);
  const res = await win.SyDentAuth.isPlatformAdmin(userId);
  return { res, ls, ss };
}

/* ══ 1) السطر المتزامن — ست حالات ═══════════════════════════════════════ */
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const L = headLine('index.html');

T('أدمن بعلامة مطابقة ⇒ تحويل واحد لـadmin.html', () => {
  const r = runHead(L, { padm: U1, auth: mkAuthBlob(U1) });
  eq(r.redirects.length, 1, 'عدد التحويلات');
  eq(r.redirects[0], 'admin.html', 'الوجهة');
});
T('التحويل يضع مفتاح القفزة', () => {
  const r = runHead(L, { padm: U1, auth: mkAuthBlob(U1) });
  eq(r.ss.getItem('sydent.padm.hop'), '1', 'مفتاح القفزة');
});
T('🔴 قفزة ثانية بنفس التبويب ⇒ صفر تحويل (كاسر الحلقة)', () => {
  const r = runHead(L, { padm: U1, auth: mkAuthBlob(U1), hop: '1' });
  eq(r.redirects.length, 0, 'عدد التحويلات');
  eq(r.ss.getItem('sydent.padm.hop'), null, 'مفتاح القفزة يُفرَّغ بعد القعود');
});
T('علامة لمستخدم آخر على نفس الجهاز ⇒ صفر تحويل', () => {
  eq(runHead(L, { padm: U2, auth: mkAuthBlob(U1) }).redirects.length, 0, 'عدد التحويلات');
});
T('بلا علامة (مستأجر عادي) ⇒ صفر تحويل', () => {
  eq(runHead(L, { auth: mkAuthBlob(U1) }).redirects.length, 0, 'عدد التحويلات');
});
T('علامة بلا جلسة ⇒ صفر تحويل', () => {
  eq(runHead(L, { padm: U1 }).redirects.length, 0, 'عدد التحويلات');
});
T('تخزين محجوب ⇒ لا رمية ولا تحويل (تدهور رشيق)', () => {
  const r = runHead(L, { blocked: true });
  eq(r.redirects.length, 0, 'عدد التحويلات');
});

/* ══ 2) الكاتب — أربع حالات ═════════════════════════════════════════════ */
const AS = [];
AS.push(['نتيجة نظيفة true ⇒ تُكتب العلامة بهوية المستخدم', async () => {
  const { res, ls } = await runIpa(U1, { data: { user_id: U1 }, error: null });
  eq(res.isAdmin, true, 'isAdmin');
  eq(ls.getItem('sydent.padm'), U1, 'قيمة العلامة');
}]);
AS.push(['نتيجة نظيفة true ⇒ يُفرَّغ مفتاح القفزة (ميزانية جديدة)', async () => {
  const { ss } = await runIpa(U1, { data: { user_id: U1 }, error: null });
  eq(ss.getItem('sydent.padm.hop'), null, 'مفتاح القفزة');
}]);
AS.push(['نتيجة نظيفة false ⇒ تُمسح العلامة (كاسر الحلقة البنيوي)', async () => {
  const { res, ls } = await runIpa(U1, { data: null, error: null }, { seed: U1 });
  eq(res.isAdmin, false, 'isAdmin');
  eq(ls.getItem('sydent.padm'), null, 'العلامة');
}]);
AS.push(['🔴 خطأ شبكة ⇒ العلامة لا تُمسّ إطلاقاً', async () => {
  const { res, ls } = await runIpa(U1, { data: null, error: { message: 'Failed to fetch' } }, { seed: U1 });
  eq(res.isAdmin, false, 'isAdmin');
  eq(ls.getItem('sydent.padm'), U1, 'العلامة يجب أن تنجو من الانقطاع');
}]);
AS.push(['استثناء ⇒ العلامة لا تُمسّ إطلاقاً', async () => {
  const { res, ls } = await runIpa(U1, new Error('boom'), { seed: U1 });
  eq(res.isAdmin, false, 'isAdmin');
  eq(ls.getItem('sydent.padm'), U1, 'العلامة');
}]);
AS.push(['تخزين محجوب أثناء الكتابة ⇒ لا رمية والنتيجة سليمة', async () => {
  const { res } = await runIpa(U1, { data: { user_id: U1 }, error: null }, { blocked: true });
  eq(res.isAdmin, true, 'isAdmin');
}]);

/* ══ 3) السيناريو الأخطر: علامة قديمة + انقطاع شبكة ═══════════════════ */
AS.push(['🔴 علامة قديمة + أوفلاين ⇒ قفزة واحدة لا حلقة أبدية', async () => {
  /* التبويب واحد: sessionStorage يعيش عبر النداءين كما بالمتصفح */
  const ls = mkStore(false), ss = mkStore(false);
  ls.setItem('sydent.padm', U1);
  ls.setItem('sydent.auth', mkAuthBlob(U1));
  const hop = () => ss.getItem('sydent.padm.hop');

  const go = () => {
    const redirects = [];
    const ctx = vm.createContext({ localStorage: ls, sessionStorage: ss,
      location: { replace: u => redirects.push(u) } });
    new vm.Script(headJs(L)).runInContext(ctx);
    return redirects;
  };

  eq(go().length, 1, 'الفتحة الأولى تحوّل');   // index → admin.html
  eq(hop(), '1', 'القفزة مختومة');

  /* admin.html: الفحص يفشل بالشبكة ⇒ العلامة تنجو ⇒ يرتدّ لـindex.html */
  const { ls: _l } = await runIpa(U1, { data: null, error: { message: 'Failed to fetch' } }, { seed: U1 });
  eq(_l.getItem('sydent.padm'), U1, 'العلامة نجت من الفشل');

  eq(go().length, 0, 'الارتداد لا يُنتج تحويلاً ثانياً ⇒ الحلقة مكسورة');
}]);

/* ══ 3.5) auth.html — السطح السادس بصيغة ملفوفة ════════════════════════ */
const A = authLine();

T('auth.html: نواة التلميح بايت-متطابقة مع الخمسة', () => {
  const core = L.replace(/^<script>try\{/, '').replace(/\}catch\(e\)\{\}<\/script>$/, '');
  eq(A, `<script>try{if(!location.search&&!location.hash){${core}}}catch(e){}</script>`, 'صيغة auth.html');
});
T('auth.html: أدمن بلا search/hash ⇒ تحويل قبل الرسم', () => {
  const r = runHead(A, { padm: U1, auth: mkAuthBlob(U1) });
  eq(r.redirects.length, 1, 'عدد التحويلات');
  eq(r.redirects[0], 'admin.html', 'الوجهة');
});
T('🔴 auth.html: ?logged_out=1 ⇒ صفر تحويل (مسار الخروج محفوظ)', () => {
  eq(runHead(A, { padm: U1, auth: mkAuthBlob(U1), search: '?logged_out=1' }).redirects.length, 0, 'عدد التحويلات');
});
T('auth.html: ?reset=success و?denied= ⇒ صفر تحويل (الرسالة تُقرأ)', () => {
  eq(runHead(A, { padm: U1, auth: mkAuthBlob(U1), search: '?reset=success' }).redirects.length, 0, 'reset');
  eq(runHead(A, { padm: U1, auth: mkAuthBlob(U1), search: '?denied=suspended' }).redirects.length, 0, 'denied');
});
T('auth.html: #register و?tab=register ⇒ صفر تحويل (تبويب التسجيل)', () => {
  eq(runHead(A, { padm: U1, auth: mkAuthBlob(U1), hash: '#register' }).redirects.length, 0, 'hash');
  eq(runHead(A, { padm: U1, auth: mkAuthBlob(U1), search: '?tab=register' }).redirects.length, 0, 'tab');
});
T('auth.html: صفر نوم بحارس المصادقة (دَين v146 مُصفّى)', () => {
  yes(!/await new Promise\(r => setTimeout\(r, \d+\)\);/.test(read('auth.html')), 'النوم ما زال موجوداً');
});
bites('نزع شرط search/hash ⇒ يُخطف مسار الخروج', () => {
  return A.replace('if(!location.search&&!location.hash){', '{');
}, mutated => {
  eq(runHead(mutated, { padm: U1, auth: mkAuthBlob(U1), search: '?logged_out=1' }).redirects.length, 0,
     'مع الطفرة يجب أن يقع تحويل');
});

/* ══ 4) بايت-تطابق الصفحات الخمس ═══════════════════════════════════════ */
T('السطر بايت-متطابق بالصفحات الخمس', () => {
  const set = new Set(PAGES.map(headLine));
  eq(set.size, 1, 'عدد الصيغ المختلفة');
});
T('السطر مرة واحدة بكل صفحة', () => {
  for (const p of PAGES) {
    const n = (read(p).match(/<script>try\{var _pa=/g) || []).length;
    eq(n, 1, p + ': عدد النسخ');
  }
});
T('السطر يسبق <body> بالصفحات الخمس', () => {
  for (const p of PAGES) {
    const h = read(p);
    yes(h.indexOf(headLine(p)) < /^<body/m.exec(h).index, p + ': السطر بعد الجسم');
  }
});

/* ══ 5) عدم العبثية — كل توكيد مَعضوض بطفرة ════════════════════════════ */
function bites(name, mutate, probe) {
  T('عضّة: ' + name, () => {
    let threw = false;
    try { probe(mutate()); } catch (e) { threw = true; }
    yes(threw, 'الطفرة مرّت بلا اعتراض ⇒ التوكيد عبثيّ');
  });
}
bites('نزع حارس القفزة ⇒ الحلقة تعود', () => {
  return L.replace(/if\(sessionStorage\.getItem\('sydent\.padm\.hop'\)\)\{sessionStorage\.removeItem\('sydent\.padm\.hop'\);\}else\{/, '{')
          .replace(/\}\}\}catch/, '}}catch');
}, mutated => {
  const r = runHead(mutated, { padm: U1, auth: mkAuthBlob(U1), hop: '1' });
  eq(r.redirects.length, 0, 'مع الطفرة يجب أن يقع تحويل ثانٍ');
});
bites('نزع مطابقة الهوية ⇒ يُخطف مستخدم آخر', () => {
  return L.replace("_ps.indexOf(_pa)>-1", "true");
}, mutated => {
  eq(runHead(mutated, { padm: U2, auth: mkAuthBlob(U1) }).redirects.length, 0, 'مع الطفرة يجب أن يقع تحويل');
});
AS.push(['عضّة: لو مسح فرعُ الخطأ العلامةَ لماتت الميزة بأول انقطاع', async () => {
  const NEEDLE = "        return { isAdmin: false, error: res.error.message };";
  const base = PADM_BLOCK + '\n' + IPA;
  eq(base.split(NEEDLE).length - 1, 1, 'مرساة فرع الخطأ غير فريدة');
  const mutated = base.replace(NEEDLE, "        _padmHint(null);\n" + NEEDLE);
  const { ls } = await runIpa(U1, { data: null, error: { message: 'Failed to fetch' } },
                              { seed: U1, src: mutated });
  eq(ls.getItem('sydent.padm'), null, 'الطفرة مرّت بلا أثر ⇒ التوكيد عبثيّ');
}]);

/* تشغيل غير المتزامنة ثم التقرير */
(async () => {
  for (const [n, f] of AS) {
    try { await f(); console.log('  ✓ ' + n); pass++; }
    catch (e) { console.log('  ✗ ' + n + ' — ' + e.message); fail++; }
  }
  console.log('');
  console.log(fail ? `⛔ ${fail} فشل / ${pass} نجاح` : `✅ ${pass}/${pass} توكيداً على كود مستخرَج حيّاً`);
  process.exit(fail ? 1 : 0);
})();

/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — sw.js · Service Worker (PWA — Phase 0: app-shell فقط)
   ─────────────────────────────────────────────────────────────────────────────
   الوظيفة: يجعل «هيكل التطبيق» يفتح بلا إنترنت. لا يلمس البيانات إطلاقاً.

   الاستراتيجيات (قرارات أمان مقصودة — لا تغيّرها بلا مراجعة):
   • تنقّلات HTML  → network-first: أونلاين تأخذ دائماً أحدث نشر (صفر «كود قديم
     عالق»)؛ offline تُخدَم نسخة آخر زيارة، وإلا offline.html.
     ملاحظة pretty-URLs: Cloudflare Pages يحوّل /page.html → /page (308).
     طلب التنقّل الأول يرجع opaqueredirect (يُمرَّر كما هو بلا كاش)، والمتصفح
     يعيد التنقّل للمسار النظيف فيُكاش تحته. البحث offline يجرّب المسارين.
   • أصول نفس الأصل الموسومة ?v=  → cache-first (الرابط يتغيّر مع كل تعديل،
     فالكاش لا يمكن أن يعلق على قديم — يتعاون مع cache-bust.sh لا يصادمه).
   • خطوط Google (googleapis/gstatic فقط) → stale-while-revalidate (تجميلي).
   • كل ما عداه لا يُلمَس: Supabase وSentry وjsDelivr وmedia.* تمر للشبكة
     مباشرة. **ممنوع بنيوياً** كاش أي استجابة Supabase (بيانات/أرصدة) — deny-list
     صريحة تحت كضمانة مزدوجة فوق فحص نفس-الأصل.

   التحديث: المتصفح يعيد التحقق من sw.js عند كل تنقّل (يتجاوز HTTP cache
   افتراضياً + _headers: no-cache). عدّلت هذا الملف؟ ارفع SW_VERSION.
   مفتاح الإيقاف: KILL_SWITCH=true + نشر ⇒ يمسح كل كاشات sydent-* ويلغي
   تسجيل نفسه على كل الأجهزة عند أول زيارة أونلاين، ويمرّر كل الطلبات للشبكة.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var SW_VERSION  = 'v570';   /* v257: سجلّ الإصدارات انتقل إلى CHANGELOG.md (كان 430KB بهذا السطر). كل رفع نسخة يُسجَّل هناك — لا هنا. */
var KILL_SWITCH = false;

var PRECACHE = 'sydent-precache-' + SW_VERSION;
var PAGES    = 'sydent-pages-'    + SW_VERSION;
var ASSETS   = 'sydent-assets-'   + SW_VERSION;
var FONTS    = 'sydent-fonts-'    + SW_VERSION;
var CURRENT  = [PRECACHE, PAGES, ASSETS, FONTS];

var OFFLINE_URL   = '/offline.html';
var PRECACHE_URLS = [OFFLINE_URL, '/favicon.svg?v=4', '/manifest.json'];
/* مكتبات vendor الحرجة: تُسخَّن بكاش ASSETS عند install (لا PRECACHE — مسار
   الجلب handleSWR يطابق داخل ASSETS حصراً، فوضعها بـPRECACHE لن يخدمها أبداً).
   اسم الملف مُرقَّم بالنسخة ⇒ محتواه لا يتغير ⇒ SWR آمن تماماً. */
var VENDOR_WARM   = ['/vendor/supabase-2.110.8.min.js'];
/* v493: خطّ الواجهة المستضاف ذاتياً — يُسخَّن مع vendor كي يعمل بلا اتصال من أول زيارة.
   الأسماء ثابتة (عائلة-مجموعة-وزن) ⇒ المحتوى لا يتغيّر ⇒ SWR آمن. */
['arabic', 'latin'].forEach(function (sub) {
  ['400', '500', '600', '700'].forEach(function (w) {
    VENDOR_WARM.push('/fonts/ibm-plex-sans-arabic-' + sub + '-' + w + '-normal.woff2');
  });
});
/* صفحات جوهر العيادة: تُسخَّن حتمياً عند install (قشور بلا PHI — البيانات
   تُحقن client-side من IndexedDB) كي لا تعتمد تغطية الأوفلاين على حظ الزيارات.
   تدخل أيضاً مصدر REFRESH_PAGES فتُشفى ذاتياً لو جرى التثبيت بلا اتصال. */
var CORE_PAGES    = ['/index.html', '/patients.html', '/patient-profile.html', '/appointments.html'];

/* مضيفو الخطوط المسموح كاشهم (حصراً) */
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/* منع صريح — لا يُعترَض ولا يُكاش أبداً (ضمانة فوق فحص نفس-الأصل) */
var DENY_HOST_SUBSTR = ['supabase.co', 'supabase.in', 'sentry'];

var MAX_PAGES = 40, MAX_ASSETS = 80, MAX_FONTS = 30;

/* ── install: precache صغير (offline.html + الأيقونة + manifest)
      + تسخين مكتبات vendor الحرجة بكاش ASSETS (أوفلاين من أول زيارة) ─────── */
self.addEventListener('install', function (event) {
  event.waitUntil((function () {
    var p = Promise.resolve();
    if (!KILL_SWITCH) {
      p = caches.open(PRECACHE).then(function (cache) {
        return Promise.all(PRECACHE_URLS.map(function (u) {
          var req;
          try { req = new Request(u, { cache: 'reload' }); } catch (e) { req = u; }
          return fetch(req).then(function (res) {
            if (res && res.ok) return cache.put(u, res);
          }).catch(function () { /* غير قاتل — التحديث القادم يعيد المحاولة */ });
        }));
      }).then(function () {
        return caches.open(ASSETS).then(function (cache) {
          return Promise.all(VENDOR_WARM.map(function (u) {
            var req;
            try { req = new Request(u, { cache: 'reload' }); } catch (e) { req = u; }
            return fetch(req).then(function (res) {
              if (res && res.ok) return cache.put(u, res);
            }).catch(function () { /* غير قاتل — SWR يكاشه بأول جلب أونلاين */ });
          }));
        });
      }).then(function () {
        /* جوهر العيادة: جلب متسلسل (حفاظاً على نت سوريا)؛ 308 يُتّبع والنهائي
           يُكاش بمفتاح URL النهائي — الفشل صامت وREFRESH_PAGES يستأنف */
        return warmPagesInto(CORE_PAGES);
      });
    }
    return p.then(function () { return self.skipWaiting(); });
  })());
});

/* ── activate: ترحيل كاش الإصدار السابق ثم تنظيفه + مفتاح الإيقاف ────────
   1) ASSETS/FONTS: نسخ مباشر (المفتاح = URL دقيق ⇒ لا يُخدَم محتوى خاطئ أبداً؛
      مدخلات بوسوم قديمة ميتة تُشذَّب بسقف trimCache تلقائياً).
   2) PAGES: تُجمَع عناوينها فقط ثم تُحذف الأجسام القديمة — HTML قديم قد يشير
      لأصول لم تعد موجودة (درس jsDelivr) — ويُعاد جلبها طازجةً بعد claim،
      وتُحفَظ القائمة بـ/__page_set (PRECACHE) كي يستأنفها REFRESH_PAGES
      لو جرى الترحيل بلا اتصال. الكل غير قاتل. */
var PAGE_SET_KEY = '/__page_set';

self.addEventListener('activate', function (event) {
  event.waitUntil((function () {
    var pageUrls = [];
    var migrate = Promise.resolve();
    if (!KILL_SWITCH) {
      migrate = caches.keys().then(function (names) {
        var oldAssets = [], oldFonts = [], oldPages = [];
        names.forEach(function (n) {
          if (n.indexOf('sydent-') !== 0 || CURRENT.indexOf(n) !== -1) return;
          if (n.indexOf('sydent-assets-') === 0) oldAssets.push(n);
          else if (n.indexOf('sydent-fonts-') === 0) oldFonts.push(n);
          else if (n.indexOf('sydent-pages-') === 0) oldPages.push(n);
        });
        return copyCacheEntries(oldAssets, ASSETS, MAX_ASSETS)
          .then(function () { return copyCacheEntries(oldFonts, FONTS, MAX_FONTS); })
          .then(function () { return collectPageUrls(oldPages); })
          .then(function (urls) {
            pageUrls = urls;
            return savePageSet(urls);
          });
      }).catch(function () {});
    }
    return migrate.then(function () {
      return caches.keys().then(function (names) {
        return Promise.all(names.map(function (n) {
          if (n.indexOf('sydent-') !== 0) return Promise.resolve(false);
          if (KILL_SWITCH || CURRENT.indexOf(n) === -1) return caches.delete(n);
          return Promise.resolve(false);
        }));
      });
    }).then(function () {
      if (KILL_SWITCH && self.registration && self.registration.unregister) {
        return self.registration.unregister().catch(function () {});
      }
    }).then(function () { return self.clients.claim(); })
      .then(function () {
        /* بعد claim كي لا يتأخر تولّي التحكم؛ waitUntil يُبقي العامل حياً */
        if (KILL_SWITCH || !pageUrls.length) return;
        return warmPagesInto(pageUrls);
      }).catch(function () {});
  })());
});

/* ── أدوات مساعدة ───────────────────────────────────────────────────────── */
/* نسخ مدخلات كاش قديم إلى الحالي — تسلسلي، يتخطى الموجود، غير قاتل */
function copyCacheEntries(fromNames, toName, max) {
  var chain = Promise.resolve();
  (fromNames || []).forEach(function (fn) {
    chain = chain.then(function () {
      return caches.open(fn).then(function (fc) {
        return fc.keys().then(function (reqs) {
          return caches.open(toName).then(function (tc) {
            var p = Promise.resolve();
            (reqs || []).forEach(function (r) {
              p = p.then(function () {
                return tc.match(r).then(function (hit) {
                  if (hit) return;                      /* الحالي أحدث — لا تدُس */
                  return fc.match(r).then(function (res) {
                    if (res) return tc.put(r, res);
                  });
                });
              }).catch(function () {});
            });
            return p.then(function () { return trimCache(tc, max); });
          });
        });
      }).catch(function () {});
    });
  });
  return chain;
}

/* جمع عناوين الصفحات من كاشات pages القديمة (آخر MAX_REWARM = الأحدث إدخالاً) */
var MAX_REWARM = 15; /* نفس سقف REFRESH_PAGES — حفاظاً على نت سوريا */
function collectPageUrls(fromNames) {
  var urls = [], seen = {};
  var chain = Promise.resolve();
  (fromNames || []).forEach(function (fn) {
    chain = chain.then(function () {
      return caches.open(fn).then(function (fc) {
        return fc.keys().then(function (reqs) {
          (reqs || []).forEach(function (r) {
            var u = r && r.url;
            if (u && !seen[u] && u.indexOf(PAGE_SET_KEY) === -1) { seen[u] = 1; urls.push(u); }
          });
        });
      }).catch(function () {});
    });
  });
  return chain.then(function () { return urls.slice(-MAX_REWARM); });
}

function savePageSet(urls) {
  return caches.open(PRECACHE).then(function (pc) {
    return pc.put(PAGE_SET_KEY, new Response(JSON.stringify(urls || [])));
  }).catch(function () {});
}

function readPageSet() {
  return caches.open(PRECACHE).then(function (pc) {
    return pc.match(PAGE_SET_KEY).then(function (m) {
      return m ? m.json().catch(function () { return []; }) : [];
    });
  }).catch(function () { return []; });
}

/* غسل علم redirected: Chrome يرفض تقديم استجابة مكاشة redirected=true لتنقّل
   (خطأ أمني) — نعيد بناءها جسداً ورؤوساً فيولد النسخ بعلم نظيف */
function putPageSafe(finalUrl, res) {
  var p;
  if (res.redirected) {
    p = res.blob().then(function (b) {
      return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers });
    });
  } else { p = Promise.resolve(res); }
  return p.then(function (r) {
    return putSafe(PAGES, navKey(finalUrl), r, MAX_PAGES);
  }).catch(function () {});
}

/* تسخين/إعادة جلب صفحات طازجة — تسلسلي، يتّبع 308، الفشل صامت */
function warmPagesInto(urls) {
  var chain = Promise.resolve();
  (urls || []).slice(0, MAX_REWARM).forEach(function (u) {
    chain = chain.then(function () {
      var r;
      try { r = new Request(u, { cache: 'no-cache' }); } catch (e) { r = u; }
      return fetch(r).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          return putPageSafe(res.url || u, res);
        }
      }).catch(function () { /* صفحة فشلت — REFRESH_PAGES يستأنف لاحقاً */ });
    });
  });
  return chain;
}

function trimCache(cache, max) {
  return cache.keys().then(function (keys) {
    if (keys.length <= max) return;
    var extra = keys.slice(0, keys.length - max); /* FIFO تقريبي */
    return Promise.all(extra.map(function (k) { return cache.delete(k); }));
  }).catch(function () {});
}

function putSafe(cacheName, key, response, max) {
  return caches.open(cacheName).then(function (cache) {
    return cache.put(key, response).then(function () {
      return trimCache(cache, max);
    });
  }).catch(function () {});
}

function isNavigation(req) {
  if (req.mode === 'navigate') return true;
  if (req.destination === 'document') return true;
  var accept = req.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1 && req.destination === '';
}

/* مفتاح كاش الصفحات = origin + pathname (بلا query):
   patient-profile.html?id=A و ?id=B هيكلهما HTML واحد — نسخة واحدة تكفي. */
function navKey(href) {
  try {
    var u = new URL(href, self.location.origin);
    return u.origin + u.pathname;
  } catch (e) { return href; }
}

/* بحث offline يجرّب المسار كما طُلب + مكافئه النظيف/الكامل (pretty URLs) */
function navLookup(url) {
  return caches.open(PAGES).then(function (cache) {
    var path = url.pathname;
    var variants = [path];
    if (path.slice(-5) === '.html') variants.push(path.slice(0, -5));
    else if (path !== '/') variants.push(path + '.html');
    if (path === '/') { variants.push('/index'); variants.push('/index.html'); }
    if (path === '/index' || path === '/index.html') variants.push('/');
    var i = 0;
    function tryNext() {
      if (i >= variants.length) return null;
      var key = self.location.origin + variants[i++];
      return cache.match(key).then(function (hit) { return hit || tryNext(); });
    }
    return tryNext();
  });
}

/* مهلة إنقاذ التنقّل: نظير NET_RESCUE_MS بطبقة القراءة، لنفس الحالة —
   اتصالٌ قائم وإنترنت ميت فيعلَق التنقّل فوق نسخةِ صفحةٍ حاضرة بالكاش
   (مقيسٌ حيّاً: تجاوز ثماني ثوانٍ). الطلب لا يُقطع: يكمل ويحدّث الكاش. */
var NAV_RESCUE_MS = 6000;

/* ── التنقّلات: network-first ثم كاش ثم offline.html ────────────────────── */
function handleNavigation(event, url) {
  var req = event.request;
  var navDone = false;
  var netBranch = fetch(req).then(function (net) {
    navDone = true;
    /* ok+basic تُكاش بمفتاح URL «النهائي» حتى بعد اتّباع 308 الـpretty URL —
       روابط البطاقات بصيغة .html وكانت لا تُكاش أبداً بسبب استبعاد redirected.
       opaqueredirect وغير-basic يبقيان مستبعدَين (تمريرة بلا كاش). */
    if (net && net.ok && net.type === 'basic') {
      /* بعد فوز الإنقاذ يكون الحدث قد سُوِّي فيرمي waitUntil — الكاش يُكتب
         على أي حال والرمية تُبتلع كي لا تُسقط الاستجابة المخدومة سلفاً. */
      var putP = putPageSafe(net.url || req.url, net.clone());
      try { event.waitUntil(putP); } catch (e) {}
    }
    return net;
  }).catch(function () {
    navDone = true;
    return navLookup(url).then(function (hit) {
      if (hit) return hit;
      return caches.match(OFFLINE_URL).then(function (off) {
        return off || new Response(
          '\u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062A\u0635\u0627\u0644',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    });
  });
  /* الإنقاذ: نسخةٌ مكاشة تُخدَم بعد المهلة، وبلا نسخة يبقى الفرع معلَّقاً
     أبداً فلا يفوز بالسباق ⇒ السلوك السابق محفوظ حرفياً (سيناريوا 5 و6). */
  var rescueBranch = new Promise(function (r) { setTimeout(r, NAV_RESCUE_MS); })
    .then(function () {
      if (navDone) return new Promise(function () {});
      return navLookup(url).then(function (hit) {
        if (!hit || navDone) return new Promise(function () {});
        return hit;
      });
    });
  return Promise.race([netBranch, rescueBranch]);
}

/* ── ارتداد الأصل بأي توكن (أوفلاين حصراً) ──────────────────────────────
   كسرُ الكاش يدوّر التوكن على **كل** الأصول المشتركة ولو لم يتغيّر محتواها،
   فبعد كل نشرةٍ تحمل أصلاً مشتركاً واحداً متغيّراً تصير كلُّ عناوين الأصول
   جديدة. وعميلٌ نزل عنده الـHTML الجديد ثم انقطع قبل أن يفتح صفحةً أونلاين
   كان يأخذ 504 فارغاً لكل أصلٍ صفحيّ — **وهو يحمل نفس الملف بالتوكن القديم
   بكاشه ولا يستعمله**: صفحةٌ بلا CSS ولا محرّك عرض (بلاغ حيّ بصورة).
   القاعدة: أوفلاين + غياب التوكن المطلوب ⇒ اخدم أحدث نسخةٍ لنفس المسار
   أياً كان توكنها. و**لا تُكتب أبداً تحت المفتاح الجديد** — درس v131 حرفياً:
   جسمٌ قديم يُخلَّد تحت توكنٍ جديد يتوارثه الترحيل؛ فالخدمة بلا تخزين تعني
   أن أول جلبٍ أونلاين يعيد النسخة الصحيحة ويكاشها بمفتاحها الصحيح. */
function assetPathKey(u) {
  try { var x = new URL(u, self.location.origin); return x.origin + x.pathname; }
  catch (e) { return String(u).split('?')[0]; }
}
function anyTokenAsset(url) {
  var want = assetPathKey(url);
  return caches.open(ASSETS).then(function (cache) {
    return cache.keys().then(function (keys) {
      var hit = null;
      for (var i = 0; i < keys.length; i++) {
        if (assetPathKey(keys[i].url) === want) hit = keys[i];   /* الأحدث إدراجاً */
      }
      return hit ? cache.match(hit) : null;
    });
  }).catch(function () { return null; });
}

/* ── الأصول الموسومة ?v= : cache-first ──────────────────────────────────── */
function handleVersionedAsset(event) {
  var req = event.request;
  /* درس v131 (تسمم سباق النشر — اكتُشف بزر واتساب شرح الخطة): cache-first
     بلا إعادة تحقق كان يخلّد أولَ جواب للأبد، فإذا وصل الـHTML الجديد من
     edge محدَّث وطلبُ الأصل ضرب edge لم يكتمل توزيعه، انحبس جسمٌ قديم تحت
     التوكن الجديد وتوارثته الترقيات عبر ترحيل activate. صار المسار SWR:
     المكاش يُخدم فوراً (نفس الأداء) والشبكة تصحّح بالخلفية فيشفى التسمم
     ذاتياً بالتحميل التالي — وأوفلاين يبقى السلوك كما كان (فشل الشبكة
     صامت والمكاش سيّد). */
  return caches.match(req).then(function (cached) {
    var refresh = fetch(req).then(function (net) {
      if (net && net.ok && net.type === 'basic' && !net.redirected) {
        return putSafe(ASSETS, req.url, net.clone(), MAX_ASSETS).then(function () { return net; });
      }
      return net;
    }).catch(function () { return null; });
    if (cached) { event.waitUntil(refresh); return cached; }
    return refresh.then(function (net) {
      if (net) return net;
      /* الشبكة فشلت والتوكن المطلوب غائب ⇒ نسخة نفس المسار بأي توكن، وإلا 504 */
      return anyTokenAsset(req.url).then(function (old) {
        return old || new Response('', { status: 504, statusText: 'offline & uncached' });
      });
    });
  });
}

/* ── stale-while-revalidate (خطوط + أصول ثابتة بلا ?v=) ─────────────────── */
function handleSWR(event, cacheName, max, allowOpaque) {
  var req = event.request;
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var refresh = fetch(req).then(function (net) {
        var basicOk = net && net.ok && net.type === 'basic' && !net.redirected;
        /* ملفات الخطوط تُطلب من CSS بنمط CORS ⇒ النوع 'cors' لا basic ولا
           opaque — كان يُستبعد فلا تُكاش الخطوط أبداً (باغ منذ نشأة الميزة) */
        var corsOk = net && net.ok && net.type === 'cors' && !net.redirected;
        var opaqueOk = allowOpaque && net && net.type === 'opaque';
        if (basicOk || corsOk || opaqueOk) {
          return putSafe(cacheName, req.url, net.clone(), max).then(function () { return net; });
        }
        return net;
      }).catch(function () { return null; });
      if (cached) { event.waitUntil(refresh); return cached; }
      return refresh.then(function (net) {
        if (net) return net;
        /* caches.match شامل يلتقط ما بـPRECACHE (manifest مثلاً) قبل الاستسلام؛
           504 صناعي بدل throw — نفس دلالة الفشل للصفحة بلا ضجيج Uncaught */
        return caches.match(req).then(function (any) {
          return any || new Response('', { status: 504, statusText: 'offline & uncached' });
        });
      });
    });
  });
}

/* ── الموجّه ─────────────────────────────────────────────────────────────── */
self.addEventListener('fetch', function (event) {
  if (KILL_SWITCH) return;                       /* تمرير كامل للشبكة */
  var req = event.request;
  if (req.method !== 'GET') return;              /* كل الكتابات تمر — أبداً لا تُعترض */

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (req.headers.has('range')) return;

  var host = url.hostname;
  for (var i = 0; i < DENY_HOST_SUBSTR.length; i++) {
    if (host.indexOf(DENY_HOST_SUBSTR[i]) !== -1) return;   /* Supabase/Sentry: لا لمس */
  }

  var sameOrigin = (url.origin === self.location.origin);

  if (!sameOrigin) {
    if (FONT_HOSTS.indexOf(host) !== -1) {
      event.respondWith(handleSWR(event, FONTS, MAX_FONTS, true));
    }
    return; /* cross-origin غير الخطوط: شبكة مباشرة — لم يعد ثمة أصل خارجي حرج
               (المكتبات مستضافة ذاتياً بـ vendor/ منذ v19) */
  }

  if (url.pathname === '/sw.js') return;

  if (isNavigation(req)) {
    event.respondWith(handleNavigation(event, url));
    return;
  }

  if (url.searchParams.has('v')) {
    event.respondWith(handleVersionedAsset(event));
    return;
  }

  var d = req.destination;
  if (d === 'style' || d === 'script' || d === 'image' || d === 'font' || d === 'manifest') {
    event.respondWith(handleSWR(event, ASSETS, MAX_ASSETS, false));
  }
  /* ما تبقى من GET نفس-الأصل: يمر للشبكة بلا لمس */
});

/* ── Phase 3: تحديث خلفي للصفحات المكاشة (يقلّص «النافذة الانتقالية») ──────
   theme.js يرسل {type:'REFRESH_PAGES'} بعد التحميل بهدوء وهو أونلاين؛
   الـSW يعيد جلب مفاتيح كاش الصفحات تسلسلياً (سقف 15) ويحدّثها —
   مخنوق بعلامة زمنية (مرة كل 6 ساعات كحد أقصى) حفاظاً على نت سوريا. */
self.addEventListener('message', function (event) {
  var d = event.data;
  if (!d || d.type !== 'REFRESH_PAGES' || KILL_SWITCH) return;
  event.waitUntil((function () {
    var MARK = '/__pages_refresh_ts';
    return caches.open(PRECACHE).then(function (pc) {
      return pc.match(MARK).then(function (m) {
        return m ? m.text().then(function (t) { return parseInt(t, 10) || 0; })
                     .catch(function () { return 0; })
                 : 0;
      }).then(function (ts) {
        if (Date.now() - ts < 6 * 3600 * 1000) return; /* خانق 6 ساعات */
        return caches.open(PAGES).then(function (pages) {
          return pages.keys().then(function (keys) {
            /* المصدر = مفاتيح الكاش الحالية ∪ /__page_set (يغطي حالة ترحيل
               جرى بلا اتصال فبقي كاش الصفحات فارغاً والقائمة محفوظة) */
            return readPageSet().then(function (saved) {
              /* CORE أولاً كي تنجو من سقف الـ15 دائماً، ثم الحالية ثم المحفوظة */
              var urls = [], seen = {};
              function add(u) { if (u && !seen[u]) { seen[u] = 1; urls.push(u); } }
              CORE_PAGES.forEach(add);
              (keys || []).forEach(function (req) { add(req && req.url); });
              (saved || []).forEach(add);
              return warmPagesInto(urls);
            });
          });
        }).then(function () {
          return pc.put(MARK, new Response(String(Date.now())));
        });
      });
    }).catch(function () {});
  })());
});

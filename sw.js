/* ═══════════════════════════════════════════════════════════════════════════
   SyDent — sw.js · Service Worker (PWA — Phase 0: app-shell فقط)
   ─────────────────────────────────────────────────────────────────────────────
   الوظيفة: يجعل «هيكل التطبيق» يفتح بلا إنترنت. لا يكاش أي بيانات إطلاقاً.
   (الاستثناء الوحيد لمسّ البيانات: رفع مواعيد جديدة سُجّلت بلا اتصال عند sync والتطبيق
    مغلق — انظر «مزامنة بالخلفية» أسفل الملف؛ لا قراءة ولا كاش ولا أي رمز مالي.)

   الاستراتيجيات (قرارات أمان مقصودة — لا تغيّرها بلا مراجعة):
   • تنقّلات HTML  → صفحةٌ لها نسخة بالكاش تُفتح منها فوراً وتُحدَّث بالخلفية
     (والتبويب يعيد التحميل وحده إن وصل نشرٌ أحدث — انظر handleNavigation)؛
     بلا نسخة: network-first، و offline تُخدَم نسخة آخر زيارة وإلا offline.html.
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

var SW_VERSION  = 'v819';   /* v257: سجلّ الإصدارات انتقل إلى CHANGELOG.md (كان 430KB بهذا السطر). كل رفع نسخة يُسجَّل هناك — لا هنا. */
var KILL_SWITCH = false;

var PRECACHE = 'sydent-precache-' + SW_VERSION;
var PAGES    = 'sydent-pages-'    + SW_VERSION;
var ASSETS   = 'sydent-assets-'   + SW_VERSION;
var FONTS    = 'sydent-fonts-'    + SW_VERSION;
var CURRENT  = [PRECACHE, PAGES, ASSETS, FONTS];

var OFFLINE_URL   = '/offline.html';
var PRECACHE_URLS = [OFFLINE_URL, '/favicon.svg?v=5', '/manifest.json'];
/* مكتبات vendor الحرجة: تُسخَّن بكاش ASSETS عند install (لا PRECACHE — مسار
   الجلب handleSWR يطابق داخل ASSETS حصراً، فوضعها بـPRECACHE لن يخدمها أبداً).
   اسم الملف مُرقَّم بالنسخة ⇒ محتواه لا يتغير ⇒ SWR آمن تماماً. */
var VENDOR_WARM   = ['/vendor/supabase-2.110.8.min.js'];
/* v493: خطّ الواجهة المستضاف ذاتياً — يُسخَّن مع vendor كي يعمل بلا اتصال من أول زيارة.
   الأسماء ثابتة (عائلة-مجموعة-وزن) ⇒ المحتوى لا يتغيّر ⇒ SWR آمن. */
['arabic', 'latin'].forEach(function (sub) {
  ['400', '500', '600', '700'].forEach(function (w) {
    VENDOR_WARM.push('/fonts/noto-kufi-arabic-' + sub + '-' + w + '-normal.woff2');
  });
});
/* صفحات جوهر العيادة: تُسخَّن حتمياً عند install (قشور بلا PHI — البيانات
   تُحقن client-side من IndexedDB) كي لا تعتمد تغطية الأوفلاين على حظ الزيارات.
   تدخل أيضاً مصدر REFRESH_PAGES فتُشفى ذاتياً لو جرى التثبيت بلا اتصال. */
var CORE_PAGES    = ['/index.html', '/patients.html', '/patient-profile.html', '/appointments.html'];

/* صفحات المنصة كلها (ما يستعمله حساب عيادة): تُحمَّل هي وأصولها مرةً واحدة بالخلفية بعد
   التثبيت كي تعمل كل صفحة بلا اتصال من اليوم الأول — لا فقط ما سبق فتحه. الجلب «للناقص
   حصراً» (صفحة غائبة · أصلٌ مسارُه غائب بأي توكن) فلا يتكرر مع النشرات. مثبت الصفحات يحمرّ
   إن وُجد ملف صفحة ليس هنا ولا بقائمة الاستثناء المعلنة عنده. */
var ALL_PAGES = CORE_PAGES.concat([
  '/accounting.html', '/expenses.html', '/payouts.html', '/inventory.html', '/labs.html',
  '/treatments.html', '/doctors.html', '/employees.html', '/provider-reports.html',
  '/radiology.html', '/settings.html', '/subscription.html', '/audit-log.html', '/learn.html',
  '/auth.html', '/pending.html', '/reset-password.html'
]);
/* أصول تُحمَّل من الكود لا من وسوم الصفحات (تُخدَم أوفلاين بمطابقة المسار) */
var EXTRA_ASSETS = ['/tour.js', '/guides.js'];

/* مضيفو الخطوط المسموح كاشهم (حصراً) */
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/* منع صريح — لا يُعترَض ولا يُكاش أبداً (ضمانة فوق فحص نفس-الأصل) */
var DENY_HOST_SUBSTR = ['supabase.co', 'supabase.in', 'sentry'];

/* سقف كاش الأصول: كان 80 والمنصة تخدم أكثر من 90 ملفاً (JS/CSS/خطوط/صور)، وبعد كل
   نشرة يحمل الكاش نسختَي التوكن القديم والجديد معاً — فعيادةٌ تستعمل كل الصفحات
   كانت تفقد أصول صفحاتها الأقدم زيارةً فلا تفتح بلا اتصال. السقف الآن يسع الأسطول
   مرتين وزيادة، ومثبت الأوفلاين يحمرّ إن اقترب عدد الأصول منه. */
var MAX_PAGES = 80, MAX_ASSETS = 240, MAX_FONTS = 30;   /* الصفحة تُكاش بمسارَيها (.html والنظيف) */

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
          /* الصفحات تُنسخ بأجسامها ثم يُجدَّد الأحدث منها بعد claim (كما كان). كانت تُحذف
             كلها ويُعاد جلب 15 فقط — فما زاد يضيع مع كل نشرة، وترحيلٌ بلا اتصال يترك
             الجهاز بلا أي صفحة. الجسم القديم آمن الآن: أصوله مستضافة ذاتياً ومنسوخة معه،
             وأي فتحٍ له أونلاين يحدّثه فوراً بالخلفية (handleNavigation). */
          .then(function () { return copyCacheEntries(oldPages, PAGES, MAX_PAGES); })
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
        if (KILL_SWITCH) return;
        return (pageUrls.length ? warmPagesInto(pageUrls) : Promise.resolve())
          .then(function () { return fillMissing(); });
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
          var finalKey = navKey(res.url || u), askedKey = navKey(u);
          return putPageSafe(res.url || u, res).then(function () {
            /* مضيفٌ يحوّل .html للمسار النظيف: النسخة تُحفَظ بالمفتاح النهائي، فالمفتاح
               المطلوب (إن اختلف) يحمل جسماً أقدم — يُحذف كي لا يُخدَم قبل الطازج */
            if (finalKey === askedKey) return;
            return caches.open(PAGES).then(function (c) { return c.delete(askedKey); }).catch(function () {});
          });
        }
      }).catch(function () { /* صفحة فشلت — REFRESH_PAGES يستأنف لاحقاً */ });
    });
  });
  return chain;
}

/* ── إكمال الناقص: كل صفحات المنصة وأصولها، مرة واحدة ──────────────────────
   تسلسلي بفاصل (حفاظاً على نت سوريا) · يُتخطّى على «توفير البيانات» وشبكة 2G ·
   يتوقف عند ثلاث إخفاقات متتالية (انقطاع) ويُستأنف مع REFRESH_PAGES التالي.
   الأصل الموسوم يُجلب بعنوانه الحرفي من الصفحة؛ ما سبق كاشه بأي توكن لا يُعاد جلبه. */
var FILL_GAP_MS = 120;
function fillAllowed() {
  try {
    var c = self.navigator && self.navigator.connection;
    if (c && (c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g')) return false;
  } catch (e) {}
  return true;
}
function assetRefs(html) {
  var out = [], seen = {}, m;
  var re = /(?:src|href)=["']([^"'#<>]+?\.(?:js|css|webp|png|svg|woff2)(?:\?[^"'<>]*)?)["']/g;
  while ((m = re.exec(html))) {
    try {
      var u = new URL(m[1].replace(/&amp;/g, '&'), self.location.origin + '/');
      if (u.origin !== self.location.origin || u.pathname === '/sw.js') continue;
      if (!seen[u.href]) { seen[u.href] = 1; out.push(u.href); }
    } catch (e) {}
  }
  return out;
}
function fillMissing() {
  if (KILL_SWITCH || !fillAllowed()) return Promise.resolve(0);
  var fetchedN = 0, failRun = 0;
  var gap = function () { return new Promise(function (r) { setTimeout(r, FILL_GAP_MS); }); };
  var stop = function () { return failRun >= 3; };
  return Promise.all([caches.open(PAGES), caches.open(ASSETS)]).then(function (cc) {
    var pages = cc[0], assets = cc[1], htmls = [];
    var chain = Promise.resolve();
    /* 1) الصفحات الغائبة */
    ALL_PAGES.forEach(function (pth) {
      chain = chain.then(function () {
        if (stop()) return;
        return navLookup(new URL(pth, self.location.origin)).then(function (hit) {
          if (hit) return hit.text().then(function (t) { htmls.push(t); });
          var r; try { r = new Request(pth, { cache: 'no-cache' }); } catch (e) { r = pth; }
          return fetch(r).then(function (res) {
            if (!(res && res.ok && res.type === 'basic')) { failRun++; return; }
            failRun = 0; fetchedN++;
            return res.clone().text().then(function (t) {
              htmls.push(t);
              return putPageSafe(res.url || pth, res);
            });
          }, function () { failRun++; }).then(gap);
        });
      }).catch(function () {});
    });
    /* 2) أصولها الغائبة مساراً */
    return chain.then(function () { return assets.keys(); }).then(function (keys) {
      var have = {};
      (keys || []).forEach(function (k) { have[assetPathKey(k.url)] = 1; });
      var want = [], seenW = {};
      htmls.forEach(function (h) { assetRefs(h).forEach(function (u) { if (!seenW[u]) { seenW[u] = 1; want.push(u); } }); });
      EXTRA_ASSETS.forEach(function (pth) { want.push(self.location.origin + pth); });
      var c2 = Promise.resolve();
      want.forEach(function (u) {
        c2 = c2.then(function () {
          if (stop() || have[assetPathKey(u)]) return;
          have[assetPathKey(u)] = 1;
          var r; try { r = new Request(u); } catch (e) { r = u; }
          return fetch(r).then(function (res) {
            if (!(res && res.ok && res.type === 'basic' && !res.redirected)) { failRun++; return; }
            failRun = 0; fetchedN++;
            return assets.put(u, res);
          }, function () { failRun++; }).then(gap);
        }).catch(function () {});
      });
      return c2.then(function () { return trimCache(assets, MAX_ASSETS); });
    });
  }).then(function () { return fetchedN; }).catch(function () { return fetchedN; });
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
  return navFind(url).then(function (f) { return f ? f.res : null; });
}
function navFind(url) {
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
      return cache.match(key).then(function (hit) { return hit ? { key: key, res: hit } : tryNext(); });
    }
    return tryNext();
  });
}

/* مهلة إنقاذ التنقّل: نظير NET_RESCUE_MS بطبقة القراءة، لنفس الحالة —
   اتصالٌ قائم وإنترنت ميت فيعلَق التنقّل فوق نسخةِ صفحةٍ حاضرة بالكاش
   (مقيسٌ حيّاً: تجاوز ثماني ثوانٍ). الطلب لا يُقطع: يكمل ويحدّث الكاش. */
var NAV_RESCUE_MS = 6000;

/* ── التنقّلات: فتحٌ فوري من الكاش + تحديثٌ بالخلفية ──────────────────────
   كانت network-first: كل فتح صفحة ينتظر الـHTML من الشبكة ولو كانت نسخته حاضرة —
   على نت بطيء ثوانٍ لكل تنقّل، وعلى «اتصال قائم وإنترنت ميت» ست ثوانٍ (مهلة الإنقاذ).
   الآن: صفحةٌ لها نسخة بالكاش تُخدَم فوراً، ونسخة الشبكة تُجلب بالخلفية وتُكتب
   مكانها. وإن اختلفت عن المعروضة (نشرٌ جديد) يُبلَّغ التبويب PAGE_UPDATED فيعيد
   التحميل وحده ما دام المستخدم لم يلمس الصفحة بعد، وإلا تنبيه — فلا «كود قديم
   عالق»: أقصى تأخّر عن النشر فتحةٌ واحدة تُصحَّح خلال ثوانٍ.
   بلا نسخة بالكاش = السلوك السابق حرفياً (شبكة أولاً ثم offline.html).
   الصفحات العامة التي يفتحها المريض (حجز · استمارة · بوابة) تبقى شبكة-أولاً. */
var NAV_NETWORK_FIRST = ['/book', '/intake', '/portal'];
function isNetworkFirstPath(path) {
  var p = path.slice(-5) === '.html' ? path.slice(0, -5) : path;
  return NAV_NETWORK_FIRST.indexOf(p) !== -1;
}
function samePage(a, b) {
  var strip = function (p) { p = p.slice(-5) === '.html' ? p.slice(0, -5) : p; return (p === '/index' || p === '') ? '/' : p; };
  try { return strip(new URL(a, self.location.origin).pathname) === strip(new URL(b, self.location.origin).pathname); }
  catch (e) { return false; }
}
/* التبويب الناتج عن التنقّل قد لا يكون «جاهزاً» لحظةَ انتهاء المقارنة (الشبكة أسرع من
   تحميل الصفحة) فلا يظهر بـclients بعد — نعيد المحاولة حتى ~6ث. المعرّف resultingClientId
   يحدّد التبويب بعينه؛ وبغيابه (متصفح قديم) يُطابَق بالمسار. الرسالة تُصَفّ عند المتصفح حتى
   يكتمل تحميل الصفحة، فلا تضيع. */
function notifyPageUpdated(url, clientId, tries) {
  try {
    var cl = self.clients;
    if (!cl) return Promise.resolve();
    var msg = { type: 'PAGE_UPDATED', path: url.pathname };
    var find = (clientId && typeof cl.get === 'function')
      ? Promise.resolve(cl.get(clientId)).then(function (c) { return c ? [c] : []; })
      : (typeof cl.matchAll === 'function'
          ? cl.matchAll({ type: 'window' }).then(function (list) {
              return (list || []).filter(function (c) { return samePage(c.url, url.href); });
            })
          : Promise.resolve([]));
    return find.then(function (targets) {
      if (targets.length) {
        targets.forEach(function (c) { try { c.postMessage(msg); } catch (e) {} });
        return;
      }
      if ((tries || 0) >= 12) return;
      return new Promise(function (r) { setTimeout(r, 500); })
        .then(function () { return notifyPageUpdated(url, clientId, (tries || 0) + 1); });
    }).catch(function () {});
  } catch (e) { return Promise.resolve(); }
}
function revalidatePage(url, shown, clientId, servedKey) {
  var r;
  try { r = new Request(url.href, { cache: 'no-cache' }); } catch (e) { r = url.href; }
  return fetch(r).then(function (net) {
    if (!(net && net.ok && net.type === 'basic')) return;
    return Promise.all([net.clone().text(), shown.text()]).then(function (t) {
      /* النسخة الطازجة تُكتب بالمفتاح النهائي، وبالمفتاح الذي خُدمت منه الصفحة إن
         اختلف (مضيفٌ يحوّل .html للمسار النظيف) — وإلا بقي المخدوم قديماً للأبد */
      var copy = (servedKey && servedKey !== navKey(net.url || url.href))
        ? putSafe(PAGES, servedKey, new Response(t[0], { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }), MAX_PAGES)
        : Promise.resolve();
      return copy.then(function () { return putPageSafe(net.url || url.href, net); }).then(function () {
        if (t[0] !== t[1]) return notifyPageUpdated(url, clientId, 0);
      });
    });
  }).catch(function () { /* بلا شبكة: المعروض هو أحدث ما لدينا */ });
}
function handleNavigation(event, url) {
  if (isNetworkFirstPath(url.pathname)) return handleNavigationNetworkFirst(event, url);
  return navFind(url).then(function (f) {
    if (!f) return handleNavigationNetworkFirst(event, url);
    var p = revalidatePage(url, f.res.clone(), event.resultingClientId || '', f.key);
    try { event.waitUntil(p); } catch (e) {}
    return f.res;
  }).catch(function () { return handleNavigationNetworkFirst(event, url); });
}

/* ── تنقّل بلا نسخة بالكاش (وصفحات المريض): network-first ثم كاش ثم offline.html ── */
function handleNavigationNetworkFirst(event, url) {
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

/* ── v803: بيانُ الأصول — ملفٌ لم يتغيّر محتواه لا يُنزَّل من جديد بعد كل نشرة ─────
   كسرُ الكاش يدوّر التوكن على **كل** الأصول المشتركة، فبعد كل نشرةٍ كان الجهازُ ينزّل كلَّ ملفات الصفحة من جديد
   (~1MB مضغوطة لبطاقة المريض) وهو يحمل معظمَها حرفياً بالتوكن السابق. البناءُ ينشر /asset-manifest.json
   (scripts/hash-dist.js): توكنُ هذه النشرة و sha256 لكل ملف. به يُثبَت أن نسخةً بالكاش هي محتوى التوكن المطلوب
   حرفياً:
     • التوكنُ المطلوب غائب ونسخةُ المسار نفسِه بتوكنٍ أقدم تطابق البيان ⇒ تُخدَم وتُحفَظ تحت المفتاح الجديد بلا شبكة.
       (درسُ v131 قائم: لا يُكتب تحت مفتاحٍ جديد إلا جسمٌ **ثبتت** مطابقتُه — لا تخمينَ بالمسار ولا بالتوكن.)
     • التوكنُ المطلوب موجود ويطابق البيان ⇒ لا تصحيحَ بالخلفية من الشبكة (لا شيء يُصحَّح)؛ وإن لم يطابق (تسمّمُ
       سباق النشر) يبقى التصحيحُ كما كان فيُشفى.
   البيانُ لا يُوثَق به إلا إن حمل التوكنَ المطلوب نفسَه (بيانُ نشرةٍ أخرى لا يقول شيئاً عن هذه). بلا بيان · بلا
   crypto · ملفٌ غير مذكور · مهلةٌ انقضت ⇒ السلوكُ السابق حرفياً (الشبكة). */
var MANIFEST_URL = '/asset-manifest.json', MAN_KEY = '/__asset_manifest', MAN_WAIT_MS = 2500, MAN_RETRY_MS = 600000;
var _manMem = {}, _manFailAt = {}, _provenMem = {};
function tokenOf(u) { try { return new URL(u, self.location.origin).searchParams.get('v') || ''; } catch (e) { return ''; } }
function relPathOf(u) { try { return new URL(u, self.location.origin).pathname.replace(/^\//, ''); } catch (e) { return ''; } }
function sha256Hex(res) {
  try {
    var cr = self.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (!res || !cr || !cr.subtle || typeof res.arrayBuffer !== 'function') return Promise.resolve(null);
    return res.arrayBuffer().then(function (buf) { return cr.subtle.digest('SHA-256', buf); }).then(function (d) {
      var b = new Uint8Array(d), h = '';
      for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      return h;
    }).catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}
function manifestOk(m, tok) { return !!(m && tok && m.token === tok && m.files && typeof m.files === 'object'); }
/* بيانُ توكنٍ بعينه: الذاكرة ← الكاش (PRECACHE، بمفتاح التوكن — ثابتٌ ما ثبت التوكن) ← الشبكة مرةً واحدة */
function manifestFor(tok) {
  if (!tok || KILL_SWITCH) return Promise.resolve(null);
  if (_manMem[tok]) return _manMem[tok];
  if (_manFailAt[tok] && Date.now() - _manFailAt[tok] < MAN_RETRY_MS) return Promise.resolve(null);
  var key = MAN_KEY + '-' + tok;
  var p = caches.open(PRECACHE).then(function (pc) {
    return pc.match(key).then(function (hit) {
      return hit ? hit.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }) : null;
    }).then(function (kept) {
      if (manifestOk(kept, tok)) return kept;
      var r; try { r = new Request(MANIFEST_URL, { cache: 'no-store' }); } catch (e) { r = MANIFEST_URL; }
      return fetch(r).then(function (net) {
        if (!(net && net.ok)) return null;
        return net.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
          if (!manifestOk(j, tok)) return null;
          return pc.put(key, new Response(t, { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .then(function () { return j; }, function () { return j; });
        });
      });
    });
  }).catch(function () { return null; }).then(function (m) {
    if (!m) { _manFailAt[tok] = Date.now(); delete _manMem[tok]; }
    return m;
  });
  _manMem[tok] = p;
  return p;
}
/* هل هذا الجسمُ هو محتوى url (مساره وتوكنه) حرفياً بحسب بيان نشرته؟ */
function provenCurrent(res, url) {
  var tok = tokenOf(url);
  if (!tok || !res) return Promise.resolve(false);
  return manifestFor(tok).then(function (m) {
    var want = m && m.files[relPathOf(url)];
    if (!want || typeof want !== 'string') return false;
    return sha256Hex(res).then(function (h) { return !!h && h === want; });
  }).catch(function () { return false; });
}
/* التوكنُ المطلوب غائب: نسخةُ المسار نفسِه بتوكنٍ أقدم، إن ثبتت مطابقتُها خلال المهلة، تُحفَظ تحت المفتاح المطلوب وتُخدَم */
function reuseSamePath(url) {
  return anyTokenAsset(url).then(function (old) {
    if (!old) return null;
    var late = new Promise(function (r) { setTimeout(function () { r(false); }, MAN_WAIT_MS); });
    return Promise.race([provenCurrent(old.clone(), url), late]).then(function (ok) {
      if (!ok) return null;
      _provenMem[url] = 1;
      return putSafe(ASSETS, url, old.clone(), MAX_ASSETS).then(function () { return old; });
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
    var refresh = function () {
      return fetch(req).then(function (net) {
        if (net && net.ok && net.type === 'basic' && !net.redirected) {
          return putSafe(ASSETS, req.url, net.clone(), MAX_ASSETS).then(function () { return net; });
        }
        return net;
      }).catch(function () { return null; });
    };
    if (cached) {
      /* v803: نسخةٌ ثبت بالبيان أنها محتوى هذا التوكن حرفياً لا تُصحَّح من الشبكة؛ غيرُ المثبتة تُصحَّح كما كانت */
      var bg = _provenMem[req.url] ? Promise.resolve(null)
        : provenCurrent(cached.clone(), req.url).then(function (ok) { if (ok) { _provenMem[req.url] = 1; return null; } return refresh(); });
      try { event.waitUntil(bg); } catch (e) {}
      return cached;
    }
    /* v803: التوكنُ المطلوب غائب ⇒ نسخةُ المسار نفسِه إن ثبتت مطابقتُها، وإلا الشبكة كما كانت */
    return reuseSamePath(req.url).then(function (same) {
      if (same) return same;
      return refresh().then(function (net) {
        if (net) return net;
        /* الشبكة فشلت والتوكن المطلوب غائب ⇒ نسخة نفس المسار بأي توكن، وإلا 504 */
        return anyTokenAsset(req.url).then(function (old) {
          return old || new Response('', { status: 504, statusText: 'offline & uncached' });
        });
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
  if (url.pathname.indexOf('/downloads/') === 0) return;   /* v644: حزمُ البرامج (SyDent Bridge) — تنزيلٌ مباشر، لا كاش ولا صفحة أوفلاين */

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

/* ── مزامنة بالخلفية: رفع ما سُجّل بلا اتصال والتطبيق مغلق ────────────────────
   الصفحة تطلب sync بوسم BG_TAG حين تطابِر عملية (supabase-init.js · bgArm). عند عودة
   الاتصال يوقظنا المتصفح:
   • تبويبٌ مفتوح؟ نوكل له الرفع (DRAIN_OUTBOX) — كل قواعد التصريف هناك — وننتهي.
   • لا تبويب: نرفع بأنفسنا «أضيق مجموعة لا تحتاج قراراً»: مواعيد جديدة (POST بمعرّف
     محقون ⇒ الإعادة لا تكرّر) وسجل التدقيق. بالترتيب، ونتوقف عند أول عملية غير ذلك
     (تعديل/حذف موعد يلزمه فحص تعارض · مريض جديد يلزمه رقم ملف · أي جدول آخر) أو عند
     أول ردّ ليس نجاحاً ولا تكراراً لنفس العملية — فلا نوسم شيئاً «فاشلاً» ولا نغيّر
     حالة: ما لم نرفعه يبقى كما هو للصفحة عند فتحها.
   • التوكن: نسخة توكن الوصول التي حفظتها الصفحة (صالحة ساعة على الأكثر) — منتهية؟
     لا شيء يُرفع. لا تجديد جلسة هنا إطلاقاً.
   • نفس قفل التصريف (Web Locks) الذي تستعمله التبويبات، فلا رفع مزدوج.
   رفضُ الوعد عند فشل الشبكة يجعل المتصفح يعيد المحاولة لاحقاً بنفسه. */
var BG_TAG = 'sydent-outbox', BG_DB = 'sydent-offline', BG_LOCK = 'sydent-outbox-drain';
var BG_TABLES = { appointments: 1, audit_log: 1 };
function bgIdb() {
  return new Promise(function (resolve) {
    try {
      var req = self.indexedDB.open(BG_DB);
      req.onupgradeneeded = function () { try { req.transaction.abort(); } catch (e) {} };   /* لا ننشئ قاعدة */
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('outbox') || !db.objectStoreNames.contains('rest_cache')) { try { db.close(); } catch (e) {} return resolve(null); }
        resolve(db);
      };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
}
function bgReq(db, store, mode, fn) {
  return new Promise(function (resolve) {
    try {
      var t = db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = function () { resolve(r && r.result); };
      t.onerror = function () { resolve(null); };
      t.onabort = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
}
function bgOwnDuplicate(op, txt) {
  try {
    var j = JSON.parse(txt || 'null') || {};
    if (op.table !== 'appointments' || j.code !== '23505') return false;
    return String(j.message || '').indexOf('"appointments_pkey"') !== -1 || /^Key \(id\)=/.test(String(j.details || ''));
  } catch (e) { return false; }
}
function bgDrain() {
  if (KILL_SWITCH) return Promise.resolve(0);
  var cl = self.clients;
  var open = (cl && typeof cl.matchAll === 'function') ? cl.matchAll({ type: 'window' }).catch(function () { return []; }) : Promise.resolve([]);
  return open.then(function (list) {
    if (list && list.length) {
      list.forEach(function (c) { try { c.postMessage({ type: 'DRAIN_OUTBOX' }); } catch (e) {} });
      return 0;
    }
    var L = self.navigator && self.navigator.locks;
    if (!L || typeof L.request !== 'function') return 0;      /* بلا قفل مشترك لا نرفع من هنا */
    return L.request(BG_LOCK, { ifAvailable: true }, function (lock) { return lock ? bgUpload() : 0; });
  });
}
function bgUpload() {
  return bgIdb().then(function (db) {
    if (!db) return 0;
    var done = 0;
    var finish = function (v) { try { db.close(); } catch (e) {} return v; };
    return bgReq(db, 'outbox', 'readonly', function (os) { return os.getAll(); }).then(function (ops) {
      ops = (ops || []).slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      if (!ops.length) return 0;
      var uid = ops[0].uid;
      return bgReq(db, 'rest_cache', 'readonly', function (os) { return os.get('__bg|' + uid); }).then(function (bg) {
        if (!bg || !bg.token || !bg.apikey || !(bg.exp * 1000 - Date.now() > 30000)) return 0;
        var chain = Promise.resolve(true);
        ops.forEach(function (op) {
          chain = chain.then(function (go) {
            if (!go) return false;
            if (!op || op.uid !== uid || op.status === 'failed' || op.method !== 'POST' || !BG_TABLES[op.table]) return false;
            var h = { apikey: bg.apikey, Authorization: 'Bearer ' + bg.token, 'Content-Type': (op.headers && op.headers.ct) || 'application/json' };
            if (op.headers && op.headers.prefer) h.Prefer = op.headers.prefer;
            return fetch(op.url, { method: 'POST', headers: h, body: op.body || undefined }).then(function (res) {
              var ok = res.ok ? Promise.resolve(true)
                : (res.status === 409 ? res.text().then(function (t) { return bgOwnDuplicate(op, t); }, function () { return false; }) : Promise.resolve(false));
              return ok.then(function (yes) {
                if (!yes) return false;
                done++;
                return bgReq(db, 'outbox', 'readwrite', function (os) { return os.delete(op.id); }).then(function () { return true; });
              });
            });
          });
        });
        return chain.then(function () { return done; });
      });
    }).then(finish, function (e) { finish(0); throw e; });
  });
}
self.addEventListener('sync', function (event) {
  if (!event || event.tag !== BG_TAG) return;
  event.waitUntil(bgDrain());
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
              return warmPagesInto(urls).then(function () { return fillMissing(); });
            });
          });
        }).then(function () {
          return pc.put(MARK, new Response(String(Date.now())));
        });
      });
    }).catch(function () {});
  })());
});

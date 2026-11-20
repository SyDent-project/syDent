#!/usr/bin/env node
/* SyDent — check-guides.js: every main section has a written guide (guides.js).
   Each sidebar page id passed to initSidebar('<id>') — plus patient-profile — must map to a guide with an intro
   and steps, and every guide must render. Pages without a section guide on purpose: learn (the guides' own
   home) and subscription.
   Review of 20 Nov 2026 (the guides had drifted from the pages) added two checks on the text itself:
   • every <b>label</b> a guide names (button · tab · section) exists in the app's own pages — a guide cannot
     point the dentist at a control that is not there («تذكيرات WhatsApp للمواعيد» was one);
   • every guide is fully English through the real engine (theme.js SyI18n + i18n-en.js): one unknown text
     node keeps its whole line Arabic, so a reworded step with no dictionary entry stops the merge.
   Neither can prove a sentence TRUE — that is the written review in docs/GUIDES_REVIEW.md. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const EXEMPT = new Set(['learn', 'subscription']);
let fail = 0;
const bad = m => { fail++; console.log('  ✗ ' + m); };

const ctx = { window: {}, location: { pathname: '/index.html' }, document: { dispatchEvent() {} }, CustomEvent: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'guides.js'), 'utf8'), ctx);
const G = ctx.window.SyDentGuides;

const ids = new Set();
fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/initSidebar\((?:[^()]*\?\s*)?'([a-z-]+)'(?:\s*:\s*'([a-z-]+)')?\)/g)) {
    ids.add(m[1]); if (m[2]) ids.add(m[2]);
  }
});
[...ids].filter(id => !EXEMPT.has(id)).sort().forEach(id => { if (!G.forPage(id)) bad('page id «' + id + '» has no guide in guides.js'); });
ctx.location.pathname = '/patient-profile.html';
if (!G.forPage('patients') || G.forPage('patients').key !== 'patient-profile') bad('patient-profile has no guide of its own');

const keys = new Set();
G.list.forEach(g => {
  if (keys.has(g.key)) bad('duplicate guide key ' + g.key); keys.add(g.key);
  if (!g.title || !g.intro || !g.steps || g.steps.length < 2) bad('guide ' + g.key + ' needs a title, an intro and at least two steps');
  const h = G.html(g);
  if (!/<ol class="sd-guide__steps">/.test(h) || /<(?!\/?(?:b|p|ol|ul|li|div)\b)[a-z]/i.test(h)) bad('guide ' + g.key + ' renders unexpected markup');
});
if (!keys.has('start')) bad('the «start» guide is missing');

/* (2) labels: each <b>…</b> (split on «←» for a path) must appear in the app's sources, comments stripped */
const SRC = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && !['guides.js', 'i18n-en.js', 'learn.html'].includes(f))
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n').replace(/<!--[\s\S]*?-->/g, '');
const coreOf = t => t.replace(/^[^\u0600-\u06FFA-Za-z]+/, '').replace(/[^\u0600-\u06FFA-Za-z)]+$/, '').trim();
let nLabels = 0;
G.list.forEach(g => [].concat(g.steps, g.tips || []).forEach(t => {
  for (const m of t.matchAll(/<b>(.*?)<\/b>/g)) m[1].split('←').map(coreOf).forEach(l => {
    if (!l) return; nLabels++;
    if (!SRC.includes(l)) bad('guide ' + g.key + ' names «' + l + '», which is on no page');
  });
}));

/* (3) English: every text node of every guide through the real engine */
const AR = /[\u0600-\u06FF]/;
function engine() {
  const store = { 'sydent.lang': 'en' };
  const el = () => ({ getAttribute: () => null, setAttribute() {}, closest: () => null, nodeName: 'DIV' });
  const c = {
    console, setTimeout: () => 0,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    location: { search: '', pathname: '/learn.html', reload() {} },
    document: {
      readyState: 'complete', title: '', documentElement: { classList: { add() {} } }, body: el(),
      write() {}, querySelector: () => null, getElementById: () => null, addEventListener() {},
      createTreeWalker: () => ({ nextNode: () => null }), createElement: () => Object.assign(el(), { addEventListener() {} })
    },
    MutationObserver: function () { this.observe = () => {}; }
  };
  c.window = c; c.window.addEventListener = () => {};
  vm.createContext(c);
  const theme = fs.readFileSync(path.join(ROOT, 'theme.js'), 'utf8'), a = theme.indexOf('/* ── SyI18n'), z = theme.indexOf('})();', a) + 5;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'i18n-en.js'), 'utf8'), c);
  vm.runInContext(theme.slice(a, z), c);
  return c.window.SyI18n;
}
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
let nNodes = 0;
try {
  const I = engine();
  if (I.lang !== 'en') bad('the English engine is not on for learn.html');
  G.list.forEach(g => {
    const nodes = [g.title, g.intro].concat(G.html(g).split(/<[^>]+>/).map(n => n.replace(/&(?:amp|lt|gt|quot|#39);/g, e => ENT[e])));
    nodes.forEach(n => {
      if (!n.trim() || !AR.test(n)) return; nNodes++;
      const out = I.t(n);
      if (out == null || AR.test(out)) bad('guide ' + g.key + ' stays Arabic in English: «' + n.trim().slice(0, 70) + '»');
    });
  });
  /* the guide window and its header button: every Arabic literal the file builds outside the GUIDES list */
  const src = fs.readFileSync(path.join(ROOT, 'guides.js'), 'utf8'), tail = src.slice(src.indexOf('function esc(')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of tail.matchAll(/[>'"]([^<>'"]*[\u0600-\u06FF][^<>'"]*)[<'"]/g)) {
    nNodes++;
    const out = I.t(m[1]);
    if (out == null || AR.test(out)) bad('the guide window stays Arabic in English: «' + m[1].trim() + '»');
  }
} catch (e) { bad('English engine throws: ' + e.message); }

if (fail) { console.log('⛔ حارس الأدلة: ' + fail + ' مشكلة.'); process.exit(1); }
console.log('✅ حارس الأدلة: ' + G.list.length + ' دليلاً — لكل قسم رئيسي دليلُه (' + ids.size + ' صفحة) · ' + nLabels + ' تسميةً موجودة بالصفحات · ' + nNodes + ' عقدةَ نصٍّ إنجليزيةٌ كاملة.');

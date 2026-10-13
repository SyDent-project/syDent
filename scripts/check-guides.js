#!/usr/bin/env node
/* SyDent — check-guides.js: every main section has a written guide (guides.js).
   Each sidebar page id passed to initSidebar('<id>') — plus patient-profile — must map to a guide with an intro
   and steps, and every guide must render. Pages without a section guide on purpose: learn (the guides' own
   home) and subscription. */
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

if (fail) { console.log('⛔ حارس الأدلة: ' + fail + ' مشكلة.'); process.exit(1); }
console.log('✅ حارس الأدلة: ' + G.list.length + ' دليلاً — لكل قسم رئيسي دليلُه (' + ids.size + ' صفحة).');

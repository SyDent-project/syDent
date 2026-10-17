/* v613 — مثبتُ بوابة المريض الخفيفة (M180): portal.html · pp-portal.js · الهجرة · settings · بطاقة المريض — على الملفات الحيّة.
   (١) المرايا: قالبُ البوابة بالإعدادات = pp-portal.js بايت-بايت · عناصرُه النائبة الخمسة بحبّات الإعدادات · حالاتُ الموعد بـportal.html
       تغطّي قيدَ appointments.status بالقاعدة · تطبيعُ هاتف واتساب بـportal.html = intake.html حرفياً;
   (٢) portal.html سطحٌ مستقلّ وقراءةٌ محضة: لا ملفَ مشترك · لا ?v= · vendor · noindex · RPC واحد (portal_info) · صفرُ كتابة
       (لا from/insert/update/delete ولا تخزينَ متصفح) · التوكن 64 hex فقط · الحالتان expired/revoked بنصّهما;
   (٣) الهجرة: RLS + بوابة الاشتراك · صفٌّ حيٌّ واحد · STABLE + SECURITY DEFINER · بلا أي INSERT/UPDATE/DELETE بجسم الدالة ·
       REVOKE/GRANT للدالة وحدها · سلسلة بوابات _intake_clinic_open · كلُّ قسمٍ خلف مفتاحه · >1 خيار ⇒ لا بنود ·
       الصيغةُ المالية الحرفية (المكتسبُ على 'completed' حصراً · الاستردادُ يأكل المقدَّم أولاً · بلا توزيعات ⇒ المحصَّل) · نوعُ 'portal' بالمراسلات;
   (٤) التكافؤ المالي (#684): نموذجُ صيغة SQL (مترجَم حرفياً) = computeFinancials الحيّة على 300 عيّنة عشوائية بالعملتين،
       وترتيبُ حالة الرصيد بـportal.html = ترتيبُ صندوق البطاقة · والقسطُ القادم = ppPlanCalc الحيّة على 300 عيّنة (شهري بقصّ آخر الشهر · أسبوعي · كل أسبوعين);
   (٥) الرسم (vm): كلُّ حالةٍ زرُّها الحرفي (لم يُرسل · نشط · منتهٍ · موقوف) · الخطةُ المحجوبة تُخفي الصفّ · الإيقافُ مقيَّد بالصفّ الحيّ ·
       الرابطُ بالتوكن · القالبُ يُملأ · portal.html ترسم الأقسام الأربعة وتُخفي ما ليس مفتوحاً وتعرض «بانتظار قرارك» بلا أرقام;
   (٦) التوصيل: بطاقة المريض (السكربت · الصفّ · النداء) · PP_MSG_KINDS · cache-bust (استثناءُ portal.html + pp-portal.js أصلٌ مرقّم) ·
       check-colors · الإعدادات (4 مفاتيح · حفظٌ مخفيٌّ بالقراءة · المعاينة · الاستعادة · الحفظ).
   --self-test: 12 طفرة لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function slice(src, fnName) {
  let i = src.indexOf('async function ' + fnName + '(');
  if (i < 0) i = src.indexOf('function ' + fnName + '(');
  if (i < 0) throw new Error('missing ' + fnName);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + fnName);
}
function constValue(src, name) {
  const re = new RegExp('(?:const|var|let)\\s+' + name + '\\s*=\\s*');
  const m = re.exec(src); if (!m) throw new Error('const ' + name);
  const from = m.index + m[0].length;
  const end = src.indexOf(';\n', from);
  return vm.runInNewContext('(' + src.slice(from, end) + ')', Object.create(null), { timeout: 1000 });
}
function literal(src, anchor, open, close) {
  const at = src.indexOf(anchor); if (at < 0) throw new Error('anchor ' + anchor);
  const from = src.indexOf(open, at); let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (!depth) return vm.runInNewContext('(' + src.slice(from, i + 1) + ')', Object.create(null), { timeout: 1000 }); }
  }
  throw new Error('unbalanced ' + anchor);
}
const fnBody = (sql) => { const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.portal_info'); const j = sql.indexOf('END; $$;', i); return sql.slice(i, j); };

/* ── pp-portal.js in a vm with stub DOM ─────────────────────────────── */
function loadPP(src, opt) {
  opt = opt || {};
  const FN = ['ppPortalLink', 'ppPortalIsLive', 'ppPortalIsExpired', 'ppPortalWhen', 'ppPortalShowsText', 'ppPortalLiveRow', 'ppPortalRender', 'ppPortalFill', 'ppPortalMsgText', 'ppPortalErr'];
  const els = { portalRow: { style: {} }, iPortal: { innerHTML: '' } };
  const ctx = {
    window: { sb: null }, document: { getElementById: id => els[id] || null }, console: { warn() {} },
    location: { origin: 'https://sydent.app' }, Date, Array, Object, String, Number, Math, RegExp, JSON,
    escapeHtml: s => String(s == null ? '' : s).replace(/"/g, '&quot;'), fmtD: d => String(d).slice(0, 10),
    patient: opt.patient || { name: 'سامر خالد' }, CLINIC_SETTINGS_WA: opt.cs === undefined ? { clinic_name: 'عيادة الأمل', clinic_phone: '0933123456' } : opt.cs,
    PP_PORTAL: opt.rows && opt.rows[0] || null, PP_BOOKING_PLAN_OK: opt.planOk !== false, PP_PORTAL_ROWS: opt.rows || []
  };
  vm.createContext(ctx);
  vm.runInContext('var PP_PORTAL_DAYS = 30; var PP_DEFAULT_PORTAL_TPL = ' + JSON.stringify(constValue(src, 'PP_DEFAULT_PORTAL_TPL')) + ';\n'
    + FN.map(f => slice(src, f)).join('\n'), ctx);
  return { ctx, els };
}
/* ── portal.html inline script in a vm: stub supabase + DOM, boot resolves to «unavailable» ── */
function loadPortal(html, info) {
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const els = { app: { innerHTML: '' } };
  const ctx = {
    window: { supabase: { createClient: () => ({ rpc: async () => ({ data: null }) }) } },
    document: { getElementById: id => els[id] || null, title: '' },
    location: { search: '' }, encodeURIComponent, Date, Array, Object, String, Number, Math, RegExp, JSON, Promise, console
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  if (info) ctx.INFO = info;
  return { ctx, els };
}
/* ── computeFinancials الحيّة (patient-profile.html) في vm ──────────── */
function loadCF(pph) {
  const ctx = { Array, Object, Number, Math, parseFloat, window: {}, sessions: [], payments: [], paymentSplits: [], adjustments: [] };
  vm.createContext(ctx);
  vm.runInContext(slice(pph, '_rowCur') + '\n' + slice(pph, 'computeFinancials'), ctx);
  return ctx;
}
/* ── نموذجُ صيغة SQL (M180) مترجَماً حرفياً إلى JS — المقارنةُ مع computeFinancials هي البرهان (#684) ── */
function sqlModel(rows) {
  const cur = r => (r.currency === 'USD') ? 'USD' : 'SYP';
  const out = {};
  ['SYP', 'USD'].forEach(c => {
    const ses = rows.sessions.filter(s => cur(s) === c);
    const st = {}; rows.sessions.forEach(s => { st[s.id] = s.status || 'completed'; });
    const completed = ses.filter(s => (s.status || 'completed') !== 'planned').reduce((a, s) => a + (s.cost || 0), 0);
    const paid = rows.payments.filter(p => cur(p) === c).reduce((a, p) => a + (p.amount || 0), 0);
    const spl = rows.splits.filter(s => cur(s) === c);
    const has = spl.length > 0;
    let alloc = 0, unearned = 0;
    spl.forEach(s => { const mobile = !!s.is_unearned || !s.session_id || (st[s.session_id] || '') !== 'completed'; if (mobile) unearned += s.amount; else alloc += s.amount; });
    const refunds = rows.adjustments.filter(a => cur(a) === c && a.kind === 'refund' && a.amount > 0).reduce((x, a) => x + a.amount, 0);
    const reductions = rows.adjustments.filter(a => cur(a) === c && (a.kind === 'discount' || a.kind === 'write_off') && a.amount > 0).reduce((x, a) => x + a.amount, 0);
    const allocated = has ? alloc : paid;
    const unearnedEff = unearned - Math.min(refunds, unearned);
    const tb = (completed - reductions) - allocated + (refunds - Math.min(refunds, unearned));
    const money = completed || paid || allocated || unearnedEff || reductions || refunds || has;
    out[c] = { completed, paid, reductions, refunds, unearned: unearnedEff, true_balance: tb, money: !!money };
  });
  return out;
}
/* ── نموذجُ next_due بالـSQL (شهري بقصّ آخر الشهر · أسبوعي 7k · كل أسبوعين 14k) ── */
function sqlNextDue(startYmd, freq, k) {
  const p = startYmd.split('-').map(Number);
  if (freq === 'weekly' || freq === 'biweekly') return new Date(Date.UTC(p[0], p[1] - 1, p[2] + (freq === 'weekly' ? 7 : 14) * k)).toISOString().slice(0, 10);
  let mm = (p[1] - 1) + k, yy = p[0] + Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();   /* postgres: date + N months clamps to the month's last day */
  return new Date(Date.UTC(yy, mm, Math.min(p[2], last))).toISOString().slice(0, 10);
}
function rnd(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

function suite(S) {
  const { portal, pp, mig, pph, ppcss, cb, ppwa, stg, cc, cmb, schema, plan, intake, mig181, mig182 } = S;
  /* (١) المرايا */
  ok(constValue(stg, 'DEFAULT_PORTAL_TEMPLATE') === constValue(pp, 'PP_DEFAULT_PORTAL_TPL'), 'mirror: settings DEFAULT_PORTAL_TEMPLATE = pp-portal PP_DEFAULT_PORTAL_TPL (byte)');
  const tplKeys = ['patient_first_name', 'patient_name', 'clinic_name', 'clinic_phone', 'portal_link'];
  ok(tplKeys.every(k => stg.indexOf("insertPlaceholderInto('fPortalTemplate','{" + k + "}')") > -1) && tplKeys.every(k => new RegExp(k + ':').test(slice(pp, 'ppPortalMsgText'))), 'mirror: the five placeholders exist as settings pills and in ppPortalMsgText');
  const apptStatuses = (/appointments_status_check" CHECK \(\("status" = ANY \(ARRAY\[([^\]]*)\]/.exec(schema) || ['', ''])[1].match(/'([a-z_]+)'/g).map(x => x.slice(1, -1));
  const portalStatus = literal(portal, 'var APPT_STATUS', '{', '}');
  ok(apptStatuses.length === 7 && apptStatuses.every(k => portalStatus[k] && portalStatus[k].l), 'mirror: portal.html APPT_STATUS covers every appointments.status value (' + apptStatuses.join(',') + ')');
  const waNorm = s => slice(s, 'waPhone').replace(/\s+/g, ' ').replace(/^function waPhone\(\)\{ var p = \(INFO && INFO\.clinic_phone\) \? String\(INFO\.clinic_phone\)\.replace\(\/\[\^0-9\+\]\/g,''\) : ''; if \(!p\) return ''; if \(p\.charAt\(0\) === '0' && p\.length === 10\) p = '963' \+ p\.slice\(1\); p = p\.replace\(\/\^\\\+\/, ''\);/, '');
  ok(/if \(p\.charAt\(0\) === '0' && p\.length === 10\) p = '963' \+ p\.slice\(1\);/.test(slice(portal, 'waPhone')) && /if \(p\.charAt\(0\) === '0' && p\.length === 10\) p = '963' \+ p\.slice\(1\);/.test(slice(intake, 'waHref')) && /\^\[0-9\]\{8,15\}\$/.test(slice(portal, 'waPhone')), 'mirror: WhatsApp phone normalisation = intake.html (0… ⇒ 963…, 8–15 digits)');
  void waNorm;
  /* (٢) portal.html standalone + read-only */
  ok(!/src="(supabase-init|sidebar|theme|sy-modal)\.js|href="theme\.css/.test(portal) && portal.indexOf('?v=') < 0 && portal.indexOf('/vendor/supabase-') > -1 && /name="robots" content="noindex"/.test(portal), 'portal.html: standalone, token-free, vendor supabase, noindex');
  const rpcs = [...portal.matchAll(/sb\.rpc\('([a-z_]+)'/g)].map(m => m[1]);
  ok(rpcs.length === 4 && rpcs.slice().sort().join() === 'portal_appt_change,portal_confirm,portal_info,portal_slots' && /sb\.rpc\('portal_slots', \{ p_token: TOKEN, p_appt: id \}\)/.test(portal) && /sb\.rpc\('portal_info', \{ p_token: TOKEN \}\)/.test(portal) && /sb\.rpc\('portal_confirm', \{ p_token: TOKEN, p_appt: id \}\)/.test(portal) && /sb\.rpc\('portal_appt_change', \{ p_token: TOKEN, p_appt: id, p_kind: kind, p_reason: reason \|\| null,/.test(portal), 'portal.html: exactly four RPCs — portal_info + portal_slots (reads) · portal_confirm and portal_appt_change (the two narrow writes)');
  ok(!/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|sessionStorage|indexedDB/.test(portal) && portal.replace(/localStorage\.(getItem|setItem)\(KEY/g, '').indexOf('localStorage') < 0 && /var KEY = 'sydent_theme';/.test(portal), 'portal.html: no table access at all (writes only through the two narrow RPCs); the only browser storage is the theme key (sydent_theme)');
  ok(/\[\?&\]t=\(\[0-9a-fA-F\]\{64\}\)/.test(portal), 'portal.html: token read as 64 hex only');
  const smsg = literal(portal, 'var STATUS_MSG', '{', '}');
  const deadStatuses = [...new Set([...mig.matchAll(/'status', '(expired|revoked)'/g)].map(m => m[1]))];
  ok(deadStatuses.length === 2 && deadStatuses.every(k => typeof smsg[k] === 'string' && smsg[k].length > 5) && /row\.status === 'expired'/.test(portal) && /row\.status === 'revoked'/.test(portal) && /row\.status !== 'ok'/.test(portal), 'portal.html: expired/revoked/unknown statuses each handled with an Arabic message');
  ok(/persistSession: false, autoRefreshToken: false, detectSessionInUrl: false/.test(portal), 'portal.html: standalone client never touches the tenant auth storage');
  ok(/target="_blank" rel="noopener"/.test(portal) && !/<a [^>]*href="https:\/\/wa\.me[^>]*>(?![^<]*rel=)/.test(portal.replace(/rel="noopener"/g, '')), 'portal.html: external WhatsApp links open in a new tab with noopener');
  ok(/if \(ik\.status !== 'pending' \|\| !tok \|\| !\/\^\[0-9a-f\]\{64\}\$\/\.test\(String\(tok\)\)\) return '';/.test(portal) && /href="\/intake\.html\?t=' \+ tok \+ '"/.test(portal), 'portal.html: intake link only for a pending 64-hex token, same-origin');
  const themeBlock = f => { const a = f.indexOf('/* ── M181: dark palette'); const b = f.indexOf('/* ── /M181 ── */'); const c = f.indexOf('<script>\n/* M181: theme'); const d = f.indexOf('</script>', c); return f.slice(a, b) + f.slice(c, d); };
  /* v618 — mobile/network: shared head script + mobile CSS mirrored byte-for-byte; every RPC guarded and timed */
  const headJs = f => { const a = f.indexOf('/* ── v618 mobile/network'); return a < 0 ? '' : f.slice(a, f.indexOf('</script>', a)); };
  const mobCss = f => { const a = f.indexOf('/* ── v618: mobile'); return a < 0 ? '' : f.slice(a, f.indexOf('/* ── /v618 ── */', a)); };
  ok(headJs(portal).length > 400 && headJs(portal) === headJs(intake) && mobCss(portal).length > 300 && mobCss(portal) === mobCss(intake), 'mobile: head script (Sentry scrub · withTimeout) and mobile CSS are byte-identical on portal.html and intake.html');
  ok([portal, intake].every(f => /<script src="https:\/\/js-de\.sentry-cdn\.com\/[0-9a-f]+\.min\.js" crossorigin="anonymous" async><\/script>/.test(f) && f.indexOf('window.sentryOnLoad') < f.indexOf('js-de.sentry-cdn.com')), 'mobile: Sentry loads async (never blocks the page) and its init is defined before the loader');
  ok(/replace\(\/\[0-9a-fA-F\]\{64\}\/g, '\[token\]'\)/.test(headJs(portal)) && /beforeSend: function\(ev\)\{ return scrub\(ev\); \}, beforeBreadcrumb: function\(b\)\{ return scrub\(b\); \}/.test(headJs(portal)) && /replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0/.test(headJs(portal)), 'mobile: the link token never reaches Sentry (events + breadcrumbs scrubbed) and session replay is off');
  ok(/env\(safe-area-inset-top, 0px\)/.test(mobCss(portal)) && /env\(safe-area-inset-bottom, 0px\)/.test(mobCss(portal)) && /overflow-wrap:anywhere/.test(mobCss(portal)) && /input\[type=text\],input\[type=date\],input\[type=tel\],textarea\{font-size:16px;\}/.test(mobCss(portal)) && /-webkit-text-size-adjust:100%/.test(mobCss(portal)), 'mobile: safe areas · long words wrap (no zoom-out) · inputs 16px (no iOS focus-zoom) · text-size-adjust');
  ok(/\.theme-btn\{\n  position:absolute; top:calc\(8px \+ env\(safe-area-inset-top, 0px\)\)/.test(portal) && !/\.theme-btn\{[^}]*position:fixed/.test(portal), 'mobile: the theme button scrolls with the page (was fixed and covered content) and clears the notch');
  const rpcCalls = f => [...f.matchAll(/sb\.rpc\('[a-z_]+'/g)].length;
  const timedCalls = f => [...f.matchAll(/withTimeout\(sb\.rpc\('[a-z_]+'/g)].length;
  ok(rpcCalls(portal) === 4 && timedCalls(portal) === 4 && rpcCalls(intake) === timedCalls(intake) && rpcCalls(intake) >= 2 && [portal, intake].every(f => /var sb = \(window\.supabase && window\.supabase\.createClient\) \?/.test(f) && (f.match(/if \(!sb\) throw new Error\('vendor'\);/g) || []).length === rpcCalls(f)), 'network: every RPC on both pages is timed out and guarded against a vendor script that failed to load');
  ok(/min-height:44px/.test(portal) && /<div class="pl-row"><div class="pl-name">/.test(portal) && /\.pl-cost\{white-space:nowrap;/.test(portal) && !/<table>/.test(portal) && /id="slowNote"/.test(portal) && /clearTimeout\(slowT\);/.test(portal), 'mobile: 44px tap targets · the plan is a two-column list whose cost is never clipped · a slow-link note after 6s');
  ok(themeBlock(portal).length > 500 && themeBlock(portal) === themeBlock(intake) && /id="themeBtn" onclick="toggleTheme\(\)"/.test(portal) && /id="themeBtn" onclick="toggleTheme\(\)"/.test(intake) && /:root\[data-theme="dark"\]\{/.test(portal), 'theme: dark palette + toggle block byte-identical on portal.html and intake.html; both carry the button');
  /* (٣) الهجرة */
  ok(/ALTER TABLE public\.patient_portals ENABLE ROW LEVEL SECURITY;/.test(mig) && /_sub_guard_table\('public\.patient_portals'\)/.test(mig), 'migration: RLS + subscription gate');
  ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_portals_live[\s\S]*?WHERE revoked_at IS NULL/.test(mig), 'migration: one live link per patient');
  ok(/LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(fnBody(mig)), 'migration: portal_info is SECURITY DEFINER + STABLE (read-only by contract)');
  const body = fnBody(mig).replace(/--[^\n]*/g, '');
  ok(!/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|PERFORM\s|TRUNCATE)\b/i.test(body), 'migration: zero writes inside portal_info');
  const grants = [...mig.matchAll(/GRANT EXECUTE ON FUNCTION public\.([a-z_]+)\(/g)].map(m => m[1]);
  ok(grants.length === 1 && grants[0] === 'portal_info' && /REVOKE ALL ON FUNCTION public\.portal_info\(text\) FROM PUBLIC;/.test(mig) && !/CREATE POLICY[^;]*anon/i.test(mig), 'migration: the RPC is the only anon surface (no anon policy)');
  ok(/IF NOT public\._intake_clinic_open\(v\.owner_id\) THEN RETURN NULL; END IF;/.test(body) && /IF p_token IS NULL OR p_token !~ '\^\[0-9a-f\]\{64\}\$' THEN RETURN NULL; END IF;/.test(body), 'migration: token shape + clinic gate chain (status → subscription → plan) before anything');
  ok(/IF v\.revoked_at IS NOT NULL THEN\s+RETURN jsonb_build_object\('status', 'revoked'/.test(body) && /IF v\.expires_at < now\(\) THEN\s+RETURN jsonb_build_object\('status', 'expired'/.test(body), 'migration: revoked/expired return no data');
  ok(['show_appts', 'show_plan', 'show_balance', 'show_notes'].every(k => new RegExp('IF cs\\.' + k + ' THEN').test(body)), 'migration: every section sits behind its clinic switch');
  ok(/COALESCE\(c\.portal_show_balance, false\)/.test(body) && /portal_show_balance\s+BOOLEAN NOT NULL DEFAULT false/.test(mig), 'migration: balance is OFF by default (CareStack)');
  ok(/IF v_opts > 1 THEN\s+v_plan := jsonb_build_object\('pending_options', true, 'items', '\[\]'::jsonb, 'totals', '\[\]'::jsonb\);/.test(body), 'migration: >1 open option ⇒ pending flag, no items, no totals');
  ok(/COALESCE\(s\.status, 'completed'\) = 'planned'/.test(body) && /x\.is_planned = false/.test(body), 'migration: plan = planned rows; appointments exclude planned-without-date');
  ok(/COALESCE\(se\.st, ''\) <> 'completed'\) AS mobile/.test(body) && /CASE WHEN l\.has_splits THEN l\.allocated_raw ELSE l\.paid END/.test(body) && /l\.unearned_raw - LEAST\(l\.refunds, l\.unearned_raw\) AS unearned/.test(body) && /\+ \(l\.refunds - LEAST\(l\.refunds, l\.unearned_raw\)\) AS true_balance/.test(body) && /st <> 'planned'\), 0\) completed/.test(body), 'migration: the literal computeFinancials formula (earned only on completed · legacy no-splits · refund eats credit first)');
  ok(/'free','other','intake','portal'\]\)\);/.test(mig), 'migration: patient_messages kind check carries portal');
  const cf = (() => { const i = mig182.indexOf('CREATE OR REPLACE FUNCTION public.portal_confirm'); return mig182.slice(i, mig182.indexOf('END; $$;', i)).replace(/--[^\n]*/g, ''); })();
  ok(/pp\.revoked_at IS NULL AND pp\.expires_at >= now\(\)/.test(cf) && /_intake_clinic_open\(v\.owner_id\)/.test(cf) && /x\.doctor_id = v\.owner_id AND x\.patient_id = v\.patient_id AND x\.is_planned = false/.test(cf) && /a\.date < v_today OR COALESCE\(a\.status, 'pending'\) NOT IN \('scheduled', 'pending'\)\s+OR a\.confirmation_status = 'cancelled_by_pt'/.test(cf), 'migration 182: confirm needs a live link + open clinic, own real appointment, today-or-later, currently unconfirmed, not cancelled by phone');
  ok((cf.match(/\bUPDATE public\./g) || []).length === 1 && (cf.match(/\bUPDATE\b/g) || []).length === 2 && /SET status = 'confirmed',\s+confirmation_status = 'confirmed',\s+confirmed_at = COALESCE\(confirmed_at, now\(\)\)\s+WHERE id = a\.id;/.test(cf) && !/\bDELETE\b/.test(cf) && (cf.match(/\bINSERT INTO\b/g) || []).length === 1 && /INSERT INTO public\.audit_log/.test(cf) && /'source', 'portal'/.test(cf), 'migration 182: the only UPDATE sets exactly status/confirmation/confirmed_at (modal «مؤكد» semantics); the only INSERT is the audit row');
  ok(/GRANT EXECUTE ON FUNCTION public\.portal_confirm\(text, uuid\) TO anon, authenticated;/.test(mig182) && /REVOKE ALL ON FUNCTION public\.portal_confirm\(text, uuid\) FROM PUBLIC;/.test(mig182) && /'id', a\.id, 'date', a\.date/.test(mig182) && /LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(mig182.slice(mig182.indexOf('CREATE OR REPLACE FUNCTION public.portal_info'), mig182.indexOf('CREATE OR REPLACE FUNCTION public.portal_confirm'))), 'migration 182: grants, upcoming rows carry ids, portal_info stays STABLE');
  ok(/i\.status IN \('submitted', 'reviewed'\)/.test(fnBody(mig181)) && /jsonb_build_object\('status', 'pending', 'token', v_intake\)/.test(fnBody(mig181)) && /LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(fnBody(mig181)) && !/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i.test(fnBody(mig181).replace(/--[^\n]*/g, '')) && !/answers|signature/.test(fnBody(mig181).replace(/--[^\n]*/g, '')), 'migration 181: intake in three states, still STABLE/zero-write, never exposes answers or signature');
  ok(/i\.status = 'pending' AND i\.expires_at > now\(\)/.test(body), 'migration: intake link only while pending and unexpired');
  ok(/x\.date >= v_today AND COALESCE\(x\.status, 'pending'\) NOT IN \('cancelled','broken','completed','no_show'\)/.test(body) && /x\.date < v_today AND x\.date >= v_today - 365/.test(body), 'migration: upcoming = live from today; past = last 365 days');
  /* (٤) التكافؤ المالي */
  const CF = loadCF(pph);
  let agree = 0, N = 300;
  const r = rnd(20261012);
  const pick = a => a[Math.floor(r() * a.length)];
  for (let t = 0; t < N; t++) {
    const sessions = [], payments = [], splits = [], adjustments = [];
    const nS = Math.floor(r() * 5);
    for (let i = 0; i < nS; i++) sessions.push({ id: 's' + i, cost: Math.round(r() * 500) * 1000, currency: pick(['SYP', 'USD', null]), status: pick(['completed', 'planned', 'existing_current', 'referred', null]) });
    const nP = Math.floor(r() * 4);
    for (let i = 0; i < nP; i++) payments.push({ id: 'p' + i, amount: Math.round(r() * 300) * 1000, currency: pick(['SYP', 'USD']) });
    if (r() < 0.7) payments.forEach(p => { let left = p.amount; const k = Math.floor(r() * 3); for (let j = 0; j < k && left > 0; j++) { const a = Math.round(r() * left); left -= a; splits.push({ amount: a, currency: p.currency, is_unearned: r() < 0.4, session_id: r() < 0.8 && sessions.length ? pick(sessions).id : null }); } if (left > 0 && r() < 0.5) splits.push({ amount: left, currency: p.currency, is_unearned: true, session_id: null }); });
    const nA = Math.floor(r() * 3);
    for (let i = 0; i < nA; i++) adjustments.push({ kind: pick(['refund', 'discount', 'write_off']), amount: Math.round(r() * 100) * 1000, currency: pick(['SYP', 'USD']) });
    CF.sessions = sessions; CF.payments = payments; CF.paymentSplits = splits; CF.adjustments = adjustments;
    const f = CF.computeFinancials(), m = sqlModel({ sessions, payments, splits, adjustments });
    const same = ['SYP', 'USD'].every(c => {
      const b = f.bags[c], q = m[c];
      const money = !!(b.completedTotal || b.paid || b.allocatedToProduction || b.unearnedCredit || b.chargeReductions || b.refundsTotal || b._hasSplits);
      return Math.abs(b.completedTotal - q.completed) < 1e-6 && Math.abs(b.paid - q.paid) < 1e-6 && Math.abs(b.chargeReductions - q.reductions) < 1e-6
        && Math.abs(b.refundsTotal - q.refunds) < 1e-6 && Math.abs(b.unearnedCredit - q.unearned) < 1e-6 && Math.abs(b.trueBalance - q.true_balance) < 1e-6 && money === q.money;
    });
    if (same) agree++;
  }
  ok(agree === N, 'parity: SQL balance model = computeFinancials on ' + agree + '/' + N + ' random samples (both layers, splits/adjustments/legacy)');
  const P = loadPortal(portal);
  let rankOk = true;
  for (let t = 0; t < 200; t++) {
    const c = pick(['SYP', 'USD']), tb = (r() - 0.5) * 2000, un = r() < 0.5 ? 0 : r() * 1000;
    const e = c === 'USD' ? 0.005 : 0.5;
    const exp = tb > e ? 'المتبقي عليك' : (un > e ? 'رصيد مقدّم لك' : (tb < -e ? 'مبلغ لصالحك' : 'الحساب مسدّد ✓'));
    if (P.ctx.balanceState({ currency: c, true_balance: tb, unearned: un }).word !== exp) rankOk = false;
  }
  ok(rankOk, 'parity: portal balance line follows the card ranking (owed → prepaid → surplus → settled) with the layer epsilon');
  /* installments: SQL next_due model vs live ppPlanCalc */
  const PL = { Date, Math, Number, String, Array };
  vm.createContext(PL);
  vm.runInContext(slice(plan, 'ppPlanAddPeriod') + '\n' + slice(plan, 'ppPlanCalc'), PL);
  let instOk = 0;
  for (let t = 0; t < N; t++) {
    const freq = pick(['monthly', 'weekly', 'biweekly']);
    const start = (2026 + Math.floor(r() * 2)) + '-' + String(1 + Math.floor(r() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 31)).padStart(2, '0');
    const d = new Date(start + 'T00:00:00Z'); if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== start) { instOk++; continue; }
    const cur = pick(['SYP', 'USD']);
    const plan = { total: Math.round(r() * 20 + 1) * 100, installment_amount: Math.round(r() * 5 + 1) * 100, frequency: freq, start_date: start, currency: cur };
    const pays = []; const nP = Math.floor(r() * 4);
    for (let i = 0; i < nP; i++) pays.push({ amount: Math.round(r() * 8) * 100, currency: pick([cur, cur, 'SYP', 'USD']), date: pick([start, '2025-01-01', '2027-06-15']) });
    const j = PL.ppPlanCalc(plan, pays, '2026-10-12');
    /* SQL: covered = Σ same-currency payments on/after start, capped; k = floor(covered/inst); done ⇒ null */
    let covered = pays.filter(p => ((p.currency === 'USD') ? 'USD' : 'SYP') === cur && p.date >= start).reduce((a, p) => a + p.amount, 0);
    if (covered > plan.total) covered = plan.total;
    const k = Math.floor(covered / plan.installment_amount);
    const done = covered >= plan.total - 0.5;
    const sqlDue = done ? null : sqlNextDue(start, freq, k);
    if (j.nextDue === sqlDue && Math.abs(j.covered - covered) < 1e-9 && j.done === done && Math.abs(j.remaining - Math.max(0, plan.total - covered)) < 1e-9) instOk++;
  }
  ok(instOk === N, 'parity: SQL installment model (next_due · covered · done · remaining) = ppPlanCalc on ' + instOk + '/' + N + ' samples');
  /* (٥) الرسم */
  const live = { id: 'r1', token: 'ab'.repeat(32), expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), revoked_at: null, created_at: '2026-10-12T10:00:00Z' };
  const dead = Object.assign({}, live, { expires_at: new Date(Date.now() - 86400000).toISOString() });
  const rev = Object.assign({}, live, { revoked_at: '2026-10-11T09:00:00Z' });
  const html = rows => { const L = loadPP(pp, { rows }); L.ctx.ppPortalRender(); return L.els.iPortal.innerHTML; };
  const h0 = html([]), h1 = html([live]), h2 = html([dead]), h3 = html([rev]);
  ok(/لم يُرسل بعد/.test(h0) && /onclick="ppPortalSend\(\)"/.test(h0) && !/ppPortalRevoke|ppPortalRenew|ppPortalCopyLink/.test(h0), 'render: no link ⇒ «إرسال» only');
  ok(/🟢 نشط حتى/.test(h1) && ['ppPortalSend', 'ppPortalCopyLink', 'ppPortalRenew', 'ppPortalRevoke'].every(f => h1.indexOf('onclick="' + f + '()"') > -1), 'render: live link ⇒ resend · copy · renew · revoke (literal onclick names)');
  ok(/⌛ انتهت صلاحية/.test(h2) && /ppPortalSend\(\)/.test(h2) && /ppPortalRevoke\(\)/.test(h2) && !/ppPortalCopyLink|ppPortalRenew\(/.test(h2), 'render: expired ⇒ renew-and-send + revoke only');
  ok(/⛔ أُوقف الرابط/.test(h3) && /ppPortalSend\(\)/.test(h3) && !/ppPortalRevoke|ppPortalCopyLink/.test(h3), 'render: revoked ⇒ new link only');
  const Lx = loadPP(pp, { rows: [live], planOk: false }); Lx.ctx.ppPortalRender();
  ok(Lx.els.portalRow.style.display === 'none', 'render: booking plan gate hides the row');
  const Lp = loadPP(pp, { rows: [live] });
  ok(Lp.ctx.ppPortalLink(live.token) === 'https://sydent.app/portal.html?t=' + live.token && Lp.ctx.ppPortalIsLive(live) && !Lp.ctx.ppPortalIsLive(rev) && Lp.ctx.ppPortalIsExpired(dead) && !Lp.ctx.ppPortalIsExpired(live), 'helpers: link · live · expired');
  const msg = Lp.ctx.ppPortalMsgText('https://sydent.app/portal.html?t=x');
  ok(msg.indexOf('سامر') > -1 && msg.indexOf('عيادة الأمل') > -1 && msg.indexOf('portal.html?t=x') > -1 && msg.indexOf('{') < 0, 'template: default fills first name · clinic · link, no leftover placeholder');
  const Lc = loadPP(pp, { rows: [live], cs: { clinic_name: 'X', whatsapp_portal_template: 'رابطك {portal_link} يا {patient_name}' } });
  ok(Lc.ctx.ppPortalMsgText('L') === 'رابطك L يا سامر خالد', 'template: clinic override wins');
  ok(/يعرض للمريض: المواعيد · خطة العلاج · التعليمات والروشتات/.test(Lp.ctx.ppPortalShowsText()) && /الرصيد/.test(loadPP(pp, { rows: [], cs: { portal_show_balance: true } }).ctx.ppPortalShowsText()), 'hint: send button names the sections the clinic enabled (balance only when on)');
  ok(/\.eq\('id', live\.id\)\.eq\('owner_id', currentUser\.id\)\.is\('revoked_at', null\)/.test(slice(pp, 'ppPortalRevoke')) && /SyDialog\.confirm\(/.test(slice(pp, 'ppPortalRevoke')) && /danger: true/.test(slice(pp, 'ppPortalRevoke')), 'revoke: confirmed, owner-scoped, live-row-scoped update');
  ok(/if \(live\) \{[\s\S]*?\.update\(\{ expires_at: exp, renewed_at: new Date\(\)\.toISOString\(\)/.test(slice(pp, 'ppPortalEnsureLive')) && /\.is\('revoked_at', null\)/.test(slice(pp, 'ppPortalEnsureLive')), 'renew: resend extends the live row, never mints a second token');
  ok(/ppWaComposeOpen\('إرسال رابط بوابة المريض', ppPortalMsgText\(link\), false, null, '', 'portal'\)/.test(pp) && /ppMsgLog\('portal'/.test(pp), 'send: v408 composer with kind portal; copy logs under portal');
  ok(/subscription_read_only\|sub_gate\|row-level security/.test(slice(pp, 'ppPortalErr')) && /Migration 180/.test(slice(pp, 'ppPortalErr')), 'errors: read-only and pre-migration messages');
  /* portal.html sections */
  const info = { status: 'ok', clinic_name: 'عيادة الأمل', clinic_phone: '0933123456', patient_name: 'سامر خالد', expires_at: '2026-11-11T00:00:00Z',
    show: { appts: true, plan: true, balance: true, notes: true },
    appts: { upcoming: [{ date: '2026-10-20', time: '10:30', type: 'حشوة', status: 'scheduled', confirmation: 'confirmed', doctor: 'د. أيهم' }], past: [{ date: '2026-09-01', time: '09:00', status: 'completed' }] },
    plan: { pending_options: false, items: [{ type: 'تاج زركون', tooth: '25', phase: 2, cost: 1000000, currency: 'SYP' }, { type: 'حشوة', tooth: '14', phase: 1, cost: 20, currency: 'USD', units: 2 }], totals: [{ currency: 'SYP', total: 1000000 }, { currency: 'USD', total: 20 }] },
    balance: [{ currency: 'SYP', completed: 3270000, paid: 1000000, reductions: 70000, refunds: 0, unearned: 0, true_balance: 2200000 }],
    installments: [{ title: 'خطة', currency: 'SYP', total: 2000000, installment: 500000, frequency: 'monthly', covered: 1000000, remaining: 1000000, count: 4, done: false, next_due: '2026-10-01', today: '2026-10-12' }],
    notes: { postop: [{ body: 'لا تمضمض <b>اليوم</b>', created_at: '2026-10-10T08:00:00Z' }], rx: [{ created_at: '2026-10-10T08:00:00Z', doctor: 'د. أيهم', notes: null, items: [{ drug: 'أموكسيسيلين', dosage: '500', frequency: '×3', duration: '7 أيام', instructions: 'بعد الطعام' }] }] },
    intake: { status: 'pending', token: 'ab'.repeat(32) }, intake_token: 'ab'.repeat(32) };
  const Pi = loadPortal(portal, info); Pi.ctx.screenPortal();
  const out = Pi.els.app.innerHTML;
  ok(/📅/.test(out) && /20\/10\/2026 10:30/.test(out) && /مؤكد/.test(out) && /wa\.me\/963933123456\?text=/.test(out) && /01\/09\/2026/.test(out) && /مكتمل/.test(out), 'portal: appointments — numeric date+time, phone-confirmed reads مؤكد, WhatsApp change request, past under details');
  ok(/تاج زركون/.test(out) && /سن 25 · المرحلة 2/.test(out) && /×2/.test(out) && /1,000,000 ل\.س/.test(out) && /20 \$/.test(out) && /الإجمالي \(ل\.س\)/.test(out), 'portal: plan — items, phases, units, totals per currency');
  ok(/3,270,000/.test(out) && /− 70,000/.test(out) && /المتبقي عليك/.test(out) && /2,200,000/.test(out) && /قسط متأخر — استحقّ بتاريخ <b>01\/10\/2026/.test(out) && /1,000,000 ل\.س<\/span> من <span[^>]*>2,000,000/.test(out), 'portal: balance — completed · discount · owed · overdue installment');
  ok(/&lt;b&gt;اليوم&lt;\/b&gt;/.test(out) && /أموكسيسيلين/.test(out) && /500 · ×3 · 7 أيام/.test(out) && /intake\.html\?t=abab/.test(out), 'portal: notes escaped, prescriptions with items, pending intake link');
  const P2 = loadPortal(portal, Object.assign({}, info, { show: { appts: false, plan: true, balance: false, notes: false }, plan: { pending_options: true, items: [], totals: [] }, intake: { status: 'pending', token: 'zz' } })); P2.ctx.screenPortal();
  const out2 = P2.els.app.innerHTML;
  ok(!/📅|💰|📋|💊/.test(out2) && /بانتظار قرارك/.test(out2) && !/ل\.س|\$/.test(out2.replace(/📱/g, '')) && !/intake\.html/.test(out2), 'portal: closed switches hide their sections; pending options show no numbers; bad intake token ignored');
  const P3 = loadPortal(portal, Object.assign({}, info, { clinic_phone: null })); P3.ctx.screenPortal();
  ok(!/wa\.me/.test(P3.els.app.innerHTML), 'portal: no clinic phone ⇒ no WhatsApp buttons');
  const P7 = loadPortal(portal, Object.assign({}, info, { appts: { upcoming: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-20', time: '10:30', status: 'scheduled', confirmation: 'pending' }, { id: '22222222-2222-4222-8222-222222222222', date: '2026-10-21', time: '11:00', status: 'confirmed', confirmation: 'confirmed' }, { id: '33333333-3333-4333-8333-333333333333', date: '2026-10-22', time: '11:00', status: 'scheduled', confirmation: 'cancelled_by_pt' }], past: [{ date: '2026-09-01', time: '09:00', status: 'scheduled', confirmation: 'pending' }] } })); P7.ctx.screenPortal();
  const o7 = P7.els.app.innerHTML;
  ok((o7.match(/confirmAppt\(this, '/g) || []).length === 1 && /confirmAppt\(this, '11111111-1111-4111-8111-111111111111'\)/.test(o7) && /✓ تأكيد الموعد/.test(o7), 'portal: «تأكيد الموعد» only on the unconfirmed upcoming row — not on confirmed, cancelled-by-phone, or past rows');
  const P5 = loadPortal(portal, Object.assign({}, info, { intake: { status: 'submitted', submitted_at: '2026-10-05T07:30:00Z' } })); P5.ctx.screenPortal();
  const P6 = loadPortal(portal, Object.assign({}, info, { intake: null })); P6.ctx.screenPortal();
  ok(/استمارتك مستلمة/.test(P5.els.app.innerHTML) && !/intake\.html/.test(P5.els.app.innerHTML) && !/استمارة المريض/.test(P6.els.app.innerHTML), 'portal: submitted intake reads «مستلمة ✓» without a link; absent intake ⇒ no card');
  const P4 = loadPortal(portal, Object.assign({}, info, { appts: { upcoming: [{ date: '2026-10-20', time: '10:30', status: 'scheduled', confirmation: 'cancelled_by_pt' }, { date: '2026-10-21', time: '11:00', status: 'scheduled', confirmation: 'pending' }], past: [{ date: '2026-09-01', time: '09:00', status: 'scheduled', confirmation: 'pending' }] } })); P4.ctx.screenPortal();
  const o4 = P4.els.app.innerHTML;
  ok(/ملغى/.test(o4) && /بانتظار التأكيد/.test(o4) && /سابق/.test(o4) && (o4.match(/بانتظار التأكيد/g) || []).length === 1, 'portal: cancelled-by-phone reads ملغى; unconfirmed upcoming reads بانتظار التأكيد; a past never-closed appointment reads سابق, never بانتظار');
  ok(/window\.onbeforeprint = function\(\)\{ document\.querySelectorAll\('details'\)/.test(portal) && /@media print\{/.test(portal), 'portal: print/PDF opens folded lists and drops buttons (Dentally PDF parity)');
  ok(P.ctx.fmtYmd('2026-10-05') === '05/10/2026' && P.ctx.fmtN(1234567.891) === '1,234,567.89' && P.ctx.curLbl('USD') === '$' && P.ctx.curLbl('SYP') === 'ل.س', 'portal: numeric dates, grouped numbers, currency labels');
  /* (٦) التوصيل */
  ok(/<script src="pp-portal\.js\?v=[0-9a-z]+"><\/script>/.test(pph) && /id="portalRow"/.test(pph) && /id="iPortal"/.test(pph) && /if \(typeof ppPortalLoad === 'function'\) ppPortalLoad\(\);/.test(pph), 'wiring: patient card loads pp-portal.js, carries the row, calls ppPortalLoad');
  ok(pph.indexOf('pp-portal.js') > pph.indexOf('pp-intake.js') && pph.indexOf('id="portalRow"') > pph.indexOf('id="intakeRow"'), 'wiring: portal follows intake (script order + row order)');
  ok(/portal:\s*\{ l: 'بوابة المريض'/.test(ppwa), 'wiring: PP_MSG_KINDS carries portal');
  ok(/\[ "\$f" = "portal\.html" \] && continue/.test(cb) && /grep -q '\?v=' portal\.html/.test(cb) && /pp-portal\\\.js\)'/.test(cb), 'wiring: cache-bust excludes portal.html structurally and lists pp-portal.js as a numbered asset');
  ok(/'portal\.html'/.test(cc), 'wiring: check-colors skips the fixed-light public page');
  ok(/'pp-portal\.js'/.test(cmb), 'wiring: check-modal-behaviour reviews pp-portal.js with the patient card');
  ok(['ptShowAppts', 'ptShowPlan', 'ptShowBalance', 'ptShowNotes'].every(id => new RegExp('id="' + id + '" class="bk-switch"').test(stg)) && /onclick="savePortalSettings\(\)"/.test(stg) && /await loadPortalSettings\(\);/.test(stg), 'settings: four switches, save, load call');
  ok(/portal_show_balance: document\.getElementById\('ptShowBalance'\)\.checked/.test(stg) && /\.checked = row \? row\.portal_show_balance === true : false;/.test(stg), 'settings: balance switch defaults OFF and saves its column');
  ok(/\[onclick\*="savePortalSettings\("\]\)\{display:none !important;\}/.test(stg), 'settings: portal save hidden in read-only mode');
  ok(/id="fPortalTemplate"/.test(stg) && /whatsapp_portal_template: portalTemplate,/.test(stg) && /'whatsapp_intake_template', 'whatsapp_portal_template'\]/.test(stg) && /🔗 رسالة بوابة المريض\\n' \+ portal/.test(stg) && /pt\.value = DEFAULT_PORTAL_TEMPLATE/.test(stg), 'settings: seventh template saved · optional-column fallback · preview · reset');
  ok(/\.pp-intake-btn\.pp-portal-stop\{color:var\(--red\)/.test(ppcss) && /onclick\*="ppPortalRevoke\("/.test(ppcss) && /onclick\*="ppPortalSend\("/.test(ppcss), 'css: stop button red; portal write buttons hidden by the read-only line');
}


/* ═══ (٧) M187 · v628 — العلاجاتُ السابقة + الإلغاءُ وطلبُ التغيير من البوابة ═══
   المرآة (رسائل المريض بايت-بايت · المتغيّرات) · الهجرة (STABLE صفرُ كتابة · كلُّ قسمٍ خلف مفتاحه · المبالغُ مع الرصيد حصراً ·
   مهلةُ الخادم بتوقيت دمشق · المفتاح ⇒ disabled · ملكيةُ الموعد · تحديدُ المعدّل · لا تكرار · تنظيفُ النص · تحديثٌ واحد خلف direct ·
   سجلّا النشاط والمراسلات · RLS + الاشتراك + Realtime · مشغّلُ الإغلاق) · الرسم (vm: الأزرار بحسب المهلة/الطلب المفتوح/الإلغاء ·
   القالبُ مُهرَّب · اللوحة · التاريخ مجمّعاً) · التدفّق (vm: نجاحٌ مباشر/طلب/فات الوقت/الحدّ) · العيادة (الصندوق · الشارة · التوستُ يسمّي المريض). */
function loadPortalRpc(html, info, rpcImpl) {
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const els = { app: { innerHTML: '', insertAdjacentHTML(pos, h) { this.innerHTML = (pos === 'afterbegin' ? h + this.innerHTML : this.innerHTML + h); } } };
  const calls = [];
  const ctx = {
    window: { supabase: { createClient: () => ({ rpc: async (n, a) => { calls.push([n, a]); return n === 'portal_info' ? { data: null } : rpcImpl(n, a); } }) }, scrollTo() {} },
    document: { getElementById: id => els[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '' },
    location: { search: '' }, encodeURIComponent, Date, Array, Object, String, Number, Math, RegExp, JSON, Promise, console, setTimeout: () => 0, clearTimeout() {}
  };
  ctx.withTimeout = p => p;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  ctx.INFO = info; ctx.TOKEN = 'ab'.repeat(32);
  return { ctx, els, calls };
}
function suite187(S) {
  const { portal, stg, mig187, apo, apb, appts, side, audit } = S;
  /* المرآة */
  const dmS = constValue(stg, 'DEFAULT_PORTAL_MSGS'), dmP = constValue(portal, 'DEFAULT_PORTAL_MSGS');
  ok(JSON.stringify(dmS) === JSON.stringify(dmP) && ['cancelled', 'requested', 'too_late'].every(k => typeof dmP[k] === 'string' && dmP[k].length > 20), 'M187 mirror: patient messages — settings DEFAULT_PORTAL_MSGS = portal.html DEFAULT_PORTAL_MSGS (byte)');
  const PH = ['patient_first_name', 'clinic_name', 'clinic_phone', 'date', 'time', 'cutoff_hours'];
  ok(PH.every(k => stg.indexOf("insertPlaceholderInto(_ptMsgFocus,'{" + k + "}')") > -1) && /\(patient_first_name\|clinic_name\|clinic_phone\|date\|time\|cutoff_hours\)/.test(slice(portal, 'tplMsg'))
     && Object.values(dmP).every(t => (t.match(/\{([a-z_]+)\}/g) || []).every(x => PH.indexOf(x.slice(1, -1)) > -1)), 'M187 mirror: the six placeholders are settings pills, filled by tplMsg, and the defaults use no other');
  /* الهجرة — portal_info */
  const pi = fnBody(mig187).replace(/--[^\n]*/g, '');
  ok(/LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(fnBody(mig187)) && !/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|PERFORM\s|TRUNCATE)\b/i.test(pi), 'M187 portal_info: still STABLE with zero writes');
  ok(/IF cs\.show_history THEN/.test(pi) && /'cost', CASE WHEN cs\.show_balance THEN h\.cost END/.test(pi) && /'currency', CASE WHEN cs\.show_balance THEN/.test(pi) && /jsonb_strip_nulls/.test(pi), 'M187 history: behind its switch; amounts only with the balance switch (stripped otherwise)');
  ok(/COALESCE\(s\.status, 'completed'\) = 'completed'\s+AND COALESCE\(s\.date, \(s\.created_at AT TIME ZONE 'Asia\/Damascus'\)::date\) >= v_today - 730\s+ORDER BY 8 DESC, s\.created_at DESC LIMIT 60/.test(pi) && !/'notes', h\.|h\.notes|s\.notes/.test(pi.slice(pi.indexOf('IF cs.show_history'), pi.indexOf('IF cs.show_plan'))), 'M187 history: completed sessions only, 24 months, 60 rows, no internal notes');
  ok(/IF cs\.allow_changes AND cs\.show_appts THEN\s+v_out := v_out \|\| jsonb_build_object\('changes'/.test(pi) && /'changes', \(cs\.allow_changes AND cs\.show_appts\)/.test(pi) && /COALESCE\(c\.portal_allow_changes, false\)/.test(pi), 'M187 changes config: only when the clinic switched it on (and appointments are shown); absent ⇒ off');
  const CUT = "(a.date + COALESCE(a.time, '00:00'::time)) AT TIME ZONE 'Asia/Damascus'";
  ok(pi.indexOf("'can_change', ((" + CUT + ") - now()) >= make_interval(hours => cs.cutoff_hours)") > -1 && /r\.status = 'new' AND r\.applied = false/.test(pi), 'M187 upcoming: can_change by the server clock (Asia/Damascus) against the clinic cutoff; open_request = an open, not-applied request');
  ok(/portal_allow_changes BOOLEAN NOT NULL DEFAULT false/.test(mig187) && /portal_show_history  BOOLEAN NOT NULL DEFAULT true/.test(mig187) && /CHECK \(portal_cutoff_hours IN \(12, 24, 48, 72\)\)/.test(mig187) && /CHECK \(portal_cancel_mode IN \('direct', 'request'\)\)/.test(mig187), 'M187 settings: changes OFF by default · history ON · cutoff ∈ {12,24,48,72} · mode ∈ {direct,request}');
  /* الهجرة — portal_appt_change */
  const ac = (() => { const i = mig187.indexOf('CREATE OR REPLACE FUNCTION public.portal_appt_change'); return mig187.slice(i, mig187.indexOf('END; $$;', i)).replace(/--[^\n]*/g, ''); })();
  ok(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(ac) && !/STABLE/.test(ac) && /p_token !~ '\^\[0-9a-f\]\{64\}\$'/.test(ac) && /p_kind NOT IN \('cancel', 'change'\)/.test(ac) && /pp\.revoked_at IS NULL AND pp\.expires_at >= now\(\)/.test(ac) && /_intake_clinic_open\(v\.owner_id\)/.test(ac), 'M187 write: token shape · kind whitelist · live link · clinic gate chain');
  ok(/IF NOT FOUND OR cs\.allow_changes IS DISTINCT FROM true OR cs\.show_appts IS DISTINCT FROM true THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'disabled'\);/.test(ac), 'M187 write: the clinic switch is enforced on the server (a tampered page gets «disabled»)');
  ok(/x\.id = p_appt AND x\.doctor_id = v\.owner_id AND x\.patient_id = v\.patient_id AND x\.is_planned = false\s+FOR UPDATE;/.test(ac), 'M187 write: only this patient\'s own real appointment, row-locked (double taps serialise)');
  ok(ac.indexOf('v_start := ' + CUT + ';') > -1 && /IF v_start - now\(\) < make_interval\(hours => cs\.cutoff_hours\) THEN\s+RETURN jsonb_build_object\('ok', false, 'reason', 'too_late'/.test(ac), 'M187 write: the cutoff is re-checked on write with the same server-clock expression as the read');
  ok(/IF v_n >= 3 THEN RETURN jsonb_build_object\('ok', false, 'reason', 'rate_limited'\); END IF;/.test(ac) && /r\.created_at > now\(\) - interval '24 hours'/.test(ac) && /r\.patient_id = v\.patient_id/.test(ac), 'M187 write: rate limit — 3 actions per patient per 24 hours');
  ok(/'reason', 'already', 'applied', true/.test(ac) && /'reason', 'already', 'applied', false/.test(ac) && /CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_requests_open\s+ON public\.portal_requests \(appointment_id, kind\) WHERE status = 'new' AND applied = false;/.test(mig187), 'M187 write: idempotent (already cancelled / already requested) + a unique open request per appointment and kind');
  ok((ac.match(/regexp_replace\(COALESCE\(p_(reason|note), ''\), '\[\[:cntrl:\]\]\+', ' ', 'g'\)\), 300\)/g) || []).length === 2 && /p_pref IN \('any', 'morning', 'evening'\)/.test(ac), 'M187 write: free text stripped of control characters and capped at 300; preference whitelisted');
  ok((ac.match(/\bUPDATE public\./g) || []).length === 1 && /IF v_direct THEN\s+UPDATE public\.appointments\s+SET status = 'cancelled',\s+confirmation_status = 'cancelled_by_pt',/.test(ac) && /v_direct := \(p_kind = 'cancel' AND cs\.cancel_mode = 'direct'\);/.test(ac), 'M187 write: the one appointment update is the direct cancel, with exactly the clinic\'s own status pair');
  ok(/INSERT INTO public\.portal_requests/.test(ac) && /INSERT INTO public\.audit_log/.test(ac) && /INSERT INTO public\.patient_messages \(owner_id, patient_id, kind, channel, body, sent_by\)\s+VALUES \(v\.owner_id, v\.patient_id, 'portal', 'portal'/.test(ac) && /'appointment\.portal_request'/.test(ac), 'M187 write: request row + activity log + المراسلات (channel portal)');
  ok(/GRANT EXECUTE ON FUNCTION public\.portal_appt_change\(text, uuid, text, text, text, text\) TO anon, authenticated;/.test(mig187) && /REVOKE ALL ON FUNCTION public\.portal_appt_change\(text, uuid, text, text, text, text\) FROM PUBLIC;/.test(mig187), 'M187 write: revoked from PUBLIC, granted to anon');
  ok(/ALTER TABLE public\.portal_requests ENABLE ROW LEVEL SECURITY;/.test(mig187) && /_sub_guard_table\('public\.portal_requests'\)/.test(mig187) && /ALTER PUBLICATION supabase_realtime ADD TABLE public\.portal_requests;/.test(mig187) && !/CREATE POLICY[^;]*anon/i.test(mig187), 'M187 table: owner RLS + subscription gate + realtime, no anon policy');
  ok(/AFTER UPDATE OF date, time, status ON public\.appointments/.test(mig187) && /WHERE appointment_id = NEW\.id AND owner_id = NEW\.doctor_id AND status = 'new' AND applied = false;/.test(mig187) && /'whatsapp_link','copy','print','portal'/.test(mig187), 'M187: the clinic moving/cancelling closes open requests · المراسلات accepts the portal channel');
  /* الرسم */
  const fut = { id: '11111111-1111-4111-8111-111111111111', date: '2026-10-30', time: '10:30', status: 'confirmed', confirmation: 'confirmed', can_change: true };
  const late = { id: '22222222-2222-4222-8222-222222222222', date: '2026-10-14', time: '09:00', status: 'scheduled', confirmation: 'pending', can_change: false };
  const open = { id: '33333333-3333-4333-8333-333333333333', date: '2026-11-02', time: '12:00', status: 'scheduled', confirmation: 'pending', can_change: true, open_request: 'change' };
  const gone = { id: '44444444-4444-4444-8444-444444444444', date: '2026-11-03', time: '12:00', status: 'scheduled', confirmation: 'cancelled_by_pt', can_change: true };
  const base = { status: 'ok', clinic_name: 'عيادة <الأمل>', clinic_phone: '0933123456', patient_name: 'سامر خالد', expires_at: '2026-11-11T00:00:00Z',
    show: { appts: true, plan: false, balance: false, notes: false, history: true, changes: true },
    changes: { mode: 'direct', cutoff_hours: 48, tpl: { cancelled: null, requested: null, too_late: null } },
    appts: { upcoming: [fut, late, open, gone], past: [] },
    history: { items: [{ date: '2026-09-01', type: 'حشوة', tooth: '16', doctor: 'د. أيهم' }, { date: '2026-09-01', type: 'تنظيف', units: 2 }, { date: '2026-05-01', type: 'تاج', cost: 900000, currency: 'SYP' }], more: true } };
  const R = loadPortalRpc(portal, JSON.parse(JSON.stringify(base)), async () => ({ data: {} }));
  R.ctx.screenPortal(); const o = R.els.app.innerHTML;
  ok((o.match(/openChange\('11111111[^']*', 'cancel'\)/g) || []).length === 1 && (o.match(/openChange\('11111111[^']*', 'change'\)/g) || []).length === 1, 'M187 render: a changeable appointment offers «إلغاء» and «طلب تغيير»');
  ok(!/openChange\('2222/.test(o) && /قبل أقل من 48 ساعة/.test(o) && /href="tel:0933123456"/.test(o) && /عيادة &lt;الأمل&gt;/.test(o) && !/عيادة <الأمل>/.test(o), 'M187 render: past the cutoff ⇒ the too-late message (cutoff filled, clinic name escaped) + phone, no buttons');
  ok(!/openChange\('3333/.test(o) && /طلب تغيير هذا الموعد قيد المراجعة/.test(o) && !/openChange\('4444/.test(o) && !/wa\.me[^"]*أرغب بتعديل موعدي يوم 03\/11/.test(decodeURIComponent(o.replace(/&amp;/g, '&'))), 'M187 render: an open request reads «قيد المراجعة» without buttons; a cancelled appointment offers nothing');
  ok(/🗂️/.test(o) && /علاجاتك السابقة/.test(o) && (o.match(/class="hist-day"/g) || []).length === 2 && /سن 16 · د\. أيهم/.test(o) && /×2/.test(o) && /900,000/.test(o) && /آخر سنتين/.test(o), 'M187 render: history grouped by visit day · tooth · doctor · units · the amount only when the server sent it · «older» note');
  const R2 = loadPortalRpc(portal, Object.assign(JSON.parse(JSON.stringify(base)), { show: { appts: true, history: false, changes: false }, changes: undefined }), async () => ({ data: {} }));
  R2.ctx.screenPortal(); const o2 = R2.els.app.innerHTML;
  ok(!/openChange\(/.test(o2) && !/علاجاتك السابقة/.test(o2) && /طلب تعديل الموعد/.test(o2), 'M187 render: switches off ⇒ no cancel/change buttons, no history, the WhatsApp request link as before');
  const R3 = loadPortalRpc(portal, Object.assign(JSON.parse(JSON.stringify(base)), { changes: { mode: 'direct', cutoff_hours: 24, tpl: { too_late: 'تأخّرت يا {patient_first_name} <b>' } } }), async () => ({ data: {} }));
  R3.ctx.screenPortal();
  ok(/تأخّرت يا سامر &lt;b&gt;/.test(R3.els.app.innerHTML), 'M187 render: a clinic template wins, its placeholders are filled and its text is escaped');
  R.ctx.OPEN_CHG = { id: fut.id, kind: 'cancel' }; R.ctx.screenPortal(); const op = R.els.app.innerHTML;
  ok(/id="chgPanel"/.test(op) && /تأكيد الإلغاء/.test(op) && /يُلغى الموعد فوراً/.test(op) && (op.match(/class="chip"/g) || []).length === 5 && /maxlength="300"/.test(op), 'M187 panel: cancel — five reasons, 300-char text, «تأكيد الإلغاء» in direct mode');
  R.ctx.INFO.changes.mode = 'request'; R.ctx.screenPortal();
  ok(/إرسال طلب الإلغاء/.test(R.els.app.innerHTML) && /يصل طلب الإلغاء للعيادة/.test(R.els.app.innerHTML), 'M187 panel: request mode says the clinic decides');
  return (async () => {
    /* التدفّق */
    const run = async (resp, kind) => {
      const F = loadPortalRpc(portal, JSON.parse(JSON.stringify(base)), async () => ({ data: resp }));
      await F.ctx.submitChange(null, fut.id, kind);
      return F;
    };
    let F = await run({ ok: true, applied: true, kind: 'cancel' }, 'cancel');
    const a1 = F.ctx.INFO.appts.upcoming[0];
    ok(a1.status === 'cancelled' && a1.confirmation === 'cancelled_by_pt' && /تم إلغاء موعدك يوم 30\/10\/2026 الساعة 10:30/.test(F.els.app.innerHTML) && F.calls[0][0] === 'portal_appt_change' && F.calls[0][1].p_kind === 'cancel' && F.calls[0][1].p_pref === null, 'M187 flow: direct cancel ⇒ the card reads cancelled and the patient sees the «cancelled» message (date/time filled)');
    F = await run({ ok: true, applied: false, kind: 'change' }, 'change');
    ok(F.ctx.INFO.appts.upcoming[0].open_request === 'change' && /وصل طلبك إلى عيادة &lt;الأمل&gt;/.test(F.els.app.innerHTML), 'M187 flow: a request ⇒ «قيد المراجعة» and the «requested» message');
    F = await run({ ok: false, reason: 'too_late', cutoff_hours: 48 }, 'cancel');
    ok(F.ctx.INFO.appts.upcoming[0].can_change === false && /قبل أقل من 48 ساعة/.test(F.els.app.innerHTML), 'M187 flow: the server says too late ⇒ the card flips and the too-late message shows');
    F = await run({ ok: false, reason: 'rate_limited' }, 'change');
    ok(/الحدّ اليومي/.test(F.els.app.innerHTML) && !F.ctx.INFO.appts.upcoming[0].open_request, 'M187 flow: rate limited ⇒ said plainly, nothing marked');
    F = await run({ ok: false, reason: 'disabled' }, 'cancel');
    ok(F.ctx.INFO.show.changes === false && !/openChange\(/.test(F.els.app.innerHTML), 'M187 flow: switched off meanwhile ⇒ the buttons disappear');
    /* العيادة */
    const C = { escapeHtml: x => String(x == null ? '' : x).replace(/</g, '&lt;'), bookingFmtDate: d => d, bookingAgo: () => 'قبل دقيقة', fmtTime12: t => t, avatarColor: () => '#000', initials: n => n.slice(0, 1), encodeURIComponent, Array, String, Object };
    vm.createContext(C);
    vm.runInContext(apo + '\nportalRequests = [{ id: "r1", patient_id: "p1", appointment_id: "a1", kind: "cancel", applied: true, status: "new", reason: "سفر", appt_date: "2026-10-30", appt_time: "10:30:00", patient_name_snapshot: "خالد الأحمد", created_at: "2026-10-13T08:00:00Z" },'
      + '{ id: "r2", patient_id: "p2", appointment_id: "a2", kind: "change", applied: false, status: "new", preference: "morning", note: "بعد الخامسة", appt_date: "2026-10-31", appt_time: "11:00:00", patient_name_snapshot: "ليلى", created_at: "2026-10-13T08:00:00Z" },'
      + '{ id: "r3", patient_id: "p3", kind: "change", applied: false, status: "handled", patient_name_snapshot: "سامر", created_at: "2026-10-12T08:00:00Z" }];', C);
    const blk = C.portalReqBlock();
    ok(C.portalReqNewCount() === 2 && /خالد الأحمد/.test(C.portalReqNamesTitle()) && /ليلى/.test(C.portalReqNamesTitle()) && /خالد الأحمد <span[^>]*>✕ ألغى موعده من البوابة/.test(blk) && /ليلى <span[^>]*>🔁 يطلب تغيير موعده/.test(blk) && /يفضّل: صباحاً/.test(blk) && /سجلّ طلبات البوابة \(1\)/.test(blk), 'M187 clinic: the inbox names each patient with what he did; the badge tooltip names them; handled ones go to the history');
    ok((blk.match(/data-sub-write/g) || []).length === 3 && !/portalReqSet\('r1', 'dismissed'\)/.test(blk) && /portalReqSet\('r2', 'dismissed'\)/.test(blk) && /portalReqOpenAppt\('r2'\)/.test(blk) && !/portalReqOpenAppt\('r1'\)/.test(blk), 'M187 clinic: actions hidden in read-only mode; an applied cancel cannot be «ignored» nor re-opened, a request can');
    ok(/n \+= \(typeof portalReqNewCount === 'function'\) \? portalReqNewCount\(\) : 0;/.test(apb) && /var html = \(\(typeof portalReqBlock === 'function'\) \? portalReqBlock\(\) : ''\) \+/.test(apb) && /<script src="appt-portal\.js\?v=[0-9a-z]+"><\/script>/.test(appts) && /'booking_requests', 'portal_requests'\], refresh: apptLiveRefresh/.test(appts) && (appts.match(/loadPortalRequests\(\)/g) || []).length >= 2, 'M187 clinic: badge counts portal requests, the block leads the requests view, the page loads/live-refreshes them');
    const SB = { window: { SyDT: { numDate: d => d.split('-').reverse().join('/') } }, String };
    vm.createContext(SB); vm.runInContext(slice(side, 'sbPortalToastText') + '\nvar PORTAL_REQ_PREF = { any: "أي وقت", morning: "صباحاً", evening: "مساءً" };', SB);
    const t1 = SB.sbPortalToastText({ kind: 'cancel', applied: true, patient_name_snapshot: 'خالد الأحمد', appt_date: '2026-10-30', appt_time: '10:30:00', reason: 'سفر' });
    const t2 = SB.sbPortalToastText({ kind: 'cancel', applied: false, patient_name_snapshot: 'منى', appt_date: '2026-10-30' });
    const t3 = SB.sbPortalToastText({ kind: 'change', applied: false, patient_name_snapshot: 'ليلى', appt_date: '2026-10-31', appt_time: '11:00:00', preference: 'evening' });
    ok(/خالد الأحمد ألغى موعده 30\/10\/2026 10:30 من البوابة — السبب: سفر/.test(t1) && /منى يطلب إلغاء موعده/.test(t2) && /ليلى يطلب تغيير موعده 31\/10\/2026 11:00 — يفضّل مساءً/.test(t3), 'M187 alert: the live toast names the patient, the appointment and what he did (all three kinds)');
    ok(/event: 'INSERT', schema: 'public', table: 'portal_requests', filter: 'owner_id=eq\.' \+ uid/.test(side) && /window\.showToast\(sbPortalToastText\(row\), false, 8000\)/.test(side) && /\(typeof ms === 'number' && ms > 0\) \? ms : 2600/.test(side) && /try \{ sbPortalSubscribe\(uid\); \} catch/.test(side) && /rb\.title = portalNames\.length/.test(side), 'M187 alert: one live subscription per page (own clinic) and the sidebar badge tooltip names the patients');
    const toasts = [];
    const IT = { window: { sb: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'هبة الشامي' }, error: null }) }) }) }) }) }, showToast: m => toasts.push(m) }, Promise };
    vm.createContext(IT); vm.runInContext(slice(side, 'sbIntakeToast'), IT);
    await IT.sbIntakeToast({ patient_id: 'p', owner_id: 'o', status: 'submitted' });
    ok(/sbIntakeToast\(row\);/.test(side) && toasts.length === 1 && toasts[0] === '📝 وصلت استمارة هبة الشامي — افتح بطاقته لمراجعتها' && /\.eq\('id', row\.patient_id\)\.eq\('doctor_id', row\.owner_id\)/.test(slice(side, 'sbIntakeToast')), 'v628: the intake toast names the patient (own clinic only)');
    ok(/'appointment\.portal_request'\]/.test(audit) && /portal_request:'طلب من البوابة —'/.test(audit), 'M187: the activity log files portal requests under «موعد» with their own label');
    /* v629 — مراجعةُ البند ②: M188 + تلميحُ بطاقة المريض */
    ok(/REVOKE ALL ON FUNCTION public\._portal_requests_close\(\) FROM anon, authenticated, public;/.test(S.mig188) && /CREATE INDEX IF NOT EXISTS idx_portal_requests_patient ON public\.portal_requests \(patient_id\);/.test(S.mig188) && /CREATE INDEX IF NOT EXISTS idx_portal_requests_appt    ON public\.portal_requests \(appointment_id\);/.test(S.mig188), 'v629 M188: the trigger function is not callable by anon/authenticated · both FKs indexed (patient delete / appointment delete never scan)');
    const H1 = loadPP(S.pp, { rows: [] }).ctx.ppPortalShowsText(), H2 = loadPP(S.pp, { rows: [], cs: { portal_allow_changes: true } }).ctx.ppPortalShowsText(), H3 = loadPP(S.pp, { rows: [], cs: { portal_allow_changes: true, portal_show_appts: false, portal_show_history: false } }).ctx.ppPortalShowsText();
    ok(/العلاجات السابقة/.test(H1) && !/إلغاء موعده/.test(H1) && /ويستطيع إلغاء موعده أو طلب تغييره/.test(H2) && !/العلاجات السابقة|إلغاء موعده/.test(H3), 'v629: the patient-card hint tells the doctor what the patient sees — history, and whether he can cancel/request (only with appointments shown)');
    /* الإعدادات */
    ok(['ptShowHistory', 'ptAllowChanges'].every(id => new RegExp('id="' + id + '" class="bk-switch"').test(stg)) && /portal_allow_changes: document\.getElementById\('ptAllowChanges'\)\.checked,/.test(stg) && /\.checked = row \? row\.portal_allow_changes === true : false;/.test(stg) && /\.checked  = row \? row\.portal_show_history !== false : true;/.test(stg), 'M187 settings: history switch (on) · changes switch (off by default) saved to their columns');
    ok(/return \(!v \|\| v === DEFAULT_PORTAL_MSGS\[key\]\) \? null : v;/.test(stg) && ['portal_msg_cancelled: portalMsgVal(\'ptMsgCancelled\', \'cancelled\')', 'portal_msg_requested: portalMsgVal(\'ptMsgRequested\', \'requested\')', 'portal_msg_too_late:  portalMsgVal(\'ptMsgTooLate\', \'too_late\')'].every(x => stg.indexOf(x) > -1), 'M187 settings: three templates saved; equal-to-default stored as NULL (a later default fix reaches every clinic)');
  })();
}

/* ═══ (٨) M189 · v630 — المريض يختار وقتاً متاحاً حقيقياً والطبيب يعتمده ═══ */
async function suite189(S) {
  const { portal, mig189, apo, appts, side, stg, theme, cra } = S;
  const fs = (() => { const i = mig189.indexOf('CREATE OR REPLACE FUNCTION public._portal_free_slots'); return mig189.slice(i, mig189.indexOf('$$;', mig189.indexOf('AS $$', i) + 5)); })();
  const ps = (() => { const i = mig189.indexOf('CREATE OR REPLACE FUNCTION public.portal_slots'); return mig189.slice(i, mig189.indexOf('END; $$;', i)).replace(/--[^\n]*/g, ''); })();
  const ac = (() => { const i = mig189.indexOf('CREATE OR REPLACE FUNCTION public.portal_appt_change'); return mig189.slice(i, mig189.indexOf('END; $$;', i)).replace(/--[^\n]*/g, ''); })();
  ok(/REVOKE ALL ON FUNCTION public\._portal_free_slots\(uuid, uuid, int, date, date\) FROM anon, authenticated, public;/.test(mig189) && !/GRANT[^;]*_portal_free_slots/.test(mig189), 'M189: the slot engine is internal — not callable by anon/authenticated');
  ok(/FROM public\.booking_clinic_info\(p_owner\)/.test(fs) && /btrim\(x\) ~ '\^\[0-6\]\$'/.test(fs) && /s\.t::interval \+ make_interval\(mins => p_dur\) <= i\.work_end::interval/.test(fs) && /> now\(\) \+ interval '2 hours'/.test(fs), 'M189 slots: the clinic\'s online-booking hours · malformed work days ignored · the appointment\'s own duration must end by closing time · ≥2h ahead');
  ok(/a\.doctor_id = p_owner AND a\.id <> p_appt AND a\.is_planned IS NOT TRUE/.test(fs) && /NOT IN \('cancelled', 'broken', 'no_show'\)/.test(fs) && /br\.status = 'pending'/.test(fs) && /r\.status = 'new' AND r\.applied = false AND r\.kind = 'change'/.test(fs) && /r\.appointment_id IS DISTINCT FROM p_appt/.test(fs) && /booking_blocked_slots\(p_owner, p_from, p_to\)/.test(fs), 'M189 slots: busy = other live appointments · pending bookings · OTHER patients\' open slot requests · schedule blocks (his own appointment frees its slot)');
  ok(/b\.t::interval < f\.t::interval \+ make_interval\(mins => p_dur\)\s+AND f\.t::interval < b\.t::interval \+ make_interval\(mins => b\.dur\)/.test(fs) && /c\.id = p_appt AND c\.date = f\.d AND c\.time = f\.t/.test(fs), 'M189 slots: true interval overlap; the current slot itself is not offered');
  ok(/LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(mig189.slice(mig189.indexOf('public.portal_slots'))) && !/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i.test(ps) && /'reason', 'disabled'/.test(ps) && /'reason', 'too_late'/.test(ps) && /x\.patient_id = v\.patient_id/.test(ps) && !/patient_name|p\.name/.test(ps.slice(ps.indexOf('_portal_free_slots'))), 'M189 portal_slots: STABLE read · same gates (switch · own appointment · cutoff) · times only, no names');
  ok(/DROP FUNCTION IF EXISTS public\.portal_appt_change\(text, uuid, text, text, text, text\);/.test(mig189) && /GRANT EXECUTE ON FUNCTION public\.portal_appt_change\(text, uuid, text, text, text, text, date, time\) TO anon, authenticated;/.test(mig189) && /p_date DATE DEFAULT NULL, p_time TIME DEFAULT NULL/.test(ac), 'M189 write: one function (old signature dropped, defaults keep old callers working)');
  ok(/IF \(p_date IS NULL\) <> \(p_time IS NULL\) THEN RETURN jsonb_build_object\('ok', false, 'reason', 'unavailable'\);/.test(ac) && /PERFORM pg_advisory_xact_lock\(hashtext\('portal-slot:' \|\| v\.owner_id::text \|\| ':' \|\| p_date::text\)\);\s+IF NOT EXISTS \(SELECT 1 FROM public\._portal_free_slots\(v\.owner_id, a\.id,/.test(ac) && /'reason', 'slot_taken'/.test(ac), 'M189 write: the chosen slot is re-validated against live free slots under a per-clinic-and-day lock (two patients cannot both get one slot)');
  ok(/v_pref   := CASE WHEN p_kind = 'change' AND p_date IS NULL AND p_pref IN/.test(ac) && /WHEN 'any' THEN 'أي وقت' END, ''\)/.test(ac) && !/ELSE 'أي وقت'/.test(ac) && /' — يطلب نقله إلى '/.test(ac) && /requested_date, requested_time\)/.test(ac), 'M189 write: stored slot · «يطلب نقله إلى» in the logs · no phantom «يفضّل: أي وقت» (was the M187 ELSE on NULL)');
  ok(/'open_request_at', \(SELECT to_char\(r\.requested_date, 'YYYY-MM-DD'\)/.test(mig189) && /'slots', EXISTS \(SELECT 1 FROM public\.booking_clinic_info\(v\.owner_id\)\)/.test(mig189), 'M189 portal_info: the asked slot is shown back · the picker is offered only with booking hours');
  /* البوابة */
  const up = { id: '11111111-1111-4111-8111-111111111111', date: '2026-10-30', time: '10:30', status: 'confirmed', confirmation: 'confirmed', can_change: true };
  const info = { status: 'ok', clinic_name: 'عيادة', clinic_phone: '0933123456', patient_name: 'سامر', show: { appts: true, changes: true }, changes: { mode: 'direct', cutoff_hours: 24, slots: true, tpl: {} }, appts: { upcoming: [up], past: [] } };
  const days = [{ d: '2026-10-29', times: ['09:00', '09:30'] }, { d: '2026-10-31', times: ['11:00', '11:30', '12:00'] }];
  let resp = { ok: true, applied: false, kind: 'change' };
  const R = loadPortalRpc(portal, JSON.parse(JSON.stringify(info)), async n => n === 'portal_slots' ? { data: { ok: true, dur: 30, days } } : { data: resp });
  R.ctx.openChange(up.id, 'change'); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  let o = R.els.app.innerHTML;
  ok(R.calls.some(c => c[0] === 'portal_slots') && /الخميس<small>29\/10<\/small>/.test(o) && /السبت<small>31\/10<\/small>/.test(o) && /pickTime\('09:30'\)/.test(o) && !/pickTime\('11:00'\)/.test(o) && /id="chgGo" disabled/.test(o) && !/id="chgChips"/.test(o), 'M189 picker: day strip (Arabic day + date), the first day\'s free times, send disabled until a time is chosen, no morning/evening chips');
  R.ctx.pickDay('2026-10-31'); R.ctx.pickTime('11:30'); o = R.els.app.innerHTML;
  ok(/pickTime\('11:00'\)/.test(o) && /✓ السبت 31\/10 الساعة 11:30/.test(o) && !/id="chgGo" disabled/.test(o), 'M189 picker: choosing a day shows its times; choosing a time names it and enables send');
  await R.ctx.submitChange(null, up.id, 'change');
  const call = R.calls.filter(c => c[0] === 'portal_appt_change').pop();
  ok(call && call[1].p_date === '2026-10-31' && call[1].p_time === '11:30' && call[1].p_pref === null && /طلب نقل موعدك إلى السبت 31\/10 الساعة 11:30 قيد المراجعة/.test(R.els.app.innerHTML), 'M189 flow: the slot is sent (no preference), and the card reads «طلب نقل موعدك إلى … قيد المراجعة»');
  resp = { ok: false, reason: 'slot_taken' };
  const R2 = loadPortalRpc(portal, JSON.parse(JSON.stringify(info)), async n => n === 'portal_slots' ? { data: { ok: true, dur: 30, days } } : { data: resp });
  R2.ctx.openChange(up.id, 'change'); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  R2.ctx.pickDay('2026-10-31'); R2.ctx.pickTime('11:30');
  const before = R2.calls.filter(c => c[0] === 'portal_slots').length;
  await R2.ctx.submitChange(null, up.id, 'change');
  ok(R2.calls.filter(c => c[0] === 'portal_slots').length === before + 1 && /لم يعد متاحاً/.test(R2.els.app.innerHTML) && /id="chgPanel"/.test(R2.els.app.innerHTML) && R2.ctx.OPEN_CHG.time === null, 'M189 flow: slot taken meanwhile ⇒ fresh slots, the panel stays open, the choice is cleared, said plainly');
  const R3 = loadPortalRpc(portal, JSON.parse(JSON.stringify(info)), async n => n === 'portal_slots' ? { data: { ok: true, days: [] } } : { data: resp });
  R3.ctx.openChange(up.id, 'change'); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  ok(/id="chgChips"/.test(R3.els.app.innerHTML) && /صباحاً/.test(R3.els.app.innerHTML) && !/id="chgGo" disabled/.test(R3.els.app.innerHTML), 'M189 fallback: no free slots / no booking hours ⇒ morning/evening as before');
  /* العيادة */
  ok(constValue(stg, 'DEFAULT_PORTAL_MOVED_TPL') === constValue(apo, 'PORTAL_MOVED_TPL') && /portal_msg_moved:     \(function \(\) \{ var v = String\(document\.getElementById\('ptMsgMoved'\)\.value \|\| ''\)\.trim\(\)\.slice\(0, 1000\); return \(!v \|\| v === DEFAULT_PORTAL_MOVED_TPL\) \? null : v; \}\)\(\),/.test(stg), 'M189 mirror: the WhatsApp confirmation template — settings = appt-portal.js (byte); equal-to-default stored NULL');
  const C = { escapeHtml: x => String(x == null ? '' : x).replace(/</g, '&lt;'), bookingFmtDate: d => d, bookingAgo: () => 'قبل دقيقة', fmtTime12: t => t, avatarColor: () => '#000', initials: n => n.slice(0, 1), encodeURIComponent, Array, String, Object };
  vm.createContext(C);
  vm.runInContext(apo + '\nportalRequests = [{ id: "r1", patient_id: "p1", appointment_id: "a1", kind: "change", applied: false, status: "new", requested_date: "2026-10-31", requested_time: "11:30:00", appt_date: "2026-10-30", appt_time: "10:30:00", patient_name_snapshot: "خالد", created_at: "2026-10-13T08:00:00Z" },'
    + '{ id: "r2", patient_id: "p2", appointment_id: "a2", kind: "change", applied: false, status: "new", preference: "morning", patient_name_snapshot: "ليلى", created_at: "2026-10-13T08:00:00Z" }];'
    + '\nvar CLINIC_SETTINGS_WA = { clinic_name: "عيادة الأمل", portal_msg_moved: null };', C);
  const blk = C.portalReqBlock();
  ok(/➜ يطلب: 2026-10-31 · 11:30/.test(blk) && /portalReqApprove\('r1'\)">✅ اعتماد الوقت المطلوب/.test(blk) && !/portalReqOpenAppt\('r1'\)/.test(blk) && /portalReqOpenAppt\('r2'\)/.test(blk) && !/portalReqApprove\('r2'\)/.test(blk), 'M189 clinic: a picked slot is shown and approved in one primary action; a request without a slot keeps «فتح الموعد»');
  ok(C.portalMovedMsg({ name: 'خالد الأحمد' }, '2026-10-31', '11:30:00') === 'مرحباً خالد 🌟 تم نقل موعدك في عيادة الأمل إلى يوم 2026-10-31 الساعة 11:30 كما طلبت ✓ — نتطلع لرؤيتك 🦷', 'M189 clinic: the WhatsApp confirmation fills name · clinic · new date/time');
  ok(/if \(ctx\.origDate === saved\.date && ctx\.origTime === String\(saved\.time\)\.slice\(0, 5\)\) return;/.test(apo) && /origDate: a\.date, origTime: String\(a\.time \|\| ''\)\.slice\(0, 5\)/.test(apo) && /window\._portalApproveCtx\.apptId === editingId && typeof portalApproveSaved === 'function'\) \{\s+portalApproveSaved\(window\._portalApproveCtx, apptData\);\s+\}\s+closeModal\(\);/.test(appts) && /window\._rebookCtx = null; window\._portalApproveCtx = null;/.test(appts), 'M189 clinic: the confirmation appears only when the save really moved it (compared with the slot captured before saving), and the context dies with the modal');
  ok(/\.insert\(\{ owner_id: currentUser\.id, patient_id: L\.patientId, kind: 'portal', channel: 'whatsapp_link',/.test(apo) && /\.eq\('id', o\.patientId\)\.eq\('doctor_id', currentUser\.id\)/.test(apo), 'M189 clinic: the sent confirmation is logged in المراسلات; the phone is read from this clinic\'s own patient');
  const SB = { window: { SyDT: { numDate: d => d.split('-').reverse().join('/') } }, String };
  vm.createContext(SB); vm.runInContext(slice(side, 'sbPortalToastText') + '\nvar PORTAL_REQ_PREF = {};', SB);
  ok(/خالد يطلب نقل موعده 30\/10\/2026 10:30 إلى 31\/10\/2026 11:30 — من البوابة/.test(SB.sbPortalToastText({ kind: 'change', applied: false, patient_name_snapshot: 'خالد', appt_date: '2026-10-30', appt_time: '10:30:00', requested_date: '2026-10-31', requested_time: '11:30:00' })), 'M189 alert: the live toast names the patient, his appointment and the slot he wants');
  ok(/\.pt-moved-wa\{[^}]*background:var\(--green2\);color:var\(--bg\);/.test(S.apcss), 'M189: the WhatsApp confirmation button keeps ≥4.5:1 in both themes with theme tokens (--green2/--bg — not the 2:1 dark --wa)');
  ok(/portalReqApprove\\\(/.test(cra), 'M189: «اعتماد الوقت المطلوب» is a declared primary row action');
  ok(/:root\[data-theme="light"\] nav:not\(\[class\]\),\n:root\[data-theme="light"\] nav\.sb-nav \{/.test(theme) && !/:root\[data-theme="light"\] nav \{/.test(theme), 'v630: the landing-navbar light rule no longer turns the sticky settings/admin tab bars translucent');
}

/* ═══ (٩) M190 · v632 — «اعتماد الإلغاء» يلغي الموعد فعلاً ═══ */
async function suite190(S) {
  const { mig190, apo, stg } = S;
  const f = mig190.slice(mig190.indexOf('CREATE OR REPLACE FUNCTION public.portal_request_cancel_approve'), mig190.indexOf('END; $$;')).replace(/--[^\n]*/g, '');
  ok(/LANGUAGE plpgsql SECURITY INVOKER SET search_path = public/.test(f) && /GRANT EXECUTE ON FUNCTION public\.portal_request_cancel_approve\(uuid\) TO authenticated;/.test(mig190) && /REVOKE ALL ON FUNCTION public\.portal_request_cancel_approve\(uuid\) FROM anon, public;/.test(mig190), 'M190: runs as the clinic user (its RLS + subscription gate apply), never anon');
  ok(/WHERE id = p_req AND owner_id = auth\.uid\(\) FOR UPDATE;/.test(f) && /IF r\.kind <> 'cancel' OR r\.applied THEN/.test(f) && /IF r\.status <> 'new' THEN RETURN jsonb_build_object\('ok', false, 'reason', 'already_closed'/.test(f) && /WHERE id = r\.appointment_id AND doctor_id = auth\.uid\(\) FOR UPDATE;/.test(f), 'M190: only this clinic\'s open, not-applied cancel request; its own appointment, row-locked');
  ok(/SET status = 'cancelled',\s+confirmation_status = 'cancelled_by_pt',/.test(f) && /'\[أُلغي بطلب المريض من البوابة'/.test(f) && /UPDATE public\.portal_requests SET status = 'handled'/.test(f) && /IN \('cancelled', 'completed', 'broken', 'no_show'\)/.test(f), 'M190: cancels with the clinic\'s own status pair, tags the note, closes the request; a dead appointment is not touched');
  ok(constValue(stg, 'DEFAULT_PORTAL_CANCEL_OK_TPL') === constValue(apo, 'PORTAL_CANCEL_OK_TPL') && /portal_msg_cancel_ok: \(function \(\) \{ var v = String\(document\.getElementById\('ptMsgCancelOk'\)\.value \|\| ''\)\.trim\(\)\.slice\(0, 1000\); return \(!v \|\| v === DEFAULT_PORTAL_CANCEL_OK_TPL\) \? null : v; \}\)\(\),/.test(stg), 'M190 mirror: the cancel-approved WhatsApp template — settings = appt-portal.js (byte); default stored NULL');
  const C = { escapeHtml: x => String(x == null ? '' : x).replace(/</g, '&lt;'), bookingFmtDate: d => d, bookingAgo: () => 'قبل دقيقة', fmtTime12: t => t, avatarColor: () => '#000', initials: n => n.slice(0, 1), encodeURIComponent, Array, String, Object };
  vm.createContext(C);
  vm.runInContext(apo + '\nportalRequests = [{ id: "c1", patient_id: "p1", appointment_id: "a1", kind: "cancel", applied: false, status: "new", reason: "سفر", patient_name_snapshot: "يحيى", created_at: "2026-10-13T08:00:00Z" },'
    + '{ id: "c2", patient_id: "p2", appointment_id: "a2", kind: "cancel", applied: true, status: "new", patient_name_snapshot: "منى", created_at: "2026-10-13T08:00:00Z" },'
    + '{ id: "c3", patient_id: "p3", appointment_id: "a3", kind: "cancel", applied: false, status: "handled", patient_name_snapshot: "سامر", created_at: "2026-10-12T08:00:00Z" },'
    + '{ id: "c4", patient_id: "p4", appointment_id: "a4", kind: "cancel", applied: false, status: "dismissed", patient_name_snapshot: "ليلى", created_at: "2026-10-12T08:00:00Z" }];'
    + '\nvar CLINIC_SETTINGS_WA = { clinic_name: "عيادة الأمل" };', C);
  const blk = C.portalReqBlock();
  const card = id => { const i = blk.indexOf("'" + id + "'"); const st = blk.lastIndexOf('<div class="list-item', i); return blk.slice(st, blk.indexOf('</div></div>', i) + 12); };
  const c1 = card('c1'), c2 = card('c2');
  ok(/portalReqCancelApprove\('c1'\)">✅ اعتماد الإلغاء/.test(c1) && /portalReqSet\('c1', 'dismissed'\)">✖ رفض الطلب/.test(c1) && !/portalReqSet\('c1', 'handled'\)/.test(c1) && !/portalReqOpenAppt\('c1'\)/.test(c1), 'M190 inbox: a cancel REQUEST offers «✅ اعتماد الإلغاء» / «✖ رفض الطلب» — no ambiguous «✓ تمّ» that leaves the appointment standing');
  ok(/portalReqSet\('c2', 'handled'\)">✓ تمّ/.test(c2) && !/portalReqCancelApprove\('c2'\)/.test(c2) && !/portalReqSet\('c2', 'dismissed'\)/.test(c2), 'M190 inbox: an already-applied cancel keeps «✓ تمّ» (acknowledge) only');
  ok(/سامر <span[^>]*>[^<]*<\/span> <span class="list-badge status-confirmed">✓ أُلغي<\/span>/.test(blk) && /ليلى <span[^>]*>[^<]*<\/span> <span class="list-badge"[^>]*>رُفض<\/span>/.test(blk), 'M190 inbox history: approved cancel requests read «✓ أُلغي», rejected ones «رُفض»');
  ok(C.portalTplMsg('cancel_ok', { name: 'يحيى الترك', date: '2026-10-15', time: '14:00' }) === 'مرحباً يحيى — تم إلغاء موعدك في عيادة الأمل يوم 2026-10-15 الساعة 14:00 بناءً على طلبك ✓. لحجز موعدٍ جديد تواصل معنا متى شئت 🦷', 'M190: the WhatsApp confirmation fills name · clinic · date/time');
  ok(['portal', 'intake'].every(k => /<meta name="referrer" content="no-referrer">/.test(S[k])), 'v632: the two token pages send no Referer anywhere (defense-in-depth on top of the Sentry token scrub)');
  ok(/\.pt-moved-card\{position:fixed;bottom:calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(S.apcss), 'v632: the WhatsApp confirmation card sits above the toast lane (they overlapped — the toast hid its button)');
  const fn = slice(apo, 'portalReqCancelApprove');
  ok(/await SyDialog\.confirm\(\{ message: 'إلغاء موعد ' \+ \(r\.patient_name_snapshot \|\| 'المريض'\)/.test(fn) && /danger: true \}\)\) return;/.test(fn) && /window\.sb\.rpc\('portal_request_cancel_approve', \{ p_req: id \}\)/.test(fn) && /window\.logAudit\('appointment\.status_change'/.test(fn) && /portalWaCard\(/.test(fn) && /apptLiveRefresh/.test(fn), 'M190 inbox: confirmed first (names the patient and the slot), one server call, activity log, calendar refreshed, WhatsApp confirmation');
}

/* ═══ (١٠) M191 · v633 — حين ترفض العيادةُ طلبه يعرف ═══ */
async function suite191(S) {
  const { mig191, portal, stg } = S;
  const lr = mig191.slice(mig191.indexOf("'last_rejected'"), mig191.indexOf("'type', a.type", mig191.indexOf("'last_rejected'")));
  ok(/r\.status = 'dismissed'/.test(lr) && /r\.handled_at > now\(\) - interval '7 days'/.test(lr) && /q\.status = 'new' AND q\.applied = false/.test(lr) && /q2\.created_at > r\.created_at/.test(lr) && /r\.owner_id = v\.owner_id/.test(lr), 'M191: last_rejected = his latest request on this appointment was rejected in the last 7 days, nothing open or newer');
  ok(/'rejected', cs\.msg_rejected\)/.test(mig191) && /portal_msg_rejected IS NULL OR char_length\(portal_msg_rejected\) <= 600/.test(mig191) && /LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public/.test(mig191) && !/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i.test(fnBody(mig191).replace(/--[^\n]*/g, '')), 'M191: the clinic template rides on changes.tpl · portal_info still STABLE with zero writes');
  ok(typeof constValue(portal, 'DEFAULT_PORTAL_MSGS').rejected === 'string' && /portal_msg_rejected:  portalMsgVal\('ptMsgRejected', 'rejected'\)/.test(stg), 'M191 mirror: the rejected message is a settings template (default stored NULL), byte-equal on both sides');
  const up = { id: '11111111-1111-4111-8111-111111111111', date: '2026-10-30', time: '10:30', status: 'confirmed', confirmation: 'confirmed', can_change: true, last_rejected: 'cancel' };
  const info = { status: 'ok', clinic_name: 'عيادة <س>', patient_name: 'سامر', show: { appts: true, changes: true }, changes: { mode: 'request', cutoff_hours: 24, tpl: {} }, appts: { upcoming: [up], past: [] } };
  const R = loadPortalRpc(portal, JSON.parse(JSON.stringify(info)), async () => ({ data: {} }));
  R.ctx.screenPortal(); let o = R.els.app.innerHTML;
  ok(/لم تتمكّن عيادة &lt;س&gt; من تلبية طلبك الأخير لهذا الموعد — موعدك قائمٌ كما هو/.test(o) && /openChange\('1111[^']*', 'cancel'\)/.test(o), 'M191 page: the rejection is said plainly (clinic name escaped) and the buttons stay available');
  const R2 = loadPortalRpc(portal, Object.assign(JSON.parse(JSON.stringify(info)), { appts: { upcoming: [Object.assign({}, up, { open_request: 'change' })], past: [] } }), async () => ({ data: {} }));
  R2.ctx.screenPortal();
  ok(!/لم تتمكّن/.test(R2.els.app.innerHTML), 'M191 page: an open request hides an older rejection');
  const R3 = loadPortalRpc(portal, Object.assign(JSON.parse(JSON.stringify(info)), { changes: { mode: 'request', cutoff_hours: 24, tpl: { rejected: 'عذراً يا {patient_first_name}' } } }), async () => ({ data: {} }));
  R3.ctx.screenPortal();
  ok(/عذراً يا سامر/.test(R3.els.app.innerHTML), 'M191 page: the clinic\'s own wording wins, placeholders filled');
}
async function run(S) { pass = 0; fail = 0; suite(S); await suite187(S); await suite189(S); await suite190(S); await suite191(S); return { pass, fail }; }
const FILES = { portal: 'portal.html', pp: 'pp-portal.js', mig: 'migrations/180_patient_portal.sql', pph: 'patient-profile.html', ppcss: 'patient-profile.css',
  cb: 'scripts/cache-bust.sh', ppwa: 'pp-wa.js', stg: 'settings.html', cc: 'scripts/check-colors.js', cmb: 'scripts/check-modal-behaviour.js', schema: 'db/schema.sql', plan: 'pp-plan.js', intake: 'intake.html', mig181: 'migrations/181_portal_intake_state.sql', mig182: 'migrations/182_portal_confirm.sql',
  mig187: 'migrations/187_portal_history_changes.sql', mig188: 'migrations/188_portal_requests_hardening.sql', mig189: 'migrations/189_portal_slot_picker.sql', mig190: 'migrations/190_portal_cancel_approve.sql', mig191: 'migrations/191_portal_rejected_notice.sql', theme: 'theme.css', cra: 'scripts/check-row-actions.js', apcss: 'appointments.css', apo: 'appt-portal.js', apb: 'appt-booking.js', appts: 'appointments.html', side: 'sidebar.js', audit: 'audit-log.html' };
const base = {}; Object.keys(FILES).forEach(k => { base[k] = read(FILES[k]); });

(async () => {
const main = await run(base);
if (main.fail) { console.log('❌ prove-portal: ' + main.fail + ' فشل'); process.exit(1); }

if (process.argv.includes('--self-test')) {
  const mutants = [
    ['earned split on any non-planned status', 'mig', "COALESCE(se.st, '') <> 'completed') AS mobile", "COALESCE(se.st, '') = 'planned') AS mobile"],
    ['portal_info not STABLE', 'mig', 'SECURITY DEFINER STABLE SET search_path', 'SECURITY DEFINER SET search_path'],
    ['pending options threshold', 'mig', 'IF v_opts > 1 THEN', 'IF v_opts > 2 THEN'],
    ['balance section ungated', 'mig', 'IF cs.show_balance THEN', 'IF true THEN'],
    ['refund no longer eats credit first', 'mig', 'l.unearned_raw - LEAST(l.refunds, l.unearned_raw) AS unearned', 'l.unearned_raw AS unearned'],
    ['portal.html gains a cache token', 'portal', '<script src="/vendor/supabase-2.110.8.min.js">', '<script src="/vendor/supabase-2.110.8.min.js?v=1">'],
    ['portal.html writes', 'portal', "var INFO = null, TOKEN = null;", "var INFO = null, TOKEN = null; sb.from('x').insert({});"],
    ['revoke not scoped to the live row', 'pp', ".eq('id', live.id).eq('owner_id', currentUser.id).is('revoked_at', null)\n      .select(PP_PORTAL_SELECT).single();\n    if (u.error) throw u.error;\n    PP_PORTAL_ROWS = [u.data].concat((PP_PORTAL_ROWS || []).filter(function (x) { return x.id !== u.data.id; }));\n    PP_PORTAL = PP_PORTAL_ROWS[0];\n    ppPortalRender();\n    ppPortalAudit('إيقاف'", ".eq('id', live.id).eq('owner_id', currentUser.id)\n      .select(PP_PORTAL_SELECT).single();\n    if (u.error) throw u.error;\n    PP_PORTAL_ROWS = [u.data].concat((PP_PORTAL_ROWS || []).filter(function (x) { return x.id !== u.data.id; }));\n    PP_PORTAL = PP_PORTAL_ROWS[0];\n    ppPortalRender();\n    ppPortalAudit('إيقاف'"],
    ['expiry inverted', 'pp', 'new Date(row.expires_at).getTime() < Date.now()', 'new Date(row.expires_at).getTime() > Date.now()'],
    ['template drift', 'stg', "'الرابط خاص بك فلا تشاركه مع أحد. شكراً 🦷';", "'الرابط خاص بك. شكراً 🦷';"],
    ['cache-bust forgets the public page', 'cb', '  [ "$f" = "portal.html" ] && continue', '  :'],
    ['balance line ranking', 'portal', "if (un > e)  return { word: 'رصيد مقدّم لك', v: un, cls: 'blue' };", "if (un > e)  return { word: 'المتبقي عليك', v: un, cls: 'blue' };"],
    ['portal stores something other than the theme', 'portal', "try { localStorage.setItem(KEY, next); } catch (e) {}", "try { localStorage.setItem(KEY, next); localStorage.setItem('t', TOKEN); } catch (e) {}"],
    ['confirm reachable for a past appointment', 'mig182', "IF a.date < v_today OR COALESCE(a.status, 'pending') NOT IN ('scheduled', 'pending')", "IF COALESCE(a.status, 'pending') NOT IN ('scheduled', 'pending')"],
    ['confirm button offered on a phone-cancelled row', 'portal', "&& a.confirmation !== 'cancelled_by_pt' && validId;", "&& validId;"],
    ['Sentry blocks the page again', 'portal', 'crossorigin="anonymous" async></script>', 'crossorigin="anonymous"></script>'],
    ['token reaches Sentry', 'intake', "beforeSend: function(ev){ return scrub(ev); }", "beforeSend: function(ev){ return ev; }"],
    ['a portal RPC without a timeout', 'portal', "var res = await withTimeout(sb.rpc('portal_info', { p_token: TOKEN }), 25000);", "var res = await sb.rpc('portal_info', { p_token: TOKEN });"],
    ['theme button fixed over the content again', 'portal', "position:absolute; top:calc(8px + env(safe-area-inset-top, 0px));", "position:fixed; top:calc(8px + env(safe-area-inset-top, 0px));"],
    /* v628 · M187 */
    ['history leaks amounts without the balance switch', 'mig187', "'cost', CASE WHEN cs.show_balance THEN h.cost END", "'cost', h.cost"],
    ['history widened to planned/condition rows', 'mig187', "AND COALESCE(s.status, 'completed') = 'completed'\n               AND COALESCE(s.date", "AND COALESCE(s.status, 'completed') <> 'planned'\n               AND COALESCE(s.date"],
    ['changes ON by default', 'mig187', 'portal_allow_changes BOOLEAN NOT NULL DEFAULT false', 'portal_allow_changes BOOLEAN NOT NULL DEFAULT true'],
    ['server ignores the clinic switch', 'mig187', 'IF NOT FOUND OR cs.allow_changes IS DISTINCT FROM true OR cs.show_appts IS DISTINCT FROM true THEN', 'IF NOT FOUND OR cs.show_appts IS DISTINCT FROM true THEN'],
    ['no cutoff on write', 'mig187', "IF v_start - now() < make_interval(hours => cs.cutoff_hours) THEN", "IF v_start < now() THEN"],
    ['rate limit loosened', 'mig187', "IF v_n >= 3 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;", "IF v_n >= 30 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;"],
    ['another patient\'s appointment reachable', 'mig187', "x.id = p_appt AND x.doctor_id = v.owner_id AND x.patient_id = v.patient_id AND x.is_planned = false\n   FOR UPDATE;", "x.id = p_appt AND x.doctor_id = v.owner_id AND x.is_planned = false\n   FOR UPDATE;"],
    ['free text unsanitised', 'mig187', "v_note   := NULLIF(left(btrim(regexp_replace(COALESCE(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), 300), '');", "v_note   := NULLIF(btrim(COALESCE(p_note, '')), '');"],
    ['request mode cancels anyway', 'mig187', "v_direct := (p_kind = 'cancel' AND cs.cancel_mode = 'direct');", "v_direct := (p_kind = 'cancel');"],
    ['patient message drifts from settings', 'portal', "  too_late:  'لا يمكن إلغاء الموعد أو طلب تغييره من هنا قبل أقل من {cutoff_hours} ساعة", "  too_late:  'لا يمكن إلغاء الموعد من هنا قبل أقل من {cutoff_hours} ساعة"],
    ['buttons offered past the cutoff', 'portal', "if (chg && !a.open_request && a.can_change === true) {", "if (chg && !a.open_request) {"],
    ['clinic template rendered unescaped', 'portal', "h += '<div class=\"warn\" style=\"margin-top:8px;\">' + esc(tplMsg('too_late', a)) + '</div>';", "h += '<div class=\"warn\" style=\"margin-top:8px;\">' + tplMsg('too_late', a) + '</div>';"],
    ['history shown with its switch off', 'portal', "if (show.history) h += sectionHistory(INFO.history);", "h += sectionHistory(INFO.history);"],
    ['live toast without the patient', 'side', "const name = row.patient_name_snapshot || 'مريض';", "const name = 'مريض';"],
    ['intake toast without the patient', 'side', "window.showToast(name ? ('📝 وصلت استمارة ' + name + ' — افتح بطاقته لمراجعتها')", "window.showToast(false ? ('📝 وصلت استمارة ' + name + ' — افتح بطاقته لمراجعتها')"],
    ['badge ignores portal requests', 'apb', "n += (typeof portalReqNewCount === 'function') ? portalReqNewCount() : 0;", ""],
    ['an applied cancel can be ignored', 'apo', "if (isNew && !r.applied && !cancelReq) acts +=", "if (isNew && !cancelReq) acts +="],
    ['trigger function callable by anon again', 'mig188', 'REVOKE ALL ON FUNCTION public._portal_requests_close() FROM anon, authenticated, public;', 'REVOKE ALL ON FUNCTION public._portal_requests_close() FROM public;'],
    ['patient FK unindexed', 'mig188', 'CREATE INDEX IF NOT EXISTS idx_portal_requests_patient ON public.portal_requests (patient_id);', ''],
    ['hint hides the cancel/request capability', 'pp', "(chg ? ' — ويستطيع إلغاء موعده أو طلب تغييره' : '')", "''"],
    ['hint hides the history section', 'pp', "if (cs.portal_show_history !== false) on.push('العلاجات السابقة');", ''],
    ['portal alert vanishes after 2.6s', 'side', "window.showToast(sbPortalToastText(row), false, 8000)", "window.showToast(sbPortalToastText(row))"],
    /* v630 · M189 */
    ['slot engine callable by anon', 'mig189', 'REVOKE ALL ON FUNCTION public._portal_free_slots(uuid, uuid, int, date, date) FROM anon, authenticated, public;', ''],
    ['another patient\'s open slot not busy', 'mig189', "       AND r.appointment_id IS DISTINCT FROM p_appt\n    UNION ALL\n    SELECT b.d, b.t, b.dur FROM public.booking_blocked_slots(p_owner, p_from, p_to) b", "       AND false\n    UNION ALL\n    SELECT b.d, b.t, b.dur FROM public.booking_blocked_slots(p_owner, p_from, p_to) b"],
    ['appointment overruns closing time', 'mig189', 'WHERE s.t::interval + make_interval(mins => p_dur) <= i.work_end::interval', 'WHERE s.t::interval <= i.work_end::interval'],
    ['chosen slot not re-validated', 'mig189', "    IF NOT EXISTS (SELECT 1 FROM public._portal_free_slots(v.owner_id, a.id, COALESCE(a.duration, bi.slot_minutes, 30), p_date, p_date) f\n                    WHERE f.d = p_date AND f.t = p_time) THEN", "    IF false THEN"],
    ['no lock — two patients get one slot', 'mig189', "    PERFORM pg_advisory_xact_lock(hashtext('portal-slot:' || v.owner_id::text || ':' || p_date::text));\n", ""],
    ['phantom «أي وقت» back', 'mig189', "WHEN 'any' THEN 'أي وقت' END, '')", "ELSE 'أي وقت' END, '')"],
    ['send enabled without a slot', 'portal', "(needSlot && !OPEN_CHG.time ? ' disabled' : '')", "''"],
    ['slot not sent', 'portal', "      p_date: slotD, p_time: slotT }), 20000);", "      p_date: null, p_time: null }), 20000);"],
    ['slot taken leaves stale choices', 'portal', "      await loadSlots(id);   /* re-render first — the notice is inserted into the fresh page */\n", ""],
    ['moved template drifts', 'apo', "كما طلبت ✓ — نتطلع لرؤيتك 🦷';\n/* M190", "كما طلبت — نتطلع لرؤيتك 🦷';\n/* M190"],
    ['confirmation offered without a move', 'apo', "if (ctx.origDate === saved.date && ctx.origTime === String(saved.time).slice(0, 5)) return;", ""],
    ['approve hook after closeModal (ctx gone)', 'appts', "        portalApproveSaved(window._portalApproveCtx, apptData);\n      }\n      closeModal();", "      }\n      closeModal();\n        portalApproveSaved(window._portalApproveCtx, apptData);"],
    ['toast hides the asked slot', 'side', "(to ? ' يطلب نقل موعده ' + when + to : ' يطلب تغيير موعده ' + when)", "(' يطلب تغيير موعده ' + when)"],
    ['confirmation button back to a low-contrast green', 'apcss', 'background:var(--green2);color:var(--bg);', 'background:var(--wa);color:#fff;'],
    ['settings tab bar translucent again', 'theme', ':root[data-theme="light"] nav:not([class]),\n:root[data-theme="light"] nav.sb-nav {', ':root[data-theme="light"] nav {'],
    /* v632 · M190 */
    ['approve runs as definer (bypasses RLS/gate)', 'mig190', 'LANGUAGE plpgsql SECURITY INVOKER SET search_path = public', 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public'],
    ['approve callable by anon', 'mig190', 'REVOKE ALL ON FUNCTION public.portal_request_cancel_approve(uuid) FROM anon, public;', 'GRANT EXECUTE ON FUNCTION public.portal_request_cancel_approve(uuid) TO anon;'],
    ['approve re-cancels a closed request', 'mig190', "  IF r.status <> 'new' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', r.status); END IF;\n", ''],
    ['ambiguous «تمّ» back on cancel requests', 'apo', "  if (isNew && !cancelReq) acts += '<button class=\"sy-act\" title=", "  if (isNew) acts += '<button class=\"sy-act\" title="],
    ['cancel-approved template drifts', 'apo', "بناءً على طلبك ✓. لحجز موعدٍ جديد تواصل معنا متى شئت 🦷';", "بناءً على طلبك. لحجز موعدٍ جديد تواصل معنا متى شئت 🦷';"],
    ['cancel approved without confirmation', 'apo', "  if (!await SyDialog.confirm({ message: 'إلغاء موعد ' + (r.patient_name_snapshot || 'المريض') + (when ? ' يوم ' + when : '') + ' بناءً على طلبه؟', danger: true })) return;\n", ''],
    ['token page leaks a Referer', 'portal', '<meta name="referrer" content="no-referrer">', ''],
    ['card back under the toast', 'apcss', 'bottom:calc(88px + env(safe-area-inset-bottom, 0px));', 'bottom:calc(22px + env(safe-area-inset-bottom, 0px));'],
    /* v633 · M191 */
    ['rejection shown forever', 'mig191', "AND r.handled_at > now() - interval '7 days'", "AND true"],
    ['rejection shown over a newer request', 'mig191', "AND NOT EXISTS (SELECT 1 FROM public.portal_requests q2\n                                                       WHERE q2.appointment_id = a.id AND q2.created_at > r.created_at)", "AND true"],
    ['rejection notice not rendered', 'portal', "if (chg && !a.open_request && a.last_rejected && a.can_change !== false) h +=", "if (false) h +="],
    ['rejection notice unescaped', 'portal', "esc(tplMsg('rejected', a))", "tplMsg('rejected', a)"],
    ['default template stored verbatim', 'stg', "return (!v || v === DEFAULT_PORTAL_MSGS[key]) ? null : v;", "return v || null;"],
    ['theme block drifts between the two public pages', 'intake', "--text:#e1f4ee; --text2:#8a9ab5; --green:#2ee89e; --green2:#26d48e;", "--text:#e1f4ee; --text2:#8a9ab5; --green:#2ee89f; --green2:#26d48e;"]
  ];
  let bit = 0;
  const origLog = console.log; console.log = () => {};
  for (const [name, key, from, to] of mutants) {
    if (base[key].indexOf(from) < 0) { console.log = origLog; console.log('❌ طفرة لا تطابق المصدر: ' + name); process.exit(1); }
    const S = Object.assign({}, base, { [key]: base[key].replace(from, to) });
    let res; try { res = await run(S); } catch (e) { res = { fail: 1 }; }
    if (res.fail) bit++; else { console.log = origLog; console.log('❌ طفرة لم تعضّ: ' + name); process.exit(1); }
  }
  console.log = origLog;
  console.log('✅ prove-portal: ' + main.pass + '/' + main.pass + ' توكيداً · ' + bit + '/' + mutants.length + ' طفرة تعضّ');
} else {
  console.log('✅ prove-portal: ' + main.pass + '/' + main.pass + ' توكيداً');
}
})();

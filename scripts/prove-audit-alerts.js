/* v561 — مثبتُ #10 (التنبيهات) من ملاحظات Deep Code — مستقل، على الملفات الحيّة.
   (١) Migration 166 (trigger detect_audit_alerts): أفعالُ المالك (الدور owner أو بلا دور) لا تُنبِّه بالقواعد ١ · ٢ · ٣ ·
       القاعدة ٣ مرةً واحدة لكل (موظف · مريض · يوم) — عند الخامس وما لم يُطلَق تنبيهُ المجموعة اليوم (يصمد أمام الإدراج الجماعي) ·
       القاعدة ٤ (حذفُ دفعة/جلسة من طبيبٍ موظف أو سكرتيرة) حرفياً · القائمُ يُؤرشَف ولا يُحذف · مرآةُ db/schema.sql مطابقة.
   (٢) صفحةُ السجل (بـvm على الدالة الحيّة): حرجٌ = حذفُ دفعة/جلسة · للمراجعة = الباقي؛ الشريطُ يرتّب الحرجَ أولاً باستقرار.
   التحقق الحيّ (كتلةٌ متراجَعة على الإنتاج): المالكُ 6 تعديلات + حذفُ دفعةٍ سريع ⇒ صفرُ تنبيه؛ السكرتيرةُ 7 تعديلات + إدراجٌ جماعي ⇒ تنبيهٌ واحد؛
   حذفُ دفعتها ⇒ تنبيه — والنشطُ بعد الأرشفة 9 بدل 328.
   --self-test: كلُّ طفرةٍ لا بدّ أن تحمّر. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILES = ['migrations/166_audit_alerts_signal.sql', 'db/schema.sql', 'audit-log.html'];
const base = {}; FILES.forEach(f => base[f] = read(f));
function body(sql) { const i = sql.indexOf('DECLARE', sql.indexOf('detect_audit_alerts')); return sql.slice(i, sql.indexOf('RETURN NEW;', i)).replace(/\s+--[^\n]*/g, '').replace(/\s+/g, ' ').trim(); }
function suite(F) {
  const M = F['migrations/166_audit_alerts_signal.sql'], B = body(M);
  ok(/v_is_owner BOOLEAN := COALESCE\(NEW\.employee_role_snapshot, 'owner'\) = 'owner';/.test(B), '(١) owner = role owner or none');
  ok(/IF NOT v_is_owner AND NEW\.action_type = 'payment\.delete'/.test(B) && /IF NOT v_is_owner AND NEW\.action_type = 'session\.edit_price'/.test(B) && /IF NOT v_is_owner AND NEW\.patient_id IS NOT NULL/.test(B),
     '(١) rules 1 · 2 · 3 skip the owner\'s own actions');
  ok(/IF v_recent_count >= 4 AND NOT EXISTS \( SELECT 1 FROM public\.audit_log WHERE owner_id = NEW\.owner_id AND employee_id = NEW\.employee_id AND patient_id = NEW\.patient_id AND is_alert AND alert_reason LIKE '%تعديلات أو أكثر من نفس الموظف%' AND created_at >= date_trunc\('day', now\(\)\)\) THEN/.test(B),
     '(١) rule 3 fires once per (employee · patient · day)');
  ok(/IF NEW\.action_type IN \('payment\.delete', 'session\.delete'\) AND NEW\.employee_role_snapshot IN \('doctor', 'secretary'\) THEN NEW\.is_alert := TRUE;/.test(B), '(١) rule 4 (non-owner deletions) unchanged');
  const tail = M.slice(M.indexOf('$function$;'));
  ok(!/\bDELETE\b/i.test(tail) && (tail.match(/SET is_archived = TRUE, archived_at = now\(\)/g) || []).length === 2, '(١) existing alerts archived, never deleted');
  ok(/WHERE is_alert AND NOT COALESCE\(is_archived, FALSE\)\s+AND COALESCE\(employee_role_snapshot, 'owner'\) = 'owner';/.test(tail) && /r3\.rn > 1;/.test(tail), '(١) archive = owner alerts + rule-3 repeats after the first');
  ok(body(F['db/schema.sql']) === B, '(١) db/schema.sql mirrors the trigger verbatim');
  /* (٢) */
  const A = F['audit-log.html'];
  const fsrc = (A.match(/function alertPriority\(reason\) \{[^\n]*\}/) || [''])[0];
  const c = {}; try { vm.runInNewContext(fsrc + ';this.p=alertPriority;', c); } catch (e) {}
  ok(c.p && c.p('حذف دفعة بواسطة السكرتيرة') === 'crit' && c.p('حذف جلسة بواسطة الطبيب') === 'crit' && c.p('حذف دفعة بعد 3 دقيقة فقط من إنشائها') === 'crit'
     && c.p('5 تعديلات أو أكثر من نفس الموظف على نفس المريض اليوم') === 'norm' && c.p('تعديل سعر بنسبة 60%') === 'norm' && c.p(null) === 'norm', '(٢) priority: deletions critical, the rest for review');
  ok(/alerts = alerts\.map\(function \(a, i\) \{ return \{ a: a, i: i \}; \}\)\s*\.sort\(function \(x, y\) \{ return \(alertPriority\(x\.a\.alert_reason\) === 'crit' \? 0 : 1\) - \(alertPriority\(y\.a\.alert_reason\) === 'crit' \? 0 : 1\) \|\| x\.i - y\.i; \}\)/.test(A),
     '(٢) banner: critical first, newest first within each');
  ok(/var _prio = row\.is_alert \? alertPriority\(row\.alert_reason\) : '';/.test(A) && /\(_prio === 'crit' \? '🔴 حرج' : '🟡 للمراجعة'\)/.test(A), '(٢) log rows carry the priority tag');
}
const rep = (f, a, b) => F0 => { const F = Object.assign({}, F0); F[f] = F[f].split(a).join(b); return F; };
const MUTANTS = [
  ['owner alerted again (rule 3)', rep('migrations/166_audit_alerts_signal.sql', 'IF NOT v_is_owner AND NEW.patient_id IS NOT NULL', 'IF NEW.patient_id IS NOT NULL')],
  ['owner alerted again (rule 1)', rep('migrations/166_audit_alerts_signal.sql', "IF NOT v_is_owner AND NEW.action_type = 'payment.delete'", "IF NEW.action_type = 'payment.delete'")],
  ['rule 3 on every edit', rep('migrations/166_audit_alerts_signal.sql', "    IF v_recent_count >= 4 AND NOT EXISTS (", "    IF v_recent_count >= 4 AND EXISTS (")],
  ['rule 4 softened', rep('migrations/166_audit_alerts_signal.sql', "     AND NEW.employee_role_snapshot IN ('doctor', 'secretary') THEN", "     AND NEW.employee_role_snapshot IN ('doctor') THEN")],
  ['old alerts deleted', rep('migrations/166_audit_alerts_signal.sql', "UPDATE public.audit_log\n   SET is_archived = TRUE, archived_at = now()\n WHERE is_alert", "DELETE FROM public.audit_log\n WHERE is_alert")],
  ['mirror drift', rep('db/schema.sql', "'5 تعديلات أو أكثر من نفس الموظف على نفس المريض اليوم'", "'تعديلات متكررة'")],
  ['deletions not critical', rep('audit-log.html', "return /حذف (دفعة|جلسة)/.test(", "return /حذف دفعة/.test(")],
  ['banner unsorted', rep('audit-log.html', "|| x.i - y.i; })", "|| y.i - x.i; })")]
];
suite(base);
const bp = pass, bf = fail;
if (process.argv.includes('--self-test')) {
  let bit = 0;
  for (const [name, mut] of MUTANTS) {
    const F2 = mut(base);
    if (JSON.stringify(F2) === JSON.stringify(base)) { console.log('MUTANT DID NOT APPLY:', name); continue; }
    pass = 0; fail = 0; const lg = console.log; console.log = () => {};
    try { suite(F2); } catch (e) { fail++; }
    console.log = lg;
    if (fail > 0) bit++; else console.log('MUTANT SURVIVED:', name);
  }
  pass = bp; fail = bf;
  const all = bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-audit-alerts: ' + pass + '/' + (pass + fail) + ' · mutants ' + bit + '/' + MUTANTS.length);
  process.exit(fail === 0 && all ? 0 : 1);
}
console.log((fail === 0 ? '✅' : '❌') + ' prove-audit-alerts: ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);

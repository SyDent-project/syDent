/* prove-backup-restore — «💾 نسخة احتياطية» (index.html · dashBackupBuild) ↔ scripts/backup-restore.js
   Round trip on synthetic rows through a real .xlsx (vendor SheetJS, the same aoa_to_sheet path as
   SyDentXlsx.save): every value comes back as PostgREST returned it, null stays apart from '',
   secret columns never reach the file, a table that failed to read keeps the sheets aligned, and
   the restore SQL is additive (ON CONFLICT DO NOTHING) with user triggers switched back on, and a
   row that points at another row of its own table (a follow-up session → its base, M210) is
   restored after it.
   --self-test also runs mutants that each must be caught. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const IX0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const RS0 = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-restore.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');

const UID = '11111111-2222-4333-8444-555555555555';
const NEW = '99999999-8888-4777-8666-555555555555';
const FIX = {
  clinic_settings: [{ id: 'c1', owner_id: UID, clinic_name: 'عيادة الاختبار', lock_pin_hash: 'SECRET', staff_msg_presets: ['أ', 'ب'], patient_flag_defs: null, ai_features_enabled: true }],
  patients: [
    { id: 'p1', doctor_id: UID, name: 'مريض\nبسطرين', notes: '', allergies: null, flags: { vip: true }, phone: '0933000000', payment_manual: false },
    { id: 'p2', doctor_id: UID, name: 'نص فيه $sydent_restore$', notes: 'x', allergies: '', flags: null, phone: '09', payment_manual: true }
  ],
  /* backup order is by id: the follow-up 's0' sorts before its base 's1' */
  ledger_sessions: [
    { id: 's0', doctor_id: UID, patient_id: 'p1', cost: 0, tooth_num: null, notes: '', parent_id: 's1' },
    { id: 's1', doctor_id: UID, patient_id: 'p1', cost: 1250000.5, tooth_num: '11', notes: '', parent_id: null }
  ],
  teeth_status: [{ doctor_id: UID, patient_id: 'p1', tooth_num: '11', surface: 'B', treatment_key: 'treated' }]
};
const FAILED = 'appointments';

function api(ix) {
  const block = ix.slice(ix.indexOf('// BACKUP-BEGIN'), ix.indexOf('// BACKUP-END'));
  return new Function(block + '; return { DASH_BACKUP_TABLES, dashBackupBuild, DASH_BACKUP_FORMAT };')();
}
function restoreMod(src) {
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', src.replace(/^#!.*\n/, ''))(m, m.exports, require, path.join(ROOT, 'scripts'));
  return m.exports;
}

function run(ix, rs) {
  const out = [];
  const ok = (c, msg) => out.push([!!c, msg]);
  let A, R;
  try { A = api(ix); R = restoreMod(rs); } catch (e) { ok(false, 'load: ' + e.message); return out; }
  const X = R.loadXLSX();
  const results = A.DASH_BACKUP_TABLES
    .filter(t => FIX[t[0]] || t[0] === FAILED)
    .map(t => t[0] === FAILED ? { t, error: true } : { t, rows: FIX[t[0]] });
  const sheets = A.dashBackupBuild(UID, '2026-10-20 10:00', results);
  const wb = X.utils.book_new();
  sheets.forEach(sh => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([sh.headers].concat(sh.rows)), sh.name));
  const buf = X.write(wb, { type: 'buffer', bookType: 'xlsx' });

  let b;
  try { b = R.readBackup(X, buf); } catch (e) { ok(false, 'readBackup: ' + e.message); return out; }
  ok(b.uid === UID, 'account id travels in the notes sheet');
  ok(b.skipped.length === 1 && b.skipped[0] === FAILED, 'failed table is noted, not dropped silently');
  const byT = {};
  b.tables.forEach(t => byT[t.table] = t.rows);
  ok(Object.keys(byT).sort().join() === Object.keys(FIX).sort().join(), 'every read table comes back under its own name (sheet order aligned)');

  const secretLeak = /SECRET/.test(JSON.stringify(b.tables));
  ok(!secretLeak, 'secret columns (pin/hash/token) never reach the file');

  let same = true;
  Object.keys(FIX).forEach(t => (FIX[t] || []).forEach((r, i) => {
    const got = (byT[t] || [])[i] || {};
    Object.keys(r).forEach(k => {
      if (/pin|hash|token|secret|password/i.test(k)) return;
      const want = (r[k] !== null && typeof r[k] === 'object') ? JSON.stringify(r[k]) : r[k];
      if (got[k] !== want) { same = false; out.push([false, t + '.' + k + ': ' + JSON.stringify(got[k]) + ' ≠ ' + JSON.stringify(want)]); }
    });
  }));
  ok(same, 'every cell round-trips (numbers, booleans, Arabic, newlines, JSON as text)');
  ok(byT.patients && byT.patients[0].notes === '' && byT.patients[0].allergies === null, "null stays null and '' stays ''");

  const p = R.plan(b, { chunk: 1 });
  ok(p.files.length === 6, 'chunking: one file per row with --chunk 1');
  const at = id => p.files.findIndex(f => f.table === 'ledger_sessions' && f.sql.indexOf('"id":"' + id + '"') >= 0);
  ok(at('s1') >= 0 && at('s0') > at('s1'), 'a follow-up session is restored after its base (self foreign key, parent first)');
  const chain = R.parentsFirst([{ id: 'c', up: 'b' }, { id: 'b', up: 'a' }, { id: 'x', up: null }, { id: 'a', up: null }, { id: 'o', up: 'gone' }, { id: 'l1', up: 'l2' }, { id: 'l2', up: 'l1' }], 'up').map(r => r.id).join();
  ok(chain === 'x,a,o,b,l2,c,l1', 'parents first: stable, any depth, a missing parent or a loop does not hang (' + chain + ')');
  const selfFk = {};
  SCHEMA.replace(/ALTER TABLE ONLY "public"\."(\w+)"\s+ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "public"\."(\w+)"\("id"\)/g, (m, t, c, ref) => { if (t === ref) selfFk[t] = c; return m; });
  ok(Object.keys(selfFk).length >= 1 && JSON.stringify(selfFk) === JSON.stringify(R.SELF_PARENT), 'SELF_PARENT lists every self foreign key of db/schema.sql (' + JSON.stringify(selfFk) + ')');
  ok(p.files.every(f => /on conflict do nothing/.test(f.sql)), 'restore is additive (ON CONFLICT DO NOTHING)');
  ok(p.files.every(f => /disable trigger user/.test(f.sql) && /enable trigger user/.test(f.sql)), 'user triggers off for the insert and back on');
  ok(p.files.every(f => /^begin;/.test(f.sql) && /commit;\n$/.test(f.sql)), 'each file is one transaction');
  const pf = p.files.find(f => f.table === 'patients' && f.sql.indexOf('$sydent_restore$ ') < 0 && /p2/.test(f.sql));
  ok(pf && /\$sydent_restore1\$/.test(pf.sql), 'dollar-quote tag steps around data that contains it');
  ok(/'teeth_status' as table_name, 1 as in_backup, null::bigint/.test(p.compare) && /x\.id::text = b\.id/.test(p.compare), 'compare: missing-now count by id, plain count for keyless tables');
  const moved = R.plan(b, { toOwner: NEW });
  ok(moved.files.every(f => f.sql.indexOf(UID) < 0) && moved.files.some(f => f.sql.indexOf(NEW) >= 0), '--to-owner rewrites the account id everywhere');
  ok(R.plan(b, { only: ['patients'] }).files.every(f => f.table === 'patients'), '--only limits the tables');
  return out;
}

const MUTANTS = [
  ['null written as empty text', 'ix', "if (v === null || v === undefined) return null;", "if (v === null || v === undefined) return '';"],
  ['secret filter dropped', 'ix', "!DASH_BACKUP_SECRET.test(k)", 'true'],
  ['failed table not noted', 'ix', "if (res.error) { notes.push([t[2], t[0], '', 'تعذّرت القراءة']); return; }", 'if (res.error) return;'],
  ['restore overwrites', 'rs', "'on conflict do nothing returning 1)", "'returning 1)"],
  ['triggers left off', 'rs', "execute format('alter table public.%I enable trigger user', t);", ''],
  ['owner not rewritten', 'rs', 'if (opts.toOwner && backup.uid && v === backup.uid) v = opts.toOwner;', ''],
  ['follow-up restored in backup order', 'rs', 'if (SELF_PARENT[tb.table]) rows = parentsFirst(rows, SELF_PARENT[tb.table]);', ''],
  ['self foreign key not listed', 'rs', "const SELF_PARENT = { ledger_sessions: 'parent_id' };", 'const SELF_PARENT = {};'],
  ['parents-first sort unstable by depth', 'rs', 'a[0] - b[0] || a[1] - b[1]', 'a[1] - b[1]']
];

const base = run(IX0, RS0);
let pass = 0, fail = 0;
base.forEach(([c, m]) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } });
let bit = 0;
if (process.argv.includes('--self-test')) {
  MUTANTS.forEach(([name, where, a, b]) => {
    const ix = where === 'ix' ? IX0.replace(a, b) : IX0;
    const rs = where === 'rs' ? RS0.replace(a, b) : RS0;
    if (ix === IX0 && rs === RS0) { console.log('MUTANT DID NOT APPLY: ' + name); return; }
    if (run(ix, rs).some(([c]) => !c)) bit++; else console.log('MUTANT SURVIVED: ' + name);
  });
}
const all = !process.argv.includes('--self-test') || bit === MUTANTS.length;
console.log((fail === 0 && all ? '✅' : '❌') + ' prove-backup-restore: ' + pass + '/' + (pass + fail) +
  (process.argv.includes('--self-test') ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
process.exit(fail === 0 && all ? 0 : 1);

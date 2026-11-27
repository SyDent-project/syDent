/* prove-backup-restore — «💾 نسخة احتياطية» (index.html · dashBackupBuild) ↔ scripts/backup-restore.js
   Round trip on synthetic rows through a real .xlsx (vendor SheetJS, the same aoa_to_sheet path as
   SyDentXlsx.save): every value comes back as PostgREST returned it, null stays apart from '',
   secret columns never reach the file, a table that failed to read keeps the sheets aligned, and
   the restore SQL is additive (ON CONFLICT DO NOTHING) with user triggers switched back on, and a
   row that points at another row of its own table (a follow-up session → its base, M210) is
   restored after it. A text longer than an Excel cell travels whole through the «نصوص طويلة» sheet,
   every table is read in a fixed order by a unique key, and a partial or non-xlsx file is never
   reported as a good backup.
   --self-test also runs mutants that each must be caught. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const IX0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const RS0 = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-restore.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
const MIG = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => /^\d+.*\.sql$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  .map(f => fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')).join('\n');

const UID = '11111111-2222-4333-8444-555555555555';
const NEW = '99999999-8888-4777-8666-555555555555';
const SIG = 'data:image/png;base64,' + Array.from({ length: 70001 }, (_, i) => 'AbC9+/أ'[i % 7]).join('');   // longer than two parts
const BIGJSON = { list: Array.from({ length: 4000 }, (_, i) => 'بند ' + i) };                              // jsonb longer than one cell
const FIX = {
  clinic_settings: [{ id: 'c1', owner_id: UID, clinic_name: 'عيادة الاختبار', lock_pin_hash: 'SECRET', staff_msg_presets: ['أ', 'ب'], patient_flag_defs: null, ai_features_enabled: true, big_defs: BIGJSON }],
  /* backup order is by id: 'p1' was referred by 'p2', which sorts after it */
  patients: [
    { id: 'p1', doctor_id: UID, name: 'مريض\nبسطرين', notes: '', allergies: null, flags: { vip: true }, phone: '0933000000', payment_manual: false, referred_by_patient_id: 'p2' },
    { id: 'p2', doctor_id: UID, name: 'نص فيه $sydent_restore$', notes: 'x', allergies: '', flags: null, phone: '09', payment_manual: true, referred_by_patient_id: null }
  ],
  patient_consents: [{ id: 'k1', owner_id: UID, patient_id: 'p1', title: 'موافقة', signature: SIG, session_ids: ['s1'], note: '⟦sydent-long:99⟧ نص عادي' }],
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
  return new Function(block + '; return { DASH_BACKUP_TABLES, dashBackupBuild, DASH_BACKUP_FORMAT, DASH_BACKUP_FORMATS, dashBackupRead, dashBackupVerdict, DASH_BACKUP_LONG_SHEET, dashBackupParse, dashBackupDiff, dashBackupReport };')();
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

  /* long texts */
  const cells = [];
  wb.SheetNames.forEach(n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }).forEach(r => r.forEach(v => cells.push(v))));
  ok(cells.every(v => typeof v !== 'string' || v.length <= 32767), 'no cell is longer than Excel allows');
  ok(wb.SheetNames[wb.SheetNames.length - 1] === A.DASH_BACKUP_LONG_SHEET && A.DASH_BACKUP_LONG_SHEET === R.LONG_SHEET, 'long texts sit in their own last sheet, same name on both sides');
  ok(byT.patient_consents && byT.patient_consents[0].signature === SIG, 'a text longer than a cell comes back whole (' + SIG.length + ' characters)');
  ok(byT.clinic_settings && byT.clinic_settings[0].big_defs === JSON.stringify(BIGJSON), 'a long jsonb value comes back as the same JSON text');
  ok(byT.patient_consents && byT.patient_consents[0].note === FIX.patient_consents[0].note, 'ordinary text that merely contains a marker is left alone');
  const wb2 = X.utils.book_new();
  sheets.filter(sh => sh.name !== A.DASH_BACKUP_LONG_SHEET).forEach(sh => X.utils.book_append_sheet(wb2, X.utils.aoa_to_sheet([sh.headers].concat(sh.rows)), sh.name));
  let lost = false;
  try { R.readBackup(X, X.write(wb2, { type: 'buffer', bookType: 'xlsx' })); } catch (e) { lost = /long text/.test(e.message); }
  ok(lost, 'a marker whose text is gone stops the restore instead of restoring the marker');
  const old = A.dashBackupBuild(UID, '2026-10-20 10:00', [{ t: A.DASH_BACKUP_TABLES.find(t => t[0] === 'patients'), rows: FIX.patients }]);
  old[0].rows[0][1] = 'sydent-backup/2';
  const wb3 = X.utils.book_new();
  old.forEach(sh => X.utils.book_append_sheet(wb3, X.utils.aoa_to_sheet([sh.headers].concat(sh.rows)), sh.name));
  let oldOk = false;
  try { oldOk = R.readBackup(X, X.write(wb3, { type: 'buffer', bookType: 'xlsx' })).tables[0].rows.length === 2; } catch (e) {}
  ok(oldOk && A.DASH_BACKUP_FORMAT === R.FORMAT, 'files of the previous format still restore; both sides agree on the current one');

  /* «فحص ملف نسخة»: the page reads the file the way the restore does, and compares keys only */
  const P = A.dashBackupParse(X, X.read(buf, { type: 'buffer' }));
  ok(P && P.uid === b.uid && P.stamp === b.stamp && P.skipped.join() === b.skipped.join() && !P.broken
    && P.tables.map(t => t.table + ':' + t.rows.length).join() === b.tables.map(t => t.table + ':' + t.rows.length).join(), 'the page parses the file exactly as the restore script does (account, date, tables, row counts, failed tables)');
  ok(JSON.stringify(A.DASH_BACKUP_FORMATS) === JSON.stringify(R.FORMATS), 'page and restore accept the same formats');
  ok(A.dashBackupParse(X, X.read(X.write(wb3, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })).format === 'sydent-backup/2', 'a file of the previous format can be checked too');
  const other = X.utils.book_new();
  X.utils.book_append_sheet(other, X.utils.aoa_to_sheet([['الاسم', 'الهاتف'], ['مريض', '09']]), 'المرضى');
  ok(A.dashBackupParse(X, other) === null && A.dashBackupParse(X, X.utils.book_new()) === null, 'a workbook that is not a backup is refused');
  const cut = X.read(buf, { type: 'buffer' });
  cut.Sheets[cut.SheetNames[2]] = X.utils.aoa_to_sheet([Object.keys(FIX.patients[0])]);
  ok(A.dashBackupParse(X, cut).broken === true, 'a sheet whose rows no longer match the notes marks the file as edited or damaged');
  const keysOf = (t, rows) => rows.map(r => { const o = {}; (A.DASH_BACKUP_TABLES.find(x => x[0] === t)[3] || ['id']).forEach(k => o[k] = r[k]); return o; });
  const liveAll = {};
  Object.keys(FIX).forEach(t => liveAll[t] = keysOf(t, FIX[t]));
  const eq = A.dashBackupDiff(P, liveAll);
  ok(eq.missing === 0 && eq.added === 0 && eq.items.length === 0 && eq.uncompared === 0 && eq.rows === 7 && eq.skipped === 1, 'file and platform identical ⇒ nothing missing, nothing added');
  const liveLess = Object.assign({}, liveAll, { patients: keysOf('patients', FIX.patients.slice(0, 1)).concat([{ id: 'p9' }, { id: 'p10' }]), teeth_status: [] });
  const less = A.dashBackupDiff(P, liveLess);
  ok(less.missing === 2 && less.added === 2 && less.items.map(i => i.sheet + ':' + i.missing + '/' + i.of).sort().join() === 'المرضى:1/2,حالة الأسنان:1/1', 'rows deleted since the backup are counted per sheet (by id, or by the table key), rows added since are counted apart');
  const un = A.dashBackupDiff(P, { patients: liveAll.patients });
  ok(un.uncompared === 4 && un.missing === 0, 'a table the platform could not answer for is reported as not compared, not as missing');
  const rl = A.dashBackupReport(less), rq = A.dashBackupReport(eq);
  ok(rl[0] === 'تاريخ النسخة: \u206620/10/2026 10:00\u2069' && rl.indexOf('صفوف بالملف غير موجودة الآن: 2') > 0 && rl.indexOf('• المرضى: 1 من 2') > 0 && rl.indexOf('أُضيف بعد تاريخ النسخة: 2 صفاً') > 0 && /الدعم/.test(rl[rl.length - 2]) && /للقراءة فقط/.test(rl[rl.length - 1]), 'report: date, missing per sheet, added, where to go, read-only');
  ok(rq.some(l => /^✓/.test(l)) && rq.some(l => /لم تُقرأ وقت النسخ: 1/.test(l)) && !rq.some(l => /الدعم/.test(l)), 'report: nothing missing says so, and still warns about a table the backup failed to read');
  const many = A.dashBackupReport({ stamp: 'x', tables: 20, rows: 99, missing: 15, added: 0, skipped: 0, broken: false, uncompared: 0, items: Array.from({ length: 15 }, (_, i) => ({ sheet: 's' + i, missing: 1, of: 2 })) });
  ok(many.filter(l => /^• /.test(l)).length === 10 && many.indexOf('و 5 جداول أخرى') > 0, 'report: a long list is cut to ten sheets with the rest counted');
  const chk = ix.slice(ix.indexOf('async function dashBackupMenu'), ix.indexOf('loadDashboard();\ndashBackupInit();'));
  ok(chk.length > 500 && !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(chk) && /if \(parsed\.uid !== uid\)/.test(chk) && /nlIsOwner\(\)/.test(chk) && /onclick="dashBackupMenu\(\)"/.test(ix), 'the file check writes nothing, is the owner\'s only, and refuses another account\'s file');

  /* table list */
  const T = A.DASH_BACKUP_TABLES, pos = n => T.findIndex(t => t[0] === n);
  ok(['patient_consents', 'consent_templates', 'patient_portals', 'staff_leaves'].every(n => pos(n) >= 0), 'consents, consent templates, portal links and staff leaves are in the backup');
  ok(pos('patients') < pos('patient_consents') && pos('patients') < pos('patient_portals') && pos('clinic_employees') < pos('staff_leaves') && pos('schedule_blocks') < pos('staff_leaves'), 'new tables come after the tables they point at');
  ok(new Set(T.map(t => t[0])).size === T.length && new Set(T.map(t => t[2])).size === T.length && T.every(t => t[2].length <= 31 && t[2] !== A.DASH_BACKUP_LONG_SHEET), 'table and sheet names are unique and fit Excel');
  const noId = [];
  SCHEMA.replace(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g, (m, t, body) => { if (!/^\s+"id" /m.test(body)) noId.push(t); return m; });
  ok(noId.indexOf('teeth_status') >= 0 && T.filter(t => noId.indexOf(t[0]) >= 0).every(t => Array.isArray(t[3]) && t[3].length), 'a table without an id column names the unique key it is read by');

  const p = R.plan(b, { chunk: 1 });
  ok(p.files.length === 7, 'chunking: one file per row with --chunk 1');
  const pat = id => p.files.findIndex(f => f.table === 'patients' && f.sql.indexOf('"id":"' + id + '"') >= 0);
  ok(pat('p2') >= 0 && pat('p1') > pat('p2'), 'a referred patient is restored after the patient who referred them');
  const at = id => p.files.findIndex(f => f.table === 'ledger_sessions' && f.sql.indexOf('"id":"' + id + '"') >= 0);
  ok(at('s1') >= 0 && at('s0') > at('s1'), 'a follow-up session is restored after its base (self foreign key, parent first)');
  const chain = R.parentsFirst([{ id: 'c', up: 'b' }, { id: 'b', up: 'a' }, { id: 'x', up: null }, { id: 'a', up: null }, { id: 'o', up: 'gone' }, { id: 'l1', up: 'l2' }, { id: 'l2', up: 'l1' }], 'up').map(r => r.id).join();
  ok(chain === 'x,a,o,b,l2,c,l1', 'parents first: stable, any depth, a missing parent or a loop does not hang (' + chain + ')');
  const selfFk = {};
  SCHEMA.replace(/ALTER TABLE ONLY "public"\."(\w+)"\s+ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "public"\."(\w+)"\("id"\)/g, (m, t, c, ref) => { if (t === ref) selfFk[t] = c; return m; });
  /* db/schema.sql does not mirror every migration, so the migrations are read too: a column added with an inline REFERENCES, or a constraint added later */
  MIG.replace(/ALTER TABLE\s+(?:ONLY\s+)?(?:IF EXISTS\s+)?(?:public\.)?"?(\w+)"?\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?\s+\w+\s+REFERENCES\s+(?:public\.)?"?(\w+)"?\s*\(/gi, (m, t, c, ref) => { if (t === ref) selfFk[t] = c; return m; });
  MIG.replace(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?"?(\w+)"?(?:(?!;)[\s\S])*?FOREIGN KEY\s*\("?(\w+)"?\)\s*REFERENCES\s+(?:public\.)?"?(\w+)"?\s*\(/gi, (m, t, c, ref) => { if (t === ref) selfFk[t] = c; return m; });
  const sortKeys = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  ok(Object.keys(selfFk).length >= 2 && sortKeys(selfFk) === sortKeys(R.SELF_PARENT), 'SELF_PARENT lists every self foreign key of db/schema.sql and migrations/ (' + JSON.stringify(selfFk) + ')');
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

/* the read and the verdict, against a stand-in for the Supabase client */
async function runRead(ix) {
  const out = [];
  const ok = (c, msg) => out.push([!!c, msg]);
  let A;
  try { A = api(ix); } catch (e) { ok(false, 'load: ' + e.message); return out; }
  const calls = [];
  const fake = (total, failAt) => ({ from: table => {
    const c = { table, order: [], eq: null };
    const q = { select: () => q, eq: (k, v) => { c.eq = [k, v]; return q; }, order: k => { c.order.push(k); return q; },
      range: async (a, z) => { c.range = [a, z]; calls.push(JSON.parse(JSON.stringify(c)));
        if (failAt === a) return { error: { message: 'boom' }, data: null };
        return { error: null, data: Array.from({ length: Math.max(0, Math.min(z + 1, total) - a) }, (_, i) => ({ n: a + i })) }; } };
    return q; } });
  const T = A.DASH_BACKUP_TABLES, teeth = T.find(t => t[0] === 'teeth_status'), pts = T.find(t => t[0] === 'patients');
  const rows = await A.dashBackupRead(fake(2350), teeth, UID);
  ok(rows.length === 2350 && rows.every((r, i) => r.n === i), 'a table over 1000 rows is read whole, page after page');
  ok(calls.length === 3 && calls.every(c => c.order.join() === 'patient_id,tooth_num,surface' && c.eq.join() === 'doctor_id,' + UID), 'teeth_status pages are ordered by its primary key and filtered by the owner');
  calls.length = 0;
  await A.dashBackupRead(fake(5), pts, UID);
  ok(calls.length === 1 && calls[0].order.join() === 'id', 'a table with an id is ordered by it');
  let threw = false; calls.length = 0;
  try { await A.dashBackupRead(fake(5, 0), pts, UID); } catch (e) { threw = true; }
  ok(threw && calls.length === 1, 'a failed read is an error — never retried without an order');
  threw = false;
  try { await A.dashBackupRead(fake(2350, 1000), teeth, UID); } catch (e) { threw = true; }
  ok(threw, 'a failure on a later page fails the table (no half table in the file)');
  const good = [{ t: pts, rows: [] }, { t: teeth, rows: [] }], bad = [{ t: pts, rows: [] }, { t: teeth, error: true }];
  const v1 = A.dashBackupVerdict(good, 'xlsx'), v2 = A.dashBackupVerdict(bad, 'xlsx'), v3 = A.dashBackupVerdict(good, 'tsv');
  ok(v1.ok === true && v2.ok === false && /1 من 2/.test(v2.msg) && v3.ok === false && v3.msg !== v2.msg, 'only a complete xlsx is reported as a backup; a partial file or a text fallback is a warning');
  ok(/dashBackupVerdict\(results, kind\)/.test(ix) && /showToast\(v\.msg, !v\.ok/.test(ix) && /await window\.SyDentXlsx\.load\(\);[\s\S]{0,400}getUser/.test(ix) && !/ordered = false/.test(ix), 'the button uses the verdict, loads Excel before reading, and has no unordered retry');
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
  ['self foreign key not listed', 'rs', "const SELF_PARENT = { ledger_sessions: 'parent_id', patients: 'referred_by_patient_id' };", "const SELF_PARENT = { ledger_sessions: 'parent_id' };"],
  ['long text cut instead of split', 'ix', "if (typeof v !== 'string' || v.length <= DASH_BACKUP_LONG_PART) return v;", "if (typeof v !== 'string' || v.length <= DASH_BACKUP_LONG_PART) return v;\n  return v.slice(0, 32000);"],
  ['long part bigger than a cell', 'ix', 'var DASH_BACKUP_LONG_PART = 30000;', 'var DASH_BACKUP_LONG_PART = 40000;'],
  ['long parts joined out of order', 'rs', 'longs.get(k)[Number(x[1]) - 1] =', 'longs.get(k)[longs.get(k).length ? 0 : 1] ='],
  ['marker restored as data', 'rs', "if (!longs.has(m[1])) throw new Error(", "if (!longs.has(m[1])) return v; if (0) throw new Error("],
  ['marker matched inside ordinary text', 'rs', 'const LONG_MARK = /^⟦sydent-long:(\\d+)⟧$/;', 'const LONG_MARK = /⟦sydent-long:(\\d+)⟧/;'],
  ['old format refused', 'rs', "const FORMATS = ['sydent-backup/2', FORMAT];", 'const FORMATS = [FORMAT];'],
  ['consents left out', 'ix', "  ['patient_consents', 'owner_id', 'موافقات المرضى'],\n", ''],
  ['staff leaves before their employees', 'ix', "  ['staff_leaves', 'owner_id', 'إجازات الموظفين'],\n", ''],
  ['teeth_status read without its key', 'ix', "['teeth_status', 'doctor_id', 'حالة الأسنان', ['patient_id', 'tooth_num', 'surface']]", "['teeth_status', 'doctor_id', 'حالة الأسنان']"],
  ['pages not ordered', 'ix', "keys.forEach(function (k) { q = q.order(k, { ascending: true }); });", ''],
  ['read error swallowed', 'ix', 'if (r.error) throw r.error;', 'if (r.error) return out;'],
  ['partial backup reported as success', 'ix', 'if (failed.length) return { ok: false,', 'if (0) return { ok: false,'],
  ['text fallback reported as success', 'ix', "if (kind !== 'xlsx') return { ok: false,", "if (0) return { ok: false,"],
  ['check: page reads sheets out of step with the notes', 'ix', "var sheet = names[si++];", "var sheet = names[si];"],
  ['check: failed table counted as a sheet', 'ix', "if (r[2] === null || r[2] === '') { out.skipped.push(String(r[1])); return; }", ''],
  ['check: non-backup workbook accepted', 'ix', 'if (DASH_BACKUP_FORMATS.indexOf(fmt) < 0) return null;', ''],
  ['check: old format refused', 'ix', "var DASH_BACKUP_FORMATS = ['sydent-backup/2', DASH_BACKUP_FORMAT];", 'var DASH_BACKUP_FORMATS = [DASH_BACKUP_FORMAT];'],
  ['check: edited file not flagged', 'ix', 'if (rows.length !== Number(r[2])) out.broken = true;', ''],
  ['check: keyless table compared by id', 'ix', "var keys = t ? (t[3] || ['id']) : null,", "var keys = t ? ['id'] : null,"],
  ['check: missing rows not counted', 'ix', 'rep.missing += miss;', ''],
  ['check: unanswered table counted as missing', 'ix', "if (!t || !now || idx.some(function (i) { return i < 0; })) { if (tb.rows.length) rep.uncompared++; return; }", "if (!t || idx.some(function (i) { return i < 0; })) { return; } now = now || [];"],
  ['check: added rows not counted', 'ix', 'rep.added += Math.max(0, now.length - (tb.rows.length - miss));', ''],
  ['check: report hides the missing count', 'ix', "L.push('صفوف بالملف غير موجودة الآن: ' + rep.missing);", ''],
  ['check: report says all present when rows are missing', 'ix', "if (!rep.missing) L.push(", "if (rep.missing >= 0) L.push("],
  ['check: another account\'s file compared', 'ix', 'if (parsed.uid !== uid) {', 'if (false) {'],
  ['check: the page writes', 'ix', "await say('نتيجة فحص الملف',", "window.sb.from('patients').insert([]); await say('نتيجة فحص الملف',"],
  ['check: date left to flip inside the Arabic line', 'ix', "return s ? '\\u2066' + s + '\\u2069' : '—';", "return s || '—';"],
  ['verdict not used by the button', 'ix', 'showToast(v.msg, !v.ok', "showToast('💾', false"],
  ['parents-first sort unstable by depth', 'rs', 'a[0] - b[0] || a[1] - b[1]', 'a[1] - b[1]']
];

(async function () {
  const both = async (ix, rs) => run(ix, rs).concat(await runRead(ix));
  const base = await both(IX0, RS0);
  let pass = 0, fail = 0;
  base.forEach(([c, m]) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } });
  let bit = 0;
  if (process.argv.includes('--self-test')) {
    for (const [name, where, a, b] of MUTANTS) {
      const ix = where === 'ix' ? IX0.replace(a, b) : IX0;
      const rs = where === 'rs' ? RS0.replace(a, b) : RS0;
      if (ix === IX0 && rs === RS0) { console.log('MUTANT DID NOT APPLY: ' + name); continue; }
      let res;
      try { res = await both(ix, rs); } catch (e) { res = [[false, String(e)]]; }
      if (res.some(([c]) => !c)) bit++; else console.log('MUTANT SURVIVED: ' + name);
    }
  }
  const all = !process.argv.includes('--self-test') || bit === MUTANTS.length;
  console.log((fail === 0 && all ? '✅' : '❌') + ' prove-backup-restore: ' + pass + '/' + (pass + fail) +
    (process.argv.includes('--self-test') ? ' · mutants ' + bit + '/' + MUTANTS.length : ''));
  process.exit(fail === 0 && all ? 0 : 1);
})();

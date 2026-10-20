#!/usr/bin/env node
/* backup-restore.js — turns a clinic's «💾 نسخة احتياطية» Excel file (format sydent-backup/2,
   written by dashBackupBuild in index.html) back into SQL that restores the rows it holds.

   Restore is additive: every row is inserted with ON CONFLICT DO NOTHING, so rows still in the
   database (including ones edited after the backup) are left alone and only missing rows come
   back. User triggers of the table are switched off for the insert and back on in the same
   transaction (no audit rows, no updated_at rewrite, no signup seeding); foreign keys stay on,
   so files run parent tables first. Photos and files are not in the backup; they live in Storage.

   Each SQL file is self-contained: a pg_temp helper reads the target's own column types, so
   jsonb/array cells (written as JSON text) are parsed back, generated columns and columns the
   target no longer has are skipped, and missing columns take their defaults.

   Steps (see docs/reference/RESTORE_FROM_BACKUP_AR.md):
     1. node scripts/backup-restore.js <backup.xlsx> --out <dir>
          [--to-owner <uuid>]   restore into a different account (rewrites the backup's account id)
          [--only t1,t2]        restore only these tables
          [--chunk 300]         rows per SQL file
     2. Run <dir>/00-compare.sql first: per table, rows in the backup and how many are missing now.
     3. Run the numbered restore files in order; each returns the rows it inserted. Each file is
        one transaction, so a file that fails changes nothing; one that fails on a foreign key
        can simply be run again after the files it depends on.

   The backup file holds patient data: keep it and <dir> out of the repository. */
'use strict';
const fs = require('fs');
const path = require('path');

const FORMAT = 'sydent-backup/2';
const META_ROWS = 3;   // الصيغة · الحساب · تاريخ النسخة

function loadXLSX() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'xlsx-0.18.5.full.min.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', src)(mod, mod.exports, require);
  return mod.exports;
}

function args(argv) {
  const o = { file: null, out: null, toOwner: null, only: null, chunk: 300 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--to-owner') o.toOwner = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--chunk') o.chunk = Math.max(1, parseInt(argv[++i], 10) || 300);
    else if (!o.file) o.file = a;
    else throw new Error('unknown argument: ' + a);
  }
  if (!o.file || !o.out) throw new Error('usage: backup-restore.js <backup.xlsx> --out <dir> [--to-owner uuid] [--only t1,t2] [--chunk n]');
  return o;
}

/* Reads the workbook into { uid, stamp, tables: [{ table, sheet, rows: [obj] }], skipped: [table] }.
   Data sheets follow the notes sheet in the order of the notes rows that carry a row count. */
function readBackup(XLSX, buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const names = wb.SheetNames;
  const aoa = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
  const notes = aoa(names[0]);
  // notes[0] = headers; then the meta rows
  const meta = notes.slice(1, 1 + META_ROWS);
  if (!meta[0] || meta[0][1] !== FORMAT) throw new Error('not a ' + FORMAT + ' backup (format cell: ' + (meta[0] && meta[0][1]) + ')');
  const uid = String(meta[1][1] || '');
  const stamp = String(meta[2][1] || '');
  const tables = [], skipped = [];
  let sheetIdx = 1;
  notes.slice(1 + META_ROWS).forEach(r => {
    if (!r || !r[1]) return;
    if (r[2] === null || r[2] === '') { skipped.push(r[1]); return; }
    const sheet = names[sheetIdx++];
    if (!sheet) throw new Error('missing sheet for table ' + r[1]);
    const grid = aoa(sheet);
    const head = grid[0] || [];
    const rows = grid.slice(1).filter(x => x && x.some(v => v !== null)).map(x => {
      const o = {};
      head.forEach((h, i) => { if (h !== null) o[h] = (i < x.length ? x[i] : null); });
      return o;
    });
    if (rows.length !== Number(r[2])) throw new Error(r[1] + ': notes say ' + r[2] + ' rows, sheet has ' + rows.length);
    tables.push({ table: String(r[1]), sheet, rows });
  });
  return { uid, stamp, tables, skipped };
}

function quoteTag(json) {
  let tag = '$sydent_restore$', k = 0;
  while (json.indexOf(tag) >= 0) tag = '$sydent_restore' + (++k) + '$';
  return tag;
}
const ident = s => '"' + String(s).replace(/"/g, '""') + '"';

/* pg_temp helpers, defined inside each file's transaction. sydent_fix turns one backup row into
   the target's shape: keys the target lacks and generated columns are dropped, and JSON text in
   json/jsonb/array columns is parsed back. */
const HELPERS = `create function pg_temp.sydent_fix(t text, r jsonb) returns jsonb language sql stable as $f$
  select coalesce(jsonb_object_agg(e.k, case when c.data_type in ('json','jsonb','ARRAY') and jsonb_typeof(e.v) = 'string'
                                             then (e.v #>> '{}')::jsonb else e.v end), '{}'::jsonb)
    from jsonb_each(r) e(k, v)
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = t and c.column_name = e.k and c.is_generated <> 'ALWAYS'
$f$;
create function pg_temp.sydent_restore(t text, data jsonb) returns table(table_name text, in_file int, inserted int)
language plpgsql as $f$
declare cols text; n int;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = t and c.is_generated <> 'ALWAYS'
     and exists (select 1 from jsonb_array_elements(data) x where x ? c.column_name);
  if cols is null then return query select t, jsonb_array_length(data), 0; return; end if;
  execute format('alter table public.%I disable trigger user', t);
  execute format('with ins as (insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, '
              || '(select jsonb_agg(pg_temp.sydent_fix(%L, x)) from jsonb_array_elements($1) x)) '
              || 'on conflict do nothing returning 1) select count(*)::int from ins', t, cols, cols, t, t)
    into n using data;
  execute format('alter table public.%I enable trigger user', t);
  return query select t, jsonb_array_length(data), n;
end $f$;
`;

/* Builds { compare, files: [{ name, sql, table, rows }], report } without touching the database. */
function plan(backup, opts) {
  opts = opts || {};
  const chunk = opts.chunk || 300;
  const files = [], report = [], cmp = [];
  let n = 0;
  backup.tables.forEach(tb => {
    if (opts.only && opts.only.indexOf(tb.table) < 0) return;
    if (!tb.rows.length) return;
    const rows = tb.rows.map(r => {
      const o = {};
      Object.keys(r).forEach(c => {
        let v = r[c];
        if (v === undefined) v = null;
        if (opts.toOwner && backup.uid && v === backup.uid) v = opts.toOwner;
        o[c] = v;
      });
      return o;
    });
    if ('id' in rows[0]) {
      const ids = JSON.stringify(rows.map(r => r.id).filter(x => x !== null).map(String));
      const tag = quoteTag(ids);
      cmp.push("select '" + tb.table + "' as table_name, " + rows.length + ' as in_backup, ' +
        '(select count(*) from jsonb_array_elements_text(' + tag + ids + tag + '::jsonb) b(id) ' +
        'where not exists (select 1 from public.' + ident(tb.table) + ' x where x.id::text = b.id)) as missing_now');
    } else {
      cmp.push("select '" + tb.table + "' as table_name, " + rows.length + ' as in_backup, null::bigint as missing_now');
    }
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const json = JSON.stringify(part);
      const tag = quoteTag(json);
      const sql = 'begin;\n' + HELPERS +
        "select * from pg_temp.sydent_restore('" + tb.table + "', " + tag + json + tag + '::jsonb);\ncommit;\n';
      n++;
      files.push({ name: String(n).padStart(3, '0') + '-' + tb.table + '.sql', sql, table: tb.table, rows: part.length });
    }
  });
  return { compare: cmp.join('\nunion all\n') + '\norder by 1;\n', files, report };
}

function main() {
  const o = args(process.argv.slice(2));
  const XLSX = loadXLSX();
  const backup = readBackup(XLSX, fs.readFileSync(o.file));
  const p = plan(backup, { toOwner: o.toOwner, only: o.only, chunk: o.chunk });
  fs.mkdirSync(o.out, { recursive: true });
  fs.writeFileSync(path.join(o.out, '00-compare.sql'), p.compare);
  p.files.forEach(f => fs.writeFileSync(path.join(o.out, f.name), f.sql));
  console.log('backup of account ' + backup.uid + ' taken ' + backup.stamp);
  console.log(backup.tables.length + ' tables · ' + backup.tables.reduce((a, t) => a + t.rows.length, 0) + ' rows · ' + p.files.length + ' restore files → ' + o.out);
  if (backup.skipped.length) console.log('tables that failed to read at backup time: ' + backup.skipped.join(', '));
  p.report.forEach(l => console.log('! ' + l));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
module.exports = { loadXLSX, readBackup, plan, HELPERS, FORMAT };

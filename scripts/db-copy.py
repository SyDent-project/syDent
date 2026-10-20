#!/usr/bin/env python3
"""Copy whole clinic accounts from one Supabase project to another, through the Management API
(POST /v1/projects/{ref}/database/query) with SUPABASE_ACCESS_TOKEN. Rows travel straight from source to
target inside the CI runner.

    python3 scripts/db-copy.py --from <ref> --to <ref> --list
        one line per account: id · masked email · clinic name · admin · patients · sessions · staff-of.
    python3 scripts/db-copy.py --from <ref> --to <ref> --ids <uuid,uuid> [--dry-run]
    python3 scripts/db-copy.py --from <ref> --to <ref> --emails <a@x,b@y> [--dry-run]

What is copied: the chosen auth users (password hashes included, so people keep their email and password),
the staff logins of their clinics, and every row of every clinic table that belongs to them. The tables are
read from the target's catalogue, so a table added later is copied without editing this file. A table is
tied to its account by owner_id / doctor_id / clinic_id / user_id, or through its parent's foreign key
(perio_measurements → perio_exams). Platform tables (plans, settings, templates) are never copied.

Writes run with session_replication_role = replica: no triggers fire (no signup seeding, no audit rows, no
guards meant for live edits) and foreign keys are not re-checked, because the rows are an existing,
consistent clinic. Upsert, never delete: each row is UPDATEd on its primary key and INSERTed when missing,
so a re-run is safe. Sequences are moved past the copied ids at the end.

An account whose email already exists in the target under another id is skipped (reported, not written).
A row that breaks a CHECK rule added after it was written (e.g. an old cancelled request) is left out and
counted; any other error stops the copy.
"""
import json, os, sys, urllib.request, urllib.error

PLATFORM = {'subscription_plans', 'platform_settings', 'platform_settings_audit', 'notification_templates',
            'login_resolve_hits'}
OWNER_COLS = ['owner_id', 'doctor_id', 'clinic_id', 'user_id']
# Same data under another column name in the target (the old project ran upstream's inventory round).
RENAME = {'public.inventory_batches': {'lot_no': 'lot'}}
CHUNK_BYTES = 700000

UPSERT = r'''
CREATE TEMP TABLE IF NOT EXISTS _dbcopy_skip (t text, err text);
TRUNCATE pg_temp._dbcopy_skip;
DO $do$
DECLARE d jsonb := $json$__DATA__$json$::jsonb; t text := d->>'table'; r jsonb; ins_cols text; upd_cols text;
        keys text[]; cond text; n int; ins int := 0; upd int := 0;
BEGIN
  SET LOCAL session_replication_role = replica;
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position),
         string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FILTER (WHERE coalesce(identity_generation,'') <> 'ALWAYS')
    INTO ins_cols, upd_cols
    FROM information_schema.columns
   WHERE table_schema = split_part(t,'.',1) AND table_name = split_part(t,'.',2)
     AND is_generated = 'NEVER' AND (d->'rows'->0) ? column_name;
  IF ins_cols IS NULL THEN RETURN; END IF;
  SELECT array_agg(a.attname ORDER BY a.attnum) INTO keys FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
   WHERE i.indrelid = t::regclass AND i.indisprimary;
  SELECT string_agg(format('t.%1$I = s.%1$I', k), ' AND ') INTO cond FROM unnest(keys) k;
  cond := coalesce(cond, 'false');
  FOR r IN SELECT jsonb_array_elements(d->'rows') LOOP
    n := 0;
    IF upd_cols IS NOT NULL THEN
      EXECUTE format('UPDATE %s AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1)) FROM jsonb_populate_record(NULL::%s, $1) s WHERE %s',
                     t, upd_cols, upd_cols, t, t, cond) USING r;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
    IF n = 0 THEN
      BEGIN
        EXECUTE format('INSERT INTO %s (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::%s, $1)', t, ins_cols, ins_cols, t) USING r;
        ins := ins + 1;
      EXCEPTION WHEN check_violation THEN   -- an old row that predates a stricter rule: left out and counted
        INSERT INTO pg_temp._dbcopy_skip VALUES (t, SQLERRM);
      END;
    ELSE upd := upd + 1; END IF;
  END LOOP;
END $do$;
SELECT count(*)::int AS skipped, string_agg(DISTINCT err, ' | ') AS why FROM pg_temp._dbcopy_skip;
'''

# Every serial / identity column of the given tables moves past its highest copied value.
RESEQ = r'''
DO $do$
DECLARE c record; s text; m bigint;
BEGIN
  FOR c IN SELECT table_schema, table_name, column_name FROM information_schema.columns
            WHERE (table_schema || '.' || table_name) = ANY(ARRAY[__TABLES__]::text[])
              AND (column_default LIKE 'nextval(%' OR is_identity = 'YES') LOOP
    s := pg_get_serial_sequence(quote_ident(c.table_schema) || '.' || quote_ident(c.table_name), c.column_name);
    IF s IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT max(%I)::bigint FROM %I.%I', c.column_name, c.table_schema, c.table_name) INTO m;
    IF m IS NOT NULL THEN PERFORM setval(s, greatest(m, (SELECT last_value FROM pg_sequences WHERE schemaname || '.' || sequencename = s))); END IF;
  END LOOP;
END $do$;
'''


def api(ref, token, sql):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/%s/database/query' % ref,
                                 data=json.dumps({'query': sql}).encode('utf-8'), method='POST',
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raise RuntimeError('HTTP %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:800]))


def one(res):
    return (res[0] if isinstance(res, list) and res else {}) or {}


def arg(argv, name):
    return argv[argv.index(name) + 1] if name in argv else None


def q(s):
    return "'%s'" % str(s).replace("'", "''")


def mask(email):
    e = str(email or '')
    if '@' not in e: return '***'
    user, dom = e.split('@', 1)
    return user[:3] + '***@' + dom


def catalogue(ref, token):
    """public tables → {cols:set, fks:[(col, parent_table)]} on one project."""
    cols = one(api(ref, token, "select coalesce(jsonb_object_agg(table_name, c), '{}'::jsonb) as j from ("
                               "select table_name, jsonb_agg(column_name) c from information_schema.columns "
                               "where table_schema = 'public' and table_name in (select relname from pg_class where "
                               "relnamespace = 'public'::regnamespace and relkind = 'r') group by table_name) x")).get('j') or {}
    fks = api(ref, token, "select c.conrelid::regclass::text as t, a.attname as col, c.confrelid::regclass::text as parent "
                          "from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] "
                          "where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1") or []
    out = {t: {'cols': set(c), 'fks': []} for t, c in cols.items()}
    for f in fks:
        t = f['t'].split('.')[-1]
        if t in out: out[t]['fks'].append((f['col'], f['parent']))
    return out


def plan(tcat, scat):
    """Tables to copy, in foreign-key order, each with its source filter (SQL with {who})."""
    filt = {}
    for t, info in tcat.items():
        if t in PLATFORM or t not in scat: continue
        if t == 'doctors': filt[t] = 'id in ({who})'; continue
        col = next((c for c in OWNER_COLS if c in info['cols'] and c in scat[t]['cols']), None)
        if col: filt[t] = '%s in ({who})' % col
    for _ in range(3):   # tables owned only through a parent (one or two hops)
        for t, info in tcat.items():
            if t in filt or t in PLATFORM or t not in scat: continue
            for col, parent in info['fks']:
                p = parent.split('.')[-1]
                if parent.startswith('auth.') or p not in filt or p == t: continue
                filt[t] = '%s in (select id from public.%s where %s)' % (col, p, filt[p]); break
    order, seen = [], set()
    def visit(t, stack=()):
        if t in seen or t in stack: return
        for _col, parent in tcat[t]['fks']:
            p = parent.split('.')[-1]
            if p in filt and p != t: visit(p, stack + (t,))
        seen.add(t); order.append(t)
    for t in sorted(filt): visit(t)
    skipped = sorted(t for t in tcat if t not in filt and t not in PLATFORM)
    return [(t, filt[t]) for t in order], skipped


def list_accounts(src, dst, token):
    rows = api(src, token, """
      select u.id, u.email, d.name, (pa.user_id is not null) as admin,
             (select count(*) from public.patients p where p.doctor_id = u.id)::int as patients,
             (select count(*) from public.ledger_sessions s where s.doctor_id = u.id)::int as sessions,
             (select cd.owner_id from public.clinic_doctors cd where cd.user_id = u.id and cd.owner_id <> u.id limit 1) as staff_of,
             to_char(u.last_sign_in_at, 'YYYY-MM-DD') as last_in
        from auth.users u left join public.doctors d on d.id = u.id
        left join public.platform_admins pa on pa.user_id = u.id
       order by u.created_at""") or []
    taken = set(r['email'].lower() for r in (api(dst, token, 'select lower(email) as email from auth.users') or []) if r.get('email'))
    print('%-36s  %-26s  %-24s %-5s %4s %5s  %-10s %s' % ('id', 'email', 'clinic', 'admin', 'pts', 'sess', 'last in', 'note'))
    for r in rows:
        note = []
        if r.get('staff_of'): note.append('staff of ' + r['staff_of'][:8])
        if (r.get('email') or '').lower() in taken: note.append('EMAIL ALREADY IN TARGET')
        print('%-36s  %-26s  %-24s %-5s %4d %5d  %-10s %s' % (r['id'], mask(r.get('email')), (r.get('name') or '—')[:24],
              'yes' if r.get('admin') else '', r.get('patients') or 0, r.get('sessions') or 0, r.get('last_in') or '—', ' · '.join(note)))
    return 0


def copy_plans(src, dst, token, dry):
    """The subscription plans of the source replace the target's, row for row by code (upsert).
    Target plans the source does not have are switched off, not deleted (subscribers may point at them)."""
    rows = one(api(src, token, "select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.code), '[]'::jsonb) as j "
                                "from public.subscription_plans p")).get('j') or []
    if not rows: print('⛔ the source has no plans'); return 1
    have = [r['code'] for r in (api(dst, token, 'select code from public.subscription_plans') or [])]
    for r in rows:
        print('%-10s %-12s active=%-5s monthly=%s quarterly=%s yearly=%s USD · %s' % (
            r.get('code'), r.get('display_name'), r.get('is_active'), r.get('price_monthly_usd'),
            r.get('price_quarterly_usd'), r.get('price_yearly_usd'), json.dumps(r.get('entitlements'), ensure_ascii=False)))
    extra = [c for c in have if c not in {r['code'] for r in rows}]
    if extra: print('target-only plans (will be switched off): ' + ', '.join(extra))
    if dry: print('dry run — nothing written · %d plans' % len(rows)); return 0
    payload = json.dumps({'table': 'public.subscription_plans', 'rows': rows}, ensure_ascii=False)
    if '$json$' in payload: print('⛔ plans contain the quoting tag'); return 1
    api(dst, token, UPSERT.replace('__DATA__', payload))
    if extra:
        api(dst, token, 'update public.subscription_plans set is_active = false where code in (%s)' % ','.join(q(c) for c in extra))
    print('✅ %d plans copied%s' % (len(rows), (' · %d switched off' % len(extra)) if extra else ''))
    return 0


def main(argv):
    src, dst = arg(argv, '--from'), arg(argv, '--to')
    if not src or not dst or src == dst:
        print(__doc__); return 2
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token: print('⛔ SUPABASE_ACCESS_TOKEN is not set'); return 2
    if '--list' in argv: return list_accounts(src, dst, token)
    if '--plans' in argv: return copy_plans(src, dst, token, '--dry-run' in argv)

    ids = [i.strip() for i in (arg(argv, '--ids') or '').split(',') if i.strip()]
    emails = [e.strip().lower() for e in (arg(argv, '--emails') or '').split(',') if e.strip()]
    if not ids and not emails:
        print('⛔ choose the accounts with --ids or --emails (run --list first)'); return 2
    if any(len(i) != 36 or i.count('-') != 4 for i in ids):
        print('⛔ --ids must be account uuids'); return 2
    where = []
    if ids: where.append('id in (%s)' % ','.join(q(i) for i in ids))
    if emails: where.append('lower(email) in (%s)' % ','.join(q(e) for e in emails))
    chosen = api(src, token, 'select id, email from auth.users where ' + ' or '.join(where)) or []
    if not chosen: print('⛔ no matching accounts in the source'); return 1

    # the staff logins of the chosen clinics come with them
    owner_list = ','.join(q(c['id']) for c in chosen)
    staff = api(src, token, 'select u.id, u.email from auth.users u where u.id in (select user_id from public.clinic_doctors '
                            'where owner_id in (%s) and user_id is not null) and u.id not in (%s)' % (owner_list, owner_list)) or []
    accounts = chosen + staff
    taken = {r['email'].lower(): r['id'] for r in (api(dst, token, 'select id, lower(email) as email from auth.users') or []) if r.get('email')}
    keep = []
    for a in accounts:
        other = taken.get((a.get('email') or '').lower())
        if other and other != a['id']:
            print('⏭️  skipped %s — that email is already a different account in the target' % mask(a.get('email')))
        else:
            keep.append(a)
    if not keep: print('⛔ nothing left to copy'); return 1
    owners = [a for a in chosen if a in keep]
    print('accounts: %d chosen · %d staff logins · %d to copy' % (len(chosen), len(staff), len(keep)))

    who_users = ','.join(q(a['id']) for a in keep)
    who = ','.join(q(a['id']) for a in owners) or "'00000000-0000-0000-0000-000000000000'"
    tables, skipped = plan(catalogue(dst, token), catalogue(src, token))
    work = [('auth.users', 'id in (%s)' % who_users), ('auth.identities', 'user_id in (%s)' % who_users)]
    work += [('public.' + t, f.replace('{who}', who)) for t, f in tables]

    data, total = [], 0
    for t, f in work:
        rows = one(api(src, token, "select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from %s x where %s" % (t, f))).get('j') or []
        for old, new in RENAME.get(t, {}).items():
            for r in rows:
                if old in r and r.get(new) is None: r[new] = r.pop(old)
        total += len(rows)
        if rows: print('%-34s %5d rows' % (t, len(rows)))
        data.append((t, rows))
    if skipped: print('not tied to an account (left out): ' + ', '.join(skipped))
    docs = sum(len(r) for t, r in data if t == 'public.patient_documents')
    if docs: print('⚠️  %d patient_documents rows: their files live in Storage and are NOT copied by this script' % docs)
    if '--dry-run' in argv:
        print('dry run — nothing written · %d rows' % total); return 0

    for t, rows in data:
        if not rows: continue
        chunk, size = [], 0
        for r in rows + [None]:
            s = json.dumps(r, ensure_ascii=False) if r is not None else ''
            if r is None or (chunk and size + len(s) > CHUNK_BYTES):
                payload = json.dumps({'table': t, 'rows': chunk}, ensure_ascii=False)
                if '$json$' in payload: print('⛔ %s: data contains the quoting tag' % t); return 1
                try:
                    res = one(api(dst, token, UPSERT.replace('__DATA__', payload)))
                except Exception as e:
                    print('⛔ %s failed: %s' % (t, e)); return 1
                if res.get('skipped'):
                    print('⏭️  %s: %d old row(s) left out — %s' % (t, res['skipped'], (res.get('why') or '')[:200]))
                chunk, size = [], 0
            if r is not None: chunk.append(r); size += len(s)
        print('✓ %s' % t)
    api(dst, token, RESEQ.replace('__TABLES__', ','.join(q(t) for t, rows in data if rows)))
    check = one(api(dst, token, "select count(*)::int as n from auth.users where id in (%s)" % who_users))
    print('✅ copied %d rows · %d of %d accounts present in the target' % (total, check.get('n', 0), len(keep)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

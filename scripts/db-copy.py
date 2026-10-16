#!/usr/bin/env python3
"""Copy clinic accounts (auth users with their password hashes, and their clinic rows) from one Supabase
project to another, through the Management API (POST /v1/projects/{ref}/database/query) with
SUPABASE_ACCESS_TOKEN. The rows travel straight from source to target inside the CI runner: nothing is
printed but table names and row counts.

Upsert, never delete: every row is UPDATEd on its key in the target and INSERTed when missing, so a re-run
is safe. Inserting an auth user fires the signup triggers on the target (doctor row, treatment catalogue,
owner card); those rows are then matched on their natural keys (KEYS below) and overwritten with the
source's, ids included, before anything that points at them is copied.

    python3 scripts/db-copy.py --from <ref> --to <ref> [--emails a@x,b@y] [--dry-run]
"""
import json, os, sys, urllib.request, urllib.error

# Copy order follows the foreign keys. Platform-wide tables (plans, settings, templates) are not copied:
# the target has its own seeds.
TABLES = [
    'auth.users', 'auth.identities',
    'public.doctors', 'public.clinic_doctors', 'public.clinic_settings', 'public.clinic_employees',
    'public.treatments', 'public.patient_seq', 'public.patients', 'public.ledger_sessions',
    'public.teeth_status', 'public.trial_requests', 'public.subscription_events',
    'public.platform_admins', 'public.audit_log',
]
# Tables whose target rows may already exist under another id (made by the signup triggers).
KEYS = {
    'public.clinic_doctors': ['owner_id', 'user_id'],
    'public.treatments': ['doctor_id', 'treatment_key'],
}
# Which column ties a row to its account, to copy only the chosen accounts.
OWNER = {
    'auth.users': 'id', 'auth.identities': 'user_id', 'public.doctors': 'id', 'public.clinic_doctors': 'owner_id',
    'public.clinic_settings': 'doctor_id', 'public.clinic_employees': 'owner_id', 'public.treatments': 'doctor_id',
    'public.patient_seq': 'doctor_id', 'public.patients': 'doctor_id', 'public.ledger_sessions': 'doctor_id',
    'public.teeth_status': 'doctor_id', 'public.trial_requests': 'user_id', 'public.subscription_events': 'user_id',
    'public.platform_admins': 'user_id', 'public.audit_log': 'user_id',
}

UPSERT = r'''
DO $do$
DECLARE d jsonb := $json$__DATA__$json$::jsonb; t text; r jsonb; cols text; keys text[]; cond text; n int; ins int; upd int;
BEGIN
  FOR t IN SELECT jsonb_array_elements_text(d->'order') LOOP
    SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns
     WHERE table_schema = split_part(t,'.',1) AND table_name = split_part(t,'.',2)
       AND is_generated = 'NEVER' AND coalesce(identity_generation,'') <> 'ALWAYS'
       AND (d->'rows'->t->0) ? column_name;
    IF cols IS NULL THEN CONTINUE; END IF;
    IF d->'keys' ? t THEN SELECT array_agg(x) INTO keys FROM jsonb_array_elements_text(d->'keys'->t) x;
    ELSE SELECT array_agg(a.attname ORDER BY a.attnum) INTO keys FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = t::regclass AND i.indisprimary;
    END IF;
    SELECT string_agg(format('t.%1$I = s.%1$I', k), ' AND ') INTO cond FROM unnest(keys) k;
    ins := 0; upd := 0;
    FOR r IN SELECT jsonb_array_elements(coalesce(d->'rows'->t, '[]'::jsonb)) LOOP
      EXECUTE format('UPDATE %s AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1)) FROM jsonb_populate_record(NULL::%s, $1) s WHERE %s',
                     t, cols, cols, t, t, cond) USING r;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN
        EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1)', t, cols, cols, t) USING r;
        ins := ins + 1;
      ELSE upd := upd + 1; END IF;
    END LOOP;
    RAISE NOTICE '% inserted % updated %', t, ins, upd;
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


def arg(argv, name):
    return argv[argv.index(name) + 1] if name in argv else None


def main(argv):
    src, dst = arg(argv, '--from'), arg(argv, '--to')
    if not src or not dst or src == dst:
        print(__doc__); return 2
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token: print('⛔ SUPABASE_ACCESS_TOKEN is not set'); return 2
    emails = [e.strip().lower() for e in (arg(argv, '--emails') or '').split(',') if e.strip()]
    who = "select id from auth.users" + (" where lower(email) in (%s)" % ','.join("'%s'" % e.replace("'", "''") for e in emails) if emails else '')
    rows, total = {}, 0
    for t in TABLES:
        res = api(src, token, "select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from %s x where x.%s in (%s)" % (t, OWNER[t], who))
        rows[t] = (res[0] or {}).get('j') or []
        total += len(rows[t])
        print('%-28s %4d rows' % (t, len(rows[t])))
    if not rows['auth.users']:
        print('⛔ no matching accounts in the source'); return 1
    if '--dry-run' in argv:
        print('dry run — nothing written'); return 0
    data = json.dumps({'order': TABLES, 'keys': KEYS, 'rows': rows}, ensure_ascii=False)
    if '$json$' in data: print('⛔ data contains the quoting tag'); return 1
    api(dst, token, UPSERT.replace('__DATA__', data))
    check = api(dst, token, "select count(*)::int as n from auth.users where id in (%s)" % ','.join("'%s'" % u['id'] for u in rows['auth.users']))
    print('✅ copied %d rows · %d of %d accounts present in the target' % (total, check[0]['n'], len(rows['auth.users'])))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

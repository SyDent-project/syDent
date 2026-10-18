#!/usr/bin/env python3
"""Copy the Storage files of chosen accounts from one Supabase project to another.

Clinic files live under <owner uuid>/... in the patient-files and payment-receipts buckets; db-copy.py moves
the rows that point at them, this moves the files. The service keys of both projects are read through the
Management API with SUPABASE_ACCESS_TOKEN and stay inside the runner; the log shows counts and sizes only.

    python3 scripts/storage-copy.py --from <ref> --to <ref> --ids <uuid,uuid> [--dry-run]

Upload is an upsert (x-upsert), so a re-run is safe.
"""
import json, os, sys, urllib.parse, urllib.request, urllib.error

BUCKETS = ['patient-files', 'payment-receipts']


def http(method, url, headers, data=None, timeout=300):
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError('HTTP %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:400]))


def mgmt(token, path, body=None):
    h = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    raw = http('POST' if body is not None else 'GET', 'https://api.supabase.com/v1' + path, h,
               json.dumps(body).encode('utf-8') if body is not None else None)
    return json.loads(raw or b'null')


def service_key(token, ref):
    keys = mgmt(token, '/projects/%s/api-keys?reveal=true' % ref) or []
    for k in keys:
        if k.get('name') == 'service_role' and k.get('api_key'): return k['api_key']
    for k in keys:
        if k.get('type') == 'secret' and k.get('api_key'): return k['api_key']
    raise RuntimeError('no service key readable on %s' % ref)


def main(argv):
    arg = lambda n: argv[argv.index(n) + 1] if n in argv else None
    src, dst = arg('--from'), arg('--to')
    ids = [i.strip() for i in (arg('--ids') or '').split(',') if i.strip()]
    if not src or not dst or src == dst or not ids or any(len(i) != 36 or i.count('-') != 4 for i in ids):
        print(__doc__); return 2
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token: print('⛔ SUPABASE_ACCESS_TOKEN is not set'); return 2
    q = lambda s: "'%s'" % s.replace("'", "''")
    sql = ("select bucket_id, name, coalesce(metadata->>'mimetype', 'application/octet-stream') as mime, "
           "coalesce((metadata->>'size')::bigint, 0) as size from storage.objects where bucket_id in (%s) "
           "and split_part(name, '/', 1) in (%s) order by bucket_id, name" % (','.join(map(q, BUCKETS)), ','.join(map(q, ids))))
    objs = mgmt(token, '/projects/%s/database/query' % src, {'query': sql}) or []
    total = sum(int(o['size'] or 0) for o in objs)
    for b in BUCKETS:
        n = [o for o in objs if o['bucket_id'] == b]
        print('%-18s %4d files · %.1f MB' % (b, len(n), sum(int(o['size'] or 0) for o in n) / 1048576))
    if not objs: print('nothing to copy'); return 0
    have = mgmt(token, '/projects/%s/database/query' % dst, {'query': 'select id from storage.buckets'}) or []
    missing = sorted(set(o['bucket_id'] for o in objs) - set(b['id'] for b in have))
    if missing: print('⛔ target has no bucket: ' + ', '.join(missing)); return 1
    if '--dry-run' in argv: print('dry run — nothing written · %.1f MB' % (total / 1048576)); return 0

    skey, dkey = service_key(token, src), service_key(token, dst)
    surl, durl = 'https://%s.supabase.co' % src, 'https://%s.supabase.co' % dst
    ok = 0
    for o in objs:
        path = '/'.join(urllib.parse.quote(p) for p in o['name'].split('/'))
        try:
            body = http('GET', '%s/storage/v1/object/%s/%s' % (surl, o['bucket_id'], path),
                        {'Authorization': 'Bearer ' + skey, 'apikey': skey})
            http('POST', '%s/storage/v1/object/%s/%s' % (durl, o['bucket_id'], path),
                 {'Authorization': 'Bearer ' + dkey, 'apikey': dkey, 'Content-Type': o['mime'], 'x-upsert': 'true'}, body)
            ok += 1
        except Exception as e:
            print('⛔ file %d of %d failed: %s' % (objs.index(o) + 1, len(objs), str(e)[:300])); return 1
    print('✅ copied %d of %d files · %.1f MB' % (ok, len(objs), total / 1048576))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

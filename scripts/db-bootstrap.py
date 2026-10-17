#!/usr/bin/env python3
"""A9 — build a fresh Supabase project (dental-prod) to the same schema as dental-dev.

`db/schema.sql` is a snapshot that predates several numbered migrations, so a project built from it
alone misses them (that is how dental-dev ended up without series, production goal, lab redo, referrer
and the inventory RPCs). This script applies everything in one fixed order:

    db/schema.sql → migrations/bootstrap/01–03 → the numbered migrations newer than the snapshot

Each file is split into statements (dollar-quote and comment aware) and sent in batches through the
Supabase Management API (POST /v1/projects/{ref}/database/query) with SUPABASE_ACCESS_TOKEN.
It stops at the first error and says which file and batch failed.

Safety: it refuses to run on a project whose `public` schema already has tables, unless
--allow-existing is given (every file is idempotent, but a fresh build is the only intended use).

    python3 scripts/db-bootstrap.py --list                      # print the plan, send nothing
    python3 scripts/db-bootstrap.py --check                     # split every file, print batch counts
    SUPABASE_ACCESS_TOKEN=… python3 scripts/db-bootstrap.py --project <ref>
    python3 scripts/db-bootstrap.py --emit-dir DIR              # write the batches as .sql files (local test)
    SUPABASE_ACCESS_TOKEN=… python3 scripts/db-bootstrap.py --project <ref> --from migrations/175_x.sql
                                                                # existing project: apply the plan from that file on
"""
import json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# The numbered migrations whose objects are absent from db/schema.sql (checked object by object, Oct 2026).
# Keep this list in the order they were written; add every new numbered migration here.
AFTER_SNAPSHOT = [
    'migrations/157_appointment_series.sql',
    'migrations/159_production_goal.sql',
    'migrations/160_lab_order_redos.sql',
    'migrations/161_treatment_lab_days.sql',
    'migrations/162_patient_documents_lab_order.sql',
    'migrations/163_lab_links_tenant_guard.sql',
    'migrations/164_patient_referrer.sql',
    'migrations/169_inventory_atomic_consume.sql',
    'migrations/171_inventory_counts.sql',
    'migrations/172_inventory_suppliers_orders.sql',
    'migrations/173_inventory_lot.sql',
    'migrations/174_inventory_hardening.sql',
    # upstream v642 (merged Oct 2026): staff realtime, intake, portal, chart dx, x-rays
    'migrations/175_realtime_staff_messages.sql',
    'migrations/176_supernumerary_surface.sql',
    'migrations/177_patient_intake.sql',
    'migrations/178_intake_template_realtime.sql',
    'migrations/179_teeth_status_dx.sql',
    'migrations/180_patient_portal.sql',
    'migrations/181_portal_intake_state.sql',
    'migrations/182_portal_confirm.sql',
    'migrations/183_intake_extras_as_flags.sql',
    'migrations/184_booking_arabic_digits.sql',
    'migrations/185_realtime_live_app.sql',
    'migrations/186_realtime_staff_audit.sql',
    'migrations/187_portal_history_changes.sql',
    'migrations/188_portal_requests_hardening.sql',
    'migrations/189_portal_slot_picker.sql',
    'migrations/190_portal_cancel_approve.sql',
    'migrations/191_portal_rejected_notice.sql',
    'migrations/192_xray_core.sql',
    'migrations/193_portal_xrays.sql',
    'migrations/194_fk_indexes_and_grants.sql',
    'migrations/195_teeth_history_tenant_delete.sql',
]
PLAN = (['db/schema.sql',
         'migrations/bootstrap/01_storage_rebuild.sql',
         'migrations/bootstrap/02_auth_triggers_rebuild.sql',
         'migrations/bootstrap/03_seed_platform_defaults.sql'] + AFTER_SNAPSHOT)
BATCH_BYTES = 40000
SNAPSHOT_SESSION = "SET check_function_bodies = false;\nSELECT pg_catalog.set_config('search_path', '', false);"


def split_sql(text):
    """Split SQL into statements: honours '…', "…", $tag$…$tag$, -- and /* */ comments."""
    out, buf, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '-' and text.startswith('--', i):
            j = text.find('\n', i)
            j = n if j < 0 else j
            buf.append(text[i:j]); i = j; continue
        if c == '/' and text.startswith('/*', i):
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            buf.append(text[i:j]); i = j; continue
        if c in ("'", '"'):
            j = i + 1
            while j < n:
                if text[j] == c:
                    if j + 1 < n and text[j + 1] == c: j += 2; continue
                    break
                j += 1
            buf.append(text[i:j + 1]); i = j + 1; continue
        if c == '$':
            k = i + 1
            while k < n and (text[k].isalnum() or text[k] == '_'): k += 1
            if k < n and text[k] == '$' and not (i > 0 and (text[i - 1].isalnum() or text[i - 1] == '_')):
                tag = text[i:k + 1]
                j = text.find(tag, k + 1)
                j = n if j < 0 else j + len(tag)
                buf.append(text[i:j]); i = j; continue
        if c == ';':
            buf.append(';')
            stmt = ''.join(buf).strip()
            if stmt and stmt != ';': out.append(stmt)
            buf = []; i += 1; continue
        buf.append(c); i += 1
    tail = ''.join(buf).strip()
    if tail and not all(l.strip().startswith('--') or not l.strip() for l in tail.splitlines()):
        out.append(tail + ';')
    return out


def code_only(stmt):
    return '\n'.join(l for l in stmt.splitlines() if not l.strip().startswith('--')).strip()


def batches(path):
    text = open(os.path.join(ROOT, path), encoding='utf-8').read()
    stmts = [s for s in split_sql(text) if code_only(s) not in ('', ';')]
    out, cur, size = [], [], 0
    for s in stmts:
        b = len(s.encode('utf-8'))
        if cur and size + b > BATCH_BYTES:
            out.append('\n'.join(cur)); cur, size = [], 0
        cur.append(s); size += b
    if cur: out.append('\n'.join(cur))
    if path == 'db/schema.sql':
        # pg_dump output relies on session settings set once at its top; every API call is a new session
        out = [SNAPSHOT_SESSION + '\n' + b for b in out]
    return out, len(stmts)


def api(ref, token, sql):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/%s/database/query' % ref,
                                 data=json.dumps({'query': sql}).encode('utf-8'), method='POST',
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raise RuntimeError('HTTP %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:800]))


def main(argv):
    if '--list' in argv:
        for i, p in enumerate(PLAN, 1): print('%2d. %s' % (i, p))
        return 0
    if '--check' in argv or '--emit-dir' in argv:
        # every migration written after the snapshot's newest (175) must be in the plan, or a fresh project misses it
        import glob, re
        newer = sorted(f for f in glob.glob(os.path.join(ROOT, 'migrations', '[0-9]*_*.sql'))
                       if int(re.match(r'(\d+)', os.path.basename(f)).group(1)) > 175)
        missing = [os.path.relpath(f, ROOT) for f in newer if os.path.relpath(f, ROOT) not in PLAN]
        if missing:
            print('❌ db-bootstrap: migrations missing from the plan: ' + ', '.join(missing)); return 1
        outdir = argv[argv.index('--emit-dir') + 1] if '--emit-dir' in argv else None
        if outdir: os.makedirs(outdir, exist_ok=True)
        k = 0
        for p in PLAN:
            bs, n = batches(p)
            print('%-55s %4d statements · %2d batches' % (p, n, len(bs)))
            for b in bs:
                k += 1
                if outdir: open(os.path.join(outdir, '%03d.sql' % k), 'w', encoding='utf-8').write(b + '\n')
        print('✅ db-bootstrap: %d ملفاً · %d دفعة — كل migration بعد اللقطة بالخطة' % (len(PLAN), k))
        return 0
    if '--project' not in argv:
        print(__doc__); return 2
    ref = argv[argv.index('--project') + 1]
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token: print('⛔ SUPABASE_ACCESS_TOKEN is not set'); return 2
    n = api(ref, token, "select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'")
    tables = (n[0] or {}).get('n', 0) if isinstance(n, list) and n else 0
    print('target %s · public tables now: %s' % (ref, tables))
    plan = PLAN
    if '--from' in argv:
        start = argv[argv.index('--from') + 1]
        if start not in PLAN or start in PLAN[:4]:
            print('⛔ --from must name a numbered migration in the plan: %s' % start); return 2
        plan = PLAN[PLAN.index(start):]
        print('applying %d files from %s on an existing project' % (len(plan), start))
    elif tables and '--allow-existing' not in argv:
        print('⛔ the project is not empty — refusing (pass --allow-existing only on purpose)'); return 3
    k = 0
    for p in plan:
        bs, cnt = batches(p)
        for j, b in enumerate(bs, 1):
            k += 1
            t0 = time.time()
            try:
                api(ref, token, b)
            except Exception as e:
                print('⛔ %s batch %d/%d failed: %s' % (p, j, len(bs), e)); return 1
            print('✓ %s %d/%d (%.1fs)' % (p, j, len(bs), time.time() - t0))
    n = api(ref, token, "select (select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r')::int as tables, "
                        "(select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity)::int as rls, "
                        "(select count(*) from pg_policies where schemaname='public')::int as policies, "
                        "(select count(*) from pg_proc where pronamespace='public'::regnamespace)::int as functions")
    print('✅ done — %s' % json.dumps(n[0] if isinstance(n, list) and n else n, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

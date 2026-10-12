# Bootstrap a fresh Supabase project

`db/schema.sql` snapshots only the `public` schema, carries no data, and **predates
several numbered migrations** (157, 159–164, the functions of 169 and 171, 175 and
everything after). A project built from it alone misses them — that is how
`dental-dev` lacked appointment series, the production goal, lab redo, the referrer
and the inventory RPCs until October 2026.

## The one way to build it

`scripts/db-bootstrap.py` applies everything in a fixed order:

1. `db/schema.sql`
2. `migrations/bootstrap/01_storage_rebuild.sql` (storage buckets + `storage.objects` policies)
3. `migrations/bootstrap/02_auth_triggers_rebuild.sql` (signup triggers on `auth.users`)
4. `migrations/bootstrap/03_seed_platform_defaults.sql` (`platform_settings` keys + notification templates)
5. The numbered migrations newer than the snapshot (`AFTER_SNAPSHOT` in the script)

Run it from GitHub: **Actions → DB Bootstrap → Run workflow** (project ref, typed
twice). It refuses a project that already has tables in `public`. Locally:
`python3 scripts/db-bootstrap.py --list` prints the plan; `--check` splits every file.

Verified: a local build from this plan matches `dental-dev` object for object
(columns, policies, triggers, indexes, constraints — 1831 objects, same fingerprint).

**Every new numbered migration goes into `AFTER_SNAPSHOT`** — `validate.sh` fails
if a migration numbered above 175 is missing from the plan.

## Then, in the dashboard

- Authentication → Providers → Email → turn off **Confirm email** (signup inserts
  the trial request with the new session).
- Authentication → URL Configuration: Site URL and Redirect URLs.
- Authentication → Attack Protection: CAPTCHA (Turnstile) with the widget secret.
- Edge Functions → Secrets: `CF_ACCOUNT_ID`, `CF_AI_API_TOKEN` (optional
  `CF_AI_MODEL`, `ANTHROPIC_API_KEY`), then deploy the functions (`edge-deploy.yml`
  with `SUPABASE_PROJECT_REF` pointing at the project).

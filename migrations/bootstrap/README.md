# Bootstrap a fresh Supabase project

`db/schema.sql` snapshots only the `public` schema and carries no data. On a
new project, apply in this order (SQL Editor or `psql`):

1. `db/schema.sql`
2. `migrations/bootstrap/01_storage_rebuild.sql` (storage buckets + `storage.objects` policies)
3. `migrations/bootstrap/02_auth_triggers_rebuild.sql` (signup triggers on `auth.users`)
4. `migrations/bootstrap/03_seed_platform_defaults.sql` (`platform_settings` keys + notification templates)

All three files are idempotent. They are kept out of the numbered
`migrations/NNN_*.sql` sequence, which continues the original project's
numbering.

Then, in the dashboard: Authentication → Providers → Email → turn off
**Confirm email** (signup inserts the trial request with the new session),
and set the Site URL / Redirect URLs.

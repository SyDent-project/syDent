-- 173 — Auth signup triggers rebuild
--
-- db/schema.sql only snapshots the public schema, so the triggers that live
-- on auth.users were never captured. Without them a new signup gets no
-- public.doctors row (tenant identity + seeded treatment catalog) and no
-- owner clinic_doctors row. This file re-attaches them on a fresh project.
-- The trigger functions themselves are in db/schema.sql.
--
-- Firing order matters: Postgres fires same-event triggers alphabetically,
-- so on_auth_user_created (doctors row) runs before
-- on_auth_user_created_owner_doctor (clinic_doctors row that references it).
-- Idempotent: safe to re-run.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_doctor();

DROP TRIGGER IF EXISTS on_auth_user_created_owner_doctor ON auth.users;
CREATE TRIGGER on_auth_user_created_owner_doctor
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_owner_doctor();

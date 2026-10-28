-- Run once in the Supabase SQL editor. Safe to re-run.
-- Why: tables made by Prisma in Supabase's "public" schema are reachable through the public REST API with the anon key unless RLS blocks it.
-- Prisma connects as the table owner (postgres), which is NOT affected. The app keeps working.
-- WARNING: if another app uses this same Supabase project through the REST API, do not run the REVOKE lines.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'direct2hub') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
-- Test afterwards (should return [] or "permission denied", never your data):
--   curl "https://<project>.supabase.co/rest/v1/Product?select=*" -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"

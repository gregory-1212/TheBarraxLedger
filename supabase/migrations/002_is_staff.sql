-- Migration 002: is_staff() function — staff allowlist for RLS
-- LED-1: Restricts data access to a hardcoded set of staff emails.
--
-- Why hardcoded (not a table): we have 2 users (Greg + Julie), no churn.
-- Adding a user = a 2-line migration that's auditable in git.
-- A table would require its own RLS + UI to manage; that's overkill at this scale.
--
-- All future tables get RLS like:
--   CREATE POLICY "staff_read"  ON foo FOR SELECT USING (public.is_staff());
--   CREATE POLICY "staff_write" ON foo FOR ALL    USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT auth.email() IS NOT NULL
     AND auth.email() = ANY (ARRAY[
       'greg@thebarrax.com',
       'julie@thebarrax.com'
     ]);
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

COMMENT ON FUNCTION public.is_staff() IS
  'Returns true if the authenticated user is in the staff allowlist. Used by RLS policies across the Ledger schema. To add a staff member, edit this function in a new migration.';

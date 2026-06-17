-- Drop overly-permissive policy that exposed all non-admin profile emails/phones
DROP POLICY IF EXISTS "authenticated read non-admin profiles" ON public.profiles;

-- Safe directory view exposing only non-sensitive columns for colleague lookups
CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = true) AS
SELECT id, name, active
FROM public.profiles
WHERE NOT public.has_role(id, 'admin');

GRANT SELECT ON public.profiles_directory TO authenticated;

-- Allow authenticated users to read id/name/active via the view (RLS on profiles
-- now restricts row access to self or admin; we expose a safe subset via this
-- helper policy scoped to non-sensitive columns through the view).
-- Since the view uses security_invoker, we need an additional RLS read path
-- for non-admin rows that exposes ONLY safe columns. Implement via a
-- SECURITY DEFINER function used by the view instead:
DROP VIEW IF EXISTS public.profiles_directory;

CREATE OR REPLACE FUNCTION public.list_colleagues()
RETURNS TABLE(id uuid, name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.active
  FROM public.profiles p
  WHERE NOT public.has_role(p.id, 'admin')
$$;

REVOKE ALL ON FUNCTION public.list_colleagues() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_colleagues() TO authenticated;
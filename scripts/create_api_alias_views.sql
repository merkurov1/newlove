-- Create alias views for singular table names expected by some endpoints
-- These views select from the canonical plural tables and grant SELECT to anon
-- so PostgREST (Supabase) can find them and anonymous clients can read them.

CREATE OR REPLACE VIEW public.article AS
  SELECT * FROM public.articles;
GRANT SELECT ON public.article TO anon;

CREATE OR REPLACE VIEW public.letter AS
  SELECT * FROM public.letters;
GRANT SELECT ON public.letter TO anon;

CREATE OR REPLACE VIEW public.postcard AS
  SELECT * FROM public.postcards;
GRANT SELECT ON public.postcard TO anon;

-- Ensure the 'project' singular alias exists (we previously created this in prod)
CREATE OR REPLACE VIEW public.project AS
  SELECT * FROM public.projects;
GRANT SELECT ON public.project TO anon;

-- Alias for subscribers (if any code queries singular 'subscriber')
CREATE OR REPLACE VIEW public.subscriber AS
  SELECT * FROM public.subscribers;
GRANT SELECT ON public.subscriber TO anon;

-- Notes:
-- 1) Applying these statements requires a DB connection with sufficient privileges.
-- 2) This is a compatibility shim; consider updating code to use canonical plural
--    table names and configuring RLS/policies for the anon role instead of broad grants.

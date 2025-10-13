-- Grant read access to anon on public tables used by the frontend
-- Run this with a privileged connection (service role) only.

GRANT SELECT ON TABLE public.projects TO anon;
GRANT SELECT ON TABLE public.subscribers TO anon;
GRANT SELECT ON TABLE public.articles TO anon;
GRANT SELECT ON TABLE public.postcards TO anon;
GRANT SELECT ON TABLE public.postcard_orders TO anon;

-- Tag and junction tables (names used in migrations)
GRANT SELECT ON TABLE public."Tag" TO anon;
GRANT SELECT ON TABLE public."_ArticleToTag" TO anon;

-- If you prefer more restrictive grants, adjust policies/RLS instead.

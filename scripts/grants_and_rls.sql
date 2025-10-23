-- scripts/grants_and_rls.sql
-- Quick GRANTs (fast, temporary)
-- Gives the anon role SELECT on public tables so public reads work immediately.
-- Run these if you need a fast fix, then migrate to RLS policies for production.

BEGIN;
GRANT SELECT ON TABLE public.articles TO anon;
GRANT SELECT ON TABLE public.postcards TO anon;
GRANT SELECT ON TABLE public.postcard_orders TO anon;
COMMIT;

-- ------------------------------------------------------------------
-- RLS-based (recommended) template: enable RLS and add safe policies
-- Replace conditions with your actual published / visibility columns.
-- This example assumes `published` boolean on articles/postcards.
-- Use the policy expressions below as starting points and adapt them.
-- NOTE: Run the RLS block only if you intend to enable Row Level Security.
-- ------------------------------------------------------------------

-- Enable RLS on tables
-- ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.postcards ENABLE ROW LEVEL SECURITY;

-- Example policy: allow anon (public) to SELECT only published rows
-- CREATE POLICY "Public select published articles" ON public.articles
--   FOR SELECT
--   USING (published = true);

-- Example policy for postcards
-- CREATE POLICY "Public select published postcards" ON public.postcards
--   FOR SELECT
--   USING (published = true);

-- If you want to allow authenticated users (with JWT claims) additional access,
-- you can write policies checking jwt.role or jwt sub claim, e.g.:
-- CREATE POLICY "Authenticated users can select their drafts" ON public.articles
--   FOR SELECT
--   USING (published = true OR auth.uid() = author_id);

-- ------------------------------------------------------------------
-- Optional: grant usage on sequences if you need inserts from anon (not recommended)
-- GRANT USAGE ON SEQUENCE public.articles_id_seq TO anon;
-- ------------------------------------------------------------------

-- Diagnostics helper (run after applying changes)
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'articles' OR table_name = 'postcards'
-- ORDER BY grantee, privilege_type;

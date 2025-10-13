-- Grant read access to the 'authenticated' role (used by logged-in clients)
-- Run this with a privileged connection (service role) only.

GRANT SELECT ON TABLE public.articles TO authenticated;
GRANT SELECT ON TABLE public.projects TO authenticated;
GRANT SELECT ON TABLE public.subscribers TO authenticated;
GRANT SELECT ON TABLE public.postcards TO authenticated;
GRANT SELECT ON TABLE public.postcard_orders TO authenticated;
GRANT SELECT ON TABLE public."Tag" TO authenticated;
GRANT SELECT ON TABLE public."_ArticleToTag" TO authenticated;

-- Also ensure views used for singular aliases are readable
GRANT SELECT ON public.article TO authenticated;
GRANT SELECT ON public.project TO authenticated;
GRANT SELECT ON public.subscriber TO authenticated;

-- Note: this is a pragmatic fix. For tighter security, prefer RLS policies
-- that explicitly allow SELECT for authenticated users on the required rows.

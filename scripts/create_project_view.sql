-- Create an alias view named project for projects table to satisfy legacy callers
CREATE OR REPLACE VIEW public.project AS
SELECT * FROM public.projects;

-- Grant select on the view to anon role (if needed by PostgREST)
GRANT SELECT ON public.project TO anon;

-- Grant full DML privileges on projects to service_role
-- Run this as a superuser or a DB owner (psql -d <db> -f sql/grant_projects_to_service_role.sql)

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.projects TO service_role;
-- If your projects table has sequences used for serial PKs, consider:
-- GRANT USAGE ON SEQUENCE public.projects_id_seq TO service_role;

-- Optional: grant on any related FK/junction tables (example)
-- GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public."_ProjectToTag" TO service_role;

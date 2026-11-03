-- Migration: Authentication storage policy hardening
-- Date: 2026-11-03
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Verified production issue (read-only inspection):
--   * storage.objects allowed public INSERT into the `heartandangel` bucket;
--   * any authenticated user could INSERT/UPDATE objects in `media` and
--     INSERT into `artifacts` directly through the Storage API.
--
-- All application uploads go through server routes that verify the caller and
-- then use the service-role client. Public read access to the public buckets
-- remains unchanged. No objects or rows are deleted.

begin;

drop policy if exists "Allow Uploads for Heart and Angel" on storage.objects;
drop policy if exists "Allow authenticated insert on media" on storage.objects;
drop policy if exists "Allow authenticated update on media" on storage.objects;
drop policy if exists "Media authenticated insert" on storage.objects;
drop policy if exists "Media owner update" on storage.objects;
drop policy if exists "Artifacts authenticated upload" on storage.objects;

-- Public read policies for media / artifacts / heartandangel are intentional
-- and are left untouched. Private buckets (brain-sources, knowledge-map,
-- whispers) keep their existing service-role-only access.

commit;

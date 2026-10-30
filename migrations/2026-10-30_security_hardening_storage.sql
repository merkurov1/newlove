-- ============================================================================
-- 2026-10-30 security hardening — Supabase Storage
--
-- STATUS: PROPOSED. This file is intentionally separate from the database
-- migration because two changes require application work first:
--
--   1. `whispers` is currently a PUBLIC bucket with public read + public
--      upload policies. Voice confessions can be listed and downloaded by
--      anyone. Making it private requires switching the recorder to upload
--      through a server route (service role) and the admin page to use
--      short-lived signed URLs.
--
--   2. `media` has an UPDATE policy without an owner check, so any
--      authenticated account can move/rename another user's objects.
--
-- Apply only after deploying the matching application change and testing the
-- whisper recorder and media editor. Rollback:
-- migrations/rollback/2026-10-30_security_hardening_storage.rollback.sql
-- ============================================================================

begin;

-- 1. Whispers: private bucket, no anonymous listing or uploads.
update storage.buckets
   set public = false,
       file_size_limit = 52428800, -- 50 MB
       allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
 where id = 'whispers';

drop policy if exists "Allow public read" on storage.objects;
drop policy if exists "Allow public uploads" on storage.objects;

-- Admin-only reads are served by signed URLs; only the service role needs
-- direct object access.
create policy "Whispers service role read"
  on storage.objects for select
  to service_role
  using (bucket_id = 'whispers');

-- 2. Artifacts: upload only for authenticated users, not the public role.
drop policy if exists "Authenticated Upload" on storage.objects;
create policy "Artifacts authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'artifacts');

update storage.buckets
   set file_size_limit = 26214400, -- 25 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']
 where id = 'artifacts';

-- 3. Media: any authenticated user could UPDATE any object. Keep writes
--    owner-scoped.
drop policy if exists "Authetificate user upload 1ps738_2" on storage.objects;
drop policy if exists "Authetificate user upload 1ps738_1" on storage.objects;
drop policy if exists "Authetificate user upload 1ps738_0" on storage.objects;

create policy "Media authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'media');

create policy "Media authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media' and owner = auth.uid());

create policy "Media owner update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and owner = auth.uid())
  with check (bucket_id = 'media' and owner = auth.uid());

update storage.buckets
   set file_size_limit = 52428800, -- 50 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'application/pdf']
 where id = 'media';

-- 4. Other public buckets: cap upload size and MIME types.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id in ('articles', 'heartandangel', 'liveheart-og');

commit;

-- ============================================================================
-- ROLLBACK for 2026-10-30_security_hardening_storage.sql
-- EMERGENCY ONLY: this restores the public whisper bucket and the permissive
-- media update policy.
-- ============================================================================

begin;

update storage.buckets
   set public = true,
       file_size_limit = null,
       allowed_mime_types = null
 where id = 'whispers';

drop policy if exists "Whispers service role read" on storage.objects;

create policy "Allow public read"
  on storage.objects for select to public
  using (bucket_id = 'whispers');
create policy "Allow public uploads"
  on storage.objects for insert to public
  with check (bucket_id = 'whispers');

drop policy if exists "Artifacts authenticated upload" on storage.objects;
create policy "Authenticated Upload"
  on storage.objects for insert to public
  with check (bucket_id = 'artifacts');

drop policy if exists "Media authenticated read" on storage.objects;
drop policy if exists "Media authenticated insert" on storage.objects;
drop policy if exists "Media owner update" on storage.objects;

create policy "Authetificate user upload 1ps738_0"
  on storage.objects for select to public
  using (bucket_id = 'media' and auth.role() = 'authenticated');
create policy "Authetificate user upload 1ps738_1"
  on storage.objects for insert to public
  with check (bucket_id = 'media' and auth.role() = 'authenticated');
create policy "Authetificate user upload 1ps738_2"
  on storage.objects for update to public
  using (bucket_id = 'media' and auth.role() = 'authenticated');

update storage.buckets
   set file_size_limit = null,
       allowed_mime_types = null
 where id in ('articles', 'artifacts', 'heartandangel', 'liveheart-og', 'media');

commit;

-- ============================================================================
-- ROLLBACK for 2026-10-30_security_hardening_private_data.sql
--
-- EMERGENCY ONLY. This restores the pre-audit grants and permissive policies,
-- including the public email/wallet exposure. Never apply it as a "fix"; use
-- it only to recover from a confirmed functional regression in staging.
--
-- It does not delete or modify records.
-- ============================================================================

begin;

-- 1. Restore the old admin predicate (profiles.role based).
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'ADMIN'
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to anon, authenticated, service_role;

-- 2. Restore the old public RPC (unpublished rows + author email).
create or replace function public.get_articles_by_tag(
  tag_slug_param text,
  limit_param integer default 50
)
returns table (
  id text,
  title text,
  slug text,
  content text,
  published boolean,
  "publishedAt" timestamp without time zone,
  "updatedAt" timestamp without time zone,
  author jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return query
  select
    a.id,
    a.title,
    a.slug,
    a.content,
    a.published,
    a."publishedAt",
    a."updatedAt",
    jsonb_build_object(
      'id', u.id,
      'name', u.name,
      'email', u.email
    ) as author
  from public.articles a
  inner join public.article_to_tag_view v
    on a.id::text = v.article_id::text
  inner join public."Tag" t
    on t.id::text = v.tag_id::text
  left join public.users u
    on a."authorId" = u.id
  where lower(t.slug) = lower(tag_slug_param)
  order by a."publishedAt" desc nulls last, a."updatedAt" desc nulls last
  limit limit_param;
end;
$$;

-- 3. subscribers
drop policy if exists subscribers_select_own on public.subscribers;
revoke all on table public.subscribers from anon, authenticated;
grant select on table public.subscribers to anon, authenticated;
grant insert on table public.subscribers to authenticated;

create policy select_subscribers_public
  on public.subscribers for select to public using (true);
create policy insert_subscribers_authenticated
  on public.subscribers for insert to public
  with check ((auth.uid() is not null) or true);

-- 4. users
drop policy if exists users_select_own on public.users;
drop policy if exists users_select_admin on public.users;
drop policy if exists users_insert_own on public.users;
drop policy if exists users_update_own on public.users;

revoke all on table public.users from anon, authenticated;
grant select on table public.users to anon, authenticated;
grant insert on table public.users to authenticated;

create policy "Users can view all profiles"
  on public.users for select to anon, authenticated using (true);
create policy "Users can insert own profile"
  on public.users for insert to authenticated
  with check ((auth.uid())::text = id);
create policy "Users can update own profile"
  on public.users for update to authenticated
  using ((auth.uid())::text = id)
  with check ((auth.uid())::text = id);

-- 5. articles
drop policy if exists articles_read_published on public.articles;
create policy "Allow anon read published articles"
  on public.articles for select to public using (published = true);
create policy "Allow anon select"
  on public.articles for select to public using (true);
create policy "Allow public read access to articles"
  on public.articles for select to public using (true);
create policy public_read_published_articles
  on public.articles for select to anon using (published = true);

-- 6. projects
create policy "Allow anon select"
  on public.projects for select to public using (true);

-- 7. Tag / _ArticleToTag
drop policy if exists tags_admin_manage on public."Tag";
drop policy if exists article_tags_admin_manage on public."_ArticleToTag";

create policy "Authenticated users manage tags"
  on public."Tag" for all to public using (auth.uid() is not null);
create policy "Authenticated manage article tags"
  on public."_ArticleToTag" for all to public using (auth.uid() is not null);

grant insert, update, delete, truncate, references, trigger
  on public."Tag" to authenticated;
grant insert, update, delete, truncate, references, trigger
  on public."_ArticleToTag" to authenticated;

-- 8. temple_log
drop policy if exists temple_log_public_read on public.temple_log;

create policy "Enable insert for temple_log"
  on public.temple_log for insert to public with check (true);
create policy "Logs Public Access"
  on public.temple_log for all to public using (true) with check (true);
create policy "Public Insert Logs"
  on public.temple_log for insert to public with check (true);
create policy "public_insert_on_temple_log"
  on public.temple_log for insert to public with check (true);
create policy "Enable public read for temple_log"
  on public.temple_log for select to public using (true);
create policy "Public Read Logs"
  on public.temple_log for select to public using (true);
create policy "public_read_on_temple_log"
  on public.temple_log for select to public using (true);
create policy "public_select_on_temple_log"
  on public.temple_log for select to public using (true);

grant insert, update, delete, truncate, references, trigger
  on public.temple_log to anon, authenticated;

-- 9. temple_users
grant insert, update, select on public.temple_users to anon, authenticated;
create policy "Enable insert for everyone"
  on public.temple_users for insert to public with check (true);
create policy "Enable select for everyone"
  on public.temple_users for select to public using (true);
create policy "Enable update for everyone"
  on public.temple_users for update to public using (true);

-- 10. todo
grant all on table public.todo to anon, authenticated;
create policy "Public read/write access for todo"
  on public.todo for all to public using (true) with check (true);

-- 11. vigil_hearts
drop policy if exists vigil_hearts_public_read on public.vigil_hearts;

grant insert, update, delete, truncate, references, trigger
  on public.vigil_hearts to anon, authenticated;

create policy "Anyone can create hearts"
  on public.vigil_hearts for insert to public with check (true);
create policy "Anyone can light hearts"
  on public.vigil_hearts for update to public using (true) with check (true);
create policy "Anyone can view hearts"
  on public.vigil_hearts for select to public using (true);
create policy "Vigil Public Access"
  on public.vigil_hearts for all to public using (true) with check (true);

-- 12. lots
create policy "Admin Full Access"
  on public.lots for all to authenticated using (true) with check (true);

-- 13. newsletter_jobs / newsletter_logs
grant select on table public.newsletter_jobs to authenticated;
grant select on table public.newsletter_logs to authenticated;
create policy "Admin can view all jobs"
  on public.newsletter_jobs for select to authenticated using (true);
create policy "Admin can view all logs"
  on public.newsletter_logs for select to authenticated using (true);

-- 14. Restore write grants on public-read tables.
grant insert, update, delete, truncate, references, trigger
  on public.letters to anon, authenticated;

-- 15. RLS state on legacy tables (back to the audited baseline).
alter table public.accounts disable row level security;
alter table public.sessions disable row level security;
alter table public.verificationtokens disable row level security;
alter table public.subscriber_tokens disable row level security;
alter table public.orders disable row level security;
alter table public.user_roles disable row level security;
alter table public.roles disable row level security;
alter table public.messages disable row level security;
alter table public.revalidation_audit disable row level security;
alter table public.liveheart_shares disable row level security;
alter table public.project_tags disable row level security;
alter table public.subscribers_backup_20251128 disable row level security;
alter table public.products disable row level security;

-- 16. View option
alter view public.article_to_tag_view reset (security_invoker);

-- 17. Restore default EXECUTE for the functions locked down by the migration.
grant execute on function public.assign_default_user_role() to public;
grant execute on function public.assign_default_user_role_safe() to public;
grant execute on function public.handle_new_user() to public;
grant execute on function public.set_jwt_role_claim() to public;
grant execute on function public.set_jwt_role_claim_safe() to public;
grant execute on function public.get_my_user_roles_any(text) to public;
grant execute on function public.get_my_user_roles(uuid) to public;
grant execute on function public.get_my_user_roles() to public;
grant execute on function public.get_my_roles() to public;
grant execute on function public.get_newsletter_job_stats(text) to public;
grant execute on function public.clean_old_logs() to public;
grant execute on function public.cleanup_old_newsletter_jobs(integer) to public;
grant execute on function public.sync_user_subscription_status() to public;
grant execute on function public.attach_tags_to_articles() to public;
grant execute on function public.role_from_text_to_role(text) to public;
grant execute on function public.update_letters_updated_at() to public;
grant execute on function public.update_letter_comments_updated_at() to public;
grant execute on function public.update_tag_updated_at() to public;
grant execute on function public.update_updated_at_column() to public;
grant execute on function public.media_archive_records_updated_at() to public;

commit;

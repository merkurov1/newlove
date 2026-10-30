-- ============================================================================
-- 2026-10-30 security hardening — private data / Data API
--
-- STATUS: PROPOSED. Review and test on staging before applying to production.
-- This migration does NOT delete or rewrite any records. It only changes RLS,
-- grants, policies, view options and function definitions.
--
-- Context (audit 2026-10-30):
--   * `subscribers` and `users` were readable with the public anon key;
--   * `temple_users` / `temple_log` exposed Telegram identities and logs;
--   * `Tag` / `_ArticleToTag` allowed any authenticated account to write;
--   * `temple_log`, `temple_users`, `vigil_hearts`, `todo` had anon DML grants;
--   * `get_articles_by_tag()` returned unpublished articles + author emails;
--   * `get_my_user_roles_any()` allowed enumerating another user's roles;
--   * several legacy tables had RLS disabled (no grants, but no defence copy).
--
-- Rollback: migrations/rollback/2026-10-30_security_hardening_private_data.rollback.sql
-- Verification: scripts/security/verify-supabase-exposure.mjs
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Private / internal tables: RLS on, Data API grants removed.
--    service_role keeps access because it bypasses RLS by design.
-- ----------------------------------------------------------------------------
alter table if exists public.accounts enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.verificationtokens enable row level security;
alter table if exists public.subscriber_tokens enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.user_roles enable row level security;
alter table if exists public.roles enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.revalidation_audit enable row level security;
alter table if exists public.liveheart_shares enable row level security;
alter table if exists public.project_tags enable row level security;
alter table if exists public.subscribers_backup_20251128 enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.access_requests enable row level security;
alter table if exists public.auction_lots enable row level security;
alter table if exists public.bot_sessions enable row level security;
alter table if exists public.casts enable row level security;
alter table if exists public.distributions enable row level security;
alter table if exists public.flow_issue_template_versions enable row level security;
alter table if exists public.ingest_log enable row level security;
alter table if exists public.item_versions enable row level security;
alter table if exists public.knowledge_documents enable row level security;
alter table if exists public.knowledge_chunks enable row level security;
alter table if exists public.letter_comments enable row level security;
alter table if exists public.parse_logs enable row level security;
alter table if exists public.pierrot_conversations enable row level security;
alter table if exists public.pierrot_messages enable row level security;
alter table if exists public.pierrot_events enable row level security;
alter table if exists public.pierrot_offer_policies enable row level security;
alter table if exists public.research_tasks enable row level security;
alter table if exists public.whispers enable row level security;
alter table if exists public.brain_document_extractions enable row level security;
alter table if exists public.brain_document_topics enable row level security;
alter table if exists public.brain_editorial_suggestions enable row level security;
alter table if exists public.brain_entities enable row level security;
alter table if exists public.brain_entity_mentions enable row level security;
alter table if exists public.brain_graph_jobs enable row level security;
alter table if exists public.brain_graph_runs enable row level security;
alter table if exists public.brain_ingestion_jobs enable row level security;
alter table if exists public.brain_ingestion_runs enable row level security;
alter table if exists public.brain_radar_runs enable row level security;
alter table if exists public.brain_relationships enable row level security;
alter table if exists public.brain_thematic_summaries enable row level security;
alter table if exists public.art_service_leads enable row level security;
alter table if exists public.flow_ai_context enable row level security;

revoke all on table public.accounts from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.verificationtokens from anon, authenticated;
revoke all on table public.subscriber_tokens from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.roles from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.revalidation_audit from anon, authenticated;
revoke all on table public.liveheart_shares from anon, authenticated;
revoke all on table public.project_tags from anon, authenticated;
revoke all on table public.subscribers_backup_20251128 from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.access_requests from anon, authenticated;
revoke all on table public.auction_lots from anon, authenticated;
revoke all on table public.bot_sessions from anon, authenticated;
revoke all on table public.casts from anon, authenticated;
revoke all on table public.distributions from anon, authenticated;
revoke all on table public.flow_issue_template_versions from anon, authenticated;
revoke all on table public.ingest_log from anon, authenticated;
revoke all on table public.item_versions from anon, authenticated;
revoke all on table public.knowledge_documents from anon, authenticated;
revoke all on table public.knowledge_chunks from anon, authenticated;
revoke all on table public.letter_comments from anon, authenticated;
revoke all on table public.parse_logs from anon, authenticated;
revoke all on table public.pierrot_conversations from anon, authenticated;
revoke all on table public.pierrot_messages from anon, authenticated;
revoke all on table public.pierrot_events from anon, authenticated;
revoke all on table public.pierrot_offer_policies from anon, authenticated;
revoke all on table public.research_tasks from anon, authenticated;
revoke all on table public.whispers from anon, authenticated;
revoke all on table public.brain_document_extractions from anon, authenticated;
revoke all on table public.brain_document_topics from anon, authenticated;
revoke all on table public.brain_editorial_suggestions from anon, authenticated;
revoke all on table public.brain_entities from anon, authenticated;
revoke all on table public.brain_entity_mentions from anon, authenticated;
revoke all on table public.brain_graph_jobs from anon, authenticated;
revoke all on table public.brain_graph_runs from anon, authenticated;
revoke all on table public.brain_ingestion_jobs from anon, authenticated;
revoke all on table public.brain_ingestion_runs from anon, authenticated;
revoke all on table public.brain_radar_runs from anon, authenticated;
revoke all on table public.brain_relationships from anon, authenticated;
revoke all on table public.brain_thematic_summaries from anon, authenticated;
revoke all on table public.art_service_leads from anon, authenticated;
revoke all on table public.flow_ai_context from anon, authenticated;

-- Keep the known public-read Flow/newsletter tables explicit.
revoke all on table public.newsletter_jobs from anon, authenticated;
revoke all on table public.newsletter_logs from anon, authenticated;
drop policy if exists "Admin can view all jobs" on public.newsletter_jobs;
drop policy if exists "Admin can view all logs" on public.newsletter_logs;

-- ----------------------------------------------------------------------------
-- 2. subscribers — never public. A signed-in user may see only their own row
--    (used by /api/subscription-status). All writes stay service-role only.
-- ----------------------------------------------------------------------------
drop policy if exists select_subscribers_public on public.subscribers;
drop policy if exists insert_subscribers_authenticated on public.subscribers;

revoke all on table public.subscribers from anon, authenticated;
grant select on table public.subscribers to authenticated;

create policy subscribers_select_own
  on public.subscribers
  for select
  to authenticated
  using (auth.uid()::text = "userId");

-- ----------------------------------------------------------------------------
-- 3. users — public emails and roles must not be readable.
--    Own profile read/update is preserved; role/email columns are not writable
--    by the authenticated role.
-- ----------------------------------------------------------------------------
drop policy if exists "Users can view all profiles" on public.users;
drop policy if exists "Users can insert own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;

revoke all on table public.users from anon, authenticated;

grant select on table public.users to authenticated;
grant insert (id, username, name, bio, website, is_subscribed, created_at, updated_at)
  on public.users to authenticated;
grant update (username, name, bio, website, is_subscribed, updated_at)
  on public.users to authenticated;

create policy users_select_own
  on public.users
  for select
  to authenticated
  using (id = auth.uid()::text);

create policy users_select_admin
  on public.users
  for select
  to authenticated
  using (public.is_current_user_admin());

create policy users_insert_own
  on public.users
  for insert
  to authenticated
  with check (id = auth.uid()::text);

create policy users_update_own
  on public.users
  for update
  to authenticated
  using (id = auth.uid()::text)
  with check (id = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 4. articles — only published rows through the Data API.
-- ----------------------------------------------------------------------------
drop policy if exists "Allow anon read published articles" on public.articles;
drop policy if exists "Allow anon select" on public.articles;
drop policy if exists "Allow public read access to articles" on public.articles;
drop policy if exists public_read_published_articles on public.articles;

create policy articles_read_published
  on public.articles
  for select
  to anon, authenticated
  using (published = true);

-- ----------------------------------------------------------------------------
-- 5. projects — only published rows.
-- ----------------------------------------------------------------------------
drop policy if exists "Allow anon select" on public.projects;

-- ----------------------------------------------------------------------------
-- 6. Tag / _ArticleToTag — public read, admin-only writes.
-- ----------------------------------------------------------------------------
drop policy if exists "Authenticated users manage tags" on public."Tag";
create policy tags_admin_manage
  on public."Tag"
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "Authenticated manage article tags" on public."_ArticleToTag";
create policy article_tags_admin_manage
  on public."_ArticleToTag"
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

revoke truncate, references, trigger on public."Tag" from anon, authenticated;
revoke truncate, references, trigger on public."_ArticleToTag" from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. temple_log — public read/realtime, no public writes.
-- ----------------------------------------------------------------------------
drop policy if exists "Enable insert for temple_log" on public.temple_log;
drop policy if exists "Logs Public Access" on public.temple_log;
drop policy if exists "Public Insert Logs" on public.temple_log;
drop policy if exists "public_insert_on_temple_log" on public.temple_log;
drop policy if exists "Enable public read for temple_log" on public.temple_log;
drop policy if exists "Public Read Logs" on public.temple_log;
drop policy if exists "public_read_on_temple_log" on public.temple_log;

revoke insert, update, delete, truncate, references, trigger
  on public.temple_log from anon, authenticated;

create policy temple_log_public_read
  on public.temple_log
  for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 8. temple_users — private Telegram identities (service role only).
-- ----------------------------------------------------------------------------
drop policy if exists "Enable insert for everyone" on public.temple_users;
drop policy if exists "Enable select for everyone" on public.temple_users;
drop policy if exists "Enable update for everyone" on public.temple_users;

revoke all on table public.temple_users from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. todo — feature disabled; table retained but no API access.
-- ----------------------------------------------------------------------------
drop policy if exists "Public read/write access for todo" on public.todo;
revoke all on table public.todo from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. vigil_hearts — public read/realtime, writes through the signed API only.
-- ----------------------------------------------------------------------------
drop policy if exists "Anyone can create hearts" on public.vigil_hearts;
drop policy if exists "Anyone can light hearts" on public.vigil_hearts;
drop policy if exists "Vigil Public Access" on public.vigil_hearts;
drop policy if exists "Anyone can view hearts" on public.vigil_hearts;

revoke insert, update, delete, truncate, references, trigger
  on public.vigil_hearts from anon, authenticated;

create policy vigil_hearts_public_read
  on public.vigil_hearts
  for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- 11. lots — public read is intentional; strip unused write grants.
-- ----------------------------------------------------------------------------
drop policy if exists "Admin Full Access" on public.lots;
revoke truncate, references, trigger on public.lots from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 12. Public-read tables: keep SELECT, remove unused write/TRUNCATE grants.
-- ----------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.articles from anon, authenticated;
grant select on public.articles to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.letters from anon, authenticated;
grant select on public.letters to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.issues from anon, authenticated;
grant select on public.issues to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.postcards from anon, authenticated;
grant select on public.postcards to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.media_archive_records from anon, authenticated;
grant select on public.media_archive_records to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 13. Views — do not let a future grant turn a view into an RLS bypass.
-- ----------------------------------------------------------------------------
alter view public.article_to_tag_view set (security_invoker = true);
revoke all on table public.article_to_tag_view from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 13. Admin predicate: the authoritative role lives in users.role and/or
--     user_roles (profiles.role was not kept in sync and returned false for
--     the current production administrator).
-- ----------------------------------------------------------------------------
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()::text
        and upper(coalesce(u.role, '')) = 'ADMIN'
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()::text
        and upper(r.name) = 'ADMIN'
    );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. Public RPC: published articles only, no author email.
-- ----------------------------------------------------------------------------
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
      'name', u.name
    ) as author
  from public.articles a
  inner join public.article_to_tag_view v
    on a.id::text = v.article_id::text
  inner join public."Tag" t
    on t.id::text = v.tag_id::text
  left join public.users u
    on a."authorId" = u.id
  where lower(t.slug) = lower(tag_slug_param)
    and a.published = true
  order by a."publishedAt" desc nulls last, a."updatedAt" desc nulls last
  limit greatest(least(coalesce(limit_param, 50), 100), 1);
end;
$$;

-- ----------------------------------------------------------------------------
-- 15. Function execution: remove default PUBLIC EXECUTE where it is not an
--     intentional public API.
-- ----------------------------------------------------------------------------
revoke all on function public.assign_default_user_role() from public, anon, authenticated;
revoke all on function public.assign_default_user_role_safe() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_jwt_role_claim() from public, anon, authenticated;
revoke all on function public.set_jwt_role_claim_safe() from public, anon, authenticated;
revoke all on function public.get_my_user_roles_any(text) from public, anon, authenticated;
revoke all on function public.get_my_user_roles(uuid) from public, anon, authenticated;
revoke all on function public.get_my_user_roles() from public, anon;
revoke all on function public.get_my_roles() from public, anon;
revoke all on function public.get_newsletter_job_stats(text) from public, anon, authenticated;
revoke all on function public.clean_old_logs() from public, anon, authenticated;
revoke all on function public.cleanup_old_newsletter_jobs(integer) from public, anon, authenticated;
revoke all on function public.sync_user_subscription_status() from public, anon, authenticated;
revoke all on function public.attach_tags_to_articles() from public, anon, authenticated;
revoke all on function public.role_from_text_to_role(text) from public, anon, authenticated;
revoke all on function public.update_letters_updated_at() from public, anon, authenticated;
revoke all on function public.update_letter_comments_updated_at() from public, anon, authenticated;
revoke all on function public.update_tag_updated_at() from public, anon, authenticated;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;
revoke all on function public.media_archive_records_updated_at() from public, anon, authenticated;

grant execute on function public.get_my_user_roles_any(text) to service_role;
grant execute on function public.get_my_user_roles(uuid) to service_role;
grant execute on function public.get_my_user_roles() to authenticated, service_role;
grant execute on function public.get_my_roles() to authenticated, service_role;
grant execute on function public.get_newsletter_job_stats(text) to service_role;
grant execute on function public.cleanup_old_newsletter_jobs(integer) to service_role;
grant execute on function public.clean_old_logs() to service_role;
grant execute on function public.sync_user_subscription_status() to service_role;
grant execute on function public.attach_tags_to_articles() to service_role;
grant execute on function public.role_from_text_to_role(text) to service_role;
grant execute on function public.assign_default_user_role() to service_role;
grant execute on function public.assign_default_user_role_safe() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.set_jwt_role_claim() to service_role;
grant execute on function public.set_jwt_role_claim_safe() to service_role;

commit;

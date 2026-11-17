-- ============================================================================
-- Question — opt-in notifications about new human answers
-- Date: 2026-12-10
--
-- Product contract:
--   * a subscription belongs to exactly one question;
--   * email must be confirmed before any delivery;
--   * Telegram must be linked through the existing Pierrot bot;
--   * channels are independent and can be disabled separately;
--   * repeated opt-in is idempotent;
--   * only answers saved AFTER the subscription was confirmed are delivered;
--   * one notification per answer + subscription + channel, even on retries.
--
-- Privacy model:
--   * tables are service-role only, RLS is enabled without client policies;
--   * tokens are stored as SHA-256 hashes with an expiry and single use;
--   * notification rows never contain answer text. Human answers stay private;
--     the notification points at the question page instead.
--
-- Delivery model:
--   * an AFTER INSERT trigger on question_answers enqueues delivery rows;
--   * the trigger is independent from question_syntheses, so a synthesis
--     failure can never block or roll back a notification;
--   * the existing protected scheduler (brain_worker_tick) pokes the
--     /api/cron/question-notifications endpoint, which claims due rows with
--     FOR UPDATE SKIP LOCKED and records attempts / errors / sent_at.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Subscriptions
--
-- One row describes one opt-in to one question. A row always carries at least
-- one identity. Email identity is anonymous-safe (double opt-in). Telegram
-- identity is filled only after the bot deep-link token is consumed.
-- ----------------------------------------------------------------------------
create table if not exists public.question_subscriptions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.questions(id) on delete cascade,
  user_id uuid
    references auth.users(id) on delete set null,
  email text
    check (
      email is null
      or (
        char_length(email) between 3 and 320
        and email = lower(email)
      )
    ),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'active', 'disabled')),
  email_confirmed_at timestamptz,
  telegram_user_id bigint
    check (telegram_user_id is null or telegram_user_id > 0),
  telegram_chat_id bigint
    check (telegram_chat_id is null or telegram_chat_id <> 0),
  telegram_status text not null default 'pending'
    check (telegram_status in ('pending', 'active', 'disabled')),
  telegram_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.question_subscriptions is
  'Opt-in subscriptions to new answers for one question. Service-role only.';
comment on column public.question_subscriptions.email is
  'Lower-cased email. Never returned by a public endpoint.';
comment on column public.question_subscriptions.telegram_user_id is
  'Telegram user id obtained from the bot deep link. Never returned to clients.';

-- The same email cannot subscribe twice to the same question.
create unique index if not exists question_subscriptions_question_email_uidx
  on public.question_subscriptions (question_id, lower(email))
  where email is not null;

-- The same Telegram account cannot subscribe twice to the same question.
create unique index if not exists question_subscriptions_question_telegram_uidx
  on public.question_subscriptions (question_id, telegram_user_id)
  where telegram_user_id is not null;

create index if not exists question_subscriptions_question_idx
  on public.question_subscriptions (question_id, created_at desc);

create index if not exists question_subscriptions_user_idx
  on public.question_subscriptions (user_id, question_id)
  where user_id is not null;

-- ----------------------------------------------------------------------------
-- One-time tokens
--
-- Only sha256(token) is written. The raw token exists in the email link / bot
-- deep link and is never stored in the database or returned by status APIs.
-- ----------------------------------------------------------------------------
create table if not exists public.question_subscription_tokens (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.question_subscriptions(id) on delete cascade,
  purpose text not null
    check (purpose in (
      'confirm_email',
      'link_telegram',
      'unsubscribe_email',
      'unsubscribe_telegram',
      'unsubscribe_all'
    )),
  channel text not null
    check (channel in ('email', 'telegram', 'all')),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists question_subscription_tokens_subscription_idx
  on public.question_subscription_tokens (subscription_id, purpose);

create index if not exists question_subscription_tokens_expiry_idx
  on public.question_subscription_tokens (expires_at);

-- ----------------------------------------------------------------------------
-- Delivery log / queue
--
-- The unique key is the idempotency guarantee: a repeated event, a webhook
-- redelivery or a retry can never insert a second row for the same
-- answer + subscription + channel.
-- ----------------------------------------------------------------------------
create table if not exists public.question_answer_notifications (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.questions(id) on delete cascade,
  answer_id uuid not null
    references public.question_answers(id) on delete cascade,
  subscription_id uuid not null
    references public.question_subscriptions(id) on delete cascade,
  channel text not null
    check (channel in ('email', 'telegram')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0
    check (attempts >= 0 and attempts <= 20),
  last_error text
    check (last_error is null or char_length(last_error) <= 120),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_answer_notifications_event_unique
    unique (answer_id, subscription_id, channel)
);

create index if not exists question_answer_notifications_due_idx
  on public.question_answer_notifications (status, next_attempt_at, created_at);

create index if not exists question_answer_notifications_subscription_idx
  on public.question_answer_notifications (subscription_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Enqueue on a successfully saved human answer.
--
-- Only channels that were already active at answer-insert time are selected.
-- Creating a subscription later therefore never backfills old answers.
-- ----------------------------------------------------------------------------
create or replace function public.question_answer_enqueue_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.question_answer_notifications (
      question_id,
      answer_id,
      subscription_id,
      channel
    )
    select new.question_id, new.id, s.id, 'email'
    from public.question_subscriptions s
    where s.question_id = new.question_id
      and s.email_status = 'active'
      and s.email is not null
    on conflict (answer_id, subscription_id, channel) do nothing;

    insert into public.question_answer_notifications (
      question_id,
      answer_id,
      subscription_id,
      channel
    )
    select new.question_id, new.id, s.id, 'telegram'
    from public.question_subscriptions s
    where s.question_id = new.question_id
      and s.telegram_status = 'active'
      and s.telegram_user_id is not null
    on conflict (answer_id, subscription_id, channel) do nothing;
  exception when others then
    -- Notification bookkeeping must never roll back the human answer.
    raise warning 'question notification enqueue failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists question_answers_enqueue_notifications
  on public.question_answers;

create trigger question_answers_enqueue_notifications
  after insert on public.question_answers
  for each row execute function public.question_answer_enqueue_notifications();

-- ----------------------------------------------------------------------------
-- Claim due deliveries.
--
-- Rows are leased for five minutes (sending). A crashed worker becomes
-- retryable after the lease expires. A disabled channel is marked skipped so
-- it stops consuming queue slots.
-- ----------------------------------------------------------------------------
create or replace function public.question_claim_answer_notifications(
  p_limit integer default 20
)
returns table (
  notification_id uuid,
  subscription_id uuid,
  channel text,
  question_id uuid,
  question_text text,
  answer_id uuid,
  email text,
  telegram_user_id bigint,
  telegram_chat_id bigint,
  attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  update public.question_answer_notifications n
     set status = 'skipped',
         last_error = 'channel_inactive',
         updated_at = now()
   where n.status in ('pending', 'failed', 'sending')
     and not exists (
       select 1
       from public.question_subscriptions s
       where s.id = n.subscription_id
         and (
           (n.channel = 'email' and s.email_status = 'active' and s.email is not null)
           or (
             n.channel = 'telegram'
             and s.telegram_status = 'active'
             and s.telegram_user_id is not null
           )
         )
     );

  return query
  with due as (
    select n.id
    from public.question_answer_notifications n
    where n.attempts < 6
      and exists (
        select 1
        from public.question_subscriptions s
        where s.id = n.subscription_id
          and (
            (n.channel = 'email' and s.email_status = 'active' and s.email is not null)
            or (
              n.channel = 'telegram'
              and s.telegram_status = 'active'
              and s.telegram_user_id is not null
            )
          )
      )
      and (
        (n.status in ('pending', 'failed')
          and (n.next_attempt_at is null or n.next_attempt_at <= now()))
        or (
          n.status = 'sending'
          and n.updated_at < now() - interval '5 minutes'
        )
      )
    order by n.created_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.question_answer_notifications n
       set status = 'sending',
           attempts = n.attempts + 1,
           updated_at = now()
      from due
     where n.id = due.id
    returning n.id, n.subscription_id, n.channel, n.question_id,
              n.answer_id, n.attempts
  )
  select
    c.id as notification_id,
    c.subscription_id as subscription_id,
    c.channel as channel,
    c.question_id as question_id,
    q.question as question_text,
    c.answer_id as answer_id,
    s.email as email,
    s.telegram_user_id as telegram_user_id,
    s.telegram_chat_id as telegram_chat_id,
    c.attempts as attempts
  from claimed c
  join public.question_subscriptions s on s.id = c.subscription_id
  join public.questions q on q.id = c.question_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Record one delivery result. Only the worker that currently leases the row
-- can complete it, so a duplicate worker cannot overwrite a fresh result.
-- ----------------------------------------------------------------------------
create or replace function public.question_complete_answer_notification(
  p_notification_id uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_notification_id is null or p_status is null
     or p_status not in ('sent', 'failed', 'skipped') then
    return false;
  end if;

  update public.question_answer_notifications n
     set status = p_status,
         last_error = case
           when p_status = 'failed'
             then left(
               coalesce(nullif(btrim(p_error), ''), 'delivery_failed'),
               120
             )
           else null
         end,
         sent_at = case when p_status = 'sent' then now() else n.sent_at end,
         next_attempt_at = case
           when p_status = 'failed'
             then now() + make_interval(
               secs => least(3600, 60 * power(2, least(greatest(n.attempts, 1), 5)))
             )
           else null
         end,
         updated_at = now()
   where n.id = p_notification_id
     and n.status = 'sending';

  return found;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS and privileges. Nothing in this feature is readable by anon or
-- authenticated; the server uses service_role after its own authorization.
-- ----------------------------------------------------------------------------
alter table public.question_subscriptions enable row level security;
alter table public.question_subscription_tokens enable row level security;
alter table public.question_answer_notifications enable row level security;

revoke all on table public.question_subscriptions from public, anon, authenticated;
revoke all on table public.question_subscription_tokens from public, anon, authenticated;
revoke all on table public.question_answer_notifications from public, anon, authenticated;

grant all on table public.question_subscriptions to service_role;
grant all on table public.question_subscription_tokens to service_role;
grant all on table public.question_answer_notifications to service_role;

revoke all on function public.question_answer_enqueue_notifications()
  from public, anon, authenticated;
revoke all on function public.question_claim_answer_notifications(integer)
  from public, anon, authenticated;
revoke all on function public.question_complete_answer_notification(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.question_claim_answer_notifications(integer)
  to service_role;
grant execute on function public.question_complete_answer_notification(uuid, text, text)
  to service_role;

-- ----------------------------------------------------------------------------
-- Reuse the existing scheduler instead of adding a second cron.
-- brain_worker_tick already runs every five minutes and posts to protected
-- worker routes with the Vault-stored CRON secret.
-- ----------------------------------------------------------------------------
create or replace function public.brain_worker_tick()
returns jsonb
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_base text;
  v_secret text;
  v_brain_request bigint;
  v_graph_request bigint;
  v_media_request bigint;
  v_question_request bigint;
begin
  select decrypted_secret into v_base
  from vault.decrypted_secrets
  where name = 'brain_worker_base_url'
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'brain_worker_cron_secret'
  limit 1;

  if v_base is null or v_base = '' or v_secret is null or v_secret = '' then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'missing_vault_secrets',
      'required', jsonb_build_array('brain_worker_base_url', 'brain_worker_cron_secret')
    );
  end if;

  v_base := rtrim(v_base, '/');

  v_brain_request := net.http_post(
    v_base || '/api/cron/brain-worker',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  v_graph_request := net.http_post(
    v_base || '/api/cron/graph-worker',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  v_media_request := net.http_post(
    v_base || '/api/cron/media-analysis-worker',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  v_question_request := net.http_post(
    v_base || '/api/cron/question-notifications',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  return jsonb_build_object(
    'status', 'queued',
    'brain_request_id', v_brain_request,
    'graph_request_id', v_graph_request,
    'media_request_id', v_media_request,
    'question_request_id', v_question_request
  );
end;
$$;

revoke all on function public.brain_worker_tick() from public, anon, authenticated;
grant execute on function public.brain_worker_tick() to service_role;

commit;

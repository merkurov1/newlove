-- Pierrot answer provenance and channel telemetry
-- Date: 2026-11-20
--
-- ADDITIVE ONLY. Do NOT apply automatically to production.
--
-- Why:
--   * Some assistant rows in production had provider = NULL, which made the
--     Gemini -> DeepSeek transition impossible to prove from history.
--   * Deterministic server answers (navigation, human-presence copy, verified
--     owner tools) have no model provider but still need explicit provenance.
--   * The isolated Telegram personal assistant needs its own telemetry surface.
--   * Retrieval failures must be readable by day and channel/mode, not only as
--     one aggregate count.
--
-- This migration only widens two CHECK constraints and adds one read-only view.
-- It does not rewrite existing rows or delete data.

-- ---------------------------------------------------------------------------
-- 1. Assistant message provenance
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_messages
  DROP CONSTRAINT IF EXISTS pierrot_messages_provider_check;

ALTER TABLE public.pierrot_messages
  ADD CONSTRAINT pierrot_messages_provider_check
  CHECK (
    provider IS NULL
    OR provider IN ('gemini', 'deepseek', 'openrouter', 'deterministic', 'unknown')
  );

-- Keep both message RPCs in sync with the widened table constraint. Only the
-- allowed provider list changes; ordering, idempotency and provenance logic are
-- preserved exactly.
CREATE OR REPLACE FUNCTION public.pierrot_append_message(
  p_conversation_id TEXT,
  p_session_id TEXT,
  p_message_id TEXT,
  p_role TEXT,
  p_content TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS TABLE (sequence BIGINT, content TEXT, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence BIGINT;
  v_content TEXT;
BEGIN
  IF p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_session_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_message_id !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('user', 'assistant', 'human') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR char_length(p_content) < 1 OR char_length(p_content) > 4000 THEN
    RAISE EXCEPTION 'invalid_content_length' USING ERRCODE = '22001';
  END IF;

  IF p_provider IS NOT NULL
     AND p_provider NOT IN ('gemini', 'deepseek', 'openrouter', 'deterministic', 'unknown') THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id, 0));

  PERFORM 1
  FROM public.pierrot_conversations
  WHERE id = p_conversation_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT m.message_index, m.content
  INTO v_sequence, v_content
  FROM public.pierrot_messages m
  WHERE m.id = p_message_id
    AND m.conversation_id = p_conversation_id;

  IF FOUND THEN
    RETURN QUERY SELECT v_sequence, v_content, FALSE;
    RETURN;
  END IF;

  UPDATE public.pierrot_conversations
  SET next_message_sequence = next_message_sequence + 1,
      last_message_at = NOW(),
      updated_at = NOW(),
      expires_at = NOW() + INTERVAL '90 days'
  WHERE id = p_conversation_id AND session_id = p_session_id
  RETURNING next_message_sequence INTO v_sequence;

  INSERT INTO public.pierrot_messages (
    id,
    conversation_id,
    role,
    content,
    message_index,
    provider
  )
  VALUES (
    p_message_id,
    p_conversation_id,
    p_role,
    p_content,
    v_sequence,
    p_provider
  );

  RETURN QUERY SELECT v_sequence, p_content, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_append_message_v2(
  p_conversation_id text,
  p_session_id text,
  p_message_id text,
  p_role text,
  p_content text,
  p_provider text default null,
  p_history_id uuid default null,
  p_episode_id uuid default null
)
returns table (sequence bigint, content text, inserted boolean, history_sequence bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
  v_history_sequence bigint;
  v_content text;
  v_episode_history uuid;
  v_canonical text;
begin
  if p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_session_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_message_id !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'invalid_identifier' using errcode = '22023';
  end if;

  if p_role not in ('user', 'assistant') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 16000 then
    raise exception 'invalid_content_length' using errcode = '22001';
  end if;

  if p_provider is not null
     and p_provider not in ('gemini', 'deepseek', 'openrouter', 'deterministic', 'unknown') then
    raise exception 'invalid_provider' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id, 0));

  perform 1
  from public.pierrot_conversations
  where id = p_conversation_id and session_id = p_session_id;

  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if p_history_id is not null then
    select canonical_conversation_id into v_canonical
    from public.pierrot_histories
    where id = p_history_id;

    if not found then
      raise exception 'history_not_found' using errcode = 'P0002';
    end if;

    if p_episode_id is null then
      raise exception 'session_required' using errcode = '22023';
    end if;

    select history_id into v_episode_history
    from public.pierrot_sessions
    where id = p_episode_id;

    if not found or v_episode_history <> p_history_id then
      raise exception 'session_not_found' using errcode = 'P0002';
    end if;

    if v_canonical is not null and v_canonical <> p_conversation_id then
      raise exception 'conversation_not_in_history' using errcode = '22023';
    end if;
  end if;

  select m.message_index, m.content, m.history_sequence
  into v_sequence, v_content, v_history_sequence
  from public.pierrot_messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if found then
    return query select v_sequence, v_content, false, v_history_sequence;
    return;
  end if;

  update public.pierrot_conversations
  set next_message_sequence = next_message_sequence + 1,
      last_message_at = now(),
      updated_at = now(),
      expires_at = case
        when identity_type = 'owner' then now() + interval '3650 days'
        else now() + interval '90 days'
      end
  where id = p_conversation_id and session_id = p_session_id
  returning next_message_sequence into v_sequence;

  if p_history_id is not null then
    update public.pierrot_histories
    set next_message_sequence = next_message_sequence + 1,
        updated_at = now()
    where id = p_history_id
    returning next_message_sequence into v_history_sequence;
  end if;

  insert into public.pierrot_messages (
    id, conversation_id, role, content, message_index, provider,
    history_id, session_id, history_sequence
  )
  values (
    p_message_id, p_conversation_id, p_role, p_content, v_sequence, p_provider,
    p_history_id, p_episode_id, v_history_sequence
  );

  if p_history_id is not null and p_episode_id is not null then
    update public.pierrot_sessions
    set message_count = message_count + 1,
        first_message_sequence = coalesce(first_message_sequence, v_history_sequence),
        last_message_sequence = v_history_sequence,
        last_message_at = now(),
        title = case
          when p_role = 'user'
               and (title is null or title = '' or title = 'Новая сессия')
            then left(p_content, 120)
          else title
        end,
        updated_at = now()
    where id = p_episode_id;
  end if;

  return query select v_sequence, p_content, true, v_history_sequence;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. LLM telemetry channel
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- The telemetry table is its own additive migration. This migration must be
  -- safe to apply even when the owner has not applied it yet.
  IF to_regclass('public.pierrot_llm_calls') IS NOT NULL THEN
    ALTER TABLE public.pierrot_llm_calls
      DROP CONSTRAINT IF EXISTS pierrot_llm_calls_surface_check;

    ALTER TABLE public.pierrot_llm_calls
      ADD CONSTRAINT pierrot_llm_calls_surface_check
      CHECK (surface IN (
        'pierrot_web',
        'pierrot_stream',
        'telegram_personal_assistant',
        'question',
        'flow_issue',
        'flow_item',
        'brain',
        'media',
        'intake',
        'art_engine',
        'evaluation',
        'unknown'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Retrieval failures by day and channel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pierrot_v_retrieval_failures_by_day_mode
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', e.created_at) AS day,
  COALESCE(e.payload->>'mode', 'unknown') AS mode,
  COALESCE(e.payload->>'outcome', 'unknown') AS outcome,
  COALESCE(e.payload->>'code', 'none') AS code,
  COUNT(*)::BIGINT AS event_count,
  COUNT(DISTINCT e.conversation_id)::BIGINT AS conversation_count,
  MAX(e.created_at) AS last_seen_at
FROM public.pierrot_events e
WHERE e.event_name = 'brain_retrieval'
  AND (
    COALESCE(e.payload->>'outcome', '') <> 'relevant_results'
    OR e.payload->>'code' IS NOT NULL
  )
GROUP BY 1, 2, 3, 4;

REVOKE ALL ON public.pierrot_v_retrieval_failures_by_day_mode
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pierrot_v_retrieval_failures_by_day_mode TO service_role;

-- Manual application:
--   psql "$SUPABASE_DB_URL" -f migrations/2026-11-20_pierrot_answer_provenance.sql
-- Never apply this migration automatically from the application.
--
-- Verification:
--   SELECT provider, count(*) FROM public.pierrot_messages
--   WHERE role = 'assistant' AND created_at > now() - interval '1 day'
--   GROUP BY provider;
--
--   SELECT day, mode, outcome, code, event_count
--   FROM public.pierrot_v_retrieval_failures_by_day_mode
--   WHERE day > now() - interval '7 days'
--   ORDER BY day DESC, event_count DESC;

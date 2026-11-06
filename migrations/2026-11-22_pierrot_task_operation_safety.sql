-- Migration: atomic owner task status operations
-- Date: 2026-11-22
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- Batch completion/archiving must update only the explicit decision IDs that
-- the owner confirmed. This function provides one transaction for that exact
-- ID set and writes one status_changed event per actually changed row.

create or replace function public.pierrot_apply_decision_status(
  p_user_id uuid,
  p_decision_ids uuid[],
  p_status text,
  p_archived_reason text,
  p_event_reason text
)
returns table (
  decision_id uuid,
  previous_status text,
  new_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_previous text;
  v_updated integer := 0;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id' using errcode = '22023';
  end if;

  if p_status not in ('completed', 'archived') then
    raise exception 'invalid_target_status' using errcode = '22023';
  end if;

  if p_decision_ids is null or array_length(p_decision_ids, 1) is null then
    return;
  end if;

  if array_length(p_decision_ids, 1) > 500 then
    raise exception 'too_many_decisions' using errcode = '22023';
  end if;

  foreach v_id in array p_decision_ids loop
    select d.status
      into v_previous
      from public.pierrot_decisions d
     where d.id = v_id
       and d.user_id = p_user_id
     for update;

    if not found then
      continue;
    end if;

    if v_previous is distinct from p_status then
      update public.pierrot_decisions d
         set status = p_status,
             archived_reason = p_archived_reason,
             updated_at = now()
       where d.id = v_id
         and d.user_id = p_user_id;

      insert into public.pierrot_decision_events (
        decision_id,
        user_id,
        event_type,
        from_status,
        to_status,
        metadata
      ) values (
        v_id,
        p_user_id,
        'status_changed',
        v_previous,
        p_status,
        jsonb_build_object(
          'source', 'owner_chat',
          'reason', p_event_reason,
          'contentChanged', false,
          'archivedReason', p_archived_reason
        )
      );

      v_updated := v_updated + 1;
    end if;

    decision_id := v_id;
    previous_status := v_previous;
    new_status := p_status;
    return next;
  end loop;

  -- No explicit success claim beyond the rows actually returned above.
  if v_updated = 0 then
    return;
  end if;
end;
$$;

revoke all on function public.pierrot_apply_decision_status(uuid, uuid[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.pierrot_apply_decision_status(uuid, uuid[], text, text, text)
  to service_role;

comment on function public.pierrot_apply_decision_status(uuid, uuid[], text, text, text) is
  'Owner-only atomic status update for an explicitly confirmed decision ID set. Never accepts queries or project names.';

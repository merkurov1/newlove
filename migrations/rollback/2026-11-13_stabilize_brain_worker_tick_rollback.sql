-- Rollback: restore the unconditional brain_worker_tick dispatcher.
-- Date: 2026-11-13

CREATE OR REPLACE FUNCTION public.brain_worker_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_base text;
  v_secret text;
  v_brain_request bigint;
  v_graph_request bigint;
  v_media_request bigint;
BEGIN
  SELECT decrypted_secret INTO v_base
  FROM vault.decrypted_secrets
  WHERE name = 'brain_worker_base_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'brain_worker_cron_secret'
  LIMIT 1;

  IF v_base IS NULL OR v_base = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'missing_vault_secrets',
      'required', jsonb_build_array('brain_worker_base_url', 'brain_worker_cron_secret')
    );
  END IF;

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

  RETURN jsonb_build_object(
    'status', 'queued',
    'brain_request_id', v_brain_request,
    'graph_request_id', v_graph_request,
    'media_request_id', v_media_request
  );
END;
$function$


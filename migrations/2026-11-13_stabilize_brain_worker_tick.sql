-- Migration: make the pg_cron brain worker dispatch conditional
-- Date: 2026-11-13
--
-- Previously brain_worker_tick() posted three HTTP requests every five minutes
-- even when every queue was empty. Each request becomes a Vercel Function
-- invocation. This version checks the existing durable queues first and only
-- calls the endpoint that has work.

CREATE OR REPLACE FUNCTION public.brain_worker_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_base text;
  v_secret text;
  v_brain boolean;
  v_graph boolean;
  v_media boolean;
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

  SELECT EXISTS (
    SELECT 1 FROM public.brain_ingestion_jobs
    WHERE status IN ('queued', 'processing')
  ) INTO v_brain;

  SELECT EXISTS (
    SELECT 1 FROM public.brain_graph_jobs
    WHERE status IN ('queued', 'processing')
  ) INTO v_graph;

  SELECT EXISTS (
    SELECT 1 FROM public.media_analysis_runs
    WHERE status IN ('pending', 'processing')
  ) INTO v_media;

  IF NOT (v_brain OR v_graph OR v_media) THEN
    RETURN jsonb_build_object(
      'status', 'idle',
      'brain', false,
      'graph', false,
      'media', false,
      'message', 'no queued work; no HTTP requests sent'
    );
  END IF;

  v_base := rtrim(v_base, '/');

  IF v_brain THEN
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
  END IF;

  IF v_graph THEN
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
  END IF;

  IF v_media THEN
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
  END IF;

  RETURN jsonb_build_object(
    'status', 'queued',
    'brain', v_brain,
    'graph', v_graph,
    'media', v_media,
    'brain_request_id', v_brain_request,
    'graph_request_id', v_graph_request,
    'media_request_id', v_media_request
  );
END;
$function$;

COMMENT ON FUNCTION public.brain_worker_tick() IS
  'pg_cron dispatcher: sends HTTP worker requests only for queues with queued/processing work.';

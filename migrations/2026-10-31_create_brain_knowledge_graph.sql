-- Migration: Brain knowledge graph, thematic summaries and editorial radar
-- Date: 2026-10-31
--
-- Additive layer over the existing knowledge_documents / knowledge_chunks RAG
-- tables. Vector search is not replaced. Every entity mention and relationship
-- carries document/chunk provenance. All tables are owner-only.
--
-- The migration is idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Extraction runs and document-level state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_graph_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  extractor_version text NOT NULL,
  model text NOT NULL,
  total_documents integer NOT NULL DEFAULT 0 CHECK (total_documents >= 0),
  completed_documents integer NOT NULL DEFAULT 0 CHECK (completed_documents >= 0),
  failed_documents integer NOT NULL DEFAULT 0 CHECK (failed_documents >= 0),
  skipped_documents integer NOT NULL DEFAULT 0 CHECK (skipped_documents >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.brain_graph_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.brain_graph_runs(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'skipped', 'failed', 'cancelled')),
  content_hash text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  error_code text,
  error_detail text,
  worker_id text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, document_id)
);

CREATE INDEX IF NOT EXISTS brain_graph_jobs_run_status_idx
  ON public.brain_graph_jobs (run_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.brain_document_extractions (
  document_id text PRIMARY KEY REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  extractor_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'skipped')),
  entity_count integer NOT NULL DEFAULT 0 CHECK (entity_count >= 0),
  relationship_count integer NOT NULL DEFAULT 0 CHECK (relationship_count >= 0),
  mention_count integer NOT NULL DEFAULT 0 CHECK (mention_count >= 0),
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error_code text,
  error_detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  last_extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Entities, mentions, relationships and topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_entities (
  id text PRIMARY KEY CHECK (id ~ '^ent_[a-f0-9]{32}$'),
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'person', 'organization', 'publication', 'country', 'city',
      'technology', 'artwork', 'art_project', 'event', 'concept', 'theme'
    )),
  canonical_name text NOT NULL CHECK (char_length(canonical_name) BETWEEN 1 AND 300),
  normalized_name text NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 300),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  confidence numeric(4,3) NOT NULL DEFAULT 0.600 CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, normalized_name)
);

CREATE INDEX IF NOT EXISTS brain_entities_type_idx
  ON public.brain_entities (entity_type, canonical_name);

CREATE TABLE IF NOT EXISTS public.brain_entity_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text NOT NULL REFERENCES public.brain_entities(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_id text NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  section_path text[] NOT NULL DEFAULT '{}'::text[],
  mention_text text CHECK (mention_text IS NULL OR char_length(mention_text) <= 500),
  evidence text CHECK (evidence IS NULL OR char_length(evidence) <= 1000),
  confidence numeric(4,3) NOT NULL DEFAULT 0.600 CHECK (confidence >= 0 AND confidence <= 1),
  extractor_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS brain_entity_mentions_document_idx
  ON public.brain_entity_mentions (document_id, entity_id);

CREATE INDEX IF NOT EXISTS brain_entity_mentions_entity_idx
  ON public.brain_entity_mentions (entity_id, document_id);

CREATE TABLE IF NOT EXISTS public.brain_relationships (
  id text PRIMARY KEY CHECK (id ~ '^rel_[a-f0-9]{32}$'),
  source_entity_id text NOT NULL REFERENCES public.brain_entities(id) ON DELETE CASCADE,
  target_entity_id text NOT NULL REFERENCES public.brain_entities(id) ON DELETE CASCADE,
  relation_type text NOT NULL
    CHECK (relation_type IN (
      'authored_by', 'published_in', 'mentions', 'discusses', 'related_to',
      'created_by', 'part_of', 'occurred_in', 'contradicts', 'develops', 'references'
    )),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  provenance_document_id text NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  provenance_chunk_id text NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 1 AND 1000),
  inference boolean NOT NULL DEFAULT false,
  origin text NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'rule')),
  verified boolean NOT NULL DEFAULT false,
  extractor_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_entity_id, target_entity_id, relation_type, provenance_chunk_id)
);

CREATE INDEX IF NOT EXISTS brain_relationships_source_idx
  ON public.brain_relationships (source_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS brain_relationships_target_idx
  ON public.brain_relationships (target_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS brain_relationships_document_idx
  ON public.brain_relationships (provenance_document_id);

CREATE TABLE IF NOT EXISTS public.brain_document_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  entity_id text NOT NULL REFERENCES public.brain_entities(id) ON DELETE CASCADE,
  weight numeric(6,3) NOT NULL DEFAULT 1.000 CHECK (weight >= 0),
  extractor_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, entity_id)
);

CREATE INDEX IF NOT EXISTS brain_document_topics_entity_idx
  ON public.brain_document_topics (entity_id, weight DESC);

-- ---------------------------------------------------------------------------
-- 3. Thematic summaries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_thematic_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL
    CHECK (scope_type IN ('document', 'chapter', 'project', 'theme')),
  scope_key text NOT NULL CHECK (char_length(scope_key) BETWEEN 1 AND 300),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  document_ids text[] NOT NULL DEFAULT '{}'::text[],
  entity_ids text[] NOT NULL DEFAULT '{}'::text[],
  confidence numeric(4,3) NOT NULL DEFAULT 0.600 CHECK (confidence >= 0 AND confidence <= 1),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provenance) = 'object' AND pg_column_size(provenance) <= 8192),
  extractor_version text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_key)
);

CREATE INDEX IF NOT EXISTS brain_thematic_summaries_scope_idx
  ON public.brain_thematic_summaries (scope_type, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Editorial radar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_radar_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  cluster_count integer NOT NULL DEFAULT 0 CHECK (cluster_count >= 0),
  model text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.brain_editorial_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  radar_run_id uuid REFERENCES public.brain_radar_runs(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 300),
  representative_question text NOT NULL CHECK (char_length(representative_question) BETWEEN 1 AND 1000),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences >= 0),
  avg_retrieval_similarity numeric(5,4),
  missing_knowledge boolean NOT NULL DEFAULT false,
  related_document_ids text[] NOT NULL DEFAULT '{}'::text[],
  related_document_titles text[] NOT NULL DEFAULT '{}'::text[],
  related_entity_ids text[] NOT NULL DEFAULT '{}'::text[],
  suggestion text NOT NULL CHECK (char_length(suggestion) BETWEEN 1 AND 2000),
  rationale text CHECK (rationale IS NULL OR char_length(rationale) <= 2000),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_editorial_suggestions_status_idx
  ON public.brain_editorial_suggestions (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Atomic job claim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.brain_claim_next_graph_job(
  p_run_id uuid,
  p_worker text
)
RETURNS SETOF public.brain_graph_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT id INTO v_job_id
  FROM public.brain_graph_jobs
  WHERE run_id = p_run_id
    AND status = 'queued'
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.brain_graph_jobs j
  SET status = 'processing',
      worker_id = p_worker,
      locked_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = v_job_id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_claim_next_graph_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_claim_next_graph_job(uuid, text) TO service_role;

-- Atomic replacement of one document's graph slice. Entities are global and
-- merged; mentions, relationships and topics are replaced for this document.
CREATE OR REPLACE FUNCTION public.brain_replace_document_graph(
  p_document_id text,
  p_entities jsonb,
  p_mentions jsonb,
  p_relationships jsonb,
  p_topics jsonb,
  p_extractor_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entities integer := 0;
  v_mentions integer := 0;
  v_relationships integer := 0;
  v_topics integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_documents WHERE id = p_document_id
  ) THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.brain_entity_mentions WHERE document_id = p_document_id;
  DELETE FROM public.brain_relationships WHERE provenance_document_id = p_document_id;
  DELETE FROM public.brain_document_topics WHERE document_id = p_document_id;

  INSERT INTO public.brain_entities (
    id, entity_type, canonical_name, normalized_name, description, aliases, confidence, metadata
  )
  SELECT
    e.id, e.entity_type, e.canonical_name, e.normalized_name, e.description,
    COALESCE(e.aliases, '{}'::text[]), COALESCE(e.confidence, 0.6), COALESCE(e.metadata, '{}'::jsonb)
  FROM jsonb_to_recordset(COALESCE(p_entities, '[]'::jsonb)) AS e(
    id text, entity_type text, canonical_name text, normalized_name text,
    description text, aliases text[], confidence numeric, metadata jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    canonical_name = EXCLUDED.canonical_name,
    description = COALESCE(EXCLUDED.description, public.brain_entities.description),
    aliases = ARRAY(
      SELECT DISTINCT alias
      FROM unnest(public.brain_entities.aliases || EXCLUDED.aliases) AS alias
      WHERE alias IS NOT NULL AND alias <> ''
    ),
    confidence = GREATEST(public.brain_entities.confidence, EXCLUDED.confidence),
    updated_at = now();

  GET DIAGNOSTICS v_entities = ROW_COUNT;

  INSERT INTO public.brain_entity_mentions (
    entity_id, document_id, chunk_id, section_path, mention_text, evidence,
    confidence, extractor_version
  )
  SELECT
    m.entity_id, p_document_id, m.chunk_id, COALESCE(m.section_path, '{}'::text[]),
    m.mention_text, m.evidence, COALESCE(m.confidence, 0.6), p_extractor_version
  FROM jsonb_to_recordset(COALESCE(p_mentions, '[]'::jsonb)) AS m(
    entity_id text, chunk_id text, section_path text[], mention_text text,
    evidence text, confidence numeric
  )
  ON CONFLICT (entity_id, chunk_id) DO UPDATE SET
    evidence = COALESCE(EXCLUDED.evidence, public.brain_entity_mentions.evidence),
    confidence = GREATEST(public.brain_entity_mentions.confidence, EXCLUDED.confidence);

  GET DIAGNOSTICS v_mentions = ROW_COUNT;

  INSERT INTO public.brain_relationships (
    id, source_entity_id, target_entity_id, relation_type, confidence,
    provenance_document_id, provenance_chunk_id, evidence, inference, origin,
    verified, extractor_version, metadata
  )
  SELECT
    r.id, r.source_entity_id, r.target_entity_id, r.relation_type, COALESCE(r.confidence, 0.5),
    p_document_id, r.chunk_id, r.evidence, COALESCE(r.inference, false), 'model',
    false, p_extractor_version, COALESCE(r.metadata, '{}'::jsonb)
  FROM jsonb_to_recordset(COALESCE(p_relationships, '[]'::jsonb)) AS r(
    id text, source_entity_id text, target_entity_id text, relation_type text,
    confidence numeric, chunk_id text, evidence text, inference boolean, metadata jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    confidence = GREATEST(public.brain_relationships.confidence, EXCLUDED.confidence),
    evidence = EXCLUDED.evidence,
    inference = EXCLUDED.inference,
    updated_at = now();

  GET DIAGNOSTICS v_relationships = ROW_COUNT;

  INSERT INTO public.brain_document_topics (
    document_id, entity_id, weight, extractor_version
  )
  SELECT
    p_document_id, t.entity_id, COALESCE(t.weight, 1), p_extractor_version
  FROM jsonb_to_recordset(COALESCE(p_topics, '[]'::jsonb)) AS t(
    entity_id text, weight numeric
  )
  ON CONFLICT (document_id, entity_id) DO UPDATE SET
    weight = EXCLUDED.weight,
    extractor_version = EXCLUDED.extractor_version,
    updated_at = now();

  GET DIAGNOSTICS v_topics = ROW_COUNT;

  RETURN jsonb_build_object(
    'entities', v_entities,
    'mentions', v_mentions,
    'relationships', v_relationships,
    'topics', v_topics
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_replace_document_graph(text, jsonb, jsonb, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_replace_document_graph(text, jsonb, jsonb, jsonb, jsonb, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.brain_graph_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_graph_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_entity_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_document_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_thematic_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_radar_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_editorial_suggestions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brain_graph_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_graph_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_document_extractions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_entity_mentions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_relationships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_document_topics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_thematic_summaries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_radar_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_editorial_suggestions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_graph_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_graph_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_document_extractions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_entities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_entity_mentions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_relationships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_document_topics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_thematic_summaries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_radar_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_editorial_suggestions TO service_role;

COMMENT ON TABLE public.brain_entities IS
  'Owner-only canonical entities extracted from Brain documents.';
COMMENT ON TABLE public.brain_entity_mentions IS
  'Every entity mention keeps its document and chunk provenance.';
COMMENT ON TABLE public.brain_relationships IS
  'Model-inferred relationships are marked inference=true and verified=false until the owner verifies them.';
COMMENT ON TABLE public.brain_thematic_summaries IS
  'Grounded summaries for documents, manuscript chapters, projects and recurring themes.';
COMMENT ON TABLE public.brain_editorial_suggestions IS
  'Owner-reviewed editorial suggestions. Nothing here publishes public content automatically.';

#!/usr/bin/env node
/**
 * Operator recovery for an existing Brain ingestion queue.
 *
 * The command is read-only unless `--retry-safe-failed` or `--process` is
 * passed explicitly. It never inserts a Brain job, never deletes a document,
 * never rewrites a Media Archive row and never applies a migration.
 *
 * Typical use:
 *   npx tsx scripts/knowledge/brain-ingestion-recovery.ts --status
 *   npx tsx scripts/knowledge/brain-ingestion-recovery.ts \
 *     --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 --status
 *   npx tsx scripts/knowledge/brain-ingestion-recovery.ts \
 *     --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 --triage \
 *     --report docs/audits/brain-ingestion-87443bd7-triage.json
 *   npx tsx scripts/knowledge/brain-ingestion-recovery.ts \
 *     --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
 *     --retry-job <approved-job-id> --process --max-jobs 5
 *
 * `--triage` is read-only and emits one explicit decision per failed/partial
 * job. `--process` calls the same bounded `runBrainWorker()` used by the admin
 * and cron endpoints. It only claims rows that already exist. `--retry-job`
 * requeues only the explicitly approved failed row in place. The batch-wide
 * `--retry-safe-failed` remains available but is not a substitute for the
 * per-item approval required by the Media Archive recovery task.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Client } from 'pg';

import { createBrainStore } from '@/lib/knowledge/brain/store';
import {
  buildTriageReport,
  type TriageJobInput,
  type TriageReport,
} from '@/lib/knowledge/brain/jobTriage';
import {
  classifyFailedJobRetry,
  summarizeBrainQueue,
  type BrainQueueJobSnapshot,
} from '@/lib/knowledge/brain/queueReport';
import { runBrainWorker } from '@/lib/knowledge/brain/worker';
import { searchMediaIntelligence } from '@/lib/knowledge/media/search';
import {
  createOpenRouterEmbeddingClientFromEnv,
  type EmbeddingClient,
} from '@/lib/knowledge/rag/embeddings';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env.production.local', quiet: true });
dotenv.config({ quiet: true });

type RunRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type CostRow = {
  documents: string | number;
  source_chars: string | number;
  chunks: string | number;
};

type RetrievalProbeRow = {
  document_id: string;
  media_record_id: string;
  title: string;
  outlet: string | null;
  published_date: string | null;
  probe_text: string | null;
};

type RetryCandidate = BrainQueueJobSnapshot & {
  attempts: number;
  max_attempts: number;
};

type TriageRow = {
  id: string;
  run_id: string;
  status: string;
  source_type: string;
  media_record_id: string | null;
  normalized_url: string | null;
  input_url: string | null;
  canonical_url: string | null;
  final_url: string | null;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_detail: string | null;
  extraction_status: string | null;
  extraction_metadata: Record<string, unknown> | null;
  title: string | null;
  created_at: string;
  processed_at: string | null;
  media_id: string | null;
  media_status: string | null;
  media_url: string | null;
  media_canonical_url: string | null;
  media_published_date: string | null;
  media_outlet: string | null;
  media_kind: string | null;
  media_indexing_status: string | null;
  media_indexing_error: string | null;
  media_ai_metadata: Record<string, unknown> | null;
  document_id: string | null;
  document_ingestion_status: string | null;
  document_extraction_status: string | null;
  document_coverage_status: string | null;
  document_text_quality: string | null;
  document_coverage_error_code: string | null;
  document_chunk_count: number | string | null;
  document_source_char_count: number | string | null;
  document_content_origin: string | null;
  document_updated_at: string | null;
  chunk_rows: number | string | null;
  chunk_min_chars: number | string | null;
  chunk_max_chars: number | string | null;
  chunk_first_index: number | string | null;
  chunk_last_index: number | string | null;
};

type ActiveJobRow = {
  id: string;
  media_record_id: string | null;
  normalized_url: string | null;
};

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

/** Supports repeated flags such as `--retry-job <id> --retry-job <id>`. */
function argValues(name: string): string[] {
  const values: string[] = [];

  process.argv.forEach((arg, index) => {
    if (arg !== name) return;
    const value = process.argv[index + 1];
    if (value && !value.startsWith('--')) values.push(value);
  });

  return Array.from(new Set(values));
}

function intArg(name: string, fallback: number, min: number, max: number): number {
  const raw = argValue(name);
  const value = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function optionalPrice(): number | null {
  const raw = (process.env.BRAIN_EMBEDDING_INPUT_USD_PER_MILLION || '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isLocalConnection(connectionString: string): boolean {
  return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
}

async function createDbClient(): Promise<Client> {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;

  if (!connectionString) throw new Error('DATABASE_URL_or_POSTGRES_URL_missing');

  const client = new Client({
    connectionString,
    ssl: isLocalConnection(connectionString) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function loadRun(client: Client, runId: string): Promise<RunRow | null> {
  const { rows } = await client.query<RunRow>(
    `select id, status, metadata, created_at, updated_at, completed_at
       from public.brain_ingestion_runs
      where id = $1::uuid`,
    [runId]
  );

  return rows[0] || null;
}

async function loadJobs(client: Client, runId: string | null): Promise<BrainQueueJobSnapshot[]> {
  const { rows } = await client.query<BrainQueueJobSnapshot>(
    `select id, run_id, status, source_type, media_record_id, normalized_url,
            attempts, max_attempts, error_code, error_detail, created_at
       from public.brain_ingestion_jobs
      where ($1::uuid is null or run_id = $1::uuid)
      order by created_at, id`,
    [runId]
  );

  return rows;
}

async function loadCost(client: Client, runId: string | null) {
  const { rows } = await client.query<CostRow>(
    `with scoped as (
       select distinct document_id, media_record_id
         from public.brain_ingestion_jobs
        where ($1::uuid is null or run_id = $1::uuid)
     )
     select count(distinct d.id)::int as documents,
            coalesce(sum(d.source_char_count), 0)::bigint as source_chars,
            coalesce(sum(d.chunk_count), 0)::bigint as chunks
       from public.knowledge_documents d
      where d.id in (select document_id from scoped where document_id is not null)
         or d.media_record_id in (select media_record_id from scoped where media_record_id is not null)`,
    [runId]
  );

  const row = rows[0];

  return {
    documents: Number(row?.documents || 0),
    sourceChars: Number(row?.source_chars || 0),
    chunks: Number(row?.chunks || 0),
  };
}

/**
 * Read-only item-level evidence for every failed/partial job in a run: the job
 * row and redacted debug metadata, the Media Archive record, the linked document
 * and the real chunk row count. No row is mutated and no content is returned.
 */
async function loadTriageInputs(client: Client, runId: string | null): Promise<TriageJobInput[]> {
  const [rows, active] = await Promise.all([
    client.query<TriageRow>(
      `select j.id::text as id,
              j.run_id::text as run_id,
              j.status,
              j.source_type,
              j.media_record_id::text as media_record_id,
              j.normalized_url,
              j.input_url,
              j.canonical_url,
              j.final_url,
              j.attempts,
              j.max_attempts,
              j.error_code,
              j.error_detail,
              j.extraction_status,
              j.extraction_metadata,
              j.title,
              j.created_at::text as created_at,
              j.processed_at::text as processed_at,
              m.id::text as media_id,
              m.status as media_status,
              m.url as media_url,
              m.canonical_url as media_canonical_url,
              m.published_date::text as media_published_date,
              m.outlet as media_outlet,
              m.kind as media_kind,
              m.indexing_status as media_indexing_status,
              m.indexing_error as media_indexing_error,
              m.ai_metadata as media_ai_metadata,
              d.id as document_id,
              d.ingestion_status as document_ingestion_status,
              d.extraction_status as document_extraction_status,
              d.media_coverage_status as document_coverage_status,
              d.media_text_quality as document_text_quality,
              d.media_coverage_error_code as document_coverage_error_code,
              d.chunk_count as document_chunk_count,
              d.source_char_count as document_source_char_count,
              nullif(d.metadata->>'content_origin', '') as document_content_origin,
              d.updated_at::text as document_updated_at,
              coalesce(cs.chunk_rows, 0)::int as chunk_rows,
              cs.chunk_min_chars,
              cs.chunk_max_chars,
              cs.chunk_first_index,
              cs.chunk_last_index
         from public.brain_ingestion_jobs j
         left join public.media_archive_records m on m.id = j.media_record_id
         left join lateral (
           select d.*
             from public.knowledge_documents d
            where (j.document_id is not null and d.id = j.document_id)
               or (j.media_record_id is not null and d.media_record_id = j.media_record_id)
            order by (d.id = j.document_id) desc, d.updated_at desc
            limit 1
         ) d on true
         left join lateral (
           select count(*)::int as chunk_rows,
                  min(char_length(c.content))::int as chunk_min_chars,
                  max(char_length(c.content))::int as chunk_max_chars,
                  min(c.chunk_index)::int as chunk_first_index,
                  max(c.chunk_index)::int as chunk_last_index
             from public.knowledge_chunks c
            where c.document_id = d.id
         ) cs on true
        where ($1::uuid is null or j.run_id = $1::uuid)
          and j.status in ('failed', 'partial')
        order by j.created_at, j.id`,
      [runId]
    ),
    client.query<ActiveJobRow>(
      `select id::text as id, media_record_id::text as media_record_id, normalized_url
         from public.brain_ingestion_jobs
        where status in ('queued', 'processing')`
    ),
  ]);

  const activeByMedia = new Map<string, string[]>();
  const activeByUrl = new Map<string, string[]>();

  for (const job of active.rows) {
    if (job.media_record_id) {
      activeByMedia.set(job.media_record_id, [
        ...(activeByMedia.get(job.media_record_id) || []),
        job.id,
      ]);
    }
    if (job.normalized_url) {
      activeByUrl.set(job.normalized_url, [...(activeByUrl.get(job.normalized_url) || []), job.id]);
    }
  }

  const numberOrNull = (value: number | string | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return rows.rows.map((row) => {
    const duplicateIds = new Set<string>();
    for (const id of (row.media_record_id && activeByMedia.get(row.media_record_id)) || []) {
      duplicateIds.add(id);
    }
    for (const id of (row.normalized_url && activeByUrl.get(row.normalized_url)) || []) {
      duplicateIds.add(id);
    }
    duplicateIds.delete(row.id);

    return {
      job: {
        id: row.id,
        run_id: row.run_id,
        status: row.status,
        source_type: row.source_type,
        media_record_id: row.media_record_id,
        normalized_url: row.normalized_url,
        input_url: row.input_url,
        canonical_url: row.canonical_url,
        final_url: row.final_url,
        attempts: Number(row.attempts) || 0,
        max_attempts: Number(row.max_attempts) || 0,
        error_code: row.error_code,
        error_detail: row.error_detail,
        extraction_status: row.extraction_status,
        extraction_metadata: row.extraction_metadata,
        title: row.title,
        created_at: row.created_at,
        processed_at: row.processed_at,
      },
      media: row.media_id
        ? {
            id: row.media_id,
            status: row.media_status,
            url: row.media_url,
            canonical_url: row.media_canonical_url,
            published_date: row.media_published_date,
            outlet: row.media_outlet,
            kind: row.media_kind,
            indexing_status: row.media_indexing_status,
            indexing_error: row.media_indexing_error,
            ai_metadata: row.media_ai_metadata,
          }
        : null,
      document: row.document_id
        ? {
            id: row.document_id,
            ingestion_status: row.document_ingestion_status,
            extraction_status: row.document_extraction_status,
            media_coverage_status: row.document_coverage_status,
            media_text_quality: row.document_text_quality,
            media_coverage_error_code: row.document_coverage_error_code,
            chunk_count: Number(row.document_chunk_count) || 0,
            source_char_count: Number(row.document_source_char_count) || 0,
            content_origin: row.document_content_origin,
            updated_at: row.document_updated_at,
          }
        : null,
      chunks: row.document_id
        ? {
            count: Number(row.chunk_rows) || 0,
            minChars: numberOrNull(row.chunk_min_chars),
            maxChars: numberOrNull(row.chunk_max_chars),
            firstIndex: numberOrNull(row.chunk_first_index),
            lastIndex: numberOrNull(row.chunk_last_index),
          }
        : null,
      activeDuplicateJobIds: Array.from(duplicateIds),
    };
  });
}

/**
 * Requeue only already-failed rows whose error is known transient. The update
 * is an in-place status reset: no new job row is inserted and partial/duplicate
 * jobs are left untouched. Active rows for the same media record or URL block a
 * retry so the partial unique index can never be violated.
 *
 * When `jobIds` is provided, only those explicit ids are considered. Item-level
 * triage decisions still have to pass the same transient/budget/active checks,
 * so an operator cannot force a retry for an access, paywall or metadata-only
 * failure.
 */
async function retrySafeFailedJobs(
  client: Client,
  runId: string | null,
  jobs: BrainQueueJobSnapshot[],
  options: { jobIds?: Set<string> } = {}
) {
  const requestedIds = options.jobIds ? Array.from(options.jobIds) : [];
  const selected = options.jobIds && options.jobIds.size > 0;
  const active = await client.query<ActiveJobRow>(
    `select id, media_record_id, normalized_url
       from public.brain_ingestion_jobs
      where status in ('queued', 'processing')`
  );

  const activeMedia = new Set(
    active.rows.map((row) => row.media_record_id).filter((id): id is string => Boolean(id))
  );
  const activeUrls = new Set(
    active.rows.map((row) => row.normalized_url).filter((url): url is string => Boolean(url))
  );

  const inSelection = (job: BrainQueueJobSnapshot) => !selected || options.jobIds!.has(job.id);

  const classified = jobs.filter((job) => {
    if (runId && job.run_id !== runId) return false;
    if (job.status !== 'failed') return false;
    if (!inSelection(job)) return false;
    return classifyFailedJobRetry(job).retryable;
  });

  const candidates = classified.filter((job) => {
    if (job.media_record_id && activeMedia.has(job.media_record_id)) return false;
    if (job.normalized_url && activeUrls.has(job.normalized_url)) return false;
    return true;
  }) as RetryCandidate[];

  const accepted = new Set(candidates.map((job) => job.id));
  const rejected = selected
    ? requestedIds
        .filter((id) => !accepted.has(id))
        .map((id) => {
          const job = jobs.find((entry) => entry.id === id);
          if (!job) {
            return { jobId: id, reason: 'Job is not part of the loaded queue snapshot.' };
          }
          if (job.status !== 'failed') {
            return {
              jobId: id,
              reason: `Only failed jobs can be retried; status is ${job.status}.`,
            };
          }
          const decision = classifyFailedJobRetry(job);
          if (!decision.retryable) {
            return { jobId: id, reason: decision.reason };
          }
          return {
            jobId: id,
            reason: 'An active queued/processing job exists for the same media record or URL.',
          };
        })
    : [];

  if (candidates.length === 0) {
    return {
      classified: classified.length,
      blockedByActive: classified.length,
      requested: selected ? requestedIds.length : 0,
      reset: 0,
      rows: [],
      rejected,
      reason: 'No safe failed job to retry.',
    };
  }

  const resetRows: Array<{ id: string; run_id: string; media_record_id: string | null }> = [];

  await client.query('BEGIN');

  try {
    for (const job of candidates) {
      const { rows } = await client.query<{
        id: string;
        run_id: string;
        media_record_id: string | null;
      }>(
        `update public.brain_ingestion_jobs
            set status = 'queued',
                attempts = 0,
                retry_after = null,
                error_code = null,
                error_detail = null,
                extraction_status = null,
                extraction_metadata = '{"stage":"queued","requeued":true}'::jsonb,
                worker_id = null,
                locked_at = null,
                processed_at = null,
                updated_at = now()
          where id = $1::uuid
            and status = 'failed'
            and not exists (
              select 1
                from public.brain_ingestion_jobs active
               where active.id <> brain_ingestion_jobs.id
                 and active.status in ('queued', 'processing')
                 and (
                   (brain_ingestion_jobs.media_record_id is not null
                     and active.media_record_id = brain_ingestion_jobs.media_record_id)
                   or (brain_ingestion_jobs.normalized_url is not null
                     and active.normalized_url = brain_ingestion_jobs.normalized_url)
                 )
            )
          returning id, run_id, media_record_id`,
        [job.id]
      );

      if (rows[0]) resetRows.push(rows[0]);
    }

    const runIds = Array.from(new Set(resetRows.map((row) => row.run_id)));

    if (runIds.length > 0) {
      await client.query(
        `update public.brain_ingestion_runs
            set status = 'running', completed_at = null, updated_at = now()
          where id = any($1::uuid[])`,
        [runIds]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  return {
    classified: classified.length,
    blockedByActive: classified.length - candidates.length,
    requested: selected ? requestedIds.length : candidates.length,
    reset: resetRows.length,
    rows: resetRows,
    rejected,
    reason: null,
  };
}

async function processQueue(input: {
  runId: string | null;
  maxJobs: number;
  maxRounds: number;
  withGraph?: boolean;
  embeddingClient?: EmbeddingClient | null;
}) {
  const store = createBrainStore();

  if (!store) throw new Error('brain_database_unavailable');

  const embeddingClient =
    input.embeddingClient ||
    createOpenRouterEmbeddingClientFromEnv(process.env, undefined, { surface: 'brain' });
  const queueGraph = input.withGraph
    ? undefined
    : async () => ({ status: 'skipped' as const, reason: 'graph_not_requested' });
  const rounds: Array<{
    processed: number;
    failed: number;
    status: string;
    stoppedBy: string;
    errors: string[];
  }> = [];

  for (let round = 0; round < input.maxRounds; round += 1) {
    const result = await runBrainWorker({
      trigger: 'admin',
      store,
      embeddingClient,
      maxJobs: input.maxJobs,
      maxDurationMs: 240_000,
      runIds: input.runId ? [input.runId] : undefined,
      skipGuard: true,
      queueGraph,
    });

    rounds.push({
      processed: result.processed,
      failed: result.failed,
      status: result.status,
      stoppedBy: result.stoppedBy,
      errors: result.errors,
    });

    if (result.processed === 0) break;
    if (
      result.stoppedBy === 'disabled' ||
      result.stoppedBy === 'lock_conflict' ||
      result.stoppedBy === 'budget_exhausted' ||
      result.stoppedBy === 'error'
    ) {
      break;
    }
    if (result.stoppedBy === 'drained' || result.processed < input.maxJobs) break;
  }

  return {
    rounds,
    processed: rounds.reduce((sum, round) => sum + round.processed, 0),
    failed: rounds.reduce((sum, round) => sum + round.failed, 0),
  };
}

async function loadRetrievalProbes(client: Client, runId: string | null) {
  const earliest = await client.query<RetrievalProbeRow>(
    `select d.id as document_id,
            d.media_record_id,
            d.title,
            m.outlet,
            m.published_date::text as published_date,
            left(c.content, 700) as probe_text
       from public.knowledge_documents d
       join public.media_archive_records m on m.id = d.media_record_id
       join lateral (
         select content
           from public.knowledge_chunks c
          where c.document_id = d.id
          order by c.chunk_index
          limit 1
       ) c on true
      where d.ingestion_status = 'completed'
        and coalesce(d.chunk_count, 0) > 0
        and d.media_record_id is not null
        and m.published_date is not null
      order by m.published_date asc
      limit 1`
  );

  const newest = runId
    ? await client.query<RetrievalProbeRow>(
        `select d.id as document_id,
                d.media_record_id,
                d.title,
                m.outlet,
                m.published_date::text as published_date,
                left(c.content, 700) as probe_text
           from public.knowledge_documents d
           join public.media_archive_records m on m.id = d.media_record_id
           join lateral (
             select content
               from public.knowledge_chunks c
              where c.document_id = d.id
              order by c.chunk_index
              limit 1
           ) c on true
          where d.ingestion_status = 'completed'
            and coalesce(d.chunk_count, 0) > 0
            and m.published_date is not null
            and d.media_record_id in (
              select media_record_id
                from public.brain_ingestion_jobs
               where run_id = $1::uuid
                 and media_record_id is not null
            )
          order by m.published_date desc nulls last
          limit 1`,
        [runId]
      )
    : await client.query<RetrievalProbeRow>(
        `select d.id as document_id,
                d.media_record_id,
                d.title,
                m.outlet,
                m.published_date::text as published_date,
                left(c.content, 700) as probe_text
           from public.knowledge_documents d
           join public.media_archive_records m on m.id = d.media_record_id
           join lateral (
             select content
               from public.knowledge_chunks c
              where c.document_id = d.id
              order by c.chunk_index
              limit 1
           ) c on true
          where d.ingestion_status = 'completed'
            and coalesce(d.chunk_count, 0) > 0
            and d.media_record_id is not null
            and m.published_date is not null
          order by m.published_date desc nulls last
          limit 1`
      );

  const byDocument = new Map<string, RetrievalProbeRow>();
  for (const row of [...earliest.rows, ...newest.rows]) byDocument.set(row.document_id, row);
  return Array.from(byDocument.values());
}

async function verifyRetrieval(client: Client, runId: string | null) {
  const probes = await loadRetrievalProbes(client, runId);

  if (probes.length === 0) {
    return {
      executed: false,
      reason: 'No indexed media document available for a probe.',
      probes: [],
    };
  }

  let embeddingClient: EmbeddingClient;

  try {
    embeddingClient = createOpenRouterEmbeddingClientFromEnv(process.env, undefined, {
      surface: 'media',
    });
  } catch {
    return {
      executed: false,
      reason: 'Embedding provider is not configured; retrieval verification was not run.',
      probes: probes.map((probe) => ({
        mediaRecordId: probe.media_record_id,
        documentId: probe.document_id,
        publishedDate: probe.published_date,
        outcome: 'skipped',
      })),
    };
  }

  const results = [];

  for (const probe of probes) {
    const query = (probe.probe_text || probe.title || '').replace(/\s+/g, ' ').trim().slice(0, 600);

    try {
      const search = await searchMediaIntelligence({
        query: query || probe.title,
        limit: 20,
        answerMode: 'none',
        embeddingClient,
        filters: {
          from: null,
          to: null,
          topic: null,
          language: null,
          outlet: null,
          status: null,
          kind: null,
          role: null,
          page: 1,
          pageSize: 20,
        },
      });
      const matched = search.results.some((hit) => hit.mediaRecordId === probe.media_record_id);

      results.push({
        mediaRecordId: probe.media_record_id,
        documentId: probe.document_id,
        title: probe.title,
        outlet: probe.outlet,
        publishedDate: probe.published_date,
        outcome: matched ? 'matched' : 'not_in_top_results',
        returned: search.results.length,
        top: search.results.slice(0, 5).map((hit) => ({
          mediaRecordId: hit.mediaRecordId,
          title: hit.title,
          publishedDate: hit.publishedDate,
          similarity: hit.similarity,
        })),
      });
    } catch (error) {
      results.push({
        mediaRecordId: probe.media_record_id,
        documentId: probe.document_id,
        publishedDate: probe.published_date,
        outcome: 'error',
        error: error instanceof Error ? error.message.slice(0, 200) : 'media_search_failed',
      });
    }
  }

  return { executed: true, reason: null, probes: results };
}

async function main() {
  const runId = argValue('--run') || process.env.BRAIN_INGESTION_RUN_ID || null;
  const reportPath = argValue('--report');
  const retryJobIds = argValues('--retry-job');
  const retrySelectedJobs = retryJobIds.length > 0;
  const shouldRetry = hasFlag('--retry-safe-failed') || retrySelectedJobs;
  const shouldProcess = hasFlag('--process');
  const shouldVerify = hasFlag('--verify-retrieval');
  const shouldTriage = hasFlag('--triage') || retrySelectedJobs;
  const withGraph = hasFlag('--with-graph');
  const maxJobs = intArg('--max-jobs', 10, 1, 20);
  const maxRounds = intArg('--max-rounds', 20, 1, 100);
  const price = optionalPrice();

  const client = await createDbClient();

  try {
    const run = runId ? await loadRun(client, runId) : null;
    const queueJobs = await loadJobs(client, null);
    const runJobs = runId ? await loadJobs(client, runId) : null;
    const queueCost = await loadCost(client, null);
    const runCost = runId ? await loadCost(client, runId) : null;

    const queue = summarizeBrainQueue(queueJobs, {
      ...queueCost,
      inputUsdPerMillion: price,
    });
    const runSummary = runJobs
      ? summarizeBrainQueue(runJobs, {
          ...(runCost || { documents: 0, sourceChars: 0, chunks: 0 }),
          inputUsdPerMillion: price,
        })
      : null;

    let triage: TriageReport | null = null;
    let triageAfter: TriageReport | null = null;
    let retry = null;
    let processing = null;
    let retrieval = null;

    if (shouldTriage) {
      triage = buildTriageReport(await loadTriageInputs(client, runId), { runId });
    }

    if (shouldRetry && runId) {
      retry =
        run && (run.status === 'paused' || run.status === 'cancelled')
          ? {
              classified: 0,
              blockedByActive: 0,
              requested: 0,
              reset: 0,
              rows: [],
              rejected: [],
              reason: `Run is ${run.status}; resume it explicitly before retrying.`,
            }
          : await retrySafeFailedJobs(
              client,
              runId,
              runJobs || [],
              retrySelectedJobs ? { jobIds: new Set(retryJobIds) } : {}
            );
    }

    if (shouldProcess) {
      processing = await processQueue({ runId, maxJobs, maxRounds, withGraph });
    }

    if (shouldVerify) {
      retrieval = await verifyRetrieval(client, runId);
    }

    if (shouldTriage && (shouldRetry || shouldProcess)) {
      triageAfter = buildTriageReport(await loadTriageInputs(client, runId), { runId });
    }

    const finalQueueJobs = shouldRetry || shouldProcess ? await loadJobs(client, null) : queueJobs;
    const finalRunJobs = runId ? await loadJobs(client, runId) : null;
    const finalQueueCost = shouldRetry || shouldProcess ? await loadCost(client, null) : queueCost;
    const finalRunCost =
      runId && (shouldRetry || shouldProcess) ? await loadCost(client, runId) : runCost;
    const finalRun = runId ? await loadRun(client, runId) : null;

    const finalQueue = summarizeBrainQueue(finalQueueJobs, {
      ...finalQueueCost,
      inputUsdPerMillion: price,
    });
    const finalRunSummary = finalRunJobs
      ? summarizeBrainQueue(finalRunJobs, {
          ...(finalRunCost || { documents: 0, sourceChars: 0, chunks: 0 }),
          inputUsdPerMillion: price,
        })
      : null;

    const warnings: string[] = [];

    if (finalQueue.unresolved > 0) {
      warnings.push(
        `Queue still has ${finalQueue.unresolved} queued/processing job(s); run the process step again to drain them.`
      );
    }
    if (finalQueue.duplicateMediaJobs.length > 0) {
      warnings.push(
        `Found ${finalQueue.duplicateMediaJobs.length} media_record_id/source_type group(s) with more than one job. No row was deleted.`
      );
    }
    if (finalQueue.final + finalQueue.unresolved !== finalQueue.total) {
      warnings.push(
        'Some jobs have a status outside the known final/active set; inspect them manually.'
      );
    }
    if (finalQueue.cost.estimatedCostUsd === null) {
      warnings.push(
        'USD cost is unknown because no verified embedding price is configured; token and character volume are reported instead.'
      );
    }
    if (retry && retry.reset === 0) {
      warnings.push(
        'No failed job met the safe-retry criteria; failed/partial rows remain for manual review.'
      );
    }
    if (shouldRetry && !runId) {
      warnings.push('Retry requires --run <run-id>; no failed row was requeued.');
    }
    if (retrieval && retrieval.executed === false) {
      warnings.push(retrieval.reason || 'Retrieval verification was skipped.');
    }
    if (finalRun && (finalRun.status === 'paused' || finalRun.status === 'cancelled')) {
      warnings.push(`Target run is ${finalRun.status}; it was not resumed automatically.`);
    }
    if (
      retry &&
      'rejected' in retry &&
      Array.isArray(retry.rejected) &&
      retry.rejected.length > 0
    ) {
      warnings.push(
        `${retry.rejected.length} explicitly selected job(s) were rejected by the transient-retry safety rules; see retry.rejected.`
      );
    }
    if (triage) {
      warnings.push(...triage.warnings.map((warning) => `Triage: ${warning}`));
    }
    if (shouldTriage && !runId) {
      warnings.push('Triage was run across the whole queue because no --run was provided.');
    }
    if (retrySelectedJobs && hasFlag('--retry-safe-failed')) {
      warnings.push(
        'Both --retry-job and --retry-safe-failed were passed; the explicit --retry-job selection takes precedence.'
      );
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: {
        retrySafeFailed: shouldRetry,
        retrySelectedJobs,
        triage: shouldTriage,
        process: shouldProcess,
        verifyRetrieval: shouldVerify,
        withGraph,
        readOnly: !shouldRetry && !shouldProcess,
      },
      targetRunId: runId,
      targetRun: finalRun
        ? {
            id: finalRun.id,
            status: finalRun.status,
            createdAt: finalRun.created_at,
            updatedAt: finalRun.updated_at,
            completedAt: finalRun.completed_at,
            metadata: finalRun.metadata,
            summary: finalRunSummary,
          }
        : null,
      queue: finalQueue,
      before: {
        queue,
        run: runSummary,
      },
      triage,
      triageAfter,
      retry,
      processing,
      retrieval,
      warnings,
    };

    if (reportPath) {
      const outputPath = path.resolve(reportPath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    '[brain-ingestion-recovery] failed:',
    error instanceof Error ? error.message : 'unknown_error'
  );
  process.exitCode = 1;
});

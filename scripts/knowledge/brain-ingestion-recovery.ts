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
 *     --run 87443bd7-8af8-4bd7-86fb-5d19baf81e34 \
 *     --retry-safe-failed --process --max-jobs 10
 *
 * `--process` calls the same bounded `runBrainWorker()` used by the admin and
 * cron endpoints. It only claims rows that already exist. `--retry-safe-failed`
 * requeues the same failed row in place and only for known transient errors.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Client } from 'pg';

import { createBrainStore } from '@/lib/knowledge/brain/store';
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

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
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
 * Requeue only already-failed rows whose error is known transient. The update
 * is an in-place status reset: no new job row is inserted and partial/duplicate
 * jobs are left untouched. Active rows for the same media record or URL block a
 * retry so the partial unique index can never be violated.
 */
async function retrySafeFailedJobs(
  client: Client,
  runId: string | null,
  jobs: BrainQueueJobSnapshot[]
) {
  const active = await client.query<{
    media_record_id: string | null;
    normalized_url: string | null;
  }>(
    `select media_record_id, normalized_url
       from public.brain_ingestion_jobs
      where status in ('queued', 'processing')`
  );

  const activeMedia = new Set(
    active.rows.map((row) => row.media_record_id).filter((id): id is string => Boolean(id))
  );
  const activeUrls = new Set(
    active.rows.map((row) => row.normalized_url).filter((url): url is string => Boolean(url))
  );

  const classified = jobs.filter((job) => {
    if (runId && job.run_id !== runId) return false;
    if (job.status !== 'failed') return false;
    return classifyFailedJobRetry(job).retryable;
  });

  const candidates = classified.filter((job) => {
    if (job.media_record_id && activeMedia.has(job.media_record_id)) return false;
    if (job.normalized_url && activeUrls.has(job.normalized_url)) return false;
    return true;
  }) as RetryCandidate[];

  if (candidates.length === 0) {
    return {
      classified: classified.length,
      blockedByActive: classified.length,
      requested: 0,
      reset: 0,
      rows: [],
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
    requested: candidates.length,
    reset: resetRows.length,
    rows: resetRows,
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
  const shouldRetry = hasFlag('--retry-safe-failed');
  const shouldProcess = hasFlag('--process');
  const shouldVerify = hasFlag('--verify-retrieval');
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

    let retry = null;
    let processing = null;
    let retrieval = null;

    if (shouldRetry && runId) {
      retry =
        run && (run.status === 'paused' || run.status === 'cancelled')
          ? {
              classified: 0,
              blockedByActive: 0,
              requested: 0,
              reset: 0,
              rows: [],
              reason: `Run is ${run.status}; resume it explicitly before retrying.`,
            }
          : await retrySafeFailedJobs(client, runId, runJobs || []);
    }

    if (shouldProcess) {
      processing = await processQueue({ runId, maxJobs, maxRounds, withGraph });
    }

    if (shouldVerify) {
      retrieval = await verifyRetrieval(client, runId);
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

    const report = {
      generatedAt: new Date().toISOString(),
      mode: {
        retrySafeFailed: shouldRetry,
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

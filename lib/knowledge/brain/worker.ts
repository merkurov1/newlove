import { randomUUID } from 'node:crypto';

import {
  createOpenRouterEmbeddingClientFromEnv,
  type EmbeddingClient,
} from '@/lib/knowledge/rag/embeddings';
import { getGraphModel, isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { processNextGraphJob } from '@/lib/knowledge/graph/pipeline';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';

import { queueGraphForIngestionRun } from './graphQueue';
import { processNextBrainJob } from './process';
import { createBrainStore, type BrainStore } from './store';
import {
  createWorkerTelemetry,
  type WorkerRunRecord,
  type WorkerScope,
  type WorkerTelemetry,
  type WorkerTrigger,
} from './workerTelemetry';

export type WorkerResult = {
  scope: WorkerScope;
  workerId: string;
  trigger: WorkerTrigger;
  status: WorkerRunRecord['status'];
  processed: number;
  claimed: number;
  failed: number;
  runsTouched: number;
  graphRunsQueued: number;
  startedAt: string;
  finishedAt: string;
  stoppedBy: 'drained' | 'max_jobs' | 'time_budget' | 'error';
  errors: string[];
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function remainingMs(startedAt: number, budgetMs: number): number {
  return budgetMs - (Date.now() - startedAt);
}

export async function runBrainWorker(input: {
  trigger?: WorkerTrigger;
  maxJobs?: number;
  maxDurationMs?: number;
  store?: BrainStore | null;
  embeddingClient?: EmbeddingClient | null;
  processNext?: typeof processNextBrainJob;
  queueGraph?: typeof queueGraphForIngestionRun;
  telemetry?: WorkerTelemetry | null;
} = {}): Promise<WorkerResult> {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const workerId = `brain-worker-${randomUUID()}`;
  const trigger = input.trigger || 'admin';
  const maxJobs = clamp(
    input.maxJobs,
    1,
    20,
    Number(process.env.BRAIN_WORKER_MAX_JOBS) || 5
  );
  const budgetMs = clamp(
    input.maxDurationMs,
    30_000,
    270_000,
    Number(process.env.BRAIN_WORKER_MAX_DURATION_MS) || 240_000
  );
  const telemetry = input.telemetry === undefined ? createWorkerTelemetry() : input.telemetry;
  const telemetryId = telemetry
    ? await telemetry.startWorkerRun({
        scope: 'brain',
        trigger,
        workerId,
        metadata: { maxJobs, budgetMs },
      })
    : null;

  let processed = 0;
  let claimed = 0;
  let failed = 0;
  let runsTouched = 0;
  let graphRunsQueued = 0;
  const errors: string[] = [];
  let stoppedBy: WorkerResult['stoppedBy'] = 'drained';

  try {
    const store = input.store === undefined ? createBrainStore() : input.store;

    if (!store) throw new Error('brain_database_unavailable');

    let embeddingClient = input.embeddingClient;

    if (!embeddingClient) {
      try {
        embeddingClient = createOpenRouterEmbeddingClientFromEnv(process.env);
      } catch {
        throw new Error('embedding_not_configured');
      }
    }

    const processNext = input.processNext || processNextBrainJob;
    const queueGraph = input.queueGraph || queueGraphForIngestionRun;

    await store.recoverStaleJobs(
      Number(process.env.BRAIN_WORKER_LEASE_SECONDS) || 900
    );

    const runs = await store.listRunningRuns(100);

    outer: for (const run of runs) {
      if (processed >= maxJobs) {
        stoppedBy = 'max_jobs';
        break;
      }

      if (remainingMs(startedAt, budgetMs) < 10_000) {
        stoppedBy = 'time_budget';
        break;
      }

      runsTouched += 1;

      while (processed < maxJobs) {
        if (remainingMs(startedAt, budgetMs) < 10_000) {
          stoppedBy = 'time_budget';
          break outer;
        }

        const result = await processNext({
          runId: run.id,
          store,
          embeddingClient,
          workerId,
        });

        if (result.state === 'processed') {
          processed += 1;
          claimed += 1;

          if (result.job.status === 'failed' || result.job.status === 'partial') {
            failed += 1;
            if (result.job.error_detail) {
              errors.push(`${result.job.error_code || 'job_error'}: ${result.job.error_detail}`);
            }
          }
          continue;
        }

        if (result.state === 'done') {
          const graph = await queueGraph({
            store,
            runId: run.id,
            enabled: (process.env.BRAIN_AUTO_GRAPH || 'true').toLowerCase() !== 'false',
          });

          if (graph?.status === 'queued' || graph?.status === 'existing') {
            graphRunsQueued += 1;
          }

          break;
        }

        if (result.state === 'waiting' || result.state === 'paused') {
          break;
        }
      }
    }

    if (processed >= maxJobs) stoppedBy = 'max_jobs';
  } catch (error) {
    stoppedBy = 'error';
    const code = error instanceof Error ? error.message : 'brain_worker_failed';
    errors.push(code);

    if (telemetry) {
      await telemetry.finishWorkerRun(telemetryId, {
        status: 'failed',
        processed,
        claimed,
        failed,
        runs_touched: runsTouched,
        error_code: code.slice(0, 120),
        error_detail: code.slice(0, 1000),
      });
    }

    throw error;
  }

  const status: WorkerRunRecord['status'] =
    processed === 0 && runsTouched === 0
      ? 'skipped'
      : failed > 0
        ? 'completed_with_errors'
        : 'completed';
  const finishedIso = new Date().toISOString();

  if (telemetry) {
    await telemetry.finishWorkerRun(telemetryId, {
      status,
      processed,
      claimed,
      failed,
      runs_touched: runsTouched,
      error_code: errors.length > 0 ? 'worker_errors' : null,
      error_detail: errors.length > 0 ? errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
      metadata: { stoppedBy, graphRunsQueued },
    });
  }

  return {
    scope: 'brain',
    workerId,
    trigger,
    status,
    processed,
    claimed,
    failed,
    runsTouched,
    graphRunsQueued,
    startedAt: startedIso,
    finishedAt: finishedIso,
    stoppedBy,
    errors: errors.slice(0, 10),
  };
}

export async function runGraphWorker(input: {
  trigger?: WorkerTrigger;
  maxJobs?: number;
  maxDurationMs?: number;
  store?: ReturnType<typeof createBrainGraphStore>;
  processNext?: typeof processNextGraphJob;
  graphConfigured?: boolean;
  telemetry?: WorkerTelemetry | null;
} = {}): Promise<WorkerResult> {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const workerId = `graph-worker-${randomUUID()}`;
  const trigger = input.trigger || 'admin';
  const maxJobs = clamp(
    input.maxJobs,
    1,
    10,
    Number(process.env.BRAIN_GRAPH_WORKER_MAX_JOBS) || 5
  );
  const budgetMs = clamp(
    input.maxDurationMs,
    30_000,
    270_000,
    Number(process.env.BRAIN_GRAPH_WORKER_MAX_DURATION_MS) || 240_000
  );
  const telemetry = input.telemetry === undefined ? createWorkerTelemetry() : input.telemetry;
  const telemetryId = telemetry
    ? await telemetry.startWorkerRun({
        scope: 'graph',
        trigger,
        workerId,
        metadata: { maxJobs, budgetMs },
      })
    : null;

  let processed = 0;
  let claimed = 0;
  let failed = 0;
  let runsTouched = 0;
  const errors: string[] = [];
  let stoppedBy: WorkerResult['stoppedBy'] = 'drained';

  try {
    if (!(input.graphConfigured ?? isGraphLlmConfigured())) {
      throw new Error('graph_llm_not_configured');
    }

    const store = input.store === undefined ? createBrainGraphStore() : input.store;

    if (!store) throw new Error('brain_graph_database_unavailable');

    const processNext = input.processNext || processNextGraphJob;

    await store.recoverStaleJobs(
      Number(process.env.BRAIN_GRAPH_WORKER_LEASE_SECONDS) || 900
    );

    const runs = await store.listRunningRuns(100);

    outer: for (const run of runs) {
      if (processed >= maxJobs) {
        stoppedBy = 'max_jobs';
        break;
      }

      if (remainingMs(startedAt, budgetMs) < 10_000) {
        stoppedBy = 'time_budget';
        break;
      }

      runsTouched += 1;

      while (processed < maxJobs) {
        if (remainingMs(startedAt, budgetMs) < 10_000) {
          stoppedBy = 'time_budget';
          break outer;
        }

        const result = await processNext({
          runId: run.id,
          store,
          workerId,
          model: getGraphModel(),
        });

        if (result.state === 'processed') {
          processed += 1;
          claimed += 1;

          if (result.job.status === 'failed') {
            failed += 1;
            if (result.job.error_detail) {
              errors.push(`${result.job.error_code || 'graph_error'}: ${result.job.error_detail}`);
            }
          }
          continue;
        }

        if (result.state === 'done' || result.state === 'waiting' || result.state === 'paused') {
          break;
        }
      }
    }

    if (processed >= maxJobs) stoppedBy = 'max_jobs';
  } catch (error) {
    stoppedBy = 'error';
    const code = error instanceof Error ? error.message : 'graph_worker_failed';
    errors.push(code);

    if (telemetry) {
      await telemetry.finishWorkerRun(telemetryId, {
        status: 'failed',
        processed,
        claimed,
        failed,
        runs_touched: runsTouched,
        error_code: code.slice(0, 120),
        error_detail: code.slice(0, 1000),
      });
    }

    throw error;
  }

  const status: WorkerRunRecord['status'] =
    processed === 0 && runsTouched === 0
      ? 'skipped'
      : failed > 0
        ? 'completed_with_errors'
        : 'completed';
  const finishedIso = new Date().toISOString();

  if (telemetry) {
    await telemetry.finishWorkerRun(telemetryId, {
      status,
      processed,
      claimed,
      failed,
      runs_touched: runsTouched,
      error_code: errors.length > 0 ? 'worker_errors' : null,
      error_detail: errors.length > 0 ? errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
      metadata: { stoppedBy },
    });
  }

  return {
    scope: 'graph',
    workerId,
    trigger,
    status,
    processed,
    claimed,
    failed,
    runsTouched,
    graphRunsQueued: 0,
    startedAt: startedIso,
    finishedAt: finishedIso,
    stoppedBy,
    errors: errors.slice(0, 10),
  };
}

import { randomUUID } from 'node:crypto';

import {
  createOpenRouterEmbeddingClientFromEnv,
  type EmbeddingClient,
} from '@/lib/knowledge/rag/embeddings';
import { getGraphModel, isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { processNextGraphJob } from '@/lib/knowledge/graph/pipeline';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { beginWorkerInvocation } from '@/lib/operations/guard';
import { workerLimits } from '@/lib/operations/config';
import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';

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

export type WorkerStoppedBy =
  | 'drained'
  | 'max_jobs'
  | 'time_budget'
  | 'error'
  | 'disabled'
  | 'lock_conflict'
  | 'budget_exhausted';

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
  stoppedBy: WorkerStoppedBy;
  errors: string[];
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function skippedWorkerResult(input: {
  scope: WorkerScope;
  workerId: string;
  trigger: WorkerTrigger;
  startedAt: string;
  stoppedBy: WorkerStoppedBy;
  error: string;
}): WorkerResult {
  return {
    scope: input.scope,
    workerId: input.workerId,
    trigger: input.trigger,
    status: 'skipped',
    processed: 0,
    claimed: 0,
    failed: 0,
    runsTouched: 0,
    graphRunsQueued: 0,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    stoppedBy: input.stoppedBy,
    errors: [input.error],
  };
}

function guardStoppedBy(reason: string): WorkerStoppedBy {
  if (reason === 'budget_exhausted') return 'budget_exhausted';
  if (reason === 'lock_conflict' || reason === 'lock_unavailable') return 'lock_conflict';
  return 'disabled';
}

export async function runBrainWorker(
  input: {
    trigger?: WorkerTrigger;
    maxJobs?: number;
    maxDurationMs?: number;
    store?: BrainStore | null;
    embeddingClient?: EmbeddingClient | null;
    processNext?: typeof processNextBrainJob;
    queueGraph?: typeof queueGraphForIngestionRun;
    telemetry?: WorkerTelemetry | null;
    skipGuard?: boolean;
  } = {}
): Promise<WorkerResult> {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const workerId = `brain-worker-${randomUUID()}`;
  const trigger = input.trigger || 'admin';
  const limits = workerLimits('brain');
  const maxJobs = clamp(input.maxJobs, 1, 20, limits.maxJobs);
  const budgetMs = clamp(input.maxDurationMs, 30_000, 270_000, limits.maxDurationMs);
  const skipGuard = input.skipGuard ?? input.store !== undefined;
  const guard = await beginWorkerInvocation({
    scope: 'brain',
    trigger,
    workerId,
    maxDurationMs: budgetMs,
    skipGuard,
  });

  if (!guard.ok) {
    return skippedWorkerResult({
      scope: 'brain',
      workerId,
      trigger,
      startedAt: startedIso,
      stoppedBy: guardStoppedBy(guard.reason),
      error: guard.message,
    });
  }

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
  let embeddingCalls = 0;
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

    if (!input.embeddingClient) {
      await assertCircuitClosed('embedding');
    }

    const budgetedEmbeddingClient: EmbeddingClient = {
      ...embeddingClient,
      embed: async (texts, signal) => {
        embeddingCalls += texts.length;

        if (embeddingCalls > limits.maxEmbeddings) {
          throw new Error('embedding_budget_exhausted');
        }

        return embeddingClient.embed(texts, signal);
      },
    };

    await store.recoverStaleJobs(Number(process.env.BRAIN_WORKER_LEASE_SECONDS) || 900);

    const runs =
      typeof store.listRecoverableRuns === 'function'
        ? await store.listRecoverableRuns(100)
        : await store.listRunningRuns(100);

    outer: for (const run of runs) {
      if (processed >= maxJobs) {
        stoppedBy = 'max_jobs';
        break;
      }

      if (guard.remainingMs() < 10_000) {
        stoppedBy = 'time_budget';
        break;
      }

      runsTouched += 1;

      if (run.status !== 'running') {
        await store.updateRun(run.id, { status: 'running', completed_at: null });
      }

      while (processed < maxJobs) {
        if (guard.remainingMs() < 10_000) {
          stoppedBy = 'time_budget';
          break outer;
        }

        const result = await processNext({
          runId: run.id,
          store,
          embeddingClient: budgetedEmbeddingClient,
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

            if (result.job.error_code?.startsWith('embedding_')) {
              await recordCircuitFailure({
                dependency: 'embedding',
                errorCode: result.job.error_code,
                permanent: ['embedding_auth_failed', 'embedding_payment_required'].includes(
                  result.job.error_code
                ),
              });
            }
          } else if (result.job.status === 'completed') {
            await recordCircuitSuccess('embedding');
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

    await guard.finish({
      status: 'failed',
      processed,
      failed,
      stoppedBy: 'error',
      errorCode: code,
    });

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
      metadata: {
        stoppedBy,
        graphRunsQueued,
        embeddingCalls,
        externalHttpCalls: processed,
      },
    });
  }

  await guard.finish({
    status,
    processed,
    failed,
    stoppedBy,
    errorCode: errors.length > 0 ? 'worker_errors' : null,
  });

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

export async function runGraphWorker(
  input: {
    trigger?: WorkerTrigger;
    maxJobs?: number;
    maxDurationMs?: number;
    store?: ReturnType<typeof createBrainGraphStore>;
    processNext?: typeof processNextGraphJob;
    graphConfigured?: boolean;
    telemetry?: WorkerTelemetry | null;
    skipGuard?: boolean;
  } = {}
): Promise<WorkerResult> {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();
  const workerId = `graph-worker-${randomUUID()}`;
  const trigger = input.trigger || 'admin';
  const limits = workerLimits('graph');
  const maxJobs = clamp(input.maxJobs, 1, 10, limits.maxJobs);
  const budgetMs = clamp(input.maxDurationMs, 30_000, 270_000, limits.maxDurationMs);
  const skipGuard = input.skipGuard ?? input.store !== undefined;
  const guard = await beginWorkerInvocation({
    scope: 'graph',
    trigger,
    workerId,
    maxDurationMs: budgetMs,
    skipGuard,
  });

  if (!guard.ok) {
    return skippedWorkerResult({
      scope: 'graph',
      workerId,
      trigger,
      startedAt: startedIso,
      stoppedBy: guardStoppedBy(guard.reason),
      error: guard.message,
    });
  }

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

    await store.recoverStaleJobs(Number(process.env.BRAIN_GRAPH_WORKER_LEASE_SECONDS) || 900);

    const runs =
      typeof store.listRecoverableRuns === 'function'
        ? await store.listRecoverableRuns(100)
        : await store.listRunningRuns(100);

    outer: for (const run of runs) {
      if (processed >= maxJobs) {
        stoppedBy = 'max_jobs';
        break;
      }

      if (guard.remainingMs() < 10_000) {
        stoppedBy = 'time_budget';
        break;
      }

      runsTouched += 1;

      if (run.status !== 'running') {
        await store.updateRun(run.id, { status: 'running', completed_at: null });
      }

      while (processed < maxJobs) {
        if (guard.remainingMs() < 10_000) {
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

    await guard.finish({
      status: 'failed',
      processed,
      failed,
      stoppedBy: 'error',
      errorCode: code,
    });

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
      metadata: {
        stoppedBy,
        llmCalls: processed,
        externalHttpCalls: processed,
      },
    });
  }

  await guard.finish({
    status,
    processed,
    failed,
    stoppedBy,
    errorCode: errors.length > 0 ? 'worker_errors' : null,
  });

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

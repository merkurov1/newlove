import { isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { runMediaAnalysis, type RunMediaAnalysisResult } from '@/lib/knowledge/media/analyze';
import {
  createMediaAnalysisStore,
  type MediaAnalysisEligibleInput,
  type MediaAnalysisRun,
  type MediaAnalysisStore,
} from '@/lib/knowledge/media/analysisStore';
import { MEDIA_ANALYZER_VERSION } from '@/lib/knowledge/media/intelligence';

export type MediaAnalysisEnqueueMode = 'all' | 'selected' | 'retry_failed';

export type MediaAnalysisEnqueueResult = {
  mode: MediaAnalysisEnqueueMode;
  eligible: number;
  queued: number;
  alreadyQueued: number;
  upToDate: number;
  notEligible: number;
  queuedRecordIds: string[];
  alreadyQueuedRecordIds: string[];
};

export type MediaAnalysisBatchResult = {
  workerId: string;
  claimed: number;
  processed: number;
  failed: number;
  retried: number;
  skipped: number;
  results: Array<
    | ({ mediaRecordId: string; runId: string; status: 'completed' } & RunMediaAnalysisResult)
    | { mediaRecordId: string; runId: string; status: 'failed'; error: string }
    | { mediaRecordId: string; runId: string; status: 'skipped'; reason: string }
  >;
};

function isPermanentError(code: string): boolean {
  return new Set([
    'media_analysis_not_configured',
    'media_analysis_no_chunks',
    'media_analysis_no_text',
    'media_analysis_record_not_found',
    'media_analysis_run_not_claimed',
    'media_analysis_document_conflict',
    'media_analysis_input_invalid',
  ]).has(code);
}

function isRetryableError(code: string): boolean {
  if (isPermanentError(code)) return false;

  return (
    code.startsWith('deepseek_') ||
    code.startsWith('media_analysis_llm') ||
    code.includes('timeout') ||
    code.includes('rate_limit') ||
    code === 'media_analysis_failed'
  );
}

function sameAnalysisVersion(latest: MediaAnalysisRun | undefined, hash: string | null): boolean {
  return Boolean(
    latest &&
      latest.status === 'completed' &&
      latest.analyzer_version === MEDIA_ANALYZER_VERSION &&
      (latest.content_hash || null) === (hash || null)
  );
}

/**
 * Enqueues analysis work into media_analysis_runs. It never calls the model.
 * A record is skipped when the latest completed run has the same content hash
 * and analyzer version, unless an explicit force refresh was requested.
 */
export async function enqueueMediaAnalyses(input: {
  mode: MediaAnalysisEnqueueMode;
  recordIds?: string[];
  force?: boolean;
  limit?: number;
  requestedBy?: string | null;
  store?: MediaAnalysisStore | null;
}): Promise<MediaAnalysisEnqueueResult> {
  const store = input.store === undefined ? createMediaAnalysisStore() : input.store;

  if (!store) throw new Error('media_analysis_database_unavailable');

  const limit = Math.min(Math.max(input.limit || 100, 1), 2000);
  let candidates: MediaAnalysisEligibleInput[] = [];

  if (input.mode === 'retry_failed') {
    const recent = await store.listRecentRuns(1000);
    const latestByRecord = new Map<string, MediaAnalysisRun>();

    for (const run of recent) {
      if (!latestByRecord.has(run.media_record_id)) {
        latestByRecord.set(run.media_record_id, run);
      }
    }

    const failedIds = [...latestByRecord.values()]
      .filter((run) => run.status === 'failed' || run.status === 'cancelled')
      .map((run) => run.media_record_id)
      .slice(0, limit);

    candidates =
      failedIds.length > 0
        ? await store.listEligibleInputs({ recordIds: failedIds, limit })
        : [];
  } else {
    const recordIds =
      input.mode === 'selected'
        ? (input.recordIds || []).filter(Boolean).slice(0, limit)
        : undefined;

    candidates = await store.listEligibleInputs({ recordIds, limit });

    if (input.mode === 'selected' && input.recordIds && input.recordIds.length > 0) {
      const eligibleIds = new Set(candidates.map((item) => item.mediaRecordId));
      const notEligibleCount = new Set(input.recordIds).size - eligibleIds.size;

      const result: MediaAnalysisEnqueueResult = {
        mode: input.mode,
        eligible: candidates.length,
        queued: 0,
        alreadyQueued: 0,
        upToDate: 0,
        notEligible: Math.max(0, notEligibleCount),
        queuedRecordIds: [],
        alreadyQueuedRecordIds: [],
      };

      await enqueueCandidates(store, candidates, input, result);
      result.queued = result.queuedRecordIds.length;
      result.alreadyQueued = result.alreadyQueuedRecordIds.length;

      return result;
    }
  }

  const result: MediaAnalysisEnqueueResult = {
    mode: input.mode,
    eligible: candidates.length,
    queued: 0,
    alreadyQueued: 0,
    upToDate: 0,
    notEligible: 0,
    queuedRecordIds: [],
    alreadyQueuedRecordIds: [],
  };

  await enqueueCandidates(store, candidates, input, result);
  result.queued = result.queuedRecordIds.length;
  result.alreadyQueued = result.alreadyQueuedRecordIds.length;

  return result;
}

async function enqueueCandidates(
  store: MediaAnalysisStore,
  candidates: MediaAnalysisEligibleInput[],
  input: { force?: boolean; requestedBy?: string | null; mode: MediaAnalysisEnqueueMode },
  result: MediaAnalysisEnqueueResult
): Promise<void> {
  if (candidates.length === 0) return;

  const latest = await store.latestCompletedByRecord(
    candidates.map((item) => item.mediaRecordId)
  );

  for (const candidate of candidates) {
    if (
      !input.force &&
      input.mode !== 'retry_failed' &&
      sameAnalysisVersion(latest.get(candidate.mediaRecordId), candidate.contentHash)
    ) {
      result.upToDate += 1;
      continue;
    }

    const active = await store.findActiveRun(candidate.mediaRecordId).catch(() => null);

    if (active) {
      result.alreadyQueuedRecordIds.push(candidate.mediaRecordId);
      continue;
    }

    try {
      await store.createRun({
        mediaRecordId: candidate.mediaRecordId,
        documentId: candidate.documentId,
        contentHash: candidate.contentHash,
        analyzerVersion: MEDIA_ANALYZER_VERSION,
        model:
          process.env.MEDIA_ANALYSIS_MODEL ||
          process.env.BRAIN_GRAPH_MODEL ||
          process.env.DEEPSEEK_MODEL ||
          'deepseek-chat',
        status: 'pending',
        requestedBy: input.requestedBy || null,
        requestedVia:
          input.mode === 'retry_failed'
            ? 'retry'
            : input.mode === 'selected'
              ? 'selected'
              : 'bulk',
        forceRefresh: Boolean(input.force),
      });

      result.queuedRecordIds.push(candidate.mediaRecordId);
    } catch (error) {
      // A concurrent enqueue hit the active-run unique index.
      if (error instanceof Error && error.message === 'media_analysis_run_create_failed') {
        result.alreadyQueuedRecordIds.push(candidate.mediaRecordId);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Processes a small number of queued runs. Stops at the job or time budget so
 * the caller stays inside the platform function limit.
 */
export async function processMediaAnalysisBatch(input: {
  limit?: number;
  maxDurationMs?: number;
  workerId?: string;
  trigger?: 'admin' | 'cron' | 'scheduler';
  store?: MediaAnalysisStore | null;
  runAnalysis?: typeof runMediaAnalysis;
} = {}): Promise<MediaAnalysisBatchResult> {
  if (!isGraphLlmConfigured()) throw new Error('media_analysis_not_configured');

  const store = input.store === undefined ? createMediaAnalysisStore() : input.store;
  const runAnalysis = input.runAnalysis || runMediaAnalysis;

  if (!store) throw new Error('media_analysis_database_unavailable');

  const workerId =
    input.workerId || `media-analysis-${input.trigger || 'admin'}-${Date.now().toString(36)}`;
  const limit = Math.min(Math.max(input.limit || 3, 1), 40);
  const maxDurationMs = Math.min(Math.max(input.maxDurationMs || 240_000, 10_000), 280_000);
  const startedAt = Date.now();
  const result: MediaAnalysisBatchResult = {
    workerId,
    claimed: 0,
    processed: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    results: [],
  };

  while (result.claimed < limit && Date.now() - startedAt < maxDurationMs) {
    const run = await store.claimNextRun(workerId);

    if (!run) break;

    result.claimed += 1;

    const timer = setInterval(() => {
      void store.heartbeatRun(run.id).catch(() => undefined);
    }, 60_000);

    try {
      const analysis = await runAnalysis({
        mediaRecordId: run.media_record_id,
        runId: run.id,
        force: run.force_refresh,
        model: run.model || undefined,
      });

      result.processed += 1;
      result.results.push({
        ...analysis,
        mediaRecordId: run.media_record_id,
        runId: run.id,
        status: 'completed',
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'media_analysis_failed';
      const retried = isRetryableError(code) && run.attempt < run.max_attempts;

      // Safety net for errors raised before runMediaAnalysis could persist them
      // (for example a missing document or an invalid input).
      await store
        .failRun(run.id, code, error instanceof Error ? error.message : 'Media analysis failed', {
          retryable: retried,
        })
        .catch(() => undefined);

      if (retried) result.retried += 1;
      else result.failed += 1;

      result.results.push({
        mediaRecordId: run.media_record_id,
        runId: run.id,
        status: 'failed',
        error: code,
      });
    } finally {
      clearInterval(timer);
    }
  }

  return result;
}

import { randomUUID } from 'node:crypto';

import { processNextBrainJob } from './process';
import type { BrainStore } from './store';
import {
  createOpenRouterEmbeddingClientFromEnv,
  type EmbeddingClient,
} from '@/lib/knowledge/rag/embeddings';

export type InlineIngestionResult = {
  ok: boolean;
  processed: number;
  failed: number;
  done: boolean;
  error: string | null;
};

/**
 * Bounded, synchronous processing for a single freshly-enqueued run.
 *
 * This exists so a normal save still becomes searchable when no cron/scheduler
 * is configured. It never loops forever, never touches other runs and never
 * queues graph work. If the embedding provider is unavailable the job stays
 * queued and the caller gets a truthful error instead of a fake completion.
 */
export async function processBrainRunInline(input: {
  store: BrainStore;
  runId: string;
  maxJobs?: number;
  budgetMs?: number;
  workerId?: string;
  /** Injectable for tests; `null` simulates missing provider credentials. */
  embeddingClient?: EmbeddingClient | null;
}): Promise<InlineIngestionResult> {
  const started = Date.now();
  const maxJobs = Math.min(3, Math.max(1, input.maxJobs ?? 1));
  const budgetMs = Math.min(180_000, Math.max(10_000, input.budgetMs ?? 75_000));
  const workerId = input.workerId || `inline-brain-${randomUUID()}`;
  let processed = 0;
  let failed = 0;

  let embeddingClient: EmbeddingClient;
  if (input.embeddingClient === null) {
    return {
      ok: false,
      processed: 0,
      failed: 0,
      done: false,
      error: 'embedding_not_configured',
    };
  }
  if (input.embeddingClient) {
    embeddingClient = input.embeddingClient;
  } else {
    try {
      embeddingClient = createOpenRouterEmbeddingClientFromEnv(process.env);
    } catch {
      return {
        ok: false,
        processed: 0,
        failed: 0,
        done: false,
        error: 'embedding_not_configured',
      };
    }
  }

  try {
    while (processed < maxJobs && Date.now() - started < budgetMs) {
      const result = await processNextBrainJob({
        runId: input.runId,
        store: input.store,
        embeddingClient,
        workerId,
      });

      if (result.state === 'processed') {
        processed += 1;
        if (result.job.status === 'failed' || result.job.status === 'partial') failed += 1;
        continue;
      }

      if (result.state === 'done') {
        return { ok: true, processed, failed, done: true, error: null };
      }

      // Waiting for a retry/backoff, paused, or no claimable job.
      return {
        ok: true,
        processed,
        failed,
        done: false,
        error: result.state === 'waiting' ? 'waiting_for_retry' : null,
      };
    }

    return { ok: true, processed, failed, done: false, error: null };
  } catch (error) {
    return {
      ok: false,
      processed,
      failed,
      done: false,
      error: error instanceof Error ? error.message.slice(0, 200) : 'inline_ingestion_failed',
    };
  }
}

import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { createGraphRun } from '@/lib/knowledge/graph/pipeline';
import { getGraphModel, isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import type { BrainStore } from './store';

export type GraphQueueResult =
  | { status: 'queued'; runId: string; jobs: number }
  | { status: 'existing'; runId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string };

/**
 * After an ingestion run completes, queue the completed documents for graph
 * extraction once. Graph relationships stay unverified until the owner reviews
 * them; this function only queues extraction, it never marks facts as verified.
 */
export async function queueGraphForIngestionRun(input: {
  store: BrainStore;
  runId: string;
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<GraphQueueResult> {
  const env = input.env || process.env;

  if (input.enabled === false) {
    return { status: 'skipped', reason: 'disabled' };
  }

  if ((env.BRAIN_AUTO_GRAPH || 'true').trim().toLowerCase() === 'false') {
    return { status: 'skipped', reason: 'disabled' };
  }

  if (!isGraphLlmConfigured()) {
    return { status: 'skipped', reason: 'llm_not_configured' };
  }

  try {
    const run = await input.store.getRun(input.runId);

    if (!run) return { status: 'error', reason: 'run_not_found' };

    const existingRunId =
      typeof run.metadata?.graph_run_id === 'string' ? run.metadata.graph_run_id : null;

    if (existingRunId) {
      return { status: 'existing', runId: existingRunId };
    }

    const jobs = await input.store.getJobs(input.runId);
    const documentIds = Array.from(
      new Set(
        jobs
          .filter((job) => job.status === 'completed' && job.document_id)
          .map((job) => String(job.document_id))
      )
    );

    if (documentIds.length === 0) {
      await input.store.updateRun(input.runId, {
        metadata: { ...run.metadata, graph_status: 'skipped', graph_reason: 'no_documents' },
      });
      return { status: 'skipped', reason: 'no_documents' };
    }

    const graphStore = createBrainGraphStore();

    if (!graphStore) {
      return { status: 'error', reason: 'graph_database_unavailable' };
    }

    const allDocuments = await graphStore.listDocuments(5000);
    const wanted = new Set(documentIds);
    const documents = allDocuments.filter((document) => wanted.has(document.id));

    if (documents.length === 0) {
      await input.store.updateRun(input.runId, {
        metadata: { ...run.metadata, graph_status: 'skipped', graph_reason: 'documents_missing' },
      });
      return { status: 'skipped', reason: 'documents_missing' };
    }

    const result = await createGraphRun({
      store: graphStore,
      documents,
      model: getGraphModel(),
      metadata: {
        source: 'brain_ingestion',
        ingestion_run_id: input.runId,
      },
    });

    if (!result.run) {
      await input.store.updateRun(input.runId, {
        metadata: { ...run.metadata, graph_status: 'skipped', graph_reason: 'already_extracted' },
      });
      return { status: 'skipped', reason: 'already_extracted' };
    }

    await input.store.updateRun(input.runId, {
      metadata: {
        ...run.metadata,
        graph_status: 'queued',
        graph_run_id: result.run.id,
        graph_job_count: result.jobs.length,
      },
    });

    return {
      status: 'queued',
      runId: result.run.id,
      jobs: result.jobs.length,
    };
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'graph_queue_failed',
    };
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminRagOverview = {
  documents: {
    total: number;
    chunks: number;
    embeddedChunks: number;
    bySourceType: Array<{ key: string; value: number }>;
    byAccessClass: Array<{ key: string; value: number }>;
  };
  queues: {
    brain: QueueStats;
    graph: QueueStats;
    mediaAnalysis: QueueStats;
  };
  media: {
    records: number;
    withDocument: number;
    quotes: number;
    topics: number;
    entities: number;
    relations: number;
  };
  retrieval: {
    attempts: number;
    relevant: number;
    noMatch: number;
    unavailable: number;
    errors: number;
    media: number;
    contextUsed: number;
    averageLatencyMs: number | null;
    lastAt: string | null;
    sources: Array<{ key: string; value: number }>;
  };
  generatedAt: string;
};

export type QueueStats = {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  oldestQueuedAt: string | null;
};

type QueueRow = { status: string; created_at: string };
type DocumentRow = {
  source_type: string;
  access_class: string;
  chunk_count: number;
  embedding_model: string;
  embedding_dimensions: number;
};
type RetrievalRow = { payload: Record<string, unknown> | null; created_at: string };

function emptyQueue(): QueueStats {
  return {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    oldestQueuedAt: null,
  };
}

function queueStats(rows: QueueRow[], pendingStatus: string): QueueStats {
  const stats = emptyQueue();

  for (const row of rows) {
    if (row.status === pendingStatus) {
      stats.queued += 1;
      if (!stats.oldestQueuedAt || row.created_at < stats.oldestQueuedAt) {
        stats.oldestQueuedAt = row.created_at;
      }
      continue;
    }

    if (row.status === 'processing') stats.processing += 1;
    else if (row.status === 'completed') stats.completed += 1;
    else if (row.status === 'failed') stats.failed += 1;
    else if (row.status === 'cancelled') stats.cancelled += 1;
    else if (row.status === 'skipped') stats.skipped += 1;
  }

  return stats;
}

function sortCounts(map: Map<string, number>): Array<{ key: string; value: number }> {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
}

async function safeRows<T>(
  loader: () => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  try {
    const result = await loader();
    if (result.error) return [];
    return Array.isArray(result.data) ? (result.data as T[]) : [];
  } catch {
    return [];
  }
}

async function safeCount(
  loader: () => PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const result = await loader();
    if (result.error) return 0;
    return result.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Read-only operational snapshot for the admin Overview.
 *
 * It deliberately aggregates only counts, statuses and retrieval metadata:
 * no passages, queries, owner text or visitor text are returned.
 */
export async function loadAdminRagOverview(
  store: SupabaseClient,
  now = new Date()
): Promise<AdminRagOverview> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    documents,
    totalChunks,
    embeddedChunks,
    brainJobs,
    graphJobs,
    mediaRuns,
    mediaRecords,
    mediaDocuments,
    mediaQuotes,
    mediaTopics,
    mediaEntities,
    mediaRelations,
    retrievalRows,
  ] = await Promise.all([
    safeRows<DocumentRow>(() =>
      store
        .from('knowledge_documents')
        .select('source_type,access_class,chunk_count,embedding_model,embedding_dimensions')
        .limit(5000)
    ),
    safeCount(() =>
      store.from('knowledge_chunks').select('id', { count: 'exact', head: true })
    ),
    safeCount(() =>
      store
        .from('knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('embedding_model', 'baai/bge-m3')
        .eq('embedding_dimensions', 1024)
    ),
    safeRows<QueueRow>(() =>
      store
        .from('brain_ingestion_jobs')
        .select('status,created_at')
        .order('created_at', { ascending: true })
        .limit(5000)
    ),
    safeRows<QueueRow>(() =>
      store
        .from('brain_graph_jobs')
        .select('status,created_at')
        .order('created_at', { ascending: true })
        .limit(5000)
    ),
    safeRows<QueueRow>(() =>
      store
        .from('media_analysis_runs')
        .select('status,created_at')
        .order('created_at', { ascending: true })
        .limit(5000)
    ),
    safeCount(() =>
      store.from('media_archive_records').select('id', { count: 'exact', head: true })
    ),
    safeCount(() =>
      store
        .from('knowledge_documents')
        .select('id', { count: 'exact', head: true })
        .not('media_record_id', 'is', null)
    ),
    safeCount(() =>
      store
        .from('media_quotes')
        .select('id', { count: 'exact', head: true })
        .eq('is_current', true)
    ),
    safeCount(() =>
      store
        .from('media_analysis_topics')
        .select('media_record_id', { count: 'exact', head: true })
        .eq('is_current', true)
    ),
    safeCount(() =>
      store
        .from('media_analysis_entities')
        .select('id', { count: 'exact', head: true })
        .eq('is_current', true)
    ),
    safeCount(() =>
      store
        .from('media_record_relations')
        .select('id', { count: 'exact', head: true })
        .eq('is_current', true)
    ),
    safeRows<RetrievalRow>(() =>
      store
        .from('pierrot_events')
        .select('payload,created_at')
        .eq('event_name', 'brain_retrieval')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000)
    ),
  ]);

  const sourceTypes = new Map<string, number>();
  const accessClasses = new Map<string, number>();

  for (const document of documents) {
    const sourceType = document.source_type || 'unknown';
    const accessClass = document.access_class || 'unknown';
    sourceTypes.set(sourceType, (sourceTypes.get(sourceType) || 0) + 1);
    accessClasses.set(accessClass, (accessClasses.get(accessClass) || 0) + 1);
  }

  let relevant = 0;
  let noMatch = 0;
  let unavailable = 0;
  let errors = 0;
  let media = 0;
  let contextUsed = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let lastAt: string | null = null;
  const retrievalSources = new Map<string, number>();

  for (const row of retrievalRows) {
    const payload = row.payload || {};
    const outcome = typeof payload.outcome === 'string' ? payload.outcome : '';
    if (outcome === 'relevant_results') relevant += 1;
    else if (outcome === 'no_match' || outcome === 'weak_match') noMatch += 1;
    else if (outcome === 'unavailable' || outcome === 'disabled') unavailable += 1;
    else if (outcome === 'error') errors += 1;

    if (payload.mode === 'media') media += 1;
    if (payload.used_context === true) contextUsed += 1;

    const latency = typeof payload.latency_ms === 'number' ? payload.latency_ms : null;
    if (latency !== null && Number.isFinite(latency) && latency > 0) {
      latencyTotal += latency;
      latencyCount += 1;
    }

    if (!lastAt && row.created_at) lastAt = row.created_at;

    const sources = Array.isArray(payload.selected_sources)
      ? payload.selected_sources
      : Array.isArray(payload.requested_sources)
        ? payload.requested_sources
        : [];

    for (const source of sources) {
      if (typeof source !== 'string' || !source) continue;
      retrievalSources.set(source, (retrievalSources.get(source) || 0) + 1);
    }
  }

  return {
    documents: {
      total: documents.length,
      chunks: totalChunks,
      embeddedChunks,
      bySourceType: sortCounts(sourceTypes),
      byAccessClass: sortCounts(accessClasses),
    },
    queues: {
      brain: queueStats(brainJobs, 'queued'),
      graph: queueStats(graphJobs, 'queued'),
      mediaAnalysis: queueStats(mediaRuns, 'pending'),
    },
    media: {
      records: mediaRecords,
      withDocument: mediaDocuments,
      quotes: mediaQuotes,
      topics: mediaTopics,
      entities: mediaEntities,
      relations: mediaRelations,
    },
    retrieval: {
      attempts: retrievalRows.length,
      relevant,
      noMatch,
      unavailable,
      errors,
      media,
      contextUsed,
      averageLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : null,
      lastAt,
      sources: sortCounts(retrievalSources),
    },
    generatedAt: now.toISOString(),
  };
}

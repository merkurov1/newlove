import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPierrotRagEnabled } from '@/lib/knowledge/rag/config';
import type { BrainIssue, BrainMetrics, BrainState, BrainStatusSnapshot } from './brainStatusTypes';
import { readLocalBrainSnapshot, writeLocalBrainSnapshot } from './brainCache';
import { getMemorySummary, listMemoryRecords } from './store';
import { readMemoryEmbeddingCounts, resolveMemoryEmbeddingClient } from './embeddings';

assertServerOnly('lib/pierrot/memory/brainStatus');

const SNAPSHOT_TABLE = 'pierrot_brain_status_snapshots';
export const BRAIN_STATUS_FRESH_TTL_MS = 24 * 60 * 60 * 1000;
const FRESH_TTL_MS = BRAIN_STATUS_FRESH_TTL_MS;
const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingRelation(error: { code?: unknown } | null | undefined): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code === '42P01' || code === 'PGRST205';
}

function ageDays(value: string | null | undefined, now: number): number {
  if (!value) return 0;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  return (now - time) / DAY_MS;
}

function buildIssues(
  metrics: BrainMetrics,
  input: {
    storageAvailable: boolean;
    retrievalAvailable: boolean;
    embeddingIndexAvailable: boolean;
    embeddingProviderAvailable: boolean;
  }
): BrainIssue[] {
  const issues: BrainIssue[] = [];

  if (!input.storageAvailable) {
    issues.push({
      code: 'storage_unavailable',
      severity: 'error',
      message: 'Temporal Memory storage is unavailable.',
    });
  }

  if (!input.retrievalAvailable) {
    issues.push({
      code: 'retrieval_unavailable',
      severity: 'error',
      message: 'Brain retrieval is disabled or not configured.',
    });
  }

  if (!input.embeddingIndexAvailable) {
    issues.push({
      code: 'index_pending',
      severity: 'warning',
      count: metrics.activeRecords,
      message: 'Embedding index table is not available; lexical memory search is used.',
    });
  } else if (!input.embeddingProviderAvailable) {
    issues.push({
      code: 'embedding_provider_unavailable',
      severity: 'warning',
      count: metrics.embeddingsPending,
      message: 'Embedding provider is not configured; new records wait for indexing.',
    });
  }

  if (metrics.embeddingsPending > 0) {
    issues.push({
      code: 'index_pending',
      severity: 'info',
      count: metrics.embeddingsPending,
      message: `${metrics.embeddingsPending} record(s) wait for embedding indexing.`,
    });
  }

  if (metrics.embeddingsFailed > 0) {
    issues.push({
      code: 'index_failed',
      severity: 'warning',
      count: metrics.embeddingsFailed,
      message: `${metrics.embeddingsFailed} embedding attempt(s) failed and can be retried.`,
    });
  }

  if (metrics.conflicts > 0) {
    issues.push({
      code: 'conflicts',
      severity: 'warning',
      count: metrics.conflicts,
      message: `${metrics.conflicts} record(s) have unresolved contradictions.`,
    });
  }

  if (metrics.staleTemporary > 0) {
    issues.push({
      code: 'stale_temporary',
      severity: 'info',
      count: metrics.staleTemporary,
      message: `${metrics.staleTemporary} temporary note(s) can be archived.`,
    });
  }

  if (metrics.overdueTasks > 0) {
    issues.push({
      code: 'overdue_tasks',
      severity: 'info',
      count: metrics.overdueTasks,
      message: `${metrics.overdueTasks} task(s) or reminder(s) are overdue.`,
    });
  }

  return issues;
}

function selectState(input: {
  storageAvailable: boolean;
  retrievalAvailable: boolean;
  embeddingIndexAvailable: boolean;
  metrics: BrainMetrics;
}): BrainState {
  if (!input.storageAvailable || !input.retrievalAvailable) return 'degraded';

  if (!input.embeddingIndexAvailable) return 'attention';

  if (input.metrics.embeddingsPending > 0) return 'updating';

  if (
    input.metrics.embeddingsFailed > 0 ||
    input.metrics.conflicts > 0 ||
    input.metrics.staleTemporary > 0 ||
    input.metrics.overdueTasks > 0
  ) {
    return 'attention';
  }

  return 'stable';
}

function summaryFor(
  state: BrainState,
  metrics: BrainMetrics,
  input: {
    storageAvailable: boolean;
    retrievalAvailable: boolean;
    embeddingIndexAvailable: boolean;
  }
): string {
  if (!input.storageAvailable) {
    return 'Память недоступна. Проверка не выполнена.';
  }

  if (!input.retrievalAvailable) {
    return 'Поиск временно недоступен. Память доступна, но проверить её актуальность нельзя.';
  }

  if (!input.embeddingIndexAvailable) {
    return 'Семантический индекс ещё не готов; поиск работает по словам.';
  }

  if (metrics.embeddingsPending > 0) {
    return `Новые материалы ещё не полностью проиндексированы: ${metrics.embeddingsPending} записей ждут индексации.`;
  }

  if (metrics.conflicts > 0) {
    return `Обнаружены противоречия в текущих договорённостях: ${metrics.conflicts}.`;
  }

  if (metrics.staleTemporary > 0) {
    return 'Есть несколько устаревших задач, которые стоит закрыть.';
  }

  if (metrics.overdueTasks > 0) {
    return `Есть просроченные напоминания: ${metrics.overdueTasks}.`;
  }

  if (metrics.embeddingsFailed > 0) {
    return `Индексация завершилась с ошибкой для ${metrics.embeddingsFailed} записей; их можно переиндексировать.`;
  }

  if (metrics.activeRecords === 0) {
    return 'Память пуста. Записей пока нет.';
  }

  return `Память актуальна. Активных записей: ${metrics.activeRecords}, архив доступен.`;
}

function detailFor(
  metrics: BrainMetrics,
  input: {
    storageAvailable: boolean;
    retrievalAvailable: boolean;
    embeddingIndexAvailable: boolean;
  }
): NonNullable<BrainStatusSnapshot['detail']> {
  return {
    temporalMemory: !input.storageAvailable
      ? 'degraded'
      : metrics.conflicts > 0 || metrics.staleTemporary > 0
        ? 'attention'
        : 'ok',
    brainRetrieval: input.retrievalAvailable ? 'ok' : 'degraded',
    embeddings: !input.embeddingIndexAvailable
      ? 'attention'
      : metrics.embeddingsPending > 0 || metrics.embeddingsFailed > 0
        ? 'attention'
        : 'ok',
  };
}

/**
 * Deterministic status computation. No model call and no embedding call. The
 * queries are count/list queries bounded to a few hundred rows.
 */
export async function computeBrainStatus(
  store: SupabaseClient,
  userId: string,
  options: { detailed?: boolean } = {}
): Promise<BrainStatusSnapshot> {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const retrievalAvailable = isPierrotRagEnabled(process.env);
  const embeddingClient = resolveMemoryEmbeddingClient();
  const embeddingProviderAvailable = Boolean(embeddingClient);

  let storageAvailable = true;
  let embeddingIndexAvailable = false;
  const metrics: BrainMetrics = {
    activeRecords: 0,
    archivedRecords: 0,
    uncertainRecords: 0,
    openTasks: 0,
    overdueTasks: 0,
    staleTemporary: 0,
    conflicts: 0,
    embeddingsReady: 0,
    embeddingsPending: 0,
    embeddingsFailed: 0,
    linkedSupersessions: 0,
  };

  try {
    const [summary, active, archive, embeddingCounts] = await Promise.all([
      getMemorySummary(store, userId),
      listMemoryRecords(store, {
        userId,
        status: 'active',
        limit: 160,
      }),
      listMemoryRecords(store, {
        userId,
        statuses: ['archived', 'completed', 'superseded', 'rejected'],
        includeArchive: true,
        limit: 80,
      }),
      readMemoryEmbeddingCounts(store, userId).catch(() => ({
        available: false,
        ready: 0,
        pending: 0,
        failed: 0,
      })),
    ]);

    metrics.activeRecords = summary.activeTotal ?? active.length;
    metrics.archivedRecords = summary.archivedTotal ?? archive.length;
    metrics.uncertainRecords = summary.uncertainTotal ?? 0;
    metrics.conflicts = metrics.uncertainRecords;
    metrics.openTasks = active.filter(
      (record) =>
        (record.kind === 'task' || record.kind === 'reminder') && record.status === 'current'
    ).length;
    metrics.overdueTasks = active.filter(
      (record) =>
        record.reviewAt &&
        Date.parse(record.reviewAt) < now &&
        record.status === 'current' &&
        (record.kind === 'task' || record.kind === 'reminder')
    ).length;
    metrics.staleTemporary = active.filter((record) => {
      if (record.kind !== 'saved' && record.kind !== 'reminder') return false;
      if (record.importance >= 0.7) return false;
      const reference = record.validUntil || record.reviewAt || record.updatedAt;
      const threshold = record.kind === 'reminder' ? 45 : 30;
      return ageDays(reference, now) > threshold;
    }).length;
    metrics.linkedSupersessions = archive.filter(
      (record) => record.status === 'superseded' && Boolean(record.supersededBy)
    ).length;

    metrics.embeddingsReady = embeddingCounts.ready;
    metrics.embeddingsPending = embeddingCounts.pending;
    metrics.embeddingsFailed = embeddingCounts.failed;
    embeddingIndexAvailable = embeddingCounts.available;
  } catch {
    storageAvailable = false;
  }

  const state = selectState({
    storageAvailable,
    retrievalAvailable,
    embeddingIndexAvailable,
    metrics,
  });

  const issues = buildIssues(metrics, {
    storageAvailable,
    retrievalAvailable,
    embeddingIndexAvailable,
    embeddingProviderAvailable,
  });

  if (!storageAvailable) {
    issues.unshift({
      code: 'never_checked',
      severity: 'error',
      message: 'The last status check could not read memory storage.',
    });
  }

  return {
    state,
    label:
      state === 'stable'
        ? 'Stable'
        : state === 'attention'
          ? 'Attention'
          : state === 'updating'
            ? 'Updating'
            : 'Degraded',
    summary: summaryFor(state, metrics, {
      storageAvailable,
      retrievalAvailable,
      embeddingIndexAvailable,
    }),
    checkedAt,
    stale: false,
    storageAvailable,
    retrievalAvailable,
    embeddingProviderAvailable,
    metrics,
    issues,
    ...(options.detailed
      ? {
          detail: detailFor(metrics, {
            storageAvailable,
            retrievalAvailable,
            embeddingIndexAvailable,
          }),
        }
      : {}),
  };
}

function parseSnapshot(row: Record<string, unknown>): BrainStatusSnapshot | null {
  const state = row.state;
  if (state !== 'stable' && state !== 'attention' && state !== 'updating' && state !== 'degraded') {
    return null;
  }

  const metrics =
    row.metrics && typeof row.metrics === 'object' ? (row.metrics as BrainMetrics) : null;

  if (!metrics) return null;

  return {
    state,
    label: typeof row.label === 'string' ? row.label : state,
    summary: typeof row.summary === 'string' ? row.summary : '',
    checkedAt: typeof row.checked_at === 'string' ? row.checked_at : null,
    stale: false,
    storageAvailable: row.storage_available !== false,
    retrievalAvailable: row.retrieval_available !== false,
    embeddingProviderAvailable: row.embedding_provider_available !== false,
    metrics,
    issues: Array.isArray(row.issues) ? (row.issues as BrainIssue[]) : [],
    ...(row.detail && typeof row.detail === 'object'
      ? { detail: row.detail as BrainStatusSnapshot['detail'] }
      : {}),
  };
}

async function readDurableSnapshot(
  store: SupabaseClient,
  userId: string
): Promise<{ snapshot: BrainStatusSnapshot; fresh: boolean } | null> {
  const { data, error } = await store
    .from(SNAPSHOT_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (!isMissingRelation(error)) console.warn('[Pierrot brain status] snapshot read failed');
    return null;
  }
  if (!data) return null;

  const snapshot = parseSnapshot(data as Record<string, unknown>);

  if (!snapshot) return null;

  const checked = snapshot.checkedAt ? Date.parse(snapshot.checkedAt) : 0;
  const fresh = Number.isFinite(checked) && Date.now() - checked < FRESH_TTL_MS;

  return { snapshot, fresh };
}

async function writeDurableSnapshot(
  store: SupabaseClient,
  userId: string,
  snapshot: BrainStatusSnapshot
): Promise<void> {
  const { error } = await store.from(SNAPSHOT_TABLE).upsert(
    {
      user_id: userId,
      state: snapshot.state,
      label: snapshot.label,
      summary: snapshot.summary,
      metrics: snapshot.metrics,
      issues: snapshot.issues,
      detail: snapshot.detail ?? null,
      storage_available: snapshot.storageAvailable,
      retrieval_available: snapshot.retrievalAvailable,
      embedding_provider_available: snapshot.embeddingProviderAvailable,
      checked_at: snapshot.checkedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error && !isMissingRelation(error)) {
    console.warn('[Pierrot brain status] snapshot write failed');
  }
}

function lastKnownFallback(
  userId: string,
  durable: BrainStatusSnapshot | null
): BrainStatusSnapshot | null {
  const local = readLocalBrainSnapshot(userId);
  const snapshot = durable || local || null;
  if (!snapshot) return null;

  return {
    ...snapshot,
    state: 'degraded',
    label: 'Degraded',
    summary: 'Проверка сейчас недоступна. Показано последнее известное состояние.',
    stale: true,
    issues: [
      {
        code: 'storage_unavailable',
        severity: 'error',
        message: 'The status check could not reach storage.',
      },
      ...snapshot.issues.filter((issue) => issue.code !== 'storage_unavailable'),
    ],
  };
}

/**
 * Fast path for the start screen. It reads a cached snapshot and only computes
 * when there is no snapshot or the caller explicitly asks for a refresh.
 */
export async function loadBrainStatus(
  store: SupabaseClient | null,
  userId: string,
  options: { force?: boolean; detailed?: boolean } = {}
): Promise<BrainStatusSnapshot> {
  if (!store) {
    return {
      state: 'degraded',
      label: 'Degraded',
      summary: 'Память недоступна. Проверка не выполнена.',
      checkedAt: null,
      stale: true,
      storageAvailable: false,
      retrievalAvailable: false,
      embeddingProviderAvailable: false,
      metrics: {
        activeRecords: 0,
        archivedRecords: 0,
        uncertainRecords: 0,
        openTasks: 0,
        overdueTasks: 0,
        staleTemporary: 0,
        conflicts: 0,
        embeddingsReady: 0,
        embeddingsPending: 0,
        embeddingsFailed: 0,
        linkedSupersessions: 0,
      },
      issues: [
        {
          code: 'storage_unavailable',
          severity: 'error',
          message: 'Supabase service credentials are not configured.',
        },
      ],
      ...(options.detailed
        ? {
            detail: {
              temporalMemory: 'degraded' as const,
              brainRetrieval: 'degraded' as const,
              embeddings: 'degraded' as const,
            },
          }
        : {}),
    };
  }

  if (!options.force) {
    const durable = await readDurableSnapshot(store, userId);

    if (durable?.fresh) {
      const snapshot =
        options.detailed && !durable.snapshot.detail
          ? {
              ...durable.snapshot,
              detail: detailFor(durable.snapshot.metrics, {
                storageAvailable: durable.snapshot.storageAvailable,
                retrievalAvailable: durable.snapshot.retrievalAvailable,
                embeddingIndexAvailable:
                  durable.snapshot.metrics.embeddingsReady +
                    durable.snapshot.metrics.embeddingsPending +
                    durable.snapshot.metrics.embeddingsFailed >
                  0,
              }),
            }
          : durable.snapshot;

      writeLocalBrainSnapshot(userId, snapshot);
      return snapshot;
    }

    const local = readLocalBrainSnapshot(userId);
    if (!durable && local && !local.stale) {
      return local;
    }
  }

  try {
    const fresh = await computeBrainStatus(store, userId, options);

    // A failed read must not replace the last known snapshot with zeroed
    // metrics. Keep the previous state and label it as stale/degraded.
    if (!fresh.storageAvailable) {
      const durable = await readDurableSnapshot(store, userId).catch(() => null);
      const fallback = lastKnownFallback(userId, durable?.snapshot ?? null);
      if (fallback) {
        writeLocalBrainSnapshot(userId, fallback);
        return fallback;
      }
    }

    writeLocalBrainSnapshot(userId, fresh);
    await writeDurableSnapshot(store, userId, fresh);
    return fresh;
  } catch {
    const durable = await readDurableSnapshot(store, userId).catch(() => null);
    const fallback = lastKnownFallback(userId, durable?.snapshot ?? null);

    if (fallback) return fallback;

    return {
      state: 'degraded',
      label: 'Degraded',
      summary: 'Проверка состояния не выполнена: хранилище недоступно.',
      checkedAt: null,
      stale: true,
      storageAvailable: false,
      retrievalAvailable: isPierrotRagEnabled(process.env),
      embeddingProviderAvailable: Boolean(resolveMemoryEmbeddingClient()),
      metrics: {
        activeRecords: 0,
        archivedRecords: 0,
        uncertainRecords: 0,
        openTasks: 0,
        overdueTasks: 0,
        staleTemporary: 0,
        conflicts: 0,
        embeddingsReady: 0,
        embeddingsPending: 0,
        embeddingsFailed: 0,
        linkedSupersessions: 0,
      },
      issues: [
        {
          code: 'storage_unavailable',
          severity: 'error',
          message: 'The status check could not read memory storage.',
        },
      ],
      ...(options.detailed
        ? {
            detail: {
              temporalMemory: 'degraded' as const,
              brainRetrieval: 'degraded' as const,
              embeddings: 'degraded' as const,
            },
          }
        : {}),
    };
  }
}

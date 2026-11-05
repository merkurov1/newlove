/**
 * Client-safe Brain status contract. Deliberately contains counts and short
 * deterministic phrases only — never memory content.
 */

export type BrainState = 'stable' | 'attention' | 'updating' | 'degraded';

export type BrainIssue = {
  code:
    | 'storage_unavailable'
    | 'retrieval_unavailable'
    | 'embedding_provider_unavailable'
    | 'index_pending'
    | 'index_failed'
    | 'conflicts'
    | 'stale_temporary'
    | 'overdue_tasks'
    | 'never_checked'
    | 'snapshot_stale';
  severity: 'info' | 'warning' | 'error';
  count?: number;
  message: string;
};

export type BrainMetrics = {
  activeRecords: number;
  archivedRecords: number;
  uncertainRecords: number;
  openTasks: number;
  overdueTasks: number;
  staleTemporary: number;
  conflicts: number;
  embeddingsReady: number;
  embeddingsPending: number;
  embeddingsFailed: number;
  linkedSupersessions: number;
};

export type BrainStatusSnapshot = {
  state: BrainState;
  label: string;
  /** One deterministic natural-language sentence. */
  summary: string;
  checkedAt: string | null;
  /** True when this object is the last known snapshot, not a fresh check. */
  stale: boolean;
  storageAvailable: boolean;
  retrievalAvailable: boolean;
  embeddingProviderAvailable: boolean;
  metrics: BrainMetrics;
  issues: BrainIssue[];
  /** Detailed view adds per-subsystem status lines. */
  detail?: {
    temporalMemory: 'ok' | 'attention' | 'degraded';
    brainRetrieval: 'ok' | 'attention' | 'degraded';
    embeddings: 'ok' | 'attention' | 'degraded';
  };
};

export const EMPTY_BRAIN_METRICS: BrainMetrics = {
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

export function brainStateLabel(state: BrainState): string {
  switch (state) {
    case 'stable':
      return 'Stable';
    case 'attention':
      return 'Attention';
    case 'updating':
      return 'Updating';
    default:
      return 'Degraded';
  }
}

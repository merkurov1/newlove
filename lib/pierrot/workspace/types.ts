/**
 * Shared, client-safe contracts for the owner workspace.
 *
 * These types deliberately contain no message text beyond what the owner
 * explicitly opens, no secrets and no server-only imports.
 */

export const WORKSPACE_METRIC_KEYS = [
  'users',
  'subscribers',
  'flow',
  'conversations',
  'media',
] as const;

export type WorkspaceMetricKey = (typeof WORKSPACE_METRIC_KEYS)[number];

/**
 * The only states the interface is allowed to show for a metric. Missing data
 * is represented by `state: null` and rendered as "нет данных"; it is never
 * folded into "тихо" or zero.
 */
export type MetricState = 'растёт' | 'стоит' | 'падает' | 'тихо' | 'пухнет' | 'тревога';

export type WorkspaceMetric = {
  key: WorkspaceMetricKey;
  label: string;
  /** Current cumulative snapshot. */
  current: number;
  /** Additions in the current comparable period. */
  periodCount: number;
  /** Additions in the previous comparable period. */
  previousCount: number;
  /** Counts used for comparison after removing a detected one-day bulk spike. */
  comparisonCurrent?: number;
  comparisonPrevious?: number;
  bulkImportCurrent?: number;
  bulkImportPrevious?: number;
  changeRatio?: number | null;
  /** null when the historical series is unavailable. */
  state: MetricState | null;
  /** Daily counts for the current period, oldest first. null when unavailable. */
  series: number[] | null;
  /** False when neither the snapshot nor the series could be read. */
  available: boolean;
};

export type WorkspacePeriod = 7 | 30;

import type { CommercialSummary } from '@/lib/pierrot/commercialSummary';

export type WorkspaceOverview = {
  period: WorkspacePeriod;
  from: string;
  to: string;
  metrics: WorkspaceMetric[];
  commercial: CommercialSummary;
  summary: string;
  generatedAt: string;
  /** True when this is the last successful snapshot, not a fresh load. */
  stale?: boolean;
};

export type OwnerConversationListItem = {
  id: string;
  /** Needed to append to the existing session through the public API. */
  sessionId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  consentState: 'pending' | 'granted' | 'denied' | null;
  messageCount: number;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
};

export type OwnerChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  provider?: string | null;
};

export type OwnerConversation = {
  id: string;
  sessionId: string;
  title: string;
  consentState: 'pending' | 'granted' | 'denied' | null;
  messages: OwnerChatMessage[];
};

export type BrainRecentSource = {
  id: string;
  title: string | null;
  sourceType: string | null;
  sourceFormat: string | null;
  status: string | null;
  errorCode: string | null;
  createdAt: string | null;
  documentId: string | null;
};

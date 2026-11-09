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

export type WorkspaceProjectHealth = {
  /** null means the source could not be read; zero is a real value. */
  activeProjects: number | null;
  /** Active owner tasks/reminders, not the model's interpretation. */
  activeTasks: number | null;
  /** Dev tasks that are ready, in progress or awaiting review. */
  activeDevTasks: number | null;
};

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
  projectHealth?: WorkspaceProjectHealth;
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
  projectStatus?: 'active' | 'paused' | 'archived' | null;
};

export type OwnerChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  provider?: string | null;
  messageIndex?: number;
  /** Episode this message belongs to in the permanent history. */
  sessionId?: string | null;
  /** Stable cursor inside the history (not the per-conversation index). */
  historySequence?: number | null;
  feedback?: 'up' | 'down' | null;
};

export type PierrotHistoryType = 'main' | 'project';

export type OwnerHistorySummary = {
  id: string;
  type: PierrotHistoryType;
  title: string;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  canonicalConversationId: string | null;
  updatedAt: string | null;
  sessionCount: number;
  messageCount: number;
};

export type OwnerSessionListItem = {
  id: string;
  historyId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  ordinal: number;
  sourceConversationId: string | null;
  firstMessageSequence: number | null;
  lastMessageSequence: number | null;
};

export type ProjectRailSession = {
  id: string;
  historyId: string;
  title: string;
  startedAt: string;
  /** Last real message activity, never the session creation time. */
  lastActivityAt: string | null;
  messageCount: number;
  ordinal: number;
};

export type ProjectRailItem = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'paused' | 'archived';
  historyId: string | null;
  canonicalConversationId: string | null;
  /** Canonical project chat URL. */
  chatHref: string;
  /** Latest `last_message_at` across the project sessions. */
  lastActivityAt: string | null;
  /** Only open sessions with at least one message. */
  sessions: ProjectRailSession[];
};

export type OwnerConversation = {
  id: string;
  sessionId: string;
  title: string;
  consentState: 'pending' | 'granted' | 'denied' | null;
  messages: OwnerChatMessage[];
  /** True when older messages exist before `oldestMessageIndex`. */
  hasMore?: boolean;
  oldestMessageIndex?: number | null;
  /** Permanent history this transcript belongs to. */
  historyId?: string | null;
  historyType?: PierrotHistoryType | null;
  historyTitle?: string | null;
  projectId?: string | null;
  projectSlug?: string | null;
  projectName?: string | null;
  currentSessionId?: string | null;
  currentSessionTitle?: string | null;
  /** Stable history cursor boundaries for pagination and positioning. */
  oldestSequence?: number | null;
  newestSequence?: number | null;
  hasNewer?: boolean;
  /** True when the opened session has no messages yet. */
  emptyCurrentSession?: boolean;
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

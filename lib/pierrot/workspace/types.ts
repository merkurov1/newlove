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
  /** null when the historical series is unavailable. */
  state: MetricState | null;
  /** Daily counts for the current period, oldest first. null when unavailable. */
  series: number[] | null;
  /** False when neither the snapshot nor the series could be read. */
  available: boolean;
};

export type WorkspacePeriod = 7 | 30;

export type WorkspaceOverview = {
  period: WorkspacePeriod;
  from: string;
  to: string;
  metrics: WorkspaceMetric[];
  summary: string;
  generatedAt: string;
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

export type FlowChannelConfig = {
  telegram: boolean;
  bluesky: boolean;
};

export type FlowItemRow = {
  id: string;
  title: string | null;
  slug: string | null;
  body_md: string | null;
  source_url: string | null;
  type: string | null;
  lang: string | null;
  status: string | null;
  visibility: string | null;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
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

export type IntegrationSnapshot = {
  blueskyConfigured: boolean;
  telegramConfigured: boolean;
  githubOAuth: false;
};

export type ModelSnapshot = {
  primary: string | null;
  fallback: string[];
  configured: boolean;
};

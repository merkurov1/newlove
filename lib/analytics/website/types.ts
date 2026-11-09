/**
 * Website intelligence · shared vocabulary.
 *
 * The types deliberately keep source identity on every value. A GA4 session,
 * an Umami visitor and a confirmed subscriber are different measurements and
 * are never merged into one anonymous "visitor" number.
 */

export type AnalyticsProvider = 'google_analytics' | 'search_console' | 'umami';
export type AnalyticsLanguage = 'ru' | 'en';

export type AnalyticsConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'error'
  | 'needs_reauthorization'
  | 'not_configured'
  | 'disabled';

export type MetricUnit = 'count' | 'percent' | 'seconds' | 'position' | 'ratio';

export type MetricComparison = {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  deltaPercent: number | null;
  unit: MetricUnit;
  source: AnalyticsProvider | 'internal';
  definition: string;
  precision: string;
  available: boolean;
  unavailableReason?: string;
};

export type SeriesPoint = {
  date: string;
  value: number;
};

export type BreakdownRow = {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  deltaPercent: number | null;
  share: number | null;
  extra?: Record<string, number | string | null>;
};

export type ProviderHealth = {
  provider: AnalyticsProvider;
  label: string;
  status: AnalyticsConnectionStatus;
  configured: boolean;
  connected: boolean;
  externalId: string | null;
  accountLabel: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastSyncStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  dataFrom: string | null;
  dataTo: string | null;
  actionRequired: string | null;
};

export type SyncRunRow = {
  id: string;
  provider: AnalyticsProvider;
  mode: 'manual' | 'incremental' | 'backfill' | 'repair';
  status: 'running' | 'completed' | 'partial' | 'failed' | 'skipped';
  rangeStart: string | null;
  rangeEnd: string | null;
  rowsWritten: number;
  snapshotRows: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type AnalyticsPeriod = {
  key: string;
  label: string;
  timezone: string;
  start: string; // inclusive YYYY-MM-DD
  end: string; // inclusive YYYY-MM-DD
  previousStart: string;
  previousEnd: string;
  previousLabel: string;
  comparisonRequested: boolean;
};

export type Ga4Snapshot = {
  available: boolean;
  totals: Record<string, MetricComparison>;
  series: Array<{
    date: string;
    sessions: number;
    activeUsers: number;
    newUsers: number;
    screenPageViews: number;
  }>;
  channels: BreakdownRow[];
  sources: BreakdownRow[];
  landingPages: BreakdownRow[];
  pages: BreakdownRow[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
  events: BreakdownRow[];
  limitations: string[];
};

export type SearchConsoleSnapshot = {
  available: boolean;
  totals: Record<string, MetricComparison>;
  series: Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
  }>;
  queries: BreakdownRow[];
  pages: BreakdownRow[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
  lowCtrPages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  lowCtrQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  risingQueries: BreakdownRow[];
  decliningQueries: BreakdownRow[];
  lostPages: BreakdownRow[];
  limitations: string[];
};

export type UmamiSnapshot = {
  available: boolean;
  totals: Record<string, MetricComparison>;
  series: SeriesPoint[];
  pages: BreakdownRow[];
  referrers: BreakdownRow[];
  limitations: string[];
};

export type ContentMatch = {
  path: string;
  type: 'article' | 'letter' | 'item' | 'project' | 'page' | 'unknown';
  slug: string | null;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  brainDocumentId: string | null;
};

export type ProjectPerformance = {
  key: string;
  name: string;
  path: string;
  sessions: number | null;
  activeUsers: number | null;
  pageViews: number | null;
  searchClicks: number | null;
  searchImpressions: number | null;
  internalConversations: number | null;
  confirmedSubscriptions: number | null;
  confirmedDonations: number | null;
  revenueMinor: number | null;
  currency: string | null;
  facts: string[];
  interpretation: string[];
  hypothesis: string[];
  recommendations: string[];
  attribution: 'unknown' | 'confirmed';
};

export type FunnelStage = {
  key: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  source: AnalyticsProvider | 'internal';
  definition: string;
  note: string | null;
};

export type InternalSnapshot = {
  available: boolean;
  confirmedSubscriptions: number | null;
  previousConfirmedSubscriptions: number | null;
  confirmedSubscriptionsByStartPage: BreakdownRow[];
  subscriptionEvents: BreakdownRow[];
  donations: {
    count: number | null;
    amountMinor: number | null;
    currency: string | null;
    byOffer: BreakdownRow[];
    available: boolean;
  };
  purchases: {
    count: number | null;
    available: boolean;
  };
  conversations: {
    total: number | null;
    previousTotal: number | null;
    byStartPage: BreakdownRow[];
    byReferrer: BreakdownRow[];
  };
  events: BreakdownRow[];
  content: {
    articlesTotal: number | null;
    lettersTotal: number | null;
    itemsPublished: number | null;
    knowledgeDocuments: number | null;
    mediaRecords: number | null;
  };
  limitations: string[];
};

export type AnalyticsDataset = {
  period: AnalyticsPeriod;
  generatedAt: string;
  sources: ProviderHealth[];
  ga4: Ga4Snapshot;
  gsc: SearchConsoleSnapshot;
  umami: UmamiSnapshot;
  internal: InternalSnapshot;
  projects: ProjectPerformance[];
  contentMatches: ContentMatch[];
};

export type WebsiteQuestionScope =
  | 'overview'
  | 'traffic'
  | 'search'
  | 'pages'
  | 'compare'
  | 'projects'
  | 'funnel'
  | 'opportunities'
  | 'anomalies'
  | 'health'
  | 'evidence';

export type WebsiteQuestion = {
  website: true;
  scope: WebsiteQuestionScope;
  wantsComparison: boolean;
  wantsProblems: boolean;
  wantsRecommendations: boolean;
  project: string | null;
  periodKey:
    | 'last_7_days'
    | 'previous_7_days'
    | 'last_30_days'
    | 'current_month'
    | 'previous_month'
    | 'custom';
  customPeriod?: { start: string; end: string };
};

export type EvidenceSection = {
  verifiedFacts: string[];
  interpretation: string[];
  hypotheses: string[];
  recommendations: string[];
  limitations: string[];
};

export type AnalyticsReport = {
  scope: WebsiteQuestionScope;
  period: AnalyticsPeriod;
  markdown: string;
  evidence: EvidenceSection;
  dataset: AnalyticsDataset;
};

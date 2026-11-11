/**
 * Website intelligence · shared vocabulary.
 *
 * The types deliberately keep source identity on every value. A GA4 session,
 * an Umami visitor and a confirmed subscriber are different measurements and
 * are never merged into one anonymous "visitor" number.
 */

export type AnalyticsProvider = 'google_analytics' | 'search_console' | 'umami' | 'bluesky';
export type AnalyticsLanguage = 'ru' | 'en';

export type AnalyticsConnectionStatus =
  'not_connected' | 'connected' | 'error' | 'needs_reauthorization' | 'not_configured' | 'disabled';

export type SourceDataState =
  | 'complete'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'not_configured';

export type SourceFreshness = 'fresh' | 'delayed' | 'stale' | 'unknown';

export type SourceCoverage = {
  provider: AnalyticsProvider | 'internal';
  requestedStart: string;
  requestedEnd: string;
  /** Last calendar day for which this provider is expected to have data. */
  expectedEnd: string;
  actualDataFrom: string | null;
  actualDataTo: string | null;
  coveredDays: number;
  expectedDays: number;
  /** 0..1; coveredDays / expectedDays. Null when no expected days exist. */
  completeness: number | null;
  lastSyncAt: string | null;
  /** Days between the latest available data and the requested end. */
  dataLagDays: number | null;
  reportingDelayDays: number;
  freshness: SourceFreshness;
  state: SourceDataState;
  note: string | null;
};

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
  scopes: string[];
  externalMeta: Record<string, unknown> | null;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastSyncStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  dataFrom: string | null;
  dataTo: string | null;
  actionRequired: string | null;
  /** Period-specific completeness, separate from OAuth connectivity. */
  coverage: SourceCoverage | null;
  dataState: SourceDataState;
  freshness: SourceFreshness;
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
  traffic: {
    publicPageViews: number;
    ownerAdminPageViews: number;
    automatedPageViews: number;
    /** Null means GA4 did not expose a public landing-page breakdown. */
    publicLandingSessions: number | null;
    ownerAdminLandingSessions: number | null;
    automatedLandingSessions: number | null;
    excludedPaths: string[];
    note: string;
  };
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
  channels?: string[];
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
  newsletter: {
    available: boolean;
    subscribers: {
      total: number | null;
      active: number | null;
      unsubscribed: number | null;
      ru: number | null;
      en: number | null;
    };
    jobs: {
      total: number | null;
      sent: number | null;
      failed: number | null;
      emailsSent: number | null;
      emailsFailed: number | null;
    };
    byLanguage: BreakdownRow[];
    recentIssues: Array<{
      id: string;
      title: string;
      language: string | null;
      status: string | null;
      sentAt: string | null;
      sentCount: number | null;
      failedCount: number | null;
    }>;
    limitations: string[];
  };
  content: {
    articlesTotal: number | null;
    lettersTotal: number | null;
    itemsPublished: number | null;
    knowledgeDocuments: number | null;
    mediaRecords: number | null;
  };
  limitations: string[];
  /** Raw rows read from the database, before grouping for display. */
  raw: {
    confirmedSubscriptions: number;
    subscriptionEvents: number;
    donations: number;
    purchases: number;
    conversations: number;
    events: number;
    newsletterJobs: number;
    newsletterLogs: number;
  };
  /** Explicit query failures; never silently interpreted as zero activity. */
  dataGaps: string[];
  coverage: SourceCoverage;
  previousCoverage: SourceCoverage;
};

export type BlueskyPostMetrics = {
  uri: string;
  kind: 'post' | 'reply' | 'repost' | 'unknown';
  authorship: 'owner' | 'other' | 'unknown';
  text: string;
  createdAt: string | null;
  /** Latest stored observation of the counters. */
  observedAt: string | null;
  url: string | null;
  /** Flow item this post links to, resolved through items.bluesky_uri. */
  flowItemId: string | null;
  flowUrl: string | null;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  links: number;
  siteLinks: number;
  engagement: number;
};

export type BlueskyPeriodActivity = {
  start: string;
  end: string;
  label: string;
  timezone: string;
  /** Posts whose own creation date falls inside the selected period. */
  posts: BlueskyPostMetrics[];
  totals: {
    posts: number;
    likes: number;
    reposts: number;
    replies: number;
    quotes: number;
    engagement: number;
  };
  previousPosts: number;
  /** True when the stored archive covers the whole selected period. */
  coverageComplete: boolean;
  coverageEndsAt: string | null;
  limitation: string;
};

export type BlueskySnapshot = {
  available: boolean;
  /** Current/lifetime profile counters. Never selected-period activity. */
  profile: {
    handle: string | null;
    displayName: string | null;
    did: string | null;
    followers: number | null;
    follows: number | null;
    posts: number | null;
    capturedAt: string | null;
  };
  /**
   * Lifetime profile counters plus current observed counters across the whole
   * archived post sample. `totals.likes` etc are NOT selected-period values;
   * use `period.totals` for the reporting window.
   */
  totals: Record<string, MetricComparison>;
  /** All archived posts with their latest observed counters. */
  posts: BlueskyPostMetrics[];
  topPosts: BlueskyPostMetrics[];
  siteLinkedPosts: BlueskyPostMetrics[];
  period: BlueskyPeriodActivity;
  archive: {
    total: number;
    coverageFrom: string | null;
    coverageTo: string | null;
    lastSyncedAt: string | null;
    truncated: boolean | null;
  };
  limitations: string[];
};

export type AnalyticsDataset = {
  period: AnalyticsPeriod;
  generatedAt: string;
  sources: ProviderHealth[];
  /** Requested-period coverage for every external and internal source. */
  coverage: SourceCoverage[];
  /** Coverage of the previous window, used to gate comparisons. */
  previousCoverage: SourceCoverage[];
  /** Explicit retrieval failures; missing data is not zero activity. */
  dataGaps: string[];
  ga4: Ga4Snapshot;
  gsc: SearchConsoleSnapshot;
  umami: UmamiSnapshot;
  bluesky: BlueskySnapshot;
  internal: InternalSnapshot;
  projects: ProjectPerformance[];
  contentMatches: ContentMatch[];
};

export type WebsiteQuestionScope =
  | 'overview'
  | 'traffic'
  | 'search'
  | 'pages'
  | 'page'
  | 'compare'
  | 'projects'
  | 'funnel'
  | 'opportunities'
  | 'anomalies'
  | 'health'
  | 'evidence'
  | 'bluesky'
  | 'newsletter';

export type WebsiteQuestion = {
  website: true;
  scope: WebsiteQuestionScope;
  wantsComparison: boolean;
  wantsProblems: boolean;
  wantsRecommendations: boolean;
  wantsDetailed?: boolean;
  /** Explicit "full archive / all posts" request. Default reports stay compact. */
  wantsArchive?: boolean;
  /** Explicit diagram/schema request. */
  wantsDiagram?: boolean;
  project: string | null;
  /** Exact public URL path when the question names one (for example /flow). */
  pagePath?: string | null;
  periodKey:
    | 'today'
    | 'yesterday'
    | 'last_7_days'
    | 'previous_7_days'
    | 'this_week'
    | 'last_week'
    | 'last_30_days'
    | 'current_month'
    | 'previous_month'
    | 'this_year'
    | 'previous_year'
    | 'all_time'
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
  /** The exact question that produced this report, including pagePath. */
  question: WebsiteQuestion;
  period: AnalyticsPeriod;
  markdown: string;
  evidence: EvidenceSection;
  dataset: AnalyticsDataset;
};

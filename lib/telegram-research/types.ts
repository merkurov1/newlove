/**
 * Shared types for the local Telegram Research module.
 *
 * The module deliberately has no runtime dependency on Next.js, Supabase or
 * Telegram credentials. It works on a normalized local corpus produced by
 * scripts/telegram-research and keeps the raw `tg` responses next to it.
 */

export const TELEGRAM_RESEARCH_SCHEMA_VERSION = 1 as const;

/** Canonical timezone for stored timestamps. All ISO dates are UTC. */
export const STORAGE_TIMEZONE = 'UTC' as const;

export interface ChatIdentity {
  id: number;
  type: string;
  title: string;
  username: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isBot?: boolean;
  isPremium?: boolean;
  isContact?: boolean;
  lastMessageAt?: number | null;
  source: 'api' | 'cache' | 'unknown';
  fetchedAt: string;
}

export interface DiscoveryRecord {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  handle: string;
  chat: ChatIdentity;
  self: {
    id: number;
    username: string | null;
    displayName: string | null;
  } | null;
  discoveredAt: string;
  confirmationRequired: true;
}

export interface ApprovalRecord {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  handle: string;
  confirmedBy: string;
  confirmedAt: string;
  chat: ChatIdentity;
}

export interface SenderInfo {
  id: number | null;
  username: string | null;
  displayName: string | null;
  isSelf: boolean;
}

export interface MediaMetadata {
  kind: string;
  caption: string | null;
  photoId?: string;
  documentId?: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  webpage?: {
    url?: string;
    displayUrl?: string;
    title?: string;
    description?: string;
    siteName?: string;
    type?: string;
  };
  poll?: {
    id?: string;
    question?: string;
    closed?: boolean;
    multipleChoice?: boolean;
    quiz?: boolean;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
    accuracyRadius?: number;
  };
  sticker?: {
    emoji?: string;
    setName?: string;
  };
  voice?: boolean;
  round?: boolean;
}

export interface ReplyMetadata {
  toMessageId: number | null;
  threadId: number | null;
  quote?: string | null;
}

export interface ForwardMetadata {
  fromId: number | null;
  fromName: string | null;
  fromUsername: string | null;
  date: string | null;
  channelPostId: number | null;
  postAuthor: string | null;
  savedFromId: number | null;
  savedFromMessageId: number | null;
}

/**
 * One message of the normalized corpus. Text is never dropped: an empty
 * string, a media caption and `null` (no text at all) have different
 * meanings and are preserved as they are.
 */
export interface NormalizedMessage {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  id: number;
  chatId: number;
  /** ISO-8601 in UTC, from Telegram's Unix timestamp. */
  date: string;
  /** Telegram's original timestamp, in seconds since the Unix epoch. */
  dateUnix: number;
  /** Same instant in milliseconds, for sorting and interval maths. */
  dateMs: number;
  sender: SenderInfo;
  /** Text or media caption. `null` means the message had no text. */
  text: string | null;
  /** True when `text` is a caption attached to media. */
  isCaption: boolean;
  textLength: number;
  wordCount: number;
  links: string[];
  media: MediaMetadata | null;
  hasMedia: boolean;
  reply: ReplyMetadata | null;
  forward: ForwardMetadata | null;
  isOutgoing: boolean;
  isService: boolean;
  isEdited: boolean;
  editDate: string | null;
  editUnix: number | null;
  isDeleted: boolean;
  rawKind: string | null;
  /** Raw page that first supplied this message. */
  sourcePage: number | null;
}

export interface RawPageRecord {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  phase: 'backward' | 'head';
  page: number;
  requestedOffsetId: number;
  requestedLimit: number;
  receivedAt: string;
  attempts: number;
  response: unknown;
}

export interface ExportErrorRecord {
  at: string;
  phase: 'backward' | 'head';
  page: number;
  attempt: number;
  code: string | null;
  message: string;
  waitSeconds: number | null;
  resolved: boolean;
}

export interface ExportCheckpoint {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  status: 'running' | 'interrupted' | 'complete' | 'partial' | 'failed';
  chat: ChatIdentity;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  strategy: 'messages.list+raw_json' | 'messages.getHistory';
  pageSize: number;
  pagesCompleted: number;
  headPagesCompleted: number;
  nextOffsetId: number | null;
  reachedStart: boolean;
  headStable: boolean;
  messageCount: number;
  duplicateCount: number;
  messageEmptyCount: number;
  minMessageId: number | null;
  maxMessageId: number | null;
  apiCalls: number;
  retries: number;
  emptyPages: number;
  errors: ExportErrorRecord[];
  limits: {
    maxPages: number;
    maxMessages: number;
    maxRetries: number;
  };
}

export interface ManifestCounts {
  total: number;
  withText: number;
  withoutText: number;
  mediaOnly: number;
  media: number;
  service: number;
  edited: number;
  deleted: number;
  forwarded: number;
  replies: number;
  outgoing: number;
  participants: number;
}

export interface Manifest {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  chat: ChatIdentity;
  export: {
    startedAt: string;
    finishedAt: string;
    strategy: 'messages.list+raw_json' | 'messages.getHistory';
    pageSize: number;
    pages: number;
    headPages: number;
    apiCalls: number;
    retries: number;
    emptyPages: number;
    duplicatesDropped: number;
    messageEmptyRecords: number;
    reachedStart: boolean;
    headStable: boolean;
    sourceTimezone: 'UTC';
  };
  corpus: {
    file: 'corpus.jsonl';
    messageCount: number;
    firstMessage: {
      id: number;
      date: string;
    } | null;
    lastMessage: {
      id: number;
      date: string;
    } | null;
    dateRange: {
      from: string;
      to: string;
    } | null;
    sha256: string;
  };
  counts: ManifestCounts;
  completeness: {
    status: 'complete' | 'partial' | 'incomplete';
    reasons: string[];
    gaps: Array<{
      kind: string;
      detail: string;
    }>;
    checks: {
      authWasRequired: boolean;
      reachedEmptyPage: boolean;
      headStable: boolean;
      latestVisibleMessageMatched: boolean | null;
      noUnresolvedErrors: boolean;
      withinLimits: boolean;
      corpusSortedAndUnique: boolean;
    };
    latestVisibleMessage: {
      id: number;
      exportedMaxId: number | null;
      checkedAt: string;
      source: 'tg messages list --fresh' | 'not checked';
    } | null;
  };
  dataQuality: {
    unknownSender: number;
    missingReplyTargets: number;
    forwardsWithoutSource: number;
    emptyTextMessages: number;
    duplicatesInRawPages: number;
    unsupportedMessageKinds: Record<string, number>;
    notes: string[];
  };
  generatedBy: {
    tool: 'telegram-research';
    version: string;
    command: string;
  };
}

export interface AnalysisOptions {
  timezone: string;
  sessionGapSeconds: number;
  longPauseSeconds: number;
  estimateWindowSeconds: number;
  topParticipants: number;
}

export interface Bucket {
  count: number;
  share: number;
}

export interface ParticipantStats {
  id: number | null;
  key: string;
  displayName: string | null;
  username: string | null;
  isSelf: boolean;
  messages: number;
  share: number;
  characters: number;
  words: number;
  links: number;
  media: number;
  repliesSent: number;
  directRepliesSent: number;
  estimatedRepliesSent: number;
  sessionsStarted: number;
  longPauseResumes: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  medianCharacters: number;
  medianWords: number;
  medianDirectReplySeconds: number | null;
  medianEstimatedReplySeconds: number | null;
}

export interface DistributionSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
  p99: number;
}

export interface HistogramBucket {
  from: number;
  to: number | null;
  count: number;
}

export interface LengthStats {
  characters: DistributionSummary;
  words: DistributionSummary;
  linksPerMessage: DistributionSummary;
  characterHistogram: HistogramBucket[];
  wordHistogram: HistogramBucket[];
  linkHistogram: HistogramBucket[];
  messagesWithLinks: number;
  totalLinks: number;
}

export interface ReplyStats {
  replyLinksAvailable: boolean;
  messagesWithReplyField: number;
  messagesWithResolvableReply: number;
  replyCoverage: number;
  resolvableReplyCoverage: number;
  crossParticipantReplies: number;
  directReplies: {
    count: number;
    seconds: DistributionSummary | null;
    byParticipant: Record<string, { count: number; medianSeconds: number }>;
  };
  estimatedReplies: {
    count: number;
    seconds: DistributionSummary | null;
    byParticipant: Record<string, { count: number; medianSeconds: number }>;
    method: string;
  };
  adjacencyMatrix: Record<string, Record<string, number>>;
}

export interface SessionSummary {
  index: number;
  start: string;
  end: string;
  durationSeconds: number;
  gapBeforeSeconds: number | null;
  messageCount: number;
  initiatedBy: string;
  participants: Record<string, number>;
  isLongPauseResume: boolean;
  firstMessageId: number;
  lastMessageId: number;
}

export interface SessionStats {
  thresholdSeconds: number;
  longPauseSeconds: number;
  count: number;
  medianDurationSeconds: number;
  meanDurationSeconds: number;
  medianMessagesPerSession: number;
  startsByParticipant: Record<string, number>;
  longPauseResumesByParticipant: Record<string, number>;
  longPauseGaps: number;
  sessions: SessionSummary[];
}

export interface MonthlyDynamics {
  month: string;
  messages: number;
  byParticipant: Record<string, number>;
  characters: number;
  links: number;
  directReplies: number;
  replyCoverage: number;
  medianDirectReplySeconds: number | null;
  sessions: number;
  startsByParticipant: Record<string, number>;
}

export interface DataQualityReport {
  totalMessages: number;
  totalCharacters: number;
  messagesWithoutText: number;
  messagesWithEmptyString: number;
  mediaOnlyMessages: number;
  serviceMessages: number;
  unknownSenderMessages: number;
  unresolvedReplyTargets: number;
  forwardsWithoutSource: number;
  outOfOrderMessages: number;
  duplicateIds: number;
  messagesOutsideDateRange: number;
  zeroLengthIntervals: number;
}

export interface AnalysisReport {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  generatedAt: string;
  source: {
    chat: ChatIdentity;
    corpusFile: string;
    corpusSha256: string | null;
    manifestCompleteness: Manifest['completeness']['status'] | 'unknown';
    messageCount: number;
    firstMessageAt: string | null;
    lastMessageAt: string | null;
  };
  options: AnalysisOptions;
  participants: ParticipantStats[];
  activity: {
    byYear: Record<string, { total: number; byParticipant: Record<string, number> }>;
    byMonth: Record<string, { total: number; byParticipant: Record<string, number> }>;
    byWeekday: {
      key: string;
      label: string;
      total: number;
      byParticipant: Record<string, number>;
    }[];
    byHour: { hour: number; total: number; byParticipant: Record<string, number> }[];
  };
  lengths: LengthStats;
  responses: ReplyStats;
  sessions: SessionStats;
  dynamics: {
    byMonth: MonthlyDynamics[];
  };
  dataQuality: DataQualityReport;
  methodology: {
    timezone: string;
    timestamps: string;
    directReplies: string;
    estimatedReplies: string;
    sessions: string;
    longPauses: string;
    participantIdentity: string;
    limitations: string[];
  };
}

export interface DeepSeekChunk {
  index: number;
  id: string;
  fromMessageId: number;
  toMessageId: number;
  dateFrom: string;
  dateTo: string;
  targetMessageIds: number[];
  contextMessageIds: number[];
  text: string;
  approximateCharacters: number;
}

export type DeepSeekStage = 'events' | 'topics' | 'synthesis';

export interface DeepSeekProgressEntry {
  stage: DeepSeekStage;
  chunkIndex: number | null;
  status: 'pending' | 'running' | 'complete' | 'failed';
  attempts: number;
  updatedAt: string;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  resultFile: string | null;
}

export interface DeepSeekProgress {
  schemaVersion: typeof TELEGRAM_RESEARCH_SCHEMA_VERSION;
  chatId: number;
  model: string;
  createdAt: string;
  updatedAt: string;
  status: 'planned' | 'running' | 'complete' | 'partial' | 'failed';
  chunks: DeepSeekChunk[];
  entries: DeepSeekProgressEntry[];
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    budgetUsd: number;
    maxRequests: number;
  };
}

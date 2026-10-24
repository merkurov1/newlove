export type ParticipantKey = 'self' | 'peer';

export interface PublicDistribution {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
  p99: number;
}

export interface PublicParticipant {
  key: ParticipantKey;
  displayName: string;
  username: string;
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
  medianCharacters: number;
  medianWords: number;
  medianDirectReplySeconds: number | null;
  medianEstimatedReplySeconds: number | null;
  firstMessageAt: string;
  lastMessageAt: string;
}

export interface PublicActivityBucket {
  total: number;
  self: number;
  peer: number;
}

export interface PublicMonth extends PublicActivityBucket {
  month: string;
}

export interface PublicYear extends PublicActivityBucket {
  year: string;
}

export interface PublicWeekday extends PublicActivityBucket {
  key: string;
  label: string;
}

export interface PublicHour extends PublicActivityBucket {
  hour: number;
}

export interface PublicTimelineItem {
  date: string | null;
  summary: string;
  confidence: number;
  sourceCount: number;
}

export interface PublicEditorialEvent extends PublicTimelineItem {
  type: string;
  deadline: {
    date: string | null;
    kind: string;
    confidence: number;
  } | null;
  status: string;
  participants: string[];
}

export interface PublicTheme {
  label: string;
  summary: string;
  confidence: number;
  sourceCount: number;
}

export interface PublicObservation {
  kind: 'observable' | 'interpretation';
  observation: string;
  confidence: number;
  sourceCount: number;
  alternativeInterpretations: string[];
}

export interface PublicDeepSeek {
  model: string;
  status: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  summary: string;
  timeline: PublicTimelineItem[];
  editorialEvents: PublicEditorialEvent[];
  recurringThemes: PublicTheme[];
  openQuestions: string[];
  linguisticObservations: PublicObservation[];
  limitations: string[];
  disclaimer: string;
}

export interface PublicTelegramCase {
  schemaVersion: number;
  slug: string;
  generatedAt: string;
  privacy: {
    containsRawMessages: boolean;
    note: string;
  };
  chat: {
    title: string;
    username: string;
    type: string;
  };
  period: {
    from: string;
    to: string;
  };
  totals: {
    messages: number;
    withText: number;
    withoutText: number;
    media: number;
    service: number;
    edited: number;
    forwarded: number;
    replies: number;
    outgoing: number;
    participants: number;
  };
  participants: PublicParticipant[];
  activity: {
    byYear: PublicYear[];
    byMonth: PublicMonth[];
    byWeekday: PublicWeekday[];
    byHour: PublicHour[];
  };
  lengths: {
    characters: PublicDistribution;
    words: PublicDistribution;
    linksPerMessage: PublicDistribution;
    messagesWithLinks: number;
    totalLinks: number;
  };
  responses: {
    replyLinksAvailable: boolean;
    replyCoverage: number;
    crossParticipantReplies: number;
    direct: {
      count: number;
      medianSeconds: number | null;
      meanSeconds: number | null;
      p90Seconds: number | null;
      byParticipant: Record<ParticipantKey, number>;
    };
    estimated: {
      count: number;
      medianSeconds: number | null;
      meanSeconds: number | null;
      byParticipant: Record<ParticipantKey, number>;
      method: string;
    };
  };
  sessions: {
    thresholdSeconds: number;
    longPauseSeconds: number;
    count: number;
    medianDurationSeconds: number;
    meanDurationSeconds: number;
    medianMessagesPerSession: number;
    starts: Record<ParticipantKey, number>;
    longPauseGaps: number;
    longPauseResumes: Record<ParticipantKey, number>;
    longest: {
      start: string;
      end: string;
      durationSeconds: number;
      messageCount: number;
      initiatedBy: ParticipantKey | null;
    } | null;
  };
  dataQuality: Record<string, number>;
  methodology: {
    timezone?: string;
    timestamps?: string;
    directReplies?: string;
    estimatedReplies?: string;
    sessions?: string;
    longPauses?: string;
    participantIdentity?: string;
    limitations?: string[];
    [key: string]: unknown;
  };
  completeness: {
    status: string;
    checks: Record<string, boolean>;
    reasons: unknown[];
    gaps: unknown[];
  };
  export: {
    strategy: string;
    pages: number;
    headPages: number;
    duplicatesDropped: number;
    retries: number;
    apiCalls: number;
    sourceTimezone: string;
  };
  deepseek: PublicDeepSeek | null;
}

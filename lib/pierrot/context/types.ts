/**
 * Client-safe contracts for the Pierrot context engine.
 *
 * The context engine is an orchestration layer over the existing stores
 * (conversations, project workspaces, owner memory, Brain and the knowledge
 * graph). It does not duplicate those stores and it never rewrites original
 * messages. These types only describe retrieval results and evidence.
 */

export type ContextIntentName =
  | 'PROJECT_HISTORY'
  | 'PROJECT_STATUS'
  | 'DAILY_SUMMARY'
  | 'CONVERSATION_SEARCH'
  | 'ACHIEVEMENT_LOG'
  | 'ENTITY_DISTINCTION'
  | 'DOCUMENT_SEARCH'
  | 'GENERAL_QUESTION';

export const CONTEXT_INTENTS: ContextIntentName[] = [
  'PROJECT_HISTORY',
  'PROJECT_STATUS',
  'DAILY_SUMMARY',
  'CONVERSATION_SEARCH',
  'ACHIEVEMENT_LOG',
  'ENTITY_DISTINCTION',
  'DOCUMENT_SEARCH',
  'GENERAL_QUESTION',
];

/**
 * Evidence classes are deliberately not interchangeable. A completed task
 * confirmed by the owner is stronger than a sentence where the owner described
 * an intention.
 */
export type EvidenceClass =
  | 'MEASURED'
  | 'USER_CONFIRMED'
  | 'DIRECTLY_OBSERVED'
  | 'DOCUMENTED'
  | 'INFERRED'
  | 'UNKNOWN';

export type RetrievalMethod =
  | 'exact_phrase'
  | 'keyword'
  | 'semantic'
  | 'hybrid'
  | 'chronological'
  | 'project_scope'
  | 'entity';

export type ContextSourceType =
  | 'message'
  | 'project'
  | 'project_event'
  | 'task'
  | 'decision'
  | 'deliverable'
  | 'artifact'
  | 'document'
  | 'document_chunk'
  | 'entity'
  | 'external';

export type ContextPeriodKey =
  | 'today'
  | 'yesterday'
  | 'custom'
  | 'last_n_days'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'all';

export type ContextPeriod = {
  key: ContextPeriodKey;
  /** Inclusive UTC instant. */
  from: string;
  /** Exclusive UTC instant. */
  to: string;
  /** Human-readable label in the owner's language. */
  label: string;
};

export type ContextQueryPlan = {
  intent: ContextIntentName;
  originalQuery: string;
  /** Query with command/time filler removed; safe for keyword retrieval. */
  query: string;
  confidence: number;
  signals: string[];
  period: ContextPeriod | null;
  timezone: string;
  timezoneKnown: boolean;
  projectHint: string | null;
  entityTypeHint: string | null;
  wantsOriginalSource: boolean;
  explicit: boolean;
};

export type ContextHit = {
  id: string;
  sourceType: ContextSourceType;
  sourceId: string;
  conversationId: string | null;
  messageId: string | null;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  entityId: string | null;
  title: string;
  excerpt: string;
  /** When the event actually happened. */
  eventAt: string | null;
  /** When the system stored the record. */
  ingestedAt: string | null;
  retrievalMethod: RetrievalMethod;
  confidence: number;
  evidenceClass: EvidenceClass;
  href: string | null;
  metadata: Record<string, unknown>;
};

export type ContextDocumentBlock = {
  documentId: string;
  title: string;
  sourceType: string;
  sectionCount: number;
  headings: string[];
  truncated: boolean;
};

export type TimelineEvent = {
  id: string;
  type:
    | 'message'
    | 'decision'
    | 'task'
    | 'deliverable'
    | 'artifact'
    | 'document'
    | 'project_event'
    | 'status_change';
  title: string;
  description: string;
  occurredAt: string;
  recordedAt: string;
  evidenceClass: EvidenceClass;
  projectId: string | null;
  entityId: string | null;
  conversationId: string | null;
  messageId: string | null;
  category: ActivityCategory;
  status: string | null;
  intention: boolean;
  completed: boolean;
  href: string | null;
  metadata: Record<string, unknown>;
};

export type ActivityCategory =
  | 'CREATIVE_WORK'
  | 'WRITING'
  | 'ART'
  | 'PROJECT_DEVELOPMENT'
  | 'TECHNICAL_WORK'
  | 'PUBLISHING'
  | 'COMMUNICATION'
  | 'ADMINISTRATION'
  | 'PERSONAL_ACTIVITY';

export type DailyDigest = {
  timezone: string;
  period: ContextPeriod | null;
  completed: TimelineEvent[];
  decisions: TimelineEvent[];
  deliverables: TimelineEvent[];
  intentions: TimelineEvent[];
  discussions: TimelineEvent[];
  gaps: string[];
};

export type ProjectWorkstream = {
  id: string;
  entityType: string;
  name: string;
  status: 'PROPOSED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
  openTasks: number;
  completedTasks: number;
  deliverables: number;
  notes: string[];
  evidenceIds: string[];
};

export type ProjectState = {
  projectId: string;
  projectName: string;
  status: 'PROPOSED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
  statusReason: string;
  workstreams: ProjectWorkstream[];
  completed: TimelineEvent[];
  remaining: TimelineEvent[];
  blocked: TimelineEvent[];
  decisions: TimelineEvent[];
  deliverables: TimelineEvent[];
  gaps: string[];
};

export type EntityCandidate = {
  id: string;
  entityType: string;
  name: string;
  description: string;
  projectId: string | null;
  status: string;
  score: number;
  aliases: string[];
};

export type ContextAmbiguity = {
  name: string;
  reason: 'MULTIPLE_TYPES' | 'MULTIPLE_ENTITIES';
  candidates: EntityCandidate[];
  hint: string | null;
};

export type ContextCounts = {
  messages: number;
  conversations: number;
  projects: number;
  tasks: number;
  decisions: number;
  documents: number;
  projectEvents: number;
  entities: number;
};

export type ContextQueryResult = {
  plan: ContextQueryPlan;
  hits: ContextHit[];
  documents: ContextDocumentBlock[];
  timeline: TimelineEvent[];
  daily: DailyDigest | null;
  projectState: ProjectState | null;
  ambiguities: ContextAmbiguity[];
  notes: string[];
  gaps: string[];
  counts: ContextCounts;
  /** True when a project-scoped search was widened to every conversation. */
  widenedFromProject: boolean;
};

/**
 * Client-safe owner-memory contract.
 *
 * These records live in `public.pierrot_decisions`; this module contains no
 * database access and no private prompt text.
 */

export const PIERROT_MEMORY_KINDS = [
  // Owner-memory kinds (introduced by the 2026-11-17 migration).
  'memory',
  'saved',
  'reminder',
  // Decision kinds that already exist in pierrot_decisions and describe
  // durable owner context: positions, constraints, tasks and decisions.
  'decision',
  'position',
  'preference',
  'constraint',
  'task',
  'rejected_recommendation',
] as const;

export type PierrotMemoryKind = (typeof PIERROT_MEMORY_KINDS)[number];

export const PIERROT_MEMORY_STATUSES = [
  'current',
  'completed',
  'archived',
  'superseded',
  'rejected',
  'uncertain',
] as const;

export type PierrotMemoryStatus = (typeof PIERROT_MEMORY_STATUSES)[number];

/** The three primary owner-memory categories shown in the workspace. */
export type PierrotMemoryPrimaryKind = 'memory' | 'saved' | 'reminder';

export type PierrotMemoryIndexStatus = 'pending' | 'ready' | 'failed' | 'unavailable';

export type PierrotMemoryRecord = {
  id: string;
  kind: PierrotMemoryKind;
  title: string;
  content: string;
  rationale: string | null;
  status: PierrotMemoryStatus;
  project: string | null;
  tags: string[];
  sourceRefs: unknown[];
  conversationId: string | null;
  messageId: string | null;
  reviewAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 0..1; long-term principles are kept in the permanent core. */
  importance: number;
  /** 0..1; an inferred fact is never equal to an explicit owner command. */
  confidence: number;
  validFrom: string | null;
  validUntil: string | null;
  lastReferencedAt: string | null;
  archivedReason: string | null;
  supersededBy: string | null;
  /** Present when the embedding index state was read for this record. */
  indexingStatus?: PierrotMemoryIndexStatus;
  /** True when a write was recognised as an existing record, not a new one. */
  deduplicated?: boolean;
};

export type PierrotMemoryCounts = {
  memory: number;
  saved: number;
  reminder: number;
};

export type PierrotMemorySummary = {
  counts: PierrotMemoryCounts;
  reminders: PierrotMemoryRecord[];
  available: boolean;
  /** Active decisions/tasks that are not one of the three UI categories. */
  decisions?: number;
  tasks?: number;
  activeTotal?: number;
  archivedTotal?: number;
  uncertainTotal?: number;
  indexingPending?: number;
  indexingFailed?: number;
};

export type PierrotMemoryWriteInput = {
  kind: PierrotMemoryKind;
  title?: string;
  content: string;
  rationale?: string | null;
  project?: string | null;
  tags?: string[];
  conversationId?: string | null;
  messageId?: string | null;
  reviewAt?: string | null;
  validUntil?: string | null;
  importance?: number;
  confidence?: number;
  status?: PierrotMemoryStatus;
  sourceRefs?: Array<Record<string, unknown>>;
  /**
   * Set by the command parser when the owner used replacement language
   * (“вместо”, “больше не”, “instead”). The store links the old record instead
   * of silently overwriting it.
   */
  possibleConflict?: boolean;
  /** Skip the synchronous embedding call (bulk imports/tests). */
  skipEmbedding?: boolean;
};

export type PierrotMemorySearchOptions = {
  userId: string;
  query: string;
  kinds?: PierrotMemoryKind[];
  statuses?: PierrotMemoryStatus[];
  project?: string | null;
  tags?: string[];
  /** Default false: active memory first, archive only when requested/needed. */
  includeArchive?: boolean;
  /** Force archive/history search regardless of active matches. */
  historyOnly?: boolean;
  limit?: number;
  minSimilarity?: number;
  /** Skip semantic embedding (lexical-only callers/tests). */
  lexicalOnly?: boolean;
  /** Reuse a query embedding produced by another retrieval branch. */
  queryEmbedding?: number[];
  embeddingClient?: import('./embeddingTypes').MemoryEmbeddingClient | null;
};

export type PierrotMemorySearchResult = {
  records: PierrotMemoryRecord[];
  semanticUsed: boolean;
  archiveSearched: boolean;
  /** Why semantic search was not used, when applicable. */
  semanticUnavailableReason?: string;
  /** True when the lexical fallback supplied the results. */
  lexicalFallback: boolean;
};

export type StewardCandidateType =
  'duplicate' | 'stale' | 'completed' | 'contradiction' | 'superseded' | 'missing_embedding';

export type StewardAction =
  'archive' | 'mark_completed' | 'mark_uncertain' | 'link_previous' | 'index' | 'review';

export type StewardCandidate = {
  type: StewardCandidateType;
  action: StewardAction;
  recordIds: string[];
  title: string;
  reason: string;
  confidence: number;
  safeToApply: boolean;
};

export type StewardReport = {
  available: boolean;
  scanned: number;
  candidates: StewardCandidate[];
  applied: Array<{ type: StewardCandidateType; recordIds: string[]; action: StewardAction }>;
  needsReview: number;
  generatedAt: string;
  reason?: string;
};

export function memoryKindLabel(kind: PierrotMemoryKind): string {
  switch (kind) {
    case 'memory':
      return 'Запомнено';
    case 'saved':
      return 'Сохранено';
    case 'reminder':
      return 'Напоминание';
    case 'decision':
      return 'Решение';
    case 'position':
      return 'Позиция';
    case 'preference':
      return 'Предпочтение';
    case 'constraint':
      return 'Ограничение';
    case 'task':
      return 'Задача';
    case 'rejected_recommendation':
      return 'Отклонено';
    default:
      return kind;
  }
}

export function memoryStatusLabel(status: PierrotMemoryStatus): string {
  if (status === 'current') return 'активно';
  if (status === 'completed') return 'завершено';
  if (status === 'archived') return 'в архиве';
  if (status === 'superseded') return 'заменено';
  if (status === 'rejected') return 'отклонено';
  return 'под вопросом';
}

export function isPierrotMemoryKind(value: unknown): value is PierrotMemoryKind {
  return typeof value === 'string' && (PIERROT_MEMORY_KINDS as readonly string[]).includes(value);
}

export function isPierrotMemoryStatus(value: unknown): value is PierrotMemoryStatus {
  return (
    typeof value === 'string' && (PIERROT_MEMORY_STATUSES as readonly string[]).includes(value)
  );
}

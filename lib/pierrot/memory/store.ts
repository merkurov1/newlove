import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PIERROT_MEMORY_KINDS,
  PIERROT_MEMORY_STATUSES,
  isPierrotMemoryKind,
  isPierrotMemoryStatus,
  type PierrotMemoryKind,
  type PierrotMemoryRecord,
  type PierrotMemorySearchOptions,
  type PierrotMemorySearchResult,
  type PierrotMemoryStatus,
  type PierrotMemorySummary,
  type PierrotMemoryWriteInput,
} from './types';
import {
  deleteMemoryEmbedding,
  indexMemoryEmbedding,
  isMemorySearchRpcKnownMissing,
  loadEmbeddingStates,
  markMemoryEmbeddingPending,
  memoryContentHash,
  readMemoryEmbeddingCounts,
  resolveMemoryEmbeddingClient,
  searchMemoryEmbeddings,
} from './embeddings';
import { invalidateBrainStatus } from './brainCache';
import { bestMatch, isRefinementOf, lexicalSimilarity, tokenize } from './similarity';
import type { MemoryEmbeddingClient } from './embeddingTypes';

assertServerOnly('lib/pierrot/memory/store');

const MEMORY_KINDS: PierrotMemoryKind[] = [...PIERROT_MEMORY_KINDS];
const MEMORY_STATUSES: PierrotMemoryStatus[] = [...PIERROT_MEMORY_STATUSES];
const ACTIVE_STATUSES: PierrotMemoryStatus[] = ['current', 'uncertain'];
const ARCHIVE_STATUSES: PierrotMemoryStatus[] = ['completed', 'archived', 'superseded', 'rejected'];
const OPTIONAL_COLUMNS = [
  'importance',
  'confidence',
  'valid_from',
  'valid_until',
  'last_referenced_at',
  'archived_reason',
  'superseded_by',
  'owner_rating',
  'owner_rating_updated_at',
];
const MAX_CONTEXT_CHARS = 6_000;

type DecisionRow = Record<string, unknown> & {
  id: string;
  kind: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function defaultImportance(kind: PierrotMemoryKind): number {
  if (kind === 'preference' || kind === 'constraint' || kind === 'position') return 0.85;
  if (kind === 'memory' || kind === 'decision') return 0.75;
  if (kind === 'task' || kind === 'reminder') return 0.6;
  if (kind === 'rejected_recommendation') return 0.55;
  return 0.4;
}

function defaultConfidence(kind: PierrotMemoryKind): number {
  if (kind === 'memory' || kind === 'saved' || kind === 'reminder') return 0.9;
  if (kind === 'preference' || kind === 'constraint' || kind === 'position') return 0.85;
  return 0.7;
}

function toRecord(row: DecisionRow): PierrotMemoryRecord | null {
  if (!isPierrotMemoryKind(row.kind) || !isPierrotMemoryStatus(row.status)) return null;

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const sourceRefs = Array.isArray(row.source_refs) ? row.source_refs : [];

  return {
    id: row.id,
    kind: row.kind,
    title: typeof row.title === 'string' ? row.title : '',
    content: typeof row.content === 'string' ? row.content : '',
    rationale: stringOrNull(row.rationale),
    status: row.status,
    project: stringOrNull(row.project),
    tags,
    sourceRefs,
    conversationId: stringOrNull(row.conversation_id),
    messageId: stringOrNull(row.message_id),
    reviewAt: stringOrNull(row.review_at),
    decidedAt: stringOrNull(row.decided_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    importance: clamp01(row.importance, defaultImportance(row.kind)),
    confidence: clamp01(row.confidence, defaultConfidence(row.kind)),
    ownerRating:
      typeof row.owner_rating === 'number' && row.owner_rating >= 1 && row.owner_rating <= 10
        ? row.owner_rating
        : null,
    ownerRatingUpdatedAt: stringOrNull(row.owner_rating_updated_at),
    validFrom: stringOrNull(row.valid_from),
    validUntil: stringOrNull(row.valid_until),
    lastReferencedAt: stringOrNull(row.last_referenced_at),
    archivedReason: stringOrNull(row.archived_reason),
    supersededBy: stringOrNull(row.superseded_by),
  };
}

function cleanText(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function titleFromContent(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() || content;
  return (first.length > 96 ? `${first.slice(0, 93).trimEnd()}…` : first).slice(0, 200);
}

function isMissingOptionalColumn(
  error: { code?: unknown; message?: unknown } | null | undefined
): boolean {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (code !== '42703' && code !== 'PGRST204') return false;

  return OPTIONAL_COLUMNS.some((column) => message.includes(column));
}

function isConstraintViolation(error: { code?: unknown } | null | undefined): boolean {
  return typeof error?.code === 'string' && error.code === '23514';
}

async function recordDecisionEvent(
  store: SupabaseClient,
  input: {
    decisionId: string;
    userId: string;
    eventType: 'created' | 'updated' | 'status_changed';
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await store.from('pierrot_decision_events').insert({
    decision_id: input.decisionId,
    user_id: input.userId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error('memory_event_write_failed');
  }
}

export type ListMemoryOptions = {
  userId: string;
  kinds?: PierrotMemoryKind[];
  status?: PierrotMemoryStatus | 'active';
  statuses?: PierrotMemoryStatus[];
  includeArchive?: boolean;
  query?: string | null;
  project?: string | null;
  tags?: string[];
  importanceMin?: number;
  limit?: number;
};

export async function listMemoryRecords(
  store: SupabaseClient,
  input: ListMemoryOptions
): Promise<PierrotMemoryRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  let query = store
    .from('pierrot_decisions')
    .select('*')
    .eq('user_id', input.userId)
    .in('kind', input.kinds?.length ? input.kinds : MEMORY_KINDS)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (input.statuses?.length) query = query.in('status', input.statuses);
  else if (input.status === 'active') query = query.eq('status', 'current');
  else if (input.status) query = query.eq('status', input.status);
  else if (input.includeArchive) query = query.in('status', MEMORY_STATUSES);
  else query = query.in('status', ACTIVE_STATUSES);

  if (input.project) query = query.eq('project', input.project);
  if (input.tags?.length) query = query.contains('tags', input.tags);
  if (typeof input.importanceMin === 'number') query = query.gte('importance', input.importanceMin);

  const search = input.query?.trim();
  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((row) => toRecord(row as DecisionRow))
    .filter((row): row is PierrotMemoryRecord => row !== null);
}

export async function listMemoryRecordsByIds(
  store: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<PierrotMemoryRecord[]> {
  if (ids.length === 0) return [];

  const { data, error } = await store
    .from('pierrot_decisions')
    .select('*')
    .eq('user_id', userId)
    .in('id', ids)
    .limit(ids.length);

  if (error) throw error;

  return (data ?? [])
    .map((row) => toRecord(row as DecisionRow))
    .filter((row): row is PierrotMemoryRecord => row !== null);
}

async function countKind(
  store: SupabaseClient,
  userId: string,
  kind: PierrotMemoryKind
): Promise<number> {
  const { count, error } = await store
    .from('pierrot_decisions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('status', 'current');

  if (error) throw error;
  return count ?? 0;
}

async function countStatus(
  store: SupabaseClient,
  userId: string,
  status: PierrotMemoryStatus
): Promise<number> {
  const { count, error } = await store
    .from('pierrot_decisions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', status);

  if (error) throw error;
  return count ?? 0;
}

async function countStatuses(
  store: SupabaseClient,
  userId: string,
  statuses: PierrotMemoryStatus[]
): Promise<number> {
  if (statuses.length === 0) return 0;

  const { count, error } = await store
    .from('pierrot_decisions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', statuses);

  if (error) throw error;
  return count ?? 0;
}

export async function getMemorySummary(
  store: SupabaseClient,
  userId: string
): Promise<PierrotMemorySummary> {
  const [
    memory,
    saved,
    reminder,
    decisions,
    tasks,
    active,
    archived,
    uncertain,
    remindersResult,
    embeddingCounts,
  ] = await Promise.all([
    countKind(store, userId, 'memory'),
    countKind(store, userId, 'saved'),
    countKind(store, userId, 'reminder'),
    countKind(store, userId, 'decision'),
    countKind(store, userId, 'task'),
    countStatus(store, userId, 'current'),
    countStatuses(store, userId, ARCHIVE_STATUSES),
    countStatus(store, userId, 'uncertain'),
    store
      .from('pierrot_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('kind', 'reminder')
      .eq('status', 'current')
      .order('review_at', { ascending: true, nullsFirst: false })
      .limit(5),
    readMemoryEmbeddingCounts(store, userId).catch(() => ({
      available: false,
      ready: 0,
      pending: 0,
      failed: 0,
    })),
  ]);

  if (remindersResult.error) throw remindersResult.error;

  const reminders = (remindersResult.data ?? [])
    .map((row) => toRecord(row as DecisionRow))
    .filter((row): row is PierrotMemoryRecord => row !== null);

  return {
    counts: { memory, saved, reminder },
    reminders,
    available: true,
    decisions,
    tasks,
    activeTotal: active,
    archivedTotal: archived,
    uncertainTotal: uncertain,
    indexingPending: embeddingCounts.pending,
    indexingFailed: embeddingCounts.failed,
  };
}

async function insertMemoryRow(
  store: SupabaseClient,
  row: Record<string, unknown>
): Promise<DecisionRow> {
  const { data, error } = await store.from('pierrot_decisions').insert(row).select('*').single();

  if (!error) return data as DecisionRow;

  if (isMissingOptionalColumn(error)) {
    const legacy = { ...row };
    for (const column of OPTIONAL_COLUMNS) delete legacy[column];

    const retry = await store.from('pierrot_decisions').insert(legacy).select('*').single();
    if (retry.error) throw retry.error;
    return retry.data as DecisionRow;
  }

  throw error;
}

async function updateMemoryRow(
  store: SupabaseClient,
  userId: string,
  id: string,
  patch: Record<string, unknown>
): Promise<DecisionRow> {
  const { data, error } = await store
    .from('pierrot_decisions')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .single();

  if (!error) return data as DecisionRow;

  if (isMissingOptionalColumn(error)) {
    // A rating write must not silently disappear through the legacy fallback.
    if ('owner_rating' in patch) throw new Error('memory_rating_migration_required');
    const legacy = { ...patch };
    for (const column of OPTIONAL_COLUMNS) delete legacy[column];

    const retry = await store
      .from('pierrot_decisions')
      .update(legacy)
      .eq('user_id', userId)
      .eq('id', id)
      .select('*')
      .single();

    if (retry.error) throw retry.error;
    return retry.data as DecisionRow;
  }

  if (isConstraintViolation(error)) throw new Error('memory_status_unsupported');
  throw error;
}

async function embedWrittenRecord(
  store: SupabaseClient,
  userId: string,
  record: PierrotMemoryRecord,
  client: MemoryEmbeddingClient | null
): Promise<PierrotMemoryRecord> {
  const text = `${record.title}\n${record.content}`;

  try {
    if (!client) {
      const pending = await markMemoryEmbeddingPending(store, {
        decisionId: record.id,
        userId,
        text,
        errorCode: 'embedding_provider_unavailable',
      });
      return { ...record, indexingStatus: pending === 'unavailable' ? 'unavailable' : 'pending' };
    }

    const status = await indexMemoryEmbedding(store, {
      decisionId: record.id,
      userId,
      text,
      client,
    });

    return {
      ...record,
      indexingStatus:
        status === 'ready'
          ? 'ready'
          : status === 'failed'
            ? 'failed'
            : status === 'unavailable'
              ? 'unavailable'
              : 'pending',
    };
  } catch {
    return { ...record, indexingStatus: 'failed' };
  }
}

export type CreateMemoryResult = PierrotMemoryRecord & {
  supersededRecordId?: string;
  conflictRecordId?: string;
};

export async function createMemoryRecord(
  store: SupabaseClient,
  userId: string,
  input: PierrotMemoryWriteInput
): Promise<CreateMemoryResult> {
  if (!MEMORY_KINDS.includes(input.kind)) throw new Error('invalid_memory_kind');
  if (input.status && !MEMORY_STATUSES.includes(input.status)) {
    throw new Error('invalid_memory_status');
  }

  const content = cleanText(input.content, 4_000);
  if (!content) throw new Error('memory_content_required');

  const title = cleanText(input.title || titleFromContent(content), 200);
  const now = new Date().toISOString();
  const sourceRefs = [
    ...(input.sourceRefs ?? []),
    {
      type: 'owner_chat',
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      capturedAt: now,
    },
  ].slice(0, 20);

  const similar = await listMemoryRecords(store, {
    userId,
    status: 'active',
    limit: 80,
  }).catch(() => []);

  const comparable = similar.filter((record) => record.kind === input.kind);
  const best = bestMatch({ title, content }, comparable);

  // Exact or near-exact duplicate: do not create a second row. Touch the
  // existing record's reference time instead (when the column exists).
  if (!input.possibleConflict && best?.relation.duplicate) {
    let touched = best.record;
    try {
      touched = await updateMemoryRecord(store, userId, best.record.id, {
        lastReferencedAt: now,
      });
    } catch {
      // Legacy schema without last_referenced_at: the duplicate is still valid.
    }

    return { ...touched, deduplicated: true };
  }

  let status: PierrotMemoryStatus = input.status ?? 'current';
  const archivedReason: string | null = null;
  let supersededRecordId: string | undefined;

  if (input.possibleConflict) {
    if (!best || best.relation.score < 0.45) {
      // “Instead of X” with no identifiable X. Nothing is written; the caller
      // asks the owner which record was meant.
      throw new Error('memory_replacement_ambiguous');
    }

    supersededRecordId = best.record.id;
  } else if (
    best &&
    isRefinementOf(`${best.record.title} ${best.record.content}`, `${title} ${content}`)
  ) {
    // A clear refinement extends an existing record. Link it as a new version
    // rather than overwriting the old body.
    supersededRecordId = best.record.id;
  } else if (best?.relation.contradiction && best.relation.score >= 0.62) {
    // A new apparent fact conflicts with an existing one. Keep both and mark
    // the new one as uncertain instead of silently picking a winner.
    status = 'uncertain';
    sourceRefs.push({
      type: 'conflict_candidate',
      recordId: best.record.id,
      reason: best.relation.reasons.join('; '),
    });
  }

  const validUntil =
    input.validUntil !== undefined
      ? input.validUntil
      : input.kind === 'reminder'
        ? (input.reviewAt ?? null)
        : null;

  const confidence =
    status === 'uncertain'
      ? Math.min(0.45, clamp01(input.confidence, defaultConfidence(input.kind)))
      : clamp01(input.confidence, defaultConfidence(input.kind));

  const row: Record<string, unknown> = {
    user_id: userId,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    kind: input.kind,
    title,
    content,
    rationale: input.rationale ? cleanText(input.rationale, 4_000) : null,
    status,
    project: input.project ? cleanText(input.project, 120) : null,
    tags: (input.tags ?? [])
      .map((tag) => cleanText(tag, 40))
      .filter(Boolean)
      .slice(0, 10),
    source_refs: sourceRefs,
    decided_at: now,
    review_at: input.reviewAt ?? null,
    importance: clamp01(input.importance, defaultImportance(input.kind)),
    confidence,
    ...(input.ownerRating !== undefined
      ? {
          owner_rating: input.ownerRating,
          owner_rating_updated_at: now,
        }
      : {}),
    valid_from: now,
    valid_until: validUntil,
    last_referenced_at: now,
    archived_reason: archivedReason,
    updated_at: now,
  };

  const data = await insertMemoryRow(store, row);
  let record = toRecord(data);
  if (!record) throw new Error('memory_record_invalid');

  if (supersededRecordId) {
    try {
      await supersedeMemoryRecord(store, userId, supersededRecordId, record.id);
    } catch (error) {
      // The new row was inserted, but linking failed. Remove it so the owner
      // never ends up with two simultaneous current records.
      await deleteMemoryRecord(store, userId, record.id).catch(() => false);
      throw error;
    }
    record = { ...record, supersededBy: null };
  }

  try {
    await recordDecisionEvent(store, {
      decisionId: record.id,
      userId,
      eventType: 'created',
      toStatus: record.status,
      metadata: {
        kind: record.kind,
        title: record.title,
        source: 'owner_chat',
        ...(supersededRecordId ? { replaces: supersededRecordId } : {}),
        ...(best?.relation.contradiction
          ? { conflictWith: best.record.id, conflictScore: best.relation.score }
          : {}),
      },
    });
  } catch (error) {
    await deleteMemoryRecord(store, userId, record.id).catch(() => false);
    throw error;
  }

  const client = input.skipEmbedding ? null : resolveMemoryEmbeddingClient();
  const withIndex = input.skipEmbedding
    ? record
    : await embedWrittenRecord(store, userId, record, client);

  await invalidateBrainStatus(store, userId);

  return {
    ...withIndex,
    ...(supersededRecordId ? { supersededRecordId } : {}),
    ...(best?.relation.contradiction ? { conflictRecordId: best.record.id } : {}),
  };
}

export async function getMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<PierrotMemoryRecord | null> {
  const { data, error } = await store
    .from('pierrot_decisions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toRecord(data as DecisionRow) : null;
}

export type MemoryUpdatePatch = {
  title?: string;
  content?: string;
  rationale?: string | null;
  status?: PierrotMemoryStatus;
  project?: string | null;
  tags?: string[];
  reviewAt?: string | null;
  importance?: number;
  confidence?: number;
  ownerRating?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  lastReferencedAt?: string | null;
  archivedReason?: string | null;
  supersededBy?: string | null;
  /** Add or replace provenance links without changing the record body/status. */
  sourceRefs?: unknown[];
  /** Event-only metadata; not persisted on the row. */
  eventReason?: string;
  eventSource?: string;
};

export async function updateMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string,
  patch: MemoryUpdatePatch
): Promise<PierrotMemoryRecord> {
  const existing = await getMemoryRecord(store, userId, id);
  if (!existing) throw new Error('memory_not_found');

  if (patch.status && !MEMORY_STATUSES.includes(patch.status)) {
    throw new Error('invalid_memory_status');
  }

  const now = new Date().toISOString();
  const content = patch.content !== undefined ? cleanText(patch.content, 4_000) : existing.content;
  if (!content) throw new Error('memory_content_required');

  const title =
    patch.title !== undefined
      ? cleanText(patch.title, 200)
      : patch.content !== undefined
        ? titleFromContent(content)
        : existing.title;

  const update: Record<string, unknown> = {
    title,
    content,
    updated_at: now,
  };

  if (patch.rationale !== undefined) {
    update.rationale = patch.rationale ? cleanText(patch.rationale, 4_000) : null;
  }
  if (patch.project !== undefined) {
    update.project = patch.project ? cleanText(patch.project, 120) : null;
  }
  if (patch.tags !== undefined) {
    update.tags = patch.tags
      .map((tag) => cleanText(tag, 40))
      .filter(Boolean)
      .slice(0, 10);
  }
  if (patch.reviewAt !== undefined) update.review_at = patch.reviewAt;
  if (patch.importance !== undefined)
    update.importance = clamp01(patch.importance, existing.importance);
  if (patch.confidence !== undefined)
    update.confidence = clamp01(patch.confidence, existing.confidence);
  if (patch.ownerRating !== undefined) {
    const rating = Number(patch.ownerRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      throw new Error('memory_rating_invalid');
    }
    update.owner_rating = rating;
    update.owner_rating_updated_at = now;
  }
  if (patch.validFrom !== undefined) update.valid_from = patch.validFrom;
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil;
  if (patch.lastReferencedAt !== undefined) update.last_referenced_at = patch.lastReferencedAt;
  if (patch.archivedReason !== undefined) update.archived_reason = patch.archivedReason;
  if (patch.supersededBy !== undefined) update.superseded_by = patch.supersededBy;
  if (patch.sourceRefs !== undefined) {
    update.source_refs = patch.sourceRefs.slice(0, 20);
  }

  const statusChanged = Boolean(patch.status && patch.status !== existing.status);
  const hasNonStatusChange =
    patch.title !== undefined ||
    patch.content !== undefined ||
    patch.rationale !== undefined ||
    patch.project !== undefined ||
    patch.tags !== undefined ||
    patch.reviewAt !== undefined ||
    patch.importance !== undefined ||
    patch.confidence !== undefined ||
    patch.ownerRating !== undefined ||
    patch.validFrom !== undefined ||
    patch.validUntil !== undefined ||
    patch.supersededBy !== undefined ||
    patch.sourceRefs !== undefined;

  if (!statusChanged && !hasNonStatusChange) {
    if (patch.lastReferencedAt !== undefined) {
      await updateMemoryRow(store, userId, id, {
        last_referenced_at: patch.lastReferencedAt,
      });
      return { ...existing, lastReferencedAt: patch.lastReferencedAt };
    }

    return existing;
  }

  if (statusChanged) {
    update.status = patch.status;
    if (patch.status === 'archived' && patch.archivedReason === undefined) {
      update.archived_reason = 'owner_archive';
    }
    if (patch.status === 'completed' && patch.archivedReason === undefined) {
      update.archived_reason = 'completed';
    }
    if (patch.status === 'current') {
      update.archived_reason = null;
      update.valid_until = null;
      if (patch.supersededBy === undefined) update.superseded_by = null;
    }
  }

  const data = await updateMemoryRow(store, userId, id, update);
  const record = toRecord(data);
  if (!record) throw new Error('memory_record_invalid');
  if (patch.status && record.status !== patch.status) {
    throw new Error('memory_status_not_applied');
  }

  try {
    await recordDecisionEvent(store, {
      decisionId: record.id,
      userId,
      eventType: statusChanged ? 'status_changed' : 'updated',
      fromStatus: existing.status,
      toStatus: record.status,
      metadata: {
        kind: record.kind,
        title: record.title,
        source: patch.eventSource || 'memory_store',
        reason: patch.eventReason || (statusChanged ? 'status_change' : 'content_update'),
        contentChanged: patch.content !== undefined && content !== existing.content,
        ...(statusChanged ? { archivedReason: record.archivedReason } : {}),
      },
    });
  } catch (error) {
    // Do not leave a status/content change without its audit event. Restore
    // the previous row before surfacing the failure. Never claim success.
    const rollback = {
      title: existing.title,
      content: existing.content,
      rationale: existing.rationale,
      project: existing.project,
      tags: existing.tags,
      review_at: existing.reviewAt,
      importance: existing.importance,
      confidence: existing.confidence,
      valid_from: existing.validFrom,
      valid_until: existing.validUntil,
      last_referenced_at: existing.lastReferencedAt,
      archived_reason: existing.archivedReason,
      superseded_by: existing.supersededBy,
      source_refs: existing.sourceRefs,
      status: existing.status,
      updated_at: existing.updatedAt,
    };

    try {
      await updateMemoryRow(store, userId, id, rollback);
    } catch {
      throw new Error('memory_event_write_failed_rollback_failed');
    }

    throw error;
  }

  const contentChanged =
    (patch.content !== undefined && content !== existing.content) ||
    (patch.title !== undefined && title !== existing.title);

  let finalRecord = record;

  if (contentChanged) {
    const client = resolveMemoryEmbeddingClient();
    finalRecord = await embedWrittenRecord(store, userId, record, client);
  }

  await invalidateBrainStatus(store, userId);
  return finalRecord;
}

export async function deleteMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<boolean> {
  await deleteMemoryEmbedding(store, id);

  const { error, count } = await store
    .from('pierrot_decisions')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('id', id);

  if (error) throw error;
  await invalidateBrainStatus(store, userId);
  return (count ?? 0) > 0;
}

export async function supersedeMemoryRecord(
  store: SupabaseClient,
  userId: string,
  oldId: string,
  newId: string
): Promise<void> {
  const old = await getMemoryRecord(store, userId, oldId);
  if (!old) throw new Error('memory_not_found');

  const now = new Date().toISOString();
  const data = await updateMemoryRow(store, userId, oldId, {
    status: 'superseded',
    superseded_by: newId,
    valid_until: now,
    archived_reason: 'superseded',
    updated_at: now,
  });

  try {
    await recordDecisionEvent(store, {
      decisionId: oldId,
      userId,
      eventType: 'status_changed',
      fromStatus: old.status,
      toStatus: 'superseded',
      metadata: {
        source: 'memory_store',
        reason: 'superseded',
        superseded_by: newId,
      },
    });
  } catch (error) {
    await updateMemoryRow(store, userId, oldId, {
      status: old.status,
      superseded_by: old.supersededBy,
      valid_until: old.validUntil,
      archived_reason: old.archivedReason,
      updated_at: old.updatedAt,
    }).catch(() => undefined);
    throw error;
  }

  const updated = toRecord(data);
  if (updated) {
    // Re-embed only if the title/content changed (it did not).
    void updated;
  }

  await invalidateBrainStatus(store, userId);
}

export async function restoreMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<PierrotMemoryRecord> {
  const existing = await getMemoryRecord(store, userId, id);
  if (!existing) throw new Error('memory_not_found');

  if (existing.status === 'current') return existing;

  return updateMemoryRecord(store, userId, id, {
    status: 'current',
    archivedReason: null,
    validUntil: null,
    supersededBy: null,
  });
}

async function embedQuery(
  client: MemoryEmbeddingClient | null,
  query: string
): Promise<number[] | null> {
  if (!client || !query.trim()) return null;

  try {
    const [vector] = await client.embed([query.slice(0, 2_000)]);
    return Array.isArray(vector) && vector.length > 0 ? vector : null;
  } catch {
    return null;
  }
}

function rankLexical(
  query: string,
  records: PierrotMemoryRecord[],
  limit: number
): PierrotMemoryRecord[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [...records]
      .sort((left, right) => {
        if (right.importance !== left.importance) return right.importance - left.importance;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, limit);
  }

  return records
    .map((record) => ({
      record,
      score:
        lexicalSimilarity(query, `${record.title} ${record.content}`) * 0.75 +
        record.importance * 0.15 +
        lexicalSimilarity(query, record.title) * 0.1,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.record);
}

async function searchLexical(
  store: SupabaseClient,
  input: PierrotMemorySearchOptions,
  statuses: PierrotMemoryStatus[]
): Promise<PierrotMemoryRecord[]> {
  const records = await listMemoryRecords(store, {
    userId: input.userId,
    kinds: input.kinds,
    statuses,
    includeArchive: input.includeArchive || input.historyOnly,
    query: null,
    project: input.project || null,
    tags: input.tags,
    limit: Math.min(200, Math.max((input.limit ?? 20) * 6, 40)),
  });

  return rankLexical(input.query, records, Math.min(60, input.limit ?? 20));
}

export async function searchMemory(
  store: SupabaseClient,
  input: PierrotMemorySearchOptions
): Promise<PierrotMemorySearchResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 60);
  const query = input.query.trim();
  const requestedStatuses = input.statuses?.length ? input.statuses : null;
  const baseStatuses: PierrotMemoryStatus[] =
    requestedStatuses ??
    (input.historyOnly
      ? [...MEMORY_STATUSES]
      : input.includeArchive
        ? [...ACTIVE_STATUSES, ...ARCHIVE_STATUSES]
        : [...ACTIVE_STATUSES]);

  const client =
    input.embeddingClient === null
      ? null
      : input.embeddingClient === undefined
        ? resolveMemoryEmbeddingClient()
        : input.embeddingClient;

  const schemaSemanticUnavailable = isMemorySearchRpcKnownMissing(store);

  const queryEmbedding =
    input.queryEmbedding && input.queryEmbedding.length > 0
      ? input.queryEmbedding
      : input.lexicalOnly || schemaSemanticUnavailable
        ? null
        : await embedQuery(client, query);

  let semanticUsed = false;
  let archiveSearched = Boolean(input.includeArchive || input.historyOnly);
  let semanticUnavailableReason: string | undefined;

  if (!queryEmbedding) {
    semanticUnavailableReason = input.lexicalOnly
      ? 'lexical_only'
      : schemaSemanticUnavailable
        ? 'migration_not_applied'
        : client
          ? 'embedding_failed'
          : 'embedding_provider_unavailable';
  }

  let records: PierrotMemoryRecord[] = [];
  let usedLexical = false;

  const runHybrid = async (includeArchive: boolean): Promise<PierrotMemoryRecord[] | null> => {
    if (!queryEmbedding) return null;

    const statuses =
      requestedStatuses ??
      (input.historyOnly
        ? MEMORY_STATUSES
        : includeArchive
          ? [...ACTIVE_STATUSES, ...ARCHIVE_STATUSES]
          : ACTIVE_STATUSES);

    try {
      const rows = await searchMemoryEmbeddings(store, {
        userId: input.userId,
        queryEmbedding,
        queryText: query,
        includeArchive,
        kinds: input.kinds,
        statuses,
        project: input.project || null,
        tags: input.tags,
        matchCount: Math.min(60, limit * 3),
        minSimilarity: input.minSimilarity ?? -1,
      });

      if (rows === null) {
        semanticUnavailableReason = 'migration_not_applied';
        return null;
      }

      semanticUsed = true;
      if (rows.length === 0) return [];

      const found = await listMemoryRecordsByIds(
        store,
        input.userId,
        rows.map((row) => row.decision_id)
      );
      const byId = new Map(found.map((record) => [record.id, record]));

      return rows
        .map((row) => byId.get(row.decision_id))
        .filter((record): record is PierrotMemoryRecord => Boolean(record))
        .filter((record) => statuses.includes(record.status))
        .filter((record) => !input.kinds?.length || input.kinds.includes(record.kind))
        .filter((record) => !input.project || record.project === input.project)
        .filter(
          (record) => !input.tags?.length || input.tags.every((tag) => record.tags.includes(tag))
        )
        .slice(0, limit);
    } catch {
      semanticUnavailableReason = 'retrieval_failed';
      return null;
    }
  };

  const first = await runHybrid(Boolean(input.includeArchive || input.historyOnly));
  const hybridUnavailable = first === null;

  if (first && first.length > 0) {
    records = first;
  } else {
    usedLexical = true;
    records = await searchLexical(store, input, baseStatuses);
  }

  // Active results were too thin: consult the archive as a second, explicit
  // step. The query embedding is reused, so this costs one extra RPC only.
  if (
    !input.includeArchive &&
    !input.historyOnly &&
    !requestedStatuses &&
    query &&
    records.length < 3 &&
    (input.limit ?? 20) > records.length
  ) {
    archiveSearched = true;
    const archived = hybridUnavailable
      ? await searchLexical(store, { ...input, includeArchive: true }, [
          ...ACTIVE_STATUSES,
          ...ARCHIVE_STATUSES,
        ])
      : ((await runHybrid(true)) ?? []);

    const seen = new Set(records.map((record) => record.id));
    const merged = [...records];
    for (const record of archived) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      merged.push(record);
      if (merged.length >= limit) break;
    }
    records = merged;
  }

  const deduped: PierrotMemoryRecord[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    deduped.push(record);
  }

  return {
    records: deduped.slice(0, limit),
    semanticUsed,
    archiveSearched,
    ...(semanticUnavailableReason ? { semanticUnavailableReason } : {}),
    lexicalFallback: usedLexical || !semanticUsed || hybridUnavailable,
  };
}

export async function touchMemoryRecords(
  store: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();

  await store
    .from('pierrot_decisions')
    .update({ last_referenced_at: now })
    .eq('user_id', userId)
    .in('id', ids)
    .then(
      () => undefined,
      () => undefined
    );
}

function formatContextRecord(record: PierrotMemoryRecord, archived = false): string {
  const parts: string[] = [record.status];
  if (record.kind !== 'memory' && record.kind !== 'saved' && record.kind !== 'reminder') {
    parts.push(record.kind);
  }
  if (record.project) parts.push(record.project);
  parts.push((record.validFrom || record.updatedAt).slice(0, 10));
  if (record.kind === 'reminder' && record.reviewAt) {
    parts.push(`due ${record.reviewAt.slice(0, 10)}`);
  } else if (record.validUntil) {
    parts.push(`until ${record.validUntil.slice(0, 10)}`);
  }

  const content =
    record.content.length > 420 ? `${record.content.slice(0, 417).trimEnd()}…` : record.content;

  const supersession = record.supersededBy
    ? ` (replaced by record ${record.supersededBy.slice(0, 8)})`
    : '';

  return `- [${archived ? 'ARCHIVE · ' : ''}${parts.join(' · ')}] ${record.title}: ${content}${supersession}`;
}

/**
 * Two-level prompt context:
 *   1. Permanent Core — the most important durable preferences/constraints;
 *   2. Dynamic Retrieval — records relevant to this turn, plus open tasks.
 *
 * The archive is consulted only when active results are thin. No full-memory
 * dump and no archive-by-default behaviour.
 */
export async function buildMemoryContext(
  store: SupabaseClient,
  userId: string,
  options: { query?: string; queryEmbedding?: number[]; limit?: number } = {}
): Promise<string | null> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 16);
  const query = (options.query || '').trim();

  const candidates = await listMemoryRecords(store, {
    userId,
    status: 'active',
    limit: 60,
  }).catch(() => []);

  const coreKinds: PierrotMemoryKind[] = [
    'preference',
    'constraint',
    'position',
    'decision',
    'memory',
  ];
  const core = candidates
    .filter((record) => coreKinds.includes(record.kind) && record.confidence >= 0.6)
    .sort((left, right) => {
      if (right.importance !== left.importance) return right.importance - left.importance;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 8);

  let dynamic: PierrotMemoryRecord[] = [];
  let archiveSearched = false;
  let semanticUsed = false;

  if (query) {
    const result = await searchMemory(store, {
      userId,
      query,
      queryEmbedding: options.queryEmbedding,
      limit,
      includeArchive: false,
    });

    dynamic = result.records;
    archiveSearched = result.archiveSearched;
    semanticUsed = result.semanticUsed;
  } else {
    dynamic = candidates
      .filter(
        (record) =>
          record.kind === 'task' || record.kind === 'reminder' || record.status === 'uncertain'
      )
      .sort((left, right) => {
        if (right.importance !== left.importance) return right.importance - left.importance;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, limit);
  }

  const coreIds = new Set(core.map((record) => record.id));
  const dynamicUnique = dynamic.filter((record) => !coreIds.has(record.id));
  const openTasks = candidates
    .filter((record) => record.kind === 'task' || record.kind === 'reminder')
    .slice(0, 5);

  if (core.length === 0 && dynamicUnique.length === 0 && openTasks.length === 0) return null;

  const lines = [
    'OWNER MEMORY (private, verified owner only):',
    'The server checked Temporal Memory for this turn. Only records listed below exist in this context. Do not invent memory records, do not claim a write was made, and do not present an uncertain record as confirmed.',
  ];

  if (core.length > 0) {
    lines.push('', 'PERMANENT CORE:', ...core.map((record) => formatContextRecord(record)));
  }

  if (dynamicUnique.length > 0) {
    lines.push('', 'RELEVANT NOW:', ...dynamicUnique.map((record) => formatContextRecord(record)));
  } else if (query) {
    lines.push('', 'RELEVANT NOW: no matching active memory record.');
  }

  if (openTasks.length > 0) {
    const taskIds = new Set(dynamicUnique.map((record) => record.id));
    const pending = openTasks.filter(
      (record) => !coreIds.has(record.id) && !taskIds.has(record.id)
    );
    if (pending.length > 0) {
      lines.push('', 'OPEN TASKS:', ...pending.map((record) => formatContextRecord(record)));
    }
  }

  const archive = dynamicUnique.filter((record) => record.status !== 'current');
  if (archiveSearched && archive.length === 0 && query) {
    lines.push('', 'ARCHIVE CONTEXT: no additional archived record matched this request.');
  }

  lines.push(
    '',
    `Retrieval: ${semanticUsed ? 'semantic + lexical' : 'lexical fallback'}${archiveSearched ? '; archive included' : '; active memory only'}.`
  );

  return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}

export type MemoryIndexCandidate = {
  id: string;
  title: string;
  content: string;
  contentHash: string;
};

/**
 * Bounded candidate list for manual/batch re-indexing. The caller decides the
 * batch size; there is no background loop.
 */
export async function listMemoryIndexCandidates(
  store: SupabaseClient,
  userId: string,
  limit = 20
): Promise<MemoryIndexCandidate[] | null> {
  const bounded = Math.min(Math.max(limit, 1), 50);
  const records = await listMemoryRecords(store, {
    userId,
    includeArchive: true,
    limit: 200,
  });

  const states = await loadEmbeddingStates(
    store,
    records.map((record) => record.id)
  );

  if (states === null) return null;

  const client = resolveMemoryEmbeddingClient();
  const modelId = client?.modelId || 'baai/bge-m3';

  return records
    .filter((record) => {
      const state = states.get(record.id);
      if (!state) return true;
      if (state.status !== 'ready') return true;
      return (
        state.modelId !== modelId ||
        state.contentHash !== memoryContentHash(`${record.title}\n${record.content}`)
      );
    })
    .slice(0, bounded)
    .map((record) => ({
      id: record.id,
      title: record.title,
      content: record.content,
      contentHash: memoryContentHash(`${record.title}\n${record.content}`),
    }));
}

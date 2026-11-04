import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PierrotMemoryKind,
  PierrotMemoryRecord,
  PierrotMemoryStatus,
  PierrotMemorySummary,
  PierrotMemoryWriteInput,
} from './types';

assertServerOnly('lib/pierrot/memory/store');

const MEMORY_KINDS: PierrotMemoryKind[] = ['memory', 'saved', 'reminder'];
const MEMORY_STATUSES: PierrotMemoryStatus[] = [
  'current',
  'completed',
  'archived',
  'superseded',
  'rejected',
  'uncertain',
];

type DecisionRow = {
  id: string;
  kind: string;
  title: string;
  content: string;
  rationale: string | null;
  status: string;
  project: string | null;
  tags: string[] | null;
  source_refs: unknown;
  conversation_id: string | null;
  message_id: string | null;
  review_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

function isKind(value: string): value is PierrotMemoryKind {
  return MEMORY_KINDS.includes(value as PierrotMemoryKind);
}

function isStatus(value: string): value is PierrotMemoryStatus {
  return MEMORY_STATUSES.includes(value as PierrotMemoryStatus);
}

function toRecord(row: DecisionRow): PierrotMemoryRecord | null {
  if (!isKind(row.kind) || !isStatus(row.status)) return null;

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    rationale: row.rationale,
    status: row.status,
    project: row.project,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string') : [],
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs : [],
    conversationId: row.conversation_id,
    messageId: row.message_id,
    reviewAt: row.review_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanText(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function titleFromContent(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() || content;
  return (first.length > 96 ? `${first.slice(0, 93).trimEnd()}…` : first).slice(0, 200);
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
  await store.from('pierrot_decision_events').insert({
    decision_id: input.decisionId,
    user_id: input.userId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function listMemoryRecords(
  store: SupabaseClient,
  input: {
    userId: string;
    kinds?: PierrotMemoryKind[];
    status?: PierrotMemoryStatus | 'active';
    query?: string | null;
    limit?: number;
  }
): Promise<PierrotMemoryRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  let query = store
    .from('pierrot_decisions')
    .select(
      'id,kind,title,content,rationale,status,project,tags,source_refs,conversation_id,message_id,review_at,decided_at,created_at,updated_at'
    )
    .eq('user_id', input.userId)
    .in('kind', input.kinds?.length ? input.kinds : MEMORY_KINDS)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (input.status === 'active') query = query.eq('status', 'current');
  else if (input.status) query = query.eq('status', input.status);

  const search = input.query?.trim();
  if (search) {
    const escaped = search.replace(/[%_]/g, '\\$&');
    query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
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

export async function getMemorySummary(
  store: SupabaseClient,
  userId: string
): Promise<PierrotMemorySummary> {
  const [memory, saved, reminder, remindersResult] = await Promise.all([
    countKind(store, userId, 'memory'),
    countKind(store, userId, 'saved'),
    countKind(store, userId, 'reminder'),
    store
      .from('pierrot_decisions')
      .select(
        'id,kind,title,content,rationale,status,project,tags,source_refs,conversation_id,message_id,review_at,decided_at,created_at,updated_at'
      )
      .eq('user_id', userId)
      .eq('kind', 'reminder')
      .eq('status', 'current')
      .order('review_at', { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  if (remindersResult.error) throw remindersResult.error;

  const reminders = (remindersResult.data ?? [])
    .map((row) => toRecord(row as DecisionRow))
    .filter((row): row is PierrotMemoryRecord => row !== null);

  return {
    counts: { memory, saved, reminder },
    reminders,
    available: true,
  };
}

export async function createMemoryRecord(
  store: SupabaseClient,
  userId: string,
  input: PierrotMemoryWriteInput
): Promise<PierrotMemoryRecord> {
  if (!MEMORY_KINDS.includes(input.kind)) throw new Error('invalid_memory_kind');

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

  const { data, error } = await store
    .from('pierrot_decisions')
    .insert({
      user_id: userId,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId ?? null,
      kind: input.kind,
      title,
      content,
      rationale: input.rationale ? cleanText(input.rationale, 4_000) : null,
      status: 'current',
      project: input.project ? cleanText(input.project, 120) : null,
      tags: (input.tags ?? [])
        .map((tag) => cleanText(tag, 40))
        .filter(Boolean)
        .slice(0, 10),
      source_refs: sourceRefs,
      decided_at: now,
      review_at: input.reviewAt ?? null,
      updated_at: now,
    })
    .select(
      'id,kind,title,content,rationale,status,project,tags,source_refs,conversation_id,message_id,review_at,decided_at,created_at,updated_at'
    )
    .single();

  if (error) throw error;

  const record = toRecord(data as DecisionRow);
  if (!record) throw new Error('memory_record_invalid');

  await recordDecisionEvent(store, {
    decisionId: record.id,
    userId,
    eventType: 'created',
    toStatus: 'current',
    metadata: { kind: record.kind, title: record.title },
  }).catch(() => undefined);

  return record;
}

export async function getMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<PierrotMemoryRecord | null> {
  const { data, error } = await store
    .from('pierrot_decisions')
    .select(
      'id,kind,title,content,rationale,status,project,tags,source_refs,conversation_id,message_id,review_at,decided_at,created_at,updated_at'
    )
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toRecord(data as DecisionRow) : null;
}

export async function updateMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string,
  patch: {
    title?: string;
    content?: string;
    rationale?: string | null;
    status?: PierrotMemoryStatus;
    project?: string | null;
    tags?: string[];
    reviewAt?: string | null;
  }
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
  if (patch.status && patch.status !== existing.status) update.status = patch.status;

  const { data, error } = await store
    .from('pierrot_decisions')
    .update(update)
    .eq('user_id', userId)
    .eq('id', id)
    .select(
      'id,kind,title,content,rationale,status,project,tags,source_refs,conversation_id,message_id,review_at,decided_at,created_at,updated_at'
    )
    .single();

  if (error) throw error;

  const record = toRecord(data as DecisionRow);
  if (!record) throw new Error('memory_record_invalid');

  await recordDecisionEvent(store, {
    decisionId: record.id,
    userId,
    eventType: patch.status && patch.status !== existing.status ? 'status_changed' : 'updated',
    fromStatus: existing.status,
    toStatus: record.status,
    metadata: { kind: record.kind },
  }).catch(() => undefined);

  return record;
}

export async function deleteMemoryRecord(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<boolean> {
  const { error, count } = await store
    .from('pierrot_decisions')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('id', id);

  if (error) throw error;
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
  const { error } = await store
    .from('pierrot_decisions')
    .update({
      status: 'superseded',
      superseded_by: newId,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('id', oldId);

  if (error) throw error;

  await recordDecisionEvent(store, {
    decisionId: oldId,
    userId,
    eventType: 'status_changed',
    fromStatus: old.status,
    toStatus: 'superseded',
    metadata: { superseded_by: newId },
  }).catch(() => undefined);
}

/**
 * Compact context for the owner prompt. It is bounded and never includes the
 * full transcript. Only current records are included.
 */
export async function buildMemoryContext(
  store: SupabaseClient,
  userId: string
): Promise<string | null> {
  const [memories, saved, reminders] = await Promise.all([
    listMemoryRecords(store, { userId, kinds: ['memory'], status: 'active', limit: 12 }),
    listMemoryRecords(store, { userId, kinds: ['saved'], status: 'active', limit: 8 }),
    listMemoryRecords(store, { userId, kinds: ['reminder'], status: 'active', limit: 8 }),
  ]);

  if (memories.length === 0 && saved.length === 0 && reminders.length === 0) return null;

  const format = (record: PierrotMemoryRecord, withDate = false) => {
    const date = withDate && record.reviewAt ? ` · due ${record.reviewAt.slice(0, 10)}` : '';
    return `- ${record.title}: ${record.content}${date}`;
  };

  const lines = [
    'OWNER MEMORY (private, verified owner only):',
    'These are explicit records created by Anton with “Запомни”, “Сохрани” or “Напомни”. Use them as durable context; do not confuse them with retrieved Brain passages.',
  ];

  if (memories.length > 0) {
    lines.push('DURABLE MEMORY:', ...memories.map((record) => format(record)));
  }
  if (saved.length > 0) {
    lines.push('SAVED NOTES:', ...saved.map((record) => format(record)));
  }
  if (reminders.length > 0) {
    lines.push('REMINDERS:', ...reminders.map((record) => format(record, true)));
  }

  lines.push(
    'If the owner asks about his memory, saved notes or reminders, use these records. Do not invent records that are not listed. If a requested record is missing, say that it is not present.'
  );

  return lines.join('\n').slice(0, 6_000);
}

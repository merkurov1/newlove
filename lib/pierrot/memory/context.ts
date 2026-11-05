import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotMemoryKind, PierrotMemoryRecord } from './types';
import { listMemoryRecordsByIds } from './store';

assertServerOnly('lib/pierrot/memory/context');

export type MemoryListContext = {
  ids: string[];
  kinds: PierrotMemoryKind[];
  createdAt: string;
};

export type PendingMemoryDelete = {
  id: string;
  title: string;
  requestedAt: string;
  expiresAt: string;
};

const LIST_TTL_MS = 30 * 60 * 1000;
const DELETE_TTL_MS = 10 * 60 * 1000;

type EventRow = {
  payload?: unknown;
  created_at?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function recentAssistantEvents(
  store: SupabaseClient,
  conversationId: string
): Promise<EventRow[]> {
  const { data, error } = await store
    .from('pierrot_events')
    .select('payload,created_at')
    .eq('conversation_id', conversationId)
    .eq('event_name', 'assistant_replied')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return [];
  return Array.isArray(data) ? (data as EventRow[]) : [];
}

function fresh(createdAt: string | null | undefined, ttlMs: number): boolean {
  if (!createdAt) return false;
  const time = Date.parse(createdAt);
  return Number.isFinite(time) && Date.now() - time <= ttlMs;
}

/**
 * The list context is written into the assistant_replied event payload by the
 * chat route. It keeps actual record IDs, so “эти”, “всё перечисленное” and
 * “последние две” never depend on fuzzy text search of the answer.
 */
export async function loadLatestMemoryList(
  store: SupabaseClient,
  conversationId: string
): Promise<MemoryListContext | null> {
  const rows = await recentAssistantEvents(store, conversationId);

  for (const row of rows) {
    if (!fresh(row.created_at, LIST_TTL_MS)) continue;
    const payload = asRecord(row.payload);
    const ids = Array.isArray(payload?.memory_list_ids)
      ? payload.memory_list_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length === 0) continue;

    const kinds = Array.isArray(payload?.memory_list_kinds)
      ? payload.memory_list_kinds.filter(
          (kind): kind is PierrotMemoryKind => typeof kind === 'string'
        )
      : [];

    return {
      ids: Array.from(new Set(ids)).slice(0, 40),
      kinds,
      createdAt: row.created_at || new Date().toISOString(),
    };
  }

  return null;
}

export async function loadLatestMemoryListRecords(
  store: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<PierrotMemoryRecord[]> {
  const context = await loadLatestMemoryList(store, conversationId);
  if (!context) return [];

  const records = await listMemoryRecordsByIds(store, userId, context.ids);
  const byId = new Map(records.map((record) => [record.id, record]));

  return context.ids
    .map((id) => byId.get(id))
    .filter((record): record is PierrotMemoryRecord => Boolean(record));
}

export async function loadPendingMemoryDelete(
  store: SupabaseClient,
  conversationId: string
): Promise<PendingMemoryDelete | null> {
  const rows = await recentAssistantEvents(store, conversationId);

  for (const row of rows) {
    if (!fresh(row.created_at, DELETE_TTL_MS)) continue;
    const payload = asRecord(row.payload);
    const pending = asRecord(payload?.memory_delete_pending);
    if (!pending) continue;
    if (
      typeof pending.id !== 'string' ||
      typeof pending.title !== 'string' ||
      typeof pending.requestedAt !== 'string' ||
      typeof pending.expiresAt !== 'string'
    ) {
      continue;
    }

    if (Date.parse(pending.expiresAt) < Date.now()) return null;

    return {
      id: pending.id,
      title: pending.title,
      requestedAt: pending.requestedAt,
      expiresAt: pending.expiresAt,
    };
  }

  return null;
}

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isMissingIdentityColumn,
  normalizeStoredIdentityType,
  type PierrotIdentityType,
} from '@/lib/pierrot/identity';

export type IdentityConversationRow = {
  id: string;
  session_id?: string | null;
  identity_type?: string | null;
  visitor_id?: string | null;
  user_id?: string | null;
  identity_source?: string | null;
  identity_verified_at?: string | null;
  start_page?: string | null;
  referrer?: string | null;
  started_at: string;
};

export type PierrotIdentityMetrics = {
  ownerConversations: number;
  visitorConversations: number;
  unknownConversations: number;
  ownerSessions: number;
  visitorSessions: number;
  unknownSessions: number;
  uniqueVisitors: number;
  newVisitors: number | null;
  returningVisitors: number | null;
  conversationsPerVisitor: number | null;
  repeatVisitorSessions: number;
  ownerTestsExcluded: number;
  visitorEntryPages: Array<{ key: string; value: number }>;
  visitorReferrers: Array<{ key: string; value: number }>;
};

function topCounts(values: string[], limit = 10): Array<{ key: string; value: number }> {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key))
    .slice(0, limit);
}

/**
 * Pure attribution summary. Unknown is never folded into visitor totals and
 * owner test conversations are always reported separately.
 */
export function summarizePierrotIdentity(
  conversations: IdentityConversationRow[],
  priorVisitorIds: Set<string> | null = new Set()
): PierrotIdentityMetrics {
  const owner = conversations.filter(
    (conversation) => normalizeStoredIdentityType(conversation.identity_type) === 'owner'
  );
  const visitors = conversations.filter(
    (conversation) =>
      normalizeStoredIdentityType(conversation.identity_type) === 'visitor' &&
      typeof conversation.visitor_id === 'string'
  );
  const unknown = conversations.filter(
    (conversation) => normalizeStoredIdentityType(conversation.identity_type) === 'unknown'
  );

  const visitorIds = Array.from(
    new Set(
      visitors
        .map((conversation) => conversation.visitor_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  const visitorSessionsById = new Map<string, Set<string>>();

  for (const conversation of visitors) {
    if (typeof conversation.visitor_id !== 'string' || !conversation.visitor_id) continue;
    const sessions = visitorSessionsById.get(conversation.visitor_id) || new Set<string>();
    if (conversation.session_id) sessions.add(conversation.session_id);
    visitorSessionsById.set(conversation.visitor_id, sessions);
  }

  const returning =
    priorVisitorIds === null
      ? null
      : visitorIds.filter((visitorId) => priorVisitorIds.has(visitorId)).length;
  const newVisitors =
    priorVisitorIds === null || returning === null ? null : visitorIds.length - returning;

  return {
    ownerConversations: owner.length,
    visitorConversations: visitors.length,
    unknownConversations: unknown.length,
    ownerSessions: new Set(owner.map((conversation) => conversation.session_id).filter(Boolean))
      .size,
    visitorSessions: new Set(
      visitors.map((conversation) => conversation.session_id).filter(Boolean)
    ).size,
    unknownSessions: new Set(unknown.map((conversation) => conversation.session_id).filter(Boolean))
      .size,
    uniqueVisitors: visitorIds.length,
    newVisitors,
    returningVisitors: returning,
    conversationsPerVisitor:
      visitorIds.length > 0 ? Number((visitors.length / visitorIds.length).toFixed(2)) : null,
    repeatVisitorSessions: Array.from(visitorSessionsById.values()).filter(
      (sessions) => sessions.size > 1
    ).length,
    ownerTestsExcluded: owner.length,
    visitorEntryPages: topCounts(visitors.map((conversation) => conversation.start_page || '/')),
    visitorReferrers: topCounts(
      visitors.map((conversation) => conversation.referrer || '').filter(Boolean)
    ),
  };
}

/**
 * Returns visitor ids seen before the selected period. A null result means the
 * history could not be checked, so new/returning must stay unknown rather than
 * being guessed.
 */
export async function loadPriorVisitorIds(
  store: SupabaseClient,
  from: string,
  limit = 10_000
): Promise<Set<string> | null> {
  try {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('visitor_id')
      .lt('started_at', from)
      .not('visitor_id', 'is', null)
      .limit(limit);

    if (error) {
      return isMissingIdentityColumn(error) ? new Set<string>() : null;
    }

    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row) =>
          row && typeof row === 'object' ? (row as { visitor_id?: unknown }).visitor_id : null
        )
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    );
  } catch {
    return null;
  }
}

type IdentityStoreRow = {
  id?: unknown;
  session_id?: unknown;
  identity_type?: unknown;
  visitor_id?: unknown;
  user_id?: unknown;
  identity_source?: unknown;
  identity_verified_at?: unknown;
  start_page?: unknown;
  referrer?: unknown;
  started_at?: unknown;
};

function mapRow(row: IdentityStoreRow): IdentityConversationRow | null {
  if (typeof row.id !== 'string' || typeof row.started_at !== 'string') return null;

  return {
    id: row.id,
    session_id: typeof row.session_id === 'string' ? row.session_id : null,
    identity_type: typeof row.identity_type === 'string' ? row.identity_type : 'unknown',
    visitor_id: typeof row.visitor_id === 'string' ? row.visitor_id : null,
    user_id: typeof row.user_id === 'string' ? row.user_id : null,
    identity_source: typeof row.identity_source === 'string' ? row.identity_source : null,
    identity_verified_at:
      typeof row.identity_verified_at === 'string' ? row.identity_verified_at : null,
    start_page: typeof row.start_page === 'string' ? row.start_page : '/',
    referrer: typeof row.referrer === 'string' ? row.referrer : null,
    started_at: row.started_at,
  };
}

/**
 * Lightweight analytics fetch for the owner analytics tool. It selects only
 * attribution fields, never transcripts or message content.
 */
export async function loadPierrotIdentityMetrics(
  store: SupabaseClient,
  from: string,
  to: string
): Promise<PierrotIdentityMetrics> {
  const rows: IdentityConversationRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select(
        'id,session_id,identity_type,visitor_id,user_id,identity_source,identity_verified_at,start_page,referrer,started_at'
      )
      .gte('started_at', from)
      .lte('started_at', to)
      .order('started_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      if (!isMissingIdentityColumn(error)) throw error;

      // Before the manual migration identity is provably unknown.
      const legacy = await store
        .from('pierrot_conversations')
        .select('id,session_id,start_page,referrer,started_at')
        .gte('started_at', from)
        .lte('started_at', to)
        .order('started_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (legacy.error) throw legacy.error;

      for (const row of Array.isArray(legacy.data) ? legacy.data : []) {
        const mapped = mapRow(row as IdentityStoreRow);
        if (mapped) rows.push({ ...mapped, identity_type: 'unknown' });
      }

      if (!Array.isArray(legacy.data) || legacy.data.length < pageSize) break;
      continue;
    }

    for (const row of Array.isArray(data) ? data : []) {
      const mapped = mapRow(row as IdentityStoreRow);
      if (mapped) rows.push(mapped);
    }

    if (!Array.isArray(data) || data.length < pageSize) break;
  }

  const priorVisitorIds = await loadPriorVisitorIds(store, from);
  return summarizePierrotIdentity(rows, priorVisitorIds);
}

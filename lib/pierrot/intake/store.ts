import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localDayRange, getZonedParts, addLocalDays, zonedTimeToUtc } from './time';
import type { IntakeLog, IntakeQueryIntent, ParsedIntakeItem } from './types';

assertServerOnly('lib/pierrot/intake/store');

const TABLE = 'intake_logs';

type Row = Record<string, unknown> & {
  id: string;
  user_id: string;
  type: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  raw_text: string;
  occurred_at: string;
  timezone: string | null;
  source_message_id: string | null;
  confidence: number | null;
  created_at: string;
};

export class IntakeStorageUnavailableError extends Error {
  readonly code = 'INTAKE_MIGRATION_REQUIRED';
}

export class IntakePartialSaveError extends Error {
  readonly code = 'INTAKE_PARTIAL_SAVE';
  readonly inserted: number;

  constructor(inserted: number, cause?: unknown) {
    super('Intake save failed after some rows were written.');
    this.name = 'IntakePartialSaveError';
    this.inserted = inserted;
    this.cause = cause;
  }
}

function isMissingTable(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return code === '42P01' || code === 'PGRST205' || message.includes('intake_logs');
}

function isUniqueViolation(error: { code?: unknown } | null | undefined): boolean {
  return error?.code === '23505';
}

function toLog(row: Row): IntakeLog | null {
  if (row.type !== 'food' && row.type !== 'drink') return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    itemName: row.item_name,
    quantity:
      typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null,
    unit: typeof row.unit === 'string' && row.unit ? row.unit : null,
    rawText: typeof row.raw_text === 'string' ? row.raw_text : '',
    occurredAt: row.occurred_at,
    timezone: typeof row.timezone === 'string' ? row.timezone : null,
    sourceMessageId:
      typeof row.source_message_id === 'string' ? row.source_message_id : null,
    confidence:
      typeof row.confidence === 'number' && Number.isFinite(row.confidence)
        ? row.confidence
        : 0,
    createdAt: row.created_at,
  };
}

export async function saveIntakeItems(
  store: SupabaseClient,
  input: {
    userId: string;
    items: ParsedIntakeItem[];
    rawText: string;
    sourceMessageId: string | null;
    confidence: number;
  }
): Promise<{ inserted: number; items: IntakeLog[]; duplicate: boolean }> {
  if (input.items.length === 0) return { inserted: 0, items: [], duplicate: false };

  const rows = input.items.map((item, index) => ({
    user_id: input.userId,
    type: item.type,
    item_name: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    raw_text: input.rawText.slice(0, 4_000),
    occurred_at: item.occurredAt,
    timezone: item.timezone,
    source_message_id: input.sourceMessageId,
    item_index: index,
    confidence: input.confidence,
  }));

  // PostgreSQL cannot use the production partial unique index as an
  // `ON CONFLICT` target without its predicate, and PostgREST cannot express
  // that predicate. Insert one item at a time and treat 23505 as the existing
  // idempotent outcome instead of failing the whole save.
  const items: IntakeLog[] = [];
  const insertedIds: string[] = [];
  let duplicateCount = 0;

  const rollback = async () => {
    if (insertedIds.length === 0) return;
    await store
      .from(TABLE)
      .delete()
      .eq('user_id', input.userId)
      .in('id', insertedIds);
  };

  for (const row of rows) {
    const { data, error } = await store.from(TABLE).insert(row).select('*').single();

    if (error) {
      if (isUniqueViolation(error)) {
        duplicateCount += 1;
        continue;
      }
      if (isMissingTable(error)) throw new IntakeStorageUnavailableError();

      // Multi-product messages must not leave an unexplained partial record.
      // Compensate the rows that were already inserted before reporting failure.
      try {
        await rollback();
      } catch {
        // The caller still receives an explicit partial-save failure.
      }
      throw new IntakePartialSaveError(items.length, error);
    }

    const saved = data ? toLog(data as Row) : null;
    if (!saved) {
      try {
        await rollback();
      } catch {
        // The caller still receives an explicit partial-save failure.
      }
      throw new IntakePartialSaveError(items.length, new Error('INTAKE_SAVE_NOT_VERIFIED'));
    }
    items.push(saved);
    insertedIds.push(saved.id);
  }

  return {
    inserted: items.length,
    items,
    duplicate: items.length === 0 && duplicateCount > 0,
  };
}

export async function listIntakeLogs(
  store: SupabaseClient,
  input: {
    userId: string;
    from?: Date | null;
    to?: Date | null;
    type?: 'food' | 'drink' | null;
    limit?: number;
  }
): Promise<IntakeLog[]> {
  let query = store
    .from(TABLE)
    .select('*')
    .eq('user_id', input.userId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit || 200, 1), 500));

  if (input.from) query = query.gte('occurred_at', input.from.toISOString());
  if (input.to) query = query.lt('occurred_at', input.to.toISOString());
  if (input.type) query = query.eq('type', input.type);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) throw new IntakeStorageUnavailableError();
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => toLog(row as Row))
    .filter((row): row is IntakeLog => Boolean(row));
}

export async function getLastIntakeLog(
  store: SupabaseClient,
  userId: string
): Promise<IntakeLog | null> {
  const { data, error } = await store
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new IntakeStorageUnavailableError();
    throw error;
  }
  return data ? toLog(data as Row) : null;
}

export async function deleteIntakeLog(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<number> {
  const { data, error } = await store
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id');

  if (error) {
    if (isMissingTable(error)) throw new IntakeStorageUnavailableError();
    throw error;
  }
  return Array.isArray(data) ? data.length : 0;
}

export async function updateIntakeLog(
  store: SupabaseClient,
  userId: string,
  id: string,
  patch: {
    itemName?: string;
    type?: 'food' | 'drink';
    quantity?: number | null;
    unit?: string | null;
  }
): Promise<IntakeLog | null> {
  const update: Record<string, unknown> = {};
  if (patch.itemName !== undefined) update.item_name = patch.itemName.slice(0, 120);
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.unit !== undefined) update.unit = patch.unit;

  const { data, error } = await store
    .from(TABLE)
    .update(update)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) throw new IntakeStorageUnavailableError();
    throw error;
  }
  return data ? toLog(data as Row) : null;
}

function startOfLocalWeek(now: Date, timeZone: string): Date {
  const parts = getZonedParts(now, timeZone);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const startParts = addLocalDays(
    { ...parts, hour: 0, minute: 0, second: 0 },
    -daysSinceMonday
  );
  return zonedTimeToUtc(startParts, timeZone);
}

/**
 * Resolves a query period in the owner's timezone. Timestamps stay UTC in the
 * database; only the boundaries are computed locally.
 */
export function intakeRangeForQuery(
  query: IntakeQueryIntent,
  input: { now?: Date; timezone: string }
): { from: Date | null; to: Date | null } {
  const now = input.now || new Date();
  const timezone = input.timezone;

  if (query.period === 'all') return { from: null, to: null };
  if (query.period === 'today') {
    const range = localDayRange({ now, timeZone: timezone, dayOffset: 0, days: 1 });
    return { from: range.from, to: range.to };
  }
  if (query.period === 'yesterday') {
    const range = localDayRange({ now, timeZone: timezone, dayOffset: -1, days: 1 });
    return { from: range.from, to: range.to };
  }
  if (query.period === 'dayBeforeYesterday') {
    const range = localDayRange({ now, timeZone: timezone, dayOffset: -2, days: 1 });
    return { from: range.from, to: range.to };
  }
  if (query.period === 'last7') {
    const range = localDayRange({ now, timeZone: timezone, dayOffset: -6, days: 7 });
    return { from: range.from, to: range.to };
  }

  return {
    from: startOfLocalWeek(now, timezone),
    to: localDayRange({ now, timeZone: timezone, dayOffset: 0, days: 1 }).to,
  };
}

export function isIntakeStorageUnavailable(error: unknown): boolean {
  return error instanceof IntakeStorageUnavailableError;
}

export function isIntakePartialSaveError(error: unknown): error is IntakePartialSaveError {
  return error instanceof IntakePartialSaveError;
}

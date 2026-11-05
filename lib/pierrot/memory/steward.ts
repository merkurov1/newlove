import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PierrotMemoryRecord,
  StewardAction,
  StewardCandidate,
  StewardCandidateType,
  StewardReport,
} from './types';
import { listMemoryRecords, updateMemoryRecord } from './store';
import { compareMemoryTexts } from './similarity';
import { invalidateBrainStatus } from './brainCache';

assertServerOnly('lib/pierrot/memory/steward');

const DAY_MS = 24 * 60 * 60 * 1000;
const TEMPORARY_NOTE_MAX_AGE_DAYS = 30;
const OVERDUE_REMINDER_DAYS = 14;
const MAX_SCAN_RECORDS = 160;

function ageDays(value: string | null | undefined, now: number): number {
  if (!value) return 0;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  return (now - time) / DAY_MS;
}

function candidate(input: {
  type: StewardCandidateType;
  action: StewardAction;
  recordIds: string[];
  title: string;
  reason: string;
  confidence: number;
  safeToApply: boolean;
}): StewardCandidate {
  return { ...input, recordIds: input.recordIds.slice(0, 8) };
}

function isTemporaryKind(record: PierrotMemoryRecord): boolean {
  return record.kind === 'saved' || record.kind === 'reminder';
}

function staleThresholdDays(record: PierrotMemoryRecord): number {
  if (record.kind === 'reminder') return 45;
  if (record.kind === 'saved') return record.importance >= 0.7 ? 90 : TEMPORARY_NOTE_MAX_AGE_DAYS;
  return 365;
}

function looksCompleted(record: PierrotMemoryRecord): boolean {
  const text = `${record.title} ${record.content}`.toLowerCase();
  return /(^|\s)(сделано|выполнено|завершено|готово|done|completed|finished)(\s|$)/i.test(text);
}

function looksLikeDraft(record: PierrotMemoryRecord): boolean {
  return /(черновик|временн|набросок|draft|temporary|todo)/i.test(
    `${record.title} ${record.content}`
  );
}

export type StewardOptions = {
  /** Apply only the safe, non-destructive actions. */
  apply?: boolean;
  limitCandidates?: number;
};

/**
 * One deterministic pass over the owner's memory. It never deletes records and
 * never calls a model. Safe actions archive stale temporary notes; ambiguous
 * cases are returned as review candidates.
 */
export async function runMemorySteward(
  store: SupabaseClient,
  userId: string,
  options: StewardOptions = {}
): Promise<StewardReport> {
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const limit = Math.min(Math.max(options.limitCandidates ?? 40, 1), 80);

  const active = await listMemoryRecords(store, {
    userId,
    status: 'active',
    limit: 120,
  });

  const archive = await listMemoryRecords(store, {
    userId,
    statuses: ['archived', 'completed', 'superseded', 'rejected'],
    includeArchive: true,
    limit: 60,
  }).catch(() => []);

  const all = [...active, ...archive].slice(0, MAX_SCAN_RECORDS);
  const candidates: StewardCandidate[] = [];
  const applied: StewardReport['applied'] = [];

  // 1. Temporary notes and reminders that have outlived their useful period.
  for (const record of active) {
    if (!isTemporaryKind(record)) continue;

    const reference = record.validUntil || record.reviewAt || record.updatedAt;
    const age = ageDays(reference, now);
    const threshold = staleThresholdDays(record);

    if (age > threshold) {
      candidates.push(
        candidate({
          type: 'stale',
          action: 'archive',
          recordIds: [record.id],
          title: record.title,
          reason:
            record.kind === 'reminder'
              ? `Reminder has been open for ${Math.round(age)} days.`
              : `Temporary note has not changed for ${Math.round(age)} days.`,
          confidence: record.importance >= 0.7 ? 0.55 : 0.8,
          safeToApply: record.importance < 0.7 && !looksLikeDraft(record),
        })
      );
    }

    if (
      record.kind === 'reminder' &&
      record.reviewAt &&
      ageDays(record.reviewAt, now) > OVERDUE_REMINDER_DAYS
    ) {
      candidates.push(
        candidate({
          type: 'stale',
          action: 'review',
          recordIds: [record.id],
          title: record.title,
          reason: `Reminder was due ${Math.round(ageDays(record.reviewAt, now))} days ago. Complete or reschedule it.`,
          confidence: 0.9,
          safeToApply: false,
        })
      );
    }
  }

  // 2. Obvious duplicate pairs among active records of the same kind.
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left];
      const b = active[right];
      if (a.kind !== b.kind) continue;

      const relation = compareMemoryTexts(a, b);
      if (relation.duplicate) {
        candidates.push(
          candidate({
            type: 'duplicate',
            action: 'review',
            recordIds: [a.id, b.id],
            title: a.title,
            reason: 'Two active records have almost identical wording.',
            confidence: Math.min(0.95, relation.score),
            safeToApply: false,
          })
        );
        continue;
      }

      if (relation.contradiction) {
        candidates.push(
          candidate({
            type: 'contradiction',
            action: 'mark_uncertain',
            recordIds: [a.id, b.id],
            title: a.title,
            reason: `Possible contradiction: ${relation.reasons.join('; ')}.`,
            confidence: Math.min(0.9, relation.score),
            safeToApply: false,
          })
        );
      }
    }
  }

  // 3. Tasks whose own wording says they are finished but whose status still
  //    claims they are current. A wording signal is a candidate, not proof.
  for (const record of active) {
    if (record.kind !== 'task' || !looksCompleted(record)) continue;

    candidates.push(
      candidate({
        type: 'completed',
        action: 'mark_completed',
        recordIds: [record.id],
        title: record.title,
        reason: 'Task text contains an explicit completion word, but status is still current.',
        confidence: 0.6,
        safeToApply: false,
      })
    );
  }

  // 4. Report superseded records whose link is missing. This is provenance
  //    repair, never a status rewrite.
  for (const record of archive) {
    if (record.status !== 'superseded' || record.supersededBy) continue;

    candidates.push(
      candidate({
        type: 'superseded',
        action: 'link_previous',
        recordIds: [record.id],
        title: record.title,
        reason: 'Record is marked superseded but has no link to its replacement.',
        confidence: 0.7,
        safeToApply: false,
      })
    );
  }

  const deduped: StewardCandidate[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const key = `${item.type}:${item.recordIds.join(':')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (options.apply) {
    for (const item of deduped) {
      if (!item.safeToApply) continue;

      if (item.action === 'archive') {
        for (const id of item.recordIds) {
          await updateMemoryRecord(store, userId, id, {
            status: 'archived',
            archivedReason: item.type === 'stale' ? 'expired_temporary_note' : 'steward_archive',
          }).catch(() => null);
        }
        applied.push({ type: item.type, recordIds: item.recordIds, action: item.action });
      }
    }

    if (applied.length > 0) await invalidateBrainStatus(store, userId);
  }

  return {
    available: true,
    scanned: all.length,
    candidates: deduped.slice(0, limit),
    applied,
    needsReview: deduped.filter((item) => !item.safeToApply).length,
    generatedAt,
  };
}

/**
 * Lightweight write-time maintenance: archive only clearly expired temporary
 * notes. Bounded to five records and one query, so a normal “Запомни” command
 * keeps its latency. No background loop is created.
 */
export async function autoArchiveExpiredTemporary(
  store: SupabaseClient,
  userId: string
): Promise<number> {
  const now = Date.now();
  const records = await listMemoryRecords(store, {
    userId,
    status: 'active',
    kinds: ['saved'],
    limit: 30,
  }).catch(() => []);

  const expired = records
    .filter(
      (record) =>
        record.importance < 0.7 &&
        !looksLikeDraft(record) &&
        ageDays(record.updatedAt, now) > TEMPORARY_NOTE_MAX_AGE_DAYS
    )
    .slice(0, 5);

  for (const record of expired) {
    await updateMemoryRecord(store, userId, record.id, {
      status: 'archived',
      archivedReason: 'expired_temporary_note',
    }).catch(() => null);
  }

  return expired.length;
}

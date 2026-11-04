/**
 * Client-safe owner-memory contract.
 *
 * These records live in `public.pierrot_decisions`; this module contains no
 * database access and no private prompt text.
 */

export type PierrotMemoryKind = 'memory' | 'saved' | 'reminder';

export type PierrotMemoryStatus =
  'current' | 'completed' | 'archived' | 'superseded' | 'rejected' | 'uncertain';

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
  sourceRefs?: Array<Record<string, unknown>>;
};

export function memoryKindLabel(kind: PierrotMemoryKind): string {
  if (kind === 'memory') return 'Запомнено';
  if (kind === 'saved') return 'Сохранено';
  return 'Напоминание';
}

export function memoryStatusLabel(status: PierrotMemoryStatus): string {
  if (status === 'current') return 'активно';
  if (status === 'completed') return 'завершено';
  if (status === 'archived') return 'в архиве';
  if (status === 'superseded') return 'заменено';
  if (status === 'rejected') return 'отклонено';
  return 'под вопросом';
}

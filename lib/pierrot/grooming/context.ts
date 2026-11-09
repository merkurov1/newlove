import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

assertServerOnly('lib/pierrot/grooming/context');

export const CONTEXT_SUMMARY_THRESHOLD_CHARS = 24_000;
export const CONTEXT_SUMMARY_THRESHOLD_MESSAGES = 36;
export const CONTEXT_SUMMARY_STALE_MS = 14 * 24 * 60 * 60 * 1000;

export type ConversationSummary = {
  id: string;
  conversationId: string;
  version: number;
  summary: string;
  sourceMessageStartIndex: number | null;
  sourceMessageEndIndex: number | null;
  messageCount: number;
  previousSummaryId: string | null;
  generatedAt: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist/i.test(value);
}

function compact(value: string, max = 360): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function uniqueLines(lines: string[], max: number): string[] {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean))).slice(0, max);
}

export function summaryIsStale(generatedAt: string | null | undefined): boolean {
  if (!generatedAt) return true;
  const time = Date.parse(generatedAt);
  return !Number.isFinite(time) || Date.now() - time > CONTEXT_SUMMARY_STALE_MS;
}

export function summaryVolumeReached(input: {
  messageCount: number;
  charCount: number;
}): boolean {
  return (
    input.messageCount >= CONTEXT_SUMMARY_THRESHOLD_MESSAGES ||
    input.charCount >= CONTEXT_SUMMARY_THRESHOLD_CHARS
  );
}

export async function countConversationVolume(
  store: SupabaseClient,
  conversationId: string
): Promise<{ messageCount: number; charCount: number }> {
  const { data, error } = await store
    .from('pierrot_messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .limit(4_000);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return {
    messageCount: rows.length,
    charCount: rows.reduce(
      (sum, row) => sum + (row && typeof row.content === 'string' ? row.content.length : 0),
      0
    ),
  };
}

export async function loadLatestContextSummary(
  store: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<ConversationSummary | null> {
  const { data, error } = await store
    .from('pierrot_context_summaries')
    .select(
      'id,conversation_id,version,summary,source_message_start_index,source_message_end_index,message_count,previous_summary_id,generated_at'
    )
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    id: text(data.id),
    conversationId: text(data.conversation_id),
    version: Number(data.version || 0),
    summary: text(data.summary),
    sourceMessageStartIndex:
      typeof data.source_message_start_index === 'number'
        ? data.source_message_start_index
        : null,
    sourceMessageEndIndex:
      typeof data.source_message_end_index === 'number'
        ? data.source_message_end_index
        : null,
    messageCount: Number(data.message_count || 0),
    previousSummaryId: text(data.previous_summary_id) || null,
    generatedAt: text(data.generated_at),
  };
}

async function loadConversationMessages(
  store: SupabaseClient,
  conversationId: string,
  limit = 400
): Promise<
  Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    messageIndex: number;
    createdAt: string | null;
  }>
> {
  const { data, error } = await store
    .from('pierrot_messages')
    .select('id,role,content,message_index,created_at')
    .eq('conversation_id', conversationId)
    .order('message_index', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .filter(
      (row) =>
        row &&
        (row.role === 'user' || row.role === 'assistant') &&
        typeof row.content === 'string'
    )
    .map((row) => ({
      id: text(row.id),
      role: row.role as 'user' | 'assistant',
      content: row.content as string,
      messageIndex: Number(row.message_index || 0),
      createdAt: text(row.created_at) || null,
    }));
}

async function buildSummaryText(
  store: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<{ summary: string; messageCount: number; startIndex: number | null; endIndex: number | null }> {
  const messages = await loadConversationMessages(store, conversationId);
  const firstUser = messages.find((message) => message.role === 'user');
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

  const { data: records } = await store
    .from('pierrot_decisions')
    .select('id,kind,title,content,status,project,created_at,updated_at')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false })
    .limit(80);

  const decisions = (Array.isArray(records) ? records : []).filter(
    (row) => row.kind === 'decision' || row.kind === 'position'
  );
  const tasks = (Array.isArray(records) ? records : []).filter(
    (row) => row.kind === 'task' || row.kind === 'reminder'
  );
  const facts = (Array.isArray(records) ? records : []).filter(
    (row) => row.kind === 'memory' || row.kind === 'constraint' || row.kind === 'preference'
  );

  const questions = messages
    .filter((message) => message.role === 'user' && /\?/u.test(message.content))
    .slice(-5)
    .map((message) => compact(message.content, 240));

  const recentChanges = messages
    .slice(-6)
    .map(
      (message) =>
        `${message.role === 'assistant' ? 'Pierrot' : 'Owner'}: ${compact(message.content, 220)}`
    );

  const start = messages.length > 0 ? messages[0].messageIndex : null;
  const end = messages.length > 0 ? messages[messages.length - 1].messageIndex : null;

  const lines = [
    `Тема: ${firstUser ? compact(firstUser.content, 280) : 'Без первого сообщения'}`,
    firstUser?.createdAt ? `Начало: ${firstUser.createdAt.slice(0, 10)}` : null,
    lastUser ? `Последний запрос владельца: ${compact(lastUser.content, 280)}` : null,
    lastAssistant ? `Последний ответ: ${compact(lastAssistant.content, 280)}` : null,
    decisions.length
      ? `Решения: ${uniqueLines(
          decisions.map((row) => `${text(row.title) || text(row.content)} [${text(row.status)}]`),
          8
        ).join('; ')}`
      : 'Решения: не зафиксированы.',
    tasks.length
      ? `Задачи: ${uniqueLines(
          tasks
            .filter((row) => row.status === 'current' || row.status === 'uncertain')
            .map((row) => `${text(row.title) || text(row.content)} [${text(row.status)}]`),
          8
        ).join('; ')}`
      : 'Задачи: открытых нет.',
    facts.length
      ? `Факты и правила: ${uniqueLines(
          facts.map((row) => `${text(row.title) || text(row.content)} [${text(row.status)}]`),
          8
        ).join('; ')}`
      : null,
    questions.length ? `Открытые вопросы: ${questions.join('; ')}` : 'Открытых вопросов нет.',
    recentChanges.length ? `Последние изменения:\n${recentChanges.join('\n')}` : null,
    start !== null && end !== null
      ? `Источник: сообщения ${start}–${end} (${messages.length} шт.). Оригиналы сохранены.`
      : null,
  ].filter((line): line is string => Boolean(line));

  return {
    summary: lines.join('\n').slice(0, 20_000),
    messageCount: messages.length,
    startIndex: start,
    endIndex: end,
  };
}

export async function createContextSummary(
  store: SupabaseClient,
  input: { userId: string; conversationId: string }
): Promise<ConversationSummary> {
  const latest = await loadLatestContextSummary(store, input.userId, input.conversationId);
  const built = await buildSummaryText(store, input.userId, input.conversationId);
  const now = new Date().toISOString();
  const id = randomUUID();
  const version = (latest?.version || 0) + 1;

  const { error } = await store.from('pierrot_context_summaries').insert({
    id,
    user_id: input.userId,
    conversation_id: input.conversationId,
    version,
    summary: built.summary,
    source_message_start_index: built.startIndex,
    source_message_end_index: built.endIndex,
    message_count: built.messageCount,
    previous_summary_id: latest?.id || null,
    generated_by: 'deterministic',
    generated_at: now,
    created_at: now,
  });
  if (error) throw error;

  const { error: conversationError } = await store
    .from('pierrot_conversations')
    .update({ summary: built.summary, summary_generated_at: now, updated_at: now })
    .eq('id', input.conversationId)
    .eq('user_id', input.userId);
  if (conversationError) throw conversationError;

  return {
    id,
    conversationId: input.conversationId,
    version,
    summary: built.summary,
    sourceMessageStartIndex: built.startIndex,
    sourceMessageEndIndex: built.endIndex,
    messageCount: built.messageCount,
    previousSummaryId: latest?.id || null,
    generatedAt: now,
  };
}

export type ConversationSummaryCandidate = {
  conversationId: string;
  title: string;
  messageCount: number;
  charCount: number;
  summary: string | null;
  summaryGeneratedAt: string | null;
  stale: boolean;
  volumeReached: boolean;
};

export async function listConversationSummaryCandidates(
  store: SupabaseClient,
  userId: string,
  limit = 20
): Promise<ConversationSummaryCandidate[]> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('id,title,summary,summary_generated_at,updated_at')
    .eq('user_id', userId)
    .eq('identity_type', 'owner')
    .eq('mode', 'site')
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 60));
  if (error) return [];

  const rows = Array.isArray(data) ? data : [];
  const candidates: ConversationSummaryCandidate[] = [];
  for (const row of rows) {
    const conversationId = text(row.id);
    if (!conversationId) continue;
    const volume = await countConversationVolume(store, conversationId).catch(() => ({
      messageCount: 0,
      charCount: 0,
    }));
    const summary = text(row.summary) || null;
    const generatedAt = text(row.summary_generated_at) || null;
    const volumeReached = summaryVolumeReached(volume);
    const stale = summaryIsStale(generatedAt);
    if (!summary || (volumeReached && stale)) {
      candidates.push({
        conversationId,
        title: text(row.title) || 'Диалог',
        messageCount: volume.messageCount,
        charCount: volume.charCount,
        summary,
        summaryGeneratedAt: generatedAt,
        stale,
        volumeReached,
      });
    }
  }
  return candidates;
}

export async function maybeRefreshContextSummary(
  store: SupabaseClient,
  input: { userId: string; conversationId: string }
): Promise<ConversationSummary | null> {
  const volume = await countConversationVolume(store, input.conversationId).catch(() => null);
  if (!volume || !summaryVolumeReached(volume)) return null;
  const latest = await loadLatestContextSummary(store, input.userId, input.conversationId);
  if (latest && !summaryIsStale(latest.generatedAt)) return null;
  return createContextSummary(store, input);
}

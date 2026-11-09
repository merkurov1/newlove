import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { DevRepositoryKey } from './types';

assertServerOnly('lib/pierrot/dev/pendingOperations');

const TABLE = 'pierrot_github_operations';
const PENDING_TTL_MS = 10 * 60 * 1000;

export type PendingGitHubOperationKind =
  | 'create_issue'
  | 'create_branch'
  | 'create_pull_request'
  | 'create_or_update_file'
  | 'update_issue_state'
  | 'add_issue_comment';

export type PendingGitHubOperation = {
  id: string;
  userId: string;
  conversationId: string;
  repository: DevRepositoryKey;
  operation: PendingGitHubOperationKind;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'executed' | 'cancelled' | 'expired';
};

type Row = Record<string, unknown> & {
  id: string;
  user_id: string;
  conversation_id: string;
  repository: string;
  operation: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  status: string;
};

function isMissingTable(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return code === '42P01' || code === 'PGRST205' || message.includes('pierrot_github_operations');
}

function toPending(row: Row): PendingGitHubOperation | null {
  if (
    row.operation !== 'create_issue' &&
    row.operation !== 'create_branch' &&
    row.operation !== 'create_pull_request' &&
    row.operation !== 'create_or_update_file' &&
    row.operation !== 'update_issue_state' &&
    row.operation !== 'add_issue_comment'
  ) {
    return null;
  }
  if (row.repository !== 'newlove' && row.repository !== 'pierrot') return null;
  if (
    row.status !== 'pending' &&
    row.status !== 'executed' &&
    row.status !== 'cancelled' &&
    row.status !== 'expired'
  ) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    repository: row.repository,
    operation: row.operation,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

export class PendingOperationUnavailableError extends Error {
  readonly code = 'GITHUB_PENDING_STORAGE_UNAVAILABLE';
}

export async function savePendingGitHubOperation(
  store: SupabaseClient,
  input: {
    userId: string;
    conversationId: string;
    repository: DevRepositoryKey;
    operation: PendingGitHubOperationKind;
    payload: Record<string, unknown>;
  }
): Promise<PendingGitHubOperation> {
  const now = Date.now();
  const expiresAt = new Date(now + PENDING_TTL_MS).toISOString();

  // Supersede any older pending proposal in this conversation.
  await store
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('user_id', input.userId)
    .eq('conversation_id', input.conversationId)
    .eq('status', 'pending');

  const { data, error } = await store
    .from(TABLE)
    .insert({
      id: randomUUID(),
      user_id: input.userId,
      conversation_id: input.conversationId,
      repository: input.repository,
      operation: input.operation,
      payload: input.payload,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingTable(error)) throw new PendingOperationUnavailableError();
    throw error;
  }

  const pending = toPending(data as Row);
  if (!pending) throw new PendingOperationUnavailableError();
  return pending;
}

export async function loadPendingGitHubOperation(
  store: SupabaseClient,
  input: { userId: string; conversationId: string }
): Promise<PendingGitHubOperation | null> {
  const { data, error } = await store
    .from(TABLE)
    .select('*')
    .eq('user_id', input.userId)
    .eq('conversation_id', input.conversationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;

  const pending = toPending(data as Row);
  if (!pending) return null;
  if (Date.parse(pending.expiresAt) <= Date.now()) {
    await store.from(TABLE).update({ status: 'expired' }).eq('id', pending.id);
    return null;
  }
  return pending;
}

export async function closePendingGitHubOperation(
  store: SupabaseClient,
  input: { id: string; status: 'executed' | 'cancelled' | 'expired'; result?: unknown }
): Promise<void> {
  await store
    .from(TABLE)
    .update({
      status: input.status,
      ...(input.status === 'executed'
        ? { executed_at: new Date().toISOString(), result: input.result ?? null }
        : {}),
    })
    .eq('id', input.id);
}

export function isPendingOperationTableMissing(error: unknown): boolean {
  return error instanceof PendingOperationUnavailableError;
}

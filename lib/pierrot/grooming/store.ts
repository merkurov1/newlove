import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type {
  GroomingAudit,
  GroomingAuditStatus,
  GroomingAuditSummary,
  GroomingOperation,
  GroomingProposal,
  GroomingProposalStatus,
  GroomingRisk,
  GroomingScope,
  GroomingSourceRef,
} from './types';

assertServerOnly('lib/pierrot/grooming/store');

const AUDIT_TTL_MS = 24 * 60 * 60 * 1000;

export class GroomingStorageUnavailableError extends Error {
  readonly code = 'GROOMING_MIGRATION_REQUIRED';
  constructor() {
    super('GROOMING_MIGRATION_REQUIRED');
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist|relation .*not found/i.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    String((error as { code?: unknown }).code || '') === '23505'
  );
}

function mapProposal(row: Record<string, unknown>): GroomingProposal {
  return {
    id: text(row.id),
    ordinal: Number(row.ordinal || 0),
    operation: text(row.operation) as GroomingOperation,
    entityType: text(row.entity_type) as GroomingProposal['entityType'],
    entityId: text(row.entity_id) || null,
    projectId: text(row.project_id) || null,
    projectName: null,
    title: text(row.title),
    reason: text(row.reason),
    expectedResult: text(row.expected_result),
    sourceRefs: array(row.source_refs) as GroomingSourceRef[],
    params: object(row.params),
    beforeState: object(row.before_state),
    confidence: Number(row.confidence || 0.5),
    risk: (text(row.risk) || 'confirmation') as GroomingRisk,
    status: text(row.status) as GroomingProposalStatus,
    selected: row.selected === true,
    result: row.result && typeof row.result === 'object' ? object(row.result) : null,
    errorCode: text(row.error_code) || null,
  };
}

export type StoredAudit = GroomingAudit & {
  userId: string;
  conversationId: string;
  summary: GroomingAuditSummary;
  warnings: string[];
  snapshot: Record<string, unknown>;
};

function mapAudit(row: Record<string, unknown>): Omit<StoredAudit, 'proposals'> {
  const summary = object(row.summary);
  return {
    id: text(row.id),
    userId: text(row.user_id),
    conversationId: text(row.conversation_id),
    projectId: text(row.project_id) || null,
    scope: (text(row.scope) || 'all') as GroomingScope,
    status: text(row.status) as GroomingAuditStatus,
    createdAt: text(row.created_at),
    expiresAt: text(row.expires_at),
    summary: {
      messageCount: Number(summary.messageCount || 0),
      taskCount: Number(summary.taskCount || 0),
      memoryCount: Number(summary.memoryCount || 0),
      projectCount: Number(summary.projectCount || 0),
      githubLinkCount: Number(summary.githubLinkCount || 0),
      githubErrorCount: Number(summary.githubErrorCount || 0),
      staleSummaryCount: Number(summary.staleSummaryCount || 0),
      duplicateCandidates: Number(summary.duplicateCandidates || 0),
      ambiguousCount: Number(summary.ambiguousCount || 0),
      sourceMessageCount:
        summary.sourceMessageCount === undefined
          ? undefined
          : Number(summary.sourceMessageCount || 0),
      conversationCount:
        summary.conversationCount === undefined
          ? undefined
          : Number(summary.conversationCount || 0),
      openTaskCount:
        summary.openTaskCount === undefined ? undefined : Number(summary.openTaskCount || 0),
      questionableTaskCount:
        summary.questionableTaskCount === undefined
          ? undefined
          : Number(summary.questionableTaskCount || 0),
      decisionCount:
        summary.decisionCount === undefined ? undefined : Number(summary.decisionCount || 0),
      materialCount:
        summary.materialCount === undefined ? undefined : Number(summary.materialCount || 0),
      contradictionCount:
        summary.contradictionCount === undefined
          ? undefined
          : Number(summary.contradictionCount || 0),
      cleanedTaskCount:
        summary.cleanedTaskCount === undefined ? undefined : Number(summary.cleanedTaskCount || 0),
    },
    warnings: array(summary.warnings).filter((item): item is string => typeof item === 'string'),
    snapshot: object(row.snapshot),
  };
}

export async function findAuditByRequest(
  store: SupabaseClient,
  input: { userId: string; conversationId: string; requestMessageId: string }
): Promise<StoredAudit | null> {
  const { data, error } = await store
    .from('pierrot_workspace_audits')
    .select('*')
    .eq('user_id', input.userId)
    .eq('conversation_id', input.conversationId)
    .eq('request_message_id', input.requestMessageId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new GroomingStorageUnavailableError();
    throw error;
  }
  if (!data) return null;
  return loadAuditById(store, input.userId, text((data as Record<string, unknown>).id));
}

export async function createAudit(
  store: SupabaseClient,
  input: {
    userId: string;
    conversationId: string;
    projectId: string | null;
    scope: GroomingScope;
    requestMessageId: string;
    summary: GroomingAuditSummary;
    snapshot: Record<string, unknown>;
    proposals: Array<Omit<GroomingProposal, 'id' | 'status' | 'selected' | 'ordinal'>>;
  }
): Promise<StoredAudit> {
  const existing = await findAuditByRequest(store, {
    userId: input.userId,
    conversationId: input.conversationId,
    requestMessageId: input.requestMessageId,
  }).catch((error) => {
    if (error instanceof GroomingStorageUnavailableError) throw error;
    return null;
  });
  if (existing) return existing;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUDIT_TTL_MS).toISOString();
  const auditId = randomUUID();
  const warnings = Array.isArray(input.snapshot.warnings)
    ? (input.snapshot.warnings as unknown[]).filter(
        (item): item is string => typeof item === 'string'
      )
    : [];
  const summary = { ...input.summary, warnings };

  const { error } = await store.from('pierrot_workspace_audits').insert({
    id: auditId,
    user_id: input.userId,
    conversation_id: input.conversationId,
    project_id: input.projectId,
    scope: input.scope,
    status: 'prepared',
    request_message_id: input.requestMessageId,
    summary,
    snapshot: input.snapshot,
    proposal_count: input.proposals.length,
    warning_count: warnings.length,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  });

  if (error) {
    if (isMissingTable(error)) throw new GroomingStorageUnavailableError();
    if (isUniqueViolation(error)) {
      const raced = await findAuditByRequest(store, {
        userId: input.userId,
        conversationId: input.conversationId,
        requestMessageId: input.requestMessageId,
      });
      if (raced) return raced;
    }
    throw error;
  }

  if (input.proposals.length > 0) {
    const rows = input.proposals.map((proposal, index) => ({
      id: randomUUID(),
      audit_id: auditId,
      user_id: input.userId,
      ordinal: index + 1,
      operation: proposal.operation,
      entity_type: proposal.entityType,
      entity_id: proposal.entityId,
      project_id: proposal.projectId,
      title: proposal.title.slice(0, 400),
      reason: proposal.reason,
      expected_result: proposal.expectedResult,
      source_refs: proposal.sourceRefs,
      params: proposal.params,
      before_state: proposal.beforeState,
      confidence: Math.min(1, Math.max(0, proposal.confidence)),
      risk: proposal.risk,
      status: 'proposed',
      selected: false,
    }));
    const { error: proposalsError } = await store.from('pierrot_workspace_proposals').insert(rows);
    if (proposalsError) {
      await store
        .from('pierrot_workspace_audits')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', auditId);
      if (isMissingTable(proposalsError)) throw new GroomingStorageUnavailableError();
      throw proposalsError;
    }
  }

  const loaded = await loadAuditById(store, input.userId, auditId);
  if (!loaded) throw new Error('GROOMING_AUDIT_NOT_READABLE');
  return loaded;
}

export async function loadAuditById(
  store: SupabaseClient,
  userId: string,
  auditId: string
): Promise<StoredAudit | null> {
  const { data, error } = await store
    .from('pierrot_workspace_audits')
    .select('*')
    .eq('id', auditId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new GroomingStorageUnavailableError();
    throw error;
  }
  if (!data) return null;

  const { data: proposalRows, error: proposalsError } = await store
    .from('pierrot_workspace_proposals')
    .select('*')
    .eq('audit_id', auditId)
    .eq('user_id', userId)
    .order('ordinal', { ascending: true });
  if (proposalsError) {
    if (isMissingTable(proposalsError)) throw new GroomingStorageUnavailableError();
    throw proposalsError;
  }

  return {
    ...mapAudit(data as Record<string, unknown>),
    proposals: (Array.isArray(proposalRows) ? proposalRows : []).map((row) =>
      mapProposal(row as Record<string, unknown>)
    ),
  };
}

export async function loadPendingAudit(
  store: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<StoredAudit | null> {
  const { data, error } = await store
    .from('pierrot_workspace_audits')
    .select('*')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .in('status', ['prepared', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new GroomingStorageUnavailableError();
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  if (Date.parse(text(row.expires_at)) <= Date.now()) {
    await store
      .from('pierrot_workspace_audits')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', text(row.id));
    return null;
  }
  return loadAuditById(store, userId, text(row.id));
}

export async function updateAuditStatus(
  store: SupabaseClient,
  input: {
    auditId: string;
    userId: string;
    status: GroomingAuditStatus;
    approvedAt?: string | null;
    executedAt?: string | null;
  }
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.approvedAt !== undefined) patch.approved_at = input.approvedAt;
  if (input.executedAt !== undefined) patch.executed_at = input.executedAt;
  const { error } = await store
    .from('pierrot_workspace_audits')
    .update(patch)
    .eq('id', input.auditId)
    .eq('user_id', input.userId);
  if (error) throw error;
}

export async function selectProposals(
  store: SupabaseClient,
  input: {
    auditId: string;
    userId: string;
    selectedIds: string[];
    rejectedIds: string[];
  }
): Promise<void> {
  const all = await loadAuditById(store, input.userId, input.auditId);
  if (!all) throw new Error('GROOMING_AUDIT_NOT_FOUND');
  const selected = new Set(input.selectedIds);
  const rejected = new Set(input.rejectedIds);

  for (const proposal of all.proposals) {
    if (proposal.status !== 'proposed') continue;
    const isSelected = selected.has(proposal.id);
    const isRejected = rejected.has(proposal.id);
    const { error } = await store
      .from('pierrot_workspace_proposals')
      .update({
        selected: isSelected,
        status: isSelected ? 'approved' : isRejected ? 'rejected' : 'proposed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .eq('audit_id', input.auditId)
      .eq('user_id', input.userId)
      .eq('status', 'proposed');
    if (error) throw error;
  }
}

export async function markProposalResult(
  store: SupabaseClient,
  input: {
    proposalId: string;
    userId: string;
    status: GroomingProposalStatus;
    result?: Record<string, unknown> | null;
    errorCode?: string | null;
  }
): Promise<void> {
  const { error } = await store
    .from('pierrot_workspace_proposals')
    .update({
      status: input.status,
      result: input.result ?? null,
      error_code: input.errorCode ?? null,
      executed_at: input.status === 'executed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.proposalId)
    .eq('user_id', input.userId);
  if (error) throw error;
}

export async function recordOperation(
  store: SupabaseClient,
  input: {
    auditId: string;
    proposalId: string;
    userId: string;
    operation: string;
    entityType: string;
    entityId: string | null;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    sourceRefs: GroomingSourceRef[];
    idempotencyKey: string | null;
    approvalAt: string | null;
    result: 'executed' | 'skipped' | 'failed' | 'stale';
    errorDetails?: string | null;
  }
): Promise<void> {
  const { error } = await store.from('pierrot_workspace_operations').insert({
    audit_id: input.auditId,
    proposal_id: input.proposalId,
    user_id: input.userId,
    operation: input.operation,
    entity_type: input.entityType,
    entity_id: input.entityId,
    before_state: input.beforeState,
    after_state: input.afterState,
    source_refs: input.sourceRefs,
    idempotency_key: input.idempotencyKey,
    approval_at: input.approvalAt,
    result: input.result,
    error_details: input.errorDetails ? input.errorDetails.slice(0, 4_000) : null,
  });
  if (error) throw error;
}

export async function listRecentOperations(
  store: SupabaseClient,
  userId: string,
  limit = 20
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await store
    .from('pierrot_workspace_operations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

export function isGroomingStorageUnavailable(error: unknown): boolean {
  return error instanceof GroomingStorageUnavailableError;
}

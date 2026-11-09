import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { collectWorkspaceSnapshot } from './collect';
import { generateGroomingProposals } from './rules';
import { computeProjectHealth } from './health';
import { formatGroomingExecution, formatGroomingPlan } from './format';
import { createAudit, loadAuditById, loadPendingAudit, updateAuditStatus } from './store';
import { executeApprovedPlan } from './execute';
import type {
  GroomingAudit,
  GroomingExecutionReport,
  GroomingScope,
  WorkspaceHealth,
} from './types';

assertServerOnly('lib/pierrot/grooming/service');

export type PreparedGroomingAudit = {
  audit: GroomingAudit;
  reply: string;
  health: WorkspaceHealth;
  planView: import('./types').GroomingPlanView;
};

export function toGroomingPlanView(
  audit: GroomingAudit,
  warnings: string[] = [],
  ambiguous: string[] = []
): import('./types').GroomingPlanView {
  return {
    auditId: audit.id,
    scope: audit.scope,
    warnings: warnings.slice(0, 10),
    ambiguous: ambiguous.slice(0, 20),
    proposals: audit.proposals
      .filter((proposal) => proposal.status === 'proposed')
      .map((proposal) => ({
        id: proposal.id,
        ordinal: proposal.ordinal,
        operation: proposal.operation,
        title: proposal.title,
        reason: proposal.reason,
        expectedResult: proposal.expectedResult,
        risk: proposal.risk,
        projectName: proposal.projectName,
        sourceRefs: proposal.sourceRefs.slice(0, 4),
      })),
  };
}

export async function prepareWorkspaceAudit(input: {
  store: SupabaseClient;
  userId: string;
  conversationId: string;
  requestMessageId: string;
  scope: GroomingScope;
  projectId: string | null;
  language?: 'ru' | 'en';
  additionalProposals?: import('./rules').ProposalDraft[];
  additionalWarnings?: string[];
  additionalAmbiguous?: string[];
  summaryOverrides?: Partial<import('./types').GroomingAuditSummary>;
}): Promise<PreparedGroomingAudit> {
  const previous = await loadPendingAudit(input.store, input.userId, input.conversationId).catch(
    () => null
  );
  if (previous) {
    await updateAuditStatus(input.store, {
      auditId: previous.id,
      userId: input.userId,
      status: 'cancelled',
      executedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  const snapshot = await collectWorkspaceSnapshot({
    store: input.store,
    userId: input.userId,
    scope: input.scope,
    projectId: input.projectId,
  });
  const generated = generateGroomingProposals({
    snapshot,
    scope: input.scope,
    projectId: input.projectId,
  });

  const additional = input.additionalProposals || [];
  if (additional.length > 0) {
    const seen = new Set(
      generated.proposals.map(
        (proposal) =>
          `${proposal.operation}:${proposal.entityId || ''}:${JSON.stringify(proposal.params).slice(0, 180)}`
      )
    );
    for (const proposal of additional) {
      const key = `${proposal.operation}:${proposal.entityId || ''}:${JSON.stringify(proposal.params).slice(0, 180)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      generated.proposals.push(proposal);
    }
    generated.warnings.push(...(input.additionalWarnings || []));
    generated.ambiguous.push(...(input.additionalAmbiguous || []));
    generated.summary.duplicateCandidates = generated.proposals.filter(
      (proposal) => proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory'
    ).length;
    generated.summary.ambiguousCount = generated.ambiguous.length;
  }

  const summary = {
    ...generated.summary,
    ...(input.summaryOverrides || {}),
    ambiguousCount: generated.ambiguous.length,
  };

  const audit = await createAudit(input.store, {
    userId: input.userId,
    conversationId: input.conversationId,
    projectId: input.projectId,
    scope: input.scope,
    requestMessageId: input.requestMessageId,
    summary,
    snapshot: {
      warnings: generated.warnings,
      ambiguous: generated.ambiguous,
      projects: snapshot.projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        status: project.status,
      })),
      githubResults: snapshot.githubResults,
      repositoryStatuses: snapshot.repositoryStatuses,
    },
    proposals: generated.proposals,
  });

  const health = computeProjectHealth(snapshot, audit.proposals);
  const reply = formatGroomingPlan({
    auditId: audit.id,
    proposals: audit.proposals,
    summary: audit.summary,
    warnings: generated.warnings,
    ambiguous: generated.ambiguous,
    language: input.language,
  });

  return {
    audit,
    reply,
    health,
    planView: toGroomingPlanView(audit, generated.warnings, generated.ambiguous),
  };
}

export async function approvePendingGroomingPlan(input: {
  store: SupabaseClient;
  userId: string;
  conversationId: string;
  mode: 'all' | 'safe' | 'selected' | 'reject_all';
  ordinals?: number[];
  language?: 'ru' | 'en';
}): Promise<{ audit: GroomingAudit; report: GroomingExecutionReport; reply: string } | null> {
  const pending = await loadPendingAudit(input.store, input.userId, input.conversationId);
  if (!pending) return null;

  const report = await executeApprovedPlan({
    store: input.store,
    userId: input.userId,
    auditId: pending.id,
    mode: input.mode,
    ordinals: input.ordinals,
  });
  const refreshed = await loadAuditById(input.store, input.userId, pending.id);
  const audit = refreshed || pending;
  return {
    audit,
    report,
    reply: formatGroomingExecution({ report, language: input.language }),
  };
}

export async function showPendingGroomingPlan(input: {
  store: SupabaseClient;
  userId: string;
  conversationId: string;
  language?: 'ru' | 'en';
}): Promise<{
  audit: GroomingAudit;
  reply: string;
  planView: import('./types').GroomingPlanView;
} | null> {
  const pending = await loadPendingAudit(input.store, input.userId, input.conversationId);
  if (!pending) return null;
  const ambiguous = Array.isArray(pending.snapshot.ambiguous)
    ? (pending.snapshot.ambiguous as unknown[]).filter(
        (item): item is string => typeof item === 'string'
      )
    : [];
  return {
    audit: pending,
    reply: formatGroomingPlan({
      auditId: pending.id,
      proposals: pending.proposals,
      summary: pending.summary,
      warnings: pending.warnings,
      ambiguous,
      language: input.language,
    }),
    planView: toGroomingPlanView(pending, pending.warnings, ambiguous),
  };
}

export async function loadWorkspaceHealth(input: {
  store: SupabaseClient;
  userId: string;
}): Promise<{ health: WorkspaceHealth; snapshotWarnings: string[] }> {
  const snapshot = await collectWorkspaceSnapshot({
    store: input.store,
    userId: input.userId,
    scope: 'all',
    projectId: null,
  });
  const generated = generateGroomingProposals({
    snapshot,
    scope: 'all',
    projectId: null,
  });
  return {
    health: computeProjectHealth(snapshot, generated.proposals),
    snapshotWarnings: generated.warnings,
  };
}

/**
 * Client-safe contracts for the Pierrot workspace grooming engine.
 *
 * The engine proposes operations over existing systems. It is not a second
 * task manager, memory store or project system.
 */

export const GROOMING_SCOPES = [
  'all',
  'conversations',
  'projects',
  'tasks',
  'memory',
  'github',
  'context',
] as const;

export type GroomingScope = (typeof GROOMING_SCOPES)[number];

export type GroomingRisk = 'safe' | 'reversible' | 'confirmation';

export type GroomingOperation =
  | 'create_task'
  | 'create_reminder'
  | 'create_artifact'
  | 'complete_task'
  | 'merge_tasks'
  | 'reopen_task'
  | 'archive_task'
  | 'move_task'
  | 'reclassify_task'
  | 'update_task'
  | 'link_github_issue'
  | 'create_memory'
  | 'update_memory'
  | 'merge_memory'
  | 'archive_memory'
  | 'reclassify_memory'
  | 'link_project'
  | 'update_project_context'
  | 'update_project_summary'
  | 'create_issue'
  | 'update_issue'
  | 'link_pull_request'
  | 'sync_remote_status'
  | 'create_context_summary'
  | 'update_context_summary'
  | 'archive_context_reference';

export type GroomingEntityType =
  'task' | 'memory' | 'project' | 'conversation' | 'github_issue' | 'github_pull_request';

export type GroomingProposalStatus =
  'proposed' | 'approved' | 'rejected' | 'executed' | 'failed' | 'skipped' | 'stale';

export type GroomingAuditStatus =
  | 'prepared'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type GroomingSourceRef = {
  type:
    | 'conversation_message'
    | 'memory_record'
    | 'project'
    | 'project_review'
    | 'github_issue'
    | 'github_pull_request'
    | 'github_commit'
    | 'context_summary'
    | 'workspace_rule';
  id?: string | null;
  title?: string | null;
  url?: string | null;
  quote?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type GroomingProposal = {
  id: string;
  ordinal: number;
  operation: GroomingOperation;
  entityType: GroomingEntityType;
  entityId: string | null;
  projectId: string | null;
  projectName: string | null;
  title: string;
  reason: string;
  expectedResult: string;
  sourceRefs: GroomingSourceRef[];
  params: Record<string, unknown>;
  beforeState: Record<string, unknown>;
  confidence: number;
  risk: GroomingRisk;
  status: GroomingProposalStatus;
  selected: boolean;
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
};

export type GroomingAuditSummary = {
  messageCount: number;
  taskCount: number;
  memoryCount: number;
  projectCount: number;
  githubLinkCount: number;
  githubErrorCount: number;
  staleSummaryCount: number;
  duplicateCandidates: number;
  ambiguousCount: number;
  /** Actual messages read, when the collector knows it. */
  sourceMessageCount?: number;
  /** Canonical and preserved legacy conversations used by the audit. */
  conversationCount?: number;
  openTaskCount?: number;
  questionableTaskCount?: number;
  decisionCount?: number;
  materialCount?: number;
  contradictionCount?: number;
  cleanedTaskCount?: number;
};

export type GroomingAudit = {
  id: string;
  scope: GroomingScope;
  projectId: string | null;
  status: GroomingAuditStatus;
  createdAt: string;
  expiresAt: string;
  summary: GroomingAuditSummary;
  proposals: GroomingProposal[];
  warnings: string[];
};

export type ProjectHealthState = 'healthy' | 'attention' | 'blocked';

export type ProjectHealth = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  state: ProjectHealthState;
  activeTasks: number;
  staleTasks: number;
  unlinkedTasks: number;
  duplicateCandidates: number;
  unresolvedDecisions: number;
  githubErrors: number;
  staleSummary: boolean;
  pendingProposals: number;
  reasons: string[];
};

export type WorkspaceHealth = {
  generatedAt: string;
  totalProjects: number;
  attentionProjects: number;
  blockedProjects: number;
  staleTasks: number;
  unlinkedTasks: number;
  duplicateCandidates: number;
  githubErrors: number;
  staleSummaries: number;
  projects: ProjectHealth[];
};

export type GroomingExecutionResult = {
  proposalId: string;
  ordinal: number;
  operation: GroomingOperation;
  result: 'executed' | 'skipped' | 'failed' | 'stale';
  title: string;
  detail: string;
  entityId: string | null;
  link?: string | null;
  errorCode?: string | null;
};

export type GroomingExecutionReport = {
  auditId: string;
  status: 'completed' | 'partial' | 'failed';
  results: GroomingExecutionResult[];
  executed: number;
  skipped: number;
  failed: number;
  stale: number;
};

export type GroomingPlanViewProposal = {
  id: string;
  ordinal: number;
  operation: GroomingOperation;
  title: string;
  reason: string;
  expectedResult: string;
  risk: GroomingRisk;
  projectName: string | null;
  sourceRefs: GroomingSourceRef[];
};

export type GroomingPlanView = {
  auditId: string;
  scope: GroomingScope;
  proposals: GroomingPlanViewProposal[];
  warnings: string[];
  ambiguous: string[];
};

export function isBulkApprovable(proposal: Pick<GroomingProposal, 'risk'>): boolean {
  return proposal.risk !== 'confirmation';
}

export function groomingRiskLabel(risk: GroomingRisk): string {
  if (risk === 'safe') return 'безопасно';
  if (risk === 'reversible') return 'обратимо';
  return 'требует подтверждения';
}

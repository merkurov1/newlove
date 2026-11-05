/**
 * Shared Dev Mode types.
 *
 * This file must stay free of runtime imports: it is imported by both server
 * modules and client components.
 */

export type DevRepositoryKey = 'newlove' | 'pierrot';

export type DevRepositoryConfig = {
  key: DevRepositoryKey;
  label: string;
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  workBranch: string;
  description: string;
  /** True when a server-side token can reach this repository. */
  configured: boolean;
};

export type DevRepositoryStatus = {
  key: DevRepositoryKey;
  fullName: string;
  defaultBranch: string;
  workBranch: string;
  accessible: boolean;
  authenticated: boolean;
  lastCommitSha: string | null;
  lastCommitAt: string | null;
  checkedAt: string;
  error: string | null;
};

export type DevToolMeta = {
  repository: string;
  branch: string;
  commitSha: string | null;
  /** False when GitHub returned a partial or ref-limited result. */
  complete: boolean;
  source: 'github';
  warnings?: string[];
};

export type DevToolTraceEntry = {
  name: string;
  repository: string | null;
  ok: boolean;
  durationMs: number;
  summary: string;
  meta: DevToolMeta | null;
  errorCode?: string | null;
};

export type DevToolEvent = {
  type: 'status' | 'tool' | 'error';
  phase?:
    | 'researching'
    | 'searching'
    | 'reading'
    | 'analyzing'
    | 'task'
    | 'review'
    | 'failed'
    | 'completed';
  label?: string;
  tool?: string;
  repository?: string | null;
  ok?: boolean;
  summary?: string;
  code?: string;
};

export type DevTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type DevRequestStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partially_completed';

export type DevRequestMeta = {
  requestId: string;
  status: DevRequestStatus;
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  provider: string | null;
  model: string | null;
  usage: DevTokenUsage;
  sideEffects: Array<{ tool: string; repository: string | null; summary: string }>;
  errorCode: string | null;
};

export type DevModelResult = {
  reply: string;
  provider: string;
  model: string;
  toolTrace: DevToolTraceEntry[];
  events: DevToolEvent[];
  usage: DevTokenUsage;
  requestId: string;
  status: 'completed' | 'partially_completed';
  latencyMs: number;
  sideEffects: Array<{ tool: string; repository: string | null; summary: string }>;
};

export type DevTaskStatus =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'verified'
  | 'rejected'
  | 'archived';

export type DevVerificationStatus =
  | 'verified'
  | 'verified_with_warnings'
  | 'not_verified'
  | 'rejected';

export type DevTask = {
  id: string;
  userId: string | null;
  title: string;
  objective: string;
  context: string;
  repository: DevRepositoryKey | string;
  baseRef: string;
  baseCommit: string | null;
  affectedFiles: string[];
  currentBehavior: string;
  requiredBehavior: string;
  technicalPlan: string;
  backendChanges: string[];
  frontendChanges: string[];
  databaseChanges: string[];
  mobileChanges: string[];
  migrations: string[];
  securityConstraints: string[];
  tests: string[];
  acceptanceCriteria: string[];
  unverified: string[];
  conversationId: string | null;
  /** Source memory/decision IDs in pierrot_decisions. */
  decisionIds: string[];
  status: DevTaskStatus;
  verificationStatus: DevVerificationStatus | null;
  verificationNotes: string;
  pullRequests: string[];
  resultCommit: string | null;
  resultNotes: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  promptText: string;
};

export type DevTaskInput = {
  title: string;
  objective?: string;
  context?: string;
  repository?: DevRepositoryKey | string;
  baseRef?: string;
  baseCommit?: string | null;
  affectedFiles?: string[];
  currentBehavior?: string;
  requiredBehavior?: string;
  technicalPlan?: string;
  backendChanges?: string[];
  frontendChanges?: string[];
  databaseChanges?: string[];
  mobileChanges?: string[];
  migrations?: string[];
  securityConstraints?: string[];
  tests?: string[];
  acceptanceCriteria?: string[];
  unverified?: string[];
  conversationId?: string | null;
  decisionIds?: string[];
  status?: DevTaskStatus;
};

export type DevReviewSeverity = 'blocker' | 'high' | 'medium' | 'low' | 'info';

export type DevReviewFinding = {
  severity: DevReviewSeverity;
  file: string | null;
  line: number | null;
  problem: string;
  impact: string;
  recommendation: string;
};

export type DevReviewReport = {
  taskId: string;
  repository: string;
  baseRef: string;
  headRef: string;
  baseCommit: string | null;
  headCommit: string | null;
  verdict: DevVerificationStatus;
  summary: string;
  changedFiles: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
    patchTruncated: boolean;
  }>;
  findings: DevReviewFinding[];
  checks: {
    available: boolean;
    testsExecuted: boolean;
    runs: Array<{
      name: string;
      status: string | null;
      conclusion: string | null;
      url: string | null;
    }>;
    note: string;
  };
  acceptanceCriteria: Array<{
    criterion: string;
    evidence: string;
    status: 'satisfied' | 'not_verified' | 'failed';
  }>;
  generatedAt: string;
  limitations: string[];
};

export type DevMemoryEntry = {
  id: string;
  title: string;
  area: string;
  repository: DevRepositoryKey;
  source: string;
  updatedAt: string;
  commitSha: string | null;
  status: 'current' | 'stale' | 'superseded';
  content: string;
};

/**
 * Engineering Workbench shared types.
 *
 * This file must stay free of runtime imports: it is imported by both server
 * modules and client components.
 */

export type DevWorkbenchTaskStatus =
  | 'draft'
  | 'ready'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'verified'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'archived'
  | 'blocked';

export type DevAttemptStatus =
  | 'created'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type DevBatchStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type DevWorkerStatus = 'online' | 'idle' | 'busy' | 'draining' | 'offline' | 'error';

export type DevWorkbenchTask = {
  id: string;
  title: string;
  objective: string;
  repository: string;
  baseRef: string;
  status: DevWorkbenchTaskStatus;
  priority: number;
  queuePosition: number | null;
  queuedAt: string | null;
  attemptCount: number;
  acceptanceCriteria: string[];
  verificationStatus: string | null;
  blockedReason: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  resultCommit: string | null;
  resultNotes: string;
  pullRequests: string[];
  updatedAt: string;
  createdAt: string;
};

export type DevAttempt = {
  id: string;
  taskId: string;
  attemptNumber: number;
  status: DevAttemptStatus;
  workerId: string | null;
  branch: string | null;
  baseRef: string | null;
  baseCommit: string | null;
  headSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  opencodeSessionId: string | null;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  progressStage: string | null;
  resultSummary: string | null;
  changedFiles: string[];
  commands: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped' | 'unknown';
    detail?: string;
  }>;
  warnings: string[];
  verification?: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  logExcerpt: string | null;
  createdAt: string;
};

export type DevWorker = {
  id: string;
  name: string;
  kind: string;
  status: DevWorkerStatus;
  version: string | null;
  hostname: string | null;
  codespaceName: string | null;
  repository: string | null;
  capabilities: {
    opencodeVersion?: string;
    opencodeAvailable?: boolean;
    opencodeAuthenticated?: boolean;
    nodeVersion?: string;
    lastCheckedAt?: string;
    [key: string]: unknown;
  };
  currentTaskId: string | null;
  currentAttemptId: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  stopRequested: boolean;
  heartbeatAgeSeconds: number | null;
  online: boolean;
};

export type DevEvent = {
  id: number;
  taskId: string | null;
  attemptId: string | null;
  workerId: string | null;
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type DevBatch = {
  id: string;
  title: string;
  description: string;
  status: DevBatchStatus;
  priority: number;
  itemCount: number;
  items: Array<{
    id: string;
    taskId: string;
    title: string;
    status: DevWorkbenchTaskStatus;
    position: number;
    dependsOnTaskId: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type DevReviewView = {
  task: DevWorkbenchTask;
  attempt: DevAttempt | null;
  criteria: Array<{
    criterion: string;
    status: 'satisfied' | 'not_verified' | 'failed';
    evidence: string;
    source: 'diff' | 'ci' | 'local' | 'manual' | 'none';
  }>;
  changedFiles: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
    patchTruncated: boolean;
  }>;
  checks: Array<{
    name: string;
    status: string | null;
    conclusion: string | null;
    url: string | null;
  }>;
  findings: Array<{
    severity: string;
    file: string | null;
    problem: string;
    recommendation: string;
  }>;
  verdict: string | null;
  summary: string;
  limitations: string[];
  prUrl: string | null;
  mergeable: boolean;
  deployment: DevDeploymentStatus | null;
};

export type DevDeploymentStatus = {
  state: 'ready' | 'building' | 'error' | 'queued' | 'unavailable' | 'unknown';
  url: string | null;
  target: string | null;
  commitSha: string | null;
  checkedAt: string;
  reason: string | null;
};

export type DevSetupCheck = {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error' | 'missing';
  detail: string;
  /** Name of the environment variable that must be set, when applicable. */
  requiredEnv?: string | null;
  /** Exact permission or action the owner must grant. */
  requiredScope?: string | null;
  checkedAt: string;
  /** Last time this integration actually passed its health check. */
  lastSuccessAt?: string | null;
  action?: 'start_codespace' | 'create_codespace' | 'recheck' | 'apply_migration' | null;
  data?: Record<string, unknown>;
};

export type DevSetupReport = {
  ready: boolean;
  checks: DevSetupCheck[];
  blocking: string[];
  codespaces: {
    available: boolean;
    name: string | null;
    state: string | null;
    repository: string | null;
    machine: string | null;
    canStart: boolean | null;
    error: string | null;
  };
};

export type DevWorkbenchOverview = {
  schemaReady: boolean;
  migrationFile: string;
  queuePaused: boolean;
  counts: Record<string, number>;
  inbox: DevWorkbenchTask[];
  queue: DevWorkbenchTask[];
  batches: DevBatch[];
  active: {
    task: DevWorkbenchTask;
    attempt: DevAttempt;
    worker: DevWorker | null;
    events: DevEvent[];
  } | null;
  history: Array<{ task: DevWorkbenchTask; attempts: DevAttempt[] }>;
  review: DevWorkbenchTask[];
  workers: DevWorker[];
  recentEvents: DevEvent[];
  updatedAt: string;
};

export type DevWorkbenchAction =
  | 'approve'
  | 'enqueue'
  | 'dequeue'
  | 'cancel'
  | 'retry'
  | 'accept'
  | 'reject'
  | 'merge'
  | 'archive'
  | 'reorder'
  | 'pause_queue'
  | 'resume_queue'
  | 'create_batch'
  | 'update_batch'
  | 'reorder_batch'
  | 'set_batch_dependency'
  | 'block'
  | 'generate_worker_token'
  | 'start_codespace'
  | 'stop_codespace'
  | 'create_codespace'
  | 'stop_worker'
  | 'release_worker'
  | 'reap'
  | 'set_priority';

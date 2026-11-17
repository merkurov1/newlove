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
  /**
   * Latest persisted estimate when one exists, otherwise a deterministic
   * preview computed from the task text. The preview is never persisted and
   * the stored estimate is written before a task enters the queue.
   */
  costEstimate?: DevCostEstimate | null;
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

export type DevWorkerReadiness = {
  ready: boolean;
  configOk: boolean;
  apiOk: boolean;
  supabaseOk: boolean;
  opencodeOk: boolean;
  versionOk: boolean;
  authOk: boolean;
  authProbeOk?: boolean;
  minimumVersion: string;
  provider: string | null;
  reasons: string[];
  checkedAt: string;
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
    authProbeOk?: boolean;
    authProbeError?: string | null;
    nodeVersion?: string;
    lastCheckedAt?: string;
    ready?: boolean;
    readiness?: DevWorkerReadiness;
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

export type DevCostConfidence = 'low' | 'medium' | 'high';

export type DevCostValue = {
  minUsd: number | null;
  expectedUsd: number | null;
  maxUsd: number | null;
};

/** Immutable tariff metadata stored alongside every estimate and actual cost. */
export type DevCostRate = {
  version: string;
  source: string;
  effectiveAt: string;
  currency: string;
};

export type DevCostModelRate = DevCostRate & {
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
  cacheReadPerMillionUsd: number | null;
  cacheWritePerMillionUsd: number | null;
};

export type DevCostEstimate = {
  /** True only for a value read back from the append-only estimate table. */
  persisted: boolean;
  pricingVersion: string;
  currency: string;
  createdAt: string;
  confidence: DevCostConfidence;
  assumptions: string[];
  model: {
    provider: string | null;
    model: string | null;
    minUsd: number | null;
    expectedUsd: number | null;
    maxUsd: number | null;
    inputTokens: { min: number; expected: number; max: number };
    outputTokens: { min: number; expected: number; max: number };
    rate: DevCostModelRate;
    assumptions: string[];
  };
  codespaces: {
    machine: string | null;
    minUsd: number | null;
    expectedUsd: number | null;
    maxUsd: number | null;
    runtimeMs: { min: number; expected: number; max: number };
    hourlyUsd: number | null;
    rate: DevCostRate;
    assumptions: string[];
  };
  total: DevCostValue;
  unknown: string[];
};

/** Actual model usage plus Codespaces runtime for one attempt. */
export type DevAttemptCost = {
  model: {
    provider: string | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    /** Best-known model cost: provider-reported when present, else estimated. */
    costUsd: number | null;
    /** Provider-reported cost only. */
    reportedCostUsd: number | null;
    /** Computed from tokens and a versioned tariff when the provider omitted cost. */
    estimatedCostUsd: number | null;
    costKind: 'reported' | 'estimated' | 'unknown';
    steps: number;
    provenance: string;
    rate: DevCostModelRate | null;
  };
  codespace: {
    machine: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    runtimeMs: number | null;
    billableMs: number | null;
    hourlyUsd: number | null;
    /** Computed SKU-rate value; never presented as a GitHub invoice. */
    estimatedUsd: number | null;
    /** Reserved for confirmed per-attempt GitHub billing data. */
    confirmedUsd: number | null;
    costKind: 'estimated' | 'confirmed' | 'unknown';
    billingSource: string;
    storageUsd: number | null;
    sharedUsd: number | null;
    provenance: string;
    rate: DevCostRate | null;
  };
  totalUsd: number | null;
  unknown: string[];
  measuredAt: string;
};

export type DevCostComponentSummary = {
  reportedUsd: number | null;
  estimatedUsd: number | null;
  confirmedUsd: number | null;
  effectiveUsd: number | null;
  reportedAttempts: number;
  estimatedAttempts: number;
  confirmedAttempts: number;
  missingAttempts: number;
  unknown: string[];
};

export type DevCostVariance = {
  expectedUsd: number | null;
  actualUsd: number | null;
  deltaUsd: number | null;
  deltaPct: number | null;
  status: 'under' | 'over' | 'on_target' | 'unknown';
};

export type DevCostAttemptTotals = {
  model: DevCostComponentSummary;
  codespaces: DevCostComponentSummary;
  totalUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  attempts: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    timedOut: number;
    retries: number;
  };
  commands: {
    total: number;
    failed: number;
  };
  missingCostAttempts: number;
};

export type DevCostAggregate = {
  estimate: DevCostValue;
  actual: DevCostAttemptTotals;
  variance: DevCostVariance;
  taskCount: number;
  successfulTasks: number;
  successfulTasksWithCost: number;
  averageSuccessfulTaskUsd: number | null;
  incomplete: {
    missingEstimateTasks: number;
    attemptsMissingCost: number;
    unknown: string[];
  };
};

export type DevCostLedgerTask = DevCostAggregate & {
  taskId: string;
  title: string;
  status: DevWorkbenchTaskStatus;
  batchId: string | null;
  /** The stored or preview estimate detail; aggregate estimate is `estimate`. */
  costEstimate: DevCostEstimate | null;
};

export type DevCostLedgerBatch = DevCostAggregate & {
  batchId: string;
  title: string;
  status: DevBatchStatus;
  taskIds: string[];
};

export type DevCodespaceBillingSnapshot = {
  status: 'confirmed' | 'unavailable';
  source: string;
  checkedAt: string;
  reason: string | null;
  totalMinutesUsed: number | null;
  totalPaidMinutesUsed: number | null;
  includedMinutes: number | null;
  minutesUsedBreakdown: Record<string, number> | null;
};

export type DevCodespaceSessionCost = {
  startedAt: string | null;
  finishedAt: string | null;
  machine: string | null;
  runtimeMs: number | null;
  hourlyUsd: number | null;
  estimatedUsd: number | null;
  currency: string;
  pricingVersion: string | null;
  source: string;
  reason: string | null;
  attemptRuntimeMs: number;
  idleRuntimeMs: number | null;
  idleEstimatedUsd: number | null;
};

export type DevCostLedger = {
  generatedAt: string;
  currency: string;
  periodDays: number;
  periodFrom: string;
  pricing: {
    model: DevCostRate;
    codespaces: DevCostRate;
  };
  estimatesTableReady: boolean;
  confirmedBilling: DevCodespaceBillingSnapshot;
  totals: DevCostAggregate;
  period: DevCostAggregate;
  tasks: DevCostLedgerTask[];
  batches: DevCostLedgerBatch[];
  codespaces: {
    sessions: DevCodespaceSessionCost[];
    periodSessionEstimatedUsd: number | null;
    periodIdleEstimatedUsd: number | null;
    note: string;
  };
  dataQuality: {
    attemptsExamined: number;
    attemptsMissingCost: number;
    missingEstimateTasks: number;
    unknown: string[];
  };
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

export type DevLifecycleStatus =
  | 'offline'
  | 'starting_codespace'
  | 'codespace_available'
  | 'worker_missing'
  | 'worker_offline'
  | 'starting_worker'
  | 'checking_opencode'
  | 'checking_provider'
  | 'ready'
  | 'executing_task'
  | 'waiting_for_shutdown'
  | 'stopping_codespace'
  | 'blocked';

export type DevLifecycleCost = {
  modelUsd: number | null;
  modelReportedUsd: number | null;
  modelEstimatedUsd: number | null;
  codespaceEstimatedUsd: number | null;
  codespaceConfirmedUsd: number | null;
  totalUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  attemptsWithCost: number;
  attemptsMissingCost: number;
  attemptsWithEstimatedModel: number;
  attemptsWithEstimatedCodespace: number;
  unknown: string[];
  provenance: string;
};

export type DevLifecycleSnapshot = {
  status: DevLifecycleStatus;
  label: string;
  detail: string;
  schemaReady: boolean;
  codespace: {
    name: string | null;
    state: string | null;
    repository: string | null;
    machine: string | null;
    webUrl: string | null;
    idleTimeoutMinutes: number | null;
    lastUsedAt: string | null;
  } | null;
  codespaceError: string | null;
  worker: {
    id: string;
    name: string;
    online: boolean;
    status: string;
    ready: boolean;
    version: string | null;
    opencodeVersion: string | null;
    readiness: DevWorkerReadiness | null;
    readinessAgeSeconds: number | null;
    readinessFresh: boolean;
    heartbeatAgeSeconds: number | null;
    currentTaskId: string | null;
    currentAttemptId: string | null;
  } | null;
  workerRegistered: boolean;
  queue: {
    queued: number;
    active: number;
    paused: boolean;
  };
  executing: boolean;
  idleSeconds: number | null;
  idleGraceSeconds: number;
  startupGraceSeconds: number;
  pendingStart: boolean;
  pendingStartAttempts: number;
  pendingStartInfo: {
    phase: 'requested' | 'starting' | 'available' | 'worker_registered' | 'failed';
    requestedAt: string;
    ageSeconds: number | null;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: string | null;
    lastObservedState: string | null;
    lastHttpStatus: number | null;
    lastError: string | null;
  } | null;
  shutdownRequested: boolean;
  lastStartAt: string | null;
  lastStartState: string | null;
  lastStartObservedState: string | null;
  lastStartHttpStatus: number | null;
  lastStartConfirmedAt: string | null;
  lastReadyAt: string | null;
  lastKeepaliveAt: string | null;
  lastStopAt: string | null;
  lastBoot: {
    at: string;
    phase: string;
    message: string;
    workerId: string;
  } | null;
  recovery: {
    lastAttemptAt: string | null;
    failures: number;
    circuitOpenUntil: string | null;
    lastReason: string | null;
    blocked: boolean;
  } | null;
  lastStop: {
    requestedAt: string;
    measuredRuntimeMs: number | null;
    startupMs: number | null;
    idleSeconds: number | null;
    reason: string;
  } | null;
  lastError: string | null;
  lastErrorCode: string | null;
  cost: DevLifecycleCost;
  updatedAt: string;
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
  lifecycle: DevLifecycleSnapshot;
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
  | 'start_batch'
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

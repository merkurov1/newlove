import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  WORKER_OFFLINE_AFTER_SECONDS,
  WORKER_LEASE_SECONDS,
  assertTaskTransition,
  branchNameForAttempt,
  truncateLog,
  truncateText,
} from './state';
import { estimateTaskCost } from './costs';
import type {
  DevAttempt,
  DevAttemptStatus,
  DevBatch,
  DevBatchStatus,
  DevCostEstimate,
  DevEvent,
  DevWorker,
  DevWorkerStatus,
  DevWorkbenchTask,
  DevWorkbenchTaskStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/store');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9._:-]{4,120}$/;
export const COST_LEDGER_MIGRATION_FILE = '2026-12-10_pierrot_dev_cost_ledger.sql';
const BASE_TASK_COLUMNS =
  'id,user_id,title,task,objective,repository,base_ref,status,priority,queue_position,queued_at,attempt_count,acceptance_criteria,verification_status,blocked_reason,last_error_code,last_error_message,result_commit,result_notes,pull_requests,created_at,updated_at';
const ACTIONS_ROUTING_TASK_COLUMNS = ',assigned_executor,actions_dispatch_requested_at';
const ACTIONS_DISPATCH_TASK_COLUMNS =
  ',actions_dispatch_status,actions_dispatch_reason_code,actions_dispatch_reason,actions_dispatch_correlation_id,actions_dispatch_attempts,actions_dispatch_last_attempt_at,actions_dispatch_next_retry_at,actions_dispatch_updated_at';
const EXECUTION_RETRY_TASK_COLUMNS = ',retry_after_at';
const ACTIONS_DISPATCH_STATUSES = new Set([
  'requested',
  'accepted',
  'claimable',
  'claimed',
  'retry_scheduled',
  'not_claimable',
  'ineligible',
  'failed',
]);
const ATTEMPT_COLUMNS =
  'id,task_id,attempt_number,status,worker_id,branch,base_ref,base_commit,head_sha,pr_number,pr_url,opencode_session_id,exit_code,started_at,finished_at,heartbeat_at,lease_expires_at,progress_stage,result_summary,changed_files,commands,verification,warnings,error_code,error_message,log_excerpt,created_at';

export const WORKBENCH_MIGRATION_FILE = '2026-11-22_pierrot_dev_workbench.sql';
export const EXECUTION_RETRY_MIGRATION_FILE = '2026-12-16_pierrot_dev_execution_retry.sql';

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isWorkerId(value: unknown): value is string {
  return typeof value === 'string' && WORKER_ID_PATTERN.test(value);
}

export class WorkbenchUnavailableError extends Error {
  readonly code = 'DEV_WORKBENCH_MIGRATION_REQUIRED';

  constructor() {
    super(`Engineering Workbench requires the additive migration ${WORKBENCH_MIGRATION_FILE}.`);
    this.name = 'WorkbenchUnavailableError';
  }
}

function store() {
  return getServerSupabaseClient({ useServiceRole: true });
}

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  return `${String(record.code || '')} ${String(record.message || '')} ${String(
    record.details || ''
  )}`;
}

export function isMissingRelation(error: unknown): boolean {
  return /PGRST205|42P01|relation .* does not exist|Could not find the table/i.test(
    errorText(error)
  );
}

function isDuplicate(error: unknown): boolean {
  return /23505|duplicate key/i.test(errorText(error));
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.slice(0, 4000))
    : [];
}

function normalizeTaskStatus(value: unknown): DevWorkbenchTaskStatus {
  const status = String(value || 'draft').toLowerCase();
  if (status === 'used') return 'archived';
  const allowed: DevWorkbenchTaskStatus[] = [
    'draft',
    'ready',
    'queued',
    'in_progress',
    'review',
    'verified',
    'failed',
    'manual_review',
    'rejected',
    'cancelled',
    'archived',
    'blocked',
  ];
  return (allowed as string[]).includes(status) ? (status as DevWorkbenchTaskStatus) : 'draft';
}

function normalizeAttemptStatus(value: unknown): DevAttemptStatus {
  const status = String(value || 'created').toLowerCase();
  const allowed: DevAttemptStatus[] = [
    'created',
    'claimed',
    'running',
    'completed',
    'failed',
    'cancelled',
    'timed_out',
  ];
  return (allowed as string[]).includes(status) ? (status as DevAttemptStatus) : 'created';
}

function repositoryKey(value: unknown): string {
  const full = String(value || 'merkurov1/newlove');
  return full.toLowerCase().includes('pierrot') ? 'pierrot' : 'newlove';
}

export function mapTaskRow(row: Record<string, unknown>): DevWorkbenchTask {
  return {
    id: String(row.id || ''),
    title: truncateText(row.title || row.task, 500) || 'Без названия',
    objective: truncateText(row.objective, 12_000),
    repository: repositoryKey(row.repository),
    baseRef: String(row.base_ref || 'main'),
    status: normalizeTaskStatus(row.status),
    priority: Number(row.priority || 0),
    queuePosition: typeof row.queue_position === 'number' ? row.queue_position : null,
    queuedAt: typeof row.queued_at === 'string' ? row.queued_at : null,
    attemptCount: Number(row.attempt_count || 0),
    acceptanceCriteria: list(row.acceptance_criteria),
    verificationStatus:
      typeof row.verification_status === 'string' ? row.verification_status : null,
    blockedReason: typeof row.blocked_reason === 'string' ? row.blocked_reason : null,
    lastErrorCode: typeof row.last_error_code === 'string' ? row.last_error_code : null,
    lastErrorMessage: typeof row.last_error_message === 'string' ? row.last_error_message : null,
    retryAfterAt: typeof row.retry_after_at === 'string' ? row.retry_after_at : null,
    assignedExecutor:
      row.assigned_executor === 'actions' || row.assigned_executor === 'codespace'
        ? row.assigned_executor
        : null,
    actionsDispatchRequestedAt:
      typeof row.actions_dispatch_requested_at === 'string'
        ? row.actions_dispatch_requested_at
        : null,
    actionsDispatchStatus:
      typeof row.actions_dispatch_status === 'string' &&
      ACTIONS_DISPATCH_STATUSES.has(row.actions_dispatch_status)
        ? (row.actions_dispatch_status as DevWorkbenchTask['actionsDispatchStatus'])
        : null,
    actionsDispatchReasonCode:
      typeof row.actions_dispatch_reason_code === 'string'
        ? row.actions_dispatch_reason_code
        : null,
    actionsDispatchReason:
      typeof row.actions_dispatch_reason === 'string' ? row.actions_dispatch_reason : null,
    actionsDispatchCorrelationId:
      typeof row.actions_dispatch_correlation_id === 'string'
        ? row.actions_dispatch_correlation_id
        : null,
    actionsDispatchAttempts: Number.isFinite(Number(row.actions_dispatch_attempts))
      ? Math.max(0, Math.trunc(Number(row.actions_dispatch_attempts)))
      : 0,
    actionsDispatchLastAttemptAt:
      typeof row.actions_dispatch_last_attempt_at === 'string'
        ? row.actions_dispatch_last_attempt_at
        : null,
    actionsDispatchNextRetryAt:
      typeof row.actions_dispatch_next_retry_at === 'string'
        ? row.actions_dispatch_next_retry_at
        : null,
    actionsDispatchUpdatedAt:
      typeof row.actions_dispatch_updated_at === 'string' ? row.actions_dispatch_updated_at : null,
    resultCommit: typeof row.result_commit === 'string' ? row.result_commit : null,
    resultNotes: truncateText(row.result_notes, 12_000),
    pullRequests: list(row.pull_requests),
    updatedAt: String(row.updated_at || ''),
    createdAt: String(row.created_at || ''),
  };
}

function mapCommands(value: unknown): DevAttempt['commands'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .slice(0, 40)
    .map((item) => {
      const status = String(item.status || 'unknown');
      return {
        name: truncateText(item.name, 300) || 'command',
        status: (['passed', 'failed', 'skipped', 'unknown'].includes(status)
          ? status
          : 'unknown') as 'passed' | 'failed' | 'skipped' | 'unknown',
        detail: truncateText(item.detail, 1000) || undefined,
      };
    });
}

export function mapAttemptRow(row: Record<string, unknown>): DevAttempt {
  return {
    id: String(row.id || ''),
    taskId: String(row.task_id || ''),
    attemptNumber: Number(row.attempt_number || 0),
    status: normalizeAttemptStatus(row.status),
    workerId: typeof row.worker_id === 'string' ? row.worker_id : null,
    branch: typeof row.branch === 'string' ? row.branch : null,
    baseRef: typeof row.base_ref === 'string' ? row.base_ref : null,
    baseCommit: typeof row.base_commit === 'string' ? row.base_commit : null,
    headSha: typeof row.head_sha === 'string' ? row.head_sha : null,
    prNumber: typeof row.pr_number === 'number' ? row.pr_number : null,
    prUrl: typeof row.pr_url === 'string' ? row.pr_url : null,
    opencodeSessionId: typeof row.opencode_session_id === 'string' ? row.opencode_session_id : null,
    exitCode: typeof row.exit_code === 'number' ? row.exit_code : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    heartbeatAt: typeof row.heartbeat_at === 'string' ? row.heartbeat_at : null,
    leaseExpiresAt: typeof row.lease_expires_at === 'string' ? row.lease_expires_at : null,
    progressStage: typeof row.progress_stage === 'string' ? row.progress_stage : null,
    resultSummary: truncateText(row.result_summary, 12_000),
    changedFiles: list(row.changed_files),
    commands: mapCommands(row.commands),
    warnings: list(row.warnings),
    verification:
      row.verification && typeof row.verification === 'object'
        ? (row.verification as Record<string, unknown>)
        : {},
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: truncateText(row.error_message, 2000),
    logExcerpt: truncateText(row.log_excerpt, 20_000),
    createdAt: String(row.created_at || ''),
  };
}

export function mapWorkerRow(row: Record<string, unknown>): DevWorker {
  const heartbeatAt = typeof row.last_heartbeat_at === 'string' ? row.last_heartbeat_at : null;
  const ageSeconds = heartbeatAt
    ? Math.max(0, Math.round((Date.now() - new Date(heartbeatAt).getTime()) / 1000))
    : null;
  const kind = String(row.kind || 'codespace');
  const reportedStatus = String(row.status || 'offline') as DevWorkerStatus;
  const fresh = ageSeconds !== null && ageSeconds <= WORKER_OFFLINE_AFTER_SECONDS;
  // `offline` is a terminal/owner-controlled status, not a heartbeat state. A
  // completed ephemeral runner keeps a fresh timestamp when it signs off, so
  // freshness alone must not make it look active again.
  const online = fresh && reportedStatus !== 'offline';
  // A row that never sent a heartbeat is also stale, not active history.
  const stale = !online && reportedStatus !== 'offline';
  const finished = !online && (reportedStatus === 'offline' || (kind === 'actions' && !stale));
  return {
    id: String(row.id || ''),
    name: String(row.name || row.id || 'worker'),
    kind,
    // The effective status is derived from the heartbeat. The stored row is
    // never rewritten or deleted: old workers remain visible as history.
    status: online ? reportedStatus : 'offline',
    reportedStatus,
    stale,
    finished,
    version: typeof row.version === 'string' ? row.version : null,
    hostname: typeof row.hostname === 'string' ? row.hostname : null,
    codespaceName: typeof row.codespace_name === 'string' ? row.codespace_name : null,
    repository: typeof row.repository === 'string' ? row.repository : null,
    capabilities:
      row.capabilities && typeof row.capabilities === 'object'
        ? (row.capabilities as DevWorker['capabilities'])
        : {},
    currentTaskId: typeof row.current_task_id === 'string' ? row.current_task_id : null,
    currentAttemptId: typeof row.current_attempt_id === 'string' ? row.current_attempt_id : null,
    lastHeartbeatAt: heartbeatAt,
    lastError: truncateText(row.last_error, 1000),
    stopRequested: row.stop_requested === true,
    heartbeatAgeSeconds: ageSeconds,
    online,
  };
}

function mapEventRow(row: Record<string, unknown>): DevEvent {
  const level = String(row.level || 'info');
  return {
    id: Number(row.id || 0),
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    attemptId: typeof row.attempt_id === 'string' ? row.attempt_id : null,
    workerId: typeof row.worker_id === 'string' ? row.worker_id : null,
    type: String(row.type || 'event'),
    level: (['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error',
    message: truncateText(row.message, 4000),
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at || ''),
  };
}

/** Schema probe, cheap and cached. Never runs migrations. */
let schemaCache: { ready: boolean; expiresAt: number } | null = null;

export async function isWorkbenchSchemaReady(force = false): Promise<boolean> {
  if (!force && schemaCache && schemaCache.expiresAt > Date.now()) return schemaCache.ready;

  try {
    const client = store();
    const checks = await Promise.all([
      client
        .from('pierrot_dev_prompts')
        .select('priority,queue_position,queued_at,attempt_count,result_notes,pull_requests')
        .limit(1),
      ...[
        'pierrot_dev_batches',
        'pierrot_dev_batch_items',
        'pierrot_dev_attempts',
        'pierrot_dev_events',
        'pierrot_dev_workers',
        'pierrot_dev_settings',
      ].map((table) => client.from(table).select('*', { head: true, count: 'exact' }).limit(1)),
    ]);
    const ready = checks.every((check) => !check.error);
    schemaCache = { ready, expiresAt: Date.now() + 60_000 };
    return ready;
  } catch {
    schemaCache = { ready: false, expiresAt: Date.now() + 30_000 };
    return false;
  }
}

export async function requireWorkbenchSchema(): Promise<void> {
  if (!(await isWorkbenchSchemaReady())) throw new WorkbenchUnavailableError();
}

/**
 * Prove that the worker API can reach its Supabase data plane. Unlike the
 * cached schema probe, this performs a real query and returns the sanitized
 * error so the worker readiness check cannot claim Supabase is healthy while
 * every actual read is failing.
 */
export async function pingWorkbenchStore(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await store().from('pierrot_dev_settings').select('key').limit(1);
    if (error) {
      return { ok: false, error: errorText(error).slice(0, 500) || 'Supabase query failed.' };
    }
    return { ok: true, error: null };
  } catch (caught) {
    return {
      ok: false,
      error: (caught instanceof Error ? caught.message : 'Supabase query failed.').slice(0, 500),
    };
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return fallback;
    return (data.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await store()
    .from('pierrot_dev_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function getIntegrationSuccessMap(): Promise<Record<string, string>> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_settings')
      .select('key,value')
      .like('key', 'integration_last_ok:%');
    if (error || !Array.isArray(data)) return {};
    const map: Record<string, string> = {};
    for (const row of data) {
      const key = String(row.key || '').replace('integration_last_ok:', '');
      const value = row.value;
      if (key && typeof value === 'string') map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

export async function recordIntegrationSuccess(key: string): Promise<void> {
  try {
    await setSetting(`integration_last_ok:${key}`, new Date().toISOString());
  } catch {
    // Setup reporting must not fail because a timestamp could not be written.
  }
}

export async function isQueuePaused(): Promise<boolean> {
  return (await getSetting<boolean>('queue_paused', false)) === true;
}

/**
 * Remember that the owner deliberately removed a task from the queue.
 * `dequeue` returns a task to `ready`, which is also the approval state; without
 * this durable marker the idle-time promotion would silently re-enqueue it.
 */
export async function setQueueOptOut(taskId: string, optedOut: boolean): Promise<void> {
  if (!isUuid(taskId)) return;
  try {
    await setSetting(`queue:optout:${taskId}`, {
      at: optedOut ? new Date().toISOString() : null,
    });
  } catch {
    // The transition itself is authoritative; promotion is best effort.
  }
}

async function queueOptOuts(taskIds: string[]): Promise<Set<string>> {
  const optedOut = new Set<string>();
  if (taskIds.length === 0) return optedOut;
  try {
    const keys = taskIds.map((id) => `queue:optout:${id}`);
    const { data } = await store().from('pierrot_dev_settings').select('key,value').in('key', keys);
    for (const row of data || []) {
      const value = row.value as { at?: unknown } | null;
      if (typeof value?.at === 'string' && value.at) optedOut.add(String(row.key));
    }
  } catch {
    // If the marker store is unavailable, fall back to not promoting anything
    // surprising: the caller can still enqueue explicitly.
  }
  return optedOut;
}

// ---------------------------------------------------------------------------
// Cost estimate ledger
// ---------------------------------------------------------------------------

export async function saveCostEstimate(input: {
  taskId: string;
  batchId?: string | null;
  estimate: DevCostEstimate;
  trigger: string;
}): Promise<boolean> {
  if (!isUuid(input.taskId)) return false;
  try {
    const { error } = await store()
      .from('pierrot_dev_cost_estimates')
      .insert({
        task_id: input.taskId,
        batch_id: isUuid(input.batchId) ? input.batchId : null,
        estimate: input.estimate,
        pricing_version: input.estimate.pricingVersion,
        currency: input.estimate.currency,
        source: input.trigger.slice(0, 80),
        created_at: new Date().toISOString(),
      });
    if (error) {
      if (!isMissingRelation(error)) {
        console.error('[dev-workbench] cost estimate save failed', { code: error.code });
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist a deterministic estimate before a task becomes queued. The optional
 * estimate table is additive; if it is not applied the enqueue still succeeds
 * and the event journal keeps the estimate payload.
 */
export async function recordTaskCostEstimate(input: {
  taskId: string;
  batchId?: string | null;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  trigger: string;
}): Promise<DevCostEstimate> {
  const codespaceMeta =
    (await getSetting<Record<string, unknown>>('lifecycle:codespace', {})) || {};
  const estimate = estimateTaskCost({
    title: input.title,
    objective: input.objective,
    acceptanceCriteria: input.acceptanceCriteria,
    machine: typeof codespaceMeta.machine === 'string' ? codespaceMeta.machine : null,
  });
  await saveCostEstimate({
    taskId: input.taskId,
    batchId: input.batchId,
    estimate,
    trigger: input.trigger,
  });
  return estimate;
}

export async function isCostLedgerTableReady(): Promise<boolean> {
  try {
    const { error } = await store()
      .from('pierrot_dev_cost_estimates')
      .select('task_id', { head: true, count: 'exact' })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** Latest estimate per task from the append-only estimate table. */
export async function listLatestCostEstimates(
  taskIds: string[]
): Promise<Map<string, DevCostEstimate>> {
  const result = new Map<string, DevCostEstimate>();
  const ids = taskIds.filter(isUuid).slice(0, 200);
  if (ids.length === 0) return result;
  try {
    const { data, error } = await store()
      .from('pierrot_dev_cost_estimates')
      .select('task_id,estimate,created_at')
      .in('task_id', ids)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !Array.isArray(data)) return result;
    for (const row of data) {
      const taskId = String(row.task_id || '');
      if (!taskId || result.has(taskId)) continue;
      if (!row.estimate || typeof row.estimate !== 'object' || Array.isArray(row.estimate)) {
        continue;
      }
      result.set(taskId, {
        ...(row.estimate as DevCostEstimate),
        persisted: true,
        createdAt:
          typeof row.created_at === 'string'
            ? row.created_at
            : (row.estimate as DevCostEstimate).createdAt,
      });
    }
    return result;
  } catch {
    return result;
  }
}

/** All attempts used by the cost dashboard, without the history-list cap. */
export async function listAttemptsForLedger(taskIds: string[]): Promise<DevAttempt[]> {
  const ids = taskIds.filter(isUuid).slice(0, 200);
  if (ids.length === 0) return [];
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .in('task_id', ids)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapAttemptRow(row));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function appendEvent(input: {
  taskId?: string | null;
  attemptId?: string | null;
  workerId?: string | null;
  type: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
}): Promise<void> {
  const row = {
    task_id: input.taskId || null,
    attempt_id: input.attemptId || null,
    worker_id: input.workerId || null,
    type: String(input.type || 'event').slice(0, 80),
    level: input.level || 'info',
    message: truncateText(input.message, 3900) || 'event',
    payload: input.payload || {},
    dedupe_key: input.dedupeKey || null,
  };
  const { error } = await store().from('pierrot_dev_events').insert(row);
  if (error && !isDuplicate(error)) {
    console.error('[dev-workbench] event append failed', { code: error.code, type: row.type });
  }
}

export async function listEvents(input: {
  taskId?: string;
  attemptId?: string;
  limit?: number;
}): Promise<DevEvent[]> {
  try {
    let query = store()
      .from('pierrot_dev_events')
      .select('*')
      .order('id', { ascending: false })
      .limit(Math.min(Math.max(input.limit || 40, 1), 200));
    if (input.taskId) query = query.eq('task_id', input.taskId);
    if (input.attemptId) query = query.eq('attempt_id', input.attemptId);
    const { data, error } = await query;
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((row) => mapEventRow(row)).reverse();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tasks and queue
// ---------------------------------------------------------------------------

export async function listTaskRows(input: {
  userId: string;
  statuses?: string[];
  limit?: number;
  orderByQueue?: boolean;
}): Promise<DevWorkbenchTask[]> {
  try {
    let query = store()
      .from('pierrot_dev_prompts')
      .select(await taskColumns())
      .limit(Math.min(Math.max(input.limit || 60, 1), 200));
    if (isUuid(input.userId)) query = query.eq('user_id', input.userId);
    if (input.statuses?.length) query = query.in('status', input.statuses);
    if (input.orderByQueue) {
      query = query
        .order('priority', { ascending: false })
        .order('queue_position', { ascending: true, nullsFirst: false })
        .order('queued_at', { ascending: true, nullsFirst: true });
    } else {
      query = query.order('updated_at', { ascending: false });
    }
    const { data, error } = await query;
    if (error) return [];
    return (Array.isArray(data) ? data : []).map((row) =>
      mapTaskRow(row as unknown as Record<string, unknown>)
    );
  } catch {
    return [];
  }
}

let actionsRoutingSchemaReady: boolean | null = null;
let actionsDispatchRecoverySchemaReady: boolean | null = null;
let executionRetrySchemaReady: boolean | null = null;

/**
 * True only when the additive Actions routing migration is applied. This is a
 * configuration check, not a fallback: callers must fail explicitly instead of
 * dispatching without the durable assignment/marker columns.
 */
export async function isActionsRoutingSchemaReady(force = false): Promise<boolean> {
  if (!force && actionsRoutingSchemaReady !== null) return actionsRoutingSchemaReady;
  try {
    const { error } = await store()
      .from('pierrot_dev_prompts')
      .select('assigned_executor,actions_dispatch_requested_at')
      .limit(1);
    actionsRoutingSchemaReady = !error;
  } catch {
    actionsRoutingSchemaReady = false;
  }
  return actionsRoutingSchemaReady;
}

/**
 * True only when 2026-12-14 dispatch-recovery columns are applied. The rest of
 * the workbench keeps working before it lands; dispatch then fails explicitly
 * instead of silently creating another permanent marker.
 */
export async function isActionsDispatchRecoverySchemaReady(force = false): Promise<boolean> {
  if (!force && actionsDispatchRecoverySchemaReady !== null) {
    return actionsDispatchRecoverySchemaReady;
  }
  try {
    const { error } = await store()
      .from('pierrot_dev_prompts')
      .select('actions_dispatch_status,actions_dispatch_attempts')
      .limit(1);
    actionsDispatchRecoverySchemaReady = !error;
  } catch {
    actionsDispatchRecoverySchemaReady = false;
  }
  return actionsDispatchRecoverySchemaReady;
}

/**
 * True only when the additive execution-retry migration is applied. Without it
 * the workbench keeps operating, but automatic retries degrade to a normal
 * terminal failure instead of writing a column that does not exist yet.
 */
export async function isExecutionRetrySchemaReady(force = false): Promise<boolean> {
  if (!force && executionRetrySchemaReady !== null) return executionRetrySchemaReady;
  try {
    const { error } = await store().from('pierrot_dev_prompts').select('retry_after_at').limit(1);
    executionRetrySchemaReady = !error;
  } catch {
    executionRetrySchemaReady = false;
  }
  return executionRetrySchemaReady;
}

/**
 * Select only columns that exist. Before the routing/recovery/retry migrations
 * are applied the rest of the workbench must keep working; callers then fail
 * explicitly (or degrade safely) with the migration file name.
 */
async function taskColumns(): Promise<string> {
  const routing = await isActionsRoutingSchemaReady();
  const recovery = routing ? await isActionsDispatchRecoverySchemaReady() : false;
  const retry = await isExecutionRetrySchemaReady();
  let columns = BASE_TASK_COLUMNS;
  if (routing) columns += ACTIONS_ROUTING_TASK_COLUMNS;
  if (recovery) columns += ACTIONS_DISPATCH_TASK_COLUMNS;
  if (retry) columns += EXECUTION_RETRY_TASK_COLUMNS;
  return columns;
}

/**
 * Queued tasks eligible for the server-side Actions dispatcher, in claim order.
 * Codespace-assigned and already-requested tasks are excluded by the caller
 * (the query is intentionally unscoped; dispatch is an owner-level action).
 */
export async function listQueuedTasksForDispatch(limit = 10): Promise<DevWorkbenchTask[]> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_prompts')
      .select(await taskColumns())
      .eq('status', 'queued')
      .is('blocked_reason', null)
      .order('priority', { ascending: false })
      .order('queue_position', { ascending: true, nullsFirst: false })
      .order('queued_at', { ascending: true, nullsFirst: true })
      .limit(Math.min(Math.max(limit, 1), 20));
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapTaskRow(row as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

/**
 * Atomically reserve (or safely renew) a queued task for one Actions dispatch.
 *
 * `p_expected_requested_at` is the compare-and-set revision. A first request
 * omits it and requires an empty marker; a bounded retry passes the current
 * marker so only the dispatcher that saw that exact reservation can renew it.
 * The database also refuses while any attempt is active, preserving the global
 * single-active-attempt guarantee.
 */
export async function reserveTaskForActionsDispatch(
  taskId: string,
  options: {
    correlationId: string;
    expectedRequestedAt?: string | null;
    maxAttempts?: number;
  } = { correlationId: '' }
): Promise<DevWorkbenchTask | null> {
  if (!isUuid(taskId)) return null;
  if (await isActionsDispatchRecoverySchemaReady()) {
    const correlationId = options.correlationId || `${taskId}:${Date.now().toString(36)}`;
    const { data, error } = await store().rpc('pierrot_dev_reserve_actions_dispatch', {
      p_task_id: taskId,
      p_correlation_id: correlationId,
      p_max_attempts: Math.min(Math.max(Math.trunc(options.maxAttempts || 5), 1), 20),
      p_expected_requested_at: options.expectedRequestedAt || null,
    });
    if (error || !data || typeof data !== 'object') return null;
    const record = data as { ok?: boolean; task?: Record<string, unknown> };
    if (record.ok !== true || !record.task) return null;
    return mapTaskRow(record.task);
  }

  // Legacy fallback until the additive recovery migration lands. It keeps the
  // old duplicate-launch guard; dispatch itself fails closed before this path.
  const now = new Date().toISOString();
  const { data, error } = await store()
    .from('pierrot_dev_prompts')
    .update({
      assigned_executor: 'actions',
      actions_dispatch_requested_at: now,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('status', 'queued')
    .is('actions_dispatch_requested_at', null)
    .select(await taskColumns())
    .maybeSingle();
  if (error || !data) return null;
  return mapTaskRow(data as unknown as Record<string, unknown>);
}

export type ActionsDispatchCompletion = {
  ok: boolean;
  action: string;
  code: string | null;
  task: DevWorkbenchTask | null;
};

/**
 * Record an accepted/claimed outcome, or atomically release/renew a reservation
 * after proving the task is still queued and no active attempt owns it.
 */
export async function completeTaskActionsDispatch(input: {
  taskId: string;
  correlationId?: string | null;
  outcome: 'accepted' | 'claimed' | 'retry' | 'terminal';
  reasonCode?: string | null;
  reason?: string | null;
  retryAt?: string | null;
  expectedRequestedAt?: string | null;
  terminal?: boolean;
  workerId?: string | null;
  executionId?: string | null;
  resetAttempts?: boolean;
}): Promise<ActionsDispatchCompletion> {
  if (!isUuid(input.taskId)) {
    return { ok: false, action: 'skipped', code: 'INVALID_TASK_ID', task: null };
  }
  if (!(await isActionsDispatchRecoverySchemaReady())) {
    return {
      ok: false,
      action: 'skipped',
      code: 'ACTIONS_DISPATCH_RECOVERY_MIGRATION_REQUIRED',
      task: null,
    };
  }
  try {
    const { data, error } = await store().rpc('pierrot_dev_complete_actions_dispatch', {
      p_task_id: input.taskId,
      p_correlation_id: input.correlationId || null,
      p_outcome: input.outcome,
      p_reason_code: input.reasonCode || null,
      p_reason: input.reason || null,
      p_retry_at: input.retryAt || null,
      p_expected_requested_at: input.expectedRequestedAt || null,
      p_terminal: input.terminal === true,
      p_worker_id: input.workerId || null,
      p_execution_id: input.executionId || null,
      p_reset_attempts: input.resetAttempts === true,
    });
    if (error || !data || typeof data !== 'object') {
      return { ok: false, action: 'skipped', code: 'DISPATCH_COMPLETION_FAILED', task: null };
    }
    const record = data as {
      ok?: boolean;
      action?: string;
      code?: string | null;
      task?: Record<string, unknown>;
    };
    return {
      ok: record.ok === true,
      action: String(record.action || 'skipped'),
      code: record.code ? String(record.code) : null,
      task: record.task ? mapTaskRow(record.task) : null,
    };
  } catch {
    return { ok: false, action: 'skipped', code: 'DISPATCH_COMPLETION_FAILED', task: null };
  }
}

/**
 * Reset every dispatch-observability field after an owner enqueue/retry/batch
 * start. The durable executor assignment is deliberately preserved so a
 * manually routed Codespace task is not silently moved to Actions.
 */
export async function clearTaskActionsDispatch(taskId: string): Promise<void> {
  if (!isUuid(taskId)) return;
  if (!(await isActionsRoutingSchemaReady())) return;
  try {
    const recoveryReady = await isActionsDispatchRecoverySchemaReady();
    await store()
      .from('pierrot_dev_prompts')
      .update({
        actions_dispatch_requested_at: null,
        ...(recoveryReady
          ? {
              actions_dispatch_status: null,
              actions_dispatch_reason_code: null,
              actions_dispatch_reason: null,
              actions_dispatch_correlation_id: null,
              actions_dispatch_attempts: 0,
              actions_dispatch_last_attempt_at: null,
              actions_dispatch_next_retry_at: null,
              actions_dispatch_updated_at: new Date().toISOString(),
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  } catch {
    // The next dispatcher reservation will surface any real write failure.
  }
}

/**
 * Current claim blockers for one queued task. Used only for diagnosis and for
 * deciding whether a previously terminal marker may be retried now; the claim
 * RPC remains the authority.
 */
export async function getTaskDispatchBlockers(taskId: string): Promise<{
  batchPaused: boolean;
  dependencyBlocked: boolean;
  activeAttemptForTask: boolean;
}> {
  const result = { batchPaused: false, dependencyBlocked: false, activeAttemptForTask: false };
  if (!isUuid(taskId)) return result;
  try {
    const client = store();
    const [itemsResult, attemptResult] = await Promise.all([
      client
        .from('pierrot_dev_batch_items')
        .select('batch_id,depends_on_task_id')
        .eq('task_id', taskId),
      client
        .from('pierrot_dev_attempts')
        .select('id')
        .eq('task_id', taskId)
        .in('status', ['claimed', 'running'])
        .limit(1),
    ]);
    result.activeAttemptForTask =
      Array.isArray(attemptResult.data) && attemptResult.data.length > 0;
    const items = Array.isArray(itemsResult.data) ? itemsResult.data : [];
    if (items.length === 0) return result;
    const batchIds = [
      ...new Set(items.map((row) => String(row.batch_id || '')).filter((id) => isUuid(id))),
    ];
    const dependencyIds = [
      ...new Set(
        items.map((row) => String(row.depends_on_task_id || '')).filter((id) => isUuid(id))
      ),
    ];
    const [batchesResult, dependenciesResult] = await Promise.all([
      batchIds.length
        ? client.from('pierrot_dev_batches').select('id,status').in('id', batchIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      dependencyIds.length
        ? client.from('pierrot_dev_prompts').select('id,status').in('id', dependencyIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    const batches = Array.isArray(batchesResult.data) ? batchesResult.data : [];
    result.batchPaused = batches.some((row) => String(row.status) === 'paused');
    const dependencies = Array.isArray(dependenciesResult.data) ? dependenciesResult.data : [];
    result.dependencyBlocked = dependencies.some(
      (row) => !['verified', 'archived'].includes(String(row.status))
    );
    return result;
  } catch {
    return result;
  }
}

export async function clearWorkerAttempt(
  workerId: string | null | undefined,
  attemptId: string
): Promise<void> {
  if (!workerId) return;
  // An ephemeral Actions runner is finished after its single attempt; a
  // Codespace worker becomes idle and can claim again. Both keep their row:
  // this is a sign-off, never a deletion.
  const status: DevWorkerStatus = workerId.startsWith('actions:') ? 'offline' : 'idle';
  try {
    await store()
      .from('pierrot_dev_workers')
      .update({
        status,
        current_task_id: null,
        current_attempt_id: null,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId)
      .eq('current_attempt_id', attemptId);
  } catch {
    // The attempt status is authoritative; a stale pointer is harmless.
  }
}

export async function getQueueSnapshot(): Promise<{
  queued: number;
  ready: number;
  active: number;
  activeTasks: number;
  review: number;
  activeBatches: number;
  paused: boolean;
  depthByPriority: Array<{ priority: number; count: number }>;
}> {
  try {
    const client = store();
    const [
      { count: queued },
      readyRows,
      { count: active },
      { count: activeTasks },
      { count: review },
      { count: activeBatches },
      paused,
    ] = await Promise.all([
      client
        .from('pierrot_dev_prompts')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'queued'),
      client.from('pierrot_dev_prompts').select('id').eq('status', 'ready').limit(200),
      client
        .from('pierrot_dev_attempts')
        .select('*', { head: true, count: 'exact' })
        .in('status', ['claimed', 'running']),
      client
        .from('pierrot_dev_prompts')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'in_progress'),
      client
        .from('pierrot_dev_prompts')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'review'),
      client
        .from('pierrot_dev_batches')
        .select('*', { head: true, count: 'exact' })
        .in('status', ['active', 'paused']),
      isQueuePaused(),
    ]);
    const readyIds = (readyRows.data || []).map((row) => String(row.id));
    // A task the owner deliberately dequeued is `ready` for state-machine
    // reasons, but it is not executable and must not block finalization or be
    // counted as work waiting for a worker.
    const optedOut = await queueOptOuts(readyIds);
    const ready = readyIds.filter((id) => !optedOut.has(`queue:optout:${id}`)).length;
    return {
      queued: queued || 0,
      ready,
      active: active || 0,
      activeTasks: activeTasks || 0,
      review: review || 0,
      activeBatches: activeBatches || 0,
      paused,
      depthByPriority: [],
    };
  } catch {
    return {
      queued: 0,
      ready: 0,
      active: 0,
      activeTasks: 0,
      review: 0,
      activeBatches: 0,
      paused: false,
      depthByPriority: [],
    };
  }
}

/**
 * Promote approved standalone tasks that are not attached to a batch.
 *
 * `ready` is the approval state. A task with no `queue_batch_id` owns its own
 * execution and must not sit idle forever just because the owner approved it
 * before the explicit-batch flow existed. Batch-owned ready tasks are left
 * untouched: only `start_batch` may enqueue them.
 */
export async function promoteStandaloneReadyTasks(limit = 20): Promise<number> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_prompts')
      .select('id,priority')
      .eq('status', 'ready')
      .is('queue_batch_id', null)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error || !Array.isArray(data) || data.length === 0) return 0;

    const optedOut = await queueOptOuts(data.map((row) => String(row.id)));
    let position = await nextQueuePosition();
    const queuedAt = new Date().toISOString();
    let promoted = 0;
    for (const row of data) {
      if (optedOut.has(`queue:optout:${row.id}`)) continue;
      // Supabase does not report an error when a conditional UPDATE matches
      // zero rows. Select the id back so a concurrent claim/dequeue cannot be
      // counted as a successful refill.
      const { data: updated, error: updateError } = await store()
        .from('pierrot_dev_prompts')
        .update({
          status: 'queued',
          queue_position: position,
          queued_at: queuedAt,
          last_error_code: null,
          last_error_message: null,
          updated_at: queuedAt,
        })
        .eq('id', String(row.id))
        .eq('status', 'ready')
        .select('id');
      if (updateError) continue;
      if (!Array.isArray(updated) || updated.length === 0) continue;
      promoted += 1;
      position += 1;
      await appendEvent({
        taskId: String(row.id),
        type: 'task.auto_enqueued',
        message:
          'Standalone approved task was returned to the execution queue after the queue was empty.',
        payload: { queuePosition: position - 1 },
        dedupeKey: `task-auto-enqueued:${row.id}`,
      }).catch(() => {});
    }
    return promoted;
  } catch {
    return 0;
  }
}

/**
 * Tasks whose successful attempt still needs integration. A review task with a
 * pull request is the primary candidate; verified tasks are included so a
 * restarted finalization can repair an interrupted status update.
 */
export async function listFinalizationTasks(
  limit = 100,
  options: { includeWithoutPullRequests?: boolean } = {}
): Promise<DevWorkbenchTask[]> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_prompts')
      .select(await taskColumns())
      .in('status', ['review', 'verified'])
      .order('updated_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (error || !Array.isArray(data)) return [];
    return data
      .map((row) => mapTaskRow(row as unknown as Record<string, unknown>))
      .filter(
        (task) => options.includeWithoutPullRequests === true || task.pullRequests.length > 0
      );
  } catch {
    return [];
  }
}

/**
 * Cross-instance mutual exclusion for Codespaces lifecycle operations.
 *
 * GitHub start/stop are mostly idempotent, but two concurrent Vercel instances
 * must not race a stop against a fresh start. The unique `dedupe_key` on the
 * append-only event journal gives us an atomic one-winner insert per time
 * window without a new table or a distributed lock service.
 */
export async function tryAcquireFinalizationLock(
  owner: string,
  windowMs = 30_000
): Promise<boolean> {
  const window = Math.min(Math.max(Math.trunc(windowMs), 10_000), 300_000);
  const bucket = Math.floor(Date.now() / window);
  const dedupeKey = `finalization-lock:${bucket}`;
  try {
    const { error } = await store()
      .from('pierrot_dev_events')
      .insert({
        type: 'finalization.lock',
        level: 'debug',
        message: 'Queue finalization lock acquired.',
        payload: { owner: owner.slice(0, 120), windowMs: window },
        dedupe_key: dedupeKey,
      });
    if (!error) return true;
    if (isDuplicate(error)) return false;
    console.error('[dev-workbench] finalization lock failed', { code: error.code });
    return false;
  } catch {
    return false;
  }
}

export async function tryAcquireLifecycleLock(
  name: 'start' | 'stop' | 'restart',
  owner: string,
  windowMs = 45_000
): Promise<boolean> {
  const window = Math.min(Math.max(Math.trunc(windowMs), 10_000), 300_000);
  const bucket = Math.floor(Date.now() / window);
  const dedupeKey = `lifecycle-lock:${name}:${bucket}`;
  try {
    const { error } = await store()
      .from('pierrot_dev_events')
      .insert({
        type: 'lifecycle.lock',
        level: 'debug',
        message: `${name} lifecycle lock acquired.`,
        payload: { owner: owner.slice(0, 120), windowMs: window },
        dedupe_key: dedupeKey,
      });
    if (!error) return true;
    if (isDuplicate(error)) return false;
    console.error('[dev-workbench] lifecycle lock failed', { code: error.code, name });
    return false;
  } catch {
    return false;
  }
}

export async function listRecentAttempts(limit = 50): Promise<DevAttempt[]> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapAttemptRow(row));
  } catch {
    return [];
  }
}

export async function getTaskRow(userId: string, taskId: string): Promise<DevWorkbenchTask | null> {
  if (!isUuid(taskId)) return null;
  try {
    let query = store()
      .from('pierrot_dev_prompts')
      .select(await taskColumns())
      .eq('id', taskId);
    if (isUuid(userId)) query = query.eq('user_id', userId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return mapTaskRow(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Internal (worker path) task lookup without an owner filter. */
export async function getTaskRowUnscoped(taskId: string): Promise<DevWorkbenchTask | null> {
  return getTaskRow('', taskId);
}

export type TaskExecutionMaterial = {
  id: string;
  userId: string | null;
  title: string;
  promptText: string;
  repository: string;
  baseRef: string;
  baseCommit: string | null;
  tests: string[];
  acceptanceCriteria: string[];
  securityConstraints: string[];
  affectedFiles: string[];
};

/** Full execution material for a task. Never includes secrets. */
export async function getTaskExecutionMaterial(
  taskId: string
): Promise<TaskExecutionMaterial | null> {
  if (!isUuid(taskId)) return null;
  try {
    const { data, error } = await store()
      .from('pierrot_dev_prompts')
      .select(
        'id,user_id,title,task,prompt_text,repository,base_ref,base_commit,tests,acceptance_criteria,security_constraints,affected_files'
      )
      .eq('id', taskId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: String(data.id),
      userId: typeof data.user_id === 'string' ? data.user_id : null,
      title: truncateText(data.title || data.task, 500) || 'Задача',
      promptText: truncateText(data.prompt_text, 40_000),
      repository: String(data.repository || 'merkurov1/newlove'),
      baseRef: String(data.base_ref || 'main'),
      baseCommit: typeof data.base_commit === 'string' ? data.base_commit : null,
      tests: list(data.tests),
      acceptanceCriteria: list(data.acceptance_criteria),
      securityConstraints: list(data.security_constraints),
      affectedFiles: list(data.affected_files),
    };
  } catch {
    return null;
  }
}

export async function patchTask(
  taskId: string,
  patch: Record<string, unknown>,
  expectedStatuses?: DevWorkbenchTaskStatus[]
): Promise<DevWorkbenchTask | null> {
  let query = store()
    .from('pierrot_dev_prompts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', taskId);
  // A compare-and-set guard is what makes owner transitions safe against a
  // concurrent claim. Without it, a dequeue that read `queued` just before a
  // worker claimed the row could overwrite `in_progress` with `ready` and
  // orphan the new attempt.
  if (expectedStatuses?.length) query = query.in('status', expectedStatuses);
  const { data, error } = await query.select(await taskColumns()).maybeSingle();
  if (error || !data) return null;
  return mapTaskRow(data as unknown as Record<string, unknown>);
}

/**
 * Owner-driven task transition with a closed state machine. Returns the
 * updated task or throws DevTransitionError.
 */
export async function transitionTask(input: {
  userId: string;
  taskId: string;
  to: DevWorkbenchTaskStatus;
  patch?: Record<string, unknown>;
  event?: { type: string; message: string; level?: 'debug' | 'info' | 'warn' | 'error' };
  extraEvents?: Array<{
    type: string;
    message: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
  }>;
}): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(input.userId, input.taskId);
  if (!task) return null;
  assertTaskTransition(task.status, input.to);

  const updated = await patchTask(
    input.taskId,
    {
      ...(input.patch || {}),
      status: input.to,
    },
    [task.status]
  );
  if (!updated) return null;

  if (input.event) {
    await appendEvent({
      taskId: task.id,
      type: input.event.type,
      level: input.event.level,
      message: input.event.message,
      payload: { from: task.status, to: input.to },
    });
  }
  for (const extra of input.extraEvents || []) {
    await appendEvent({
      taskId: task.id,
      type: extra.type,
      level: extra.level,
      message: extra.message,
      payload: { from: task.status, to: input.to },
    });
  }
  return updated;
}

export async function nextQueuePosition(): Promise<number> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_prompts')
      .select('queue_position')
      .eq('status', 'queued')
      .order('queue_position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return 1;
    return Number((data as { queue_position?: unknown }).queue_position || 0) + 1;
  } catch {
    return 1;
  }
}

export async function reorderQueue(
  userId: string,
  taskId: string,
  targetIndex: number
): Promise<boolean> {
  const queue = await listTaskRows({
    userId,
    statuses: ['queued'],
    limit: 200,
    orderByQueue: true,
  });
  const index = queue.findIndex((task) => task.id === taskId);
  if (index < 0) return false;
  const [moved] = queue.splice(index, 1);
  const target = Math.min(Math.max(0, Math.trunc(targetIndex)), queue.length);
  queue.splice(target, 0, moved);

  const client = store();
  for (let position = 0; position < queue.length; position += 1) {
    const { error } = await client
      .from('pierrot_dev_prompts')
      .update({ queue_position: position, updated_at: new Date().toISOString() })
      .eq('id', queue[position].id);
    if (error) return false;
  }
  await appendEvent({
    taskId,
    type: 'task.reordered',
    message: `Queue position changed to ${target + 1}.`,
    payload: { position: target + 1 },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

function mapBatchRow(row: Record<string, unknown>, items: DevBatch['items'] = []): DevBatch {
  return {
    id: String(row.id || ''),
    title: truncateText(row.title, 200) || 'Batch',
    description: truncateText(row.description, 2000),
    status: String(row.status || 'draft') as DevBatchStatus,
    priority: Number(row.priority || 0),
    itemCount: items.length,
    items,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

export async function listBatches(userId: string): Promise<DevBatch[]> {
  try {
    let query = store()
      .from('pierrot_dev_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (isUuid(userId)) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length === 0) return [];

    const ids = data.map((row) => String(row.id));
    const { data: itemRows } = await store()
      .from('pierrot_dev_batch_items')
      .select('id,batch_id,task_id,position,depends_on_task_id')
      .in('batch_id', ids)
      .order('position', { ascending: true });

    const taskIds = (itemRows || []).map((item) => String(item.task_id));
    const taskTitles = new Map<string, { title: string; status: DevWorkbenchTaskStatus }>();
    if (taskIds.length > 0) {
      const { data: tasks } = await store()
        .from('pierrot_dev_prompts')
        .select('id,title,task,status')
        .in('id', taskIds);
      for (const task of tasks || []) {
        taskTitles.set(String(task.id), {
          title: truncateText(task.title || task.task, 200) || 'Задача',
          status: normalizeTaskStatus(task.status),
        });
      }
    }

    return data.map((row) => {
      const items = (itemRows || [])
        .filter((item) => String(item.batch_id) === String(row.id))
        .map((item) => {
          const meta = taskTitles.get(String(item.task_id));
          return {
            id: String(item.id),
            taskId: String(item.task_id),
            title: meta?.title || 'Задача',
            status: meta?.status || ('draft' as DevWorkbenchTaskStatus),
            position: Number(item.position || 0),
            dependsOnTaskId:
              typeof item.depends_on_task_id === 'string' ? item.depends_on_task_id : null,
          };
        });
      return mapBatchRow(row, items);
    });
  } catch {
    return [];
  }
}

export async function createBatch(input: {
  userId: string;
  title: string;
  description?: string;
  taskIds: string[];
  status?: DevBatchStatus;
}): Promise<DevBatch | null> {
  const title = truncateText(input.title, 200).trim();
  if (!title) throw new Error('BATCH_TITLE_REQUIRED');
  const { data, error } = await store()
    .from('pierrot_dev_batches')
    .insert({
      user_id: isUuid(input.userId) ? input.userId : null,
      title,
      description: truncateText(input.description, 2000),
      status: input.status || 'draft',
    })
    .select('*')
    .single();
  if (error || !data) throw error || new Error('BATCH_CREATE_FAILED');

  const taskIds = [...new Set(input.taskIds.filter(isUuid))];
  if (taskIds.length > 0) {
    let ownedQuery = store().from('pierrot_dev_prompts').select('id').in('id', taskIds);
    if (isUuid(input.userId)) ownedQuery = ownedQuery.eq('user_id', input.userId);
    const { data: ownedTasks, error: ownedError } = await ownedQuery;
    if (ownedError) throw ownedError;
    const ownedIds = new Set((ownedTasks || []).map((row) => String(row.id)));
    if (taskIds.some((taskId) => !ownedIds.has(taskId))) {
      throw new Error('BATCH_TASK_NOT_FOUND');
    }

    const rows = taskIds.map((taskId, index) => ({
      batch_id: data.id,
      task_id: taskId,
      position: index,
    }));
    const { error: itemError } = await store().from('pierrot_dev_batch_items').insert(rows);
    if (itemError) throw itemError;
    await store()
      .from('pierrot_dev_prompts')
      .update({ queue_batch_id: data.id, updated_at: new Date().toISOString() })
      .in('id', taskIds);
  }
  await appendEvent({
    type: 'batch.created',
    message: `Batch "${title}" created with ${taskIds.length} task(s).`,
    payload: { batchId: data.id },
  });
  const batches = await listBatches(input.userId);
  return batches.find((batch) => batch.id === data.id) || null;
}

export type StartBatchResult = {
  ok: boolean;
  queued: number;
  notReady: Array<{ id: string; title: string; status: string }>;
  error?: string;
};

/**
 * Explicitly start a batch: validate that every task is actionable, enqueue all
 * ready tasks in batch order, then mark the batch active. Tasks already queued
 * or in progress are left alone. Terminal tasks remain part of the history.
 */
export async function startBatch(userId: string, batchId: string): Promise<StartBatchResult> {
  if (!isUuid(batchId)) {
    return { ok: false, queued: 0, notReady: [], error: 'BATCH_NOT_FOUND' };
  }

  let batchQuery = store().from('pierrot_dev_batches').select('id,status').eq('id', batchId);
  if (isUuid(userId)) batchQuery = batchQuery.eq('user_id', userId);
  const { data: batch, error: batchReadError } = await batchQuery.maybeSingle();
  if (batchReadError || !batch) {
    return { ok: false, queued: 0, notReady: [], error: 'BATCH_NOT_FOUND' };
  }
  if (['completed', 'archived'].includes(String(batch.status))) {
    return { ok: false, queued: 0, notReady: [], error: 'BATCH_CLOSED' };
  }

  const { data: items, error: itemError } = await store()
    .from('pierrot_dev_batch_items')
    .select('task_id,position')
    .eq('batch_id', batchId)
    .order('position', { ascending: true });
  if (itemError || !Array.isArray(items) || items.length === 0) {
    return { ok: false, queued: 0, notReady: [], error: 'BATCH_EMPTY' };
  }

  const taskIds = [...new Set(items.map((item) => String(item.task_id)))];
  let taskQuery = store()
    .from('pierrot_dev_prompts')
    .select('id,title,status,queue_position,objective,acceptance_criteria')
    .in('id', taskIds);
  if (isUuid(userId)) taskQuery = taskQuery.eq('user_id', userId);
  const { data: tasks, error: taskError } = await taskQuery;
  if (taskError || !Array.isArray(tasks) || tasks.length !== taskIds.length) {
    return { ok: false, queued: 0, notReady: [], error: 'BATCH_TASK_NOT_FOUND' };
  }

  const notReady = tasks
    .filter((task) => ['draft', 'blocked'].includes(String(task.status)))
    .map((task) => ({
      id: String(task.id),
      title: truncateText(task.title, 200) || 'Задача',
      status: String(task.status),
    }));
  if (notReady.length > 0) {
    return { ok: false, queued: 0, notReady, error: 'BATCH_NOT_READY' };
  }

  let position = await nextQueuePosition();
  const queuedAt = new Date().toISOString();
  let queued = 0;
  for (const task of tasks) {
    if (String(task.status) !== 'ready') continue;
    await recordTaskCostEstimate({
      taskId: String(task.id),
      batchId,
      title: truncateText(task.title, 500) || 'Задача',
      objective: truncateText(task.objective, 12_000),
      acceptanceCriteria: list(task.acceptance_criteria),
      trigger: 'start_batch',
    });
    const { error } = await store()
      .from('pierrot_dev_prompts')
      .update({
        status: 'queued',
        queue_position: position,
        queued_at: queuedAt,
        queue_batch_id: batchId,
        last_error_code: null,
        last_error_message: null,
        updated_at: queuedAt,
      })
      .eq('id', String(task.id))
      .eq('status', 'ready');
    if (error) {
      return { ok: false, queued, notReady: [], error: 'BATCH_START_FAILED' };
    }
    await clearTaskActionsDispatch(String(task.id));
    await setQueueOptOut(String(task.id), false);
    queued += 1;
    position += 1;
  }

  const { error: batchError } = await store()
    .from('pierrot_dev_batches')
    .update({ status: 'active', updated_at: queuedAt })
    .eq('id', batchId);
  if (batchError) {
    return { ok: false, queued, notReady: [], error: 'BATCH_START_FAILED' };
  }

  await appendEvent({
    type: 'batch.started',
    message: `Batch started; ${queued} task(s) queued in order.`,
    payload: { batchId, queued },
  });
  await maybeCompleteBatch(batchId);
  return { ok: true, queued, notReady: [] };
}

/** Batch id attached to a task, used to settle the batch after a task ends. */
export async function getBatchIdForTask(taskId: string): Promise<string | null> {
  if (!isUuid(taskId)) return null;
  try {
    const { data } = await store()
      .from('pierrot_dev_prompts')
      .select('queue_batch_id')
      .eq('id', taskId)
      .maybeSingle();
    return typeof data?.queue_batch_id === 'string' ? data.queue_batch_id : null;
  } catch {
    return null;
  }
}

/**
 * Mark an active batch completed once every item has left the executable
 * queue. `review` counts as execution-complete; verification remains a
 * separate owner decision.
 */
export async function maybeCompleteBatch(batchId: string): Promise<boolean> {
  if (!isUuid(batchId)) return false;
  try {
    const { data: batch } = await store()
      .from('pierrot_dev_batches')
      .select('id,status')
      .eq('id', batchId)
      .maybeSingle();
    if (!batch || !['active', 'paused'].includes(String(batch.status))) return false;

    const { data: items } = await store()
      .from('pierrot_dev_batch_items')
      .select('task_id')
      .eq('batch_id', batchId);
    const taskIds = (items || []).map((item) => String(item.task_id));
    if (taskIds.length === 0) return false;

    const { data: tasks } = await store()
      .from('pierrot_dev_prompts')
      .select('id,status')
      .in('id', taskIds);
    if (!Array.isArray(tasks) || tasks.length === 0) return false;

    const pending = tasks.some((task) =>
      ['draft', 'blocked', 'ready', 'queued', 'in_progress'].includes(String(task.status))
    );
    if (pending) return false;

    const now = new Date().toISOString();
    const { data: updated, error } = await store()
      .from('pierrot_dev_batches')
      .update({ status: 'completed', updated_at: now })
      .eq('id', batchId)
      .in('status', ['active', 'paused'])
      .select('id');
    if (error || !Array.isArray(updated) || updated.length === 0) return false;

    await appendEvent({
      type: 'batch.completed',
      message: `Batch completed after ${tasks.length} task(s).`,
      payload: { batchId, tasks: tasks.length },
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateBatchStatus(
  userId: string,
  batchId: string,
  status: DevBatchStatus
): Promise<boolean> {
  const client = store();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  let query = client.from('pierrot_dev_batches').update(patch).eq('id', batchId);
  if (isUuid(userId)) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) return false;
  await appendEvent({
    type: 'batch.status_changed',
    message: `Batch set to ${status}.`,
    payload: { batchId, status },
  });
  return true;
}

async function ownsBatch(userId: string, batchId: string): Promise<boolean> {
  let query = store().from('pierrot_dev_batches').select('id').eq('id', batchId);
  if (isUuid(userId)) query = query.eq('user_id', userId);
  const { data, error } = await query.maybeSingle();
  return Boolean(data) && !error;
}

export async function reorderBatchItem(
  userId: string,
  batchId: string,
  taskId: string,
  position: number
): Promise<boolean> {
  if (!(await ownsBatch(userId, batchId))) return false;
  const { data: rows, error } = await store()
    .from('pierrot_dev_batch_items')
    .select('id,task_id,position')
    .eq('batch_id', batchId)
    .order('position', { ascending: true });
  if (error || !Array.isArray(rows)) return false;
  const index = rows.findIndex((row) => String(row.task_id) === taskId);
  if (index < 0) return false;
  const [moved] = rows.splice(index, 1);
  const target = Math.min(Math.max(0, Math.trunc(position)), rows.length);
  rows.splice(target, 0, moved);
  for (let next = 0; next < rows.length; next += 1) {
    const { error: updateError } = await store()
      .from('pierrot_dev_batch_items')
      .update({ position: next })
      .eq('id', String(rows[next].id));
    if (updateError) return false;
  }
  await appendEvent({
    taskId,
    type: 'batch.item_reordered',
    message: `Batch item moved to position ${target + 1}.`,
    payload: { batchId, position: target },
  });
  return true;
}

export async function setBatchItemDependency(
  userId: string,
  batchId: string,
  taskId: string,
  dependsOnTaskId: string | null
): Promise<boolean> {
  if (dependsOnTaskId === taskId) return false;
  if (!(await ownsBatch(userId, batchId))) return false;
  if (dependsOnTaskId) {
    const { data } = await store()
      .from('pierrot_dev_batch_items')
      .select('task_id')
      .eq('batch_id', batchId)
      .eq('task_id', dependsOnTaskId)
      .maybeSingle();
    if (!data) return false;
  }
  const { error } = await store()
    .from('pierrot_dev_batch_items')
    .update({ depends_on_task_id: dependsOnTaskId })
    .eq('batch_id', batchId)
    .eq('task_id', taskId);
  if (error) return false;
  await appendEvent({
    taskId,
    type: 'batch.dependency_changed',
    message: dependsOnTaskId
      ? 'Batch dependency set; the task will wait for the dependency to be verified.'
      : 'Batch dependency cleared.',
    payload: { batchId, dependsOnTaskId },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export async function listWorkers(): Promise<DevWorker[]> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_workers')
      .select('*')
      .order('last_heartbeat_at', { ascending: false, nullsFirst: false })
      // Old rows are history, not deleted. Keep enough of them for Admin to
      // separate active workers from stale/finished records.
      .limit(50);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapWorkerRow(row));
  } catch {
    return [];
  }
}

export async function getWorker(workerId: string): Promise<DevWorker | null> {
  if (!isWorkerId(workerId)) return null;
  try {
    const { data, error } = await store()
      .from('pierrot_dev_workers')
      .select('*')
      .eq('id', workerId)
      .maybeSingle();
    if (error || !data) return null;
    return mapWorkerRow(data);
  } catch {
    return null;
  }
}

export async function registerWorker(input: {
  workerId: string;
  name: string;
  version?: string;
  hostname?: string;
  codespaceName?: string;
  repository?: string;
  kind?: 'codespace' | 'local' | 'actions';
  capabilities?: Record<string, unknown>;
  userId?: string;
}): Promise<DevWorker | null> {
  if (!isWorkerId(input.workerId)) throw new Error('INVALID_WORKER_ID');
  const kind =
    input.kind === 'actions' || input.kind === 'local' || input.kind === 'codespace'
      ? input.kind
      : 'codespace';
  const row = {
    id: input.workerId,
    user_id: isUuid(input.userId) ? input.userId : null,
    name: truncateText(input.name, 120) || input.workerId,
    kind,
    status: 'idle',
    version: truncateText(input.version, 80) || null,
    hostname: truncateText(input.hostname, 200) || null,
    codespace_name: truncateText(input.codespaceName, 120) || null,
    repository: truncateText(input.repository, 120) || null,
    capabilities: input.capabilities || {},
    last_heartbeat_at: new Date().toISOString(),
    last_error: null,
    stop_requested: false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await store()
    .from('pierrot_dev_workers')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error || !data) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (kind === 'actions' && (code === '23514' || /kind_check|check constraint/i.test(message))) {
      const migration = new Error(
        'The actions worker kind requires the additive migration 2026-12-12_pierrot_actions_executor.sql. Apply it before dispatching the Actions executor.'
      );
      (migration as Error & { code?: string; status?: number }).code =
        'ACTIONS_KIND_MIGRATION_REQUIRED';
      (migration as Error & { code?: string; status?: number }).status = 503;
      throw migration;
    }
    throw error || new Error('WORKER_REGISTER_FAILED');
  }
  const registeredReadiness =
    row.capabilities &&
    typeof row.capabilities === 'object' &&
    (row.capabilities as Record<string, unknown>).readiness;
  if (
    (row.capabilities as Record<string, unknown> | null)?.ready === true ||
    (registeredReadiness &&
      typeof registeredReadiness === 'object' &&
      (registeredReadiness as Record<string, unknown>).ready === true)
  ) {
    // A ready registration is proof that startup succeeded. Clear stale
    // pending/failed start state without writing on every heartbeat.
    await setSetting('lifecycle:pending_start', { at: null }).catch(() => {});
  }
  await appendEvent({
    workerId: input.workerId,
    type: 'worker.registered',
    message: `Worker ${row.name} registered (${row.version || 'unknown version'}).`,
    payload: {
      capabilities: row.capabilities,
      codespace: row.codespace_name,
      repository: row.repository,
    },
  });
  return mapWorkerRow(data);
}

export async function heartbeatWorker(input: {
  workerId: string;
  status?: DevWorkerStatus;
  capabilities?: Record<string, unknown>;
  lastError?: string | null;
}): Promise<{
  worker: DevWorker | null;
  stopRequested: boolean;
  cancelAttemptId: string | null;
  queuePaused: boolean;
}> {
  const client = store();
  const patch: Record<string, unknown> = {
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(input.status ? { status: input.status } : {}),
    ...(input.capabilities ? { capabilities: input.capabilities } : {}),
    ...(input.lastError !== undefined ? { last_error: input.lastError } : {}),
  };
  const { data, error } = await client
    .from('pierrot_dev_workers')
    .update(patch)
    .eq('id', input.workerId)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    return { worker: null, stopRequested: false, cancelAttemptId: null, queuePaused: false };
  }

  const worker = mapWorkerRow(data);

  // Keep the active attempt lease alive and surface cancellation.
  let cancelAttemptId: string | null = null;
  if (worker.currentAttemptId) {
    const attempt = await getAttempt(worker.currentAttemptId);
    if (attempt && (attempt.status === 'cancelled' || attempt.status === 'failed')) {
      cancelAttemptId = attempt.id;
    } else if (attempt && ['claimed', 'running'].includes(attempt.status)) {
      const { error: leaseError } = await client
        .from('pierrot_dev_attempts')
        .update({
          heartbeat_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + WORKER_LEASE_SECONDS * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', attempt.id)
        .in('status', ['claimed', 'running']);
      if (leaseError) {
        console.error('[dev-workbench] lease heartbeat failed', { code: leaseError.code });
      }
    }
  }

  return {
    worker,
    stopRequested: worker.stopRequested,
    cancelAttemptId,
    queuePaused: await isQueuePaused(),
  };
}

/**
 * Refresh only the worker liveness timestamp. The main worker loop is blocked
 * while OpenCode runs, so execution progress is the heartbeat that keeps the
 * worker visible as online. Status is intentionally untouched: a draining or
 * busy worker must not be changed by a progress update.
 */
export async function touchWorkerHeartbeat(workerId: string): Promise<void> {
  try {
    await store()
      .from('pierrot_dev_workers')
      .update({
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId);
  } catch {
    // The attempt lease is authoritative; a missed liveness touch is harmless.
  }
}

export async function requestWorkerStop(workerId: string): Promise<boolean> {
  const { error } = await store()
    .from('pierrot_dev_workers')
    .update({
      stop_requested: true,
      status: 'draining',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workerId);
  if (error) return false;
  await appendEvent({
    workerId,
    type: 'worker.stop_requested',
    level: 'warn',
    message: 'Owner requested a controlled worker stop.',
  });
  return true;
}

export async function clearWorkerStop(workerId: string): Promise<boolean> {
  const { error } = await store()
    .from('pierrot_dev_workers')
    .update({
      stop_requested: false,
      status: 'idle',
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', workerId);
  return !error;
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export async function getAttempt(attemptId: string): Promise<DevAttempt | null> {
  if (!isUuid(attemptId)) return null;
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('id', attemptId)
      .maybeSingle();
    if (error || !data) return null;
    return mapAttemptRow(data);
  } catch {
    return null;
  }
}

export async function listAttempts(taskId: string, limit = 20): Promise<DevAttempt[]> {
  if (!isUuid(taskId)) return [];
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('task_id', taskId)
      .order('attempt_number', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapAttemptRow(row));
  } catch {
    return [];
  }
}

/** Batched attempt lookup for history lists (avoids N+1 queries). */
export async function listAttemptsForTasks(
  taskIds: string[],
  limitPerTask = 5
): Promise<Map<string, DevAttempt[]>> {
  const grouped = new Map<string, DevAttempt[]>();
  const ids = taskIds.filter(isUuid).slice(0, 100);
  if (ids.length === 0) return grouped;
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .in('task_id', ids)
      .order('attempt_number', { ascending: false })
      .limit(Math.min(ids.length * limitPerTask, 300));
    if (error || !Array.isArray(data)) return grouped;
    for (const row of data) {
      const attempt = mapAttemptRow(row);
      const bucket = grouped.get(attempt.taskId) || [];
      if (bucket.length < limitPerTask) bucket.push(attempt);
      grouped.set(attempt.taskId, bucket);
    }
    return grouped;
  } catch {
    return grouped;
  }
}

export async function getActiveAttemptsForWorker(workerId: string): Promise<DevAttempt[]> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .eq('worker_id', workerId)
      .in('status', ['claimed', 'running'])
      .limit(5);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapAttemptRow(row));
  } catch {
    return [];
  }
}

export async function getActiveAttempt(): Promise<DevAttempt | null> {
  try {
    const { data, error } = await store()
      .from('pierrot_dev_attempts')
      .select(ATTEMPT_COLUMNS)
      .in('status', ['claimed', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return mapAttemptRow(data);
  } catch {
    return null;
  }
}

export async function patchAttempt(
  attemptId: string,
  patch: Record<string, unknown>,
  expectedStatuses?: DevAttemptStatus[]
): Promise<DevAttempt | null> {
  let query = store()
    .from('pierrot_dev_attempts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', attemptId);
  if (expectedStatuses?.length) query = query.in('status', expectedStatuses);
  const { data, error } = await query.select(ATTEMPT_COLUMNS).maybeSingle();
  if (error || !data) return null;
  return mapAttemptRow(data);
}

function mapClaimResult(
  data: unknown
): { task: DevWorkbenchTask; attempt: DevAttempt; prompt: string } | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { task?: Record<string, unknown>; attempt?: Record<string, unknown> };
  if (!record.task || !record.attempt) return null;
  return {
    task: mapTaskRow(record.task),
    attempt: mapAttemptRow(record.attempt),
    prompt: '',
  };
}

export async function claimNextTask(
  workerId: string,
  leaseSeconds = WORKER_LEASE_SECONDS
): Promise<{ task: DevWorkbenchTask; attempt: DevAttempt; prompt: string } | null> {
  await requireWorkbenchSchema();
  const { data, error } = await store().rpc('pierrot_dev_claim_next_task', {
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) {
    console.error('[dev-workbench] claim failed', { code: error.code, message: error.message });
    // A database/RPC failure is not "no work": surfacing it keeps the runner
    // failed instead of silently turning an infrastructure outage into a
    // successful no-op.
    const claimError = new Error(
      `The queue claim failed: ${String(error.message || 'unknown Supabase error').slice(0, 300)}`
    ) as Error & { code?: string; status?: number };
    claimError.code = 'DEV_CLAIM_RPC_FAILED';
    claimError.status = 503;
    throw claimError;
  }
  return mapClaimResult(data);
}

/**
 * Claim one explicitly requested task (GitHub Actions executor).
 *
 * The existing next-queued RPC is still the single queue mechanism. This
 * targeted variant only narrows the same atomic claim to one task id; it uses
 * the same advisory lock, worker liveness check, active-attempt guard and
 * FOR UPDATE SKIP LOCKED. If the additive migration is not applied the caller
 * receives TARGETED_CLAIM_RPC_MISSING and must fail closed instead of claiming
 * an unrelated task.
 */
export async function claimTask(
  workerId: string,
  taskId: string,
  leaseSeconds = WORKER_LEASE_SECONDS
): Promise<{ task: DevWorkbenchTask; attempt: DevAttempt; prompt: string } | null> {
  await requireWorkbenchSchema();
  const { data, error } = await store().rpc('pierrot_dev_claim_task', {
    p_task_id: taskId,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) {
    const code = String(error.code || '');
    const message = String(error.message || '');
    if (
      code === 'PGRST202' ||
      /function .*pierrot_dev_claim_task.* does not exist/i.test(message)
    ) {
      const missing = new Error(
        'Targeted claims require the additive migration 2026-12-12_pierrot_actions_executor.sql.'
      );
      (missing as Error & { code?: string }).code = 'TARGETED_CLAIM_RPC_MISSING';
      throw missing;
    }
    console.error('[dev-workbench] targeted claim failed', { code, message });
    const claimError = new Error(
      `The targeted queue claim failed: ${String(message || 'unknown Supabase error').slice(0, 300)}`
    ) as Error & { code?: string; status?: number };
    claimError.code = 'DEV_CLAIM_RPC_FAILED';
    claimError.status = 503;
    throw claimError;
  }
  return mapClaimResult(data);
}

/**
 * Release dispatch markers that still say `claimed` after their attempt ended.
 *
 * The lease reaper returns the task to `queued`, but it predates the Actions
 * dispatch columns and therefore cannot clear them. A queued task whose marker
 * is still `claimed` is never picked up by the dispatcher again; this safe,
 * conditional cleanup removes that stale marker without touching a live
 * attempt or a reservation owned by a newer workflow.
 */
export async function clearStaleClaimedDispatchMarkers(limit = 20): Promise<number> {
  if (!(await isActionsDispatchRecoverySchemaReady())) return 0;
  try {
    const client = store();
    const { data, error } = await client
      .from('pierrot_dev_prompts')
      .select('id')
      .eq('status', 'queued')
      .eq('actions_dispatch_status', 'claimed')
      .not('actions_dispatch_requested_at', 'is', null)
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error || !Array.isArray(data) || data.length === 0) return 0;

    const ids = data.map((row) => String(row.id)).filter(isUuid);
    if (ids.length === 0) return 0;

    const { data: activeRows } = await client
      .from('pierrot_dev_attempts')
      .select('task_id')
      .in('task_id', ids)
      .in('status', ['claimed', 'running']);
    const active = new Set((activeRows || []).map((row) => String(row.task_id)));
    const staleIds = ids.filter((id) => !active.has(id));
    if (staleIds.length === 0) return 0;

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await client
      .from('pierrot_dev_prompts')
      .update({
        actions_dispatch_requested_at: null,
        actions_dispatch_status: null,
        actions_dispatch_reason_code: null,
        actions_dispatch_reason: null,
        actions_dispatch_correlation_id: null,
        actions_dispatch_attempts: 0,
        actions_dispatch_last_attempt_at: null,
        actions_dispatch_next_retry_at: null,
        actions_dispatch_updated_at: now,
        updated_at: now,
      })
      .in('id', staleIds)
      // Re-check the exact stale condition so a concurrent claim/retry wins.
      .eq('status', 'queued')
      .eq('actions_dispatch_status', 'claimed')
      .select('id');
    if (updateError || !Array.isArray(updated)) return 0;
    return updated.length;
  } catch {
    return 0;
  }
}

export async function reapExpiredAttempts(): Promise<number> {
  try {
    const { data, error } = await store().rpc('pierrot_dev_reap_expired_attempts', {
      p_limit: 20,
    });
    if (error) return 0;
    const reaped = typeof data === 'number' ? data : 0;
    if (reaped > 0) {
      // The reaper requeues the first expired attempt. Any dispatch marker that
      // still says `claimed` belongs to that dead attempt and must not block
      // the next dispatch.
      await clearStaleClaimedDispatchMarkers().catch(() => 0);
    }
    if (reaped > 0 && (await isActionsDispatchRecoverySchemaReady())) {
      // The reaper clears actions_dispatch_requested_at when it requeues a
      // task. Normalize the new diagnostic fields for any queued task whose
      // marker is already gone so a lease retry starts with a fresh budget.
      try {
        await store()
          .from('pierrot_dev_prompts')
          .update({
            actions_dispatch_status: null,
            actions_dispatch_reason_code: null,
            actions_dispatch_reason: null,
            actions_dispatch_correlation_id: null,
            actions_dispatch_attempts: 0,
            actions_dispatch_last_attempt_at: null,
            actions_dispatch_next_retry_at: null,
            actions_dispatch_updated_at: new Date().toISOString(),
          })
          .eq('status', 'queued')
          .is('actions_dispatch_requested_at', null)
          .not('actions_dispatch_status', 'is', null);
      } catch {
        // Diagnostics are best effort; the marker itself is authoritative.
      }
    }
    return reaped;
  } catch {
    return 0;
  }
}

/**
 * Move a task back to the queue after a terminal failure/cancel/review without
 * touching previous attempts. Attempt numbering is handled by the claim RPC.
 */
export async function requeueTask(input: {
  userId: string;
  taskId: string;
  reason: string;
}): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(input.userId, input.taskId);
  if (!task) return null;
  const position = await nextQueuePosition();
  await recordTaskCostEstimate({
    taskId: task.id,
    batchId: await getBatchIdForTask(task.id),
    title: task.title,
    objective: task.objective,
    acceptanceCriteria: task.acceptanceCriteria,
    trigger: 'requeue',
  });
  const patch: Record<string, unknown> = {
    queue_position: position,
    queued_at: new Date().toISOString(),
    blocked_reason: null,
  };
  if (await isExecutionRetrySchemaReady()) {
    // An explicit owner requeue is not an automatic retry and must be eligible
    // immediately.
    patch.retry_after_at = null;
  }
  const queued = await transitionTask({
    userId: input.userId,
    taskId: input.taskId,
    to: 'queued',
    patch,
    event: {
      type: 'task.queued',
      message: `Task queued for attempt ${task.attemptCount + 1}. ${input.reason}`.trim(),
    },
  });
  if (queued) await clearTaskActionsDispatch(input.taskId);
  return queued;
}

export function leaseExpiryIso(seconds = WORKER_LEASE_SECONDS): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function expectedBranch(taskId: string, attemptNumber: number): string {
  return branchNameForAttempt(taskId, attemptNumber);
}

export { truncateLog };

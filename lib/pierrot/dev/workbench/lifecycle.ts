import { assertServerOnly } from '@/lib/serverOnly';
import {
  WorkbenchGitHubError,
  getCodespace,
  resolveCodespace,
  startCodespace,
  stopCodespace,
} from './github';
import type { CodespaceInfo } from './github';
import {
  getActiveAttempt,
  getQueueSnapshot,
  getSetting,
  isWorkbenchSchemaReady,
  listRecentAttempts,
  listWorkers,
  setSetting,
  tryAcquireLifecycleLock,
  appendEvent,
} from './store';
import { getConfiguredCodespaceName } from './setup';
import { readAttemptCost, summarizeCosts } from './costs';
import {
  decideCodespaceStart,
  decideWorkerRecovery,
  deriveLifecycleStatus,
  idleGraceSeconds,
  normalizeCodespaceState,
  startupGraceSeconds,
  WORKER_RECOVERY_CIRCUIT_SECONDS,
  WORKER_RECOVERY_CIRCUIT_THRESHOLD,
} from './lifecycleState';
import type { RecoveryState } from './lifecycleState';
import type { DevLifecycleSnapshot, DevWorker } from './types';

assertServerOnly('lib/pierrot/dev/workbench/lifecycle');

export {
  canStopCodespace,
  decideCodespaceStart,
  decideWorkerRecovery,
  deriveLifecycleStatus,
  idleGraceSeconds,
  normalizeCodespaceState,
  startupGraceSeconds,
  WORKER_RECOVERY_COOLDOWN_SECONDS,
  WORKER_RECOVERY_CIRCUIT_SECONDS,
  WORKER_RECOVERY_CIRCUIT_THRESHOLD,
} from './lifecycleState';
export type { LifecycleStatusInput, RecoveryDecision, RecoveryState, StartDecision } from './lifecycleState';

export type StartRecord = {
  at: string;
  requestedAt: string;
  codespaceName: string;
  machine: string | null;
  source: string;
  state: string;
  observedState: string | null;
  lastHttpStatus: number | null;
  confirmedAt: string | null;
};

export type ReadyRecord = {
  at: string;
  workerId: string;
};

export type StopRecord = {
  at: string;
  requestedAt: string;
  codespaceName: string;
  machine: string | null;
  reason: string;
  idleSeconds: number | null;
  measuredRuntimeMs: number | null;
  startupMs: number | null;
};

export type ShutdownIntent = {
  at: string;
  workerId: string;
  codespaceName: string;
  graceSeconds: number;
};

export type PendingStartPhase =
  | 'requested'
  | 'starting'
  | 'available'
  | 'worker_registered'
  | 'failed';

export type PendingStart = {
  at: string;
  requestedAt: string;
  codespaceName: string | null;
  source: string;
  reason: string;
  phase: PendingStartPhase;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastObservedState: string | null;
  lastHttpStatus: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

const PENDING_MAX_ATTEMPTS = 6;
const PENDING_RETRY_BASE_MS = 20_000;
const PENDING_RETRY_MAX_MS = 5 * 60_000;
const KEEPALIVE_INTERVAL_MS = 5 * 60_000;

export type BootRecord = {
  at: string;
  workerId: string;
  phase: string;
  message: string;
};

export type LifecycleError = {
  at: string;
  code: string;
  message: string;
};

type SettingRecord = Record<string, unknown> | null;

function objectSetting(value: unknown): SettingRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

async function readStart(): Promise<StartRecord | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_start', null));
  if (!value) return null;
  const at = iso(value.at);
  const requestedAt = iso(value.requestedAt);
  const codespaceName = typeof value.codespaceName === 'string' ? value.codespaceName : '';
  if (!at || !requestedAt || !codespaceName) return null;
  return {
    at,
    requestedAt,
    codespaceName,
    machine: typeof value.machine === 'string' ? value.machine : null,
    source: typeof value.source === 'string' ? value.source : 'unknown',
    state: typeof value.state === 'string' ? value.state : 'unknown',
    observedState: typeof value.observedState === 'string' ? value.observedState : null,
    lastHttpStatus:
      typeof value.lastHttpStatus === 'number' && Number.isFinite(value.lastHttpStatus)
        ? Math.trunc(value.lastHttpStatus)
        : null,
    confirmedAt: iso(value.confirmedAt),
  };
}

async function readReady(): Promise<ReadyRecord | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_ready', null));
  if (!value) return null;
  const at = iso(value.at);
  const workerId = typeof value.workerId === 'string' ? value.workerId : '';
  return at && workerId ? { at, workerId } : null;
}

async function readStop(): Promise<StopRecord | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_stop', null));
  if (!value) return null;
  const at = iso(value.at);
  const requestedAt = iso(value.requestedAt);
  const codespaceName = typeof value.codespaceName === 'string' ? value.codespaceName : '';
  if (!at || !requestedAt || !codespaceName) return null;
  return {
    at,
    requestedAt,
    codespaceName,
    machine: typeof value.machine === 'string' ? value.machine : null,
    reason: typeof value.reason === 'string' ? value.reason : 'idle',
    idleSeconds:
      typeof value.idleSeconds === 'number' && Number.isFinite(value.idleSeconds)
        ? Math.max(0, value.idleSeconds)
        : null,
    measuredRuntimeMs:
      typeof value.measuredRuntimeMs === 'number' && Number.isFinite(value.measuredRuntimeMs)
        ? Math.max(0, value.measuredRuntimeMs)
        : null,
    startupMs:
      typeof value.startupMs === 'number' && Number.isFinite(value.startupMs)
        ? Math.max(0, value.startupMs)
        : null,
  };
}

async function readIntent(): Promise<ShutdownIntent | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:shutdown_intent', null));
  if (!value) return null;
  const at = iso(value.at);
  if (!at) return null;
  return {
    at,
    workerId: typeof value.workerId === 'string' ? value.workerId : 'unknown',
    codespaceName: typeof value.codespaceName === 'string' ? value.codespaceName : '',
    graceSeconds:
      typeof value.graceSeconds === 'number' && Number.isFinite(value.graceSeconds)
        ? Math.max(0, value.graceSeconds)
        : idleGraceSeconds(),
  };
}

const PENDING_PHASES: PendingStartPhase[] = [
  'requested',
  'starting',
  'available',
  'worker_registered',
  'failed',
];

function normalizePendingPhase(value: unknown): PendingStartPhase {
  const phase = String(value || '').toLowerCase();
  return (PENDING_PHASES as string[]).includes(phase)
    ? (phase as PendingStartPhase)
    : 'requested';
}

async function readPendingStart(): Promise<PendingStart | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:pending_start', null));
  if (!value) return null;
  const at = iso(value.at);
  if (!at) return null;
  const attempts =
    typeof value.attempts === 'number' && Number.isFinite(value.attempts)
      ? Math.max(0, Math.trunc(value.attempts))
      : 1;
  const maxAttempts =
    typeof value.maxAttempts === 'number' && Number.isFinite(value.maxAttempts)
      ? Math.max(1, Math.trunc(value.maxAttempts))
      : PENDING_MAX_ATTEMPTS;
  return {
    at,
    requestedAt: iso(value.requestedAt) || at,
    codespaceName: typeof value.codespaceName === 'string' ? value.codespaceName : null,
    source: typeof value.source === 'string' ? value.source : 'unknown',
    reason: typeof value.reason === 'string' ? value.reason : 'pending',
    phase: normalizePendingPhase(value.phase),
    attempts,
    maxAttempts,
    nextAttemptAt: iso(value.nextAttemptAt) || at,
    lastObservedState:
      typeof value.lastObservedState === 'string' ? value.lastObservedState : null,
    lastHttpStatus:
      typeof value.lastHttpStatus === 'number' && Number.isFinite(value.lastHttpStatus)
        ? Math.trunc(value.lastHttpStatus)
        : null,
    lastCheckedAt: iso(value.lastCheckedAt),
    lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 800) : null,
  };
}

async function readBoot(): Promise<BootRecord | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_boot', null));
  if (!value) return null;
  const at = iso(value.at);
  if (!at) return null;
  return {
    at,
    workerId: typeof value.workerId === 'string' ? value.workerId : 'unknown',
    phase: typeof value.phase === 'string' ? value.phase : 'unknown',
    message: typeof value.message === 'string' ? value.message.slice(0, 800) : '',
  };
}

async function readRecovery(): Promise<RecoveryState | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:recovery', null));
  if (!value) return null;
  return {
    lastAttemptAt: iso(value.lastAttemptAt),
    failures:
      typeof value.failures === 'number' && Number.isFinite(value.failures)
        ? Math.max(0, Math.trunc(value.failures))
        : 0,
    circuitOpenUntil: iso(value.circuitOpenUntil),
    lastReason: typeof value.lastReason === 'string' ? value.lastReason.slice(0, 800) : null,
  };
}

async function readError(): Promise<LifecycleError | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_error', null));
  if (!value) return null;
  const at = iso(value.at);
  const code = typeof value.code === 'string' ? value.code : '';
  const message = typeof value.message === 'string' ? value.message.slice(0, 800) : '';
  if (!at || !code || !message) return null;
  return {
    at,
    code,
    message,
  };
}

async function readIdleSince(): Promise<string | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:idle_since', null));
  return value ? iso(value.at) : null;
}

async function readKeepalive(): Promise<string | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_keepalive', null));
  return value ? iso(value.at) : null;
}

export async function recordLifecycleError(code: string, message: string): Promise<void> {
  const safeMessage = message.slice(0, 800);
  await setSetting('lifecycle:last_error', {
    at: new Date().toISOString(),
    code: code.slice(0, 80),
    message: safeMessage,
  });
  await appendEvent({
    type: 'lifecycle.error',
    level: 'error',
    message: `${code}: ${safeMessage}`,
    payload: { code },
  }).catch(() => {});
}

export async function clearLifecycleError(): Promise<void> {
  await setSetting('lifecycle:last_error', { at: null, code: null, message: null });
}

export async function recordWorkerReady(workerId: string): Promise<void> {
  const [start, ready, recovery] = await Promise.all([readStart(), readReady(), readRecovery()]);
  // A confirmed ready heartbeat is the only signal that resets the controlled
  // recovery circuit. It also clears stale boot/auth errors.
  if (
    recovery &&
    (recovery.lastAttemptAt || recovery.failures > 0 || recovery.circuitOpenUntil)
  ) {
    await setSetting('lifecycle:recovery', {
      lastAttemptAt: null,
      failures: 0,
      circuitOpenUntil: null,
      lastReason: null,
    }).catch(() => {});
  }
  // Keep the first ready timestamp for the current start so startup duration is
  // not inflated by every heartbeat.
  if (ready && (!start || new Date(ready.at).getTime() >= new Date(start.at).getTime())) {
    return;
  }
  await setSetting('lifecycle:last_ready', {
    at: new Date().toISOString(),
    workerId,
  });
  await clearLifecycleError();
}

export async function recordWorkerIdle(input: {
  workerId: string;
  status: string;
  idleSince?: string | null;
}): Promise<void> {
  if (input.status === 'busy' || input.status === 'draining') {
    await setSetting('lifecycle:idle_since', { at: null, workerId: input.workerId });
    return;
  }
  const existing = await readIdleSince();
  if (existing) return;
  const at = iso(input.idleSince) || new Date().toISOString();
  await setSetting('lifecycle:idle_since', { at, workerId: input.workerId });
}

export async function recordBootStatus(input: {
  workerId: string;
  phase: string;
  message: string;
}): Promise<void> {
  await setSetting('lifecycle:last_boot', {
    at: new Date().toISOString(),
    workerId: input.workerId.slice(0, 120),
    phase: input.phase.slice(0, 80),
    message: input.message.slice(0, 800),
  });
  await appendEvent({
    workerId: input.workerId,
    type: 'worker.boot',
    level: input.phase === 'failed' ? 'error' : 'info',
    message: `${input.phase}: ${input.message.slice(0, 800)}`,
    payload: { phase: input.phase },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function chooseWorker(workers: DevWorker[], codespaceName: string | null): DevWorker | null {
  const online = workers.filter((worker) => worker.online);
  if (online.length === 0) return workers[0] || null;
  if (codespaceName) {
    const matching = online.find(
      (worker) => worker.codespaceName?.toLowerCase() === codespaceName.toLowerCase()
    );
    if (matching) return matching;
  }
  return online[0];
}

function secondsBetween(from: string | null, to = Date.now()): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.round((to - start) / 1000));
}

export async function getLifecycleSnapshot(): Promise<DevLifecycleSnapshot> {
  const updatedAt = new Date().toISOString();
  const schemaReady = await isWorkbenchSchemaReady();
  const [
    queue,
    workers,
    activeAttempt,
    start,
    ready,
    stop,
    intent,
    pending,
    error,
    idleSince,
    attempts,
    boot,
    recovery,
    keepaliveAt,
  ] = await Promise.all([
    getQueueSnapshot(),
    schemaReady ? listWorkers() : Promise.resolve([]),
    schemaReady ? getActiveAttempt() : Promise.resolve(null),
    readStart(),
    readReady(),
    readStop(),
    readIntent(),
    readPendingStart(),
    readError(),
    readIdleSince(),
    schemaReady ? listRecentAttempts(50) : Promise.resolve([]),
    readBoot(),
    readRecovery(),
    readKeepalive(),
  ]);

  let codespace: CodespaceInfo | null = null;
  let codespaceError: string | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch (caught) {
    codespaceError =
      caught instanceof Error ? caught.message : 'Codespaces API is unavailable.';
  }

  const worker = chooseWorker(workers, codespace?.name || null);
  const workerOnline = Boolean(worker?.online);
  const readiness =
    worker?.capabilities?.readiness &&
    typeof worker.capabilities.readiness === 'object' &&
    !Array.isArray(worker.capabilities.readiness)
      ? worker.capabilities.readiness
      : null;
  const readinessCheckedAt =
    (readiness?.checkedAt && typeof readiness.checkedAt === 'string'
      ? readiness.checkedAt
      : null) ||
    (typeof worker?.capabilities?.lastCheckedAt === 'string'
      ? worker.capabilities.lastCheckedAt
      : null);
  const readinessAgeSeconds = secondsBetween(readinessCheckedAt);
  const readinessFresh =
    readinessAgeSeconds !== null && readinessAgeSeconds <= 15 * 60;
  const workerReady = Boolean(
    workerOnline &&
      readinessFresh &&
      (worker?.capabilities?.ready === true || readiness?.ready === true)
  );
  const readinessReasons = Array.isArray(readiness?.reasons)
    ? readiness.reasons.filter((item): item is string => typeof item === 'string').slice(0, 8)
    : [];
  const opencodeOk = Boolean(
    readiness?.opencodeOk ??
      (worker?.capabilities?.opencodeAvailable === true &&
        worker?.capabilities?.opencodeAuthenticated === true)
  );
  const authOk = Boolean(readiness?.authOk ?? worker?.capabilities?.opencodeAuthenticated === true);
  const executing = Boolean(
    activeAttempt || queue.active > 0 || queue.activeTasks > 0 || worker?.currentAttemptId
  );
  const idleSeconds =
    workerOnline && !executing ? secondsBetween(idleSince || ready?.at || null) : null;
  const graceSeconds = idleGraceSeconds();
  const startedAt = start?.at || null;
  const startedRecently = Boolean(
    startedAt && (secondsBetween(startedAt) ?? Infinity) < startupGraceSeconds()
  );
  const errorIsStaleAuth = Boolean(
    authOk && error?.code && /AUTH|PROVIDER/i.test(error.code)
  );
  const lastError =
    (!errorIsStaleAuth ? error?.message : null) ||
    (!workerReady ? worker?.lastError : null) ||
    codespaceError ||
    null;
  const lastStartFailed = Boolean(error?.code?.startsWith('CODESPACE_START'));
  const shutdownRequested = Boolean(
    intent && Date.now() - new Date(intent.at).getTime() < 180_000
  );
  const recoveryState: RecoveryState = recovery || {
    lastAttemptAt: null,
    failures: 0,
    circuitOpenUntil: null,
    lastReason: null,
  };
  const circuitOpen = Boolean(
    recoveryState.circuitOpenUntil &&
      new Date(recoveryState.circuitOpenUntil).getTime() > Date.now()
  );
  const recoveryDecision = decideWorkerRecovery({
    codespaceState: codespace?.state || null,
    workerOnline,
    executing,
    queued: queue.queued,
    queuePaused: queue.paused,
    hasSignal: Boolean(start?.at || worker?.lastHeartbeatAt),
    signalAgeSeconds: secondsBetween(start?.at || worker?.lastHeartbeatAt || null),
    startupGraceSeconds: startupGraceSeconds(),
    recovery: recoveryState,
  });
  const pendingFailed = pending?.phase === 'failed';
  const recoveryBlocked =
    pendingFailed ||
    recoveryDecision.action === 'blocked' ||
    (!workerOnline && circuitOpen);

  const decision = deriveLifecycleStatus({
    schemaReady,
    codespaceState: codespace?.state || null,
    codespaceError,
    workerOnline,
    workerReady,
    workerRegistered: Boolean(worker),
    readinessReasons,
    opencodeOk,
    authOk,
    executing,
    queued: queue.queued,
    queuePaused: queue.paused,
    startedRecently,
    idleSeconds,
    graceSeconds,
    shutdownRequested,
    pendingStart: Boolean(pending),
    recoveryBlocked,
    recoveryReason: pendingFailed
      ? pending?.lastError ||
        'The Codespace start failed permanently. An explicit owner action is required.'
      : recoveryDecision.action === 'blocked'
        ? recoveryDecision.reason
        : pending
          ? 'A Codespace startup is pending; waiting for the next safe retry.'
          : recoveryState.lastReason,
    lastError,
    lastStartFailed,
  });

  const costs = attempts.map((attempt) => readAttemptCost(attempt.verification));
  const cost = summarizeCosts(costs);

  return {
    status: decision.status,
    label: decision.label,
    detail: decision.detail,
    schemaReady,
    codespace: codespace
      ? {
          name: codespace.name,
          state: codespace.state,
          repository: codespace.repository,
          machine: codespace.machine,
          webUrl: codespace.webUrl,
          idleTimeoutMinutes: codespace.idleTimeoutMinutes,
          lastUsedAt: codespace.lastUsedAt,
        }
      : null,
    codespaceError,
    worker: worker
      ? {
          id: worker.id,
          name: worker.name,
          online: workerOnline,
          status: worker.status,
          ready: workerReady,
          version: worker.version,
          opencodeVersion:
            typeof worker.capabilities?.opencodeVersion === 'string'
              ? worker.capabilities.opencodeVersion
              : null,
          readiness,
          readinessAgeSeconds,
          readinessFresh,
          heartbeatAgeSeconds: worker.heartbeatAgeSeconds,
          currentTaskId: worker.currentTaskId,
          currentAttemptId: worker.currentAttemptId,
        }
      : null,
    workerRegistered: Boolean(worker),
    queue: {
      queued: queue.queued,
      active: queue.active,
      paused: queue.paused,
    },
    executing,
    idleSeconds,
    idleGraceSeconds: graceSeconds,
    startupGraceSeconds: startupGraceSeconds(),
    pendingStart: Boolean(pending),
    pendingStartAttempts: pending?.attempts || 0,
    pendingStartInfo: pending
      ? {
          phase: pending.phase,
          requestedAt: pending.requestedAt,
          ageSeconds: secondsBetween(pending.requestedAt),
          attempts: pending.attempts,
          maxAttempts: pending.maxAttempts,
          nextAttemptAt: pending.nextAttemptAt,
          lastObservedState: pending.lastObservedState,
          lastHttpStatus: pending.lastHttpStatus,
          lastError: pending.lastError,
        }
      : null,
    shutdownRequested,
    lastStartAt: start?.at || null,
    lastStartState: start?.state || null,
    lastStartObservedState: start?.observedState || null,
    lastStartHttpStatus: start?.lastHttpStatus ?? null,
    lastStartConfirmedAt: start?.confirmedAt || null,
    lastReadyAt: ready?.at || null,
    lastKeepaliveAt: keepaliveAt,
    lastStopAt: stop?.at || null,
    lastBoot: boot,
    recovery: recovery
      ? {
          lastAttemptAt: recovery.lastAttemptAt,
          failures: recovery.failures,
          circuitOpenUntil: recovery.circuitOpenUntil,
          lastReason: recovery.lastReason,
          blocked:
            Boolean(
              recovery.circuitOpenUntil &&
                new Date(recovery.circuitOpenUntil).getTime() > Date.now()
            ) || recovery.failures >= 3,
        }
      : null,
    lastStop: stop
      ? {
          requestedAt: stop.requestedAt,
          measuredRuntimeMs: stop.measuredRuntimeMs,
          startupMs: stop.startupMs,
          idleSeconds: stop.idleSeconds,
          reason: stop.reason,
        }
      : null,
    lastError,
    lastErrorCode: error?.code || null,
    cost,
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export type EnsureStartResult = {
  action: 'noop' | 'already-available' | 'started' | 'start-pending' | 'blocked';
  codespace: CodespaceInfo | null;
  reason: string;
  pendingStart?: PendingStart | null;
};

async function rememberCodespace(codespace: CodespaceInfo): Promise<void> {
  await setSetting('lifecycle:codespace', {
    at: new Date().toISOString(),
    name: codespace.name,
    state: codespace.state,
    machine: codespace.machine,
    repository: codespace.repository,
    webUrl: codespace.webUrl,
  }).catch(() => {});
}

async function setLastStart(input: {
  codespace: CodespaceInfo;
  source: string;
  requestedAt: string;
  lastHttpStatus?: number | null;
  observedState?: string | null;
  confirmedAt?: string | null;
}): Promise<void> {
  await setSetting('lifecycle:last_start', {
    at: new Date().toISOString(),
    requestedAt: input.requestedAt,
    codespaceName: input.codespace.name,
    machine: input.codespace.machine,
    source: input.source,
    state: input.codespace.state,
    observedState: input.observedState ?? input.codespace.state,
    lastHttpStatus:
      typeof input.lastHttpStatus === 'number' ? Math.trunc(input.lastHttpStatus) : null,
    confirmedAt: input.confirmedAt || new Date().toISOString(),
  });
}

async function recordStartObservation(codespace: CodespaceInfo): Promise<void> {
  const start = await readStart();
  if (!start || start.codespaceName !== codespace.name) return;
  await setSetting('lifecycle:last_start', {
    at: start.at,
    requestedAt: start.requestedAt,
    codespaceName: start.codespaceName,
    machine: start.machine || codespace.machine,
    source: start.source,
    state: start.state,
    observedState: codespace.state,
    lastHttpStatus: start.lastHttpStatus,
    confirmedAt: new Date().toISOString(),
  }).catch(() => {});
}

function pendingRetryDelay(attempts: number): string {
  const delay = Math.min(
    PENDING_RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attempts - 1, 5)),
    PENDING_RETRY_MAX_MS
  );
  return new Date(Date.now() + delay).toISOString();
}

function pendingPhaseForState(state: string | null | undefined): PendingStartPhase {
  const normalized = normalizeCodespaceState(state);
  if (normalized === 'available') return 'available';
  if (['starting', 'queued', 'provisioning', 'rebuilding'].includes(normalized)) {
    return 'starting';
  }
  return 'requested';
}

async function clearPendingStart(): Promise<void> {
  await setSetting('lifecycle:pending_start', { at: null });
}

async function markPendingStart(input: {
  codespaceName: string | null;
  source: string;
  reason: string;
  attempts?: number;
  nextAttemptAt?: string;
  lastError?: string | null;
  phase?: PendingStartPhase;
  lastObservedState?: string | null;
  lastHttpStatus?: number | null;
  requestedAt?: string;
  maxAttempts?: number;
}): Promise<PendingStart> {
  const now = new Date().toISOString();
  const existing = await readPendingStart();
  const attempts = Math.max(1, input.attempts ?? (existing?.attempts || 0) + 1);
  const pending: PendingStart = {
    at: now,
    requestedAt: input.requestedAt || existing?.requestedAt || now,
    codespaceName: input.codespaceName ?? existing?.codespaceName ?? null,
    source: input.source,
    reason: input.reason,
    phase: input.phase || existing?.phase || 'requested',
    attempts,
    maxAttempts: Math.max(
      1,
      input.maxAttempts ?? existing?.maxAttempts ?? PENDING_MAX_ATTEMPTS
    ),
    nextAttemptAt:
      input.nextAttemptAt || existing?.nextAttemptAt || pendingRetryDelay(attempts),
    lastObservedState:
      input.lastObservedState !== undefined
        ? input.lastObservedState
        : existing?.lastObservedState || null,
    lastHttpStatus:
      input.lastHttpStatus !== undefined ? input.lastHttpStatus : existing?.lastHttpStatus || null,
    lastCheckedAt: now,
    lastError:
      input.lastError !== undefined
        ? input.lastError
        : existing?.lastError || null,
  };
  await setSetting('lifecycle:pending_start', pending);
  return pending;
}

async function saveRecovery(state: RecoveryState): Promise<void> {
  await setSetting('lifecycle:recovery', state).catch(() => {});
}

/**
 * Controlled, last-resort recovery for an Available Codespace with no live
 * worker. It is never part of the normal GET reconcile: only an explicit owner
 * action requests it. Every decision is recorded with a code and a reason.
 *
 * A restart is destructive (it stops a running machine), so it requires:
 * queued work, no active attempt, no online worker (including not-ready),
 * no shutdown intent, a proven boot signal past the startup grace, a cooldown
 * and an open circuit breaker. The stop is not awaited; the start is persisted
 * as pending state and completed by a later idempotent retry.
 */
async function recoverDeadWorker(
  codespace: CodespaceInfo,
  source: string
): Promise<EnsureStartResult | null> {
  const [workers, queue, activeAttempt, start, intent, recovery] = await Promise.all([
    listWorkers(),
    getQueueSnapshot(),
    getActiveAttempt(),
    readStart(),
    readIntent(),
    readRecovery(),
  ]);
  const worker = chooseWorker(workers, codespace.name);
  const workerOnline = Boolean(worker?.online);
  const executing = Boolean(
    activeAttempt || queue.active > 0 || queue.activeTasks > 0 || worker?.currentAttemptId
  );
  const lastSignal = start?.at || worker?.lastHeartbeatAt || null;
  const recoveryState: RecoveryState = recovery || {
    lastAttemptAt: null,
    failures: 0,
    circuitOpenUntil: null,
    lastReason: null,
  };
  const signalAgeSeconds = lastSignal
    ? Math.max(0, Math.round((Date.now() - new Date(lastSignal).getTime()) / 1000))
    : null;

  if (intent && Date.now() - new Date(intent.at).getTime() < 180_000) {
    return {
      action: 'blocked',
      codespace,
      reason: 'A shutdown intent is still active; recovery will not race it.',
    };
  }

  const decision = decideWorkerRecovery({
    codespaceState: codespace.state,
    workerOnline,
    executing,
    queued: queue.queued,
    queuePaused: queue.paused,
    hasSignal: Boolean(lastSignal),
    signalAgeSeconds,
    startupGraceSeconds: startupGraceSeconds(),
    recovery: recoveryState,
  });

  if (decision.action !== 'recover') {
    if (decision.action === 'blocked') {
      await saveRecovery({
        ...recoveryState,
        lastReason: decision.reason,
      });
      await recordLifecycleError(decision.code, decision.reason);
    }
    await appendEvent({
      type: 'codespace.worker_recovery_skipped',
      level: decision.action === 'blocked' ? 'warn' : 'info',
      message: `Worker recovery ${decision.action}: ${decision.reason}`,
      payload: { source, code: decision.code, signalAgeSeconds },
      dedupeKey: `worker-recovery:${decision.code}:${Math.floor(Date.now() / 60_000)}`,
    }).catch(() => {});
    return decision.action === 'blocked'
      ? { action: 'blocked', codespace, reason: decision.reason }
      : null;
  }

  if (!(await tryAcquireLifecycleLock('restart', source, 600_000))) {
    return {
      action: 'blocked',
      codespace,
      reason: 'Another lifecycle operation holds the restart lock.',
    };
  }

  const attempts = recoveryState.failures + 1;
  const nextState: RecoveryState = {
    lastAttemptAt: new Date().toISOString(),
    failures: attempts,
    circuitOpenUntil:
      attempts >= WORKER_RECOVERY_CIRCUIT_THRESHOLD
        ? new Date(Date.now() + WORKER_RECOVERY_CIRCUIT_SECONDS * 1000).toISOString()
        : null,
    lastReason: decision.reason,
  };
  await saveRecovery(nextState);

  await appendEvent({
    type: 'codespace.worker_recovery',
    level: 'warn',
    message: `No live worker after ${signalAgeSeconds ?? 'unknown'}s; restart attempt ${attempts}/${WORKER_RECOVERY_CIRCUIT_THRESHOLD}.`,
    payload: { source, signalAgeSeconds, codespace: codespace.name, attempts },
    dedupeKey: `worker-recovery:${codespace.name}:${Math.floor(Date.now() / 60_000)}`,
  }).catch(() => {});

  let stopped: CodespaceInfo | null = null;
  try {
    stopped = await stopCodespace(codespace.name);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespace stop failed.';
    const failures = attempts;
    const blockedUntil =
      failures >= WORKER_RECOVERY_CIRCUIT_THRESHOLD
        ? new Date(Date.now() + WORKER_RECOVERY_CIRCUIT_SECONDS * 1000).toISOString()
        : null;
    await saveRecovery({ ...nextState, failures, circuitOpenUntil: blockedUntil, lastReason: message });
    await recordLifecycleError('CODESPACE_RECOVERY_STOP_FAILED', message);
    return { action: 'blocked', codespace, reason: message };
  }

  const pending = await markPendingStart({
    codespaceName: codespace.name,
    source,
    reason: 'Recovering an Available Codespace with no live worker.',
    attempts,
    phase: pendingPhaseForState(stopped?.state || 'ShuttingDown'),
    lastObservedState: stopped?.state || codespace.state,
    nextAttemptAt: new Date(Date.now() + 12_000).toISOString(),
  });
  return {
    action: 'start-pending',
    codespace: stopped || codespace,
    reason:
      'Worker recovery stop is in flight; startup is recorded and will be retried after the cooldown.',
    pendingStart: pending,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * A start endpoint can answer 200 while its payload still says Shutdown. Re-read
 * the actual GitHub state before recording a confirmed transition. It is a
 * bounded check, not a boot wait: the request never blocks on Codespaces.
 */
async function observeStartedCodespace(
  name: string,
  accepted: CodespaceInfo
): Promise<CodespaceInfo> {
  if (pendingPhaseForState(accepted.state) !== 'requested') return accepted;
  let current = accepted;
  for (const delay of [0, 1_500, 3_000]) {
    if (delay > 0) await sleep(delay);
    const observed = await getCodespace(name).catch(() => null);
    if (!observed) continue;
    current = observed;
    if (pendingPhaseForState(observed.state) !== 'requested') break;
  }
  return current;
}

async function startResolved(
  codespace: CodespaceInfo,
  source: string,
  existingPending?: PendingStart | null
): Promise<EnsureStartResult> {
  const requestedAt = new Date().toISOString();
  const prior = existingPending === undefined ? await readPendingStart() : existingPending;
  const attempts = Math.max(1, (prior?.attempts || 0) + 1);
  try {
    const accepted = await startCodespace(codespace.name);
    const observed = await observeStartedCodespace(codespace.name, accepted);
    const phase = pendingPhaseForState(observed.state);
    const pending = await markPendingStart({
      codespaceName: observed.name,
      source,
      reason:
        phase === 'requested'
          ? 'GitHub accepted the start request, but the Codespace is still Shutdown. Waiting for a confirmed transition.'
          : `GitHub accepted the start request; Codespace observed as ${observed.state}.`,
      attempts,
      phase,
      lastObservedState: observed.state,
      lastHttpStatus: 200,
      requestedAt: prior?.requestedAt || requestedAt,
      nextAttemptAt: pendingRetryDelay(attempts),
      lastError: null,
    });
    await rememberCodespace(observed);
    await setLastStart({
      codespace: observed,
      source,
      requestedAt: prior?.requestedAt || requestedAt,
      lastHttpStatus: 200,
      observedState: observed.state,
      confirmedAt: new Date().toISOString(),
    });
    await clearLifecycleError();
    await setSetting('lifecycle:idle_since', { at: null });
    await appendEvent({
      type: 'codespace.start_requested',
      level: phase === 'requested' ? 'warn' : 'info',
      message:
        phase === 'requested'
          ? `GitHub accepted the start request, but ${observed.name} is still ${observed.state}; confirmation is pending.`
          : `Codespace start accepted: ${observed.name} is ${observed.state}.`,
      payload: {
        source,
        name: observed.name,
        requestedState: accepted.state,
        observedState: observed.state,
        httpStatus: 200,
        attempts,
        phase,
        machine: observed.machine,
      },
      dedupeKey: `codespace-start:${observed.name}:${prior?.requestedAt || requestedAt}:${attempts}`,
    }).catch(() => {});
    return {
      action: phase === 'requested' ? 'start-pending' : 'started',
      codespace: observed,
      reason:
        phase === 'requested'
          ? `GitHub accepted the start request, but the Codespace is still ${observed.state}; waiting for confirmation.`
          : `GitHub start accepted; Codespace is ${observed.state}.`,
      pendingStart: pending,
    };
  } catch (caught) {
    const status = caught instanceof WorkbenchGitHubError ? caught.status : null;
    // 409/422 usually mean the state changed between read and start. Re-read
    // before treating the request as an error.
    if (status === 409 || status === 422) {
      const current = await getCodespace(codespace.name).catch(() => null);
      if (current && pendingPhaseForState(current.state) !== 'requested') {
        const phase = pendingPhaseForState(current.state);
        const pending = await markPendingStart({
          codespaceName: current.name,
          source,
          reason: `Codespace is already ${current.state}.`,
          attempts,
          phase,
          lastObservedState: current.state,
          lastHttpStatus: status,
          requestedAt: prior?.requestedAt || requestedAt,
          nextAttemptAt: pendingRetryDelay(attempts),
          lastError: null,
        });
        await rememberCodespace(current);
        await setLastStart({
          codespace: current,
          source,
          requestedAt: prior?.requestedAt || requestedAt,
          lastHttpStatus: status,
          observedState: current.state,
          confirmedAt: new Date().toISOString(),
        });
        return {
          action: 'started',
          codespace: current,
          reason: `Codespace is already ${current.state}.`,
          pendingStart: pending,
        };
      }
    }
    const message =
      caught instanceof Error
        ? caught.message
        : 'The GitHub Codespaces start request failed.';
    const terminal = status === 401 || status === 403 || status === 404;
    const pending = await markPendingStart({
      codespaceName: codespace.name,
      source,
      reason: terminal
        ? 'The GitHub start request failed permanently. Fix Codespaces write permission, then use an explicit start.'
        : 'The GitHub start request failed; a bounded retry is scheduled.',
      attempts,
      phase: terminal ? 'failed' : 'requested',
      lastObservedState: codespace.state,
      lastHttpStatus: status,
      requestedAt: prior?.requestedAt || requestedAt,
      nextAttemptAt: terminal
        ? new Date(Date.now() + 24 * 60 * 60_000).toISOString()
        : pendingRetryDelay(attempts),
      lastError: message,
    });
    await recordLifecycleError('CODESPACE_START_FAILED', message);
    await appendEvent({
      type: 'codespace.start_failed',
      level: 'error',
      message: `Codespace start failed (HTTP ${status ?? 'unknown'}): ${message}`,
      payload: {
        source,
        name: codespace.name,
        httpStatus: status,
        attempts,
        terminal,
      },
      dedupeKey: `codespace-start-failed:${codespace.name}:${prior?.requestedAt || requestedAt}:${attempts}`,
    }).catch(() => {});
    return {
      action: terminal ? 'blocked' : 'start-pending',
      codespace,
      reason: message,
      pendingStart: pending,
    };
  }
}

/**
 * Idempotent, backend-only startup for queued work.
 *
 * - Never starts when the queue is empty or paused.
 * - `Stopped`/`Shutdown` -> start immediately (GitHub accepts quickly).
 * - `Starting`/`Available` -> no-op; worker recovery is opt-in only.
 * - `Stopping`/`ShuttingDown` -> persist pending state and return. The HTTP
 *   request never waits for the machine to boot or stop.
 *
 * `allowWorkerRecovery` is false by default. Normal GET/overview reconcile must
 * never stop an Available machine; only an explicit owner action may request
 * the controlled recovery path.
 */
export async function ensureCodespaceForQueuedWork(input: {
  source: string;
  allowWorkerRecovery?: boolean;
}): Promise<EnsureStartResult> {
  if (!(await isWorkbenchSchemaReady())) {
    return {
      action: 'blocked',
      codespace: null,
      reason: 'Workbench schema is not ready.',
    };
  }
  const queue = await getQueueSnapshot();
  if (queue.paused || queue.queued <= 0) {
    await clearPendingStart().catch(() => {});
    return {
      action: 'noop',
      codespace: null,
      reason: queue.paused ? 'Queue is paused.' : 'No queued work.',
    };
  }
  const active = await getActiveAttempt();
  if (active || queue.active > 0 || queue.activeTasks > 0) {
    // An active lease is proof that the worker registered and claimed work.
    await clearPendingStart().catch(() => {});
    return {
      action: 'noop',
      codespace: null,
      reason: 'An execution attempt is already active.',
    };
  }
  if (!(await tryAcquireLifecycleLock('start', input.source, 30_000))) {
    return {
      action: 'start-pending',
      codespace: null,
      reason: 'Another instance is already handling Codespace startup.',
    };
  }

  let codespace: CodespaceInfo | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'Codespaces API is unavailable.';
    await recordLifecycleError('CODESPACE_RESOLVE_FAILED', message);
    return { action: 'blocked', codespace: null, reason: message };
  }
  if (!codespace) {
    const message = 'No Codespace was found for this repository.';
    await recordLifecycleError('CODESPACE_NOT_FOUND', message);
    return { action: 'blocked', codespace: null, reason: message };
  }
  await rememberCodespace(codespace);

  const pending = await readPendingStart();
  if (pending && pending.lastObservedState !== codespace.state) {
    await recordStartObservation(codespace);
  }

  // A stop may already be in flight while GitHub still reports Available. If
  // the shutdown intent is fresh, record pending state before deciding. No
  // synchronous wait: a later idempotent retry completes the start.
  const intent = await readIntent();
  const intentFresh = Boolean(
    intent &&
      (!intent.codespaceName || intent.codespaceName === codespace.name) &&
      Date.now() - new Date(intent.at).getTime() < 180_000
  );
  if (intentFresh) {
    await setSetting('lifecycle:shutdown_intent', { at: null });
    const decision = decideCodespaceStart(codespace.state);
    if (decision === 'start') return startResolved(codespace, input.source, null);
    const recorded = await markPendingStart({
      codespaceName: codespace.name,
      source: input.source,
      reason: 'New work arrived while an idle shutdown was in progress.',
      phase: 'starting',
      lastObservedState: codespace.state,
    });
    return {
      action: 'start-pending',
      codespace,
      reason: 'New work arrived during shutdown; startup is recorded and will be retried.',
      pendingStart: recorded,
    };
  }

  const decision = decideCodespaceStart(codespace.state);
  if (decision === 'noop') {
    const workers = await listWorkers();
    const onlineWorker = workers.find((worker) => worker.online) || null;

    if (onlineWorker) {
      if (pending) {
        await appendEvent({
          type: 'codespace.start_confirmed',
          message: `Worker ${onlineWorker.id} registered after Codespace start. Last observed GitHub state: ${codespace.state}.`,
          payload: {
            source: input.source,
            phase: 'worker_registered',
            workerId: onlineWorker.id,
            observedState: codespace.state,
            attempts: pending.attempts,
          },
          dedupeKey: `codespace-start-confirmed:${codespace.name}:${pending.requestedAt}`,
        }).catch(() => {});
        await clearPendingStart().catch(() => {});
      }
      return {
        action: 'already-available',
        codespace,
        reason: `Codespace is ${codespace.state}; worker ${onlineWorker.id} is online.`,
      };
    }

    if (pending) {
      const observedPhase = pendingPhaseForState(codespace.state);
      if (pending.phase === 'failed' || observedPhase === 'requested') {
        // Do not silently convert a failed pending start into "available".
        return {
          action: 'blocked',
          codespace,
          reason:
            pending.lastError ||
            `Codespace is ${codespace.state}; the recorded start has not been confirmed.`,
          pendingStart: pending,
        };
      }

      if (observedPhase === 'available') {
        const ageSeconds = Math.max(
          0,
          Math.round((Date.now() - new Date(pending.requestedAt).getTime()) / 1000)
        );
        const bootstrapGraceSeconds = startupGraceSeconds() + 300;
        if (ageSeconds > bootstrapGraceSeconds) {
          const message = `Codespace is Available but no worker registered within ${ageSeconds}s. The Codespace lifecycle hook did not start the worker. Rebuild the Codespace so the current .devcontainer postStart command is applied, or run scripts/pierrot/dev-worker-start.sh once. Automatic restarts will not fix a missing postStart hook.`;
          const failed = await markPendingStart({
            codespaceName: codespace.name,
            source: input.source,
            reason: message,
            attempts: pending.attempts,
            phase: 'failed',
            lastObservedState: codespace.state,
            lastError: message,
            requestedAt: pending.requestedAt,
            nextAttemptAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
          });
          await recordLifecycleError('WORKER_BOOTSTRAP_MISSING', message);
          await appendEvent({
            type: 'codespace.worker_bootstrap_missing',
            level: 'error',
            message,
            payload: {
              source: input.source,
              attempts: pending.attempts,
              observedState: codespace.state,
              requestedAt: pending.requestedAt,
            },
            dedupeKey: `codespace-worker-bootstrap:${codespace.name}:${pending.requestedAt}`,
          }).catch(() => {});
          return { action: 'blocked', codespace, reason: message, pendingStart: failed };
        }
        const refreshed = await markPendingStart({
          codespaceName: codespace.name,
          source: input.source,
          reason: 'Codespace is Available; waiting for the worker registration.',
          attempts: pending.attempts,
          phase: 'available',
          lastObservedState: codespace.state,
          requestedAt: pending.requestedAt,
        });
        return {
          action: 'start-pending',
          codespace,
          reason: 'Codespace is Available; waiting for a worker heartbeat and registration.',
          pendingStart: refreshed,
        };
      }

      const refreshed = await markPendingStart({
        codespaceName: codespace.name,
        source: input.source,
        reason: `Codespace is ${codespace.state}; waiting for it to become Available.`,
        attempts: pending.attempts,
        phase: observedPhase,
        lastObservedState: codespace.state,
        requestedAt: pending.requestedAt,
      });
      return {
        action: 'start-pending',
        codespace,
        reason: `Codespace is ${codespace.state}; waiting for a confirmed worker registration.`,
        pendingStart: refreshed,
      };
    }

    if (input.allowWorkerRecovery) {
      const recovered = await recoverDeadWorker(codespace, input.source);
      if (recovered) return recovered;
    }
    return {
      action: 'already-available',
      codespace,
      reason: `Codespace is ${codespace.state}.`,
    };
  }
  if (decision === 'start') {
    if (pending) {
      if (pending.phase === 'failed') {
        return {
          action: 'blocked',
          codespace,
          reason:
            pending.lastError ||
            'The previous start failed permanently. Use an explicit owner start to retry.',
          pendingStart: pending,
        };
      }
      if (pending.attempts >= pending.maxAttempts) {
        const message = `Codespace start gave up after ${pending.attempts} attempts. Last observed state: ${pending.lastObservedState || codespace.state}. ${pending.lastError || ''}`.trim();
        const failed = await markPendingStart({
          codespaceName: codespace.name,
          source: input.source,
          reason: message,
          attempts: pending.attempts,
          phase: 'failed',
          lastObservedState: codespace.state,
          lastError: message,
          requestedAt: pending.requestedAt,
          nextAttemptAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        });
        await recordLifecycleError('CODESPACE_START_RETRY_EXHAUSTED', message);
        await appendEvent({
          type: 'codespace.start_retry_exhausted',
          level: 'error',
          message,
          payload: { source: input.source, attempts: pending.attempts },
          dedupeKey: `codespace-start-exhausted:${codespace.name}`,
        }).catch(() => {});
        return { action: 'blocked', codespace, reason: message, pendingStart: failed };
      }
      const dueAt = new Date(pending.nextAttemptAt).getTime();
      if (Number.isFinite(dueAt) && dueAt > Date.now()) {
        return {
          action: 'start-pending',
          codespace,
          reason: `Start retry ${pending.attempts}/${pending.maxAttempts} is scheduled for ${pending.nextAttemptAt}.`,
          pendingStart: pending,
        };
      }
    }
    return startResolved(codespace, input.source, pending);
  }
  if (decision === 'unsupported') {
    const message = `Codespace state ${codespace.state} cannot be started automatically.`;
    const failed = pending
      ? await markPendingStart({
          codespaceName: codespace.name,
          source: input.source,
          reason: message,
          attempts: pending.attempts,
          phase: 'failed',
          lastObservedState: codespace.state,
          lastError: message,
          requestedAt: pending.requestedAt,
          nextAttemptAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        })
      : null;
    await recordLifecycleError('CODESPACE_STATE_UNSUPPORTED', message);
    return { action: 'blocked', codespace, reason: message, pendingStart: failed };
  }

  // A stop is in flight. Persist the intent and return immediately.
  const recorded = await markPendingStart({
    codespaceName: codespace.name,
    source: input.source,
    reason: `Codespace is ${codespace.state}.`,
    attempts: pending?.attempts,
    phase: 'starting',
    lastObservedState: codespace.state,
    requestedAt: pending?.requestedAt,
    nextAttemptAt: new Date(Date.now() + 12_000).toISOString(),
  });
  return {
    action: 'start-pending',
    codespace,
    reason: `Codespace is ${codespace.state}; startup is recorded and will be retried.`,
    pendingStart: recorded,
  };
}

/** Owner-initiated start. Still idempotent and state-aware. */
export async function startCodespaceNow(input: {
  source: string;
  allowWorkerRecovery?: boolean;
}): Promise<EnsureStartResult> {
  if (!(await isWorkbenchSchemaReady())) {
    return { action: 'blocked', codespace: null, reason: 'Workbench schema is not ready.' };
  }
  if (!(await tryAcquireLifecycleLock('start', input.source, 30_000))) {
    return {
      action: 'start-pending',
      codespace: null,
      reason: 'Another instance is already handling Codespace startup.',
    };
  }
  let codespace: CodespaceInfo | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespaces API is unavailable.';
    await recordLifecycleError('CODESPACE_RESOLVE_FAILED', message);
    return { action: 'blocked', codespace: null, reason: message };
  }
  if (!codespace) {
    const message = 'No Codespace was found for this repository.';
    await recordLifecycleError('CODESPACE_NOT_FOUND', message);
    return { action: 'blocked', codespace: null, reason: message };
  }
  await rememberCodespace(codespace);
  let pending = await readPendingStart();
  if (pending?.phase === 'failed') {
    // An explicit owner action is the only way out of a terminal pending state.
    await clearPendingStart().catch(() => {});
    await appendEvent({
      type: 'codespace.start_reset',
      level: 'warn',
      message: `Owner reset the failed pending start for ${codespace.name}; retrying explicitly.`,
      payload: { source: input.source, attempts: pending.attempts },
      dedupeKey: `codespace-start-reset:${codespace.name}:${Math.floor(Date.now() / 60_000)}`,
    }).catch(() => {});
    pending = null;
  }
  const decision = decideCodespaceStart(codespace.state);
  if (decision === 'noop') {
    if (input.allowWorkerRecovery) {
      const recovered = await recoverDeadWorker(codespace, input.source);
      if (recovered) return recovered;
    }
    const workers = await listWorkers();
    if (workers.some((worker) => worker.online)) {
      await clearPendingStart().catch(() => {});
    }
    return { action: 'already-available', codespace, reason: `Codespace is ${codespace.state}.` };
  }
  if (decision === 'start') return startResolved(codespace, input.source, pending);
  if (decision === 'unsupported') {
    const message = `Codespace state ${codespace.state} cannot be started automatically.`;
    await recordLifecycleError('CODESPACE_STATE_UNSUPPORTED', message);
    return { action: 'blocked', codespace, reason: message };
  }
  const recorded = await markPendingStart({
    codespaceName: codespace.name,
    source: input.source,
    reason: `Codespace is ${codespace.state}.`,
    attempts: pending?.attempts,
    phase: 'starting',
    lastObservedState: codespace.state,
    requestedAt: pending?.requestedAt,
    nextAttemptAt: new Date(Date.now() + 12_000).toISOString(),
  });
  return {
    action: 'start-pending',
    codespace,
    reason: `Codespace is ${codespace.state}; startup is recorded and will be retried.`,
    pendingStart: recorded,
  };
}

/**
 * Retry a recorded pending start. Safe to call repeatedly and from concurrent
 * requests: persisted state, a cooldown and the lifecycle lock make it
 * idempotent. It performs at most one GitHub transition per call.
 */
export async function retryPendingStart(source = 'lifecycle-retry'): Promise<EnsureStartResult> {
  const pending = await readPendingStart();
  if (!pending) {
    return { action: 'noop', codespace: null, reason: 'No pending start recorded.' };
  }
  const queue = await getQueueSnapshot();
  if (queue.paused || queue.queued <= 0) {
    await clearPendingStart();
    return { action: 'noop', codespace: null, reason: 'No queued work remains.' };
  }
  const dueAt = new Date(pending.nextAttemptAt).getTime();
  if (Number.isFinite(dueAt) && dueAt > Date.now() + 1_000) {
    return {
      action: 'start-pending',
      codespace: null,
      reason: 'Pending start is scheduled for a later retry.',
      pendingStart: pending,
    };
  }
  return ensureCodespaceForQueuedWork({ source, allowWorkerRecovery: false });
}

/**
 * GitHub Codespaces counts terminal/user activity, not detached CPU work, for
 * its idle timeout. A long OpenCode run can therefore be killed by GitHub even
 * while the worker is healthy. While an attempt is active, refresh the
 * Codespace's last-used timestamp through the existing start endpoint. The call
 * is throttled and only runs when GitHub reports the machine as Available.
 */
let keepaliveCache = { at: 0, name: '' };

export async function keepCodespaceAwakeForActiveWork(input: {
  source: string;
  workerId?: string;
}): Promise<{ refreshed: boolean; reason: string }> {
  if (!(await isWorkbenchSchemaReady())) {
    return { refreshed: false, reason: 'Workbench schema is not ready.' };
  }
  const active = await getActiveAttempt();
  if (!active) {
    return { refreshed: false, reason: 'No active attempt; keepalive is not needed.' };
  }

  const now = Date.now();
  if (now - keepaliveCache.at < KEEPALIVE_INTERVAL_MS) {
    return { refreshed: false, reason: 'Keepalive interval has not elapsed.' };
  }
  const stored = objectSetting(await getSetting<unknown>('lifecycle:last_keepalive', null));
  const storedAt = iso(stored?.at);
  if (storedAt && now - new Date(storedAt).getTime() < KEEPALIVE_INTERVAL_MS) {
    keepaliveCache = {
      at: new Date(storedAt).getTime(),
      name: typeof stored?.name === 'string' ? stored.name : '',
    };
    return { refreshed: false, reason: 'Keepalive interval has not elapsed.' };
  }

  let codespace: CodespaceInfo | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch {
    return { refreshed: false, reason: 'Codespaces API is unavailable.' };
  }
  if (!codespace) {
    return { refreshed: false, reason: 'No Codespace was found.' };
  }
  if (normalizeCodespaceState(codespace.state) !== 'available') {
    return {
      refreshed: false,
      reason: `Codespace is ${codespace.state}; lifecycle reconcile owns the transition.`,
    };
  }

  try {
    // POST /start on an Available Codespace updates last_used_at, which resets
    // the idle timer without changing the machine state.
    const refreshed = await startCodespace(codespace.name);
    keepaliveCache = { at: now, name: codespace.name };
    await rememberCodespace(refreshed);
    await setSetting('lifecycle:last_keepalive', {
      at: new Date().toISOString(),
      name: codespace.name,
      state: refreshed.state,
      source: input.source,
      workerId: input.workerId || null,
    }).catch(() => {});
    await appendEvent({
      type: 'codespace.keepalive',
      level: 'debug',
      message: `Codespace keepalive refreshed last-used time while attempt ${active.id} is active.`,
      payload: {
        source: input.source,
        name: codespace.name,
        state: refreshed.state,
        attemptId: active.id,
      },
      dedupeKey: `codespace-keepalive:${codespace.name}:${Math.floor(now / (30 * 60_000))}`,
    }).catch(() => {});
    return { refreshed: true, reason: 'Codespace last-used timestamp refreshed.' };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespace keepalive failed.';
    return { refreshed: false, reason: message };
  }
}

// ---------------------------------------------------------------------------
// Idle shutdown
// ---------------------------------------------------------------------------

export type IdleShutdownResult = {
  action: 'stay' | 'stopping' | 'wait' | 'disabled' | 'error';
  reason: string;
  retryAfterMs?: number;
};

async function finalWorkCheck(): Promise<{
  queue: Awaited<ReturnType<typeof getQueueSnapshot>>;
  activeAttempt: Awaited<ReturnType<typeof getActiveAttempt>>;
}> {
  const [queue, activeAttempt] = await Promise.all([getQueueSnapshot(), getActiveAttempt()]);
  return { queue, activeAttempt };
}

/**
 * Called by the worker when its local idle timer expires. The backend owns the
 * GitHub token and is the only component allowed to stop the Codespace.
 */
export async function requestIdleShutdown(input: {
  workerId: string;
  idleForMs: number;
  graceSeconds?: number;
}): Promise<IdleShutdownResult> {
  const grace = Math.max(0, Math.trunc(input.graceSeconds ?? idleGraceSeconds()));
  if (grace <= 0) {
    return { action: 'disabled', reason: 'Idle shutdown is disabled.' };
  }
  if (!Number.isFinite(input.idleForMs) || input.idleForMs < grace * 1000) {
    return { action: 'stay', reason: 'Idle grace has not elapsed.' };
  }
  if (!(await tryAcquireLifecycleLock('stop', input.workerId, 45_000))) {
    return {
      action: 'wait',
      reason: 'Another lifecycle operation is in progress.',
      retryAfterMs: 15_000,
    };
  }

  const workers = await listWorkers();
  const caller = workers.find((worker) => worker.id === input.workerId);
  if (!caller || !caller.online) {
    return {
      action: 'stay',
      reason: 'The requesting worker is not registered or its heartbeat is stale.',
    };
  }

  const before = await finalWorkCheck();
  if (before.activeAttempt || before.queue.active > 0 || before.queue.activeTasks > 0) {
    await setSetting('lifecycle:idle_since', { at: null });
    return { action: 'stay', reason: 'An execution attempt is active.' };
  }
  if (before.queue.queued > 0 && !before.queue.paused) {
    await setSetting('lifecycle:idle_since', { at: null });
    return { action: 'stay', reason: `${before.queue.queued} queued task(s) arrived.` };
  }

  let codespace: CodespaceInfo | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespaces API is unavailable.';
    await recordLifecycleError('CODESPACE_RESOLVE_FAILED', message);
    return { action: 'error', reason: message, retryAfterMs: 60_000 };
  }
  if (!codespace) {
    const message = 'No Codespace was found for this repository.';
    await recordLifecycleError('CODESPACE_NOT_FOUND', message);
    return { action: 'error', reason: message, retryAfterMs: 60_000 };
  }
  if (normalizeCodespaceState(codespace.state) !== 'available') {
    return {
      action: 'stay',
      reason: `Codespace is ${codespace.state}; no stop is needed.`,
    };
  }

  const intent: ShutdownIntent = {
    at: new Date().toISOString(),
    workerId: input.workerId,
    codespaceName: codespace.name,
    graceSeconds: grace,
  };
  await setSetting('lifecycle:shutdown_intent', intent);

  // The queue is rechecked after the intent is durable. A task submitted in
  // this window either wins the recheck or sees the intent/state and schedules
  // a fresh start after the stop.
  const after = await finalWorkCheck();
  if (
    after.activeAttempt ||
    (after.queue.queued > 0 && !after.queue.paused) ||
    after.queue.active > 0 ||
    after.queue.activeTasks > 0
  ) {
    await setSetting('lifecycle:shutdown_intent', { at: null });
    await setSetting('lifecycle:idle_since', { at: null });
    await appendEvent({
      type: 'codespace.stop_cancelled',
      level: 'warn',
      message: 'Idle shutdown cancelled because new work appeared.',
      payload: {
        queued: after.queue.queued,
        activeAttempts: after.queue.active,
        activeTasks: after.queue.activeTasks,
      },
    }).catch(() => {});
    return { action: 'stay', reason: 'New work appeared before the stop request.' };
  }

  const requestedAt = new Date().toISOString();
  try {
    const stopped = await stopCodespace(codespace.name);
    const start = await readStart();
    const ready = await readReady();
    const startupMs =
      start && ready
        ? Math.max(0, new Date(ready.at).getTime() - new Date(start.at).getTime())
        : null;
    const measuredRuntimeMs = start
      ? Math.max(0, Date.now() - new Date(start.at).getTime())
      : null;
    await setSetting('lifecycle:last_stop', {
      at: new Date().toISOString(),
      requestedAt,
      codespaceName: stopped.name,
      machine: stopped.machine || codespace.machine,
      reason: 'idle',
      idleSeconds: Math.round(input.idleForMs / 1000),
      measuredRuntimeMs,
      startupMs,
    });
    // Keep a short-lived accepted intent. If a task is submitted while GitHub
    // still reports Available, the enqueue path sees this marker and records a
    // pending start instead of losing the race.
    await setSetting('lifecycle:shutdown_intent', {
      ...intent,
      at: new Date().toISOString(),
      accepted: true,
    });
    await setSetting('lifecycle:idle_since', { at: null });
    await clearLifecycleError();
    await appendEvent({
      type: 'codespace.stop_requested',
      level: 'warn',
      message: `Idle shutdown requested: ${stopped.name} (${stopped.state}).`,
      payload: {
        idleSeconds: Math.round(input.idleForMs / 1000),
        graceSeconds: grace,
        machine: stopped.machine || codespace.machine,
        measuredRuntimeMs,
        startupMs,
        reason: 'idle',
      },
      dedupeKey: `codespace-stop:${stopped.name}:${Math.floor(Date.now() / 60_000)}`,
    }).catch(() => {});
    return { action: 'stopping', reason: 'Codespace stop accepted by GitHub.' };
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'The Codespaces stop request failed.';
    await setSetting('lifecycle:shutdown_intent', { at: null });
    await recordLifecycleError('CODESPACE_STOP_FAILED', message);
    return { action: 'error', reason: message, retryAfterMs: 120_000 };
  }
}

/**
 * Owner/manual stop. Still safe to repeat, but it never bypasses the active
 * attempt guard unless `force` is explicitly requested by the owner.
 */
export async function stopCodespaceNow(input: {
  source: string;
  force?: boolean;
}): Promise<{ stopped: boolean; reason: string; codespace: CodespaceInfo | null }> {
  const before = await finalWorkCheck();
  if (
    !input.force &&
    (before.activeAttempt || before.queue.active > 0 || before.queue.activeTasks > 0)
  ) {
    return {
      stopped: false,
      reason: 'A task is executing; the Codespace was not stopped.',
      codespace: null,
    };
  }
  let codespace: CodespaceInfo | null = null;
  try {
    codespace = await resolveCodespace(getConfiguredCodespaceName());
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespaces API is unavailable.';
    await recordLifecycleError('CODESPACE_RESOLVE_FAILED', message);
    return { stopped: false, reason: message, codespace: null };
  }
  if (!codespace) {
    const message = 'No Codespace was found for this repository.';
    await recordLifecycleError('CODESPACE_NOT_FOUND', message);
    return { stopped: false, reason: message, codespace: null };
  }
  if (decideCodespaceStart(codespace.state) === 'start') {
    return { stopped: true, reason: 'Codespace is already stopped.', codespace };
  }
  if (!['available', 'starting', 'queued', 'provisioning', 'rebuilding'].includes(normalizeCodespaceState(codespace.state))) {
    return {
      stopped: false,
      reason: `Codespace is ${codespace.state}; leave stop handling to the lifecycle.`,
      codespace,
    };
  }
  try {
    const stopped = await stopCodespace(codespace.name);
    await setSetting('lifecycle:last_stop', {
      at: new Date().toISOString(),
      requestedAt: new Date().toISOString(),
      codespaceName: stopped.name,
      machine: stopped.machine || codespace.machine,
      reason: `manual:${input.source}`,
      idleSeconds: null,
      measuredRuntimeMs: null,
      startupMs: null,
    });
    await setSetting('lifecycle:shutdown_intent', {
      at: new Date().toISOString(),
      workerId: 'owner',
      codespaceName: stopped.name,
      graceSeconds: 0,
      accepted: true,
    });
    await clearLifecycleError();
    await appendEvent({
      type: 'codespace.stop_requested',
      level: 'warn',
      message: `Owner requested Codespace stop: ${stopped.name} (${stopped.state}).`,
      payload: { source: input.source, force: Boolean(input.force), state: stopped.state },
    }).catch(() => {});
    return { stopped: true, reason: 'Codespace stop accepted by GitHub.', codespace: stopped };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'The Codespaces stop request failed.';
    await recordLifecycleError('CODESPACE_STOP_FAILED', message);
    return { stopped: false, reason: message, codespace };
  }
}

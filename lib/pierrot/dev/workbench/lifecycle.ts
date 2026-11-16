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

export type PendingStart = {
  at: string;
  requestedAt: string;
  codespaceName: string | null;
  source: string;
  reason: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
};

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

async function readPendingStart(): Promise<PendingStart | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:pending_start', null));
  if (!value) return null;
  const at = iso(value.at);
  if (!at) return null;
  const attempts =
    typeof value.attempts === 'number' && Number.isFinite(value.attempts)
      ? Math.max(0, Math.trunc(value.attempts))
      : 1;
  return {
    at,
    requestedAt: iso(value.requestedAt) || at,
    codespaceName: typeof value.codespaceName === 'string' ? value.codespaceName : null,
    source: typeof value.source === 'string' ? value.source : 'unknown',
    reason: typeof value.reason === 'string' ? value.reason : 'pending',
    attempts,
    nextAttemptAt: iso(value.nextAttemptAt) || at,
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
  const [queue, workers, activeAttempt, start, ready, stop, intent, pending, error, idleSince, attempts, boot, recovery] =
    await Promise.all([
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
  const workerReady = Boolean(
    workerOnline &&
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
  const recoveryBlocked =
    recoveryDecision.action === 'blocked' || (!workerOnline && circuitOpen);

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
    recoveryReason:
      recoveryDecision.action === 'blocked'
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
          heartbeatAgeSeconds: worker.heartbeatAgeSeconds,
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
    shutdownRequested,
    lastStartAt: start?.at || null,
    lastReadyAt: ready?.at || null,
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
}): Promise<void> {
  await setSetting('lifecycle:last_start', {
    at: new Date().toISOString(),
    requestedAt: input.requestedAt,
    codespaceName: input.codespace.name,
    machine: input.codespace.machine,
    source: input.source,
    state: input.codespace.state,
  });
}

const PENDING_RETRY_DELAY_MS = 12_000;

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
}): Promise<PendingStart> {
  const now = new Date().toISOString();
  const existing = await readPendingStart();
  const pending: PendingStart = {
    at: now,
    requestedAt: existing?.requestedAt || now,
    codespaceName: input.codespaceName ?? existing?.codespaceName ?? null,
    source: input.source,
    reason: input.reason,
    attempts: Math.max(1, input.attempts ?? (existing?.attempts || 0) + 1),
    nextAttemptAt:
      input.nextAttemptAt || new Date(Date.now() + PENDING_RETRY_DELAY_MS).toISOString(),
    lastError: input.lastError ? input.lastError.slice(0, 800) : existing?.lastError || null,
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

  try {
    await stopCodespace(codespace.name);
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
  });
  return {
    action: 'start-pending',
    codespace,
    reason:
      'Worker recovery stop is in flight; startup is recorded and will be retried after the cooldown.',
    pendingStart: pending,
  };
}

async function startResolved(
  codespace: CodespaceInfo,
  source: string
): Promise<EnsureStartResult> {
  const requestedAt = new Date().toISOString();
  try {
    const started = await startCodespace(codespace.name);
    await rememberCodespace(started);
    await setLastStart({ codespace: started, source, requestedAt });
    await clearPendingStart();
    await clearLifecycleError();
    await setSetting('lifecycle:idle_since', { at: null });
    await appendEvent({
      type: 'codespace.start_requested',
      message: `Codespace start requested automatically: ${started.name} (${started.state}).`,
      payload: {
        source,
        name: started.name,
        state: started.state,
        machine: started.machine,
      },
      dedupeKey: `codespace-start:${started.name}:${Math.floor(Date.now() / 60_000)}`,
    }).catch(() => {});
    return { action: 'started', codespace: started, reason: 'GitHub start accepted.' };
  } catch (caught) {
    const status = caught instanceof WorkbenchGitHubError ? caught.status : null;
    // 409/422 usually mean the state changed between read and start. Re-read
    // before treating the request as an error.
    if (status === 409 || status === 422) {
      const current = await getCodespace(codespace.name).catch(() => null);
      if (
        current &&
        ['starting', 'queued', 'provisioning', 'rebuilding', 'available'].includes(
          normalizeCodespaceState(current.state)
        )
      ) {
        await rememberCodespace(current);
        await setLastStart({ codespace: current, source, requestedAt });
        await clearPendingStart();
        return {
          action: 'started',
          codespace: current,
          reason: `Codespace is already ${current.state}.`,
        };
      }
    }
    const message =
      caught instanceof Error
        ? caught.message
        : 'The GitHub Codespaces start request failed.';
    await recordLifecycleError('CODESPACE_START_FAILED', message);
    return { action: 'blocked', codespace, reason: message };
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
    const recorded = await markPendingStart({
      codespaceName: codespace.name,
      source: input.source,
      reason: 'New work arrived while an idle shutdown was in progress.',
    });
    const decision = decideCodespaceStart(codespace.state);
    if (decision === 'start') return startResolved(codespace, input.source);
    return {
      action: 'start-pending',
      codespace,
      reason: 'New work arrived during shutdown; startup is recorded and will be retried.',
      pendingStart: recorded,
    };
  }

  const decision = decideCodespaceStart(codespace.state);
  if (decision === 'noop') {
    if (input.allowWorkerRecovery) {
      const recovered = await recoverDeadWorker(codespace, input.source);
      if (recovered) return recovered;
    }
    const workers = await listWorkers();
    const workerOnline = workers.some((worker) => worker.online);
    if (workerOnline || !pending) {
      await clearPendingStart().catch(() => {});
    }
    if (pending && !workerOnline) {
      // The machine is Available but the worker has not confirmed readiness.
      // Keep the durable pending record instead of pretending the start is
      // done; a later retry either sees the heartbeat or stays visible as
      // worker_offline in Admin.
      const dueAt = new Date(pending.nextAttemptAt).getTime();
      if (Number.isFinite(dueAt) && dueAt > Date.now()) {
        return {
          action: 'start-pending',
          codespace,
          reason: 'Codespace is available; waiting for a worker heartbeat.',
          pendingStart: pending,
        };
      }
      const refreshed = await markPendingStart({
        codespaceName: codespace.name,
        source: input.source,
        reason: pending.reason || 'Waiting for a worker heartbeat.',
        attempts: pending.attempts || 1,
        lastError: pending.lastError,
      });
      return {
        action: 'start-pending',
        codespace,
        reason: 'Codespace is available; waiting for a worker heartbeat.',
        pendingStart: refreshed,
      };
    }
    return {
      action: 'already-available',
      codespace,
      reason: `Codespace is ${codespace.state}.`,
    };
  }
  if (decision === 'start') {
    return startResolved(codespace, input.source);
  }
  if (decision === 'unsupported') {
    const message = `Codespace state ${codespace.state} cannot be started automatically.`;
    await recordLifecycleError('CODESPACE_STATE_UNSUPPORTED', message);
    return { action: 'blocked', codespace, reason: message };
  }

  // A stop is in flight. Persist the intent and return immediately.
  const recorded = await markPendingStart({
    codespaceName: codespace.name,
    source: input.source,
    reason: `Codespace is ${codespace.state}.`,
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
  if (decision === 'start') return startResolved(codespace, input.source);
  if (decision === 'unsupported') {
    const message = `Codespace state ${codespace.state} cannot be started automatically.`;
    await recordLifecycleError('CODESPACE_STATE_UNSUPPORTED', message);
    return { action: 'blocked', codespace, reason: message };
  }
  const pending = await markPendingStart({
    codespaceName: codespace.name,
    source: input.source,
    reason: `Codespace is ${codespace.state}.`,
  });
  return {
    action: 'start-pending',
    codespace,
    reason: `Codespace is ${codespace.state}; startup is recorded and will be retried.`,
    pendingStart: pending,
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

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
  deriveLifecycleStatus,
  idleGraceSeconds,
  normalizeCodespaceState,
  startupGraceSeconds,
} from './lifecycleState';
import type { DevLifecycleSnapshot, DevWorker } from './types';

assertServerOnly('lib/pierrot/dev/workbench/lifecycle');

export {
  canStopCodespace,
  decideCodespaceStart,
  deriveLifecycleStatus,
  idleGraceSeconds,
  normalizeCodespaceState,
  startupGraceSeconds,
} from './lifecycleState';
export type { LifecycleStatusInput, StartDecision } from './lifecycleState';

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
  return {
    at,
    requestedAt: iso(value.requestedAt) || at,
    codespaceName: typeof value.codespaceName === 'string' ? value.codespaceName : null,
    source: typeof value.source === 'string' ? value.source : 'unknown',
    reason: typeof value.reason === 'string' ? value.reason : 'pending',
    attempts:
      typeof value.attempts === 'number' && Number.isFinite(value.attempts)
        ? Math.max(0, Math.trunc(value.attempts))
        : 1,
  };
}

async function readError(): Promise<LifecycleError | null> {
  const value = objectSetting(await getSetting<unknown>('lifecycle:last_error', null));
  if (!value) return null;
  const at = iso(value.at);
  return {
    at: at || new Date(0).toISOString(),
    code: typeof value.code === 'string' ? value.code : 'LIFECYCLE_ERROR',
    message: typeof value.message === 'string' ? value.message.slice(0, 800) : 'Lifecycle error.',
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
  const [start, ready] = await Promise.all([readStart(), readReady()]);
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
  const [queue, workers, activeAttempt, start, ready, stop, intent, pending, error, idleSince, attempts] =
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
  const lastError = error?.message || worker?.lastError || codespaceError || null;
  const lastStartFailed = Boolean(error?.code?.startsWith('CODESPACE_START'));
  const shutdownRequested = Boolean(
    intent && Date.now() - new Date(intent.at).getTime() < 180_000
  );

  const decision = deriveLifecycleStatus({
    schemaReady,
    codespaceState: codespace?.state || null,
    codespaceError,
    workerOnline,
    workerReady,
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
          readiness,
          heartbeatAgeSeconds: worker.heartbeatAgeSeconds,
        }
      : null,
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
    shutdownRequested,
    lastStartAt: start?.at || null,
    lastReadyAt: ready?.at || null,
    lastStopAt: stop?.at || null,
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

async function clearPendingStart(): Promise<void> {
  await setSetting('lifecycle:pending_start', { at: null });
}

async function markPendingStart(input: {
  codespaceName: string | null;
  source: string;
  reason: string;
  attempts: number;
}): Promise<PendingStart> {
  const now = new Date().toISOString();
  const pending: PendingStart = {
    at: now,
    requestedAt: now,
    codespaceName: input.codespaceName,
    source: input.source,
    reason: input.reason,
    attempts: Math.max(0, input.attempts),
  };
  await setSetting('lifecycle:pending_start', pending);
  return pending;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Recover a Codespace that is Available but has no live worker.
 *
 * The supervisor normally restarts a crashed worker. If it exhausted its
 * bounded restart budget, a stop/start cycle re-runs the lifecycle hooks. This
 * is throttled to one restart per ten minutes and never runs while a worker is
 * online (including a not-ready worker, which is a configuration problem rather
 * than a dead process).
 */
async function recoverDeadWorker(
  codespace: CodespaceInfo,
  source: string
): Promise<EnsureStartResult | null> {
  if (normalizeCodespaceState(codespace.state) !== 'available') return null;
  const workers = await listWorkers();
  if (workers.some((worker) => worker.online)) return null;
  const start = await readStart();
  // Use the last worker heartbeat when the Codespace was started manually and
  // no lifecycle start record exists. Without either signal, do not risk a
  // restart loop on a freshly created Codespace.
  const lastSignal = start?.at || workers[0]?.lastHeartbeatAt || null;
  if (!lastSignal) return null;
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(lastSignal).getTime()) / 1000));
  if (ageSeconds < startupGraceSeconds()) return null;
  if (!(await tryAcquireLifecycleLock('restart', source, 600_000))) return null;

  await appendEvent({
    type: 'codespace.worker_recovery',
    level: 'warn',
    message: `No live worker after ${ageSeconds}s; restarting the Codespace to re-run lifecycle hooks.`,
    payload: { source, ageSeconds, codespace: codespace.name },
  }).catch(() => {});

  try {
    await stopCodespace(codespace.name);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Codespace stop failed.';
    await recordLifecycleError('CODESPACE_RECOVERY_STOP_FAILED', message);
    return { action: 'blocked', codespace, reason: message };
  }

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await sleep(3_000);
    let current: CodespaceInfo | null = null;
    try {
      current = await getCodespace(codespace.name);
    } catch {}
    if (current && decideCodespaceStart(current.state) === 'start') {
      return startResolved(current, source);
    }
    if (current && decideCodespaceStart(current.state) === 'noop') {
      return {
        action: 'already-available',
        codespace: current,
        reason: 'Codespace restart is still settling.',
      };
    }
  }
  return {
    action: 'start-pending',
    codespace,
    reason: 'Worker recovery stop is in flight; startup is queued.',
    pendingStart: await markPendingStart({
      codespaceName: codespace.name,
      source,
      reason: 'Recovering a Codespace with no live worker.',
      attempts: 1,
    }),
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
 * - `Stopped` -> start.
 * - `Starting`/`Available` -> no-op.
 * - `Stopping`/`ShuttingDown` -> record a pending start and, when allowed,
 *   wait a bounded time for the stop to settle, then start.
 */
export async function ensureCodespaceForQueuedWork(input: {
  source: string;
  waitForStopMs?: number;
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

  // A stop may already be in flight while GitHub still reports Available. If
  // the shutdown intent is fresh, record a pending start before deciding. The
  // retry loop then either sees the stop settle and starts, or sees Available
  // and clears the stale intent.
  const intent = await readIntent();
  const intentFresh = Boolean(
    intent &&
      (!intent.codespaceName || intent.codespaceName === codespace.name) &&
      Date.now() - new Date(intent.at).getTime() < 180_000
  );
  if (intentFresh) {
    await setSetting('lifecycle:shutdown_intent', { at: null });
    const pending = await markPendingStart({
      codespaceName: codespace.name,
      source: input.source,
      reason: 'New work arrived while an idle shutdown was in progress.',
      attempts: 1,
    });
    const decision = decideCodespaceStart(codespace.state);
    if (decision === 'start') return startResolved(codespace, input.source);
    return {
      action: 'start-pending',
      codespace,
      reason: 'New work arrived during shutdown; startup will be retried.',
      pendingStart: pending,
    };
  }

  const decision = decideCodespaceStart(codespace.state);
  if (decision === 'noop') {
    const recovered = await recoverDeadWorker(codespace, input.source);
    if (recovered) return recovered;
    await clearPendingStart().catch(() => {});
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

  // A stop is in flight. Record the intent so another request cannot lose it,
  // then wait a bounded time for GitHub to settle.
  const pending = await markPendingStart({
    codespaceName: codespace.name,
    source: input.source,
    reason: `Codespace is ${codespace.state}.`,
    attempts: 1,
  });
  const waitMs = Math.min(Math.max(0, input.waitForStopMs ?? 0), 50_000);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(3_000);
    let current: CodespaceInfo | null = null;
    try {
      current = await getCodespace(codespace.name);
    } catch {
      // Keep waiting until the bounded deadline.
    }
    if (!current) continue;
    if (decideCodespaceStart(current.state) === 'start') {
      return startResolved(current, input.source);
    }
    if (decideCodespaceStart(current.state) === 'noop') {
      await clearPendingStart();
      return {
        action: 'already-available',
        codespace: current,
        reason: `Codespace became ${current.state}.`,
      };
    }
  }
  return {
    action: 'start-pending',
    codespace,
    reason: `Codespace is ${codespace.state}; startup is queued and will be retried.`,
    pendingStart: pending,
  };
}

/** Owner-initiated start. Still idempotent and state-aware. */
export async function startCodespaceNow(input: {
  source: string;
  waitForStopMs?: number;
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
    const recovered = await recoverDeadWorker(codespace, input.source);
    if (recovered) return recovered;
    await clearPendingStart().catch(() => {});
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
    attempts: 1,
  });
  const waitMs = Math.min(Math.max(0, input.waitForStopMs ?? 0), 50_000);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(3_000);
    let current: CodespaceInfo | null = null;
    try {
      current = await getCodespace(codespace.name);
    } catch {}
    if (!current) continue;
    if (decideCodespaceStart(current.state) === 'start') {
      return startResolved(current, input.source);
    }
    if (decideCodespaceStart(current.state) === 'noop') {
      await clearPendingStart();
      return { action: 'already-available', codespace: current, reason: `Codespace became ${current.state}.` };
    }
  }
  return {
    action: 'start-pending',
    codespace,
    reason: `Codespace is ${codespace.state}; startup is queued and will be retried.`,
    pendingStart: pending,
  };
}

/** Retry a recorded pending start. Safe to call repeatedly. */
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
  return ensureCodespaceForQueuedWork({ source, waitForStopMs: 12_000 });
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

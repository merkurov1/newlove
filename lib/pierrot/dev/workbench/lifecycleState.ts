import type { DevLifecycleStatus } from './types';

/**
 * Pure lifecycle decisions. This module has no server, GitHub or Supabase
 * imports so the race-sensitive rules can be tested directly.
 */

const DEFAULT_IDLE_GRACE_SECONDS = 120;
const DEFAULT_STARTUP_GRACE_SECONDS = 300;

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export function idleGraceSeconds(): number {
  const seconds = process.env.PIERROT_DEV_IDLE_GRACE_SECONDS;
  if (seconds !== undefined && seconds.trim() !== '') {
    return numberFromEnv('PIERROT_DEV_IDLE_GRACE_SECONDS', DEFAULT_IDLE_GRACE_SECONDS, 30, 3600);
  }
  const minutes = process.env.PIERROT_DEV_IDLE_STOP_MINUTES;
  if (minutes !== undefined && minutes.trim() !== '') {
    return numberFromEnv('PIERROT_DEV_IDLE_STOP_MINUTES', 2, 1, 60) * 60;
  }
  return DEFAULT_IDLE_GRACE_SECONDS;
}

export function startupGraceSeconds(): number {
  return numberFromEnv(
    'PIERROT_DEV_STARTUP_GRACE_SECONDS',
    DEFAULT_STARTUP_GRACE_SECONDS,
    90,
    1800
  );
}

export type StartDecision = 'start' | 'noop' | 'wait' | 'unsupported';

export function normalizeCodespaceState(state: string | null | undefined): string {
  return String(state || '').trim().toLowerCase();
}

/** Decide what a backend reconcile pass must do for a Codespaces state. */
export function decideCodespaceStart(state: string | null | undefined): StartDecision {
  switch (normalizeCodespaceState(state)) {
    case 'available':
    case 'starting':
    case 'queued':
    case 'provisioning':
    case 'rebuilding':
      return 'noop';
    case 'stopped':
    case 'shutdown':
      return 'start';
    case 'stopping':
    case 'shuttingdown':
    case 'shutting_down':
      return 'wait';
    case 'deleted':
    case 'archived':
    case 'moved':
    case 'unavailable':
      return 'unsupported';
    default:
      return 'unsupported';
  }
}

/** Safe shutdown requires no executable task, no task in progress, no attempt. */
export function canStopCodespace(input: {
  queued: number;
  activeTasks: number;
  activeAttempts: number;
  workerAttemptActive?: boolean;
}): boolean {
  return (
    input.queued <= 0 &&
    input.activeTasks <= 0 &&
    input.activeAttempts <= 0 &&
    !input.workerAttemptActive
  );
}

export type LifecycleStatusInput = {
  schemaReady: boolean;
  codespaceState: string | null;
  codespaceError: string | null;
  workerOnline: boolean;
  workerReady: boolean;
  readinessReasons: string[];
  opencodeOk: boolean;
  authOk: boolean;
  executing: boolean;
  queued: number;
  queuePaused: boolean;
  startedRecently: boolean;
  idleSeconds: number | null;
  graceSeconds: number;
  shutdownRequested: boolean;
  pendingStart: boolean;
  lastError: string | null;
  lastStartFailed: boolean;
};

export function deriveLifecycleStatus(
  input: LifecycleStatusInput
): { status: DevLifecycleStatus; label: string; detail: string } {
  if (!input.schemaReady) {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: 'The Workbench migration is not applied. Queue and lifecycle cannot run.',
    };
  }
  if (input.codespaceError && !input.codespaceState) {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: input.codespaceError,
    };
  }
  if (!input.codespaceState) {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: 'No Codespace was found for this repository.',
    };
  }

  const state = normalizeCodespaceState(input.codespaceState);
  if (['stopping', 'shuttingdown', 'shutting_down'].includes(state)) {
    return {
      status: 'stopping_codespace',
      label: 'Stopping Codespace',
      detail: input.pendingStart
        ? 'New work is queued. A new startup will be triggered as soon as the stop completes.'
        : 'Idle shutdown in progress. The queue is rechecked before every stop.',
    };
  }
  if (['starting', 'queued', 'provisioning', 'rebuilding'].includes(state)) {
    return {
      status: 'starting_codespace',
      label: 'Starting Codespace',
      detail: 'GitHub is starting the Codespace. The worker starts automatically from postStart.',
    };
  }
  if (['stopped', 'shutdown'].includes(state)) {
    if (input.queued > 0 && !input.queuePaused) {
      if (input.lastStartFailed && !input.pendingStart) {
        return {
          status: 'blocked',
          label: 'Blocked',
          detail: input.lastError || 'The backend could not start the Codespace.',
        };
      }
      return {
        status: 'starting_codespace',
        label: 'Starting Codespace',
        detail: `${input.queued} queued task(s) detected. The backend is starting the Codespace.`,
      };
    }
    if (input.lastError) {
      return {
        status: 'blocked',
        label: 'Blocked',
        detail: input.lastError,
      };
    }
    return {
      status: 'offline',
      label: 'Offline',
      detail: input.queuePaused
        ? 'Queue is paused and the Codespace is stopped.'
        : 'No pending work. The Codespace is stopped.',
    };
  }
  if (['deleted', 'archived', 'moved', 'unavailable'].includes(state)) {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: `Codespace state is ${input.codespaceState}. Recreate it before queuing work.`,
    };
  }
  if (state !== 'available') {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: `Unrecognised Codespace state: ${input.codespaceState}.`,
    };
  }

  if (input.executing) {
    return {
      status: 'executing_task',
      label: 'Executing task',
      detail: 'The worker holds the single execution lease. Shutdown is forbidden while it runs.',
    };
  }
  if (input.queuePaused && input.queued > 0) {
    return {
      status: 'blocked',
      label: 'Blocked',
      detail: 'The queue is paused; queued tasks will not execute until it is resumed.',
    };
  }
  if (!input.workerOnline) {
    if (input.startedRecently) {
      return {
        status: 'starting_worker',
        label: 'Starting worker',
        detail: 'Codespace is available. Waiting for the worker heartbeat and readiness check.',
      };
    }
    if (input.lastError) {
      return {
        status: 'blocked',
        label: 'Blocked',
        detail: input.lastError,
      };
    }
    return {
      status: 'codespace_available',
      label: 'Codespace available',
      detail:
        'GitHub reports the Codespace as available but no worker is heartbeating. The backend will restart it after the startup grace period to re-run lifecycle hooks.',
    };
  }
  if (!input.workerReady) {
    if (!input.opencodeOk) {
      return {
        status: 'checking_opencode',
        label: 'Checking OpenCode',
        detail:
          input.readinessReasons.join(' · ') ||
          'Worker is online; OpenCode CLI availability or version is not valid.',
      };
    }
    if (!input.authOk) {
      return {
        status: 'checking_provider',
        label: 'Checking provider authentication',
        detail:
          input.readinessReasons.join(' · ') ||
          'Worker is online; stored provider authentication is missing.',
      };
    }
    return {
      status: 'starting_worker',
      label: 'Starting worker',
      detail:
        input.readinessReasons.join(' · ') ||
        'Worker is online but has not completed its API and Supabase readiness checks.',
    };
  }
  if (
    input.shutdownRequested ||
    (input.idleSeconds !== null && input.idleSeconds >= input.graceSeconds)
  ) {
    return {
      status: 'waiting_for_shutdown',
      label: 'Queue empty / waiting for shutdown',
      detail: input.shutdownRequested
        ? 'Idle grace elapsed. The backend is rechecking the queue before stopping the Codespace.'
        : `Idle for ${input.idleSeconds ?? 0}s of ${input.graceSeconds}s. The backend will stop the Codespace after the grace period.`,
    };
  }
  if (input.queued > 0) {
    return {
      status: 'starting_worker',
      label: 'Ready',
      detail: `${input.queued} queued task(s). The worker will claim the next task on its next poll.`,
    };
  }
  return {
    status: 'ready',
    label: 'Ready',
    detail: 'Worker is ready, queue is empty and the idle grace timer is running.',
  };
}

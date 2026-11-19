import { NextResponse, after } from 'next/server';
import {
  WorkerAuthError,
  readJsonBody,
  requireWorker,
} from '@/lib/pierrot/dev/workbench/workerAuth';
import {
  claimTaskForWorker,
  completeAttempt,
  failAttempt,
  progressAttempt,
  releaseAttempt,
  startAttempt,
  WorkbenchExecutionError,
} from '@/lib/pierrot/dev/workbench/execution';
import {
  WorkbenchUnavailableError,
  appendEvent,
  getActiveAttemptsForWorker,
  getAttempt,
  getQueueSnapshot,
  getWorker,
  heartbeatWorker,
  isWorkerId,
  isUuid,
  pingWorkbenchStore,
  registerWorker,
} from '@/lib/pierrot/dev/workbench/store';
import {
  dispatchNextQueuedTask,
  recordActionsClaimMiss,
  recordActionsClaimSuccess,
} from '@/lib/pierrot/dev/workbench/actions';
import {
  WORKER_LEASE_SECONDS,
  WORKER_MAX_POLL_INTERVAL_MS,
  WORKER_MIN_POLL_INTERVAL_MS,
  WORKER_POLL_INTERVAL_MS,
} from '@/lib/pierrot/dev/workbench/state';
import {
  idleGraceSeconds,
  keepCodespaceAwakeForActiveWork,
  recordBootStatus,
  recordWorkerIdle,
  recordWorkerReady,
  requestIdleShutdown,
} from '@/lib/pierrot/dev/workbench/lifecycle';
import { WorkbenchGitHubError } from '@/lib/pierrot/dev/workbench/github';
import type { AttemptResultInput as DevAttemptResultInput } from '@/lib/pierrot/dev/workbench/execution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 240;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_REQUESTS;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : [];
}

function safeObject(value: unknown, maxBytes = 16_000): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.stringify(value).length <= maxBytes ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readinessOf(capabilities: Record<string, unknown>): Record<string, unknown> {
  return capabilities.readiness && typeof capabilities.readiness === 'object'
    ? (capabilities.readiness as Record<string, unknown>)
    : {};
}

/**
 * Record a provider-authentication failure separately from a generic timeout.
 * The owner must be able to tell "run opencode auth login" from "the API was
 * unreachable" without reading the worker log.
 */
async function recordAuthFailure(
  workerId: string,
  capabilities: Record<string, unknown>
): Promise<void> {
  const readiness = readinessOf(capabilities);
  const authOk = readiness.authOk;
  const probeOk = capabilities.authProbeOk !== false && readiness.authProbeOk !== false;
  if (authOk !== false || !probeOk) return;
  const provider = typeof readiness.provider === 'string' ? readiness.provider : 'deepseek';
  const reasons = Array.isArray(readiness.reasons)
    ? readiness.reasons.filter((item): item is string => typeof item === 'string').slice(0, 5)
    : [];
  await appendEvent({
    workerId,
    type: 'worker.auth.failed',
    level: 'error',
    message:
      reasons[0] ||
      `No stored ${provider} authentication was found. Run opencode auth login in the Codespace.`,
    payload: {
      provider,
      authOk,
      authProbeOk: probeOk,
      reasons,
    },
    dedupeKey: `worker-auth-failed:${workerId}:${Math.floor(Date.now() / 300_000)}`,
  }).catch(() => {});
}

function errorResponse(error: unknown) {
  if (error instanceof WorkerAuthError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  const coded = error as { code?: string; status?: number; message?: string };
  if (coded?.code === 'ACTIONS_KIND_MIGRATION_REQUIRED') {
    return json({ error: coded.message, code: coded.code }, coded.status || 503);
  }
  if (error instanceof WorkbenchUnavailableError) {
    return json({ error: error.message, code: error.code }, 503);
  }
  if (error instanceof WorkbenchExecutionError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof WorkbenchGitHubError) {
    return json({ error: error.message, code: error.code }, error.status === 403 ? 403 : 502);
  }
  console.error('[Pierrot Dev Worker API] request failed', {
    code: error instanceof Error ? error.name : 'unknown',
  });
  return json({ error: 'Worker request failed.', code: 'WORKER_REQUEST_FAILED' }, 500);
}

export async function POST(req: Request) {
  try {
    requireWorker(req);

    const body = await readJsonBody(req);
    const action = text(body.action, 40);
    const workerId = text(body.workerId, 120);
    if (!isWorkerId(workerId)) {
      return json({ error: 'A valid workerId is required.', code: 'INVALID_WORKER_ID' }, 400);
    }

    if (rateLimited(`${workerId}:${req.headers.get('x-forwarded-for') || 'local'}`)) {
      return json({ error: 'Worker rate limit exceeded.', code: 'WORKER_RATE_LIMITED' }, 429);
    }

    switch (action) {
      case 'health': {
        const ping = await pingWorkbenchStore();
        if (!ping.ok) {
          return json(
            {
              ok: false,
              error: 'Supabase is unreachable through the worker API.',
              code: 'WORKER_DATA_PLANE_UNAVAILABLE',
              detail: ping.error,
            },
            503
          );
        }
        return json({ ok: true, serverTime: new Date().toISOString() });
      }

      case 'register': {
        const capabilities = safeObject(body.capabilities, 32_000);
        const readiness = readinessOf(capabilities);
        await recordAuthFailure(workerId, capabilities);
        const worker = await registerWorker({
          workerId,
          name: text(body.name, 120) || workerId,
          version: text(body.version, 80) || undefined,
          hostname: text(body.hostname, 200) || undefined,
          codespaceName: text(body.codespaceName, 120) || undefined,
          repository: text(body.repository, 120) || undefined,
          kind:
            body.kind === 'actions' || body.kind === 'local' || body.kind === 'codespace'
              ? body.kind
              : undefined,
          capabilities,
        });
        if (capabilities.ready === true || readiness.ready === true) {
          await recordWorkerReady(workerId);
        }
        return json({
          ok: true,
          worker,
          serverTime: new Date().toISOString(),
          leaseSeconds: WORKER_LEASE_SECONDS,
          pollIntervalMs: WORKER_POLL_INTERVAL_MS,
          idleGraceSeconds: idleGraceSeconds(),
        });
      }

      case 'recover': {
        // A restarted worker must not leave its previous attempt locked until
        // the lease expires. Release only attempts owned by this worker id.
        const stale = await getActiveAttemptsForWorker(workerId);
        let released = 0;
        for (const attempt of stale) {
          if (
            await releaseAttempt(
              workerId,
              attempt.id,
              'Worker restarted; the unfinished attempt was released and the task requeued.'
            )
          ) {
            released += 1;
          }
        }
        if (released > 0) {
          await appendEvent({
            workerId,
            type: 'worker.recovered',
            level: 'warn',
            message: `Worker restart released ${released} unfinished attempt(s).`,
          });
        }
        return json({ ok: true, released });
      }

      case 'heartbeat': {
        const status = ['online', 'idle', 'busy', 'draining', 'offline', 'error'].includes(
          String(body.status)
        )
          ? (body.status as 'online' | 'idle' | 'busy' | 'draining' | 'offline' | 'error')
          : undefined;
        const capabilities = safeObject(body.capabilities, 32_000);
        await recordAuthFailure(workerId, capabilities);
        const result = await heartbeatWorker({
          workerId,
          status,
          capabilities,
          lastError: typeof body.lastError === 'string' ? body.lastError.slice(0, 1000) : undefined,
        });
        const readiness =
          capabilities.readiness && typeof capabilities.readiness === 'object'
            ? (capabilities.readiness as Record<string, unknown>)
            : {};
        if (capabilities.ready === true || readiness.ready === true) {
          await recordWorkerReady(workerId);
        }
        await recordWorkerIdle({
          workerId,
          status: status || 'idle',
          idleSince: text(body.idleSince, 40) || null,
        });
        return json({
          ok: Boolean(result.worker),
          worker: result.worker,
          stopRequested: result.stopRequested,
          cancelAttemptId: result.cancelAttemptId,
          queuePaused: result.queuePaused,
          serverTime: new Date().toISOString(),
          pollIntervalMs: WORKER_POLL_INTERVAL_MS,
          minPollIntervalMs: WORKER_MIN_POLL_INTERVAL_MS,
          maxPollIntervalMs: WORKER_MAX_POLL_INTERVAL_MS,
          idleGraceSeconds: idleGraceSeconds(),
        });
      }

      case 'claim': {
        const taskId = text(body.taskId, 64) || undefined;
        if (taskId && !isUuid(taskId)) {
          return json({ error: 'taskId must be a UUID.', code: 'INVALID_TASK_ID' }, 400);
        }
        // A targeted claim is an Actions-only capability. The database also
        // enforces the same rule, but rejecting it here gives an explicit 403
        // instead of a silent no-op for a Codespace worker.
        if (taskId) {
          const worker = await getWorker(workerId);
          if (!worker || worker.kind !== 'actions') {
            return json(
              {
                error: 'Targeted task claims are reserved for the GitHub Actions executor.',
                code: 'TARGETED_CLAIM_REQUIRES_ACTIONS_WORKER',
              },
              403
            );
          }
        }
        const claim = await claimTaskForWorker(workerId, taskId);
        let diagnosis = null;
        if (claim) {
          await recordWorkerIdle({ workerId, status: 'busy', idleSince: null });
          if (taskId) {
            await recordActionsClaimSuccess({
              taskId,
              workerId,
              correlationId: text(body.correlationId, 160) || null,
              executionId: text(body.executionId, 160) || null,
            }).catch(() => {});
          }
        } else if (taskId) {
          // The workflow started but the atomic claim refused. Classify and
          // persist why, then schedule a bounded retry only when it is safe.
          diagnosis = await recordActionsClaimMiss({
            taskId,
            workerId,
            correlationId: text(body.correlationId, 160) || null,
            executionId: text(body.executionId, 160) || null,
            source: 'worker:claim',
          }).catch(() => null);
        }
        return json({
          ok: true,
          claim,
          diagnosis,
          serverTime: new Date().toISOString(),
          pollIntervalMs: WORKER_POLL_INTERVAL_MS,
          idleGraceSeconds: idleGraceSeconds(),
        });
      }

      case 'start': {
        const attemptId = text(body.attemptId, 64);
        if (!attemptId) return json({ error: 'attemptId is required.' }, 400);
        const result = await startAttempt(
          workerId,
          attemptId,
          text(body.executionId, 160) || undefined
        );
        return json({ ok: true, attempt: result.attempt });
      }

      case 'progress': {
        const attemptId = text(body.attemptId, 64);
        if (!attemptId) return json({ error: 'attemptId is required.' }, 400);
        const result = await progressAttempt({
          workerId,
          attemptId,
          stage: text(body.stage, 120) || 'running',
          message: text(body.message, 3800) || undefined,
          dedupeKey: text(body.dedupeKey, 160) || undefined,
          logExcerpt:
            typeof body.logExcerpt === 'string' ? body.logExcerpt.slice(0, 60_000) : undefined,
        });
        // Refresh the Codespace idle timer only when the active worker really
        // is the Codespace worker. An ephemeral Actions runner must never touch
        // the Codespaces lifecycle.
        const progressWorker = await getWorker(workerId);
        if (progressWorker?.kind === 'codespace') {
          after(async () => {
            await keepCodespaceAwakeForActiveWork({
              source: 'worker:progress',
              workerId,
            }).catch(() => {});
          });
        }
        return json({ ok: true, cancelled: result.cancelled, attempt: result.attempt });
      }

      case 'complete': {
        const attemptId = text(body.attemptId, 64);
        if (!attemptId) return json({ error: 'attemptId is required.' }, 400);
        const raw = safeObject(body.result, 400_000);
        const result: DevAttemptResultInput = {
          exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : null,
          opencodeSessionId: text(raw.opencodeSessionId, 200) || null,
          headSha: text(raw.headSha, 40) || null,
          changedFiles: stringArray(raw.changedFiles, 200),
          commands: Array.isArray(raw.commands)
            ? (raw.commands as DevAttemptResultInput['commands'])
            : [],
          summary: text(raw.summary, 12_000),
          warnings: stringArray(raw.warnings, 40),
          criteria: Array.isArray(raw.criteria)
            ? (raw.criteria as DevAttemptResultInput['criteria'])
            : [],
          logExcerpt: text(raw.logExcerpt, 60_000),
          verification: safeObject(raw.verification, 32_000),
          usage: safeObject(raw.usage, 16_000),
          runtimeMs:
            typeof raw.runtimeMs === 'number' && Number.isFinite(raw.runtimeMs)
              ? Math.max(0, Math.trunc(raw.runtimeMs))
              : null,
        };
        const completed = await completeAttempt(workerId, attemptId, result);
        // Queue progression: one Actions run = one task, so the next eligible
        // task must be dispatched server-side. This is best effort and happens
        // after the response; the database reservation prevents duplicates.
        after(async () => {
          await dispatchNextQueuedTask({ source: 'worker:complete' }).catch(() => {});
        });
        return json({
          ok: true,
          attempt: completed.attempt,
          task: completed.task,
          pollIntervalMs: WORKER_POLL_INTERVAL_MS,
        });
      }

      case 'fail': {
        const attemptId = text(body.attemptId, 64);
        if (!attemptId) return json({ error: 'attemptId is required.' }, 400);
        const attempt = await failAttempt({
          workerId,
          attemptId,
          errorCode: text(body.errorCode, 120) || 'EXECUTION_FAILED',
          errorMessage: text(body.errorMessage, 2000) || 'Execution failed.',
          timedOut: body.timedOut === true,
          exitCode: typeof body.exitCode === 'number' ? body.exitCode : null,
          logExcerpt:
            typeof body.logExcerpt === 'string' ? body.logExcerpt.slice(0, 60_000) : undefined,
          changedFiles: stringArray(body.changedFiles, 200),
          headSha: text(body.headSha, 40) || null,
          usage: safeObject(body.usage, 16_000),
          runtimeMs:
            typeof body.runtimeMs === 'number' && Number.isFinite(body.runtimeMs)
              ? Math.max(0, Math.trunc(body.runtimeMs))
              : null,
          modelStarted: body.modelStarted !== false,
          verification: safeObject(body.verification, 32_000),
        });
        after(async () => {
          await dispatchNextQueuedTask({ source: 'worker:fail' }).catch(() => {});
        });
        return json({ ok: true, attempt });
      }

      case 'release': {
        const attemptId = text(body.attemptId, 64);
        if (!attemptId) return json({ error: 'attemptId is required.' }, 400);
        const released = await releaseAttempt(
          workerId,
          attemptId,
          text(body.reason, 2000) || 'Worker stopped before completion.'
        );
        if (released) {
          after(async () => {
            await dispatchNextQueuedTask({ source: 'worker:release' }).catch(() => {});
          });
        }
        return json({ ok: released });
      }

      case 'idle': {
        const idleForMs =
          typeof body.idleForMs === 'number' && Number.isFinite(body.idleForMs)
            ? Math.max(0, Math.trunc(body.idleForMs))
            : 0;
        const graceSeconds =
          typeof body.graceSeconds === 'number' && Number.isFinite(body.graceSeconds)
            ? Math.max(0, Math.trunc(body.graceSeconds))
            : idleGraceSeconds();
        const result = await requestIdleShutdown({ workerId, idleForMs, graceSeconds });
        return json({ ok: true, ...result, serverTime: new Date().toISOString() });
      }

      case 'boot': {
        await recordBootStatus({
          workerId,
          phase: text(body.phase, 80) || 'unknown',
          message: text(body.message, 800) || 'Worker boot hook ran.',
        });
        return json({ ok: true });
      }

      case 'queue_status': {
        const queue = await getQueueSnapshot();
        return json({
          ok: true,
          queue,
          serverTime: new Date().toISOString(),
          pollIntervalMs: WORKER_POLL_INTERVAL_MS,
          idleGraceSeconds: idleGraceSeconds(),
        });
      }

      case 'event': {
        const attemptId = text(body.attemptId, 64) || null;
        const allowed = ['worker.note', 'worker.opencode_session', 'worker.log'];
        const type = text(body.type, 80);
        if (!allowed.includes(type)) {
          return json({ error: 'Unsupported event type.' }, 400);
        }
        if (attemptId) {
          const attempt = await getAttempt(attemptId);
          if (!attempt || attempt.workerId !== workerId) {
            return json({ error: 'Attempt not found for this worker.' }, 403);
          }
        }
        await appendEvent({
          taskId: text(body.taskId, 64) || null,
          attemptId,
          workerId,
          type,
          level: body.level === 'error' ? 'error' : body.level === 'warn' ? 'warn' : 'info',
          message: text(body.message, 3800) || type,
          payload: safeObject(body.payload, 16_000),
          dedupeKey: text(body.dedupeKey, 160) || null,
        });
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown worker action.' }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  return json({ error: 'Method not allowed.' }, 405);
}

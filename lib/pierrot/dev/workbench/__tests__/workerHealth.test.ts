/** @jest-environment node */

import { mapWorkerRow } from '../store';
import { deriveWorkerHealth } from '../workerHealth';
import type { DevAttempt, DevWorker } from '../types';

const ACTIVE_ATTEMPT: DevAttempt = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  taskId: '22222222-2222-4222-8222-222222222222',
  attemptNumber: 1,
  status: 'running',
  workerId: 'actions:100:1',
  branch: null,
  baseRef: 'main',
  baseCommit: null,
  headSha: null,
  prNumber: null,
  prUrl: null,
  opencodeSessionId: null,
  exitCode: null,
  startedAt: null,
  finishedAt: null,
  heartbeatAt: null,
  leaseExpiresAt: null,
  progressStage: null,
  resultSummary: null,
  changedFiles: [],
  commands: [],
  warnings: [],
  errorCode: null,
  errorMessage: null,
  logExcerpt: null,
  createdAt: '2026-11-19T00:00:00.000Z',
};

function worker(overrides: Partial<DevWorker> = {}): DevWorker {
  return {
    id: 'actions:100:1',
    name: 'Actions 100',
    kind: 'actions',
    status: 'busy',
    reportedStatus: 'busy',
    stale: false,
    finished: false,
    version: '1.0.0',
    hostname: null,
    codespaceName: null,
    repository: 'newkorov/newlove',
    capabilities: {},
    currentTaskId: ACTIVE_ATTEMPT.taskId,
    currentAttemptId: ACTIVE_ATTEMPT.id,
    lastHeartbeatAt: '2026-11-19T00:00:00.000Z',
    lastError: null,
    stopRequested: false,
    heartbeatAgeSeconds: 5,
    online: true,
    ...overrides,
  };
}

describe('worker heartbeat and lifecycle mapping', () => {
  it('reports an idle worker that lost its heartbeat as stale/offline, not active', () => {
    const mapped = mapWorkerRow({
      id: 'codespace:test',
      name: 'Codespace',
      kind: 'codespace',
      status: 'idle',
      last_heartbeat_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });

    expect(mapped.online).toBe(false);
    expect(mapped.status).toBe('offline');
    expect(mapped.reportedStatus).toBe('idle');
    expect(mapped.stale).toBe(true);
    expect(mapped.finished).toBe(false);
  });

  it('keeps a completed Actions runner as historical offline/finished', () => {
    const mapped = mapWorkerRow({
      id: 'actions:100:1',
      name: 'Actions 100',
      kind: 'actions',
      status: 'offline',
      last_heartbeat_at: new Date().toISOString(),
      current_attempt_id: null,
    });

    expect(mapped.online).toBe(false);
    expect(mapped.status).toBe('offline');
    expect(mapped.finished).toBe(true);
    expect(mapped.stale).toBe(false);
  });
});

describe('worker health summary', () => {
  it('counts only fresh workers as active and keeps stale/historical records', () => {
    const summary = deriveWorkerHealth(
      [
        worker(),
        worker({
          id: 'codespace:stale',
          kind: 'codespace',
          status: 'idle',
          reportedStatus: 'idle',
          online: false,
          stale: true,
          currentTaskId: null,
          currentAttemptId: null,
        }),
        worker({
          id: 'actions:old:1',
          status: 'offline',
          reportedStatus: 'offline',
          online: false,
          stale: false,
          finished: true,
          currentTaskId: null,
          currentAttemptId: null,
        }),
      ],
      [ACTIVE_ATTEMPT]
    );

    expect(summary.total).toBe(3);
    expect(summary.active).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.historical).toBe(1);
    expect(summary.finished).toBe(1);
    expect(summary.orphan).toBe(0);
    expect(summary.pointerMismatch).toBe(0);
  });

  it('diagnoses orphan worker pointers without deleting the rows', () => {
    const summary = deriveWorkerHealth(
      [
        worker(),
        worker({
          id: 'actions:orphan:1',
          online: false,
          stale: true,
          currentAttemptId: 'bbbbbbbb-2222-4222-8222-222222222222',
          currentTaskId: ACTIVE_ATTEMPT.taskId,
        }),
      ],
      [ACTIVE_ATTEMPT]
    );

    expect(summary.orphan).toBe(1);
    expect(summary.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerId: 'actions:orphan:1',
          code: 'ORPHAN_CURRENT_ATTEMPT',
        }),
      ])
    );
  });

  it('diagnoses a worker that owns the active attempt but lost its pointer', () => {
    const summary = deriveWorkerHealth(
      [
        worker({
          currentTaskId: null,
          currentAttemptId: null,
        }),
      ],
      [ACTIVE_ATTEMPT]
    );

    expect(summary.pointerMismatch).toBe(1);
    expect(summary.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerId: ACTIVE_ATTEMPT.workerId,
          code: 'MISSING_ACTIVE_POINTER',
        }),
      ])
    );
  });
});

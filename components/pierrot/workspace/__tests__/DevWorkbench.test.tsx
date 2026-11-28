import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DevWorkbench from '../DevWorkbench';
import type {
  DevAttempt,
  DevReleaseOverview,
  DevWorkbenchOverview,
  DevWorkbenchTask,
} from '@/lib/pierrot/dev/workbench/types';

const MAIN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MID = 'cccccccccccccccccccccccccccccccccccccccc';
const PROD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOW = '2026-11-23T10:00:00.000Z';

function task(overrides: Partial<DevWorkbenchTask>): DevWorkbenchTask {
  return {
    id: 'task-1',
    title: 'Task',
    objective: '',
    repository: 'newlove',
    baseRef: 'main',
    status: 'draft',
    priority: 0,
    queuePosition: null,
    queuedAt: null,
    attemptCount: 0,
    acceptanceCriteria: ['It works'],
    verificationStatus: null,
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: null,
    resultNotes: '',
    pullRequests: [],
    updatedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

const runningTask = task({
  id: 'running-task',
  title: 'Running task',
  status: 'in_progress',
  attemptCount: 1,
});
const queuedTask = task({
  id: 'queued-task',
  title: 'Queued task',
  status: 'queued',
  queuePosition: 0,
  priority: 3,
  actionsDispatchStatus: 'requested',
  actionsDispatchRequestedAt: NOW,
});
const readyTask = task({ id: 'ready-task', title: 'Ready task', status: 'ready' });
const draftTask = task({ id: 'draft-task', title: 'Draft task', status: 'draft' });
const blockedTask = task({
  id: 'blocked-task',
  title: 'Blocked task',
  status: 'blocked',
  blockedReason: 'Waiting for owner decision',
});
const failedTask = task({
  id: 'failed-task',
  title: 'Failed task',
  status: 'failed',
  lastErrorCode: 'DEV_FAILED',
  lastErrorMessage: 'Test command failed',
});
const landedTask = task({
  id: 'landed-task',
  title: 'Landed task',
  status: 'verified',
  resultCommit: MID,
});
const releasedTask = task({
  id: 'released-task',
  title: 'Released task',
  status: 'verified',
  resultCommit: PROD,
});

const attempt = {
  id: 'attempt-1',
  taskId: runningTask.id,
  attemptNumber: 1,
  status: 'running',
  workerId: 'worker-1',
  branch: 'pierrot/dev/task/1',
  baseRef: 'main',
  baseCommit: MAIN,
  headSha: null,
  prNumber: null,
  prUrl: null,
  opencodeSessionId: null,
  exitCode: null,
  startedAt: NOW,
  finishedAt: null,
  heartbeatAt: NOW,
  leaseExpiresAt: '2026-11-23T10:30:00.000Z',
  progressStage: 'running tests',
  resultSummary: null,
  changedFiles: [],
  commands: [],
  warnings: [],
  errorCode: null,
  errorMessage: null,
  logExcerpt: null,
  createdAt: NOW,
} as unknown as DevAttempt;

const worker = {
  id: 'worker-1',
  name: 'actions-worker',
  kind: 'actions',
  status: 'busy',
  version: '1.0.0',
  hostname: null,
  codespaceName: null,
  repository: 'newlove',
  capabilities: { opencodeVersion: '2.1.4', opencodeAuthenticated: true },
  currentTaskId: runningTask.id,
  currentAttemptId: attempt.id,
  lastHeartbeatAt: NOW,
  lastError: null,
  stopRequested: false,
  heartbeatAgeSeconds: 5,
  online: true,
};

const overview = {
  schemaReady: true,
  migrationFile: '2026-11-22_pierrot_dev_workbench.sql',
  queuePaused: false,
  counts: {
    draft: 1,
    ready: 1,
    queued: 1,
    in_progress: 1,
    blocked: 1,
    failed: 1,
    verified: 2,
  },
  inbox: [draftTask, blockedTask],
  queue: [queuedTask, readyTask],
  batches: [],
  active: { task: runningTask, attempt, worker, events: [] },
  history: [
    { task: failedTask, attempts: [] },
    { task: landedTask, attempts: [] },
    { task: releasedTask, attempts: [] },
  ],
  review: [],
  workers: [worker],
  workerHealth: {
    total: 1,
    active: 1,
    stale: 0,
    historical: 0,
    finished: 0,
    orphan: 0,
    pointerMismatch: 0,
    issues: [],
  },
  recentEvents: [],
  lifecycle: {
    status: 'executing_task',
    label: 'Worker executing task',
    detail: 'One attempt is running.',
    schemaReady: true,
    codespace: null,
    codespaceError: null,
    worker: {
      id: worker.id,
      name: worker.name,
      online: true,
      status: 'busy',
      ready: true,
      version: '1.0.0',
      opencodeVersion: '2.1.4',
      readiness: null,
      readinessAgeSeconds: 5,
      readinessFresh: true,
      heartbeatAgeSeconds: 5,
      currentTaskId: runningTask.id,
      currentAttemptId: attempt.id,
    },
    workerRegistered: true,
    queue: { queued: 1, active: 1, paused: false },
    executing: true,
    idleSeconds: null,
    idleGraceSeconds: 120,
    startupGraceSeconds: 60,
    pendingStart: false,
    pendingStartAttempts: 0,
    pendingStartInfo: null,
    shutdownRequested: false,
    lastStartAt: null,
    lastStartState: null,
    lastStartObservedState: null,
    lastStartHttpStatus: null,
    lastStartConfirmedAt: null,
    lastReadyAt: null,
    lastKeepaliveAt: null,
    lastStopAt: null,
    lastBoot: null,
    recovery: null,
    lastStop: null,
    lastError: null,
    lastErrorCode: null,
    cost: {
      modelUsd: null,
      modelReportedUsd: null,
      modelEstimatedUsd: null,
      codespaceEstimatedUsd: null,
      codespaceConfirmedUsd: null,
      totalUsd: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      attemptsWithCost: 0,
      attemptsMissingCost: 0,
      attemptsWithEstimatedModel: 0,
      attemptsWithEstimatedCodespace: 0,
      unknown: [],
      provenance: 'test',
    },
    updatedAt: NOW,
  },
  finalization: null,
  updatedAt: NOW,
} as unknown as DevWorkbenchOverview;

const releaseOverview = {
  repository: 'merkurov1/newlove',
  branch: 'main',
  checkedAt: NOW,
  main: {
    sha: MAIN,
    shortSha: 'aaaaaaa',
    url: 'https://github.com/merkurov1/newlove/commit/' + MAIN,
  },
  production: {
    state: 'ready',
    url: 'https://newlove.example',
    target: 'production',
    commitSha: PROD,
    shortSha: 'bbbbbbb',
    checkedAt: NOW,
    reason: null,
  },
  target: {
    sha: MAIN,
    shortSha: 'aaaaaaa',
    url: 'https://github.com/merkurov1/newlove/commit/' + MAIN,
  },
  behindBy: 2,
  commits: [
    {
      sha: MAIN,
      shortSha: 'aaaaaaa',
      message: 'fix: follow up',
      author: 'Owner',
      committedAt: NOW,
      url: 'https://github.com/merkurov1/newlove/commit/' + MAIN,
    },
    {
      sha: MID,
      shortSha: 'ccccccc',
      message: 'feat: land a task',
      author: 'Owner',
      committedAt: NOW,
      url: 'https://github.com/merkurov1/newlove/commit/' + MID,
    },
  ],
  checks: [
    { key: 'main', label: 'main branch', status: 'ok', detail: 'main is readable' },
    { key: 'production', label: 'Production deployment', status: 'ok', detail: 'ready' },
  ],
  blockers: [],
  canRelease: true,
  releaseAction: {
    available: false,
    reason:
      'Production release execution is not connected in this deployment. The exact target SHA is shown, but Admin only reports readiness.',
    url: null,
  },
  error: null,
} as unknown as DevReleaseOverview;

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function installFetch(overviewBody: DevWorkbenchOverview = overview) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/workbench/release')) return response({ release: releaseOverview });
    if (url.includes('/workbench/actions')) {
      return response({ ok: true, overview: overviewBody, dispatch: { dispatched: true } });
    }
    return response({ overview: overviewBody });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function renderWorkbench() {
  await act(async () => {
    render(<DevWorkbench initialOverview={overview} onOpenChat={() => {}} />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Queueing a reviewed task asks the owner to confirm. jsdom does not
  // implement window.confirm, so without this the action never reaches fetch.
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('execution screen', () => {
  it('answers now, next, landed and release on one screen with distinct states', async () => {
    installFetch();
    await renderWorkbench();

    expect(screen.getByRole('heading', { name: 'Execution' })).toBeTruthy();
    expect(screen.getByText('Что выполняется сейчас')).toBeTruthy();
    expect(screen.getByText('Что дальше')).toBeTruthy();
    expect(screen.getByText('Что попало в main после релиза')).toBeTruthy();
    expect(screen.getByText('Готова ли production?')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(`main @ ${MAIN}`)).toBeTruthy();
    });

    expect(screen.getByText('Running task')).toBeTruthy();
    expect(screen.getByText('Queued task')).toBeTruthy();
    expect(screen.getByText('Blocked task')).toBeTruthy();
    expect(screen.getByText('Failed task')).toBeTruthy();
    expect(screen.getByText(/landed in main 1/)).toBeTruthy();
    expect(screen.getByText(/released to production 1/)).toBeTruthy();

    for (const label of ['INBOX', 'QUEUE', 'EXECUTION', 'LEDGER', 'HISTORY', 'REVIEW', 'SETUP']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}$`) })).toBeNull();
    }

    expect(screen.getByText('feat: land a task')).toBeTruthy();
    expect(screen.getByText('fix: follow up')).toBeTruthy();

    const releaseButton = screen.getByRole('button', { name: /Release aaaaaaa/i });
    expect(releaseButton).toBeDisabled();
    expect(releaseButton.getAttribute('title')).toMatch(/not connected in this deployment/i);
    expect(screen.getByText(/Merge завершает задачу в main/)).toBeTruthy();
  });

  it('opens details and queues a draft through the canonical lifecycle action', async () => {
    const queuedOverview = {
      ...overview,
      inbox: [blockedTask],
      queue: [
        queuedTask,
        readyTask,
        task({ id: 'draft-task', title: 'Draft task', status: 'queued', queuePosition: 2 }),
      ],
    } as unknown as DevWorkbenchOverview;
    const fetchMock = installFetch(queuedOverview);
    await renderWorkbench();

    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.getByRole('dialog', { name: 'Execution details' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Draft task/ }));
    fireEvent.click(screen.getByRole('button', { name: /Queue task/ }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('/workbench/actions')
      );
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        action: 'queue',
        taskId: 'draft-task',
      });
    });
    await screen.findByText(/Задание поставлено в очередь/);
  });

  it('does not expose owner approve, reject or merge actions in the normal workflow', async () => {
    installFetch();
    await renderWorkbench();

    expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reject$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Merge/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Accept$/i })).toBeNull();
  });
});

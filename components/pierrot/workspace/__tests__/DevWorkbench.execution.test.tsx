import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DevWorkbench from '../DevWorkbench';
import type { DevWorker, DevWorkbenchOverview } from '@/lib/pierrot/dev/workbench/types';

const NOW = '2026-11-20T10:00:00.000Z';

function lifecycle() {
  return {
    status: 'ready',
    label: 'Ready',
    detail: 'Queue is ready.',
    schemaReady: true,
    codespace: null,
    codespaceError: null,
    worker: null,
    workerRegistered: false,
    queue: { queued: 0, active: 0, paused: false },
    executing: false,
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
  };
}

function worker(overrides: Partial<DevWorker> = {}): DevWorker {
  return {
    id: 'worker-1',
    name: 'Worker',
    kind: 'actions',
    status: 'idle',
    reportedStatus: 'idle',
    stale: false,
    finished: false,
    version: '1.0.0',
    hostname: null,
    codespaceName: null,
    repository: 'merkurov1/newlove',
    capabilities: { opencodeVersion: '1.0.0', opencodeAuthenticated: true },
    currentTaskId: null,
    currentAttemptId: null,
    lastHeartbeatAt: NOW,
    lastError: null,
    stopRequested: false,
    heartbeatAgeSeconds: 1,
    online: true,
    ...overrides,
  };
}

function overview(overrides: Partial<DevWorkbenchOverview> = {}): DevWorkbenchOverview {
  const workers = overrides.workers || [];
  return {
    schemaReady: true,
    migrationFile: '2026-11-22_pierrot_dev_workbench.sql',
    queuePaused: false,
    counts: {},
    inbox: [],
    queue: [],
    batches: [],
    active: null,
    history: [],
    review: [],
    workers,
    workerHealth: {
      total: workers.length,
      active: workers.filter((item) => item.online && !item.finished).length,
      stale: workers.filter((item) => item.stale).length,
      historical: workers.filter((item) => !item.online && !item.stale).length,
      finished: workers.filter((item) => item.finished).length,
      orphan: 0,
      pointerMismatch: 0,
      issues: [],
    },
    recentEvents: [],
    lifecycle: lifecycle() as DevWorkbenchOverview['lifecycle'],
    finalization: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DevWorkbench execution control panel', () => {
  it('refreshes immediately when Execution opens and never posts a Codespace start', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ overview: overview() }));

    render(<DevWorkbench initialOverview={overview()} onOpenChat={jest.fn()} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /execution/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/pierrot/dev/workbench');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    expect(screen.getAllByText(/last update/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/on tab open/i)).toBeTruthy();

    for (const call of fetchMock.mock.calls) {
      expect(call[0]).not.toBe('/api/admin/pierrot/dev/workbench/actions');
    }
  });

  it('refreshes immediately when the app returns to the foreground', async () => {
    let visibility: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    fetchMock.mockResolvedValue(jsonResponse({ overview: overview() }));

    render(<DevWorkbench initialOverview={overview()} onOpenChat={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /execution/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockClear();
    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('shares one in-flight refresh instead of overlapping requests', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<DevWorkbench initialOverview={overview()} onOpenChat={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /execution/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // A foreground resume while the first request is still pending must reuse
    // the in-flight promise rather than starting a second Admin request.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.(jsonResponse({ overview: overview() }));
    });
    await waitFor(() => expect(screen.getByText(/^fresh$/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a refresh failure and recovers through the visible Retry action', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Overview unavailable' }, false, 500))
      .mockResolvedValueOnce(
        jsonResponse({ overview: overview({ updatedAt: '2026-11-20T10:05:00.000Z' }) })
      );

    render(<DevWorkbench initialOverview={overview()} onOpenChat={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /execution/i }));

    const failure = await screen.findByText(/Refresh failed: Overview unavailable/i);
    expect(failure.closest('[role="alert"]')).toBeTruthy();
    expect(screen.getAllByText(/refresh failed/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Refresh failed: Overview unavailable/i)).toBeNull()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('separates active workers from collapsed idle/offline history', async () => {
    const workers = [
      worker({ id: 'active', name: 'Active runner', online: true, status: 'busy' }),
      worker({
        id: 'stale',
        name: 'Stale runner',
        online: false,
        status: 'offline',
        stale: true,
        finished: false,
      }),
      worker({
        id: 'finished',
        name: 'Finished runner',
        online: false,
        status: 'offline',
        stale: false,
        finished: true,
        reportedStatus: 'offline',
      }),
    ];
    fetchMock.mockResolvedValue(jsonResponse({ overview: overview({ workers }) }));

    const { container } = render(
      <DevWorkbench initialOverview={overview({ workers })} onOpenChat={jest.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /execution/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const activeGroup = container.querySelector('[data-worker-group="active"]');
    const historicalGroup = container.querySelector(
      '[data-worker-group="historical"]'
    ) as HTMLElement | null;

    expect(activeGroup).toBeTruthy();
    expect(within(activeGroup as HTMLElement).getByText('Active runner')).toBeTruthy();
    expect(within(activeGroup as HTMLElement).queryByText('Stale runner')).toBeNull();
    expect(historicalGroup?.hasAttribute('open')).toBe(false);
    expect(within(historicalGroup as HTMLElement).getByText('Stale runner')).toBeTruthy();
    expect(within(historicalGroup as HTMLElement).getByText('Finished runner')).toBeTruthy();
  });
});

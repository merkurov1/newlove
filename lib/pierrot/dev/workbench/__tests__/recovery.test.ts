/** @jest-environment node */

jest.mock('../store', () => ({
  reapExpiredAttempts: jest.fn(),
}));

jest.mock('../actions', () => ({
  dispatchNextQueuedTask: jest.fn(),
}));

jest.mock('../finalization', () => ({
  advanceFinalization: jest.fn(),
}));

import { runWorkbenchRecovery } from '../recovery';
import { dispatchNextQueuedTask } from '../actions';
import { advanceFinalization } from '../finalization';
import { reapExpiredAttempts } from '../store';

const reap = reapExpiredAttempts as jest.Mock;
const dispatch = dispatchNextQueuedTask as jest.Mock;
const finalize = advanceFinalization as jest.Mock;

const dispatchResult = {
  dispatched: true,
  taskId: 'task-1',
  repository: 'newlove',
  code: 'ACTIONS_DISPATCHED',
  reason: 'GitHub accepted the repository_dispatch request.',
  requestedAt: '2026-11-26T10:00:00.000Z',
};

const finalizationReport = {
  id: 'finalization-1',
  stage: 'completed',
  integrated: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  reap.mockResolvedValue(2);
  dispatch.mockResolvedValue(dispatchResult);
  finalize.mockResolvedValue(finalizationReport);
});

describe('bounded workbench recovery', () => {
  it('runs each requested stage once, in dependency order, with telemetry', async () => {
    const result = await runWorkbenchRecovery({
      source: 'test:order',
      steps: ['finalization', 'dispatch', 'reap'],
      budgetMs: 5_000,
    });

    expect(result.status).toBe('ok');
    expect(result.reaped).toBe(2);
    expect(result.dispatch).toEqual(dispatchResult);
    expect(result.finalization).toEqual(finalizationReport);
    expect(result.steps.map((step) => step.step)).toEqual(['reap', 'dispatch', 'finalization']);
    expect(result.steps.every((step) => step.status === 'ok')).toBe(true);
    expect(result.steps.every((step) => step.durationMs >= 0)).toBe(true);
    expect(result.telemetry.stages.map((stage) => stage.stage)).toEqual([
      'reap',
      'dispatch',
      'finalization',
    ]);

    expect(reap.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(finalize.mock.invocationCallOrder[0]);
  });

  it('is a bounded batch: one reap and one dispatch per recovery pass', async () => {
    const result = await runWorkbenchRecovery({
      source: 'test:bounded',
      budgetMs: 5_000,
    });

    expect(result.steps.map((step) => step.step)).toEqual(['reap', 'dispatch']);
    expect(reap).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ source: 'test:bounded' });
    expect(finalize).not.toHaveBeenCalled();
    expect(result.finalization).toBeNull();
  });

  it('deduplicates requested steps so a pass cannot loop a dispatch or reap', async () => {
    const result = await runWorkbenchRecovery({
      source: 'test:dedupe',
      steps: ['dispatch', 'reap', 'dispatch', 'reap'],
      budgetMs: 5_000,
    });

    expect(result.steps.map((step) => step.step)).toEqual(['reap', 'dispatch']);
    expect(reap).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('continues after a partial failure and reports the failed stage', async () => {
    reap.mockRejectedValueOnce(
      Object.assign(new Error('reaper unavailable'), { code: 'REAPER_DOWN' })
    );
    dispatch.mockResolvedValueOnce(dispatchResult);
    finalize.mockRejectedValueOnce(new Error('GitHub unavailable'));

    const result = await runWorkbenchRecovery({
      source: 'test:partial',
      steps: ['reap', 'dispatch', 'finalization'],
      budgetMs: 5_000,
    });

    expect(result.status).toBe('partial');
    expect(result.timedOut).toBe(false);
    expect(result.steps.map((step) => [step.step, step.status])).toEqual([
      ['reap', 'error'],
      ['dispatch', 'ok'],
      ['finalization', 'error'],
    ]);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 'reap', code: 'REAPER_DOWN' }),
        expect.objectContaining({ step: 'finalization', code: 'Error' }),
      ])
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it('reports a fully failed pass without throwing', async () => {
    reap.mockRejectedValueOnce(new Error('reap failed'));
    dispatch.mockRejectedValueOnce(new Error('dispatch failed'));

    const result = await runWorkbenchRecovery({
      source: 'test:failed',
      budgetMs: 5_000,
    });

    expect(result.status).toBe('failed');
    expect(result.failures).toHaveLength(2);
  });

  it('times out a slow stage and marks later stages as skipped', async () => {
    reap.mockResolvedValueOnce(0);
    dispatch.mockImplementationOnce(() => new Promise(() => {}));

    const result = await runWorkbenchRecovery({
      source: 'test:timeout',
      steps: ['reap', 'dispatch', 'finalization'],
      budgetMs: 20,
    });

    expect(result.timedOut).toBe(true);
    expect(result.status).toBe('timed_out');
    expect(result.steps.map((step) => [step.step, step.status])).toEqual([
      ['reap', 'ok'],
      ['dispatch', 'timed_out'],
      ['finalization', 'skipped'],
    ]);
    expect(result.steps[2].code).toBe('RECOVERY_BUDGET_EXHAUSTED');
    expect(finalize).not.toHaveBeenCalled();
  });
});

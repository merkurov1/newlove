/** @jest-environment node */

import { WorkbenchStageTimer } from '../telemetry';

describe('workbench stage telemetry', () => {
  it('records duration and status for successful and failed stages', async () => {
    const timer = new WorkbenchStageTimer({ label: 'test', source: 'unit' });

    const value = await timer.measure('overview.tasks', async () => 'ok');
    expect(value).toBe('ok');

    await expect(
      timer.measure('overview.details', async () => {
        throw Object.assign(new Error('db down'), { code: 'DB_DOWN' });
      })
    ).rejects.toThrow('db down');

    timer.record('overview.skipped', 0, 'skipped', { code: 'BUDGET_EXHAUSTED' });

    expect(timer.stages).toEqual([
      expect.objectContaining({
        stage: 'overview.tasks',
        status: 'ok',
        code: null,
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        stage: 'overview.details',
        status: 'error',
        code: 'DB_DOWN',
      }),
      expect.objectContaining({
        stage: 'overview.skipped',
        status: 'skipped',
        code: 'BUDGET_EXHAUSTED',
      }),
    ]);
    expect(timer.stages.every((stage) => stage.durationMs >= 0)).toBe(true);
  });

  it('exposes a safe Server-Timing header and summary', async () => {
    const timer = new WorkbenchStageTimer({ label: 'test', source: 'unit' });
    await timer.measure('auth', async () => true);
    await timer.measure('overview.schema', async () => true);

    const summary = timer.summary();
    expect(summary.label).toBe('test');
    expect(summary.source).toBe('unit');
    expect(summary.totalMs).toBeGreaterThanOrEqual(0);
    expect(summary.stages.map((stage) => stage.stage)).toEqual(['auth', 'overview.schema']);

    const header = timer.serverTiming();
    expect(header).toMatch(/^total;dur=/);
    expect(header).toContain('auth;dur=');
    expect(header).toContain('overview-schema;dur=');
    expect(header).not.toContain('overview.schema');
  });

  it('logs one structured line and never throws from logging', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const timer = new WorkbenchStageTimer({ label: 'log-test' });
    await timer.measure('auth', async () => true);

    timer.log();

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain('[Pierrot Dev Workbench][telemetry]');
    const payload = JSON.parse(line.slice(line.indexOf('{')));
    expect(payload.label).toBe('log-test');
    expect(payload.stages.map((stage: { stage: string }) => stage.stage)).toEqual(['auth']);
    info.mockRestore();
  });
});

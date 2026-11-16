/** @jest-environment node */

import { buildAttemptCost, summarizeCosts } from '../costs';

describe('Dev Cost Ledger', () => {
  it('keeps unknown model and Codespaces costs as null, never zero', () => {
    const cost = buildAttemptCost({ usage: {}, machine: null, runtimeMs: null });
    expect(cost.model.costUsd).toBeNull();
    expect(cost.codespace.estimatedUsd).toBeNull();
    expect(cost.totalUsd).toBeNull();
    expect(cost.unknown).toEqual(expect.arrayContaining(['model cost', 'Codespaces cost']));
  });

  it('adds actual model cost and estimated Codespaces runtime separately', () => {
    const cost = buildAttemptCost({
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.25,
        steps: 1,
        provenance: 'opencode-step-finish',
      },
      machine: 'basicLinux32gb',
      runtimeMs: 60 * 60 * 1000,
    });
    expect(cost.model.costUsd).toBe(0.25);
    expect(cost.codespace.estimatedUsd).toBe(0.18);
    expect(cost.totalUsd).toBe(0.43);
    expect(cost.unknown).toEqual([]);
  });

  it('does not sum a partial total when one component is unavailable', () => {
    const summary = summarizeCosts([
      buildAttemptCost({
        usage: { costUsd: 0.1 },
        machine: null,
        runtimeMs: 1000,
      }),
    ]);
    expect(summary.modelUsd).toBe(0.1);
    expect(summary.codespaceEstimatedUsd).toBeNull();
    expect(summary.totalUsd).toBeNull();
  });

  it('explains a failure before the model started instead of reporting zero', () => {
    const cost = buildAttemptCost({
      usage: null,
      machine: 'basicLinux32gb',
      runtimeMs: 30_000,
      modelStarted: false,
    });
    expect(cost.model.costUsd).toBeNull();
    expect(cost.model.provenance).toBe('unavailable:model-not-started');
    expect(cost.unknown).toContain('model cost (model did not run)');
    expect(cost.codespace.estimatedUsd).toBeGreaterThan(0);
  });
});

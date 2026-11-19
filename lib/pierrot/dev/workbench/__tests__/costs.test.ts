/** @jest-environment node */

import {
  buildAttemptCost,
  estimateTaskCost,
  summarizeCosts,
} from '../costs';

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

  it('never records Codespaces runtime or cost for a GitHub-hosted Actions attempt', () => {
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
      startedAt: '2026-11-19T08:00:00.000Z',
      finishedAt: '2026-11-19T09:00:00.000Z',
      executor: 'actions',
    });
    expect(cost.codespace.machine).toBeNull();
    expect(cost.codespace.runtimeMs).toBeNull();
    expect(cost.codespace.billableMs).toBeNull();
    expect(cost.codespace.estimatedUsd).toBeNull();
    expect(cost.codespace.provenance).toBe('not-applicable:github-actions-hosted-runner');
    expect(cost.totalUsd).toBe(0.25);
    expect(cost.unknown).not.toContain('Codespaces cost');
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

  it('creates a versioned min/expected/max estimate before execution', () => {
    const estimate = estimateTaskCost({
      title: 'Cost ledger',
      objective: 'Record estimate and actual cost for every attempt in the workbench.',
      acceptanceCriteria: ['Estimate exists before queue', 'Actual cost per attempt'],
    });
    expect(estimate.persisted).toBe(false);
    expect(estimate.confidence).toBe('medium');
    expect(estimate.assumptions.length).toBeGreaterThan(0);
    expect(estimate.model.rate.version).toBe('deepseek-api-price-2025-09-05');
    expect(estimate.model.rate.source).toContain('api-docs.deepseek.com');
    expect(estimate.codespaces.rate.version).toBe('github-codespaces-list-price-2025-01');
    expect(estimate.model.minUsd).toBeLessThan(estimate.model.expectedUsd!);
    expect(estimate.model.expectedUsd).toBeLessThan(estimate.model.maxUsd!);
    expect(estimate.codespaces.minUsd).toBeLessThan(estimate.codespaces.expectedUsd!);
    expect(estimate.codespaces.expectedUsd).toBeLessThan(estimate.codespaces.maxUsd!);
    expect(estimate.total.minUsd).toBeLessThan(estimate.total.expectedUsd!);
    expect(estimate.total.expectedUsd).toBeLessThan(estimate.total.maxUsd!);
  });

  it('computes an estimated model cost from tokens when OpenCode omitted the price', () => {
    const cost = buildAttemptCost({
      usage: {
        provider: 'deepseek',
        model: 'deepseek/deepseek-chat',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        steps: 1,
      },
      machine: 'basicLinux32gb',
      runtimeMs: 60 * 60 * 1000,
    });
    expect(cost.model.reportedCostUsd).toBeNull();
    expect(cost.model.estimatedCostUsd).toBeCloseTo(0.7, 6);
    expect(cost.model.costKind).toBe('estimated');
    expect(cost.model.rate?.version).toBe('deepseek-api-price-2025-09-05');
    expect(cost.model.provenance).toBe('estimated:deepseek-api-price-2025-09-05');
    expect(cost.totalUsd).toBeCloseTo(0.88, 6);
    const summary = summarizeCosts([cost]);
    expect(summary.modelReportedUsd).toBeNull();
    expect(summary.modelEstimatedUsd).toBeCloseTo(0.7, 6);
    expect(summary.attemptsWithEstimatedModel).toBe(1);
  });

  it('records the Codespace window and keeps confirmed billing separate', () => {
    const cost = buildAttemptCost({
      usage: {
        provider: 'deepseek',
        model: 'deepseek/deepseek-chat',
        inputTokens: 10,
        outputTokens: 10,
        costUsd: 0.01,
        steps: 1,
      },
      machine: 'basicLinux32gb',
      startedAt: '2026-11-17T10:00:00.000Z',
      finishedAt: '2026-11-17T11:00:00.000Z',
    });
    expect(cost.codespace.runtimeMs).toBe(60 * 60 * 1000);
    expect(cost.codespace.startedAt).toBe('2026-11-17T10:00:00.000Z');
    expect(cost.codespace.finishedAt).toBe('2026-11-17T11:00:00.000Z');
    expect(cost.codespace.estimatedUsd).toBe(0.18);
    expect(cost.codespace.confirmedUsd).toBeNull();
    expect(cost.codespace.costKind).toBe('estimated');
    expect(cost.codespace.rate?.version).toBe('github-codespaces-list-price-2025-01');
  });
});

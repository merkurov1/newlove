/** @jest-environment node */

import { compareEvaluators, scoreCase } from '../compare';
import type { EvaluationCase, Evaluator } from '../types';

const cases: EvaluationCase[] = [
  {
    id: 'case-1',
    language: 'en',
    purpose: 'direct answer',
    system: 'system-one',
    prompt: 'prompt-one',
    checks: [
      { kind: 'includes', value: 'alpha' },
      { kind: 'minWords', value: 2 },
    ],
    maxWords: 10,
  },
  {
    id: 'case-2',
    language: 'en',
    purpose: 'uncertainty',
    system: 'system-two',
    prompt: 'prompt-two',
    checks: [{ kind: 'anyOf', values: ['cannot', 'no access'] }],
  },
];

function evaluator(
  id: string,
  model: string,
  responses: Record<string, string>
): { evaluator: Evaluator; prompts: Array<{ system: string; prompt: string }> } {
  const prompts: Array<{ system: string; prompt: string }> = [];

  return {
    prompts,
    evaluator: {
      id,
      provider: id.startsWith('gemini') ? 'gemini' : 'deepseek',
      model,
      async run(request) {
        prompts.push({ system: request.system, prompt: request.prompt });
        const text = responses[request.prompt];
        if (!text) throw new Error('missing fixture');
        return {
          provider: id.startsWith('gemini') ? 'gemini' : 'deepseek',
          model,
          text,
          latencyMs: id.startsWith('gemini') ? 100 : 200,
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            usageSource: 'provider_reported',
            providerReportedCostUsd: null,
          },
        };
      },
    },
  };
}

describe('Gemini vs DeepSeek evaluation harness', () => {
  it('scores checks deterministically', () => {
    expect(scoreCase(cases[0], 'alpha beta')).toMatchObject({
      ok: true,
      checksPassed: 3,
      checksTotal: 3,
    });
    expect(scoreCase(cases[0], 'alpha').ok).toBe(false);
    expect(scoreCase(cases[1], 'I have no access to that.').ok).toBe(true);
    expect(scoreCase(cases[1], 'It was 123.').failedChecks).toEqual(['any of cannot / no access']);
  });

  it('runs the exact same cases and prompts against both providers', async () => {
    const gemini = evaluator('gemini:test', 'gemini-test', {
      'prompt-one': 'alpha beta',
      'prompt-two': 'I cannot answer that.',
    });
    const deepseek = evaluator('deepseek:test', 'deepseek-test', {
      'prompt-one': 'alpha beta gamma',
      'prompt-two': 'It was 123.',
    });

    const report = await compareEvaluators({
      cases,
      evaluators: [gemini.evaluator, deepseek.evaluator],
      maxOutputTokens: 400,
    });

    expect(report.identicalCases).toBe(true);
    expect(report.caseIds).toEqual(['case-1', 'case-2']);
    expect(gemini.prompts).toEqual(deepseek.prompts);
    expect(gemini.prompts).toEqual([
      { system: 'system-one', prompt: 'prompt-one' },
      { system: 'system-two', prompt: 'prompt-two' },
    ]);

    const geminiSummary = report.summaries.find((item) => item.providerId === 'gemini:test');
    const deepseekSummary = report.summaries.find((item) => item.providerId === 'deepseek:test');

    expect(geminiSummary?.successfulCases).toBe(2);
    expect(deepseekSummary?.successfulCases).toBe(1);
    expect(deepseekSummary?.failedCaseIds).toEqual(['case-2']);
    expect(geminiSummary?.qualityScore).toBe(1);
    expect(deepseekSummary?.qualityScore).toBeLessThan(1);
    expect(geminiSummary?.averageLatencyMs).toBe(100);
    expect(deepseekSummary?.averageLatencyMs).toBe(200);
  });

  it('reports cost per successful task only when every cost is known', async () => {
    const gemini = evaluator('gemini:test', 'gemini-3.5-flash', {
      'prompt-one': 'alpha beta',
      'prompt-two': 'I cannot answer that.',
    });
    const deepseek = evaluator('deepseek:test', 'deepseek-chat', {
      'prompt-one': 'alpha beta',
      'prompt-two': 'I cannot answer that.',
    });

    const report = await compareEvaluators({
      cases,
      evaluators: [gemini.evaluator, deepseek.evaluator],
    });

    const geminiSummary = report.summaries.find((item) => item.providerId === 'gemini:test');
    const deepseekSummary = report.summaries.find((item) => item.providerId === 'deepseek:test');

    // Gemini has no verified bundled tariff in this environment.
    expect(geminiSummary?.estimatedCostUsd).toBeNull();
    expect(geminiSummary?.costComplete).toBe(false);
    expect(geminiSummary?.costPerSuccessfulTaskUsd).toBeNull();

    // Each case: 100 input * $0.30/M + 50 output * $1.20/M = $0.00009.
    expect(deepseekSummary?.costComplete).toBe(true);
    expect(deepseekSummary?.estimatedCostUsd).toBeCloseTo(0.00018, 8);
    expect(deepseekSummary?.costPerSuccessfulTaskUsd).toBeCloseTo(0.00009, 8);
  });
});

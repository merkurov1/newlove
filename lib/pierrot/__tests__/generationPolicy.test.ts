/** @jest-environment node */

import { afterEach, describe, expect, it } from '@jest/globals';

import {
  PIERROT_PROVIDER_OUTPUT_CAP,
  classifyPierrotTask,
  resolvePierrotGenerationPolicy,
} from '../generationPolicy';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Pierrot generation policy', () => {
  it('uses a small budget for ordinary conversation', () => {
    const policy = resolvePierrotGenerationPolicy({ message: 'Привет. Как дела?' });
    expect(policy.task).toBe('conversation');
    expect(policy.maxOutputTokens).toBeGreaterThanOrEqual(1_000);
    expect(policy.maxOutputTokens).toBeLessThanOrEqual(2_000);
  });

  it('uses a larger budget for retrieved analysis', () => {
    const policy = resolvePierrotGenerationPolicy({
      message: 'Что изменилось в проекте?',
      hasRetrievedContext: true,
      isReasoning: true,
    });
    expect(policy.task).toBe('analysis');
    expect(policy.maxOutputTokens).toBeGreaterThanOrEqual(3_000);
  });

  it('uses the research budget for historical work', () => {
    const policy = resolvePierrotGenerationPolicy({
      message: 'Изучи историю наших диалогов за день и собери хронику проекта.',
    });
    expect(policy.task).toBe('research');
    expect(policy.maxOutputTokens).toBeGreaterThanOrEqual(5_000);
  });

  it('uses the structured budget for chart and table requests', () => {
    const policy = resolvePierrotGenerationPolicy({
      message: 'Покажи график и таблицу по неделям.',
    });
    expect(policy.task).toBe('structured');
    expect(policy.maxOutputTokens).toBeGreaterThanOrEqual(6_000);
  });

  it('clamps provider output to the supported ceiling', () => {
    process.env.PIERROT_OUTPUT_TOKENS_STRUCTURED = '20000';
    const policy = resolvePierrotGenerationPolicy({
      message: 'Покажи график.',
    });
    expect(policy.maxOutputTokens).toBe(PIERROT_PROVIDER_OUTPUT_CAP);
  });

  it('reads configurable budgets from the environment', () => {
    process.env.PIERROT_OUTPUT_TOKENS_RESEARCH = '7200';
    const policy = resolvePierrotGenerationPolicy({
      message: 'Историческое исследование',
    });
    expect(policy.maxOutputTokens).toBe(7_200);
  });

  it('classifies research before analysis and keeps reasons explicit', () => {
    expect(
      classifyPierrotTask({ message: 'Проведи подробное историческое исследование' }).task
    ).toBe('research');
    expect(classifyPierrotTask({ message: 'Обычный вопрос' }).reason).toBe(
      'default_conversation'
    );
  });
});

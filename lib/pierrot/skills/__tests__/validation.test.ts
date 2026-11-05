import { describe, expect, it } from '@jest/globals';
import { validateSkillDefinition } from '../validation';
import type { SkillDefinition } from '../types';

function definition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'Historical review',
    description: 'Review a repeated procedure from history.',
    purpose: 'Keep a repeatable review bounded and evidence-based.',
    conditions: ['When the owner asks for a historical review.'],
    inputs: ['Recent work items'],
    steps: ['Collect examples', 'Compare outcomes', 'Report the gap'],
    tools: [],
    constraints: ['Read-only; owner authorization is required.'],
    expectedResult: 'A short evidence-based report.',
    tests: [{ name: 'basic', expected: 'Reports the gap.' }],
    examples: [],
    ...overrides,
  };
}

describe('Skill definition validation', () => {
  it('passes a complete bounded definition', () => {
    expect(validateSkillDefinition(definition()).passed).toBe(true);
  });

  it('fails a draft that still contains unresolved analysis placeholders', () => {
    const result = validateSkillDefinition(
      definition({
        steps: [
          '[ТРЕБУЕТ УТОЧНЕНИЯ] последовательность шагов не восстановлена',
          'Collect examples',
        ],
      })
    );

    expect(result.passed).toBe(false);
    expect(
      result.checks.find((check) => check.name === 'no_unresolved_placeholders')
    ).toMatchObject({
      passed: false,
    });
  });
});

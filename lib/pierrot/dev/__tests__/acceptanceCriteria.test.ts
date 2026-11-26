/** @jest-environment node */

import {
  generateAcceptanceCriteria,
  hasVerifiableAcceptanceCriteria,
  isVerifiableAcceptanceCriterion,
  normalizeAcceptanceCriteria,
} from '../acceptanceCriteria';

describe('acceptance criteria generation', () => {
  it('derives verifiable criteria from the goal, components and checks', () => {
    const result = generateAcceptanceCriteria({
      objective: 'Fix the task queue so rejected criteria stay out of execution',
      requiredBehavior: 'A task without criteria cannot be queued',
      affectedFiles: ['lib/pierrot/dev/tasks.ts', 'lib/pierrot/dev/workbench/execution.ts'],
      tests: ['pnpm typecheck', 'pnpm test -- acceptanceCriteria'],
    });

    expect(result.derivation).toBe('generated');
    expect(result.criteria.length).toBeGreaterThanOrEqual(4);
    expect(result.criteria[0]).toContain('task queue');
    expect(result.criteria.join('\n')).toContain('lib/pierrot/dev/tasks.ts');
    expect(result.criteria.join('\n')).toContain('pnpm typecheck');
    expect(result.criteria.every(isVerifiableAcceptanceCriterion)).toBe(true);
  });

  it('keeps verifiable owner-provided criteria and does not invent duplicates', () => {
    const result = generateAcceptanceCriteria({
      objective: 'Fix the task queue',
      acceptanceCriteria: ['A task without criteria cannot be queued.'],
    });

    expect(result).toEqual({
      criteria: ['A task without criteria cannot be queued'],
      derivation: 'provided',
      reason: null,
    });
  });

  it('replaces non-verifiable placeholders with derived criteria', () => {
    const result = generateAcceptanceCriteria({
      objective: 'Make the queue reject incomplete tasks',
      acceptanceCriteria: ['done', '', 'ok'],
    });

    expect(result.derivation).toBe('generated');
    expect(result.criteria).not.toContain('done');
    expect(result.criteria.length).toBeGreaterThan(0);
  });

  it('returns no criteria and a clear reason when the goal is too vague', () => {
    const result = generateAcceptanceCriteria({
      title: 'Fix',
      objective: '',
      requiredBehavior: '',
      affectedFiles: [],
      tests: [],
    });

    expect(result.criteria).toEqual([]);
    expect(result.derivation).toBe('unavailable');
    expect(result.reason).toContain('no concrete goal');
    expect(hasVerifiableAcceptanceCriteria(result.criteria)).toBe(false);
  });

  it('does not treat the default placeholder title as a concrete goal', () => {
    const result = generateAcceptanceCriteria({
      title: 'Инженерное задание',
      objective: '',
    });

    expect(result.derivation).toBe('unavailable');
    expect(result.criteria).toEqual([]);
  });

  it('does not treat empty or placeholder arrays as valid criteria', () => {
    expect(normalizeAcceptanceCriteria(['', '   ', 'done', 'ok'])).toEqual([]);
    expect(hasVerifiableAcceptanceCriteria([])).toBe(false);
    expect(hasVerifiableAcceptanceCriteria(['Build passes'])).toBe(true);
  });
});

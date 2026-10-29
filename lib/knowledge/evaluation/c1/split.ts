import { createHash } from 'node:crypto';

import type { C1Question, C1Split, C1SplitSummary } from './types';

export const C1_SPLIT_SEED = 'phase-c1-v3';

function groupHash(group: string, seed: string): string {
  return createHash('sha256')
    .update(`${seed}:${group}`, 'utf8')
    .digest('hex');
}

export function splitC1Questions(
  questions: C1Question[],
  seed: string = C1_SPLIT_SEED,
): {
  dev: C1Question[];
  test: C1Question[];
  summary: C1SplitSummary;
} {
  const groups = [...new Set(questions.map((question) => question.group))].sort(
    (left, right) => groupHash(left, seed).localeCompare(groupHash(right, seed)),
  );
  const testGroupCount = Math.max(1, Math.round(groups.length * 0.3));
  const testGroups = new Set(groups.slice(0, testGroupCount));
  const splitByGroup = new Map<string, C1Split>();

  for (const group of groups) {
    splitByGroup.set(group, testGroups.has(group) ? 'test' : 'dev');
  }

  const dev = questions.filter(
    (question) => splitByGroup.get(question.group) === 'dev',
  );
  const test = questions.filter(
    (question) => splitByGroup.get(question.group) === 'test',
  );

  return {
    dev,
    test,
    summary: {
      seed,
      rule:
        'Unique fact groups are sorted by sha256(seed:group); the first round(30%) of groups form the held-out test set. All questions sharing a group stay in the same split.',
      devGroupCount: groups.length - testGroups.size,
      testGroupCount: testGroups.size,
      devQuestionCount: dev.length,
      testQuestionCount: test.length,
    },
  };
}

export function splitForQuestion(
  question: C1Question,
  questions: C1Question[],
  seed: string = C1_SPLIT_SEED,
): C1Split {
  const groups = [...new Set(questions.map((item) => item.group))].sort(
    (left, right) => groupHash(left, seed).localeCompare(groupHash(right, seed)),
  );
  const testGroupCount = Math.max(1, Math.round(groups.length * 0.3));
  const testGroups = new Set(groups.slice(0, testGroupCount));

  return testGroups.has(question.group) ? 'test' : 'dev';
}

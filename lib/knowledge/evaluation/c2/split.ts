import { createHash } from 'node:crypto';

import type { C2Question, C2Split, C2SplitSummary } from './types';

export const C2_SPLIT_SEED = 'phase-c2-v90';

function groupHash(group: string, seed: string): string {
  return createHash('sha256')
    .update(`${seed}:${group}`, 'utf8')
    .digest('hex');
}

export function splitC2Questions(
  questions: C2Question[],
  seed: string = C2_SPLIT_SEED,
): {
  dev: C2Question[];
  calibration: C2Question[];
  test: C2Question[];
  summary: C2SplitSummary;
} {
  const groups = [...new Set(questions.map((question) => question.group))].sort(
    (left, right) => groupHash(left, seed).localeCompare(groupHash(right, seed)),
  );
  const testGroupCount = Math.max(1, Math.round(groups.length * 0.3));
  const calibrationGroupCount = Math.max(1, Math.round(groups.length * 0.2));
  const testGroups = new Set(groups.slice(0, testGroupCount));
  const calibrationGroups = new Set(
    groups.slice(testGroupCount, testGroupCount + calibrationGroupCount),
  );
  const splitByGroup = new Map<string, C2Split>();

  for (const group of groups) {
    splitByGroup.set(
      group,
      testGroups.has(group)
        ? 'test'
        : calibrationGroups.has(group)
          ? 'calibration'
          : 'dev',
    );
  }

  const dev = questions.filter(
    (question) => splitByGroup.get(question.group) === 'dev',
  );
  const calibration = questions.filter(
    (question) => splitByGroup.get(question.group) === 'calibration',
  );
  const test = questions.filter(
    (question) => splitByGroup.get(question.group) === 'test',
  );

  return {
    dev,
    calibration,
    test,
    summary: {
      seed,
      rule:
        'Unique fact groups are sorted by sha256(seed:group). The first round(30%) form the held-out test set; the next round(20%) form calibration; the remainder form development. All questions sharing a group stay in one split.',
      devGroupCount: groups.length - testGroups.size - calibrationGroups.size,
      calibrationGroupCount: calibrationGroups.size,
      testGroupCount: testGroups.size,
      devQuestionCount: dev.length,
      calibrationQuestionCount: calibration.length,
      testQuestionCount: test.length,
    },
  };
}

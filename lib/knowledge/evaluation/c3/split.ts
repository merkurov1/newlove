import { createHash } from 'node:crypto';

import type { C3Question, C3SplitSummary } from './types';

export const C3_SPLIT_SEED = 'phase-c3-v457';

function groupHash(group: string, seed: string): string {
  return createHash('sha256')
    .update(`${seed}:${group}`, 'utf8')
    .digest('hex');
}

export function splitC3Questions(
  questions: C3Question[],
  seed: string = C3_SPLIT_SEED,
): {
  dev: C3Question[];
  calibration: C3Question[];
  test: C3Question[];
  summary: C3SplitSummary;
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
  const splitByGroup = new Map<string, 'dev' | 'calibration' | 'test'>();

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

  const dev = questions.filter((q) => splitByGroup.get(q.group) === 'dev');
  const calibration = questions.filter(
    (q) => splitByGroup.get(q.group) === 'calibration',
  );
  const test = questions.filter((q) => splitByGroup.get(q.group) === 'test');

  return {
    dev,
    calibration,
    test,
    summary: {
      seed,
      rule:
        'Unique fact groups are sorted by sha256(seed:group). The first round(30%) form held-out test, the next round(20%) calibration, the remainder development. All questions sharing a group stay in one split.',
      devGroupCount: groups.length - testGroups.size - calibrationGroups.size,
      calibrationGroupCount: calibrationGroups.size,
      testGroupCount: testGroups.size,
      devQuestionCount: dev.length,
      calibrationQuestionCount: calibration.length,
      testQuestionCount: test.length,
    },
  };
}

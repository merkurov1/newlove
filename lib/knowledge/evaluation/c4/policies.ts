import type { C4PolicyName, C4QuestionResult } from './types';

export const C4_POLICIES: Array<{
  name: C4PolicyName;
  description: string;
  thresholds: number[] | null;
}> = [
  {
    name: 'baseline_b',
    description: 'Accept Strategy B outcome relevant_results.',
    thresholds: null,
  },
  {
    name: 'top_score',
    description: 'Accept when top score meets threshold.',
    thresholds: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30],
  },
  {
    name: 'margin',
    description: 'Accept when top-minus-second score meets threshold.',
    thresholds: [0, 1, 2, 3, 4, 5, 6, 8, 10],
  },
  {
    name: 'coverage',
    description: 'Accept when query-term coverage in the top chunk meets threshold.',
    thresholds: [0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  },
  {
    name: 'exact_phrase',
    description: 'Accept when an adjacent query bigram (or sole token) occurs in the top chunk.',
    thresholds: null,
  },
  {
    name: 'top_score_and_coverage',
    description: 'Accept when top score meets threshold and coverage is at least 0.5.',
    thresholds: [3, 4, 5, 6, 7, 8, 9, 10],
  },
];

export function acceptsC4(
  policy: C4PolicyName,
  threshold: number | null,
  result: C4QuestionResult,
): boolean {
  switch (policy) {
    case 'baseline_b':
      return result.baselineOutcome === 'relevant_results';
    case 'top_score':
      return result.features.topScore >= (threshold ?? 0);
    case 'margin':
      return result.features.margin >= (threshold ?? 0);
    case 'coverage':
      return result.features.coverage >= (threshold ?? 0);
    case 'exact_phrase':
      return result.features.exactPhrase;
    case 'top_score_and_coverage':
      return (
        result.features.topScore >= (threshold ?? 0) &&
        result.features.coverage >= 0.5
      );
  }
}

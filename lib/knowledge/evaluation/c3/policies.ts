import type { C3PolicyName, C3QuestionResult } from './types';

export type PolicyDefinition = {
  name: C3PolicyName;
  description: string;
  thresholds: number[] | null;
};

export const POLICY_DEFINITIONS: PolicyDefinition[] = [
  {
    name: 'baseline_b',
    description: 'Strategy B outcome is relevant_results; no additional abstention feature.',
    thresholds: null,
  },
  {
    name: 'top_score',
    description: 'Accept when the top Strategy B score is at least the threshold.',
    thresholds: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30],
  },
  {
    name: 'margin',
    description: 'Accept when the top score minus the second score is at least the threshold.',
    thresholds: [0, 1, 2, 3, 4, 5, 6, 8, 10],
  },
  {
    name: 'coverage',
    description: 'Accept when the fraction of distinct query terms present in the top chunk is at least the threshold.',
    thresholds: [0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  },
  {
    name: 'distinct_terms',
    description: 'Accept when at least the threshold number of distinct query terms occur in the top chunk.',
    thresholds: [1, 2, 3, 4, 5],
  },
  {
    name: 'exact_phrase',
    description: 'Accept only when an adjacent query bigram (or the sole query token) occurs in the top chunk.',
    thresholds: null,
  },
  {
    name: 'top_score_and_coverage',
    description: 'Accept when top score meets the threshold and at least half of the query terms occur in the top chunk.',
    thresholds: [3, 4, 5, 6, 7, 8, 9, 10],
  },
];

export function accepts(
  policy: C3PolicyName,
  threshold: number | null,
  result: C3QuestionResult,
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
    case 'distinct_terms':
      return result.features.distinctMatchedTerms >= (threshold ?? 0);
    case 'exact_phrase':
      return result.features.exactPhrase;
    case 'top_score_and_coverage':
      return (
        result.features.topScore >= (threshold ?? 0) &&
        result.features.coverage >= 0.5
      );
  }
}

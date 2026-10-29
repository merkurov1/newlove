import { createHash } from 'node:crypto';

import { C4_SPLIT_SEED } from './split';

export const C4_PROTOCOL_VERSION = 'c4-protocol-v1';

export const C4_METRIC_DEFINITIONS = {
  recallAtK:
    'Binary hit: 1 when at least one verified relevant chunk or section appears in the top K; denominator is verified answerable questions with valid ground truth.',
  precisionAt5:
    'Verified relevant top-5 chunks divided by 5; denominator is five slots for each verified answerable question.',
  mrr:
    'Mean reciprocal rank of the first verified relevant result; 0 when none. Denominator is verified answerable questions.',
  answerableCoverage:
    'Answerable questions accepted by the policy divided by verified answerable questions.',
  evidenceRecall:
    'Answerable questions both accepted and containing at least one verified relevant result divided by verified answerable questions.',
  correctAbstention:
    'Verified unanswerable questions rejected by the policy divided by verified unanswerable questions.',
  falseAccept:
    'Verified unanswerable questions accepted by the policy divided by verified unanswerable questions.',
  falseReject:
    'Verified answerable questions rejected by the policy divided by verified answerable questions.',
  evidenceMiss:
    'Verified answerable questions with no relevant result in top 5 divided by verified answerable questions, independent of the policy.',
  ndcgAt5:
    'Not computed: C4 ground truth is binary, not graded. No graded labels were fabricated.',
} as const;

export const C4_POLICY_DEFINITIONS = [
  {
    name: 'baseline_b',
    description: 'Strategy B outcome relevant_results; no extra feature.',
  },
  {
    name: 'top_score',
    description: 'Accept when the top Strategy B score meets a calibration-selected threshold.',
  },
  {
    name: 'margin',
    description: 'Accept when top score minus second score meets a calibration-selected threshold.',
  },
  {
    name: 'coverage',
    description: 'Accept when the fraction of distinct query terms in the top chunk meets a calibration-selected threshold.',
  },
  {
    name: 'exact_phrase',
    description: 'Accept when an adjacent query bigram or the sole query token occurs in the top chunk.',
  },
  {
    name: 'top_score_and_coverage',
    description: 'Accept when top score meets a calibration threshold and coverage is at least 0.5.',
  },
] as const;

export const C4_PROTOCOL_PAYLOAD = {
  version: C4_PROTOCOL_VERSION,
  splitSeed: C4_SPLIT_SEED,
  splitRule:
    'Fact-grouped deterministic 50/20/30 development/calibration/test split using sha256(seed:group); all questions about one fact share a group.',
  metricDefinitions: C4_METRIC_DEFINITIONS,
  policies: C4_POLICY_DEFINITIONS,
  topK: 5,
  inferenceFeaturesOnly: [
    'top score',
    'score margin',
    'query-term coverage',
    'distinct matched terms',
    'exact phrase evidence',
  ],
  evaluationOnly: [
    'answerability label',
    'verified relevant chunk IDs',
    'verified relevant section IDs',
    'expected section match',
  ],
  semanticPolicy:
    'A semantic strategy may be measured only with a known multilingual model and an already-installed offline runtime. No downloads or installs.',
};

export function hashC4Protocol(): string {
  return createHash('sha256')
    .update(JSON.stringify(C4_PROTOCOL_PAYLOAD), 'utf8')
    .digest('hex');
}

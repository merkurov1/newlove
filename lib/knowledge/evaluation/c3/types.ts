import type { C1Question } from '../c1/types';
import type { ChunkDiagnostics, DeterminismChecks } from '../types';

export type C3Split = 'dev' | 'calibration' | 'test';

export type C3SplitSummary = {
  seed: string;
  rule: string;
  devGroupCount: number;
  calibrationGroupCount: number;
  testGroupCount: number;
  devQuestionCount: number;
  calibrationQuestionCount: number;
  testQuestionCount: number;
};

export type C3Features = {
  topScore: number;
  secondScore: number;
  margin: number;
  queryTokenCount: number;
  distinctMatchedTerms: number;
  coverage: number;
  exactPhrase: boolean;
  /** Evaluation-only diagnostic. Never used by an inference policy. */
  expectedSectionMatch: boolean;
};

export type C3TopResult = {
  rank: number;
  chunkId: string;
  sectionIndex: number;
  sectionId: string;
  chapterNumber: number | null;
  score: number;
};

export type C3QuestionResult = {
  id: string;
  category: string;
  language: string;
  split: C3Split;
  answerability: string;
  groundTruthValid: boolean;
  scored: boolean;
  excludedReason: 'unverified' | 'invalid_ground_truth' | null;
  baselineOutcome: 'relevant_results' | 'weak_match' | 'no_match';
  top: C3TopResult[];
  relevantHit: boolean | null;
  firstRelevantRank: number | null;
  recallAt1: number | null;
  recallAt3: number | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  mrrContribution: number | null;
  features: C3Features;
  latencyMs: number;
};

export type C3RankingMetrics = {
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableCount: number;
  unanswerableCount: number;
  invalidGroundTruthCount: number;
  recallAt1: number | null;
  recallAt3: number | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  mrr: number | null;
};

export type C3PolicyMetrics = C3RankingMetrics & {
  acceptedAnswerable: number;
  evidenceAcceptedAnswerable: number;
  rejectedAnswerable: number;
  acceptedUnanswerable: number;
  rejectedUnanswerable: number;
  answerableCoverage: number | null;
  answerableEvidenceRecall: number | null;
  correctAbstentionRate: number | null;
  falseAcceptRate: number | null;
  falseRejectRate: number | null;
};

export type C3Breakdown = {
  key: string;
} & C3PolicyMetrics;

export type C3PolicyName =
  | 'baseline_b'
  | 'top_score'
  | 'margin'
  | 'coverage'
  | 'distinct_terms'
  | 'exact_phrase'
  | 'top_score_and_coverage';

export type C3Policy = {
  name: C3PolicyName;
  description: string;
  threshold: number | null;
  accept: (result: C3QuestionResult) => boolean;
};

export type C3PolicyReport = {
  policy: C3PolicyName;
  description: string;
  threshold: number | null;
  calibration: C3PolicyMetrics;
  test: C3PolicyMetrics;
  byLanguageTest: C3Breakdown[];
  byCategoryTest: C3Breakdown[];
};

export type C2MetricAuditRow = {
  strategy: 'A' | 'B';
  split: 'dev' | 'calibration' | 'test';
  answerableCount: number;
  reportedSuccess: number | null;
  independentEvidenceSuccess: number | null;
  successDiscrepancy: number | null;
  reportedAbstention: number | null;
  noMatchAbstention: number | null;
  weakMatchCount: number;
};

export type C3Report = {
  mode: 'local-evaluation';
  phase: 'C3';
  status: 'ok' | 'failed';
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  evaluatorVersion: string;
  manifestHash: string;
  questionSetHash: string;
  topK: number;
  split: C3SplitSummary;
  dataset: {
    totalQuestions: number;
    verified: number;
    unverified: number;
    answerable: number;
    unanswerable: number;
    languageCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  };
  ranking: {
    dev: C3RankingMetrics;
    calibration: C3RankingMetrics;
    test: C3RankingMetrics;
  };
  policies: C3PolicyReport[];
  c2Audit: C2MetricAuditRow[];
  diagnostics: ChunkDiagnostics;
  determinism: DeterminismChecks;
  checks: {
    sourceHashValid: boolean;
    questionSetValid: boolean;
    deterministicManifest: boolean;
    stableChunkIds: boolean;
    uniqueChunkIds: boolean;
    factGroupIntegrity: boolean;
    noPassageTextInReport: boolean;
  };
  allChecksPassed: boolean;
};

export type C3Question = C1Question;

import type { C1Question } from '../c1/types';
import type { ChunkDiagnostics, DeterminismChecks } from '../types';

export type C4LanguageMode = 'en' | 'pure_ru' | 'latin_ru';
export type C4Split = 'dev' | 'calibration' | 'test';

export type C4Question = C1Question & {
  russianMode?: 'pure' | 'latin_proper_noun';
};

export type C4SplitSummary = {
  seed: string;
  rule: string;
  devGroupCount: number;
  calibrationGroupCount: number;
  testGroupCount: number;
  devQuestionCount: number;
  calibrationQuestionCount: number;
  testQuestionCount: number;
};

export type C4Features = {
  topScore: number;
  secondScore: number;
  margin: number;
  queryTokenCount: number;
  distinctMatchedTerms: number;
  coverage: number;
  exactPhrase: boolean;
  expectedSectionMatch: boolean;
};

export type C4TopResult = {
  rank: number;
  chunkId: string;
  sectionIndex: number;
  sectionId: string;
  chapterNumber: number | null;
  score: number;
};

export type C4QuestionResult = {
  id: string;
  category: string;
  language: string;
  languageMode: C4LanguageMode;
  split: C4Split;
  answerability: string;
  groundTruthValid: boolean;
  scored: boolean;
  excludedReason: 'unverified' | 'invalid_ground_truth' | null;
  baselineOutcome: 'relevant_results' | 'weak_match' | 'no_match';
  top: C4TopResult[];
  relevantHit: boolean | null;
  firstRelevantRank: number | null;
  recallAt1: number | null;
  recallAt3: number | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  mrrContribution: number | null;
  features: C4Features;
  latencyMs: number;
};

export type C4Count = {
  numerator: number;
  denominator: number;
  value: number | null;
};

export type C4Metrics = {
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableCount: number;
  unanswerableCount: number;
  recallAt1: C4Count;
  recallAt3: C4Count;
  recallAt5: C4Count;
  precisionAt5: C4Count;
  mrr: C4Count;
  acceptedAnswerable: number;
  evidenceAcceptedAnswerable: number;
  rejectedAnswerable: number;
  acceptedUnanswerable: number;
  rejectedUnanswerable: number;
  answerableCoverage: C4Count;
  answerableEvidenceRecall: C4Count;
  correctAbstention: C4Count;
  falseAccept: C4Count;
  falseReject: C4Count;
  evidenceMiss: C4Count;
  p50LatencyMs: number;
  p95LatencyMs: number;
};

export type C4Breakdown = {
  key: string;
} & C4Metrics;

export type C4PolicyName =
  | 'baseline_b'
  | 'top_score'
  | 'margin'
  | 'coverage'
  | 'exact_phrase'
  | 'top_score_and_coverage';

export type C4PolicyReport = {
  strategy: 'A' | 'B';
  policy: C4PolicyName;
  description: string;
  threshold: number | null;
  calibration: C4Metrics;
  test: C4Metrics;
  byLanguageTest: C4Breakdown[];
  byCategoryTest: C4Breakdown[];
};

export type C4StrategyReport = {
  strategy: 'A' | 'B' | 'C' | 'D';
  name: string;
  status: 'measured' | 'blocked';
  blocker?: string;
  config?: unknown;
  indexBuildMs?: number;
  bySplit?: Partial<
    Record<
      C4Split,
      {
        metrics: C4Metrics;
        byLanguage: C4Breakdown[];
        byCategory: C4Breakdown[];
        questions: C4QuestionResult[];
      }
    >
  >;
};

export type C4SemanticAvailability = {
  available: boolean;
  runtime: { package: string; available: boolean };
  model: {
    path: string;
    exists: boolean;
    name: string;
    dimensions: number | null;
    multilingual: boolean | null;
    localOnly: boolean;
  };
  blocker: string | null;
};

export type C4Report = {
  mode: 'local-evaluation';
  phase: 'C4';
  status: 'ok' | 'failed';
  protocolVersion: string;
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  evaluatorVersion: string;
  manifestHash: string;
  questionSetHash: string;
  protocolHash: string;
  topK: number;
  split: C4SplitSummary;
  dataset: {
    totalQuestions: number;
    verified: number;
    unverified: number;
    answerable: number;
    unanswerable: number;
    languageCounts: Record<string, number>;
    languageModeCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  };
  ranking: {
    dev: C4Metrics;
    calibration: C4Metrics;
    test: C4Metrics;
  };
  policies: C4PolicyReport[];
  strategies: C4StrategyReport[];
  semanticAvailability: C4SemanticAvailability;
  c2MetricDefect: string;
  diagnostics: ChunkDiagnostics;
  determinism: DeterminismChecks;
  checks: {
    sourceHashValid: boolean;
    questionSetValid: boolean;
    deterministicManifest: boolean;
    stableChunkIds: boolean;
    uniqueChunkIds: boolean;
    factGroupIntegrity: boolean;
    noGroundTruthLeakage: boolean;
    noPassageTextInReport: boolean;
  };
  allChecksPassed: boolean;
};

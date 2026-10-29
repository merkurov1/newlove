import type { C1Question, C1ModelConfig } from '../c1/types';
import type { ChunkDiagnostics, DeterminismChecks } from '../types';

export type C2Split = 'dev' | 'calibration' | 'test';

export type C2SplitSummary = {
  seed: string;
  rule: string;
  devGroupCount: number;
  calibrationGroupCount: number;
  testGroupCount: number;
  devQuestionCount: number;
  calibrationQuestionCount: number;
  testQuestionCount: number;
};

export type C2Metrics = {
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
  ndcgAt5: number | null;
  retrievalSuccessRate: number | null;
  correctAbstentionRate: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
};

export type C2Breakdown = {
  key: string;
} & C2Metrics;

export type C2QuestionResult = {
  id: string;
  category: string;
  language: string;
  split: C2Split;
  answerability: string;
  groundTruthValid: boolean;
  scored: boolean;
  excludedReason: 'unverified' | 'invalid_ground_truth' | null;
  outcome: 'relevant_results' | 'weak_match' | 'no_match';
  top: Array<{
    rank: number;
    chunkId: string;
    sectionIndex: number;
    sectionId: string;
    chapterNumber: number | null;
    score: number;
    rawScore: number;
  }>;
  relevantHit: boolean | null;
  firstRelevantRank: number | null;
  recallAt1: number | null;
  recallAt3: number | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  falsePositive: boolean | null;
  falseNegative: boolean | null;
  correctAbstention: boolean | null;
  latencyMs: number;
};

export type C2StrategyReport = {
  strategy: 'A' | 'B' | 'C' | 'D';
  name: string;
  status: 'measured' | 'blocked';
  blocker?: string;
  config?: C1ModelConfig | { k1: number; b: number; minScore: number };
  indexBuildMs?: number;
  bySplit?: Partial<
    Record<
      C2Split,
      {
        metrics: C2Metrics;
        byLanguage: C2Breakdown[];
        byCategory: C2Breakdown[];
        questions: C2QuestionResult[];
      }
    >
  >;
};

export type C2SemanticAvailability = {
  available: boolean;
  runtime: {
    package: string;
    available: boolean;
  };
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

export type C2AbstentionPolicy = {
  strategy: 'B';
  selection: 'calibration-only';
  threshold: number;
  objective: string;
  calibration: C2Metrics;
  test: C2Metrics;
};

export type C2Report = {
  mode: 'local-evaluation';
  phase: 'C2';
  status: 'ok' | 'failed';
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  evaluatorVersion: string;
  manifestHash: string;
  questionSetHash: string;
  topK: number;
  split: C2SplitSummary;
  strategies: C2StrategyReport[];
  abstentionPolicy?: C2AbstentionPolicy;
  semanticAvailability: C2SemanticAvailability;
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

export type C2Question = C1Question;

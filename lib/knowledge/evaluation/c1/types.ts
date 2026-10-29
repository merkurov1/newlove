import type {
  ChunkDiagnostics,
  DeterminismChecks,
  EvaluationCategory,
} from '../types';

export type C1Language = 'en' | 'ru';
export type C1Split = 'dev' | 'test';
export type C1Answerability = 'answerable' | 'unanswerable' | 'unverified';
export type RetrievalOutcome = 'relevant_results' | 'weak_match' | 'no_match';

export type C1Question = {
  id: string;
  category: EvaluationCategory;
  language: C1Language;
  group: string;
  /** Used only by the evaluator; never emitted in reports. */
  question: string;
  answerability: C1Answerability;
  expectedAnswerLabel?: string;
  relevantChunkIds?: string[];
  relevantSectionIndexes?: number[];
  /** Short methodology note; must not contain manuscript passages. */
  note?: string;
};

export type C1Hit = {
  chunkId: string;
  sectionIndex: number;
  sectionPath: string[];
  charStart: number;
  charEnd: number;
  score: number;
  rawScore: number;
};

export type C1Retrieval = {
  outcome: RetrievalOutcome;
  hits: C1Hit[];
  topScore: number;
  latencyMs: number;
};

export type C1ModelConfig = {
  k1: number;
  b: number;
  bodyWeight: number;
  headingWeight: number;
  partWeight: number;
  pathWeight: number;
  sectionBoost: number;
  minScore: number;
  stopwords: string[];
};

export type C1TopResult = {
  rank: number;
  chunkId: string;
  sectionIndex: number;
  sectionId: string;
  chapterNumber: number | null;
  score: number;
  rawScore: number;
};

export type C1QuestionResult = {
  id: string;
  category: EvaluationCategory;
  language: C1Language;
  split: C1Split;
  answerability: C1Answerability;
  groundTruthValid: boolean;
  scored: boolean;
  excludedReason: 'unverified' | 'invalid_ground_truth' | null;
  outcome: RetrievalOutcome;
  top: C1TopResult[];
  relevantHit: boolean | null;
  firstRelevantRank: number | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  falsePositive: boolean | null;
  falseNegative: boolean | null;
  correctAbstention: boolean | null;
  latencyMs: number;
};

export type C1ModelMetrics = {
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableCount: number;
  unanswerableCount: number;
  invalidGroundTruthCount: number;
  recallAt5: number | null;
  precisionAt5: number | null;
  mrr: number | null;
  retrievalSuccessRate: number | null;
  correctAbstentionRate: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
};

export type C1Breakdown = {
  key: string;
} & C1ModelMetrics;

export type C1ModelSplitReport = {
  model: 'baseline' | 'improved';
  split: C1Split;
  config?: C1ModelConfig;
  metrics: C1ModelMetrics;
  byLanguage: C1Breakdown[];
  byCategory: C1Breakdown[];
  questions: C1QuestionResult[];
};

export type C1SplitSummary = {
  seed: string;
  rule: string;
  devGroupCount: number;
  testGroupCount: number;
  devQuestionCount: number;
  testQuestionCount: number;
};

export type C1Report = {
  mode: 'local-evaluation';
  phase: 'C1';
  status: 'ok' | 'failed';
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  evaluatorVersion: string;
  manifestHash: string;
  questionSetHash: string;
  topK: number;
  baselineConfig: { k1: number; b: number; minScore: number };
  improvedConfig: C1ModelConfig;
  split: C1SplitSummary;
  dev: {
    baseline: C1ModelSplitReport;
    improved: C1ModelSplitReport;
  };
  test: {
    baseline: C1ModelSplitReport;
    improved: C1ModelSplitReport;
  };
  diagnostics: ChunkDiagnostics;
  determinism: DeterminismChecks;
  checks: {
    sourceHashValid: boolean;
    questionSetValid: boolean;
    deterministicManifest: boolean;
    stableChunkIds: boolean;
    uniqueChunkIds: boolean;
    noPassageTextInReport: boolean;
  };
  allChecksPassed: boolean;
};

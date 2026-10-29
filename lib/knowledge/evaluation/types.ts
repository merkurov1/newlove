export type EvaluationCategory =
  | 'direct_factual'
  | 'structure'
  | 'specific_passage'
  | 'paraphrased'
  | 'ambiguous'
  | 'absent'
  | 'misleading'
  | 'prompt_injection';

export type Answerability = 'answerable' | 'unanswerable' | 'unverified';

export type EvaluationQuestion = {
  id: string;
  category: EvaluationCategory;
  /** Used only by the evaluator; never emitted in reports. */
  question: string;
  answerability: Answerability;
  expectedAnswerLabel?: string;
  relevantChunkIds?: string[];
  relevantSectionIndexes?: number[];
  /** Short methodology note; must not contain manuscript passages. */
  note?: string;
};

export type RetrievalHit = {
  chunkId: string;
  sectionIndex: number;
  /** Internal provenance. Not emitted by the metadata-only report serializer. */
  sectionPath: string[];
  charStart: number;
  charEnd: number;
  score: number;
};

export type QueryRetrieval = {
  status: 'results' | 'no_match';
  hits: RetrievalHit[];
  latencyMs: number;
};

export type TopResult = {
  rank: number;
  chunkId: string;
  sectionIndex: number;
  sectionId: string;
  chapterNumber: number | null;
  score: number;
};

export type QuestionEvaluation = {
  id: string;
  category: EvaluationCategory;
  answerability: Answerability;
  groundTruthValid: boolean;
  scored: boolean;
  excludedReason: 'unverified' | 'invalid_ground_truth' | null;
  retrievalStatus: 'results' | 'no_match';
  top: TopResult[];
  relevantHit: boolean | null;
  firstRelevantRank: number | null;
  recallAtK: number | null;
  precisionAtK: number | null;
  falsePositive: boolean | null;
  latencyMs: number;
};

export type AggregateMetrics = {
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableVerifiedCount: number;
  unanswerableVerifiedCount: number;
  invalidGroundTruthCount: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  retrievalSuccessRate: number | null;
  falsePositiveRate: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
};

export type CategoryMetrics = {
  category: EvaluationCategory;
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableCount: number;
  unanswerableCount: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  retrievalSuccessRate: number | null;
  falsePositiveRate: number | null;
};

export type DuplicateHashGroup = {
  contentHash: string;
  count: number;
  chunkIds: string[];
};

export type ChunkDiagnostics = {
  totalChunks: number;
  minChunkChars: number;
  medianChunkChars: number;
  p95ChunkChars: number;
  maxChunkChars: number;
  chunkCountsBySectionType: Record<string, number>;
  chunkCountsByPartIndex: Record<string, number>;
  nearEmptyChunkCount: number;
  nearEmptyChunkIds: string[];
  duplicateContentHashCount: number;
  duplicateContentHashGroups: DuplicateHashGroup[];
  invalidOffsetCount: number;
  invalidOffsetChunkIds: string[];
  overlappingOffsetPairCount: number;
  chunksCrossingSectionBoundaryCount: number;
  sectionsWithNoChunks: number[];
  partCount: number;
  chapterCount: number;
  sectionCount: number;
  sectionCountingRule: string;
  stableManifest: boolean;
  stableChunkIds: boolean;
  uniqueChunkIds: boolean;
};

export type DeterminismChecks = {
  stableManifest: boolean;
  stableChunkIds: boolean;
  uniqueChunkIds: boolean;
};

export type EvaluationChecks = {
  sourceHashValid: boolean;
  groundTruthReferencesValid: boolean;
  sectionBoundariesIntact: boolean;
  offsetsValid: boolean;
  deterministicManifest: boolean;
  stableChunkIds: boolean;
  uniqueChunkIds: boolean;
  noPassageTextInReport: boolean;
};

export type EvaluationReport = {
  mode: 'local-evaluation';
  status: 'ok' | 'failed';
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  evaluatorVersion: string;
  manifestHash: string;
  questionSetHash: string;
  topK: number;
  metrics: AggregateMetrics;
  byCategory: CategoryMetrics[];
  questions: QuestionEvaluation[];
  diagnostics: ChunkDiagnostics;
  checks: EvaluationChecks;
  allChecksPassed: boolean;
};

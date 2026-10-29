import { UNFRAMED_EXPECTED_SHA256 } from '../../unframed';
import type { UnframedBuild } from '../../types';
import { buildChunkDiagnostics } from '../diagnostics';
import type { DeterminismChecks } from '../types';
import type { C1ModelConfig, C1Question, C1Retrieval } from '../c1/types';
import {
  createBaselineRetriever,
  createImprovedRetriever,
  DEFAULT_IMPROVED_CONFIG,
} from '../c1/retrieval';
import { hashC2QuestionSet } from './questions';
import { detectSemanticAvailability } from './semanticAvailability';
import { splitC2Questions } from './split';
import type {
  C2AbstentionPolicy,
  C2Breakdown,
  C2Metrics,
  C2Question,
  C2QuestionResult,
  C2Report,
  C2Split,
  C2StrategyReport,
} from './types';

export const C2_EVALUATOR_VERSION = 'unframed-eval-c2-v1';

type Retriever = (query: string, topK: number) => C1Retrieval;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * fraction)),
  );

  return sorted[index];
}

function chapterNumbers(document: UnframedBuild['document']): Map<number, number> {
  const result = new Map<number, number>();
  let chapter = 0;

  for (const section of document.sections) {
    if (section.type === 'chapter') {
      chapter += 1;
      result.set(section.index, chapter);
    }
  }

  return result;
}

function validateGroundTruth(
  question: C1Question,
  build: UnframedBuild,
): boolean {
  if (question.answerability === 'unverified') return true;

  const chunks = question.relevantChunkIds ?? [];
  const sections = question.relevantSectionIndexes ?? [];
  const hasReferences = chunks.length > 0 || sections.length > 0;

  if (question.answerability === 'unanswerable') return !hasReferences;
  if (!hasReferences) return false;

  const chunkIds = new Set(build.chunks.map((chunk) => chunk.id));
  const sectionIds = new Set(build.document.sections.map((section) => section.index));

  return (
    chunks.every((chunkId) => chunkIds.has(chunkId)) &&
    sections.every((sectionIndex) => sectionIds.has(sectionIndex))
  );
}

function evaluateQuestion(
  question: C2Question,
  split: C2Split,
  build: UnframedBuild,
  retriever: Retriever,
  topK: number,
  sectionToChapter: Map<number, number>,
): C2QuestionResult {
  const retrieval = retriever(question.question, topK);
  const top = retrieval.hits.map((hit, index) => ({
    rank: index + 1,
    chunkId: hit.chunkId,
    sectionIndex: hit.sectionIndex,
    sectionId: `section:${hit.sectionIndex}`,
    chapterNumber: sectionToChapter.get(hit.sectionIndex) ?? null,
    score: hit.score,
    rawScore: hit.rawScore,
  }));
  const groundTruthValid = validateGroundTruth(question, build);
  const scored = question.answerability !== 'unverified' && groundTruthValid;

  if (!scored) {
    return {
      id: question.id,
      category: question.category,
      language: question.language,
      split,
      answerability: question.answerability,
      groundTruthValid,
      scored: false,
      excludedReason:
        question.answerability === 'unverified'
          ? 'unverified'
          : 'invalid_ground_truth',
      outcome: retrieval.outcome,
      top,
      relevantHit: null,
      firstRelevantRank: null,
      recallAt1: null,
      recallAt3: null,
      recallAt5: null,
      precisionAt5: null,
      falsePositive: null,
      falseNegative: null,
      correctAbstention: null,
      latencyMs: retrieval.latencyMs,
    };
  }

  if (question.answerability === 'unanswerable') {
    return {
      id: question.id,
      category: question.category,
      language: question.language,
      split,
      answerability: question.answerability,
      groundTruthValid: true,
      scored: true,
      excludedReason: null,
      outcome: retrieval.outcome,
      top,
      relevantHit: null,
      firstRelevantRank: null,
      recallAt1: null,
      recallAt3: null,
      recallAt5: null,
      precisionAt5: null,
      falsePositive: retrieval.outcome === 'relevant_results',
      falseNegative: null,
      correctAbstention: retrieval.outcome !== 'relevant_results',
      latencyMs: retrieval.latencyMs,
    };
  }

  const relevantChunks = new Set(question.relevantChunkIds ?? []);
  const relevantSections = new Set(question.relevantSectionIndexes ?? []);
  const isRelevant = (hit: C1Retrieval['hits'][number]): boolean =>
    relevantChunks.has(hit.chunkId) || relevantSections.has(hit.sectionIndex);
  const relevantHits =
    retrieval.outcome === 'relevant_results'
      ? retrieval.hits.filter(isRelevant)
      : [];
  const firstRelevant = retrieval.hits.findIndex(isRelevant);
  const firstRelevantRank =
    retrieval.outcome === 'relevant_results' && firstRelevant >= 0
      ? firstRelevant + 1
      : null;
  const hasRelevantAt = (depth: number): boolean =>
    relevantHits.some((hit) => retrieval.hits.indexOf(hit) < depth);

  return {
    id: question.id,
    category: question.category,
    language: question.language,
    split,
    answerability: question.answerability,
    groundTruthValid: true,
    scored: true,
    excludedReason: null,
    outcome: retrieval.outcome,
    top,
    relevantHit: relevantHits.length > 0,
    firstRelevantRank,
    recallAt1: hasRelevantAt(1) ? 1 : 0,
    recallAt3: hasRelevantAt(3) ? 1 : 0,
    recallAt5: hasRelevantAt(5) ? 1 : 0,
    precisionAt5: relevantHits.length / topK,
    falsePositive: null,
    falseNegative: relevantHits.length === 0,
    correctAbstention: null,
    latencyMs: retrieval.latencyMs,
  };
}

function metricsFor(
  questions: C1Question[],
  results: C2QuestionResult[],
): C2Metrics {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable',
  );
  const invalid = results.filter(
    (result) => result.answerability !== 'unverified' && !result.groundTruthValid,
  );
  const latencies = results.map((result) => result.latencyMs);

  return {
    questionCount: questions.length,
    verifiedCount: questions.filter(
      (question) => question.answerability !== 'unverified',
    ).length,
    unverifiedCount: questions.filter(
      (question) => question.answerability === 'unverified',
    ).length,
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    invalidGroundTruthCount: invalid.length,
    recallAt1: mean(answerable.map((result) => result.recallAt1 ?? 0)),
    recallAt3: mean(answerable.map((result) => result.recallAt3 ?? 0)),
    recallAt5: mean(answerable.map((result) => result.recallAt5 ?? 0)),
    precisionAt5: mean(answerable.map((result) => result.precisionAt5 ?? 0)),
    mrr: mean(
      answerable.map((result) =>
        result.firstRelevantRank ? 1 / result.firstRelevantRank : 0,
      ),
    ),
    ndcgAt5: null,
    retrievalSuccessRate: mean(
      answerable.map((result) => (result.outcome === 'relevant_results' ? 1 : 0)),
    ),
    correctAbstentionRate: mean(
      unanswerable.map((result) => (result.correctAbstention ? 1 : 0)),
    ),
    falsePositiveRate: mean(
      unanswerable.map((result) => (result.falsePositive ? 1 : 0)),
    ),
    falseNegativeRate: mean(
      answerable.map((result) => (result.falseNegative ? 1 : 0)),
    ),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

function applyThreshold(
  question: C2Question,
  result: C2QuestionResult,
  threshold: number,
): C2QuestionResult {
  if (!result.scored) return result;

  const top = result.top;
  const topScore = top[0]?.score ?? 0;
  const outcome: C2QuestionResult['outcome'] =
    top.length > 0 && topScore >= threshold
      ? 'relevant_results'
      : top.length > 0
        ? 'weak_match'
        : 'no_match';

  if (question.answerability === 'unanswerable') {
    return {
      ...result,
      outcome,
      falsePositive: outcome === 'relevant_results',
      correctAbstention: outcome !== 'relevant_results',
    };
  }

  const relevantChunks = new Set(question.relevantChunkIds ?? []);
  const relevantSections = new Set(question.relevantSectionIndexes ?? []);
  const isRelevant = (hit: C2QuestionResult['top'][number]): boolean =>
    relevantChunks.has(hit.chunkId) || relevantSections.has(hit.sectionIndex);
  const aboveThreshold = top.filter((hit) => hit.score >= threshold);
  const relevantHits =
    outcome === 'relevant_results' ? aboveThreshold.filter(isRelevant) : [];
  const firstIndex = top.findIndex(
    (hit) => hit.score >= threshold && isRelevant(hit),
  );
  const firstRelevantRank =
    outcome === 'relevant_results' && firstIndex >= 0 ? firstIndex + 1 : null;
  const hasRelevantAt = (depth: number): boolean =>
    relevantHits.some((hit) => top.indexOf(hit) < depth);

  return {
    ...result,
    outcome,
    relevantHit: relevantHits.length > 0,
    firstRelevantRank,
    recallAt1: hasRelevantAt(1) ? 1 : 0,
    recallAt3: hasRelevantAt(3) ? 1 : 0,
    recallAt5: hasRelevantAt(5) ? 1 : 0,
    precisionAt5: relevantHits.length / 5,
    falsePositive: null,
    falseNegative: relevantHits.length === 0,
    correctAbstention: null,
  };
}

function selectCalibrationThreshold(
  calibrationQuestions: C1Question[],
  calibrationResults: C2QuestionResult[],
): { threshold: number; calibration: C2Metrics } {
  const base = metricsFor(calibrationQuestions, calibrationResults);
  const thresholds = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
  const candidates = thresholds.map((threshold) => {
    const results = calibrationResults.map((result) => {
      const question = calibrationQuestions.find((item) => item.id === result.id);

      return question ? applyThreshold(question, result, threshold) : result;
    });

    return {
      threshold,
      metrics: metricsFor(calibrationQuestions, results),
    };
  });
  const eligible = candidates.filter(
    (candidate) =>
      (candidate.metrics.recallAt5 ?? 0) >= (base.recallAt5 ?? 0) - 0.02 &&
      (candidate.metrics.precisionAt5 ?? 0) >= (base.precisionAt5 ?? 0) - 0.02,
  );
  const selected =
    eligible.sort(
      (left, right) =>
        (right.metrics.correctAbstentionRate ?? 0) -
          (left.metrics.correctAbstentionRate ?? 0) ||
        left.threshold - right.threshold,
    )[0] ?? { threshold: 3, metrics: base };

  return {
    threshold: selected.threshold,
    calibration: selected.metrics,
  };
}

function breakdowns(
  key: 'language' | 'category',
  questions: C1Question[],
  results: C2QuestionResult[],
): C2Breakdown[] {
  const keys = [...new Set(questions.map((question) => question[key]))].sort();

  return keys.map((value) => {
    const subsetQuestions = questions.filter((question) => question[key] === value);
    const subsetResults = results.filter((result) => result[key] === value);

    return {
      key: String(value),
      ...metricsFor(subsetQuestions, subsetResults),
    };
  });
}

function evaluateSplit(
  split: C2Split,
  questions: C1Question[],
  build: UnframedBuild,
  retriever: Retriever,
  topK: number,
): {
  metrics: C2Metrics;
  byLanguage: C2Breakdown[];
  byCategory: C2Breakdown[];
  questions: C2QuestionResult[];
} {
  const sectionToChapter = chapterNumbers(build.document);
  const results = questions.map((question) =>
    evaluateQuestion(question, split, build, retriever, topK, sectionToChapter),
  );

  return {
    metrics: metricsFor(questions, results),
    byLanguage: breakdowns('language', questions, results),
    byCategory: breakdowns('category', questions, results),
    questions: results,
  };
}

function factGroupIntegrity(
  splits: Record<C2Split, C1Question[]>,
): boolean {
  const seen = new Map<string, C2Split>();

  for (const split of ['dev', 'calibration', 'test'] as C2Split[]) {
    for (const question of splits[split]) {
      const existing = seen.get(question.group);

      if (existing && existing !== split) return false;
      seen.set(question.group, split);
    }
  }

  return true;
}

export function serializeC2Report(report: C2Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function evaluatePhaseC2(input: {
  build: UnframedBuild;
  questions: C1Question[];
  topK: number;
  improvedConfig?: C1ModelConfig;
  determinism?: DeterminismChecks;
  expectedSourceSha256?: string;
}): C2Report {
  const improvedConfig = input.improvedConfig ?? DEFAULT_IMPROVED_CONFIG;
  const determinism = input.determinism ?? {
    stableManifest: true,
    stableChunkIds: true,
    uniqueChunkIds: true,
  };
  const split = splitC2Questions(input.questions);
  const baselineStarted = performance.now();
  const baselineRetriever = createBaselineRetriever(input.build);
  const baselineBuildMs = performance.now() - baselineStarted;
  const improvedStarted = performance.now();
  const improvedRetriever = createImprovedRetriever(input.build, improvedConfig);
  const improvedBuildMs = performance.now() - improvedStarted;

  const splits: Record<C2Split, C1Question[]> = {
    dev: split.dev,
    calibration: split.calibration,
    test: split.test,
  };
  const strategyA: C2StrategyReport = {
    strategy: 'A',
    name: 'Original Phase C BM25 baseline',
    status: 'measured',
    config: { k1: 1.2, b: 0.75, minScore: 0 },
    indexBuildMs: baselineBuildMs,
    bySplit: {
      dev: evaluateSplit('dev', splits.dev, input.build, baselineRetriever, input.topK),
      calibration: evaluateSplit(
        'calibration',
        splits.calibration,
        input.build,
        baselineRetriever,
        input.topK,
      ),
      test: evaluateSplit('test', splits.test, input.build, baselineRetriever, input.topK),
    },
  };
  const strategyB: C2StrategyReport = {
    strategy: 'B',
    name: 'Phase C.1 field-weighted BM25',
    status: 'measured',
    config: improvedConfig,
    indexBuildMs: improvedBuildMs,
    bySplit: {
      dev: evaluateSplit('dev', splits.dev, input.build, improvedRetriever, input.topK),
      calibration: evaluateSplit(
        'calibration',
        splits.calibration,
        input.build,
        improvedRetriever,
        input.topK,
      ),
      test: evaluateSplit('test', splits.test, input.build, improvedRetriever, input.topK),
    },
  };
  const calibrationResults = strategyB.bySplit?.calibration?.questions ?? [];
  const testResults = strategyB.bySplit?.test?.questions ?? [];
  const calibrated = selectCalibrationThreshold(
    splits.calibration,
    calibrationResults,
  );
  const calibratedTestResults = testResults.map((result) => {
    const question = splits.test.find((item) => item.id === result.id);

    return question
      ? applyThreshold(question, result, calibrated.threshold)
      : result;
  });
  const abstentionPolicy: C2AbstentionPolicy = {
    strategy: 'B',
    selection: 'calibration-only',
    threshold: calibrated.threshold,
    objective:
      'Maximise calibration correct-abstention rate subject to no more than 0.02 loss in calibration Recall@5 or Precision@5 versus B at threshold 3.',
    calibration: calibrated.calibration,
    test: metricsFor(splits.test, calibratedTestResults),
  };
  const semanticAvailability = detectSemanticAvailability();
  const semanticBlocker = semanticAvailability.blocker ?? 'semantic retrieval unavailable';
  const strategyC: C2StrategyReport = {
    strategy: 'C',
    name: 'Local semantic retrieval',
    status: 'blocked',
    blocker: semanticBlocker,
  };
  const strategyD: C2StrategyReport = {
    strategy: 'D',
    name: 'Hybrid lexical + semantic retrieval',
    status: 'blocked',
    blocker:
      `${semanticBlocker}; hybrid RRF design is documented and unit-tested, but no measured results are claimed`,
  };

  const allReports = [strategyA, strategyB];
  const invalidGroundTruthCount = allReports.reduce(
    (total, strategyReport) =>
      total +
      Object.values(strategyReport.bySplit ?? {}).reduce(
        (inner, splitReport) =>
          inner + (splitReport?.metrics.invalidGroundTruthCount ?? 0),
        0,
      ),
    0,
  );
  const diagnostics = buildChunkDiagnostics(input.build, determinism);
  const checks = {
    sourceHashValid:
      input.build.manifest.sourceSha256 ===
      (input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256),
    questionSetValid: invalidGroundTruthCount === 0,
    deterministicManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
    factGroupIntegrity: factGroupIntegrity(splits),
    noPassageTextInReport: true,
  };

  const report: C2Report = {
    mode: 'local-evaluation',
    phase: 'C2',
    status: 'ok',
    sourcePath: input.build.manifest.sourcePath,
    sourceSha256: input.build.manifest.sourceSha256,
    parserVersion: input.build.manifest.parserVersion,
    chunkerVersion: input.build.manifest.chunkerVersion,
    evaluatorVersion: C2_EVALUATOR_VERSION,
    manifestHash: input.build.manifest.manifestHash,
    questionSetHash: hashC2QuestionSet(input.questions),
    topK: input.topK,
    split: split.summary,
    strategies: [strategyA, strategyB, strategyC, strategyD],
    abstentionPolicy,
    semanticAvailability,
    diagnostics,
    determinism,
    checks,
    allChecksPassed: false,
  };

  const serializedBeforeTextCheck = serializeC2Report(report);
  checks.noPassageTextInReport = !input.build.chunks.some(
    (chunk) => chunk.text.length >= 80 && serializedBeforeTextCheck.includes(chunk.text),
  );

  const allChecksPassed = Object.values(checks).every(Boolean);
  report.status = allChecksPassed ? 'ok' : 'failed';
  report.allChecksPassed = allChecksPassed;

  return report;
}

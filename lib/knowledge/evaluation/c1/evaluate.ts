import { UNFRAMED_EXPECTED_SHA256 } from '../../unframed';
import type { UnframedBuild } from '../../types';
import { buildChunkDiagnostics } from '../diagnostics';
import type { DeterminismChecks, EvaluationCategory } from '../types';

import {
  createBaselineRetriever,
  createImprovedRetriever,
  DEFAULT_IMPROVED_CONFIG,
} from './retrieval';
import { hashC1QuestionSet } from './questions';
import { splitC1Questions } from './split';
import type {
  C1Answerability,
  C1Breakdown,
  C1ModelConfig,
  C1ModelMetrics,
  C1ModelSplitReport,
  C1Question,
  C1QuestionResult,
  C1Report,
  C1Retrieval,
  C1Split,
} from './types';

export const C1_EVALUATOR_VERSION = 'unframed-eval-c1-v1';

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
  question: C1Question,
  split: C1Split,
  build: UnframedBuild,
  retriever: Retriever,
  topK: number,
  sectionToChapter: Map<number, number>,
): C1QuestionResult {
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
    recallAt5: relevantHits.length > 0 ? 1 : 0,
    precisionAt5: relevantHits.length / topK,
    falsePositive: null,
    falseNegative: relevantHits.length === 0,
    correctAbstention: null,
    latencyMs: retrieval.latencyMs,
  };
}

function metricsFor(
  questions: C1Question[],
  results: C1QuestionResult[],
): C1ModelMetrics {
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
    recallAt5: mean(answerable.map((result) => result.recallAt5 ?? 0)),
    precisionAt5: mean(answerable.map((result) => result.precisionAt5 ?? 0)),
    mrr: mean(
      answerable.map((result) =>
        result.firstRelevantRank ? 1 / result.firstRelevantRank : 0,
      ),
    ),
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

function breakdowns(
  key: 'language' | 'category',
  questions: C1Question[],
  results: C1QuestionResult[],
): C1Breakdown[] {
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

function evaluateSplit(input: {
  model: 'baseline' | 'improved';
  split: C1Split;
  questions: C1Question[];
  build: UnframedBuild;
  retriever: Retriever;
  topK: number;
  config?: C1ModelConfig;
}): C1ModelSplitReport {
  const sectionToChapter = chapterNumbers(input.build.document);
  const questions = input.questions.map((question) =>
    evaluateQuestion(
      question,
      input.split,
      input.build,
      input.retriever,
      input.topK,
      sectionToChapter,
    ),
  );

  return {
    model: input.model,
    split: input.split,
    config: input.config,
    metrics: metricsFor(input.questions, questions),
    byLanguage: breakdowns('language', input.questions, questions),
    byCategory: breakdowns('category', input.questions, questions),
    questions,
  };
}

export function serializeC1Report(report: C1Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function evaluatePhaseC1(input: {
  build: UnframedBuild;
  questions: C1Question[];
  topK: number;
  improvedConfig?: C1ModelConfig;
  determinism?: DeterminismChecks;
  expectedSourceSha256?: string;
}): C1Report {
  const improvedConfig = input.improvedConfig ?? DEFAULT_IMPROVED_CONFIG;
  const determinism = input.determinism ?? {
    stableManifest: true,
    stableChunkIds: true,
    uniqueChunkIds: true,
  };
  const split = splitC1Questions(input.questions);
  const baselineRetriever = createBaselineRetriever(input.build);
  const improvedRetriever = createImprovedRetriever(input.build, improvedConfig);
  const baselineConfig = { k1: 1.2, b: 0.75, minScore: 0 };

  const devBaseline = evaluateSplit({
    model: 'baseline',
    split: 'dev',
    questions: split.dev,
    build: input.build,
    retriever: baselineRetriever,
    topK: input.topK,
  });
  const devImproved = evaluateSplit({
    model: 'improved',
    split: 'dev',
    questions: split.dev,
    build: input.build,
    retriever: improvedRetriever,
    topK: input.topK,
    config: improvedConfig,
  });
  const testBaseline = evaluateSplit({
    model: 'baseline',
    split: 'test',
    questions: split.test,
    build: input.build,
    retriever: baselineRetriever,
    topK: input.topK,
  });
  const testImproved = evaluateSplit({
    model: 'improved',
    split: 'test',
    questions: split.test,
    build: input.build,
    retriever: improvedRetriever,
    topK: input.topK,
    config: improvedConfig,
  });

  const invalidGroundTruthCount =
    devBaseline.metrics.invalidGroundTruthCount +
    devImproved.metrics.invalidGroundTruthCount +
    testBaseline.metrics.invalidGroundTruthCount +
    testImproved.metrics.invalidGroundTruthCount;
  const diagnostics = buildChunkDiagnostics(input.build, determinism);
  const checks = {
    sourceHashValid:
      input.build.manifest.sourceSha256 ===
      (input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256),
    questionSetValid: invalidGroundTruthCount === 0,
    deterministicManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
    noPassageTextInReport: true,
  };

  const report: C1Report = {
    mode: 'local-evaluation',
    phase: 'C1',
    status: 'ok',
    sourcePath: input.build.manifest.sourcePath,
    sourceSha256: input.build.manifest.sourceSha256,
    parserVersion: input.build.manifest.parserVersion,
    chunkerVersion: input.build.manifest.chunkerVersion,
    evaluatorVersion: C1_EVALUATOR_VERSION,
    manifestHash: input.build.manifest.manifestHash,
    questionSetHash: hashC1QuestionSet(input.questions),
    topK: input.topK,
    baselineConfig,
    improvedConfig,
    split: split.summary,
    dev: { baseline: devBaseline, improved: devImproved },
    test: { baseline: testBaseline, improved: testImproved },
    diagnostics,
    determinism,
    checks,
    allChecksPassed: false,
  };

  const serializedBeforeTextCheck = serializeC1Report(report);
  checks.noPassageTextInReport = !input.build.chunks.some(
    (chunk) => chunk.text.length >= 80 && serializedBeforeTextCheck.includes(chunk.text),
  );

  const allChecksPassed = Object.values(checks).every(Boolean);
  report.status = allChecksPassed ? 'ok' : 'failed';
  report.allChecksPassed = allChecksPassed;

  return report;
}

export function categoryKeys(): EvaluationCategory[] {
  return [
    'direct_factual',
    'structure',
    'specific_passage',
    'paraphrased',
    'ambiguous',
    'absent',
    'misleading',
    'prompt_injection',
  ];
}

export function answerabilityKeys(): C1Answerability[] {
  return ['answerable', 'unanswerable', 'unverified'];
}

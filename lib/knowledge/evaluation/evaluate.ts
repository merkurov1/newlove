import { UNFRAMED_EXPECTED_SHA256 } from '../unframed';
import type { UnframedBuild } from '../types';

import {
  buildBm25Index,
  DEFAULT_TOP_K,
  normalizeTopK,
  searchBm25,
} from './bm25';
import { buildChunkDiagnostics } from './diagnostics';
import { hashEvaluationQuestionSet } from './questions';
import type {
  AggregateMetrics,
  CategoryMetrics,
  DeterminismChecks,
  EvaluationCategory,
  EvaluationChecks,
  EvaluationQuestion,
  EvaluationReport,
  QuestionEvaluation,
} from './types';

export const EVALUATOR_VERSION = 'unframed-eval-v1';

const CATEGORY_ORDER: EvaluationCategory[] = [
  'direct_factual',
  'structure',
  'specific_passage',
  'paraphrased',
  'ambiguous',
  'absent',
  'misleading',
  'prompt_injection',
];

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
  question: EvaluationQuestion,
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
  question: EvaluationQuestion,
  build: UnframedBuild,
  index: ReturnType<typeof buildBm25Index>,
  topK: number,
  sectionToChapter: Map<number, number>,
): QuestionEvaluation {
  const retrieval = searchBm25(index, question.question, topK);
  const top = retrieval.hits.map((hit, index) => ({
    rank: index + 1,
    chunkId: hit.chunkId,
    sectionIndex: hit.sectionIndex,
    sectionId: `section:${hit.sectionIndex}`,
    chapterNumber: sectionToChapter.get(hit.sectionIndex) ?? null,
    score: hit.score,
  }));

  const groundTruthValid = validateGroundTruth(question, build);
  const scored = question.answerability !== 'unverified' && groundTruthValid;

  if (!scored) {
    return {
      id: question.id,
      category: question.category,
      answerability: question.answerability,
      groundTruthValid,
      scored: false,
      excludedReason:
        question.answerability === 'unverified'
          ? 'unverified'
          : 'invalid_ground_truth',
      retrievalStatus: retrieval.status,
      top,
      relevantHit: null,
      firstRelevantRank: null,
      recallAtK: null,
      precisionAtK: null,
      falsePositive: null,
      latencyMs: retrieval.latencyMs,
    };
  }

  if (question.answerability === 'unanswerable') {
    return {
      id: question.id,
      category: question.category,
      answerability: question.answerability,
      groundTruthValid: true,
      scored: true,
      excludedReason: null,
      retrievalStatus: retrieval.status,
      top,
      relevantHit: null,
      firstRelevantRank: null,
      recallAtK: null,
      precisionAtK: null,
      falsePositive: retrieval.status === 'results',
      latencyMs: retrieval.latencyMs,
    };
  }

  const relevantChunks = new Set(question.relevantChunkIds ?? []);
  const relevantSections = new Set(question.relevantSectionIndexes ?? []);
  const isRelevant = (hit: (typeof retrieval.hits)[number]): boolean =>
    relevantChunks.has(hit.chunkId) || relevantSections.has(hit.sectionIndex);

  const relevantTop = retrieval.hits.filter(isRelevant);
  const firstRelevant = retrieval.hits.findIndex(isRelevant);
  const firstRelevantRank = firstRelevant >= 0 ? firstRelevant + 1 : null;

  return {
    id: question.id,
    category: question.category,
    answerability: question.answerability,
    groundTruthValid: true,
    scored: true,
    excludedReason: null,
    retrievalStatus: retrieval.status,
    top,
    relevantHit: relevantTop.length > 0,
    firstRelevantRank,
    recallAtK: relevantTop.length > 0 ? 1 : 0,
    precisionAtK: relevantTop.length / topK,
    falsePositive: null,
    latencyMs: retrieval.latencyMs,
  };
}

function aggregateMetrics(
  questions: EvaluationQuestion[],
  results: QuestionEvaluation[],
): AggregateMetrics {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable',
  );
  const invalidGroundTruth = results.filter(
    (result) =>
      result.answerability !== 'unverified' && !result.groundTruthValid,
  );
  const unverified = questions.filter(
    (question) => question.answerability === 'unverified',
  );
  const latencies = results.map((result) => result.latencyMs);

  return {
    questionCount: questions.length,
    verifiedCount: questions.filter(
      (question) => question.answerability !== 'unverified',
    ).length,
    unverifiedCount: unverified.length,
    answerableVerifiedCount: answerable.length,
    unanswerableVerifiedCount: unanswerable.length,
    invalidGroundTruthCount: invalidGroundTruth.length,
    recallAtK: mean(
      answerable.map((result) => result.recallAtK ?? 0),
    ),
    precisionAtK: mean(
      answerable.map((result) => result.precisionAtK ?? 0),
    ),
    mrr: mean(
      answerable.map((result) =>
        result.firstRelevantRank ? 1 / result.firstRelevantRank : 0,
      ),
    ),
    retrievalSuccessRate: mean(
      answerable.map((result) =>
        result.retrievalStatus === 'results' ? 1 : 0,
      ),
    ),
    falsePositiveRate: mean(
      unanswerable.map((result) => (result.falsePositive ? 1 : 0)),
    ),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

function categoryMetrics(
  category: EvaluationCategory,
  questions: EvaluationQuestion[],
  results: QuestionEvaluation[],
): CategoryMetrics {
  const inCategory = questions.filter((question) => question.category === category);
  const categoryResults = results.filter((result) => result.category === category);
  const answerable = categoryResults.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const unanswerable = categoryResults.filter(
    (result) => result.scored && result.answerability === 'unanswerable',
  );

  return {
    category,
    questionCount: inCategory.length,
    verifiedCount: inCategory.filter(
      (question) => question.answerability !== 'unverified',
    ).length,
    unverifiedCount: inCategory.filter(
      (question) => question.answerability === 'unverified',
    ).length,
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    recallAtK: mean(answerable.map((result) => result.recallAtK ?? 0)),
    precisionAtK: mean(answerable.map((result) => result.precisionAtK ?? 0)),
    mrr: mean(
      answerable.map((result) =>
        result.firstRelevantRank ? 1 / result.firstRelevantRank : 0,
      ),
    ),
    retrievalSuccessRate: mean(
      answerable.map((result) =>
        result.retrievalStatus === 'results' ? 1 : 0,
      ),
    ),
    falsePositiveRate: mean(
      unanswerable.map((result) => (result.falsePositive ? 1 : 0)),
    ),
  };
}

export function serializeEvaluationReport(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function evaluateQuestions(input: {
  build: UnframedBuild;
  questions: EvaluationQuestion[];
  topK?: number;
  determinism?: DeterminismChecks;
  expectedSourceSha256?: string;
}): EvaluationReport {
  const topK = normalizeTopK(input.topK ?? DEFAULT_TOP_K);
  const determinism = input.determinism ?? {
    stableManifest: true,
    stableChunkIds: true,
    uniqueChunkIds: true,
  };
  const index = buildBm25Index(input.build.chunks);
  const sectionToChapter = chapterNumbers(input.build.document);
  const results = input.questions.map((question) =>
    evaluateQuestion(question, input.build, index, topK, sectionToChapter),
  );
  const metrics = aggregateMetrics(input.questions, results);
  const byCategory = CATEGORY_ORDER.map((category) =>
    categoryMetrics(category, input.questions, results),
  );
  const diagnostics = buildChunkDiagnostics(input.build, determinism);

  const checks: EvaluationChecks = {
    sourceHashValid:
      input.build.manifest.sourceSha256 ===
      (input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256),
    groundTruthReferencesValid: metrics.invalidGroundTruthCount === 0,
    sectionBoundariesIntact: diagnostics.chunksCrossingSectionBoundaryCount === 0,
    offsetsValid: diagnostics.invalidOffsetCount === 0,
    deterministicManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
    noPassageTextInReport: true,
  };

  const report: EvaluationReport = {
    mode: 'local-evaluation',
    status: 'ok',
    sourcePath: input.build.manifest.sourcePath,
    sourceSha256: input.build.manifest.sourceSha256,
    parserVersion: input.build.manifest.parserVersion,
    chunkerVersion: input.build.manifest.chunkerVersion,
    evaluatorVersion: EVALUATOR_VERSION,
    manifestHash: input.build.manifest.manifestHash,
    questionSetHash: hashEvaluationQuestionSet(input.questions),
    topK,
    metrics,
    byCategory,
    questions: results,
    diagnostics,
    checks,
    allChecksPassed: false,
  };

  const serializedBeforeTextCheck = serializeEvaluationReport(report);
  checks.noPassageTextInReport = !input.build.chunks.some(
    (chunk) => chunk.text.length >= 80 && serializedBeforeTextCheck.includes(chunk.text),
  );

  const allChecksPassed = Object.values(checks).every(Boolean);
  report.status = allChecksPassed ? 'ok' : 'failed';
  report.allChecksPassed = allChecksPassed;

  return report;
}

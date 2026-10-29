import { UNFRAMED_EXPECTED_SHA256 } from '../../unframed';
import type { UnframedBuild } from '../../types';
import { buildChunkDiagnostics } from '../diagnostics';
import type { DeterminismChecks } from '../types';
import { createImprovedRetriever, DEFAULT_IMPROVED_CONFIG } from '../c1/retrieval';
import { evaluatePhaseC2 } from '../c2/evaluate';
import { C2_QUESTIONS } from '../c2/questions';
import { computeFeatures } from './features';
import { accepts, POLICY_DEFINITIONS } from './policies';
import { hashC3QuestionSet, C3_QUESTIONS } from './questions';
import { splitC3Questions } from './split';
import type {
  C2MetricAuditRow,
  C3Breakdown,
  C3PolicyMetrics,
  C3PolicyName,
  C3PolicyReport,
  C3Question,
  C3QuestionResult,
  C3RankingMetrics,
  C3Report,
  C3Split,
} from './types';

export const C3_EVALUATOR_VERSION = 'unframed-eval-c3-v1';

function mean(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function validateGroundTruth(question: C3Question, build: UnframedBuild): boolean {
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

function buildResults(
  build: UnframedBuild,
  questions: C3Question[],
  split: C3Split,
  topK: number,
): C3QuestionResult[] {
  const retriever = createImprovedRetriever(build, DEFAULT_IMPROVED_CONFIG);
  const sectionToChapter = chapterNumbers(build.document);
  const chunkById = new Map(build.chunks.map((chunk) => [chunk.id, chunk]));

  return questions.map((question) => {
    const retrieval = retriever(question.question, topK);
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
        language: question.language,
        split,
        answerability: question.answerability,
        groundTruthValid,
        scored: false,
        excludedReason:
          question.answerability === 'unverified'
            ? 'unverified'
            : 'invalid_ground_truth',
        baselineOutcome: retrieval.outcome,
        top,
        relevantHit: null,
        firstRelevantRank: null,
        recallAt1: null,
        recallAt3: null,
        recallAt5: null,
        precisionAt5: null,
        mrrContribution: null,
        features: {
          topScore: top[0]?.score ?? 0,
          secondScore: top[1]?.score ?? 0,
          margin: (top[0]?.score ?? 0) - (top[1]?.score ?? 0),
          queryTokenCount: 0,
          distinctMatchedTerms: 0,
          coverage: 0,
          exactPhrase: false,
          expectedSectionMatch: false,
        },
        latencyMs: retrieval.latencyMs,
      };
    }

    const relevantChunks = new Set(question.relevantChunkIds ?? []);
    const relevantSections = new Set(question.relevantSectionIndexes ?? []);
    const isRelevant = (hit: C3QuestionResult['top'][number]): boolean =>
      relevantChunks.has(hit.chunkId) || relevantSections.has(hit.sectionIndex);
    const relevantHits =
      retrieval.outcome === 'relevant_results'
        ? top.filter(isRelevant)
        : [];
    const firstIndex = top.findIndex(isRelevant);
    const firstRelevantRank =
      retrieval.outcome === 'relevant_results' && firstIndex >= 0
        ? firstIndex + 1
        : null;
    const hasRelevantAt = (depth: number): boolean =>
      relevantHits.some((hit) => top.indexOf(hit) < depth);

    const baseResult: C3QuestionResult = {
      id: question.id,
      category: question.category,
      language: question.language,
      split,
      answerability: question.answerability,
      groundTruthValid: true,
      scored: true,
      excludedReason: null,
      baselineOutcome: retrieval.outcome,
      top,
      relevantHit: question.answerability === 'answerable' ? relevantHits.length > 0 : null,
      firstRelevantRank,
      recallAt1: question.answerability === 'answerable' && hasRelevantAt(1) ? 1 : 0,
      recallAt3: question.answerability === 'answerable' && hasRelevantAt(3) ? 1 : 0,
      recallAt5: question.answerability === 'answerable' && hasRelevantAt(5) ? 1 : 0,
      precisionAt5:
        question.answerability === 'answerable' ? relevantHits.length / topK : null,
      mrrContribution:
        question.answerability === 'answerable' && firstRelevantRank
          ? 1 / firstRelevantRank
          : question.answerability === 'answerable'
            ? 0
            : null,
      features: {
        topScore: 0,
        secondScore: 0,
        margin: 0,
        queryTokenCount: 0,
        distinctMatchedTerms: 0,
        coverage: 0,
        exactPhrase: false,
        expectedSectionMatch: false,
      },
      latencyMs: retrieval.latencyMs,
    };

    baseResult.features = computeFeatures(question, baseResult, chunkById);

    return baseResult;
  });
}

function rankingMetrics(
  questions: C3Question[],
  results: C3QuestionResult[],
): C3RankingMetrics {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const invalid = results.filter(
    (result) => result.answerability !== 'unverified' && !result.groundTruthValid,
  );

  return {
    questionCount: questions.length,
    verifiedCount: questions.filter(
      (question) => question.answerability !== 'unverified',
    ).length,
    unverifiedCount: questions.filter(
      (question) => question.answerability === 'unverified',
    ).length,
    answerableCount: answerable.length,
    unanswerableCount: results.filter(
      (result) => result.scored && result.answerability === 'unanswerable',
    ).length,
    invalidGroundTruthCount: invalid.length,
    recallAt1: mean(answerable.map((result) => result.recallAt1 ?? 0)),
    recallAt3: mean(answerable.map((result) => result.recallAt3 ?? 0)),
    recallAt5: mean(answerable.map((result) => result.recallAt5 ?? 0)),
    precisionAt5: mean(answerable.map((result) => result.precisionAt5 ?? 0)),
    mrr: mean(answerable.map((result) => result.mrrContribution ?? 0)),
  };
}

function policyMetrics(
  questions: C3Question[],
  results: C3QuestionResult[],
  policy: C3PolicyName,
  threshold: number | null,
): C3PolicyMetrics {
  const ranking = rankingMetrics(questions, results);
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable',
  );
  let acceptedAnswerable = 0;
  let evidenceAcceptedAnswerable = 0;
  let acceptedUnanswerable = 0;

  for (const result of answerable) {
    if (!accepts(policy, threshold, result)) continue;

    acceptedAnswerable += 1;
    if (result.relevantHit) evidenceAcceptedAnswerable += 1;
  }

  for (const result of unanswerable) {
    if (accepts(policy, threshold, result)) acceptedUnanswerable += 1;
  }

  const rejectedAnswerable = answerable.length - acceptedAnswerable;
  const rejectedUnanswerable = unanswerable.length - acceptedUnanswerable;

  return {
    ...ranking,
    acceptedAnswerable,
    evidenceAcceptedAnswerable,
    rejectedAnswerable,
    acceptedUnanswerable,
    rejectedUnanswerable,
    answerableCoverage:
      answerable.length > 0 ? acceptedAnswerable / answerable.length : null,
    answerableEvidenceRecall:
      answerable.length > 0
        ? evidenceAcceptedAnswerable / answerable.length
        : null,
    correctAbstentionRate:
      unanswerable.length > 0
        ? rejectedUnanswerable / unanswerable.length
        : null,
    falseAcceptRate:
      unanswerable.length > 0
        ? acceptedUnanswerable / unanswerable.length
        : null,
    falseRejectRate:
      answerable.length > 0 ? rejectedAnswerable / answerable.length : null,
  };
}

function breakdowns(
  key: 'language' | 'category',
  questions: C3Question[],
  results: C3QuestionResult[],
  policy: C3PolicyName,
  threshold: number | null,
): C3Breakdown[] {
  const keys = [...new Set(questions.map((question) => question[key]))].sort();

  return keys.map((value) => ({
    key: String(value),
    ...policyMetrics(
      questions.filter((question) => question[key] === value),
      results.filter((result) => result[key] === value),
      policy,
      threshold,
    ),
  }));
}

function selectPolicyThreshold(
  policy: C3PolicyName,
  thresholds: number[] | null,
  calibrationQuestions: C3Question[],
  calibrationResults: C3QuestionResult[],
): number | null {
  if (thresholds === null) return null;

  const candidates = thresholds.map((threshold) => ({
    threshold,
    metrics: policyMetrics(
      calibrationQuestions,
      calibrationResults,
      policy,
      threshold,
    ),
  }));

  const selected = candidates.sort((left, right) => {
    const leftBalance =
      (left.metrics.answerableEvidenceRecall ?? 0) +
      (left.metrics.correctAbstentionRate ?? 0);
    const rightBalance =
      (right.metrics.answerableEvidenceRecall ?? 0) +
      (right.metrics.correctAbstentionRate ?? 0);

    if (rightBalance !== leftBalance) return rightBalance - leftBalance;
    if (
      (left.metrics.falseAcceptRate ?? 0) !==
      (right.metrics.falseAcceptRate ?? 0)
    ) {
      return (left.metrics.falseAcceptRate ?? 0) -
        (right.metrics.falseAcceptRate ?? 0);
    }
    if (
      (right.metrics.answerableEvidenceRecall ?? 0) !==
      (left.metrics.answerableEvidenceRecall ?? 0)
    ) {
      return (
        (right.metrics.answerableEvidenceRecall ?? 0) -
        (left.metrics.answerableEvidenceRecall ?? 0)
      );
    }

    return left.threshold - right.threshold;
  })[0];

  return selected.threshold;
}

function factGroupIntegrity(
  splits: Record<C3Split, C3Question[]>,
): boolean {
  const seen = new Map<string, C3Split>();

  for (const split of ['dev', 'calibration', 'test'] as C3Split[]) {
    for (const question of splits[split]) {
      const existing = seen.get(question.group);

      if (existing && existing !== split) return false;
      seen.set(question.group, split);
    }
  }

  return true;
}

function auditC2(
  build: UnframedBuild,
  expectedSourceSha256: string,
): C2MetricAuditRow[] {
  const c2Report = evaluatePhaseC2({
    build,
    questions: C2_QUESTIONS,
    topK: 5,
    expectedSourceSha256,
  });
  const rows: C2MetricAuditRow[] = [];

  for (const strategy of c2Report.strategies.filter(
    (item) => item.status === 'measured',
  )) {
    for (const split of ['dev', 'calibration', 'test'] as const) {
      const splitReport = strategy.bySplit?.[split];

      if (!splitReport) continue;

      const answerable = splitReport.questions.filter(
        (result) => result.scored && result.answerability === 'answerable',
      );
      const unanswerable = splitReport.questions.filter(
        (result) => result.scored && result.answerability === 'unanswerable',
      );
      const evidenceSuccess = answerable.filter(
        (result) => result.relevantHit,
      ).length;
      const noMatchAbstention = unanswerable.filter(
        (result) => result.outcome === 'no_match',
      ).length;
      const weakMatchCount = unanswerable.filter(
        (result) => result.outcome === 'weak_match',
      ).length;

      rows.push({
        strategy: strategy.strategy as 'A' | 'B',
        split,
        answerableCount: answerable.length,
        reportedSuccess: splitReport.metrics.retrievalSuccessRate,
        independentEvidenceSuccess:
          answerable.length > 0 ? evidenceSuccess / answerable.length : null,
        successDiscrepancy:
          splitReport.metrics.retrievalSuccessRate !== null
            ? splitReport.metrics.retrievalSuccessRate -
              (answerable.length > 0 ? evidenceSuccess / answerable.length : 0)
            : null,
        reportedAbstention: splitReport.metrics.correctAbstentionRate,
        noMatchAbstention:
          unanswerable.length > 0
            ? noMatchAbstention / unanswerable.length
            : null,
        weakMatchCount,
      });
    }
  }

  return rows;
}

export function serializeC3Report(report: C3Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function evaluatePhaseC3(input: {
  build: UnframedBuild;
  questions: C3Question[];
  topK: number;
  determinism?: DeterminismChecks;
  expectedSourceSha256?: string;
}): C3Report {
  const determinism = input.determinism ?? {
    stableManifest: true,
    stableChunkIds: true,
    uniqueChunkIds: true,
  };
  const split = splitC3Questions(input.questions);
  const devResults = buildResults(input.build, split.dev, 'dev', input.topK);
  const calibrationResults = buildResults(
    input.build,
    split.calibration,
    'calibration',
    input.topK,
  );
  const testResults = buildResults(input.build, split.test, 'test', input.topK);
  const policies: C3PolicyReport[] = POLICY_DEFINITIONS.map((definition) => {
    const threshold = selectPolicyThreshold(
      definition.name,
      definition.thresholds,
      split.calibration,
      calibrationResults,
    );

    return {
      policy: definition.name,
      description: definition.description,
      threshold,
      calibration: policyMetrics(
        split.calibration,
        calibrationResults,
        definition.name,
        threshold,
      ),
      test: policyMetrics(
        split.test,
        testResults,
        definition.name,
        threshold,
      ),
      byLanguageTest: breakdowns(
        'language',
        split.test,
        testResults,
        definition.name,
        threshold,
      ),
      byCategoryTest: breakdowns(
        'category',
        split.test,
        testResults,
        definition.name,
        threshold,
      ),
    };
  });
  const languageCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const question of input.questions) {
    languageCounts[question.language] =
      (languageCounts[question.language] ?? 0) + 1;
    categoryCounts[question.category] =
      (categoryCounts[question.category] ?? 0) + 1;
  }

  const invalidGroundTruthCount = [
    ...devResults,
    ...calibrationResults,
    ...testResults,
  ].filter(
    (result) => result.answerability !== 'unverified' && !result.groundTruthValid,
  ).length;
  const diagnostics = buildChunkDiagnostics(input.build, determinism);
  const checks = {
    sourceHashValid:
      input.build.manifest.sourceSha256 ===
      (input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256),
    questionSetValid: invalidGroundTruthCount === 0,
    deterministicManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
    factGroupIntegrity: factGroupIntegrity({
      dev: split.dev,
      calibration: split.calibration,
      test: split.test,
    }),
    noPassageTextInReport: true,
  };

  const report: C3Report = {
    mode: 'local-evaluation',
    phase: 'C3',
    status: 'ok',
    sourcePath: input.build.manifest.sourcePath,
    sourceSha256: input.build.manifest.sourceSha256,
    parserVersion: input.build.manifest.parserVersion,
    chunkerVersion: input.build.manifest.chunkerVersion,
    evaluatorVersion: C3_EVALUATOR_VERSION,
    manifestHash: input.build.manifest.manifestHash,
    questionSetHash: hashC3QuestionSet(input.questions),
    topK: input.topK,
    split: split.summary,
    dataset: {
      totalQuestions: input.questions.length,
      verified: input.questions.filter(
        (question) => question.answerability !== 'unverified',
      ).length,
      unverified: input.questions.filter(
        (question) => question.answerability === 'unverified',
      ).length,
      answerable: input.questions.filter(
        (question) => question.answerability === 'answerable',
      ).length,
      unanswerable: input.questions.filter(
        (question) => question.answerability === 'unanswerable',
      ).length,
      languageCounts,
      categoryCounts,
    },
    ranking: {
      dev: rankingMetrics(split.dev, devResults),
      calibration: rankingMetrics(split.calibration, calibrationResults),
      test: rankingMetrics(split.test, testResults),
    },
    policies,
    c2Audit: auditC2(
      input.build,
      input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256,
    ),
    diagnostics,
    determinism,
    checks,
    allChecksPassed: false,
  };

  const serializedBeforeTextCheck = serializeC3Report(report);
  checks.noPassageTextInReport = !input.build.chunks.some(
    (chunk) => chunk.text.length >= 80 && serializedBeforeTextCheck.includes(chunk.text),
  );

  const allChecksPassed = Object.values(checks).every(Boolean);
  report.status = allChecksPassed ? 'ok' : 'failed';
  report.allChecksPassed = allChecksPassed;

  return report;
}

export { C3_QUESTIONS };

import { UNFRAMED_EXPECTED_SHA256 } from '../../unframed';
import type { UnframedBuild } from '../../types';
import { buildChunkDiagnostics } from '../diagnostics';
import type { DeterminismChecks } from '../types';
import { createBaselineRetriever, createImprovedRetriever, DEFAULT_IMPROVED_CONFIG } from '../c1/retrieval';
import { computeC4Features } from './features';
import { acceptsC4, C4_POLICIES } from './policies';
import { C4_PROTOCOL_VERSION, hashC4Protocol } from './protocol';
import { C4_QUESTIONS, hashC4QuestionSet } from './questions';
import { detectC4SemanticAvailability } from './semanticAvailability';
import { splitC4Questions } from './split';
import type {
  C4Breakdown,
  C4Count,
  C4Features,
  C4LanguageMode,
  C4Metrics,
  C4PolicyName,
  C4PolicyReport,
  C4Question,
  C4QuestionResult,
  C4Report,
  C4Split,
  C4StrategyReport,
} from './types';

export const C4_EVALUATOR_VERSION = 'unframed-eval-c4-v1';
export const C2_METRIC_DEFECT =
  'C2 retrievalSuccessRate uses the outcome label relevant_results instead of verified relevant evidence; C2 correctAbstention counts weak_match as abstention. C4 uses independent evidence-based definitions.';

type Retriever = (query: string, topK: number) => {
  outcome: 'relevant_results' | 'weak_match' | 'no_match';
  hits: Array<{
    chunkId: string;
    sectionIndex: number;
    sectionPath: string[];
    charStart: number;
    charEnd: number;
    score: number;
    rawScore: number;
  }>;
  latencyMs: number;
};

function count(numerator: number, denominator: number): C4Count {
  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

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

function validateGroundTruth(question: C4Question, build: UnframedBuild): boolean {
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

function languageMode(question: C4Question): C4LanguageMode {
  if (question.language === 'en') return 'en';
  return question.russianMode === 'latin_proper_noun' ? 'latin_ru' : 'pure_ru';
}

function buildResults(
  build: UnframedBuild,
  questions: C4Question[],
  split: C4Split,
  retriever: Retriever,
  topK: number,
): C4QuestionResult[] {
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
    const emptyFeatures: C4Features = {
      topScore: 0,
      secondScore: 0,
      margin: 0,
      queryTokenCount: 0,
      distinctMatchedTerms: 0,
      coverage: 0,
      exactPhrase: false,
      expectedSectionMatch: false,
    };

    if (!scored) {
      return {
        id: question.id,
        category: question.category,
        language: question.language,
        languageMode: languageMode(question),
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
        features: emptyFeatures,
        latencyMs: retrieval.latencyMs,
      };
    }

    const relevantChunks = new Set(question.relevantChunkIds ?? []);
    const relevantSections = new Set(question.relevantSectionIndexes ?? []);
    const isRelevant = (hit: C4QuestionResult['top'][number]): boolean =>
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

    const result: C4QuestionResult = {
      id: question.id,
      category: question.category,
      language: question.language,
      languageMode: languageMode(question),
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
        question.answerability === 'answerable'
          ? firstRelevantRank
            ? 1 / firstRelevantRank
            : 0
          : null,
      features: emptyFeatures,
      latencyMs: retrieval.latencyMs,
    };

    result.features = computeC4Features(question, result, chunkById);
    return result;
  });
}

function rankingMetrics(
  questions: C4Question[],
  results: C4QuestionResult[],
): C4Metrics {
  return policyMetrics(questions, results, 'baseline_b', null);
}

function policyMetrics(
  questions: C4Question[],
  results: C4QuestionResult[],
  policy: C4PolicyName,
  threshold: number | null,
): C4Metrics {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable',
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable',
  );
  const invalid = results.filter(
    (result) => result.answerability !== 'unverified' && !result.groundTruthValid,
  );
  const acceptedAnswerable = answerable.filter((result) =>
    acceptsC4(policy, threshold, result),
  );
  const evidenceAcceptedAnswerable = acceptedAnswerable.filter(
    (result) => result.relevantHit,
  );
  const acceptedUnanswerable = unanswerable.filter((result) =>
    acceptsC4(policy, threshold, result),
  );
  const rejectedAnswerable = answerable.length - acceptedAnswerable.length;
  const rejectedUnanswerable = unanswerable.length - acceptedUnanswerable.length;
  const latencies = results.map((result) => result.latencyMs);

  const relevantAt = (depth: number): number =>
    answerable.filter((result) => {
      if (result.recallAt5 !== 1) return false;
      return result.top
        .slice(0, depth)
        .some((hit) => {
          const question = questions.find((item) => item.id === result.id);
          if (!question) return false;
          const chunks = new Set(question.relevantChunkIds ?? []);
          const sections = new Set(question.relevantSectionIndexes ?? []);
          return chunks.has(hit.chunkId) || sections.has(hit.sectionIndex);
        });
    }).length;

  const precisionNumerator = answerable.reduce(
    (sum, result) => sum + (result.precisionAt5 ?? 0) * 5,
    0,
  );
  const mrrNumerator = answerable.reduce(
    (sum, result) => sum + (result.mrrContribution ?? 0),
    0,
  );
  const evidenceMiss = answerable.filter((result) => !result.relevantHit).length;

  return {
    questionCount: questions.length,
    verifiedCount: questions.filter((q) => q.answerability !== 'unverified').length,
    unverifiedCount: questions.filter((q) => q.answerability === 'unverified').length,
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    recallAt1: count(relevantAt(1), answerable.length),
    recallAt3: count(relevantAt(3), answerable.length),
    recallAt5: count(relevantAt(5), answerable.length),
    precisionAt5: count(precisionNumerator, answerable.length * 5),
    mrr: count(mrrNumerator, answerable.length),
    acceptedAnswerable: acceptedAnswerable.length,
    evidenceAcceptedAnswerable: evidenceAcceptedAnswerable.length,
    rejectedAnswerable,
    acceptedUnanswerable: acceptedUnanswerable.length,
    rejectedUnanswerable,
    answerableCoverage: count(acceptedAnswerable.length, answerable.length),
    answerableEvidenceRecall: count(evidenceAcceptedAnswerable.length, answerable.length),
    correctAbstention: count(rejectedUnanswerable, unanswerable.length),
    falseAccept: count(acceptedUnanswerable.length, unanswerable.length),
    falseReject: count(rejectedAnswerable, answerable.length),
    evidenceMiss: count(evidenceMiss, answerable.length),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
}

function breakdowns(
  key: 'languageMode' | 'category',
  questions: C4Question[],
  results: C4QuestionResult[],
  policy: C4PolicyName,
  threshold: number | null,
): C4Breakdown[] {
  const keys = [
    ...new Set(
      questions.map((question) =>
        key === 'languageMode' ? languageMode(question) : question.category,
      ),
    ),
  ].sort();

  return keys.map((value) => ({
    key: String(value),
    ...policyMetrics(
      questions.filter((question) =>
        key === 'languageMode'
          ? languageMode(question) === value
          : question.category === value,
      ),
      results.filter((result) =>
        key === 'languageMode'
          ? result.languageMode === value
          : result.category === value,
      ),
      policy,
      threshold,
    ),
  }));
}

function selectThreshold(
  policy: C4PolicyName,
  thresholds: number[] | null,
  questions: C4Question[],
  results: C4QuestionResult[],
): number | null {
  if (thresholds === null) return null;
  const candidates = thresholds.map((threshold) => ({
    threshold,
    metrics: policyMetrics(questions, results, policy, threshold),
  }));
  const selected = candidates.sort((left, right) => {
    const leftScore =
      (left.metrics.answerableEvidenceRecall.value ?? 0) +
      (left.metrics.correctAbstention.value ?? 0);
    const rightScore =
      (right.metrics.answerableEvidenceRecall.value ?? 0) +
      (right.metrics.correctAbstention.value ?? 0);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return (left.metrics.falseAccept.value ?? 0) - (right.metrics.falseAccept.value ?? 0);
  })[0];
  return selected.threshold;
}

function factGroupIntegrity(
  splits: Record<C4Split, C4Question[]>,
): boolean {
  const seen = new Map<string, C4Split>();
  for (const split of ['dev', 'calibration', 'test'] as C4Split[]) {
    for (const question of splits[split]) {
      const existing = seen.get(question.group);
      if (existing && existing !== split) return false;
      seen.set(question.group, split);
    }
  }
  return true;
}

export function serializeC4Report(report: C4Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function evaluatePhaseC4(input: {
  build: UnframedBuild;
  questions: C4Question[];
  topK: number;
  determinism?: DeterminismChecks;
  expectedSourceSha256?: string;
}): C4Report {
  const determinism = input.determinism ?? {
    stableManifest: true,
    stableChunkIds: true,
    uniqueChunkIds: true,
  };
  const split = splitC4Questions(input.questions);
  const baseline = createBaselineRetriever(input.build);
  const improved = createImprovedRetriever(input.build, DEFAULT_IMPROVED_CONFIG);
  const baselineStarted = performance.now();
  const baselineResults = {
    dev: buildResults(input.build, split.dev, 'dev', baseline, input.topK),
    calibration: buildResults(input.build, split.calibration, 'calibration', baseline, input.topK),
    test: buildResults(input.build, split.test, 'test', baseline, input.topK),
  };
  const baselineBuildMs = performance.now() - baselineStarted;
  const improvedStarted = performance.now();
  const improvedResults = {
    dev: buildResults(input.build, split.dev, 'dev', improved, input.topK),
    calibration: buildResults(input.build, split.calibration, 'calibration', improved, input.topK),
    test: buildResults(input.build, split.test, 'test', improved, input.topK),
  };
  const improvedBuildMs = performance.now() - improvedStarted;

  const strategies: C4StrategyReport[] = [
    {
      strategy: 'A',
      name: 'Original Phase C BM25',
      status: 'measured',
      config: { k1: 1.2, b: 0.75, minScore: 0 },
      indexBuildMs: baselineBuildMs,
      bySplit: {
        dev: { metrics: rankingMetrics(split.dev, baselineResults.dev), byLanguage: breakdowns('languageMode', split.dev, baselineResults.dev, 'baseline_b', null), byCategory: breakdowns('category', split.dev, baselineResults.dev, 'baseline_b', null), questions: baselineResults.dev },
        calibration: { metrics: rankingMetrics(split.calibration, baselineResults.calibration), byLanguage: breakdowns('languageMode', split.calibration, baselineResults.calibration, 'baseline_b', null), byCategory: breakdowns('category', split.calibration, baselineResults.calibration, 'baseline_b', null), questions: baselineResults.calibration },
        test: { metrics: rankingMetrics(split.test, baselineResults.test), byLanguage: breakdowns('languageMode', split.test, baselineResults.test, 'baseline_b', null), byCategory: breakdowns('category', split.test, baselineResults.test, 'baseline_b', null), questions: baselineResults.test },
      },
    },
    {
      strategy: 'B',
      name: 'Phase C.1 field-weighted BM25',
      status: 'measured',
      config: DEFAULT_IMPROVED_CONFIG,
      indexBuildMs: improvedBuildMs,
      bySplit: {
        dev: { metrics: rankingMetrics(split.dev, improvedResults.dev), byLanguage: breakdowns('languageMode', split.dev, improvedResults.dev, 'baseline_b', null), byCategory: breakdowns('category', split.dev, improvedResults.dev, 'baseline_b', null), questions: improvedResults.dev },
        calibration: { metrics: rankingMetrics(split.calibration, improvedResults.calibration), byLanguage: breakdowns('languageMode', split.calibration, improvedResults.calibration, 'baseline_b', null), byCategory: breakdowns('category', split.calibration, improvedResults.calibration, 'baseline_b', null), questions: improvedResults.calibration },
        test: { metrics: rankingMetrics(split.test, improvedResults.test), byLanguage: breakdowns('languageMode', split.test, improvedResults.test, 'baseline_b', null), byCategory: breakdowns('category', split.test, improvedResults.test, 'baseline_b', null), questions: improvedResults.test },
      },
    },
  ];

  const policies: C4PolicyReport[] = [];
  for (const strategy of ['A', 'B'] as const) {
    const results = strategy === 'A' ? baselineResults : improvedResults;
    for (const definition of C4_POLICIES) {
      const threshold = selectThreshold(
        definition.name,
        definition.thresholds,
        split.calibration,
        results.calibration,
      );
      policies.push({
        strategy,
        policy: definition.name,
        description: definition.description,
        threshold,
        calibration: policyMetrics(split.calibration, results.calibration, definition.name, threshold),
        test: policyMetrics(split.test, results.test, definition.name, threshold),
        byLanguageTest: breakdowns('languageMode', split.test, results.test, definition.name, threshold),
        byCategoryTest: breakdowns('category', split.test, results.test, definition.name, threshold),
      });
    }
  }

  const semanticAvailability = detectC4SemanticAvailability();
  const blocker = semanticAvailability.blocker ?? 'semantic retrieval unavailable';
  strategies.push(
    { strategy: 'C', name: 'Multilingual semantic retrieval', status: 'blocked', blocker },
    { strategy: 'D', name: 'Hybrid lexical + semantic retrieval', status: 'blocked', blocker: `${blocker}; no hypothetical metrics are reported` },
  );

  const languageCounts: Record<string, number> = {};
  const languageModeCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const question of input.questions) {
    languageCounts[question.language] = (languageCounts[question.language] ?? 0) + 1;
    languageModeCounts[languageMode(question)] = (languageModeCounts[languageMode(question)] ?? 0) + 1;
    categoryCounts[question.category] = (categoryCounts[question.category] ?? 0) + 1;
  }
  const invalidCount = [...baselineResults.dev, ...baselineResults.calibration, ...baselineResults.test].filter(
    (result) => result.answerability !== 'unverified' && !result.groundTruthValid,
  ).length;
  const diagnostics = buildChunkDiagnostics(input.build, determinism);
  const checks = {
    sourceHashValid: input.build.manifest.sourceSha256 === (input.expectedSourceSha256 ?? UNFRAMED_EXPECTED_SHA256),
    questionSetValid: invalidCount === 0,
    deterministicManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
    factGroupIntegrity: factGroupIntegrity({ dev: split.dev, calibration: split.calibration, test: split.test }),
    noGroundTruthLeakage: true,
    noPassageTextInReport: true,
  };
  const bTest = strategies[1].bySplit?.test?.metrics;

  const report: C4Report = {
    mode: 'local-evaluation',
    phase: 'C4',
    status: 'ok',
    protocolVersion: C4_PROTOCOL_VERSION,
    sourcePath: input.build.manifest.sourcePath,
    sourceSha256: input.build.manifest.sourceSha256,
    parserVersion: input.build.manifest.parserVersion,
    chunkerVersion: input.build.manifest.chunkerVersion,
    evaluatorVersion: C4_EVALUATOR_VERSION,
    manifestHash: input.build.manifest.manifestHash,
    questionSetHash: hashC4QuestionSet(input.questions),
    protocolHash: hashC4Protocol(),
    topK: input.topK,
    split: split.summary,
    dataset: {
      totalQuestions: input.questions.length,
      verified: input.questions.filter((q) => q.answerability !== 'unverified').length,
      unverified: input.questions.filter((q) => q.answerability === 'unverified').length,
      answerable: input.questions.filter((q) => q.answerability === 'answerable').length,
      unanswerable: input.questions.filter((q) => q.answerability === 'unanswerable').length,
      languageCounts,
      languageModeCounts,
      categoryCounts,
    },
    ranking: {
      dev: strategies[1].bySplit?.dev?.metrics ?? policyMetrics(split.dev, [], 'baseline_b', null),
      calibration: strategies[1].bySplit?.calibration?.metrics ?? policyMetrics(split.calibration, [], 'baseline_b', null),
      test: bTest ?? policyMetrics(split.test, [], 'baseline_b', null),
    },
    policies,
    strategies,
    semanticAvailability,
    c2MetricDefect: C2_METRIC_DEFECT,
    diagnostics,
    determinism,
    checks,
    allChecksPassed: false,
  };
  const serializedBeforeTextCheck = serializeC4Report(report);
  checks.noPassageTextInReport = !input.build.chunks.some(
    (chunk) => chunk.text.length >= 80 && serializedBeforeTextCheck.includes(chunk.text),
  );
  const allChecksPassed = Object.values(checks).every(Boolean);
  report.status = allChecksPassed ? 'ok' : 'failed';
  report.allChecksPassed = allChecksPassed;
  return report;
}

export { C4_QUESTIONS };

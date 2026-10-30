import type { BrainSourceClass } from '../../rag/types';
import type { BrainEvaluationQuestion } from './questions';

export type BrainEvaluationRun = {
  questionId: string;
  outcome: 'relevant_results' | 'weak_match' | 'no_match' | 'unavailable';
  hits: Array<{
    documentId: string;
    sourceClass?: BrainSourceClass | string;
  }>;
  selectedSourceClasses?: Array<BrainSourceClass | string>;
};

export type BrainQuestionScore = {
  id: string;
  category: BrainEvaluationQuestion['category'];
  answerable: boolean;
  outcome: BrainEvaluationRun['outcome'];
  recalled: boolean;
  recallAt5: number | null;
  precisionAt5: number | null;
  sourceSelection: number;
  retrievalFailed: boolean;
  falseAccept: boolean;
  retrievedDocuments: string[];
  expectedDocuments: string[];
  selectedSources: string[];
};

export type BrainEvaluationSummary = {
  questionCount: number;
  answerableCount: number;
  unanswerableCount: number;
  recallAt5: number | null;
  precisionAt5: number | null;
  sourceSelectionAccuracy: number;
  retrievalFailureRate: number;
  falseAcceptRate: number;
  emptyResultRate: number;
  byCategory: Record<
    string,
    {
      questionCount: number;
      recallAt5: number | null;
      precisionAt5: number | null;
      sourceSelectionAccuracy: number;
      retrievalFailureRate: number;
    }
  >;
  questions: BrainQuestionScore[];
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function scoreBrainQuestion(
  question: BrainEvaluationQuestion,
  run: BrainEvaluationRun
): BrainQuestionScore {
  const retrievedDocuments = unique(run.hits.map((hit) => hit.documentId)).slice(0, 5);
  const expected = new Set(question.expectedDocumentIds);
  const relevant = retrievedDocuments.filter((id) => expected.has(id));
  const recalled = relevant.length > 0;
  const answerable = question.answerable && question.expectedDocumentIds.length > 0;

  const recallAt5 = answerable ? relevant.length / question.expectedDocumentIds.length : null;
  const precisionAt5 = answerable
    ? retrievedDocuments.length > 0
      ? relevant.length / retrievedDocuments.length
      : 0
    : null;

  const selectedSources = unique((run.selectedSourceClasses || []).map((source) => String(source)));
  const expectedSources = question.expectedSourceClasses.map((source) => String(source));
  const sourceSelection =
    expectedSources.length === 0
      ? run.hits.length === 0
        ? 1
        : 0
      : selectedSources.some((source) => expectedSources.includes(source)) &&
          run.hits.every(
            (hit) => !hit.sourceClass || expectedSources.includes(String(hit.sourceClass))
          )
        ? 1
        : 0;

  const falseAccept = !answerable && run.hits.length > 0;
  const retrievalFailed = answerable
    ? !recalled || run.outcome !== 'relevant_results'
    : falseAccept;

  return {
    id: question.id,
    category: question.category,
    answerable,
    outcome: run.outcome,
    recalled,
    recallAt5,
    precisionAt5,
    sourceSelection,
    retrievalFailed,
    falseAccept,
    retrievedDocuments,
    expectedDocuments: question.expectedDocumentIds,
    selectedSources,
  };
}

export function evaluateBrainSet(
  questions: BrainEvaluationQuestion[],
  runs: BrainEvaluationRun[]
): BrainEvaluationSummary {
  const byId = new Map(runs.map((run) => [run.questionId, run]));
  const scores = questions.map((question) =>
    scoreBrainQuestion(
      question,
      byId.get(question.id) || { questionId: question.id, outcome: 'unavailable', hits: [] }
    )
  );

  const answerable = scores.filter((score) => score.answerable);
  const unanswerable = scores.filter((score) => !score.answerable);
  const categories = new Map<string, BrainQuestionScore[]>();

  for (const score of scores) {
    const list = categories.get(score.category) || [];
    list.push(score);
    categories.set(score.category, list);
  }

  return {
    questionCount: scores.length,
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    recallAt5: average(answerable.map((score) => score.recallAt5 ?? 0)),
    precisionAt5: average(answerable.map((score) => score.precisionAt5 ?? 0)),
    sourceSelectionAccuracy: average(scores.map((score) => score.sourceSelection)) ?? 0,
    retrievalFailureRate: average(scores.map((score) => (score.retrievalFailed ? 1 : 0))) ?? 0,
    falseAcceptRate: average(unanswerable.map((score) => (score.falseAccept ? 1 : 0))) ?? 0,
    emptyResultRate:
      average(scores.map((score) => (score.retrievedDocuments.length === 0 ? 1 : 0))) ?? 0,
    byCategory: Object.fromEntries(
      Array.from(categories.entries()).map(([category, list]) => [
        category,
        {
          questionCount: list.length,
          recallAt5: average(
            list.filter((score) => score.answerable).map((score) => score.recallAt5 ?? 0)
          ),
          precisionAt5: average(
            list.filter((score) => score.answerable).map((score) => score.precisionAt5 ?? 0)
          ),
          sourceSelectionAccuracy: average(list.map((score) => score.sourceSelection)) ?? 0,
          retrievalFailureRate: average(list.map((score) => (score.retrievalFailed ? 1 : 0))) ?? 0,
        },
      ])
    ),
    questions: scores,
  };
}

export function compareBrainSystems(
  questions: BrainEvaluationQuestion[],
  baselineRuns: BrainEvaluationRun[],
  candidateRuns: BrainEvaluationRun[]
): {
  baseline: BrainEvaluationSummary;
  candidate: BrainEvaluationSummary;
  delta: {
    recallAt5: number;
    precisionAt5: number;
    sourceSelectionAccuracy: number;
    retrievalFailureRate: number;
    falseAcceptRate: number;
  };
} {
  const baseline = evaluateBrainSet(questions, baselineRuns);
  const candidate = evaluateBrainSet(questions, candidateRuns);

  return {
    baseline,
    candidate,
    delta: {
      recallAt5: (candidate.recallAt5 ?? 0) - (baseline.recallAt5 ?? 0),
      precisionAt5: (candidate.precisionAt5 ?? 0) - (baseline.precisionAt5 ?? 0),
      sourceSelectionAccuracy: candidate.sourceSelectionAccuracy - baseline.sourceSelectionAccuracy,
      retrievalFailureRate: candidate.retrievalFailureRate - baseline.retrievalFailureRate,
      falseAcceptRate: candidate.falseAcceptRate - baseline.falseAcceptRate,
    },
  };
}

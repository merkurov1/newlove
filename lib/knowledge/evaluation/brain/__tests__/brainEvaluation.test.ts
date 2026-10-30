/** @jest-environment node */

import { BRAIN_EVALUATION_CATEGORIES, BRAIN_EVALUATION_QUESTIONS } from '../questions';
import {
  compareBrainSystems,
  evaluateBrainSet,
  scoreBrainQuestion,
  type BrainEvaluationRun,
} from '../evaluate';

const answerable = BRAIN_EVALUATION_QUESTIONS.find(
  (question) => question.id === 'novaya-ai-censorship'
)!;
const noAnswer = BRAIN_EVALUATION_QUESTIONS.find(
  (question) => question.id === 'no-answer-quantum'
)!;

function run(
  questionId: string,
  documents: string[],
  sources: string[] = ['article']
): BrainEvaluationRun {
  return {
    questionId,
    outcome: documents.length > 0 ? 'relevant_results' : 'no_match',
    hits: documents.map((documentId) => ({
      documentId,
      sourceClass: sources[0],
    })),
    selectedSourceClasses: sources,
  };
}

describe('Brain retrieval evaluation', () => {
  it('contains real-document coverage for every required category', () => {
    expect(BRAIN_EVALUATION_QUESTIONS.length).toBeGreaterThanOrEqual(20);

    for (const category of BRAIN_EVALUATION_CATEGORIES) {
      expect(BRAIN_EVALUATION_QUESTIONS.some((question) => question.category === category)).toBe(
        true
      );
    }

    expect(BRAIN_EVALUATION_QUESTIONS.some((question) => question.language === 'ru')).toBe(true);
    expect(BRAIN_EVALUATION_QUESTIONS.some((question) => question.answerable === false)).toBe(true);
  });

  it('scores document-level recall, precision and source selection', () => {
    const score = scoreBrainQuestion(
      answerable,
      run(answerable.id, [answerable.expectedDocumentIds[0]])
    );

    expect(score.recalled).toBe(true);
    expect(score.recallAt5).toBe(1);
    expect(score.precisionAt5).toBe(1);
    expect(score.sourceSelection).toBe(1);
    expect(score.retrievalFailed).toBe(false);
  });

  it('treats an answerable empty result as a retrieval failure', () => {
    const score = scoreBrainQuestion(answerable, run(answerable.id, []));

    expect(score.recalled).toBe(false);
    expect(score.retrievalFailed).toBe(true);
  });

  it('flags a false accept on an unanswerable question', () => {
    const score = scoreBrainQuestion(noAnswer, run(noAnswer.id, ['doc_article_false']));

    expect(score.answerable).toBe(false);
    expect(score.falseAccept).toBe(true);
    expect(score.retrievalFailed).toBe(true);
  });

  it('compares a baseline with a candidate', () => {
    const baseline: BrainEvaluationRun[] = [
      run(answerable.id, []),
      run(noAnswer.id, ['doc_article_false']),
    ];
    const candidate: BrainEvaluationRun[] = [
      run(answerable.id, [answerable.expectedDocumentIds[0]]),
      run(noAnswer.id, [], []),
    ];

    const comparison = compareBrainSystems([answerable, noAnswer], baseline, candidate);

    expect(comparison.candidate.recallAt5).toBeGreaterThan(comparison.baseline.recallAt5 ?? 0);
    expect(comparison.candidate.falseAcceptRate).toBeLessThan(comparison.baseline.falseAcceptRate);
    expect(comparison.delta.retrievalFailureRate).toBeLessThan(0);
  });
});

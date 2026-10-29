import type { C4Question, C4Split } from '../evaluation/c4/types';
import type { UnframedBuild } from '../types';

export type SemanticCandidate = {
  chunkId: string;
  sectionIndex: number;
  embedding: number[];
};

export type SemanticTopResult = {
  rank: number;
  chunkId: string;
  sectionIndex: number;
  score: number;
};

export type SemanticQuestionEvaluation = {
  id: string;
  split: C4Split;
  languageMode: 'en' | 'pure_ru' | 'latin_ru';
  category: string;
  answerability: C4Question['answerability'];
  groundTruthValid: boolean;
  scored: boolean;
  top: SemanticTopResult[];
  relevantHit: boolean | null;
  recallAt5: number | null;
  precisionAt5: number | null;
  mrr: number | null;
};

export type SemanticCount = {
  numerator: number;
  denominator: number;
  value: number | null;
};

export type SemanticMetrics = {
  questionCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  answerableCount: number;
  unanswerableCount: number;
  recallAt5: SemanticCount;
  precisionAt5: SemanticCount;
  mrr: SemanticCount;
  evidenceMiss: SemanticCount;
};

function count(numerator: number, denominator: number): SemanticCount {
  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

export function languageMode(question: C4Question): 'en' | 'pure_ru' | 'latin_ru' {
  if (question.language === 'en') return 'en';
  return question.russianMode === 'latin_proper_noun' ? 'latin_ru' : 'pure_ru';
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    throw new Error('embedding_dimension_mismatch');
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function rankSemantic(
  queryEmbedding: number[],
  candidates: SemanticCandidate[],
  topK = 5
): SemanticTopResult[] {
  return candidates
    .map((candidate) => ({
      chunkId: candidate.chunkId,
      sectionIndex: candidate.sectionIndex,
      score: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map((hit, index) => ({ rank: index + 1, ...hit }));
}

function groundTruthValid(question: C4Question, build: UnframedBuild): boolean {
  if (question.answerability === 'unverified') return true;

  const chunks = question.relevantChunkIds ?? [];
  const sections = question.relevantSectionIndexes ?? [];
  const hasReferences = chunks.length > 0 || sections.length > 0;

  if (question.answerability === 'unanswerable') return !hasReferences;
  if (!hasReferences) return false;

  const knownChunks = new Set(build.chunks.map((chunk) => chunk.id));
  const knownSections = new Set(build.document.sections.map((section) => section.index));

  return (
    chunks.every((chunkId) => knownChunks.has(chunkId)) &&
    sections.every((sectionIndex) => knownSections.has(sectionIndex))
  );
}

export function evaluateSemanticQuestion(input: {
  question: C4Question;
  split: C4Split;
  candidates: SemanticCandidate[];
  queryEmbedding: number[];
  build: UnframedBuild;
  topK?: number;
}): SemanticQuestionEvaluation {
  const { question, split, candidates, queryEmbedding, build } = input;
  const topK = input.topK ?? 5;
  const valid = groundTruthValid(question, build);
  const scored = question.answerability !== 'unverified' && valid;
  const top = rankSemantic(queryEmbedding, candidates, topK);

  if (!scored) {
    return {
      id: question.id,
      split,
      languageMode: languageMode(question),
      category: question.category,
      answerability: question.answerability,
      groundTruthValid: valid,
      scored: false,
      top,
      relevantHit: null,
      recallAt5: null,
      precisionAt5: null,
      mrr: null,
    };
  }

  const relevantChunks = new Set(question.relevantChunkIds ?? []);
  const relevantSections = new Set(question.relevantSectionIndexes ?? []);
  const isRelevant = (hit: SemanticTopResult): boolean =>
    relevantChunks.has(hit.chunkId) || relevantSections.has(hit.sectionIndex);
  const relevant = top.filter(isRelevant);
  const firstRank = top.findIndex(isRelevant) + 1;

  return {
    id: question.id,
    split,
    languageMode: languageMode(question),
    category: question.category,
    answerability: question.answerability,
    groundTruthValid: true,
    scored: true,
    top,
    relevantHit: question.answerability === 'answerable' ? relevant.length > 0 : null,
    recallAt5: question.answerability === 'answerable' && relevant.length > 0 ? 1 : 0,
    precisionAt5: question.answerability === 'answerable' ? relevant.length / topK : null,
    mrr: question.answerability === 'answerable' ? (firstRank > 0 ? 1 / firstRank : 0) : null,
  };
}

export function semanticMetrics(results: SemanticQuestionEvaluation[]): SemanticMetrics {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable'
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable'
  );

  return {
    questionCount: results.length,
    verifiedCount: results.filter((result) => result.answerability !== 'unverified').length,
    unverifiedCount: results.filter((result) => result.answerability === 'unverified').length,
    answerableCount: answerable.length,
    unanswerableCount: unanswerable.length,
    recallAt5: count(
      answerable.filter((result) => result.recallAt5 === 1).length,
      answerable.length
    ),
    precisionAt5: count(
      answerable.reduce((sum, result) => sum + (result.precisionAt5 ?? 0) * 5, 0),
      answerable.length * 5
    ),
    mrr: count(
      answerable.reduce((sum, result) => sum + (result.mrr ?? 0), 0),
      answerable.length
    ),
    evidenceMiss: count(
      answerable.filter((result) => result.relevantHit !== true).length,
      answerable.length
    ),
  };
}

export function semanticBreakdowns(
  results: SemanticQuestionEvaluation[]
): Array<{ key: string } & SemanticMetrics> {
  const keys = [...new Set(results.map((result) => result.languageMode))].sort();

  return keys.map((key) => ({
    key,
    ...semanticMetrics(results.filter((result) => result.languageMode === key)),
  }));
}

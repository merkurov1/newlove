import type { UnframedBuild, UnframedChunk } from '../../types';
import { buildBm25Index, searchBm25 } from '../bm25';
import { tokenizeForBm25, uniqueTokens } from '../tokenize';

import type {
  C1Hit,
  C1ModelConfig,
  C1Retrieval,
  RetrievalOutcome,
} from './types';

type FieldName = 'body' | 'heading' | 'part' | 'path';

type FieldIndex = {
  termFrequencies: Map<string, number>;
  length: number;
};

type IndexedDocument = {
  chunk: UnframedChunk;
  fields: Record<FieldName, FieldIndex>;
};

type ImprovedIndex = {
  documents: IndexedDocument[];
  documentFrequency: Map<string, number>;
  averageLengths: Record<FieldName, number>;
  config: C1ModelConfig;
};

const FIELD_NAMES: FieldName[] = ['body', 'heading', 'part', 'path'];

/**
 * Common English/Russian function words plus generic structural terms.
 *
 * Structural words are deliberately stopped because the baseline repeated
 * "chapter"/"part" tokens in every document and distorted structure queries.
 * This is a lexical baseline improvement, not a language model.
 */
export const DEFAULT_STOPWORDS = [
  'a', 'about', 'after', 'all', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'book', 'both', 'but', 'by',
  'chapter', 'could', 'cover', 'covered', 'covers', 'describe', 'described',
  'describes', 'did', 'do', 'does', 'during', 'each', 'few', 'for', 'from',
  'had', 'happen', 'happened', 'happens', 'has', 'have', 'he', 'her', 'here',
  'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'me', 'mention', 'mentioned', 'mentions', 'more', 'most', 'my', 'no',
  'not', 'of', 'on', 'or', 'our', 'ours', 'out', 'over', 'part', 'recount',
  'recounted', 'recounts', 'said', 'same', 'say', 'says', 'section', 'she',
  'should', 'so', 'some', 'such', 'tell', 'told', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'under', 'up', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your', 'yours',
  // Russian function words, kept separate and transparent.
  'а', 'без', 'бы', 'был', 'была', 'были', 'быть', 'в', 'во', 'вот', 'вы',
  'где', 'да', 'для', 'до', 'его', 'её', 'если', 'есть', 'же', 'за', 'зачем',
  'и', 'из', 'или', 'им', 'их', 'к', 'как', 'какая', 'какие', 'какой', 'когда',
  'кто', 'ли', 'мы', 'на', 'над', 'не', 'ни', 'но', 'о', 'об', 'он', 'она',
  'они', 'от', 'по', 'под', 'почему', 'при', 'с', 'со', 'так', 'также', 'то',
  'только', 'ты', 'у', 'что', 'чтобы', 'эта', 'эти', 'это', 'этот', 'я',
];

export const DEFAULT_IMPROVED_CONFIG: C1ModelConfig = {
  k1: 1.2,
  b: 0.75,
  bodyWeight: 1,
  headingWeight: 2.2,
  partWeight: 0.3,
  pathWeight: 0.4,
  sectionBoost: 0.2,
  minScore: 3,
  stopwords: DEFAULT_STOPWORDS,
};

function makeFieldIndex(tokens: string[]): FieldIndex {
  const termFrequencies = new Map<string, number>();

  for (const token of tokens) {
    termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
  }

  return {
    termFrequencies,
    length: tokens.length,
  };
}

function cleanTokens(value: string, stopwords: Set<string>): string[] {
  return tokenizeForBm25(value).filter((token) => !stopwords.has(token));
}

export function buildImprovedIndex(
  build: UnframedBuild,
  config: C1ModelConfig = DEFAULT_IMPROVED_CONFIG,
): ImprovedIndex {
  const stopwords = new Set(config.stopwords);
  const documents: IndexedDocument[] = [];
  const documentFrequency = new Map<string, number>();
  const totals: Record<FieldName, number> = {
    body: 0,
    heading: 0,
    part: 0,
    path: 0,
  };

  for (const chunk of build.chunks) {
    const section = build.document.sections[chunk.sectionIndex];
    const tokenLists: Record<FieldName, string[]> = {
      body: cleanTokens(chunk.text, stopwords),
      heading: cleanTokens(chunk.heading, stopwords),
      part: cleanTokens(section?.part ?? '', stopwords),
      path: cleanTokens(chunk.sectionPath.join(' '), stopwords),
    };
    const fields = {} as Record<FieldName, FieldIndex>;
    const uniqueDocumentTokens = new Set<string>();

    for (const fieldName of FIELD_NAMES) {
      const tokens = tokenLists[fieldName];
      fields[fieldName] = makeFieldIndex(tokens);
      totals[fieldName] += tokens.length;

      for (const token of fields[fieldName].termFrequencies.keys()) {
        uniqueDocumentTokens.add(token);
      }
    }

    for (const token of uniqueDocumentTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }

    documents.push({ chunk, fields });
  }

  const averageLengths = {} as Record<FieldName, number>;

  for (const fieldName of FIELD_NAMES) {
    averageLengths[fieldName] =
      documents.length > 0 ? totals[fieldName] / documents.length : 0;
  }

  return {
    documents,
    documentFrequency,
    averageLengths,
    config,
  };
}

function fieldScore(
  index: ImprovedIndex,
  fieldName: FieldName,
  field: FieldIndex,
  token: string,
): number {
  const termFrequency = field.termFrequencies.get(token) ?? 0;

  if (termFrequency === 0) return 0;

  const documentFrequency = index.documentFrequency.get(token) ?? 0;
  const idf = Math.log(
    1 +
      (index.documents.length - documentFrequency + 0.5) /
        (documentFrequency + 0.5),
  );
  const averageLength = index.averageLengths[fieldName] || 1;
  const denominator =
    termFrequency +
    index.config.k1 *
      (1 - index.config.b + (index.config.b * field.length) / averageLength);

  return idf * ((termFrequency * (index.config.k1 + 1)) / denominator);
}

function fieldWeight(config: C1ModelConfig, fieldName: FieldName): number {
  switch (fieldName) {
    case 'body':
      return config.bodyWeight;
    case 'heading':
      return config.headingWeight;
    case 'part':
      return config.partWeight;
    case 'path':
      return config.pathWeight;
  }
}

export function searchImproved(
  index: ImprovedIndex,
  query: string,
  topK: number,
): C1Retrieval {
  const startedAt = performance.now();
  const stopwords = new Set(index.config.stopwords);
  const queryTokens = uniqueTokens(query).filter((token) => !stopwords.has(token));

  if (queryTokens.length === 0 || index.documents.length === 0) {
    return {
      outcome: 'no_match',
      hits: [],
      topScore: 0,
      latencyMs: performance.now() - startedAt,
    };
  }

  const rawScores: Array<{ document: IndexedDocument; rawScore: number }> = [];

  for (const document of index.documents) {
    let rawScore = 0;

    for (const token of queryTokens) {
      for (const fieldName of FIELD_NAMES) {
        rawScore +=
          fieldWeight(index.config, fieldName) *
          fieldScore(index, fieldName, document.fields[fieldName], token);
      }
    }

    if (rawScore > 0 && Number.isFinite(rawScore)) {
      rawScores.push({ document, rawScore });
    }
  }

  if (rawScores.length === 0) {
    return {
      outcome: 'no_match',
      hits: [],
      topScore: 0,
      latencyMs: performance.now() - startedAt,
    };
  }

  const sectionMax = new Map<number, number>();

  for (const { document, rawScore } of rawScores) {
    sectionMax.set(
      document.chunk.sectionIndex,
      Math.max(sectionMax.get(document.chunk.sectionIndex) ?? 0, rawScore),
    );
  }

  const scored = rawScores
    .map(({ document, rawScore }) => ({
      document,
      rawScore,
      score:
        rawScore +
        index.config.sectionBoost *
          (sectionMax.get(document.chunk.sectionIndex) ?? 0),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.rawScore !== left.rawScore) return right.rawScore - left.rawScore;
      if (left.document.chunk.index !== right.document.chunk.index) {
        return left.document.chunk.index - right.document.chunk.index;
      }

      return left.document.chunk.id.localeCompare(right.document.chunk.id);
    });

  const topScore = scored[0].score;
  const outcome: RetrievalOutcome =
    topScore >= index.config.minScore ? 'relevant_results' : 'weak_match';
  const candidates = scored.slice(0, topK);
  const hits: C1Hit[] = candidates
    .filter((candidate) => outcome !== 'relevant_results' || candidate.score >= index.config.minScore)
    .map(({ document, rawScore, score }) => ({
      chunkId: document.chunk.id,
      sectionIndex: document.chunk.sectionIndex,
      sectionPath: [...document.chunk.sectionPath],
      charStart: document.chunk.charStart,
      charEnd: document.chunk.charEnd,
      score,
      rawScore,
    }));

  return {
    outcome,
    hits,
    topScore,
    latencyMs: performance.now() - startedAt,
  };
}

export function createBaselineRetriever(build: UnframedBuild) {
  const index = buildBm25Index(build.chunks);

  return (query: string, topK: number): C1Retrieval => {
    const result = searchBm25(index, query, topK);
    const outcome: RetrievalOutcome =
      result.status === 'results' ? 'relevant_results' : 'no_match';

    return {
      outcome,
      hits: result.hits.map((hit) => ({
        chunkId: hit.chunkId,
        sectionIndex: hit.sectionIndex,
        sectionPath: [...hit.sectionPath],
        charStart: hit.charStart,
        charEnd: hit.charEnd,
        score: hit.score,
        rawScore: hit.score,
      })),
      topScore: result.hits[0]?.score ?? 0,
      latencyMs: result.latencyMs,
    };
  };
}

export function createImprovedRetriever(
  build: UnframedBuild,
  config: C1ModelConfig = DEFAULT_IMPROVED_CONFIG,
) {
  const index = buildImprovedIndex(build, config);

  return (query: string, topK: number): C1Retrieval =>
    searchImproved(index, query, topK);
}

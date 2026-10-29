import type { UnframedChunk } from '../types';

import { tokenizeForBm25, uniqueTokens } from './tokenize';
import type { QueryRetrieval, RetrievalHit } from './types';

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 20;

type IndexedChunk = {
  chunk: UnframedChunk;
  termFrequencies: Map<string, number>;
  length: number;
};

export type Bm25Index = {
  chunks: IndexedChunk[];
  documentFrequency: Map<string, number>;
  averageLength: number;
};

export type Bm25Options = {
  k1?: number;
  b?: number;
};

export function normalizeTopK(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TOP_K;

  return Math.min(MAX_TOP_K, Math.max(1, Math.floor(value)));
}

function chunkSearchText(chunk: UnframedChunk): string {
  // Heading and section path are repeated metadata, not passage text. This
  // helps structure questions without changing the returned passage.
  return [
    chunk.heading,
    chunk.heading,
    chunk.sectionPath.join(' '),
    chunk.text,
  ].join(' ');
}

export function buildBm25Index(chunks: UnframedChunk[]): Bm25Index {
  const documentFrequency = new Map<string, number>();
  const indexedChunks: IndexedChunk[] = [];
  let totalLength = 0;

  for (const chunk of chunks) {
    const tokens = tokenizeForBm25(chunkSearchText(chunk));
    const termFrequencies = new Map<string, number>();

    for (const token of tokens) {
      termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
    }

    for (const token of termFrequencies.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }

    indexedChunks.push({
      chunk,
      termFrequencies,
      length: tokens.length,
    });

    totalLength += tokens.length;
  }

  return {
    chunks: indexedChunks,
    documentFrequency,
    averageLength: indexedChunks.length > 0 ? totalLength / indexedChunks.length : 0,
  };
}

export function searchBm25(
  index: Bm25Index,
  query: string,
  topK: number = DEFAULT_TOP_K,
  options: Bm25Options = {},
): QueryRetrieval {
  const startedAt = performance.now();
  const limit = normalizeTopK(topK);
  const k1 = options.k1 ?? BM25_K1;
  const b = options.b ?? BM25_B;
  const queryTokens = uniqueTokens(query);

  if (index.chunks.length === 0 || queryTokens.length === 0) {
    return {
      status: 'no_match',
      hits: [],
      latencyMs: performance.now() - startedAt,
    };
  }

  const scored: Array<{ chunk: UnframedChunk; score: number }> = [];
  const averageLength = index.averageLength || 1;

  for (const indexed of index.chunks) {
    let score = 0;

    for (const token of queryTokens) {
      const termFrequency = indexed.termFrequencies.get(token) ?? 0;

      if (termFrequency === 0) continue;

      const documentFrequency = index.documentFrequency.get(token) ?? 0;
      const idf = Math.log(
        1 + (index.chunks.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
      );
      const denominator =
        termFrequency + k1 * (1 - b + (b * indexed.length) / averageLength);

      score += idf * ((termFrequency * (k1 + 1)) / denominator);
    }

    if (score > 0 && Number.isFinite(score)) {
      scored.push({ chunk: indexed.chunk, score });
    }
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.chunk.index !== right.chunk.index) return left.chunk.index - right.chunk.index;

    return left.chunk.id.localeCompare(right.chunk.id);
  });

  const hits: RetrievalHit[] = scored.slice(0, limit).map(({ chunk, score }) => ({
    chunkId: chunk.id,
    sectionIndex: chunk.sectionIndex,
    sectionPath: [...chunk.sectionPath],
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    score,
  }));

  return {
    status: hits.length > 0 ? 'results' : 'no_match',
    hits,
    latencyMs: performance.now() - startedAt,
  };
}

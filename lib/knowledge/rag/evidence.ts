import type { RagRetrievalResult } from './types';

export type UnframedEvidenceSource = {
  chunkId: string;
  heading: string;
  sectionPath: string[];
  sectionIndex: number;
  lineStart: number;
  lineEnd: number;
  similarity: number;
  excerpt: string;
};

const DEFAULT_EXCERPT_CHARS = 280;

function excerpt(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxChars) return normalized;

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Owner-only evidence payload. The full passage stays on the server; the
 * browser receives only a short excerpt and stable source coordinates.
 */
export function buildUnframedEvidenceSources(
  result: RagRetrievalResult,
  maxExcerptChars: number = DEFAULT_EXCERPT_CHARS
): UnframedEvidenceSource[] {
  if (result.outcome !== 'relevant_results') return [];

  return result.hits.map((hit) => ({
    chunkId: hit.chunkId,
    heading: hit.heading,
    sectionPath: [...hit.sectionPath],
    sectionIndex: hit.sectionIndex,
    lineStart: hit.lineStart,
    lineEnd: hit.lineEnd,
    similarity: Number(hit.similarity.toFixed(4)),
    excerpt: excerpt(hit.content, maxExcerptChars),
  }));
}

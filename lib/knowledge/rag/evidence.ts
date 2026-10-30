import type { RagRetrievalResult } from './types';

export type UnframedEvidenceSource = {
  documentId?: string;
  documentTitle?: string;
  sourceType?: string;
  sourceClass?: string;
  sourceDomain?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  chunkId: string;
  heading: string;
  sectionPath: string[];
  sectionIndex: number;
  lineStart: number;
  lineEnd: number;
  similarity: number;
  excerpt: string;
  outlet?: string | null;
  canonicalUrl?: string | null;
  quoteType?: 'direct_quote' | 'indirect_quote' | 'mention';
  verificationStatus?: 'verified' | 'unverified' | 'none';
  mediaRecordId?: string;
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
    documentId: hit.documentId,
    ...(hit.documentTitle ? { documentTitle: hit.documentTitle } : {}),
    ...(hit.sourceType ? { sourceType: hit.sourceType } : {}),
    ...(hit.sourceClass ? { sourceClass: hit.sourceClass } : {}),
    sourceDomain: hit.sourceDomain ?? null,
    author: hit.author ?? null,
    publishedAt: hit.publishedAt ?? null,
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

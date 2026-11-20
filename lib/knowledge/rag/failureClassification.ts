/**
 * Stable retrieval-failure taxonomy.
 *
 * The raw outcome/code pair is intentionally preserved in telemetry. This
 * helper adds one derived class so the owner can separate a slow provider, an
 * empty corpus, a genuinely irrelevant query and an index/filter fault instead
 * of reading every non-success as "RAG broken".
 */

export type RetrievalFailureClass =
  | 'not_a_failure'
  | 'disabled'
  | 'timeout'
  | 'embedding_unavailable'
  | 'database_unavailable'
  | 'index_mismatch'
  | 'empty_corpus'
  | 'no_relevant_match'
  | 'weak_match'
  | 'invalid_request'
  | 'unexpected';

const TIMEOUT_CODES = new Set(['embedding_timeout', 'timeout', 'flow_rag_timeout']);
const EMBEDDING_CODES = new Set([
  'embedding_failed',
  'embedding_provider',
  'embedding_transport',
]);
const DATABASE_CODES = new Set(['database_failed', 'database_unavailable', 'search_unavailable']);
const INDEX_CODES = new Set(['embedding_dimension_mismatch', 'embedding_model_mismatch']);
const INVALID_CODES = new Set(['invalid_query', 'unauthorized_scope', 'missing_configuration']);
const EMPTY_CORPUS_CODES = new Set(['no_published_records', 'empty_scope', 'empty_corpus']);

export function classifyRetrievalFailure(
  outcome: string | null | undefined,
  code?: string | null
): RetrievalFailureClass {
  const normalizedOutcome = (outcome || '').trim().toLowerCase();
  const normalizedCode = (code || '').trim().toLowerCase();

  if (normalizedOutcome === 'relevant_results') return 'not_a_failure';
  if (normalizedCode === 'disabled' || normalizedOutcome === 'disabled') return 'disabled';
  if (TIMEOUT_CODES.has(normalizedCode)) return 'timeout';
  if (EMBEDDING_CODES.has(normalizedCode)) return 'embedding_unavailable';
  if (DATABASE_CODES.has(normalizedCode)) return 'database_unavailable';
  if (INDEX_CODES.has(normalizedCode)) return 'index_mismatch';
  if (EMPTY_CORPUS_CODES.has(normalizedCode)) return 'empty_corpus';
  if (INVALID_CODES.has(normalizedCode)) return 'invalid_request';

  if (normalizedOutcome === 'no_match') return 'no_relevant_match';
  if (normalizedOutcome === 'weak_match') return 'weak_match';

  return 'unexpected';
}

export function isRetrievalFailure(
  outcome: string | null | undefined,
  code?: string | null
): boolean {
  return classifyRetrievalFailure(outcome, code) !== 'not_a_failure';
}

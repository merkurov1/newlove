/**
 * RAG-specific errors.
 *
 * Error messages must never include manuscript text, queries, vectors or
 * provider response bodies. Codes are safe for structured logs.
 */

export type RagErrorCode =
  | 'rag_configuration'
  | 'embedding_provider'
  | 'embedding_timeout'
  | 'embedding_transport'
  | 'embedding_dimension_mismatch'
  | 'embedding_model_mismatch'
  | 'ingestion_plan_invalid'
  | 'database_unavailable'
  | 'database_failed';

export class RagConfigurationError extends Error {
  readonly code = 'rag_configuration';

  constructor(reason: string) {
    super(`rag_configuration reason=${reason}`);
    this.name = 'RagConfigurationError';
  }
}

export class EmbeddingProviderError extends Error {
  readonly code: RagErrorCode;
  readonly status: number | null;

  constructor(
    reason: 'request_failed' | 'invalid_response' | 'empty_response',
    status: number | null = null
  ) {
    super(`embedding_provider reason=${reason}${status === null ? '' : ` status=${status}`}`);
    this.name = 'EmbeddingProviderError';
    this.code = reason === 'request_failed' ? 'embedding_provider' : 'embedding_transport';
    this.status = status;
  }
}

export class EmbeddingTimeoutError extends Error {
  readonly code = 'embedding_timeout';

  constructor() {
    super('embedding_timeout');
    this.name = 'EmbeddingTimeoutError';
  }
}

export class EmbeddingDimensionMismatchError extends Error {
  readonly code = 'embedding_dimension_mismatch';
  readonly expected: number;
  readonly actual: number;

  constructor(expected: number, actual: number) {
    super(`embedding_dimension_mismatch expected=${expected} actual=${actual}`);
    this.name = 'EmbeddingDimensionMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

export class EmbeddingModelMismatchError extends Error {
  readonly code = 'embedding_model_mismatch';
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`embedding_model_mismatch expected=${expected} actual=${actual}`);
    this.name = 'EmbeddingModelMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

export class IngestionPlanError extends Error {
  readonly code = 'ingestion_plan_invalid';

  constructor(reason: string) {
    super(`ingestion_plan_invalid reason=${reason}`);
    this.name = 'IngestionPlanError';
  }
}

export class KnowledgeDatabaseError extends Error {
  readonly code: 'database_failed' | 'database_unavailable';

  constructor(reason: 'unavailable' | 'query_failed' | 'write_failed') {
    super(`database_failed reason=${reason}`);
    this.name = 'KnowledgeDatabaseError';
    this.code = reason === 'unavailable' ? 'database_unavailable' : 'database_failed';
  }
}

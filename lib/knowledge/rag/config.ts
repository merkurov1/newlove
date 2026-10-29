import {
  UNFRAMED_DOCUMENT_ID,
  UNFRAMED_PARSER_VERSION,
  UNFRAMED_CHUNKER_VERSION,
} from '../unframed';
import { RagConfigurationError } from './errors';

/**
 * Verified OpenRouter embedding contract (audited 2026-10-29):
 *
 * - POST https://openrouter.ai/api/v1/embeddings
 * - Authorization: Bearer <OPENROUTER_API_KEY>
 * - body: { model, input: string[] , encoding_format: 'float', provider? }
 * - response: { data: [{ index, embedding: number[] }], model, usage }
 * - model catalogue: https://openrouter.ai/api/v1/models?output_modalities=embeddings
 *
 * `baai/bge-m3` is multilingual, 1024-dimensional and exposes an 8194-token
 * context. Only this model may be used until a new contract is reviewed and
 * the database is re-indexed deliberately.
 *
 * OpenRouter may return a provider-prefixed model id for the same model
 * (`parasail-bge-m3`, `deepinfra-bge-m3`) depending on routing. Those aliases
 * are accepted for validation, but the canonical model id is always persisted.
 */
export const UNFRAMED_EMBEDDING_MODEL = 'baai/bge-m3';
export const UNFRAMED_EMBEDDING_MODEL_ALIASES = [
  'baai/bge-m3',
  'parasail-bge-m3',
  'deepinfra-bge-m3',
] as const;
export const UNFRAMED_EMBEDDING_DIMENSIONS = 1024;
export const UNFRAMED_EMBEDDING_CONTEXT_TOKENS = 8194;
export const OPENROUTER_EMBEDDINGS_ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

const PROVIDER_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Conservative batch size: OpenRouter does not publish a hard array limit. */
export const UNFRAMED_EMBEDDING_BATCH_SIZE = 32;
export const UNFRAMED_EMBEDDING_TIMEOUT_MS = 20_000;

export const UNFRAMED_RAG_TOP_K = 5;
export const UNFRAMED_RAG_CONTEXT_CHAR_BUDGET = 8_000;
export const UNFRAMED_RAG_TIMEOUT_MS = 1_500;
export const UNFRAMED_RAG_MAX_QUERY_CHARS = 2_000;
export const UNFRAMED_RAG_INGESTION_VERSION = 'unframed-rag-ingestion-v1';

/**
 * Provisional, uncalibrated threshold. It must be selected on the C4
 * calibration split before production use and never described as validated
 * before that happens.
 */
export const UNFRAMED_RAG_PROVISIONAL_MIN_SIMILARITY = 0.45;

export const UNFRAMED_RAG_DOCUMENT = {
  id: UNFRAMED_DOCUMENT_ID,
  title: 'UNFRAMED',
  parserVersion: UNFRAMED_PARSER_VERSION,
  chunkerVersion: UNFRAMED_CHUNKER_VERSION,
  ingestionVersion: UNFRAMED_RAG_INGESTION_VERSION,
} as const;

export type RagEnvironment = Record<string, string | undefined>;

export type UnframedEmbeddingConfig = {
  modelId: string;
  dimensions: number;
};

export function isPierrotRagEnabled(env: RagEnvironment = process.env): boolean {
  return (env.PIERROT_RAG_ENABLED || '').trim().toLowerCase() === 'true';
}

/**
 * True when a response model id belongs to the verified UNFRAMED embedding
 * model, including OpenRouter provider-prefixed aliases.
 */
export function isSupportedEmbeddingResponseModel(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (UNFRAMED_EMBEDDING_MODEL_ALIASES as readonly string[]).includes(normalized);
}

/**
 * Optional provider pin. When set, all ingestion and query embeddings use one
 * OpenRouter provider with fallbacks disabled, preventing mixed provider
 * vectors in one index.
 */
export function resolveUnframedEmbeddingProvider(env: RagEnvironment = process.env): string | null {
  const raw = (env.UNFRAMED_EMBEDDING_PROVIDER || '').trim().toLowerCase();

  if (!raw) return null;

  if (!PROVIDER_SLUG_PATTERN.test(raw)) {
    throw new RagConfigurationError('UNFRAMED_EMBEDDING_PROVIDER_invalid');
  }

  return raw;
}

export function resolveUnframedEmbeddingConfig(
  env: RagEnvironment = process.env
): UnframedEmbeddingConfig {
  const configured = (env.UNFRAMED_EMBEDDING_MODEL || '').trim();

  if (!configured) {
    throw new RagConfigurationError('UNFRAMED_EMBEDDING_MODEL_missing');
  }

  if (configured !== UNFRAMED_EMBEDDING_MODEL) {
    throw new RagConfigurationError('UNFRAMED_EMBEDDING_MODEL_unsupported');
  }

  return {
    modelId: UNFRAMED_EMBEDDING_MODEL,
    dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
  };
}

export function resolveUnframedRagThreshold(env: RagEnvironment = process.env): number {
  const raw = (env.UNFRAMED_RAG_MIN_SIMILARITY || '').trim();

  if (!raw) return UNFRAMED_RAG_PROVISIONAL_MIN_SIMILARITY;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RagConfigurationError('UNFRAMED_RAG_MIN_SIMILARITY_invalid');
  }

  return value;
}

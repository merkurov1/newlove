import {
  EmbeddingDimensionMismatchError,
  EmbeddingModelMismatchError,
  EmbeddingProviderError,
  EmbeddingTimeoutError,
  RagConfigurationError,
} from './errors';
import {
  OPENROUTER_EMBEDDINGS_ENDPOINT,
  UNFRAMED_EMBEDDING_BATCH_SIZE,
  UNFRAMED_EMBEDDING_TIMEOUT_MS,
  type RagEnvironment,
  resolveUnframedEmbeddingConfig,
} from './config';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type EmbeddingClient = {
  modelId: string;
  dimensions: number;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
};

export type OpenRouterEmbeddingOptions = {
  apiKey: string;
  modelId: string;
  dimensions: number;
  fetchImpl?: FetchLike;
  endpoint?: string;
  timeoutMs?: number;
  batchSize?: number;
};

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function parseEmbeddingResponse(
  payload: unknown,
  expectedCount: number,
  expectedModel: string,
  expectedDimensions: number
): number[][] {
  if (!payload || typeof payload !== 'object') {
    throw new EmbeddingProviderError('invalid_response');
  }

  const record = payload as Record<string, unknown>;

  if (record.model !== expectedModel) {
    throw new EmbeddingModelMismatchError(
      expectedModel,
      typeof record.model === 'string' ? record.model : 'unknown'
    );
  }

  if (!Array.isArray(record.data) || record.data.length !== expectedCount) {
    throw new EmbeddingProviderError('invalid_response');
  }

  const ordered: Array<{ index: number; embedding: number[] }> = [];

  for (const item of record.data) {
    if (!item || typeof item !== 'object') {
      throw new EmbeddingProviderError('invalid_response');
    }

    const entry = item as Record<string, unknown>;

    if (
      typeof entry.index !== 'number' ||
      !Number.isInteger(entry.index) ||
      entry.index < 0 ||
      entry.index >= expectedCount ||
      !Array.isArray(entry.embedding)
    ) {
      throw new EmbeddingProviderError('invalid_response');
    }

    const embedding = entry.embedding;

    if (!embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new EmbeddingProviderError('invalid_response');
    }

    if (embedding.length !== expectedDimensions) {
      throw new EmbeddingDimensionMismatchError(expectedDimensions, embedding.length);
    }

    ordered.push({ index: entry.index, embedding: embedding as number[] });
  }

  ordered.sort((left, right) => left.index - right.index);

  if (ordered.some((entry, index) => entry.index !== index)) {
    throw new EmbeddingProviderError('invalid_response');
  }

  return ordered.map((entry) => entry.embedding);
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function createOpenRouterEmbeddingClient(
  options: OpenRouterEmbeddingOptions
): EmbeddingClient {
  const apiKey = options.apiKey.trim();
  const modelId = options.modelId.trim();
  const dimensions = options.dimensions;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? OPENROUTER_EMBEDDINGS_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? UNFRAMED_EMBEDDING_TIMEOUT_MS;
  const batchSize = options.batchSize ?? UNFRAMED_EMBEDDING_BATCH_SIZE;

  if (!apiKey) throw new RagConfigurationError('OPENROUTER_API_KEY_missing');
  if (!modelId) throw new RagConfigurationError('embedding_model_missing');
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new RagConfigurationError('embedding_dimensions_invalid');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) {
    throw new RagConfigurationError('embedding_batch_size_invalid');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new RagConfigurationError('embedding_timeout_invalid');
  }

  async function embedBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      if (signal?.aborted) controller.abort();

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          input: texts,
          encoding_format: 'float',
        }),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new EmbeddingProviderError('request_failed', response.status);
      }

      const payload = await response.json().catch(() => null);

      return parseEmbeddingResponse(payload, texts.length, modelId, dimensions);
    } catch (error) {
      if (
        error instanceof EmbeddingProviderError ||
        error instanceof EmbeddingDimensionMismatchError ||
        error instanceof EmbeddingModelMismatchError
      ) {
        throw error;
      }

      if (isAbortError(error) || controller.signal.aborted) {
        throw new EmbeddingTimeoutError();
      }

      throw new EmbeddingProviderError('request_failed');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    modelId,
    dimensions,
    async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
      if (!Array.isArray(texts)) {
        throw new RagConfigurationError('embedding_input_invalid');
      }

      const normalized = texts.map((text) => {
        if (typeof text !== 'string' || text.length === 0) {
          throw new RagConfigurationError('embedding_input_invalid');
        }

        return text;
      });

      const result: number[][] = [];

      for (const batch of batches(normalized, batchSize)) {
        const vectors = await embedBatch(batch, signal);
        result.push(...vectors);
      }

      return result;
    },
  };
}

export function createOpenRouterEmbeddingClientFromEnv(
  env: RagEnvironment = process.env,
  fetchImpl?: FetchLike
): EmbeddingClient {
  const config = resolveUnframedEmbeddingConfig(env);
  const apiKey = (env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey) throw new RagConfigurationError('OPENROUTER_API_KEY_missing');

  return createOpenRouterEmbeddingClient({
    apiKey,
    modelId: config.modelId,
    dimensions: config.dimensions,
    fetchImpl,
  });
}

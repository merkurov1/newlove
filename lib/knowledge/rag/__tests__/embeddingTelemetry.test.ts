/** @jest-environment node */

import { createOpenRouterEmbeddingClient } from '../embeddings';
import { UNFRAMED_EMBEDDING_MODEL } from '../config';

const DIMENSIONS = 4;

function embeddingPayload(texts: number, usage?: Record<string, unknown>) {
  return {
    model: UNFRAMED_EMBEDDING_MODEL,
    data: Array.from({ length: texts }, (_, index) => ({
      object: 'embedding',
      index,
      embedding: Array.from({ length: DIMENSIONS }, () => 0.01),
    })),
    ...(usage ? { usage } : {}),
  };
}

function response(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => payload,
  } as unknown as Response;
}

function fakeStore() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    store: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    } as never,
  };
}

function client(fetchImpl: () => Promise<Response>, telemetry: Record<string, unknown>) {
  return createOpenRouterEmbeddingClient({
    apiKey: 'test-openrouter-key',
    modelId: UNFRAMED_EMBEDDING_MODEL,
    dimensions: DIMENSIONS,
    fetchImpl: fetchImpl as never,
    telemetry: telemetry as never,
  });
}

describe('embedding telemetry', () => {
  it('records one row per embedding request with provider usage and unknown price', async () => {
    const { inserted, store } = fakeStore();
    const embeddings = client(
      async () => response(embeddingPayload(2, { prompt_tokens: 12, total_tokens: 12 })),
      {
        surface: 'brain',
        requestId: 'req-1',
        conversationId: 'conv-1',
        userId: null,
        store,
      }
    );

    const vectors = await embeddings.embed(['first private query', 'second private query']);

    expect(vectors).toHaveLength(2);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      provider: 'openrouter',
      model: UNFRAMED_EMBEDDING_MODEL,
      surface: 'brain',
      request_id: 'req-1',
      conversation_id: 'conv-1',
      ok: true,
      finish_reason: 'embedding',
      input_tokens: 12,
      output_tokens: null,
      total_tokens: 12,
      usage_source: 'partial',
      estimated_cost_usd: null,
      cost_source: 'unknown',
      response_chars: null,
    });
    expect(inserted[0].prompt_chars).toBe(
      'first private query'.length + 'second private query'.length
    );
    expect(JSON.stringify(inserted[0])).not.toContain('first private query');
  });

  it('records a failed attempt without inventing tokens or a zero cost', async () => {
    const { inserted, store } = fakeStore();
    const embeddings = client(async () => response({ error: 'down' }, false, 503), {
      surface: 'brain',
      store,
    });

    await expect(embeddings.embed(['private query'])).rejects.toMatchObject({
      code: 'embedding_provider',
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      ok: false,
      error_code: 'embedding_provider',
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      usage_source: 'unknown',
      estimated_cost_usd: null,
      cost_source: 'unknown',
    });
  });

  it('keeps usage unknown when the provider omits the usage block', async () => {
    const { inserted, store } = fakeStore();
    const embeddings = client(async () => response(embeddingPayload(1)), {
      surface: 'media',
      store,
    });

    await embeddings.embed(['query']);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      surface: 'media',
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      usage_source: 'unknown',
      estimated_cost_usd: null,
      cost_source: 'unknown',
    });
  });

  it('accepts the provider-reported cost when OpenRouter returns one', async () => {
    const { inserted, store } = fakeStore();
    const embeddings = client(
      async () =>
        response(embeddingPayload(1, { prompt_tokens: 8, total_tokens: 8, cost: 0.000004 })),
      { surface: 'brain', store }
    );

    await embeddings.embed(['query']);

    expect(inserted[0]).toMatchObject({
      input_tokens: 8,
      provider_reported_cost_usd: 0.000004,
      estimated_cost_usd: 0.000004,
      cost_source: 'provider_reported',
    });
  });

  it('does not persist when consent denies the store', async () => {
    const { inserted, store } = fakeStore();
    const embeddings = client(
      async () => response(embeddingPayload(1, { prompt_tokens: 3, total_tokens: 3 })),
      {
        surface: 'brain',
        store: null,
      }
    );

    await expect(embeddings.embed(['query'])).resolves.toHaveLength(1);
    expect(inserted).toHaveLength(0);
    expect(store).toBeDefined();
  });
});

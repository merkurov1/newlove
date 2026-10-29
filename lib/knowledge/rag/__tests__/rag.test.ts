import fs from 'node:fs';
import path from 'node:path';

import type { UnframedBuild } from '../../types';
import {
  buildUnframedManifest,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../../unframed';
import type { C4Question } from '../../evaluation/c4/types';
import { isVerifiedOwnerCredential, isVerifiedOwnerUser } from '../authorization';
import {
  isPierrotRagEnabled,
  resolveUnframedEmbeddingConfig,
  resolveUnframedRagThreshold,
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
} from '../config';
import { createOpenRouterEmbeddingClient, type EmbeddingClient } from '../embeddings';
import {
  EmbeddingDimensionMismatchError,
  EmbeddingProviderError,
  KnowledgeDatabaseError,
} from '../errors';
import {
  applyUnframedIngestion,
  buildUnframedIngestionPlan,
  planEmbeddingBatches,
} from '../ingestion';
import {
  cosineSimilarity,
  evaluateSemanticQuestion,
  rankSemantic,
  semanticMetrics,
} from '../evaluation';
import { buildUnframedEvidencePrompt } from '../pierrotContext';
import { retrieveUnframedEvidence } from '../retrieval';
import type { KnowledgeRepository, KnowledgeSearchRow } from '../types';

const env = {
  ...process.env,
  UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL,
};

let build: UnframedBuild;

beforeAll(() => {
  const raw = fs.readFileSync(path.join(process.cwd(), UNFRAMED_SOURCE_PATH), 'utf8');
  build = buildUnframedManifest({
    raw,
    sourcePath: UNFRAMED_SOURCE_PATH,
    expectedSha256: UNFRAMED_EXPECTED_SHA256,
  });
});

function vector(value = 0.1): number[] {
  return Array.from({ length: UNFRAMED_EMBEDDING_DIMENSIONS }, () => value);
}

function embeddingResponse(
  count: number,
  model = UNFRAMED_EMBEDDING_MODEL,
  dimensions = UNFRAMED_EMBEDDING_DIMENSIONS
): unknown {
  return {
    model,
    data: Array.from({ length: count }, (_, index) => ({
      object: 'embedding',
      index,
      embedding: Array.from({ length: dimensions }, () => 0.01),
    })),
  };
}

function response(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response;
}

function fakeEmbeddingClient(): EmbeddingClient {
  return {
    modelId: UNFRAMED_EMBEDDING_MODEL,
    dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    embed: jest.fn(async () => [vector()]),
  };
}

function searchRow(overrides: Partial<KnowledgeSearchRow> = {}): KnowledgeSearchRow {
  return {
    chunk_id: build.chunks[0].id,
    document_id: build.manifest.documentId,
    content: 'retrieved reference text',
    heading: build.chunks[0].heading,
    section_path: build.chunks[0].sectionPath,
    section_index: build.chunks[0].sectionIndex,
    line_start: build.chunks[0].lineStart,
    line_end: build.chunks[0].lineEnd,
    similarity: 0.9,
    ...overrides,
  };
}

type FakeRepository = {
  repository: KnowledgeRepository;
  calls: {
    documents: number;
    chunks: number[][];
    deleted: string[];
  };
};

function fakeRepository(existingIds: string[] = [], failChunks = false): FakeRepository {
  const calls = {
    documents: 0,
    chunks: [] as number[][],
    deleted: [] as string[],
  };

  const repository: KnowledgeRepository = {
    async upsertDocument() {
      calls.documents += 1;
    },
    async upsertChunks(chunks) {
      if (failChunks) throw new KnowledgeDatabaseError('write_failed');
      calls.chunks.push(chunks.map((chunk) => chunk.chunk_index));
    },
    async listChunkIds() {
      return existingIds;
    },
    async deleteChunks(_documentId, chunkIds) {
      calls.deleted.push(...chunkIds);
    },
    async search() {
      return [];
    },
  };

  return { repository, calls };
}

describe('RAG configuration', () => {
  it('defaults the feature flag to off', () => {
    expect(isPierrotRagEnabled({})).toBe(false);
    expect(isPierrotRagEnabled({ PIERROT_RAG_ENABLED: 'false' })).toBe(false);
    expect(isPierrotRagEnabled({ PIERROT_RAG_ENABLED: 'TRUE' })).toBe(true);
  });

  it('limits owner retrieval to verified user identities', () => {
    expect(isVerifiedOwnerUser({ id: 'u1', role: 'ADMIN' })).toBe(true);
    expect(isVerifiedOwnerUser({ id: 'u1', role: 'USER' })).toBe(false);
    expect(isVerifiedOwnerUser(null)).toBe(false);

    expect(isVerifiedOwnerCredential({ id: 'telegram-1', role: 'ADMIN' })).toBe(true);
    expect(isVerifiedOwnerCredential({ id: 'u1', role: 'ADMIN' })).toBe(true);
    expect(isVerifiedOwnerCredential({ id: 'system-admin', role: 'ADMIN' })).toBe(false);
    expect(isVerifiedOwnerCredential({ role: 'ADMIN' })).toBe(false);
    expect(isVerifiedOwnerCredential({ id: 'u1', role: 'USER' })).toBe(false);
  });

  it('requires an explicit verified embedding model', () => {
    expect(() => resolveUnframedEmbeddingConfig({})).toThrow('rag_configuration');
    expect(() =>
      resolveUnframedEmbeddingConfig({ UNFRAMED_EMBEDDING_MODEL: 'unknown/model' })
    ).toThrow('rag_configuration');
    expect(
      resolveUnframedEmbeddingConfig({ UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL })
    ).toEqual({
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
  });

  it('validates the provisional threshold', () => {
    expect(resolveUnframedRagThreshold({})).toBe(0.45);
    expect(resolveUnframedRagThreshold({ UNFRAMED_RAG_MIN_SIMILARITY: '0.6' })).toBe(0.6);
    expect(() => resolveUnframedRagThreshold({ UNFRAMED_RAG_MIN_SIMILARITY: '2' })).toThrow(
      'rag_configuration'
    );
  });
});

describe('OpenRouter embedding client', () => {
  it('batches requests, keeps order, and uses the bearer token', async () => {
    const calls: Array<{ body: Record<string, unknown>; authorization: string }> = [];
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({
        body,
        authorization: String((init?.headers as Record<string, string>).Authorization),
      });
      return response(embeddingResponse((body.input as string[]).length));
    };
    const client = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      batchSize: 2,
      fetchImpl,
    });

    const result = await client.embed(['a', 'b', 'c', 'd', 'e']);

    expect(result).toHaveLength(5);
    expect(calls.map((call) => (call.body.input as string[]).length)).toEqual([2, 2, 1]);
    expect(calls[0].authorization).toBe('Bearer test-key');
    expect(calls[0].body.model).toBe(UNFRAMED_EMBEDDING_MODEL);
    expect(calls[0].body.encoding_format).toBe('float');
  });

  it('fails on a dimension mismatch without echoing input text', async () => {
    const sentinel = 'private manuscript passage';
    const client = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      fetchImpl: async () => response(embeddingResponse(1, UNFRAMED_EMBEDDING_MODEL, 3)),
    });

    await expect(client.embed([sentinel])).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);
    await expect(client.embed([sentinel])).rejects.not.toThrow(sentinel);
  });

  it('accepts the provider model-id casing variant', async () => {
    const client = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      fetchImpl: async () => response(embeddingResponse(1, 'BAAI/bge-m3')),
    });

    await expect(client.embed(['a'])).resolves.toHaveLength(1);
  });

  it('fails on a model mismatch, HTTP error and partial response', async () => {
    const modelMismatch = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      fetchImpl: async () => response(embeddingResponse(1, 'other/model')),
    });
    await expect(modelMismatch.embed(['a'])).rejects.toThrow('embedding_model_mismatch');

    const httpError = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      fetchImpl: async () => response({}, false, 429),
    });
    await expect(httpError.embed(['a'])).rejects.toBeInstanceOf(EmbeddingProviderError);

    const partial = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      fetchImpl: async () => response(embeddingResponse(1)),
    });
    await expect(partial.embed(['a', 'b'])).rejects.toThrow('embedding_provider');
  });

  it('times out without retrying', async () => {
    const fetchImpl = async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const client = createOpenRouterEmbeddingClient({
      apiKey: 'test-key',
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      timeoutMs: 5,
      fetchImpl,
    });

    await expect(client.embed(['a'])).rejects.toThrow('embedding_timeout');
  });
});

describe('deterministic ingestion', () => {
  it('builds a stable plan with frozen metadata', () => {
    const first = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const second = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });

    expect(first.document.source_sha256).toBe(UNFRAMED_EXPECTED_SHA256);
    expect(first.document.access_class).toBe('owner');
    expect(first.document.ingestion_version).toBe('unframed-rag-ingestion-v1');
    expect(first.chunks.length).toBe(build.chunks.length);
    expect(first.chunks[0].content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.chunks.map((chunk) => chunk.id)).toEqual(second.chunks.map((chunk) => chunk.id));
    expect(new Set(first.chunks.map((chunk) => chunk.id)).size).toBe(first.chunks.length);
    expect(first.embeddingInputs[0].text).not.toBe(first.chunks[0].content);
    expect(first.stats.batchCount).toBe(Math.ceil(first.chunks.length / 32));
  });

  it('splits embedding batches deterministically', () => {
    expect(planEmbeddingBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => planEmbeddingBatches([1], 0)).toThrow('ingestion_plan_invalid');
  });

  it('does not write on a dry-run summary', () => {
    const plan = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const { repository, calls } = fakeRepository();

    expect(plan.document.id).toBe(build.manifest.documentId);
    expect(repository).toBeTruthy();
    expect(calls.documents).toBe(0);
    expect(calls.chunks).toHaveLength(0);
  });

  it('rejects embedding count and dimension mismatches before writing', async () => {
    const plan = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const { repository, calls } = fakeRepository();

    await expect(
      applyUnframedIngestion({
        plan,
        embeddings: [vector()],
        repository,
        allowStaleDelete: false,
      })
    ).rejects.toThrow('ingestion_plan_invalid');

    await expect(
      applyUnframedIngestion({
        plan,
        embeddings: plan.chunks.map(() => vector().slice(0, 3)),
        repository,
        allowStaleDelete: false,
      })
    ).rejects.toBeInstanceOf(EmbeddingDimensionMismatchError);

    expect(calls.documents).toBe(0);
    expect(calls.chunks).toHaveLength(0);
  });

  it('re-applies the same plan idempotently', async () => {
    const plan = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const { repository, calls } = fakeRepository(plan.chunks.map((chunk) => chunk.id));

    const summary = await applyUnframedIngestion({
      plan,
      embeddings: plan.chunks.map(() => vector()),
      repository,
      allowStaleDelete: false,
    });

    expect(summary.staleChunkCount).toBe(0);
    expect(summary.deletedChunkCount).toBe(0);
    expect(calls.documents).toBe(1);
    expect(calls.chunks.reduce((sum, batch) => sum + batch.length, 0)).toBe(plan.chunks.length);
    expect(calls.deleted).toHaveLength(0);
  });

  it('upserts in bounded batches and deletes stale rows only when allowed', async () => {
    const plan = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const stale = 'chk_deadbeefdeadbeefdeadbeefdeadbeef';
    const { repository, calls } = fakeRepository([plan.chunks[0].id, stale]);
    const embeddings = plan.chunks.map(() => vector());

    await expect(
      applyUnframedIngestion({
        plan,
        embeddings,
        repository,
        allowStaleDelete: false,
      })
    ).rejects.toThrow('stale_chunks_require_review');

    expect(calls.documents).toBe(0);
    expect(calls.chunks).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);

    const deletion = await applyUnframedIngestion({
      plan,
      embeddings,
      repository,
      allowStaleDelete: true,
    });

    expect(deletion.staleChunkCount).toBe(1);
    expect(deletion.deletedChunkCount).toBe(1);
    expect(calls.deleted).toEqual([stale]);
    expect(calls.chunks.reduce((sum, batch) => sum + batch.length, 0)).toBe(plan.chunks.length);
    expect(calls.chunks.every((batch) => batch.length <= 25)).toBe(true);
  });

  it('fails closed when a database write fails', async () => {
    const plan = buildUnframedIngestionPlan({
      build,
      modelId: UNFRAMED_EMBEDDING_MODEL,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
    });
    const { repository } = fakeRepository([], true);

    await expect(
      applyUnframedIngestion({
        plan,
        embeddings: plan.chunks.map(() => vector()),
        repository,
        allowStaleDelete: true,
      })
    ).rejects.toThrow('database_failed');
  });
});

describe('retrieval scope and fallbacks', () => {
  it('does not call the provider when disabled', async () => {
    const embeddingClient = fakeEmbeddingClient();

    const result = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: false,
      env,
      embeddingClient,
    });

    expect(result.outcome).toBe('unavailable');
    expect(result.code).toBe('disabled');
    expect(embeddingClient.embed).not.toHaveBeenCalled();
  });

  it('never retrieves owner content for an unverified requester', async () => {
    const embeddingClient = fakeEmbeddingClient();
    const search = jest.fn();

    const result = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: false,
      enabled: true,
      env,
      embeddingClient,
      search,
    });

    expect(result.outcome).toBe('unavailable');
    expect(result.code).toBe('unauthorized_scope');
    expect(embeddingClient.embed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it('returns relevant, weak and no-match outcomes', async () => {
    const embeddingClient = fakeEmbeddingClient();
    const rows = [
      searchRow({ similarity: 0.9 }),
      searchRow({ chunk_id: build.chunks[1].id, similarity: 0.6 }),
      searchRow({ chunk_id: build.chunks[2].id, similarity: 0.4 }),
    ];
    const search = jest.fn(async () => rows);

    const relevant = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient,
      search,
      minSimilarity: 0.5,
    });
    expect(relevant.outcome).toBe('relevant_results');
    expect(relevant.hits).toHaveLength(2);

    const weak = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient,
      search,
      minSimilarity: 0.95,
    });
    expect(weak.outcome).toBe('weak_match');
    expect(weak.hits).toHaveLength(0);
    expect(weak.topSimilarity).toBe(0.9);

    const noMatch = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient,
      search: async () => [],
    });
    expect(noMatch.outcome).toBe('no_match');
  });

  it('falls back on provider, database and timeout failures', async () => {
    const failingEmbedding: EmbeddingClient = {
      ...fakeEmbeddingClient(),
      embed: async () => {
        throw new EmbeddingProviderError('request_failed', 500);
      },
    };
    const providerFailure = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: failingEmbedding,
      search: async () => [],
    });
    expect(providerFailure.code).toBe('embedding_failed');

    const databaseFailure = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: fakeEmbeddingClient(),
      search: async () => {
        throw new KnowledgeDatabaseError('query_failed');
      },
    });
    expect(databaseFailure.code).toBe('database_failed');

    const slowEmbedding: EmbeddingClient = {
      ...fakeEmbeddingClient(),
      embed: () => new Promise<number[][]>(() => undefined),
    };
    const timeout = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: slowEmbedding,
      search: async () => [],
      timeoutMs: 5,
    });
    expect(timeout.code).toBe('timeout');
  });

  it('requires explicit model configuration', async () => {
    const result = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env: {},
      embeddingClient: fakeEmbeddingClient(),
      search: async () => [],
    });

    expect(result.outcome).toBe('unavailable');
    expect(result.code).toBe('missing_configuration');
  });

  it('refuses a client whose model or dimensions do not match the index', async () => {
    const wrongModel: EmbeddingClient = {
      ...fakeEmbeddingClient(),
      modelId: 'other/model',
    };
    const modelResult = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: wrongModel,
      search: async () => [],
    });
    expect(modelResult.code).toBe('embedding_model_mismatch');

    const wrongDimensions: EmbeddingClient = {
      ...fakeEmbeddingClient(),
      dimensions: 384,
    };
    const dimensionResult = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: wrongDimensions,
      search: async () => [],
    });
    expect(dimensionResult.code).toBe('embedding_dimension_mismatch');
  });
});

describe('Pierrot evidence prompt', () => {
  it('JSON-encodes evidence and respects the character budget', async () => {
    const result = await retrieveUnframedEvidence({
      query: 'question',
      scope: 'owner',
      ownerAuthorized: true,
      enabled: true,
      env,
      embeddingClient: fakeEmbeddingClient(),
      search: async () => [searchRow({ content: 'Quoted "passage" with\nnewline.' })],
    });

    const prompt = buildUnframedEvidencePrompt(result);

    expect(prompt).toContain('UNFRAMED_RETRIEVAL_CONTEXT');
    expect(prompt).toContain('untrusted reference material');
    expect(prompt).toContain('chunk:');
    expect(prompt).toContain('Quoted \\"passage\\" with\\nnewline.');
    expect(buildUnframedEvidencePrompt(result, 10)).toBeNull();
  });

  it('does not add context for weak or missing evidence', () => {
    const base = {
      hits: [],
      latencyMs: 1,
      topSimilarity: null,
    };

    expect(buildUnframedEvidencePrompt({ ...base, outcome: 'weak_match' })).toBeNull();
    expect(buildUnframedEvidencePrompt({ ...base, outcome: 'no_match' })).toBeNull();
  });
});

describe('semantic evaluation primitives', () => {
  it('computes cosine similarity and deterministic rankings', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);

    const ranked = rankSemantic(
      [1, 0],
      [
        { chunkId: 'a', sectionIndex: 0, embedding: [0, 1] },
        { chunkId: 'b', sectionIndex: 1, embedding: [1, 0] },
      ],
      5
    );

    expect(ranked.map((hit) => hit.chunkId)).toEqual(['b', 'a']);
  });

  it('scores answerable evidence and reports counts', () => {
    const question: C4Question = {
      id: 'q1',
      category: 'direct_factual',
      language: 'en',
      group: 'g1',
      question: 'question',
      answerability: 'answerable',
      relevantChunkIds: [build.chunks[0].id],
    };
    const result = evaluateSemanticQuestion({
      question,
      split: 'dev',
      candidates: [
        {
          chunkId: build.chunks[0].id,
          sectionIndex: build.chunks[0].sectionIndex,
          embedding: [1, 0],
        },
        {
          chunkId: build.chunks[1].id,
          sectionIndex: build.chunks[1].sectionIndex,
          embedding: [0, 1],
        },
      ],
      queryEmbedding: [1, 0],
      build,
    });
    const metrics = semanticMetrics([result]);

    expect(result.recallAt5).toBe(1);
    expect(result.mrr).toBe(1);
    expect(metrics.recallAt5).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(metrics.precisionAt5).toEqual({ numerator: 1, denominator: 5, value: 0.2 });
  });
});

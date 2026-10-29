import fs from 'node:fs/promises';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { C4_QUESTIONS, hashC4QuestionSet } from '@/lib/knowledge/evaluation/c4/questions';
import { hashC4Protocol } from '@/lib/knowledge/evaluation/c4/protocol';
import { splitC4Questions } from '@/lib/knowledge/evaluation/c4/split';
import type { C4Question } from '@/lib/knowledge/evaluation/c4/types';
import {
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
  resolveUnframedEmbeddingConfig,
} from '@/lib/knowledge/rag/config';
import { createOpenRouterEmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import {
  evaluateSemanticQuestion,
  semanticBreakdowns,
  semanticMetrics,
  type SemanticCandidate,
} from '@/lib/knowledge/rag/evaluation';
import { applyUnframedIngestion, buildUnframedIngestionPlan } from '@/lib/knowledge/rag/ingestion';
import { retrieveUnframedEvidence } from '@/lib/knowledge/rag/retrieval';
import { createSupabaseKnowledgeRepository } from '@/lib/knowledge/rag/supabaseStore';
import {
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
  buildUnframedManifest,
} from '@/lib/knowledge/unframed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const EXPECTED_PROJECT_REF = 'txvkqcitalfbjytmnawq';
const EXPECTED_QUESTION_HASH = 'd65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167';
const EXPECTED_PROTOCOL_HASH = 'd2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8';

const DOCUMENT_COLUMNS = '*';

const CHUNK_COLUMNS = [
  'id',
  'document_id',
  'chunk_index',
  'section_index',
  'content_hash',
  'embedding_model',
  'embedding_dimensions',
  'access_class',
  'embedding',
].join(',');

type RunAction = 'preflight' | 'schema' | 'ingest' | 'verify' | 'evaluate';
type EvaluationSplit = 'dev' | 'calibration' | 'test';

type JsonBody = {
  action?: unknown;
  confirm?: unknown;
  split?: unknown;
};

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function fail(code: string, status = 400, extra: Record<string, unknown> = {}): NextResponse {
  return json({ status: 'failed', code, ...extra }, status);
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }

  return 'unknown_error';
}

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function projectCheck(): {
  ok: boolean;
  projectRef: string | null;
  code?: string;
} {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  if (!raw) return { ok: false, projectRef: null, code: 'supabase_url_missing' };

  try {
    const url = new URL(raw);
    const ref = url.hostname.split('.')[0];

    return {
      ok:
        url.protocol === 'https:' &&
        ref === EXPECTED_PROJECT_REF &&
        url.hostname.endsWith('.supabase.co'),
      projectRef: ref,
    };
  } catch {
    return { ok: false, projectRef: null, code: 'supabase_url_invalid' };
  }
}

async function authorize(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) return false;

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return false;

    const user = (await response.json()) as { login?: unknown };
    const expected = (process.env.VERCEL_GIT_REPO_OWNER || 'merkurov1').toLowerCase();

    return typeof user.login === 'string' && user.login.toLowerCase() === expected;
  } catch {
    return false;
  }
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function unitVector(dimensions: number): number[] {
  return Array.from({ length: dimensions }, (_, index) => (index === 0 ? 1 : 0));
}

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
      return null;
    }

    return value as number[];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^\[/, '').replace(/\]$/, '');
    if (!trimmed) return [];

    const parsed = trimmed.split(',').map((part) => Number(part.trim()));
    if (!parsed.every((item) => Number.isFinite(item))) return null;

    return parsed;
  }

  return null;
}

function documentIngestionVersion(document: Record<string, unknown>): string | null {
  if (typeof document.ingestion_version === 'string') return document.ingestion_version;

  const metadata =
    document.metadata && typeof document.metadata === 'object'
      ? (document.metadata as Record<string, unknown>)
      : null;

  return metadata && typeof metadata.ingestion_version === 'string'
    ? metadata.ingestion_version
    : null;
}

function createEmbeddingClient() {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_missing');
  }

  return createOpenRouterEmbeddingClient({
    apiKey,
    modelId: UNFRAMED_EMBEDDING_MODEL,
    dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
  });
}

async function readBuild() {
  const sourcePath = path.resolve(process.cwd(), UNFRAMED_SOURCE_PATH);
  const raw = await fs.readFile(sourcePath, 'utf8');
  const build = buildUnframedManifest({
    raw,
    sourcePath: UNFRAMED_SOURCE_PATH,
    expectedSha256: UNFRAMED_EXPECTED_SHA256,
  });

  if (!Object.values(build.checks).every(Boolean)) {
    throw new Error('parser_checks_failed');
  }

  return build;
}

async function readDocument(store: SupabaseClient, documentId: string) {
  const { data, error } = await store
    .from('knowledge_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle();

  if (error) throw error;

  return data as Record<string, unknown> | null;
}

async function readChunks(store: SupabaseClient, documentId: string) {
  const { data, error } = await store
    .from('knowledge_chunks')
    .select(CHUNK_COLUMNS)
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (error) throw error;

  return Array.isArray(data) ? (data as unknown as Array<Record<string, unknown>>) : [];
}

async function countRows(store: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await store.from(table).select('id', { count: 'exact', head: true });

  if (error) return null;

  return typeof count === 'number' ? count : null;
}

async function checkAnonymousAccess(): Promise<{
  status: 'closed' | 'open' | 'not_verified';
  tableStatus: number | null;
  rpcStatus: number | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { status: 'not_verified', tableStatus: null, rpcStatus: null };
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };

  const [tableResponse, rpcResponse] = await Promise.all([
    fetch(`${url}/rest/v1/knowledge_documents?select=id&limit=1`, {
      headers,
      cache: 'no-store',
    }).catch(() => null),
    fetch(`${url}/rest/v1/rpc/knowledge_search_unframed`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({
        p_query_embedding: vectorLiteral(unitVector(UNFRAMED_EMBEDDING_DIMENSIONS)),
        p_model_id: UNFRAMED_EMBEDDING_MODEL,
        p_dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
        p_access_class: 'owner',
        p_document_id: 'doc_unframed_manuscript',
        p_match_count: 1,
        p_min_similarity: -1,
      }),
    }).catch(() => null),
  ]);

  const tableStatus = tableResponse?.status ?? null;
  const rpcStatus = rpcResponse?.status ?? null;
  const closed = (status: number | null) => status === 401 || status === 403 || status === 404;

  return {
    status: closed(tableStatus) && closed(rpcStatus) ? 'closed' : 'open',
    tableStatus,
    rpcStatus,
  };
}

async function probeSchema() {
  const store = getServiceClient();

  if (!store) {
    return { status: 'blocked' as const, code: 'supabase_configuration_missing' };
  }

  const expected: Record<string, string[]> = {
    knowledge_documents: [
      'id',
      'title',
      'source_path',
      'source_sha256',
      'manifest_hash',
      'parser_version',
      'chunker_version',
      'ingestion_version',
      'embedding_model',
      'embedding_dimensions',
      'access_class',
      'chunk_count',
      'source_char_count',
      'metadata',
      'created_at',
      'updated_at',
    ],
    knowledge_chunks: [
      'id',
      'document_id',
      'embedding_model',
      'embedding_dimensions',
      'chunk_index',
      'content',
      'content_hash',
      'heading',
      'section_path',
      'section_index',
      'char_start',
      'char_end',
      'line_start',
      'line_end',
      'access_class',
      'embedding',
      'metadata',
      'created_at',
      'updated_at',
    ],
  };

  const result: Record<string, { present: string[]; missing: string[] }> = {};

  for (const [table, columns] of Object.entries(expected)) {
    const present: string[] = [];
    const missing: string[] = [];

    for (const column of columns) {
      const { error } = await store.from(table).select(column).limit(0);

      if (error) missing.push(column);
      else present.push(column);
    }

    result[table] = { present, missing };
  }

  return { status: 'ok' as const, tables: result };
}

async function buildPreflight() {
  const env = {
    openRouterKey: Boolean((process.env.OPENROUTER_API_KEY || '').trim()),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    publicRagEnabled: (process.env.PIERROT_RAG_ENABLED || '').trim().toLowerCase() === 'true',
  };

  const project = projectCheck();
  const check = {
    project: project.ok,
    env: env.openRouterKey && env.serviceRoleKey,
    source: false,
    manifest: false,
    model: false,
    tables: false,
    rpc: false,
    idempotency: false,
  };

  if (!project.ok) {
    return {
      status: 'blocked' as const,
      code: project.code || 'supabase_project_mismatch',
      check,
      env,
      project,
    };
  }

  let build;
  try {
    build = await readBuild();
    check.source = build.manifest.sourceSha256 === UNFRAMED_EXPECTED_SHA256;
    check.manifest = build.chunks.length === 169;
  } catch (error) {
    return {
      status: 'blocked' as const,
      code: errorCode(error),
      check,
      env,
      project,
    };
  }

  let config;
  try {
    config = resolveUnframedEmbeddingConfig({
      UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL,
    });
    check.model =
      config.modelId === UNFRAMED_EMBEDDING_MODEL &&
      config.dimensions === UNFRAMED_EMBEDDING_DIMENSIONS;
  } catch (error) {
    return {
      status: 'blocked' as const,
      code: errorCode(error),
      check,
      env,
      project,
    };
  }

  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });

  const store = getServiceClient();
  const repository = createSupabaseKnowledgeRepository(process.env);

  if (!store || !repository) {
    return {
      status: 'blocked' as const,
      code: 'supabase_configuration_missing',
      check,
      env,
      project,
      plan: {
        chunks: plan.chunks.length,
        sourceSha256: plan.document.source_sha256,
        manifestHash: plan.document.manifest_hash,
      },
    };
  }

  try {
    const document = await readDocument(store, plan.document.id);
    const chunks = await readChunks(store, plan.document.id);
    const documentCount = await countRows(store, 'knowledge_documents');
    const chunkCount = await countRows(store, 'knowledge_chunks');
    const expectedIds = new Set(plan.chunks.map((chunk) => chunk.id));
    const existingIds = new Set(chunks.map((chunk) => String(chunk.id)));
    const missingIds = plan.chunks
      .filter((chunk) => !existingIds.has(chunk.id))
      .map((chunk) => chunk.id);
    const staleIds = chunks.map((chunk) => String(chunk.id)).filter((id) => !expectedIds.has(id));

    check.tables = documentCount !== null && chunkCount !== null;
    check.idempotency = staleIds.length === 0 && (documentCount ?? 0) <= 1;
  } catch (error) {
    return {
      status: 'blocked' as const,
      code: errorCode(error),
      phase: 'table_probe',
      error: error instanceof Error ? error.message : 'unknown',
      check,
      env,
      project,
      plan: {
        chunks: plan.chunks.length,
        sourceSha256: plan.document.source_sha256,
        manifestHash: plan.document.manifest_hash,
      },
    };
  }

  const document = await readDocument(store, plan.document.id);
  const chunks = await readChunks(store, plan.document.id);
  const documentCount = await countRows(store, 'knowledge_documents');
  const chunkCount = await countRows(store, 'knowledge_chunks');
  const expectedIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const existingIds = new Set(chunks.map((chunk) => String(chunk.id)));
  const missingIds = plan.chunks
    .filter((chunk) => !existingIds.has(chunk.id))
    .map((chunk) => chunk.id);
  const staleIds = chunks.map((chunk) => String(chunk.id)).filter((id) => !expectedIds.has(id));

  let rpcOk = false;
  try {
    await repository.search({
      queryEmbedding: unitVector(UNFRAMED_EMBEDDING_DIMENSIONS),
      modelId: config.modelId,
      dimensions: config.dimensions,
      accessClass: 'owner',
      documentId: plan.document.id,
      topK: 1,
      minSimilarity: -1,
    });
    rpcOk = true;
  } catch {
    rpcOk = false;
  }

  check.rpc = rpcOk;
  const anonymous = await checkAnonymousAccess();

  const alreadyIndexed =
    document !== null &&
    documentCount === 1 &&
    chunkCount === plan.chunks.length &&
    missingIds.length === 0 &&
    staleIds.length === 0 &&
    document.source_sha256 === plan.document.source_sha256 &&
    document.manifest_hash === plan.document.manifest_hash;

  const canIngest =
    check.project &&
    check.env &&
    check.source &&
    check.manifest &&
    check.model &&
    check.tables &&
    check.rpc &&
    check.idempotency &&
    staleIds.length === 0 &&
    (documentCount ?? 0) <= 1 &&
    (!document || document.id === plan.document.id);

  return {
    status: canIngest ? ('ok' as const) : ('blocked' as const),
    code: canIngest ? undefined : 'preflight_failed',
    check,
    env,
    project,
    plan: {
      documentId: plan.document.id,
      chunks: plan.chunks.length,
      batches: plan.stats.batchCount,
      sourceSha256: plan.document.source_sha256,
      manifestHash: plan.document.manifest_hash,
      parserVersion: plan.document.parser_version,
      chunkerVersion: plan.document.chunker_version,
      embeddingModel: plan.document.embedding_model,
      embeddingDimensions: plan.document.embedding_dimensions,
    },
    database: {
      documentCount,
      chunkCount,
      documentPresent: Boolean(document),
      missingChunkCount: missingIds.length,
      staleChunkCount: staleIds.length,
      alreadyIndexed,
    },
    anonymousAccess: anonymous,
    publicRagEnabled: env.publicRagEnabled,
    canIngest,
    alreadyIndexed,
  };
}

async function verifyIndex() {
  const build = await readBuild();
  const config = resolveUnframedEmbeddingConfig({
    UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL,
  });
  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });
  const store = getServiceClient();
  const repository = createSupabaseKnowledgeRepository(process.env);

  if (!store || !repository) {
    return { status: 'blocked' as const, code: 'supabase_configuration_missing' };
  }

  const document = await readDocument(store, plan.document.id);
  const chunks = await readChunks(store, plan.document.id);
  const documentCount = await countRows(store, 'knowledge_documents');
  const chunkCount = await countRows(store, 'knowledge_chunks');
  const expectedIds = new Set(plan.chunks.map((chunk) => chunk.id));
  const ids = chunks.map((chunk) => String(chunk.id));
  const idSet = new Set(ids);
  const missing = plan.chunks.filter((chunk) => !idSet.has(chunk.id)).map((chunk) => chunk.id);
  const extra = ids.filter((id) => !expectedIds.has(id));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const badEmbeddings = chunks
    .filter((chunk) => {
      const vector = parseVector(chunk.embedding);
      return (
        !vector ||
        vector.length !== UNFRAMED_EMBEDDING_DIMENSIONS ||
        !vector.some((value) => value !== 0)
      );
    })
    .map((chunk) => String(chunk.id));
  const badReferences = chunks
    .filter((chunk) => chunk.document_id !== plan.document.id)
    .map((chunk) => String(chunk.id));

  const metadataMatches =
    document !== null &&
    document.source_sha256 === plan.document.source_sha256 &&
    document.manifest_hash === plan.document.manifest_hash &&
    document.source_path === plan.document.source_path &&
    document.parser_version === plan.document.parser_version &&
    document.chunker_version === plan.document.chunker_version &&
    documentIngestionVersion(document) === plan.document.ingestion_version &&
    document.embedding_model === plan.document.embedding_model &&
    document.embedding_dimensions === plan.document.embedding_dimensions &&
    document.access_class === 'owner' &&
    document.chunk_count === plan.chunks.length;

  const checks = {
    documentCountIsOne: documentCount === 1,
    chunkCountIsExpected: chunkCount === plan.chunks.length && chunks.length === plan.chunks.length,
    metadataMatches,
    noMissing: missing.length === 0,
    noExtra: extra.length === 0,
    noDuplicates: duplicateIds.length === 0,
    embeddingsValid: badEmbeddings.length === 0,
    referencesValid: badReferences.length === 0,
  };

  let retrievalSmoke: unknown = { status: 'not_run' };
  try {
    const embeddingClient = createEmbeddingClient();
    const searches = await Promise.all([
      retrieveUnframedEvidence({
        query: 'What does UNFRAMED say about the line?',
        scope: 'owner',
        ownerAuthorized: true,
        enabled: true,
        embeddingClient,
        search: repository.search,
        topK: 3,
        minSimilarity: -1,
      }),
      retrieveUnframedEvidence({
        query: 'Что UNFRAMED говорит о линии?',
        scope: 'owner',
        ownerAuthorized: true,
        enabled: true,
        embeddingClient,
        search: repository.search,
        topK: 3,
        minSimilarity: -1,
      }),
    ]);

    retrievalSmoke = searches.map((result) => ({
      outcome: result.outcome,
      hits: result.hits.length,
      topSimilarity: result.topSimilarity,
      top: result.hits.slice(0, 3).map((hit) => ({
        chunkId: hit.chunkId,
        heading: hit.heading,
        sectionIndex: hit.sectionIndex,
        similarity: hit.similarity,
      })),
      code: result.code ?? null,
    }));
  } catch (error) {
    retrievalSmoke = { status: 'failed', code: errorCode(error) };
  }

  const anonymous = await checkAnonymousAccess();

  return {
    status: Object.values(checks).every(Boolean) ? ('ok' as const) : ('failed' as const),
    code: Object.values(checks).every(Boolean) ? undefined : 'integrity_check_failed',
    checks,
    plan: {
      documentId: plan.document.id,
      chunks: plan.chunks.length,
      sourceSha256: plan.document.source_sha256,
      manifestHash: plan.document.manifest_hash,
      parserVersion: plan.document.parser_version,
      chunkerVersion: plan.document.chunker_version,
      embeddingModel: plan.document.embedding_model,
      embeddingDimensions: plan.document.embedding_dimensions,
    },
    database: {
      documentCount,
      chunkCount,
      missing: missing.length,
      extra: extra.length,
      duplicateIds: duplicateIds.length,
      badEmbeddings: badEmbeddings.length,
      badReferences: badReferences.length,
    },
    retrievalSmoke,
    anonymousAccess: anonymous,
    publicRagEnabled: (process.env.PIERROT_RAG_ENABLED || '').trim().toLowerCase() === 'true',
  };
}

async function ingestIndex() {
  const preflight = await buildPreflight();

  if (preflight.status !== 'ok' || !preflight.canIngest) {
    return {
      status: 'blocked' as const,
      code: preflight.code || 'preflight_failed',
      preflight,
    };
  }

  if (preflight.alreadyIndexed) {
    return {
      status: 'already_indexed' as const,
      preflight,
      verify: await verifyIndex(),
    };
  }

  const build = await readBuild();
  const config = resolveUnframedEmbeddingConfig({
    UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL,
  });
  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });
  const repository = createSupabaseKnowledgeRepository(process.env);

  if (!repository) {
    return { status: 'blocked' as const, code: 'supabase_configuration_missing' };
  }

  const embeddingClient = createEmbeddingClient();
  const embeddings = await embeddingClient.embed(plan.embeddingInputs.map((item) => item.text));
  const summary = await applyUnframedIngestion({
    plan,
    embeddings,
    repository,
    allowStaleDelete: false,
  });

  return {
    status: 'ingested' as const,
    summary,
    embeddingRequests: plan.stats.batchCount,
    verify: await verifyIndex(),
  };
}

function questionEmbeddingRequests(questions: C4Question[]): number {
  return Math.ceil(questions.length / 32);
}

async function evaluateSplit(splitName: EvaluationSplit) {
  const build = await readBuild();
  const config = resolveUnframedEmbeddingConfig({
    UNFRAMED_EMBEDDING_MODEL: UNFRAMED_EMBEDDING_MODEL,
  });
  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });
  const store = getServiceClient();

  if (!store) {
    return { status: 'blocked' as const, code: 'supabase_configuration_missing' };
  }

  const chunks = await readChunks(store, plan.document.id);

  if (chunks.length !== plan.chunks.length) {
    return {
      status: 'blocked' as const,
      code: 'index_incomplete',
      chunks: chunks.length,
      expected: plan.chunks.length,
    };
  }

  const candidates: SemanticCandidate[] = [];

  for (const chunk of chunks) {
    const embedding = parseVector(chunk.embedding);

    if (!embedding || embedding.length !== UNFRAMED_EMBEDDING_DIMENSIONS) {
      return { status: 'blocked' as const, code: 'embedding_invalid' };
    }

    candidates.push({
      chunkId: String(chunk.id),
      sectionIndex: Number(chunk.section_index),
      embedding,
    });
  }

  const questionHash = hashC4QuestionSet(C4_QUESTIONS);
  const protocolHash = hashC4Protocol();

  if (questionHash !== EXPECTED_QUESTION_HASH || protocolHash !== EXPECTED_PROTOCOL_HASH) {
    return { status: 'blocked' as const, code: 'frozen_artifact_hash_mismatch' };
  }

  const split = splitC4Questions(C4_QUESTIONS);
  const questions = split[splitName];
  const embeddingClient = createEmbeddingClient();
  const questionEmbeddings = await embeddingClient.embed(
    questions.map((question) => question.question)
  );

  if (questionEmbeddings.length !== questions.length) {
    return { status: 'blocked' as const, code: 'embedding_count_mismatch' };
  }

  const results = questions.map((question, index) =>
    evaluateSemanticQuestion({
      question,
      split: splitName,
      candidates,
      queryEmbedding: questionEmbeddings[index],
      build,
      topK: 5,
    })
  );

  return {
    status: 'ok' as const,
    mode: 'semantic_retrieval',
    split: splitName,
    questionCount: questions.length,
    embeddingRequests: questionEmbeddingRequests(questions),
    questionSetHash: questionHash,
    protocolHash,
    model: {
      id: config.modelId,
      dimensions: config.dimensions,
    },
    metrics: semanticMetrics(results),
    byLanguage: semanticBreakdowns(results),
    generationEvaluation: 'not_available_in_existing_d2_harness',
    caveat:
      'Semantic similarity is not answer quality. Held-out test was evaluated on request; no generation model was called.',
  };
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return fail('unauthorized', 401);
  }

  const body = (await request.json().catch(() => ({}))) as JsonBody;
  const action = body.action;

  if (
    action !== 'preflight' &&
    action !== 'schema' &&
    action !== 'ingest' &&
    action !== 'verify' &&
    action !== 'evaluate'
  ) {
    return fail('action_invalid', 400);
  }

  try {
    if (action === 'preflight') {
      return json(await buildPreflight());
    }

    if (action === 'schema') {
      return json(await probeSchema());
    }

    if (action === 'ingest') {
      if (body.confirm !== 'INGEST_PAID_EMBEDDING') {
        return fail('confirmation_required', 400);
      }

      return json(await ingestIndex());
    }

    if (action === 'verify') {
      return json(await verifyIndex());
    }

    if (body.confirm !== 'EVALUATE_PAID_EMBEDDING') {
      return fail('confirmation_required', 400);
    }

    const split = body.split;

    if (split !== 'dev' && split !== 'calibration' && split !== 'test') {
      return fail('split_invalid', 400);
    }

    return json(await evaluateSplit(split));
  } catch (error) {
    console.error('[UNFRAMED RAG production action failed]', {
      action,
      code: errorCode(error),
    });

    return fail(errorCode(error), 500);
  }
}

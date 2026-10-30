import { graphChatJson } from './deepseek';
import {
  BRAIN_GRAPH_EXTRACTOR_VERSION,
  extractDocumentGraph,
} from './extractor';
import {
  clampConfidence,
  cleanEntityName,
  entityId,
  normalizeEntityName,
  relationshipId,
  safeText,
} from './normalize';
import {
  computeGraphProgress,
  graphRunStatus,
  type BrainGraphStore,
} from './store';
import type {
  BrainDocumentForGraph,
  BrainEntityType,
  BrainGraphJob,
  BrainGraphProgress,
  BrainGraphRun,
  BrainGraphRunStatus,
  DocumentExtraction,
} from './types';

type ChatJson = (system: string, user: string) => Promise<unknown>;

export type GraphProcessResult =
  | {
      state: 'processed';
      job: BrainGraphJob;
      progress: BrainGraphProgress;
      runStatus: BrainGraphRunStatus;
      documentId: string;
      skipped: boolean;
      entityCount: number;
      relationshipCount: number;
    }
  | {
      state: 'waiting';
      progress: BrainGraphProgress;
      runStatus: BrainGraphRunStatus;
    }
  | {
      state: 'done';
      progress: BrainGraphProgress;
      runStatus: BrainGraphRunStatus;
    }
  | {
      state: 'paused';
      progress: BrainGraphProgress;
      runStatus: BrainGraphRunStatus;
    };

export function documentContentHash(document: BrainDocumentForGraph): string {
  return document.content_hash || document.source_sha256;
}

export function documentNeedsExtraction(input: {
  document: BrainDocumentForGraph;
  extraction: Record<string, unknown> | null;
  extractorVersion: string;
}): boolean {
  if (!input.extraction) return true;

  return !(
    input.extraction.status === 'completed' &&
    input.extraction.extractor_version === input.extractorVersion &&
    input.extraction.content_hash === documentContentHash(input.document)
  );
}

export async function createGraphRun(input: {
  store: BrainGraphStore;
  documents: BrainDocumentForGraph[];
  extractorVersion?: string;
  model: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  run: BrainGraphRun | null;
  jobs: BrainGraphJob[];
  skippedDocumentIds: string[];
}> {
  const extractorVersion = input.extractorVersion || BRAIN_GRAPH_EXTRACTOR_VERSION;
  const extractions = await input.store.listDocumentExtractions();
  const byDocument = new Map(
    extractions.map((row) => [String(row.document_id), row])
  );
  const needs: Array<{ documentId: string; contentHash: string }> = [];
  const skippedDocumentIds: string[] = [];

  for (const document of input.documents) {
    if (
      documentNeedsExtraction({
        document,
        extraction: byDocument.get(document.id) || null,
        extractorVersion,
      })
    ) {
      needs.push({
        documentId: document.id,
        contentHash: documentContentHash(document),
      });
    } else {
      skippedDocumentIds.push(document.id);
    }
  }

  if (needs.length === 0) {
    return { run: null, jobs: [], skippedDocumentIds };
  }

  const run = await input.store.createRun({
    extractorVersion,
    model: input.model,
    totalDocuments: needs.length,
    metadata: {
      ...(input.metadata || {}),
      skippedDocuments: skippedDocumentIds.length,
    },
  });

  const jobs = await input.store.insertJobs(run.id, needs);

  await input.store.updateRun(run.id, {
    skipped_documents: skippedDocumentIds.length,
  });

  return { run, jobs, skippedDocumentIds };
}

export function buildGraphPayload(extraction: DocumentExtraction, chunks: Array<{ id: string; section_path: string[] }>) {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const entities = new Map<
    string,
    {
      id: string;
      entity_type: string;
      canonical_name: string;
      normalized_name: string;
      description: string | null;
      aliases: string[];
      confidence: number;
      metadata: Record<string, unknown>;
    }
  >();
  const mentions: Array<Record<string, unknown>> = [];
  const topicWeights = new Map<string, number>();

  const ensureEntity = (
    name: string,
    type: string,
    confidence: number,
    description: string | null = null,
    aliases: string[] = []
  ) => {
    const canonical = cleanEntityName(name);
    const normalized = normalizeEntityName(canonical);

    if (!canonical || !normalized) return null;

    const id = entityId(type as BrainEntityType, normalized);
    const existing = entities.get(id);

    entities.set(id, {
      id,
      entity_type: type,
      canonical_name: existing && existing.canonical_name.length > canonical.length
        ? existing.canonical_name
        : canonical,
      normalized_name: normalized,
      description: existing?.description || description,
      aliases: Array.from(new Set([...(existing?.aliases || []), ...aliases])).slice(0, 10),
      confidence: Math.max(existing?.confidence || 0, confidence),
      metadata: {},
    });

    topicWeights.set(id, (topicWeights.get(id) || 0) + 1);

    return { id, normalized, canonical };
  };

  for (const entity of extraction.entities) {
    const ensured = ensureEntity(
      entity.name,
      entity.type,
      entity.confidence,
      entity.description,
      entity.aliases
    );

    if (!ensured) continue;

    const chunk = chunkById.get(entity.chunkId);
    const sectionPath = chunk?.section_path || [];

    mentions.push({
      entity_id: ensured.id,
      chunk_id: entity.chunkId,
      section_path: sectionPath,
      mention_text: entity.name.slice(0, 500),
      evidence: entity.evidence,
      confidence: entity.confidence,
    });
  }

  const relationships: Array<Record<string, unknown>> = [];

  for (const relationship of extraction.relationships) {
    const source = ensureEntity(
      relationship.sourceName,
      relationship.sourceType,
      relationship.confidence
    );
    const target = ensureEntity(
      relationship.targetName,
      relationship.targetType,
      relationship.confidence
    );

    if (!source || !target) continue;

    relationships.push({
      id: relationshipId({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        relationType: relationship.relationType,
        chunkId: relationship.chunkId,
      }),
      source_entity_id: source.id,
      target_entity_id: target.id,
      relation_type: relationship.relationType,
      confidence: clampConfidence(relationship.confidence, 0.5),
      chunk_id: relationship.chunkId,
      evidence: safeText(relationship.evidence, 1000) || relationship.evidence.slice(0, 1000),
      inference: relationship.inference,
      metadata: {},
    });
  }

  return {
    entities: Array.from(entities.values()),
    mentions,
    relationships,
    topics: Array.from(topicWeights.entries()).map(([id, weight]) => ({
      entity_id: id,
      weight,
    })),
  };
}

async function finalizeRun(
  store: BrainGraphStore,
  runId: string,
  jobs: BrainGraphJob[]
): Promise<{ progress: BrainGraphProgress; runStatus: BrainGraphRunStatus }> {
  const progress = computeGraphProgress(jobs);
  const run = await store.getRun(runId);

  if (!run) throw new Error('brain_graph_run_not_found');

  if (run.status === 'paused' || run.status === 'cancelled') {
    return { progress, runStatus: run.status };
  }

  const runStatus = progress.done ? graphRunStatus(progress) : 'running';

  await store.updateRun(runId, {
    status: runStatus,
    completed_documents: progress.completed,
    failed_documents: progress.failed,
    skipped_documents: progress.skipped,
    ...(progress.done ? { completed_at: new Date().toISOString() } : {}),
  });

  return { progress, runStatus };
}

export async function processNextGraphJob(input: {
  runId: string;
  store: BrainGraphStore;
  workerId?: string;
  extractorVersion?: string;
  model: string;
  chatJson?: ChatJson;
}): Promise<GraphProcessResult> {
  const { store, runId } = input;
  const extractorVersion = input.extractorVersion || BRAIN_GRAPH_EXTRACTOR_VERSION;
  const run = await store.getRun(runId);

  if (!run) throw new Error('brain_graph_run_not_found');

  await store.reclaimStaleJobs(runId);

  let jobs = await store.getJobs(runId);
  let progress = computeGraphProgress(jobs);

  if (run.status === 'paused' || run.status === 'cancelled') {
    return { state: 'paused', progress, runStatus: run.status };
  }

  const job = await store.claimNextJob(runId, input.workerId || `graph-${Date.now()}`);

  if (!job) {
    jobs = await store.getJobs(runId);
    progress = computeGraphProgress(jobs);

    if (progress.done) {
      const finalized = await finalizeRun(store, runId, jobs);
      return { state: 'done', ...finalized };
    }

    return { state: 'waiting', progress, runStatus: 'running' };
  }

  const chatJson = input.chatJson || graphChatJson;
  let skipped = false;
  let entityCount = 0;
  let relationshipCount = 0;

  try {
    const document = await store.getDocument(job.document_id);

    if (!document) throw new Error('document_not_found');

    const contentHash = documentContentHash(document);
    const previous = await store.getDocumentExtraction(job.document_id);

    if (
      previous &&
      previous.status === 'completed' &&
      previous.extractor_version === extractorVersion &&
      previous.content_hash === contentHash
    ) {
      skipped = true;
      entityCount = Number(previous.entity_count) || 0;
      relationshipCount = Number(previous.relationship_count) || 0;

      await store.updateJob(job.id, {
        status: 'skipped',
        error_code: null,
        error_detail: null,
        locked_at: null,
        worker_id: null,
        completed_at: new Date().toISOString(),
      });
    } else {
      await store.recordExtraction({
        documentId: document.id,
        contentHash,
        extractorVersion,
        status: 'processing',
        chunkCount: document.chunk_count,
      });

      const chunks = await store.getChunks(document.id);

      if (chunks.length === 0) {
        throw new Error('document_has_no_chunks');
      }

      const extraction = await extractDocumentGraph({ document, chunks }, chatJson);
      const payload = buildGraphPayload(
        extraction,
        chunks.map((chunk) => ({ id: chunk.id, section_path: chunk.section_path }))
      );
      const counts = await store.replaceDocumentGraph({
        documentId: document.id,
        extractorVersion,
        entities: payload.entities,
        mentions: payload.mentions,
        relationships: payload.relationships,
        topics: payload.topics,
      });

      entityCount = counts.entities;
      relationshipCount = counts.relationships;

      await store.recordExtraction({
        documentId: document.id,
        contentHash,
        extractorVersion,
        status: 'completed',
        entityCount,
        relationshipCount,
        mentionCount: counts.mentions,
        chunkCount: chunks.length,
        metadata: {
          batches: extraction.batches,
          extractor: 'brain-graph-v1',
        },
      });

      await store.updateJob(job.id, {
        status: 'completed',
        error_code: null,
        error_detail: null,
        locked_at: null,
        worker_id: null,
        completed_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'graph_extraction_failed';
    const canRetry = job.attempts < job.max_attempts;

    await store.updateJob(job.id, {
      status: canRetry ? 'queued' : 'failed',
      error_code: code.startsWith('deepseek_') || code === 'document_has_no_chunks'
        ? code
        : 'graph_extraction_failed',
      error_detail: canRetry
        ? 'Transient extraction failure; the document was requeued.'
        : 'Document extraction failed.',
      locked_at: null,
      worker_id: null,
      completed_at: canRetry ? null : new Date().toISOString(),
    });

    try {
      await store.recordExtraction({
        documentId: job.document_id,
        contentHash: job.content_hash || '',
        extractorVersion,
        status: canRetry ? 'queued' : 'failed',
        errorCode: 'graph_extraction_failed',
        errorDetail: canRetry
          ? 'Transient extraction failure; the document was requeued.'
          : 'Document extraction failed.',
      });
    } catch {
      // Job state is authoritative; extraction state is best effort.
    }
  }

  jobs = await store.getJobs(runId);
  const finalized = await finalizeRun(store, runId, jobs);
  const processed = jobs.find((entry) => entry.id === job.id) || job;

  return {
    state: 'processed',
    job: processed,
    progress: finalized.progress,
    runStatus: finalized.runStatus,
    documentId: job.document_id,
    skipped,
    entityCount,
    relationshipCount,
  };
}

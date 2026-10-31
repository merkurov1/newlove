import { createHash } from 'node:crypto';

import { isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';
import {
  analyzeMediaDocument,
  buildDocumentText,
  MEDIA_ANALYZER_VERSION,
} from '@/lib/knowledge/media/intelligence';
import { deriveMediaRelations } from '@/lib/knowledge/media/relations';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRetryableCode(code: string): boolean {
  return (
    code.startsWith('deepseek_') ||
    code.startsWith('media_analysis_llm') ||
    code.includes('timeout') ||
    code.includes('rate_limit') ||
    code === 'media_analysis_failed'
  );
}

export type RunMediaAnalysisResult = {
  runId: string;
  skipped: boolean;
  quoteCount: number;
  topicCount: number;
  relationCount: number;
  rejectedCandidateCount: number;
};

export async function runMediaAnalysis(input: {
  mediaRecordId: string;
  force?: boolean;
  model?: string;
  /** Set when this run was atomically claimed from the queue. */
  runId?: string;
}): Promise<RunMediaAnalysisResult> {
  if (!isGraphLlmConfigured()) {
    throw new Error('media_analysis_not_configured');
  }

  const store = createMediaAnalysisStore();

  if (!store) throw new Error('media_analysis_database_unavailable');

  const loaded = await store.loadInput(input.mediaRecordId);

  if (!loaded) throw new Error('media_analysis_record_not_found');

  if (loaded.chunks.length === 0) {
    throw new Error('media_analysis_no_chunks');
  }

  const documentText = buildDocumentText(loaded.chunks);
  const contentHash = loaded.document.content_hash || sha256(documentText);
  const model =
    input.model ||
    process.env.MEDIA_ANALYSIS_MODEL ||
    process.env.BRAIN_GRAPH_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    'deepseek-chat';

  if (!input.runId && !input.force) {
    const runs = await store.listRuns(input.mediaRecordId);
    const latest = runs.find(
      (run) =>
        run.status === 'completed' &&
        run.analyzer_version === MEDIA_ANALYZER_VERSION &&
        run.content_hash === contentHash
    );

    if (latest) {
      return {
        runId: latest.id,
        skipped: true,
        quoteCount: latest.quote_count,
        topicCount: latest.topic_count,
        relationCount: latest.relation_count,
        rejectedCandidateCount: latest.rejected_candidate_count,
      };
    }
  }

  const run = input.runId
    ? (await store.markRunProcessing(input.runId, {
        contentHash,
        analyzerVersion: MEDIA_ANALYZER_VERSION,
        model,
      }),
      { id: input.runId })
    : await store.createRun({
        mediaRecordId: input.mediaRecordId,
        documentId: loaded.document.id,
        contentHash,
        analyzerVersion: MEDIA_ANALYZER_VERSION,
        model,
        forceRefresh: Boolean(input.force),
      });

  try {
    const result = await analyzeMediaDocument({
      title: loaded.mediaRecord.title,
      outlet: loaded.mediaRecord.outlet,
      language: loaded.document.language || loaded.mediaRecord.lang,
      kind: loaded.mediaRecord.kind,
      chunks: loaded.chunks,
    });

    const context = await store.loadRelationContext(input.mediaRecordId);
    const current = {
      id: loaded.mediaRecord.id,
      title: loaded.mediaRecord.title,
      outlet: loaded.mediaRecord.outlet,
      kind: loaded.mediaRecord.kind,
      publishedDate: loaded.mediaRecord.published_date,
      topic: result.topics?.primaryTopic || loaded.mediaRecord.topic,
      subtopics: result.topics?.subtopics || [],
      contentHash,
      quoteHashes: result.quotes.map((quote) => quote.quoteHash),
    };
    const relations = deriveMediaRelations(current, context.others);

    await store.supersedeCurrent(input.mediaRecordId);
    await store.saveResult({
      runId: run.id,
      mediaRecordId: input.mediaRecordId,
      documentId: loaded.document.id,
      sourceContentHash: contentHash,
      result,
    });
    await store.saveRelations({
      runId: run.id,
      mediaRecordId: input.mediaRecordId,
      candidates: relations,
    });
    await store.completeRun(run.id, result, relations.length, {
      title: loaded.mediaRecord.title,
      outlet: loaded.mediaRecord.outlet,
      canonical_url: loaded.mediaRecord.canonical_url,
      document_id: loaded.document.id,
      content_hash: contentHash,
    });

    return {
      runId: run.id,
      skipped: false,
      quoteCount: result.quotes.length,
      topicCount: result.topics ? 1 : 0,
      relationCount: relations.length,
      rejectedCandidateCount: result.rejectedCandidateCount,
    };
  } catch (error) {
    const code =
      error instanceof Error &&
      (error.message.startsWith('media_analysis_') ||
        error.message.startsWith('deepseek_'))
        ? error.message
        : 'media_analysis_failed';

    await store
      .failRun(
        run.id,
        code,
        error instanceof Error ? error.message.slice(0, 1000) : 'Media analysis failed',
        { retryable: Boolean(input.runId) && isRetryableCode(code) }
      )
      .catch(() => undefined);

    throw new Error(code);
  }
}

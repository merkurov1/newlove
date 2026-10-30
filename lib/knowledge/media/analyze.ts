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

  if (!input.force) {
    const runs = await store.listRuns(input.mediaRecordId);
    const latest = runs.find((run) => run.status === 'completed');

    if (latest && latest.content_hash === contentHash) {
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

  const run = await store.createRun({
    mediaRecordId: input.mediaRecordId,
    documentId: loaded.document.id,
    contentHash,
    analyzerVersion: MEDIA_ANALYZER_VERSION,
    model,
  });

  try {
    const result = await analyzeMediaDocument({
      title: loaded.mediaRecord.title,
      outlet: loaded.mediaRecord.outlet,
      language: loaded.document.language || loaded.mediaRecord.lang,
      chunks: loaded.chunks,
    });

    const context = await store.loadRelationContext(input.mediaRecordId);
    const current = {
      id: loaded.mediaRecord.id,
      title: loaded.mediaRecord.title,
      outlet: loaded.mediaRecord.outlet,
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
      error instanceof Error && error.message.startsWith('media_analysis_')
        ? error.message
        : 'media_analysis_failed';

    await store
      .failRun(
        run.id,
        code,
        error instanceof Error ? error.message.slice(0, 1000) : 'Media analysis failed'
      )
      .catch(() => undefined);

    throw new Error(code);
  }
}

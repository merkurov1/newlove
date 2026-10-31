import { createHash } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import type {
  AnalysisChunk,
  MediaAnalysisCandidate,
  MediaEntityType,
  VerifiedMediaQuote,
} from '@/lib/knowledge/media/intelligence';
import type {
  MediaRelationCandidate,
  RelationMedia,
} from '@/lib/knowledge/media/relations';

export type MediaAnalysisInput = {
  mediaRecord: {
    id: string;
    title: string;
    outlet: string;
    url: string;
    canonical_url: string;
    published_date: string | null;
    lang: string;
    kind: string;
    topic: string;
    summary: string;
    status: string;
  };
  document: {
    id: string;
    title: string;
    content_hash: string | null;
    chunk_count: number;
    source_char_count: number;
    language: string | null;
    media_coverage_status: string | null;
    media_text_quality: string | null;
  };
  chunks: AnalysisChunk[];
};

export type MediaAnalysisEligibleInput = {
  mediaRecordId: string;
  documentId: string;
  contentHash: string | null;
  chunkCount: number;
  textQuality: string;
  title: string;
  outlet: string;
  kind: string;
  topic: string | null;
  publishedDate: string | null;
  lang: string;
};

export type MediaAnalysisQueueStatus = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  oldestPendingAt: string | null;
};

export type MediaAnalysisRun = {
  id: string;
  media_record_id: string;
  document_id: string;
  content_hash: string | null;
  analyzer_version: string;
  model: string | null;
  status: string;
  quote_count: number;
  relation_count: number;
  topic_count: number;
  rejected_candidate_count: number;
  error_code: string | null;
  error_detail: string | null;
  metadata: Record<string, unknown>;
  attempt: number;
  max_attempts: number;
  retry_after: string | null;
  lease_expires_at: string | null;
  worker_id: string | null;
  requested_by: string | null;
  requested_via: string;
  force_refresh: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function quoteRowId(input: {
  runId: string;
  quoteHash: string;
  documentCharStart: number;
}): string {
  return `mq_${sha256(
    `${input.runId}|${input.quoteHash}|${input.documentCharStart}`
  ).slice(0, 32)}`;
}

export type MediaAnalysisStore = NonNullable<ReturnType<typeof createMediaAnalysisStore>>;

export function createMediaAnalysisStore(env: RagEnvironment = process.env) {
  const store = createServiceClient(env);

  if (!store) return null;

  return {
    client: store,

    async loadInput(mediaRecordId: string): Promise<MediaAnalysisInput | null> {
      const { data: media, error: mediaError } = await store
        .from('media_archive_records')
        .select(
          'id,title,outlet,url,canonical_url,published_date,lang,kind,topic,summary,status'
        )
        .eq('id', mediaRecordId)
        .maybeSingle();

      if (mediaError) throw new Error('media_analysis_media_query_failed');
      if (!media) return null;

      const { data: document, error: documentError } = await store
        .from('knowledge_documents')
        .select(
          'id,title,content_hash,chunk_count,source_char_count,language,media_coverage_status,media_text_quality'
        )
        .eq('media_record_id', mediaRecordId)
        .maybeSingle();

      if (documentError) throw new Error('media_analysis_document_query_failed');
      if (!document) return null;

      const { data: chunks, error: chunkError } = await store
        .from('knowledge_chunks')
        .select('id,document_id,chunk_index,content,char_start,char_end,heading')
        .eq('document_id', document.id)
        .order('chunk_index', { ascending: true })
        .limit(2000);

      if (chunkError) throw new Error('media_analysis_chunks_query_failed');

      return {
        mediaRecord: media as MediaAnalysisInput['mediaRecord'],
        document: document as MediaAnalysisInput['document'],
        chunks: Array.isArray(chunks) ? (chunks as AnalysisChunk[]) : [],
      };
    },

    async createRun(input: {
      mediaRecordId: string;
      documentId: string;
      contentHash: string | null;
      analyzerVersion: string;
      model: string | null;
      status?: 'pending' | 'processing';
      requestedBy?: string | null;
      requestedVia?: 'manual' | 'selected' | 'bulk' | 'retry' | 'cron' | 'scheduler';
      forceRefresh?: boolean;
    }): Promise<MediaAnalysisRun> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .insert({
          media_record_id: input.mediaRecordId,
          document_id: input.documentId,
          content_hash: input.contentHash,
          analyzer_version: input.analyzerVersion,
          model: input.model,
          status: input.status || 'processing',
          requested_by: input.requestedBy || null,
          requested_via: input.requestedVia || 'manual',
          force_refresh: Boolean(input.forceRefresh),
          started_at: input.status === 'pending' ? null : new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('media_analysis_run_create_failed');

      return data as unknown as MediaAnalysisRun;
    },

    async findActiveRun(mediaRecordId: string): Promise<MediaAnalysisRun | null> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .select('*')
        .eq('media_record_id', mediaRecordId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error('media_analysis_active_run_query_failed');

      return (data as unknown as MediaAnalysisRun) || null;
    },

    async markRunProcessing(
      runId: string,
      input: { contentHash: string | null; analyzerVersion: string; model: string }
    ): Promise<void> {
      const { error } = await store
        .from('media_analysis_runs')
        .update({
          status: 'processing',
          content_hash: input.contentHash,
          analyzer_version: input.analyzerVersion,
          model: input.model,
          started_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          error_code: null,
          error_detail: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .in('status', ['pending', 'processing']);

      if (error) throw new Error('media_analysis_run_start_failed');
    },

    async claimNextRun(workerId: string, leaseSeconds = 900): Promise<MediaAnalysisRun | null> {
      const { data, error } = await store.rpc('media_claim_next_analysis_run', {
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      });

      if (error) throw new Error('media_analysis_claim_failed');

      const row = Array.isArray(data) ? data[0] : data;
      return (row as unknown as MediaAnalysisRun) || null;
    },

    async heartbeatRun(runId: string, leaseSeconds = 900): Promise<boolean> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .update({
          lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .eq('status', 'processing')
        .select('id');

      if (error) return false;

      return Array.isArray(data) && data.length > 0;
    },

    async listEligibleInputs(input: {
      recordIds?: string[];
      limit?: number;
    } = {}): Promise<MediaAnalysisEligibleInput[]> {
      const limit = Math.min(Math.max(input.limit || 500, 1), 2000);
      let documentQuery = store
        .from('knowledge_documents')
        .select(
          'id,media_record_id,content_hash,chunk_count,media_text_quality,ingestion_status'
        )
        .in('media_text_quality', ['full_text', 'partial_text'])
        .gt('chunk_count', 0)
        .eq('ingestion_status', 'completed')
        .order('media_record_id', { ascending: true })
        .limit(limit);

      if (input.recordIds && input.recordIds.length > 0) {
        documentQuery = documentQuery.in('media_record_id', input.recordIds);
      }

      const { data: documents, error: documentsError } = await documentQuery;

      if (documentsError) throw new Error('media_analysis_eligible_query_failed');

      const rows = (documents || []) as Array<{
        id: string;
        media_record_id: string;
        content_hash: string | null;
        chunk_count: number;
        media_text_quality: string;
      }>;

      if (rows.length === 0) return [];

      const recordIds = rows.map((row) => row.media_record_id);
      const { data: mediaRows, error: mediaError } = await store
        .from('media_archive_records')
        .select('id,title,outlet,kind,topic,published_date,lang')
        .in('id', recordIds);

      if (mediaError) throw new Error('media_analysis_eligible_media_failed');

      const mediaById = new Map(
        (mediaRows || []).map((row) => [
          String((row as { id: string }).id),
          row as {
            id: string;
            title: string;
            outlet: string;
            kind: string;
            topic: string | null;
            published_date: string | null;
            lang: string;
          },
        ])
      );

      return rows
        .map((row) => {
          const media = mediaById.get(row.media_record_id);
          if (!media) return null;

          return {
            mediaRecordId: row.media_record_id,
            documentId: row.id,
            contentHash: row.content_hash,
            chunkCount: row.chunk_count,
            textQuality: row.media_text_quality,
            title: media.title,
            outlet: media.outlet,
            kind: media.kind,
            topic: media.topic,
            publishedDate: media.published_date,
            lang: media.lang,
          } satisfies MediaAnalysisEligibleInput;
        })
        .filter((row): row is MediaAnalysisEligibleInput => Boolean(row));
    },

    async latestCompletedByRecord(
      mediaRecordIds: string[]
    ): Promise<Map<string, MediaAnalysisRun>> {
      const result = new Map<string, MediaAnalysisRun>();

      if (mediaRecordIds.length === 0) return result;

      const { data, error } = await store
        .from('media_analysis_runs')
        .select('*')
        .in('media_record_id', mediaRecordIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(Math.min(5000, mediaRecordIds.length * 5));

      if (error) throw new Error('media_analysis_latest_runs_failed');

      for (const row of (data || []) as unknown as MediaAnalysisRun[]) {
        if (!result.has(row.media_record_id)) result.set(row.media_record_id, row);
      }

      return result;
    },

    async completeRun(
      runId: string,
      result: MediaAnalysisCandidate,
      relationCount: number,
      metadata: Record<string, unknown> = {}
    ): Promise<void> {
      const { error } = await store
        .from('media_analysis_runs')
        .update({
          status: 'completed',
          quote_count: result.quotes.length,
          relation_count: relationCount,
          topic_count: result.topics ? 1 : 0,
          rejected_candidate_count: result.rejectedCandidateCount,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            segments: result.segments,
            text_length: result.textLength,
            analyzer: 'media-intelligence-v1',
          },
        })
        .eq('id', runId);

      if (error) throw new Error('media_analysis_run_complete_failed');
    },

    async failRun(
      runId: string,
      code: string,
      detail: string,
      options: { retryable?: boolean } = {}
    ): Promise<'failed' | 'retried'> {
      const { data: current } = await store
        .from('media_analysis_runs')
        .select('attempt,max_attempts')
        .eq('id', runId)
        .maybeSingle();

      const attempt = Number((current as { attempt?: number } | null)?.attempt || 0);
      const maxAttempts = Math.max(
        1,
        Number((current as { max_attempts?: number } | null)?.max_attempts || 3)
      );
      const shouldRetry = Boolean(options.retryable) && attempt < maxAttempts;
      const backoffSeconds = Math.min(300, 30 * Math.max(1, attempt) * 2);

      const { error } = await store
        .from('media_analysis_runs')
        .update({
          status: shouldRetry ? 'pending' : 'failed',
          error_code: code.slice(0, 80),
          error_detail: detail.slice(0, 1000),
          retry_after: shouldRetry
            ? new Date(Date.now() + backoffSeconds * 1000).toISOString()
            : null,
          lease_expires_at: null,
          worker_id: null,
          completed_at: shouldRetry ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      if (error) throw new Error('media_analysis_run_fail_failed');

      return shouldRetry ? 'retried' : 'failed';
    },

    async supersedeCurrent(mediaRecordId: string): Promise<void> {
      const now = new Date().toISOString();

      const { error: quotesError } = await store
        .from('media_quotes')
        .update({
          is_current: false,
          verification_status: 'superseded',
          updated_at: now,
        })
        .eq('media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (quotesError) throw new Error('media_analysis_quotes_supersede_failed');

      const { error: topicsError } = await store
        .from('media_analysis_topics')
        .update({ is_current: false, superseded_at: now, updated_at: now })
        .eq('media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (topicsError) throw new Error('media_analysis_topics_supersede_failed');

      const { error: rolesError } = await store
        .from('media_editorial_roles')
        .update({ is_current: false, superseded_at: now, updated_at: now })
        .eq('media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (rolesError) throw new Error('media_analysis_roles_supersede_failed');

      const { error: relationsError } = await store
        .from('media_record_relations')
        .update({
          is_current: false,
          superseded_at: now,
          updated_at: now,
        })
        .eq('source_media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (relationsError) throw new Error('media_analysis_relations_supersede_failed');

      const { error: entitiesError } = await store
        .from('media_analysis_entities')
        .update({ is_current: false, superseded_at: now, updated_at: now })
        .eq('media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (entitiesError) throw new Error('media_analysis_entities_supersede_failed');
    },

    async saveResult(input: {
      runId: string;
      mediaRecordId: string;
      documentId: string;
      sourceContentHash: string;
      result: MediaAnalysisCandidate;
    }): Promise<void> {
      const now = new Date().toISOString();
      const { runId, mediaRecordId, documentId, sourceContentHash, result } = input;

      // A retry reuses the same run id. Replace only this run's partial output
      // so a crash between inserts cannot cause duplicate-key failures. Results
      // from previous completed runs are untouched.
      const reset = await Promise.all([
        store.from('media_quotes').delete().eq('analysis_run_id', runId),
        store.from('media_analysis_topics').delete().eq('analysis_run_id', runId),
        store.from('media_editorial_roles').delete().eq('analysis_run_id', runId),
        store.from('media_analysis_entities').delete().eq('analysis_run_id', runId),
      ]);

      if (reset.some((result) => result.error)) {
        throw new Error('media_analysis_run_reset_failed');
      }

      if (result.quotes.length > 0) {
        const rows = result.quotes.map((quote: VerifiedMediaQuote) => ({
          id: quoteRowId({
            runId,
            quoteHash: quote.quoteHash,
            documentCharStart: quote.documentCharStart,
          }),
          analysis_run_id: runId,
          media_record_id: mediaRecordId,
          document_id: documentId,
          chunk_id: quote.chunkId,
          end_chunk_id: quote.endChunkId,
          source_content_hash: sourceContentHash,
          quote_text: quote.quoteText,
          normalized_text: quote.normalizedText,
          quote_hash: quote.quoteHash,
          language: quote.language,
          quote_type: quote.quoteType,
          context_before: quote.contextBefore,
          context_after: quote.contextAfter,
          document_char_start: quote.documentCharStart,
          document_char_end: quote.documentCharEnd,
          chunk_char_start: quote.chunkCharStart,
          chunk_char_end: quote.chunkCharEnd,
          attribution: quote.attribution,
          attribution_confidence: quote.attributionConfidence,
          attribution_note: quote.attributionNote,
          confidence: quote.confidence,
          verification_status: quote.verificationStatus,
          translation: quote.translation,
          translation_language: quote.translationLanguage,
          translation_status: quote.translationStatus,
          is_current: true,
          metadata: {
            context_note: quote.contextNote,
          },
          updated_at: now,
        }));

        const { error } = await store.from('media_quotes').insert(rows);

        if (error) throw new Error('media_analysis_quotes_insert_failed');
      }

      if (result.topics) {
        const { error } = await store.from('media_analysis_topics').insert({
          analysis_run_id: runId,
          media_record_id: mediaRecordId,
          document_id: documentId,
          primary_topic: result.topics.primaryTopic,
          subtopics: result.topics.subtopics,
          confidence: result.topics.confidence,
          method: 'model',
          is_current: true,
          updated_at: now,
        });

        if (error) throw new Error('media_analysis_topics_insert_failed');
      }

      if (result.editorialRole) {
        const { error } = await store.from('media_editorial_roles').insert({
          analysis_run_id: runId,
          media_record_id: mediaRecordId,
          document_id: documentId,
          role: result.editorialRole.role,
          confidence: result.editorialRole.confidence,
          evidence: result.editorialRole.evidence,
          metadata: {
            interaction_type: result.interactionType || 'unknown',
          },
          is_current: true,
          updated_at: now,
        });

        if (error) throw new Error('media_analysis_role_insert_failed');
      }

      if (result.entities && result.entities.length > 0) {
        const rows = result.entities.map((entity) => ({
          analysis_run_id: runId,
          media_record_id: mediaRecordId,
          document_id: documentId,
          entity_type: entity.entityType satisfies MediaEntityType,
          name: entity.name.slice(0, 300),
          role: entity.role?.slice(0, 300) || null,
          context: entity.context?.slice(0, 1000) || null,
          confidence: entity.confidence,
          is_current: true,
          updated_at: now,
        }));

        const { error } = await store.from('media_analysis_entities').insert(rows);

        if (error) throw new Error('media_analysis_entities_insert_failed');
      }
    },

    async loadRelationContext(mediaRecordId: string): Promise<{
      current: RelationMedia | null;
      others: RelationMedia[];
    }> {
      const { data: mediaRecords, error: mediaError } = await store
        .from('media_archive_records')
        .select('id,title,outlet,kind,published_date,topic')
        .limit(1000);

      if (mediaError) throw new Error('media_analysis_relation_media_failed');

      const ids = (mediaRecords || []).map((row) => String((row as { id: string }).id));

      if (ids.length === 0) {
        return { current: null, others: [] };
      }

      const { data: documents, error: documentsError } = await store
        .from('knowledge_documents')
        .select('media_record_id,content_hash')
        .in('media_record_id', ids)
        .limit(1000);

      if (documentsError) throw new Error('media_analysis_relation_documents_failed');

      const { data: topics, error: topicsError } = await store
        .from('media_analysis_topics')
        .select('media_record_id,primary_topic,subtopics')
        .in('media_record_id', ids)
        .eq('is_current', true)
        .limit(1000);

      if (topicsError) throw new Error('media_analysis_relation_topics_failed');

      const { data: quotes, error: quotesError } = await store
        .from('media_quotes')
        .select('media_record_id,quote_hash')
        .in('media_record_id', ids)
        .eq('is_current', true)
        .limit(5000);

      if (quotesError) throw new Error('media_analysis_relation_quotes_failed');

      const documentByRecord = new Map(
        (documents || []).map((row) => [
          String((row as { media_record_id: string }).media_record_id),
          String((row as { content_hash?: string | null }).content_hash || ''),
        ])
      );
      const topicByRecord = new Map(
        (topics || []).map((row) => [
          String((row as { media_record_id: string }).media_record_id),
          row as { primary_topic?: string; subtopics?: string[] },
        ])
      );
      const quotesByRecord = new Map<string, string[]>();

      for (const row of quotes || []) {
        const value = row as { media_record_id: string; quote_hash: string };
        const list = quotesByRecord.get(String(value.media_record_id)) || [];
        list.push(String(value.quote_hash));
        quotesByRecord.set(String(value.media_record_id), list);
      }

      const relationMedia: RelationMedia[] = (mediaRecords || []).map((row) => {
        const value = row as {
          id: string;
          title: string;
          outlet: string;
          kind: string | null;
          published_date: string | null;
          topic: string | null;
        };
        const topic = topicByRecord.get(String(value.id));

        return {
          id: String(value.id),
          title: String(value.title || ''),
          outlet: String(value.outlet || ''),
          kind: value.kind || null,
          publishedDate: value.published_date,
          topic: topic?.primary_topic || value.topic || null,
          subtopics: Array.isArray(topic?.subtopics) ? topic.subtopics : [],
          contentHash: documentByRecord.get(String(value.id)) || null,
          quoteHashes: quotesByRecord.get(String(value.id)) || [],
        };
      });

      return {
        current: relationMedia.find((item) => item.id === mediaRecordId) || null,
        others: relationMedia.filter((item) => item.id !== mediaRecordId),
      };
    },

    async supersedeRelations(mediaRecordId: string): Promise<void> {
      const { error } = await store
        .from('media_record_relations')
        .update({
          is_current: false,
          superseded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('source_media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (error) throw new Error('media_analysis_relations_supersede_failed');
    },

    async saveRelations(input: {
      runId: string;
      mediaRecordId: string;
      candidates: MediaRelationCandidate[];
    }): Promise<number> {
      if (input.candidates.length === 0) return 0;

      const rows = input.candidates.map((candidate) => ({
        analysis_run_id: input.runId,
        source_media_record_id: input.mediaRecordId,
        target_media_record_id: candidate.targetMediaRecordId,
        relation_type: candidate.relationType,
        confidence: candidate.confidence,
        detected_by: candidate.detectedBy,
        evidence: candidate.evidence,
        is_current: true,
        review_status: candidate.reviewStatus,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await store
        .from('media_record_relations')
        .insert(rows);

      if (error) throw new Error('media_analysis_relations_insert_failed');

      return rows.length;
    },

    async getCurrentAnalysis(mediaRecordId: string): Promise<Record<string, unknown> | null> {
      const { data: run, error: runError } = await store
        .from('media_analysis_runs')
        .select('*')
        .eq('media_record_id', mediaRecordId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runError) throw new Error('media_analysis_run_query_failed');
      if (!run) return null;

      const runRow = run as unknown as MediaAnalysisRun;

      const [quotes, topics, roles, relations, entities] = await Promise.all([
        store
          .from('media_quotes')
          .select('*')
          .eq('analysis_run_id', runRow.id)
          .order('document_char_start', { ascending: true }),
        store
          .from('media_analysis_topics')
          .select('*')
          .eq('analysis_run_id', runRow.id)
          .maybeSingle(),
        store
          .from('media_editorial_roles')
          .select('*')
          .eq('analysis_run_id', runRow.id)
          .maybeSingle(),
        store
          .from('media_record_relations')
          .select('*')
          .or(
            `source_media_record_id.eq.${mediaRecordId},target_media_record_id.eq.${mediaRecordId}`
          )
          .eq('is_current', true),
        store
          .from('media_analysis_entities')
          .select('*')
          .eq('analysis_run_id', runRow.id)
          .order('entity_type', { ascending: true })
          .order('name', { ascending: true }),
      ]);

      return {
        run: runRow,
        quotes: quotes.data || [],
        topics: topics.data || null,
        editorialRole: roles.data || null,
        relations: relations.data || [],
        entities: entities.data || [],
      };
    },

    async listRuns(mediaRecordId: string, limit = 20): Promise<MediaAnalysisRun[]> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .select('*')
        .eq('media_record_id', mediaRecordId)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 200));

      if (error) throw new Error('media_analysis_runs_query_failed');

      return Array.isArray(data) ? (data as unknown as MediaAnalysisRun[]) : [];
    },

    async getQueueStatus(): Promise<MediaAnalysisQueueStatus> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .select('status,created_at')
        .order('created_at', { ascending: true })
        .limit(5000);

      if (error) throw new Error('media_analysis_queue_status_failed');

      const status: MediaAnalysisQueueStatus = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        oldestPendingAt: null,
      };

      for (const row of (data || []) as Array<{ status: string; created_at: string }>) {
        if (row.status in status) {
          const key = row.status as keyof MediaAnalysisQueueStatus;

          if (key !== 'oldestPendingAt') {
            status[key] = Number(status[key]) + 1;
          }
        }

        if (row.status === 'pending' && !status.oldestPendingAt) {
          status.oldestPendingAt = row.created_at;
        }
      }

      return status;
    },

    async listRecentRuns(limit = 30): Promise<
      Array<MediaAnalysisRun & { media_title: string | null; media_outlet: string | null }>
    > {
      const { data, error } = await store
        .from('media_analysis_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 200));

      if (error) throw new Error('media_analysis_recent_runs_failed');

      const rows = (data || []) as unknown as MediaAnalysisRun[];

      if (rows.length === 0) return [];

      const ids = Array.from(new Set(rows.map((row) => row.media_record_id)));
      const { data: mediaRows } = await store
        .from('media_archive_records')
        .select('id,title,outlet')
        .in('id', ids);

      const mediaById = new Map(
        (mediaRows || []).map((row) => [
          String((row as { id: string }).id),
          row as { id: string; title: string; outlet: string },
        ])
      );

      return rows.map((row) => {
        const media = mediaById.get(row.media_record_id);

        return {
          ...row,
          media_title: media?.title || null,
          media_outlet: media?.outlet || null,
        };
      });
    },

    async retryRun(runId: string): Promise<boolean> {
      const now = new Date().toISOString();
      const { data, error } = await store
        .from('media_analysis_runs')
        .update({
          status: 'pending',
          error_code: null,
          error_detail: null,
          retry_after: now,
          lease_expires_at: null,
          worker_id: null,
          completed_at: null,
          force_refresh: true,
          updated_at: now,
        })
        .eq('id', runId)
        .in('status', ['failed', 'cancelled'])
        .select('id');

      if (error) return false;

      return Array.isArray(data) && data.length > 0;
    },

    async cancelRun(runId: string): Promise<boolean> {
      const now = new Date().toISOString();
      const { data, error } = await store
        .from('media_analysis_runs')
        .update({
          status: 'cancelled',
          lease_expires_at: null,
          worker_id: null,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', runId)
        .in('status', ['pending', 'processing'])
        .select('id');

      if (error) return false;

      return Array.isArray(data) && data.length > 0;
    },

    async reviewQuote(
      quoteId: string,
      patch: {
        verificationStatus?: string;
        attribution?: string;
        attributionNote?: string | null;
        translation?: string | null;
        translationLanguage?: string | null;
        translationStatus?: string;
        reviewedBy?: string;
      }
    ): Promise<void> {
      const update: Record<string, unknown> = {
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (patch.verificationStatus) update.verification_status = patch.verificationStatus;
      if (patch.attribution) update.attribution = patch.attribution;
      if (patch.attributionNote !== undefined) update.attribution_note = patch.attributionNote;
      if (patch.translation !== undefined) update.translation = patch.translation;
      if (patch.translationLanguage !== undefined) {
        update.translation_language = patch.translationLanguage;
      }
      if (patch.translationStatus) update.translation_status = patch.translationStatus;
      if (patch.reviewedBy) update.reviewed_by = patch.reviewedBy;

      const { error } = await store
        .from('media_quotes')
        .update(update)
        .eq('id', quoteId);

      if (error) throw new Error('media_analysis_quote_review_failed');
    },

    async reviewRelation(
      relationId: string,
      patch: {
        reviewStatus: string;
        reviewedBy?: string;
      }
    ): Promise<void> {
      const { error } = await store
        .from('media_record_relations')
        .update({
          review_status: patch.reviewStatus,
          reviewed_by: patch.reviewedBy || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationId);

      if (error) throw new Error('media_analysis_relation_review_failed');
    },
  };
}

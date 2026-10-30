import { createHash } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import type {
  AnalysisChunk,
  MediaAnalysisCandidate,
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
    }): Promise<MediaAnalysisRun> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .insert({
          media_record_id: input.mediaRecordId,
          document_id: input.documentId,
          content_hash: input.contentHash,
          analyzer_version: input.analyzerVersion,
          model: input.model,
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('media_analysis_run_create_failed');

      return data as unknown as MediaAnalysisRun;
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

    async failRun(runId: string, code: string, detail: string): Promise<void> {
      const { error } = await store
        .from('media_analysis_runs')
        .update({
          status: 'failed',
          error_code: code.slice(0, 80),
          error_detail: detail.slice(0, 1000),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      if (error) throw new Error('media_analysis_run_fail_failed');
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
        .update({ is_current: false, updated_at: now })
        .eq('media_record_id', mediaRecordId)
        .eq('is_current', true);

      if (topicsError) throw new Error('media_analysis_topics_supersede_failed');

      const { error: rolesError } = await store
        .from('media_editorial_roles')
        .update({ is_current: false, updated_at: now })
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
          is_current: true,
          updated_at: now,
        });

        if (error) throw new Error('media_analysis_role_insert_failed');
      }
    },

    async loadRelationContext(mediaRecordId: string): Promise<{
      current: RelationMedia | null;
      others: RelationMedia[];
    }> {
      const { data: mediaRecords, error: mediaError } = await store
        .from('media_archive_records')
        .select('id,title,outlet,published_date,topic')
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
          published_date: string | null;
          topic: string | null;
        };
        const topic = topicByRecord.get(String(value.id));

        return {
          id: String(value.id),
          title: String(value.title || ''),
          outlet: String(value.outlet || ''),
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

      const [quotes, topics, roles, relations] = await Promise.all([
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
      ]);

      return {
        run: runRow,
        quotes: quotes.data || [],
        topics: topics.data || null,
        editorialRole: roles.data || null,
        relations: relations.data || [],
      };
    },

    async listRuns(mediaRecordId: string): Promise<MediaAnalysisRun[]> {
      const { data, error } = await store
        .from('media_analysis_runs')
        .select('*')
        .eq('media_record_id', mediaRecordId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw new Error('media_analysis_runs_query_failed');

      return Array.isArray(data) ? (data as unknown as MediaAnalysisRun[]) : [];
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

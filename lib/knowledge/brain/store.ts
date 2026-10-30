import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isMissingIngestionVersionColumn, toPgVector } from '@/lib/knowledge/rag/supabaseStore';
import type { KnowledgeChunkWithEmbedding, KnowledgeDocumentRow } from '@/lib/knowledge/rag/types';
import type { RagEnvironment } from '@/lib/knowledge/rag/config';

export type BrainJobStatus =
  'queued' | 'processing' | 'completed' | 'duplicate' | 'partial' | 'failed' | 'cancelled';

export type BrainRunStatus =
  'running' | 'paused' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';

export type BrainSourceType = 'article' | 'media_coverage';

export type MediaCoverageStatus =
  'pending' | 'processing' | 'completed' | 'failed' | 'partial' | 'blocked';

export type MediaArchiveRecord = {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  outlet: string;
  published_date: string | null;
  lang: string;
  kind: string;
  topic: string;
  summary: string;
  image_url: string | null;
  status: string;
  ai_metadata: Record<string, unknown> | null;
  updated_at: string;
};

export type MediaArchivePatch = {
  title?: string;
  outlet?: string;
  canonical_url?: string;
  url?: string;
  published_date?: string | null;
  lang?: string;
  kind?: string;
  topic?: string;
  summary?: string;
  image_url?: string | null;
  status?: string;
  ai_metadata?: Record<string, unknown>;
};

export type BrainRunRow = {
  id: string;
  status: BrainRunStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type BrainJobRow = {
  id: string;
  run_id: string;
  input_url: string;
  normalized_url: string;
  canonical_url: string | null;
  final_url: string | null;
  status: BrainJobStatus;
  attempts: number;
  max_attempts: number;
  retry_after: string | null;
  document_id: string | null;
  content_hash: string | null;
  title: string | null;
  language: string | null;
  error_code: string | null;
  error_detail: string | null;
  extraction_status: string | null;
  extraction_metadata: Record<string, unknown>;
  worker_id: string | null;
  locked_at: string | null;
  started_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Defaults to `article` for jobs created before the Media Intelligence link. */
  source_type?: BrainSourceType;
  media_record_id?: string | null;
  requested_by?: string | null;
};

export type BrainArticleDocumentRow = KnowledgeDocumentRow & {
  source_type: 'article';
  source_url: string;
  canonical_url: string;
  normalized_url: string;
  content_hash: string;
  language: string | null;
  author: string | null;
  published_at: string | null;
  extraction_status: string;
  ingestion_status: 'pending' | 'completed';
  processed_at: string | null;
};

export type MediaCoverageDocumentRow = KnowledgeDocumentRow & {
  source_type: 'media_coverage';
  source_url: string;
  canonical_url: string;
  normalized_url: string;
  content_hash: string | null;
  language: string | null;
  author: string | null;
  published_at: string | null;
  extraction_status: string;
  ingestion_status: 'pending' | 'completed';
  processed_at: string | null;
  media_record_id: string;
  media_outlet: string;
  media_kind: string;
  media_topic: string;
  media_language: string;
  media_published_date: string | null;
  media_archive_status: string;
  media_coverage_status: MediaCoverageStatus;
  media_text_quality: string | null;
  media_coverage_method: string | null;
  media_coverage_error_code: string | null;
  media_coverage_error_detail: string | null;
  media_coverage_diagnostics: Record<string, unknown>;
};

export type MediaCoverageStatusPatch = {
  media_coverage_status: MediaCoverageStatus;
  media_text_quality?: string | null;
  extraction_status?: string | null;
  ingestion_status?: 'pending' | 'completed';
  media_coverage_method?: string | null;
  media_coverage_error_code?: string | null;
  media_coverage_error_detail?: string | null;
  media_coverage_diagnostics?: Record<string, unknown>;
  content_hash?: string | null;
  chunk_count?: number;
  source_char_count?: number;
  processed_at?: string | null;
};

export type MediaCoverageMetadataPatch = {
  title?: string;
  source_url?: string;
  canonical_url?: string;
  normalized_url?: string;
  media_outlet?: string;
  media_kind?: string;
  media_topic?: string;
  media_language?: string;
  media_published_date?: string | null;
  media_archive_status?: string;
  published_at?: string | null;
  language?: string | null;
};

export type ArticleDocumentLookup = {
  id: string;
  title: string;
  normalized_url: string | null;
  canonical_url: string | null;
  source_url: string | null;
  content_hash: string | null;
  ingestion_status: string | null;
  chunk_count: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type DuplicateMatch = {
  documentId: string;
  title: string;
  match: 'normalized_url' | 'canonical_url' | 'content_hash';
  ingestionStatus: string | null;
  contentHash: string | null;
  canonicalUrl: string | null;
  normalizedUrl: string | null;
  chunkCount: number | null;
};

export type MediaCoverageMatch = Omit<DuplicateMatch, 'match'> & {
  match: 'media_record_id' | 'normalized_url' | 'canonical_url';
  sourceType: string;
  mediaRecordId: string | null;
  extractionStatus: string | null;
  processedAt: string | null;
  sourceCharCount: number | null;
  coverageStatus: string | null;
  coverageMethod: string | null;
  textQuality: string | null;
  language: string | null;
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

function isUniqueViolation(
  error: { code?: unknown; message?: unknown } | null | undefined
): boolean {
  if (!error) return false;

  if (error.code === '23505') return true;

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return message.includes('duplicate key value') || message.includes('unique constraint');
}

export type BrainStore = NonNullable<ReturnType<typeof createBrainStore>>;

export function createBrainStore(env: RagEnvironment = process.env) {
  const store = createServiceClient(env);

  if (!store) return null;

  return {
    client: store,

    async listArticleDocuments(limit = 5000): Promise<ArticleDocumentLookup[]> {
      const { data, error } = await store
        .from('knowledge_documents')
        .select(
          'id,title,normalized_url,canonical_url,source_url,content_hash,ingestion_status,chunk_count,created_at,updated_at'
        )
        .eq('source_type', 'article')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error('brain_documents_query_failed');

      return Array.isArray(data) ? (data as unknown as ArticleDocumentLookup[]) : [];
    },

    async getMediaRecord(mediaRecordId: string): Promise<MediaArchiveRecord | null> {
      const { data, error } = await store
        .from('media_archive_records')
        .select(
          'id,url,canonical_url,title,outlet,published_date,lang,kind,topic,summary,image_url,status,ai_metadata,updated_at'
        )
        .eq('id', mediaRecordId)
        .maybeSingle();

      if (error) throw new Error('brain_media_record_query_failed');

      return (data as unknown as MediaArchiveRecord) || null;
    },

    async findMediaRecordByUrl(
      inputUrl: string,
      normalizedUrl: string
    ): Promise<MediaArchiveRecord | null> {
      const select =
        'id,url,canonical_url,title,outlet,published_date,lang,kind,topic,summary,image_url,status,ai_metadata,updated_at';

      for (const [column, value] of [
        ['canonical_url', normalizedUrl],
        ['canonical_url', inputUrl],
        ['url', inputUrl],
        ['url', normalizedUrl],
      ] as const) {
        const { data } = await store
          .from('media_archive_records')
          .select(select)
          .eq(column, value)
          .limit(1)
          .maybeSingle();

        if (data) return data as unknown as MediaArchiveRecord;
      }

      return null;
    },

    async createMediaDraftRecord(input: {
      url: string;
      normalizedUrl: string;
      title: string;
      outlet: string;
      summary?: string;
      source?: string;
    }): Promise<{ record: MediaArchiveRecord; inserted: boolean }> {
      const { data, error } = await store
        .from('media_archive_records')
        .insert({
          url: input.url.slice(0, 4000),
          canonical_url: input.normalizedUrl,
          title: input.title.slice(0, 500),
          outlet: input.outlet.slice(0, 300),
          published_date: null,
          lang: 'EN',
          kind: 'mention',
          topic: 'Internet & Censorship',
          summary: (input.summary || '').slice(0, 2000),
          image_url: null,
          status: 'draft',
          ai_metadata: {
            import_pending: true,
            source: input.source || 'media_import',
            requested_url: input.url.slice(0, 2048),
          },
        })
        .select('*')
        .single();

      if (!error && data) {
        return { record: data as unknown as MediaArchiveRecord, inserted: true };
      }

      if (isUniqueViolation(error)) {
        for (const [column, value] of [
          ['canonical_url', input.normalizedUrl],
          ['url', input.url],
          ['url', input.normalizedUrl],
        ] as const) {
          const { data: existing } = await store
            .from('media_archive_records')
            .select(
              'id,url,canonical_url,title,outlet,published_date,lang,kind,topic,summary,image_url,status,ai_metadata,updated_at'
            )
            .eq(column, value)
            .limit(1)
            .maybeSingle();

          if (existing) {
            return {
              record: existing as unknown as MediaArchiveRecord,
              inserted: false,
            };
          }
        }
      }

      throw new Error('brain_media_record_create_failed');
    },

    async updateMediaRecord(mediaRecordId: string, patch: MediaArchivePatch): Promise<void> {
      const { error } = await store
        .from('media_archive_records')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mediaRecordId);

      if (error) {
        if (isUniqueViolation(error)) throw new Error('media_canonical_conflict');
        throw new Error('brain_media_record_update_failed');
      }
    },

    async getMediaRecordsByIds(ids: string[]): Promise<MediaArchiveRecord[]> {
      if (ids.length === 0) return [];

      const { data, error } = await store
        .from('media_archive_records')
        .select(
          'id,url,canonical_url,title,outlet,published_date,lang,kind,topic,summary,image_url,status,ai_metadata,updated_at'
        )
        .in('id', ids)
        .limit(1000);

      if (error) throw new Error('brain_media_records_query_failed');

      return Array.isArray(data) ? (data as unknown as MediaArchiveRecord[]) : [];
    },

    async listMediaCoverageDocuments(ids: string[]): Promise<MediaCoverageMatch[]> {
      if (ids.length === 0) return [];

      const { data, error } = await store
        .from('knowledge_documents')
        .select(
          'id,title,source_type,media_record_id,ingestion_status,content_hash,canonical_url,normalized_url,chunk_count,source_char_count,extraction_status,processed_at,media_coverage_status,media_coverage_method,media_text_quality,language'
        )
        .in('media_record_id', ids)
        .limit(1000);

      if (error) throw new Error('brain_media_documents_query_failed');

      return Array.isArray(data)
        ? data.map((row) => {
            const value = row as Record<string, unknown>;
            return {
              documentId: String(value.id),
              title: String(value.title || ''),
              match: 'media_record_id' as const,
              ingestionStatus: (value.ingestion_status as string | null) ?? null,
              contentHash: (value.content_hash as string | null) ?? null,
              canonicalUrl: (value.canonical_url as string | null) ?? null,
              normalizedUrl: (value.normalized_url as string | null) ?? null,
              chunkCount: (value.chunk_count as number | null) ?? null,
              sourceType: String(value.source_type || ''),
              mediaRecordId: (value.media_record_id as string | null) ?? null,
              extractionStatus: (value.extraction_status as string | null) ?? null,
              processedAt: (value.processed_at as string | null) ?? null,
              sourceCharCount: (value.source_char_count as number | null) ?? null,
              coverageStatus: (value.media_coverage_status as string | null) ?? null,
              coverageMethod: (value.media_coverage_method as string | null) ?? null,
              textQuality: (value.media_text_quality as string | null) ?? null,
              language: (value.language as string | null) ?? null,
            };
          })
        : [];
    },

    async getLatestMediaJobsForRecords(ids: string[]): Promise<BrainJobRow[]> {
      if (ids.length === 0) return [];

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('*')
        .in('media_record_id', ids)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw new Error('brain_media_jobs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainJobRow[]) : [];
    },

    async upsertMediaRelation(input: {
      sourceMediaRecordId: string;
      targetMediaRecordId: string;
      relationType: 'reprint' | 'syndication' | 'related';
      detectedBy: string;
      confidence?: number;
      evidence?: Record<string, unknown>;
    }): Promise<void> {
      if (input.sourceMediaRecordId === input.targetMediaRecordId) return;

      const { data: existing, error: queryError } = await store
        .from('media_record_relations')
        .select('id')
        .eq('source_media_record_id', input.sourceMediaRecordId)
        .eq('target_media_record_id', input.targetMediaRecordId)
        .eq('relation_type', input.relationType)
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();

      if (queryError) throw new Error('brain_media_relation_query_failed');

      if (existing?.id) {
        const { error } = await store
          .from('media_record_relations')
          .update({
            confidence: input.confidence ?? 0.9,
            detected_by: input.detectedBy,
            evidence: input.evidence || {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw new Error('brain_media_relation_update_failed');
        return;
      }

      const { error } = await store.from('media_record_relations').insert({
        source_media_record_id: input.sourceMediaRecordId,
        target_media_record_id: input.targetMediaRecordId,
        relation_type: input.relationType,
        confidence: input.confidence ?? 0.9,
        detected_by: input.detectedBy,
        evidence: input.evidence || {},
        is_current: true,
        updated_at: new Date().toISOString(),
      });

      if (error) throw new Error('brain_media_relation_upsert_failed');
    },

    async findReprintCandidates(
      mediaRecordId: string,
      contentHash: string
    ): Promise<Array<{ mediaRecordId: string; documentId: string }>> {
      if (!contentHash) return [];

      const { data, error } = await store
        .from('knowledge_documents')
        .select('id,media_record_id')
        .eq('content_hash', contentHash)
        .not('media_record_id', 'is', null)
        .neq('media_record_id', mediaRecordId)
        .limit(20);

      if (error) throw new Error('brain_media_reprint_query_failed');

      return Array.isArray(data)
        ? data
            .map((row) => {
              const value = row as Record<string, unknown>;
              return {
                mediaRecordId: String(value.media_record_id || ''),
                documentId: String(value.id || ''),
              };
            })
            .filter((row) => row.mediaRecordId)
        : [];
    },

    async cancelRun(runId: string): Promise<void> {
      const now = new Date().toISOString();

      const { error: runError } = await store
        .from('brain_ingestion_runs')
        .update({
          status: 'cancelled',
          completed_at: now,
          updated_at: now,
        })
        .eq('id', runId);

      if (runError) throw new Error('brain_run_cancel_failed');

      const { error: jobsError } = await store
        .from('brain_ingestion_jobs')
        .update({
          status: 'cancelled',
          processed_at: now,
          locked_at: null,
          worker_id: null,
          updated_at: now,
        })
        .eq('run_id', runId)
        .in('status', ['queued', 'processing']);

      if (jobsError) throw new Error('brain_jobs_cancel_failed');
    },

    async findMediaCoverageDocument(input: {
      mediaRecordId: string;
      normalizedUrl?: string | null;
      canonicalUrl?: string | null;
    }): Promise<MediaCoverageMatch | null> {
      const select =
        'id,title,source_type,media_record_id,ingestion_status,content_hash,canonical_url,normalized_url,chunk_count,source_char_count,extraction_status,processed_at,media_coverage_status,media_coverage_method,media_text_quality,language';

      const toMatch = (
        row: Record<string, unknown>,
        match: MediaCoverageMatch['match']
      ): MediaCoverageMatch => ({
        documentId: String(row.id),
        title: String(row.title || ''),
        match,
        ingestionStatus: (row.ingestion_status as string | null) ?? null,
        contentHash: (row.content_hash as string | null) ?? null,
        canonicalUrl: (row.canonical_url as string | null) ?? null,
        normalizedUrl: (row.normalized_url as string | null) ?? null,
        chunkCount: (row.chunk_count as number | null) ?? null,
        sourceType: String(row.source_type || ''),
        mediaRecordId: (row.media_record_id as string | null) ?? null,
        extractionStatus: (row.extraction_status as string | null) ?? null,
        processedAt: (row.processed_at as string | null) ?? null,
        sourceCharCount: (row.source_char_count as number | null) ?? null,
        coverageStatus: (row.media_coverage_status as string | null) ?? null,
        coverageMethod: (row.media_coverage_method as string | null) ?? null,
        textQuality: (row.media_text_quality as string | null) ?? null,
        language: (row.language as string | null) ?? null,
      });

      const byRecord = await store
        .from('knowledge_documents')
        .select(select)
        .eq('media_record_id', input.mediaRecordId)
        .limit(1)
        .maybeSingle();

      if (byRecord.data) {
        return toMatch(byRecord.data as Record<string, unknown>, 'media_record_id');
      }

      if (input.normalizedUrl) {
        const byNormalized = await store
          .from('knowledge_documents')
          .select(select)
          .in('source_type', ['article', 'media_coverage'])
          .eq('normalized_url', input.normalizedUrl)
          .limit(1)
          .maybeSingle();

        if (byNormalized.data) {
          return toMatch(byNormalized.data as Record<string, unknown>, 'normalized_url');
        }
      }

      if (input.canonicalUrl) {
        const byCanonical = await store
          .from('knowledge_documents')
          .select(select)
          .in('source_type', ['article', 'media_coverage'])
          .eq('canonical_url', input.canonicalUrl)
          .limit(1)
          .maybeSingle();

        if (byCanonical.data) {
          return toMatch(byCanonical.data as Record<string, unknown>, 'canonical_url');
        }
      }

      return null;
    },

    async findActiveMediaJob(
      mediaRecordId: string
    ): Promise<{ id: string; run_id: string; status: string } | null> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('id,run_id,status')
        .eq('media_record_id', mediaRecordId)
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error('brain_media_job_query_failed');

      return (data as { id: string; run_id: string; status: string } | null) || null;
    },

    async getLatestMediaJob(mediaRecordId: string): Promise<BrainJobRow | null> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('*')
        .eq('media_record_id', mediaRecordId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error('brain_media_job_query_failed');

      return (data as unknown as BrainJobRow) || null;
    },

    async findDuplicate(input: {
      normalizedUrl?: string | null;
      canonicalUrl?: string | null;
      contentHash?: string | null;
    }): Promise<DuplicateMatch | null> {
      const select =
        'id,title,ingestion_status,content_hash,canonical_url,normalized_url,chunk_count';

      if (input.normalizedUrl) {
        const { data } = await store
          .from('knowledge_documents')
          .select(select)
          .eq('source_type', 'article')
          .eq('normalized_url', input.normalizedUrl)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as {
            id: string;
            title: string;
            ingestion_status?: string | null;
            content_hash?: string | null;
            canonical_url?: string | null;
            normalized_url?: string | null;
            chunk_count?: number | null;
          };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'normalized_url',
            ingestionStatus: row.ingestion_status ?? null,
            contentHash: row.content_hash ?? null,
            canonicalUrl: row.canonical_url ?? null,
            normalizedUrl: row.normalized_url ?? null,
            chunkCount: row.chunk_count ?? null,
          };
        }
      }

      if (input.canonicalUrl && input.canonicalUrl !== input.normalizedUrl) {
        const { data } = await store
          .from('knowledge_documents')
          .select(select)
          .eq('source_type', 'article')
          .eq('canonical_url', input.canonicalUrl)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as {
            id: string;
            title: string;
            ingestion_status?: string | null;
            content_hash?: string | null;
            canonical_url?: string | null;
            normalized_url?: string | null;
            chunk_count?: number | null;
          };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'canonical_url',
            ingestionStatus: row.ingestion_status ?? null,
            contentHash: row.content_hash ?? null,
            canonicalUrl: row.canonical_url ?? null,
            normalizedUrl: row.normalized_url ?? null,
            chunkCount: row.chunk_count ?? null,
          };
        }
      }

      if (input.contentHash) {
        const { data } = await store
          .from('knowledge_documents')
          .select(select)
          .eq('source_type', 'article')
          .eq('content_hash', input.contentHash)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as {
            id: string;
            title: string;
            ingestion_status?: string | null;
            content_hash?: string | null;
            canonical_url?: string | null;
            normalized_url?: string | null;
            chunk_count?: number | null;
          };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'content_hash',
            ingestionStatus: row.ingestion_status ?? null,
            contentHash: row.content_hash ?? null,
            canonicalUrl: row.canonical_url ?? null,
            normalizedUrl: row.normalized_url ?? null,
            chunkCount: row.chunk_count ?? null,
          };
        }
      }

      return null;
    },

    async createRun(metadata: Record<string, unknown> = {}): Promise<BrainRunRow> {
      const { data, error } = await store
        .from('brain_ingestion_runs')
        .insert({ status: 'running', metadata })
        .select('*')
        .single();

      if (error || !data) throw new Error('brain_run_create_failed');

      return data as unknown as BrainRunRow;
    },

    async getRun(runId: string): Promise<BrainRunRow | null> {
      const { data, error } = await store
        .from('brain_ingestion_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();

      if (error) throw new Error('brain_run_query_failed');

      return (data as unknown as BrainRunRow) || null;
    },

    async listRecentRuns(limit = 10): Promise<BrainRunRow[]> {
      const { data, error } = await store
        .from('brain_ingestion_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error('brain_run_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainRunRow[]) : [];
    },

    async updateRun(runId: string, patch: Partial<BrainRunRow>): Promise<void> {
      const { error } = await store
        .from('brain_ingestion_runs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', runId);

      if (error) throw new Error('brain_run_update_failed');
    },

    async insertJobs(
      runId: string,
      jobs: Array<{
        inputUrl: string;
        normalizedUrl: string;
        sourceType?: BrainSourceType;
        mediaRecordId?: string | null;
        requestedBy?: string | null;
      }>
    ): Promise<BrainJobRow[]> {
      if (jobs.length === 0) return [];

      const rows = jobs.map((job) => ({
        run_id: runId,
        input_url: job.inputUrl.slice(0, 4000),
        normalized_url: job.normalizedUrl.slice(0, 2048),
        status: 'queued',
        source_type: job.sourceType || 'article',
        media_record_id: job.mediaRecordId || null,
        requested_by: job.requestedBy?.slice(0, 200) || null,
      }));

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .upsert(rows, { onConflict: 'run_id,normalized_url', ignoreDuplicates: true })
        .select('*');

      if (error) throw new Error('brain_jobs_insert_failed');

      return Array.isArray(data) ? (data as unknown as BrainJobRow[]) : [];
    },

    async getJobs(runId: string): Promise<BrainJobRow[]> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw new Error('brain_jobs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainJobRow[]) : [];
    },

    async getJobsForRuns(runIds: string[]): Promise<BrainJobRow[]> {
      if (runIds.length === 0) return [];

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('*')
        .in('run_id', runIds)
        .limit(5000);

      if (error) throw new Error('brain_jobs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainJobRow[]) : [];
    },

    async findActiveJobsByUrls(
      urls: string[]
    ): Promise<Array<{ run_id: string; normalized_url: string }>> {
      if (urls.length === 0) return [];

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('run_id,normalized_url')
        .in('normalized_url', urls)
        .in('status', ['queued', 'processing'])
        .limit(2000);

      if (error) throw new Error('brain_jobs_query_failed');

      return Array.isArray(data) ? (data as Array<{ run_id: string; normalized_url: string }>) : [];
    },

    async updateJob(jobId: string, patch: Partial<BrainJobRow>): Promise<void> {
      const { error } = await store
        .from('brain_ingestion_jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw new Error('brain_job_update_failed');
    },

    async claimNextJob(runId: string, workerId: string): Promise<BrainJobRow | null> {
      const { data, error } = await store.rpc('brain_claim_next_job', {
        p_run_id: runId,
        p_worker: workerId,
      });

      if (error) throw new Error('brain_job_claim_failed');

      const rows = Array.isArray(data) ? data : data ? [data] : [];

      return (rows[0] as unknown as BrainJobRow) || null;
    },

    async reclaimStaleJobs(runId: string, staleSeconds = 900): Promise<number> {
      const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('id,attempts,max_attempts,media_record_id,document_id')
        .eq('run_id', runId)
        .eq('status', 'processing')
        .lt('locked_at', cutoff)
        .limit(200);

      if (error) throw new Error('brain_jobs_reclaim_query_failed');

      const rows = Array.isArray(data)
        ? (data as Array<{
            id: string;
            attempts: number;
            max_attempts: number;
            media_record_id: string | null;
            document_id: string | null;
          }>)
        : [];

      for (const row of rows) {
        const exhausted = row.attempts >= row.max_attempts;

        const { error: updateError } = await store
          .from('brain_ingestion_jobs')
          .update({
            status: exhausted ? 'failed' : 'queued',
            error_code: exhausted ? 'stale_worker' : null,
            error_detail: exhausted ? 'Worker stopped before completing this job.' : null,
            worker_id: null,
            locked_at: null,
            retry_after: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updateError) throw new Error('brain_jobs_reclaim_update_failed');

        if (row.media_record_id && row.document_id) {
          const { error: mediaError } = await store
            .from('knowledge_documents')
            .update({
              media_coverage_status: exhausted ? 'failed' : 'pending',
              extraction_status: exhausted ? 'failed' : null,
              media_coverage_error_code: exhausted ? 'stale_worker' : null,
              media_coverage_error_detail: exhausted
                ? 'Worker stopped before completing this job.'
                : null,
              media_coverage_diagnostics: {
                stage: exhausted ? 'stale_worker' : 'retry_queued',
                error_code: exhausted ? 'stale_worker' : null,
              },
              ...(exhausted ? { processed_at: new Date().toISOString() } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.document_id)
            .not('media_record_id', 'is', null);

          if (mediaError) throw new Error('brain_media_reclaim_update_failed');
        }
      }

      return rows.length;
    },

    async resetFailedJobs(runId: string): Promise<number> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .update({
          status: 'queued',
          attempts: 0,
          error_code: null,
          error_detail: null,
          retry_after: null,
          extraction_status: null,
          extraction_metadata: { stage: 'queued', requeued: true },
          worker_id: null,
          locked_at: null,
          processed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .in('status', ['failed', 'partial'])
        .select('id');

      if (error) throw new Error('brain_jobs_retry_failed');

      return Array.isArray(data) ? data.length : 0;
    },

    async insertArticleDocument(
      document: BrainArticleDocumentRow
    ): Promise<{ status: 'inserted' | 'duplicate' }> {
      const { error } = await store.from('knowledge_documents').insert(document);

      if (!error) return { status: 'inserted' };

      if (isUniqueViolation(error)) return { status: 'duplicate' };

      if (isMissingIngestionVersionColumn(error) && document.ingestion_version) {
        const { ingestion_version, ...row } = document;
        const { error: retryError } = await store.from('knowledge_documents').insert({
          ...row,
          metadata: {
            ...(document.metadata || {}),
            ingestion_version,
          },
        });

        if (!retryError) return { status: 'inserted' };
        if (isUniqueViolation(retryError)) return { status: 'duplicate' };
      }

      throw new Error('brain_document_insert_failed');
    },

    async updateArticleDocument(document: BrainArticleDocumentRow): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update(document)
        .eq('id', document.id)
        .eq('source_type', 'article');

      if (error) throw new Error('brain_document_update_failed');
    },

    async insertMediaCoverageDocument(
      document: MediaCoverageDocumentRow
    ): Promise<{ status: 'inserted' | 'duplicate' }> {
      const { error } = await store.from('knowledge_documents').insert(document);

      if (!error) return { status: 'inserted' };

      if (isUniqueViolation(error)) return { status: 'duplicate' };

      if (isMissingIngestionVersionColumn(error) && document.ingestion_version) {
        const { ingestion_version, ...row } = document;
        const { error: retryError } = await store.from('knowledge_documents').insert({
          ...row,
          metadata: {
            ...(document.metadata || {}),
            ingestion_version,
          },
        });

        if (!retryError) return { status: 'inserted' };
        if (isUniqueViolation(retryError)) return { status: 'duplicate' };
      }

      throw new Error('brain_media_document_insert_failed');
    },

    async linkArticleDocumentToMedia(
      documentId: string,
      mediaRecord: MediaArchiveRecord
    ): Promise<boolean> {
      const { data: document, error: documentError } = await store
        .from('knowledge_documents')
        .select('id,source_type,media_record_id,chunk_count,extraction_status')
        .eq('id', documentId)
        .maybeSingle();

      if (documentError || !document) return false;

      const value = document as {
        id: string;
        source_type: string;
        media_record_id: string | null;
        chunk_count: number | null;
        extraction_status: string | null;
      };

      if (value.source_type !== 'article') return false;
      if (value.media_record_id && value.media_record_id !== mediaRecord.id) return false;

      const chunkCount = Number(value.chunk_count || 0);
      const coverageStatus = chunkCount > 0 ? 'completed' : 'failed';
      const textQuality =
        chunkCount > 0
          ? value.extraction_status === 'complete'
            ? 'full_text'
            : 'partial_text'
          : 'metadata_only';

      const { error } = await store
        .from('knowledge_documents')
        .update({
          media_record_id: mediaRecord.id,
          media_outlet: mediaRecord.outlet.slice(0, 300),
          media_kind: mediaRecord.kind.slice(0, 60),
          media_topic: mediaRecord.topic.slice(0, 120),
          media_language: mediaRecord.lang.slice(0, 16),
          media_published_date: mediaRecord.published_date,
          media_archive_status: mediaRecord.status.slice(0, 40),
          media_coverage_status: coverageStatus,
          media_text_quality: textQuality,
          media_coverage_method: 'linked_article',
          media_coverage_error_code: null,
          media_coverage_error_detail: null,
          media_coverage_diagnostics: {
            linked_existing_article: true,
            chunk_count: chunkCount,
          },
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .eq('source_type', 'article');

      if (error) throw new Error('brain_media_article_link_failed');

      return true;
    },

    async updateMediaCoverageDocument(document: MediaCoverageDocumentRow): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update(document)
        .eq('id', document.id)
        .eq('media_record_id', document.media_record_id);

      if (error) throw new Error('brain_media_document_update_failed');
    },

    async setMediaCoverageStatus(
      documentId: string,
      patch: MediaCoverageStatusPatch
    ): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .not('media_record_id', 'is', null);

      if (error) throw new Error('brain_media_status_update_failed');
    },

    async updateMediaCoverageMetadata(
      documentId: string,
      patch: MediaCoverageMetadataPatch
    ): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .not('media_record_id', 'is', null);

      if (error) throw new Error('brain_media_metadata_update_failed');
    },

    async insertArticleChunks(chunks: KnowledgeChunkWithEmbedding[]): Promise<void> {
      const batchSize = 25;

      for (let index = 0; index < chunks.length; index += batchSize) {
        const batch = chunks.slice(index, index + batchSize).map((chunk) => ({
          ...chunk,
          embedding: toPgVector(chunk.embedding),
        }));

        const { error } = await store.from('knowledge_chunks').upsert(batch, { onConflict: 'id' });

        if (error) throw new Error('brain_chunks_insert_failed');
      }
    },

    async deleteArticleChunksExcept(documentId: string, keepIds: string[]): Promise<number> {
      const { data, error } = await store
        .from('knowledge_chunks')
        .select('id')
        .eq('document_id', documentId)
        .limit(10_000);

      if (error) throw new Error('brain_chunks_query_failed');

      const keep = new Set(keepIds);
      const stale = (Array.isArray(data) ? data : [])
        .map((row) => (row && typeof row === 'object' ? String((row as { id?: unknown }).id) : ''))
        .filter((id) => id && !keep.has(id));

      if (stale.length === 0) return 0;

      for (let index = 0; index < stale.length; index += 100) {
        const batch = stale.slice(index, index + 100);
        const { error: deleteError } = await store
          .from('knowledge_chunks')
          .delete()
          .eq('document_id', documentId)
          .in('id', batch);

        if (deleteError) throw new Error('brain_chunks_delete_failed');
      }

      return stale.length;
    },

    async completeArticleDocument(
      documentId: string,
      extractionStatus: string = 'complete'
    ): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update({
          ingestion_status: 'completed',
          extraction_status: extractionStatus,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) throw new Error('brain_document_complete_failed');
    },

    async getJob(jobId: string): Promise<BrainJobRow | null> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (error) throw new Error('brain_job_query_failed');

      return (data as unknown as BrainJobRow) || null;
    },

    async resetJob(jobId: string): Promise<BrainJobRow | null> {
      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .update({
          status: 'queued',
          attempts: 0,
          retry_after: null,
          error_code: null,
          error_detail: null,
          extraction_status: null,
          extraction_metadata: { stage: 'queued', requeued: true },
          worker_id: null,
          locked_at: null,
          processed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .in('status', ['failed', 'partial', 'duplicate'])
        .select('*')
        .maybeSingle();

      if (error) throw new Error('brain_job_retry_failed');

      return (data as unknown as BrainJobRow) || null;
    },

    async deleteArticleDocument(documentId: string): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .delete()
        .eq('id', documentId)
        .eq('source_type', 'article');

      if (error) throw new Error('brain_document_delete_failed');
    },
  };
}

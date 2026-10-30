import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isMissingIngestionVersionColumn, toPgVector } from '@/lib/knowledge/rag/supabaseStore';
import type { KnowledgeChunkWithEmbedding, KnowledgeDocumentRow } from '@/lib/knowledge/rag/types';
import type { RagEnvironment } from '@/lib/knowledge/rag/config';

export type BrainJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'duplicate'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type BrainRunStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

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

export type ArticleDocumentLookup = {
  id: string;
  title: string;
  normalized_url: string | null;
  canonical_url: string | null;
  source_url: string | null;
  content_hash: string | null;
  created_at: string;
};

export type DuplicateMatch = {
  documentId: string;
  title: string;
  match: 'normalized_url' | 'canonical_url' | 'content_hash';
  ingestionStatus: string | null;
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

function isUniqueViolation(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
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
        .select('id,title,normalized_url,canonical_url,source_url,content_hash,created_at')
        .eq('source_type', 'article')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error('brain_documents_query_failed');

      return Array.isArray(data) ? (data as unknown as ArticleDocumentLookup[]) : [];
    },

    async findDuplicate(input: {
      normalizedUrl?: string | null;
      canonicalUrl?: string | null;
      contentHash?: string | null;
    }): Promise<DuplicateMatch | null> {
      if (input.normalizedUrl) {
        const { data } = await store
          .from('knowledge_documents')
          .select('id,title,ingestion_status')
          .eq('source_type', 'article')
          .eq('normalized_url', input.normalizedUrl)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as { id: string; title: string; ingestion_status?: string | null };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'normalized_url',
            ingestionStatus: row.ingestion_status ?? null,
          };
        }
      }

      if (input.canonicalUrl && input.canonicalUrl !== input.normalizedUrl) {
        const { data } = await store
          .from('knowledge_documents')
          .select('id,title,ingestion_status')
          .eq('source_type', 'article')
          .eq('canonical_url', input.canonicalUrl)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as { id: string; title: string; ingestion_status?: string | null };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'canonical_url',
            ingestionStatus: row.ingestion_status ?? null,
          };
        }
      }

      if (input.contentHash) {
        const { data } = await store
          .from('knowledge_documents')
          .select('id,title,ingestion_status')
          .eq('source_type', 'article')
          .eq('content_hash', input.contentHash)
          .limit(1)
          .maybeSingle();

        if (data) {
          const row = data as { id: string; title: string; ingestion_status?: string | null };
          return {
            documentId: String(row.id),
            title: String(row.title),
            match: 'content_hash',
            ingestionStatus: row.ingestion_status ?? null,
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
      jobs: Array<{ inputUrl: string; normalizedUrl: string }>
    ): Promise<BrainJobRow[]> {
      if (jobs.length === 0) return [];

      const rows = jobs.map((job) => ({
        run_id: runId,
        input_url: job.inputUrl.slice(0, 4000),
        normalized_url: job.normalizedUrl.slice(0, 2048),
        status: 'queued',
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

    async findActiveJobsByUrls(urls: string[]): Promise<Array<{ run_id: string; normalized_url: string }>> {
      if (urls.length === 0) return [];

      const { data, error } = await store
        .from('brain_ingestion_jobs')
        .select('run_id,normalized_url')
        .in('normalized_url', urls)
        .in('status', ['queued', 'processing'])
        .limit(2000);

      if (error) throw new Error('brain_jobs_query_failed');

      return Array.isArray(data)
        ? (data as Array<{ run_id: string; normalized_url: string }>)
        : [];
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
        .select('id,attempts,max_attempts')
        .eq('run_id', runId)
        .eq('status', 'processing')
        .lt('locked_at', cutoff)
        .limit(200);

      if (error) throw new Error('brain_jobs_reclaim_query_failed');

      const rows = Array.isArray(data)
        ? (data as Array<{ id: string; attempts: number; max_attempts: number }>)
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
          worker_id: null,
          locked_at: null,
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

    async insertArticleChunks(chunks: KnowledgeChunkWithEmbedding[]): Promise<void> {      const batchSize = 25;

      for (let index = 0; index < chunks.length; index += batchSize) {
        const batch = chunks.slice(index, index + batchSize).map((chunk) => ({
          ...chunk,
          embedding: toPgVector(chunk.embedding),
        }));

        const { error } = await store
          .from('knowledge_chunks')
          .upsert(batch, { onConflict: 'id' });

        if (error) throw new Error('brain_chunks_insert_failed');
      }
    },

    async completeArticleDocument(documentId: string): Promise<void> {
      const { error } = await store
        .from('knowledge_documents')
        .update({
          ingestion_status: 'completed',
          extraction_status: 'ok',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) throw new Error('brain_document_complete_failed');
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

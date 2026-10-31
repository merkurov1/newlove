import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from '@/lib/knowledge/rag/config';

import type {
  BrainChunkForGraph,
  BrainDocumentForGraph,
  BrainGraphJob,
  BrainGraphProgress,
  BrainGraphRun,
  BrainGraphRunStatus,
} from './types';

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

export type BrainGraphStore = NonNullable<ReturnType<typeof createBrainGraphStore>>;

export function createBrainGraphStore(env: RagEnvironment = process.env) {
  const store = createServiceClient(env);

  if (!store) return null;

  return {
    client: store,

    async listDocuments(limit = 2000): Promise<BrainDocumentForGraph[]> {
      const { data, error } = await store
        .from('knowledge_documents')
        .select(
          'id,title,source_type,source_path,source_url,canonical_url,author,language,published_at,content_hash,source_sha256,chunk_count,metadata'
        )
        .eq('ingestion_status', 'completed')
        .gt('chunk_count', 0)
        .order('source_type', { ascending: true })
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) throw new Error('brain_graph_documents_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainDocumentForGraph[]) : [];
    },

    async getDocument(documentId: string): Promise<BrainDocumentForGraph | null> {
      const { data, error } = await store
        .from('knowledge_documents')
        .select(
          'id,title,source_type,source_path,source_url,canonical_url,author,language,published_at,content_hash,source_sha256,chunk_count,metadata'
        )
        .eq('id', documentId)
        .maybeSingle();

      if (error) throw new Error('brain_graph_document_query_failed');

      return (data as unknown as BrainDocumentForGraph) || null;
    },

    async getChunks(documentId: string): Promise<BrainChunkForGraph[]> {
      const { data, error } = await store
        .from('knowledge_chunks')
        .select(
          'id,document_id,chunk_index,content,heading,section_path,section_index,line_start,line_end'
        )
        .eq('document_id', documentId)
        .order('chunk_index', { ascending: true })
        .limit(2000);

      if (error) throw new Error('brain_graph_chunks_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainChunkForGraph[]) : [];
    },

    async getDocumentExtraction(documentId: string) {
      const { data, error } = await store
        .from('brain_document_extractions')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle();

      if (error) throw new Error('brain_graph_extraction_query_failed');

      return data as Record<string, unknown> | null;
    },

    async listDocumentExtractions(): Promise<Array<Record<string, unknown>>> {
      const { data, error } = await store
        .from('brain_document_extractions')
        .select('*')
        .limit(5000);

      if (error) throw new Error('brain_graph_extractions_query_failed');

      return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    },

    async recordExtraction(input: {
      documentId: string;
      contentHash: string;
      extractorVersion: string;
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';
      entityCount?: number;
      relationshipCount?: number;
      mentionCount?: number;
      chunkCount?: number;
      errorCode?: string | null;
      errorDetail?: string | null;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      const row = {
        document_id: input.documentId,
        content_hash: input.contentHash,
        extractor_version: input.extractorVersion,
        status: input.status,
        entity_count: input.entityCount ?? 0,
        relationship_count: input.relationshipCount ?? 0,
        mention_count: input.mentionCount ?? 0,
        chunk_count: input.chunkCount ?? 0,
        error_code: input.errorCode ?? null,
        error_detail: input.errorDetail ?? null,
        metadata: input.metadata ?? {},
        last_extracted_at:
          input.status === 'completed' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };

      const { error } = await store
        .from('brain_document_extractions')
        .upsert(row, { onConflict: 'document_id' });

      if (error) throw new Error('brain_graph_extraction_write_failed');
    },

    async replaceDocumentGraph(input: {
      documentId: string;
      extractorVersion: string;
      entities: unknown[];
      mentions: unknown[];
      relationships: unknown[];
      topics: unknown[];
    }): Promise<{ entities: number; mentions: number; relationships: number; topics: number }> {
      const { data, error } = await store.rpc('brain_replace_document_graph', {
        p_document_id: input.documentId,
        p_entities: input.entities,
        p_mentions: input.mentions,
        p_relationships: input.relationships,
        p_topics: input.topics,
        p_extractor_version: input.extractorVersion,
      });

      if (error) throw new Error('brain_graph_replace_failed');

      const result = (data || {}) as Record<string, unknown>;

      return {
        entities: Number(result.entities) || 0,
        mentions: Number(result.mentions) || 0,
        relationships: Number(result.relationships) || 0,
        topics: Number(result.topics) || 0,
      };
    },

    async upsertSummary(input: {
      scopeType: 'document' | 'chapter' | 'project' | 'theme';
      scopeKey: string;
      title: string;
      summary: string;
      documentIds: string[];
      entityIds: string[];
      confidence: number;
      provenance: Record<string, unknown>;
      extractorVersion: string;
      model: string;
    }): Promise<void> {
      const { error } = await store.from('brain_thematic_summaries').upsert(
        {
          scope_type: input.scopeType,
          scope_key: input.scopeKey,
          title: input.title,
          summary: input.summary,
          document_ids: input.documentIds,
          entity_ids: input.entityIds,
          confidence: input.confidence,
          provenance: input.provenance,
          extractor_version: input.extractorVersion,
          model: input.model,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'scope_type,scope_key' }
      );

      if (error) throw new Error('brain_graph_summary_write_failed');
    },

    async listSummaries(scopeType?: 'document' | 'chapter' | 'project' | 'theme', limit = 500) {
      let query = store
        .from('brain_thematic_summaries')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (scopeType) query = query.eq('scope_type', scopeType);

      const { data, error } = await query;

      if (error) throw new Error('brain_graph_summaries_query_failed');

      return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    },

    async createRun(input: {
      extractorVersion: string;
      model: string;
      totalDocuments: number;
      metadata?: Record<string, unknown>;
    }): Promise<BrainGraphRun> {
      const { data, error } = await store
        .from('brain_graph_runs')
        .insert({
          status: 'running',
          extractor_version: input.extractorVersion,
          model: input.model,
          total_documents: input.totalDocuments,
          metadata: input.metadata ?? {},
        })
        .select('*')
        .single();

      if (error || !data) throw new Error('brain_graph_run_create_failed');

      return data as unknown as BrainGraphRun;
    },

    async getRun(runId: string): Promise<BrainGraphRun | null> {
      const { data, error } = await store
        .from('brain_graph_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();

      if (error) throw new Error('brain_graph_run_query_failed');

      return (data as unknown as BrainGraphRun) || null;
    },

    async listRecentRuns(limit = 10): Promise<BrainGraphRun[]> {
      const { data, error } = await store
        .from('brain_graph_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error('brain_graph_runs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainGraphRun[]) : [];
    },

    async listRunningRuns(limit = 100): Promise<BrainGraphRun[]> {
      const { data, error } = await store
        .from('brain_graph_runs')
        .select('*')
        .eq('status', 'running')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new Error('brain_graph_runs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainGraphRun[]) : [];
    },

    async heartbeatJob(jobId: string, workerId: string): Promise<void> {
      const { error } = await store
        .from('brain_graph_jobs')
        .update({
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('worker_id', workerId)
        .eq('status', 'processing');

      if (error) throw new Error('brain_graph_job_heartbeat_failed');
    },

    async recoverStaleJobs(staleSeconds = 900): Promise<number> {
      const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();
      const { data, error } = await store
        .from('brain_graph_jobs')
        .select('id,attempts,max_attempts')
        .eq('status', 'processing')
        .or(`locked_at.is.null,locked_at.lt."${cutoff}"`)
        .limit(500);

      if (error) throw new Error('brain_graph_reclaim_query_failed');

      const rows = Array.isArray(data)
        ? (data as Array<{ id: string; attempts: number; max_attempts: number }>)
        : [];

      for (const row of rows) {
        const exhausted = row.attempts >= row.max_attempts;

        const { error: updateError } = await store
          .from('brain_graph_jobs')
          .update({
            status: exhausted ? 'failed' : 'queued',
            error_code: exhausted ? 'stale_worker' : null,
            error_detail: exhausted ? 'Worker lease expired before completion.' : null,
            worker_id: null,
            locked_at: null,
            retry_after: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updateError) throw new Error('brain_graph_reclaim_update_failed');
      }

      return rows.length;
    },

    async updateRun(runId: string, patch: Partial<BrainGraphRun>): Promise<void> {
      const { error } = await store
        .from('brain_graph_runs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', runId);

      if (error) throw new Error('brain_graph_run_update_failed');
    },

    async insertJobs(
      runId: string,
      jobs: Array<{ documentId: string; contentHash: string }>
    ): Promise<BrainGraphJob[]> {
      if (jobs.length === 0) return [];

      const { data, error } = await store
        .from('brain_graph_jobs')
        .upsert(
          jobs.map((job) => ({
            run_id: runId,
            document_id: job.documentId,
            content_hash: job.contentHash,
            status: 'queued',
          })),
          { onConflict: 'run_id,document_id', ignoreDuplicates: true }
        )
        .select('*');

      if (error) throw new Error('brain_graph_jobs_insert_failed');

      return Array.isArray(data) ? (data as unknown as BrainGraphJob[]) : [];
    },

    async getJobs(runId: string): Promise<BrainGraphJob[]> {
      const { data, error } = await store
        .from('brain_graph_jobs')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true })
        .limit(2000);

      if (error) throw new Error('brain_graph_jobs_query_failed');

      return Array.isArray(data) ? (data as unknown as BrainGraphJob[]) : [];
    },

    async updateJob(jobId: string, patch: Partial<BrainGraphJob>): Promise<void> {
      const { error } = await store
        .from('brain_graph_jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw new Error('brain_graph_job_update_failed');
    },

    async claimNextJob(runId: string, workerId: string): Promise<BrainGraphJob | null> {
      const { data, error } = await store.rpc('brain_claim_next_graph_job', {
        p_run_id: runId,
        p_worker: workerId,
      });

      if (error) throw new Error('brain_graph_job_claim_failed');

      const rows = Array.isArray(data) ? data : data ? [data] : [];

      return (rows[0] as unknown as BrainGraphJob) || null;
    },

    async reclaimStaleJobs(runId: string, staleSeconds = 900): Promise<number> {
      const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();
      const { data, error } = await store
        .from('brain_graph_jobs')
        .select('id,attempts,max_attempts')
        .eq('run_id', runId)
        .eq('status', 'processing')
        .or(`locked_at.is.null,locked_at.lt."${cutoff}"`)
        .limit(500);

      if (error) throw new Error('brain_graph_reclaim_query_failed');

      const rows = Array.isArray(data)
        ? (data as Array<{ id: string; attempts: number; max_attempts: number }>)
        : [];

      for (const row of rows) {
        const exhausted = row.attempts >= row.max_attempts;

        const { error: updateError } = await store
          .from('brain_graph_jobs')
          .update({
            status: exhausted ? 'failed' : 'queued',
            error_code: exhausted ? 'stale_worker' : null,
            error_detail: exhausted ? 'Worker stopped before completing this document.' : null,
            worker_id: null,
            locked_at: null,
            retry_after: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updateError) throw new Error('brain_graph_reclaim_update_failed');
      }

      return rows.length;
    },

    async resetFailedJobs(runId: string): Promise<number> {
      const { data, error } = await store
        .from('brain_graph_jobs')
        .update({
          status: 'queued',
          attempts: 0,
          retry_after: null,
          error_code: null,
          error_detail: null,
          worker_id: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .in('status', ['failed', 'skipped'])
        .select('id');

      if (error) throw new Error('brain_graph_jobs_retry_failed');

      return Array.isArray(data) ? data.length : 0;
    },
  };
}

export function computeGraphProgress(jobs: BrainGraphJob[]): BrainGraphProgress {
  const counts = {
    queued: 0,
    processing: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const job of jobs) {
    if (job.status in counts) counts[job.status as keyof typeof counts] += 1;
  }

  return {
    total: jobs.length,
    ...counts,
    done: counts.queued === 0 && counts.processing === 0,
  };
}

export function graphRunStatus(progress: BrainGraphProgress): BrainGraphRunStatus {
  if (!progress.done) return 'running';
  return progress.failed > 0 ? 'completed_with_errors' : 'completed';
}

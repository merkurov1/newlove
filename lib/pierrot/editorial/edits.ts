import { createHash } from 'node:crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { loadManuscriptChunksByIds, loadManuscriptInventory } from '@/lib/knowledge/rag/manuscript';
import { resolveManuscriptChapter } from '@/lib/knowledge/rag/manuscriptStructure';

assertServerOnly('lib/pierrot/editorial/edits');

/**
 * Safe manuscript editing workflow.
 *
 * The canonical source file and the indexed chunks are never overwritten.
 * A proposal is an artifact; approval appends a separately stored revision
 * with the original passage, the approved text, the authorizing owner and a
 * content hash. Reverting means selecting an earlier revision, not rewriting
 * history.
 */

export type ManuscriptEditStatus = 'proposed' | 'approved' | 'rejected' | 'superseded';

export type ManuscriptEditProposal = {
  id: string;
  projectId: string;
  chapterNumber: number | null;
  chapterLabel: string | null;
  chunkId: string;
  original: string;
  proposed: string;
  rationale: string;
  status: ManuscriptEditStatus;
  createdAt: string;
  updatedAt: string;
  conversationId: string | null;
  revisionId: string | null;
};

export type ManuscriptRevision = {
  id: string;
  projectId: string;
  proposalId: string;
  chapterNumber: number | null;
  chapterLabel: string | null;
  chunkId: string;
  original: string;
  approvedText: string;
  contentHash: string;
  revision: number;
  approvedAt: string;
  approvedBy: string;
};

const PROPOSAL_TYPE = 'manuscript_edit_proposal';
const REVISION_TYPE = 'manuscript_revision';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storeOrDefault(store?: SupabaseClient | null): SupabaseClient {
  return store || getServerSupabaseClient({ useServiceRole: true });
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function mapProposal(row: Record<string, unknown>): ManuscriptEditProposal | null {
  const metadata = object(row.metadata);
  const id = text(row.id);
  if (!id || text(row.artifact_type) !== PROPOSAL_TYPE) return null;
  return {
    id,
    projectId: text(row.project_id),
    chapterNumber:
      typeof metadata.chapter_number === 'number' ? metadata.chapter_number : null,
    chapterLabel: text(metadata.chapter_label) || null,
    chunkId: text(metadata.chunk_id),
    original: text(metadata.original),
    proposed: text(metadata.proposed),
    rationale: text(metadata.rationale),
    status: (['proposed', 'approved', 'rejected', 'superseded'].includes(text(metadata.status))
      ? text(metadata.status)
      : 'proposed') as ManuscriptEditStatus,
    createdAt: text(metadata.created_at) || text(row.created_at),
    updatedAt: text(row.updated_at) || text(row.created_at),
    conversationId: text(metadata.conversation_id) || null,
    revisionId: text(metadata.revision_id) || null,
  };
}

function mapRevision(row: Record<string, unknown>): ManuscriptRevision | null {
  const metadata = object(row.metadata);
  const id = text(row.id);
  if (!id || text(row.artifact_type) !== REVISION_TYPE) return null;
  return {
    id,
    projectId: text(row.project_id),
    proposalId: text(metadata.proposal_id),
    chapterNumber:
      typeof metadata.chapter_number === 'number' ? metadata.chapter_number : null,
    chapterLabel: text(metadata.chapter_label) || null,
    chunkId: text(metadata.chunk_id),
    original: text(metadata.original),
    approvedText: text(metadata.approved_text),
    contentHash: text(metadata.content_hash),
    revision: Number(metadata.revision || 1),
    approvedAt: text(metadata.approved_at) || text(row.created_at),
    approvedBy: text(metadata.approved_by),
  };
}

export async function listManuscriptEditProposals(input: {
  store?: SupabaseClient | null;
  ownerUserId: string;
  projectId: string;
  limit?: number;
}): Promise<{ proposals: ManuscriptEditProposal[]; error: string | null }> {
  const store = storeOrDefault(input.store);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', PROPOSAL_TYPE)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));

  if (error) return { proposals: [], error: error.message };
  return {
    proposals: (Array.isArray(data) ? data : [])
      .map((row) => mapProposal(row as Record<string, unknown>))
      .filter((item): item is ManuscriptEditProposal => item !== null),
    error: null,
  };
}

export async function listManuscriptRevisions(input: {
  store?: SupabaseClient | null;
  ownerUserId: string;
  projectId: string;
  limit?: number;
}): Promise<{ revisions: ManuscriptRevision[]; error: string | null }> {
  const store = storeOrDefault(input.store);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', REVISION_TYPE)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));

  if (error) return { revisions: [], error: error.message };
  return {
    revisions: (Array.isArray(data) ? data : [])
      .map((row) => mapRevision(row as Record<string, unknown>))
      .filter((item): item is ManuscriptRevision => item !== null),
    error: null,
  };
}

export async function proposeManuscriptEdit(input: {
  store?: SupabaseClient | null;
  ownerUserId: string;
  projectId: string;
  conversationId?: string | null;
  chapterNumber?: number | null;
  chunkId: string;
  original: string;
  proposed: string;
  rationale?: string;
}): Promise<
  | { ok: true; proposal: ManuscriptEditProposal }
  | { ok: false; error: string }
> {
  const store = storeOrDefault(input.store);
  const original = input.original.trim();
  const proposed = input.proposed.trim();

  if (!input.chunkId.trim()) return { ok: false, error: 'chunk_id_required' };
  if (original.length < 20) return { ok: false, error: 'original_too_short' };
  if (proposed.length < 20) return { ok: false, error: 'proposed_too_short' };
  if (original === proposed) return { ok: false, error: 'no_change' };

  let inventory: Awaited<ReturnType<typeof loadManuscriptInventory>>;
  try {
    inventory = await loadManuscriptInventory({ store, useCache: false });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `${error.name}:${error.message}` : 'manuscript_unavailable',
    };
  }

  const [chunk] = await loadManuscriptChunksByIds({
    inventory,
    store,
    chunkIds: [input.chunkId],
  });
  if (!chunk) return { ok: false, error: 'chunk_not_found' };
  if (!chunk.content.includes(original)) return { ok: false, error: 'original_not_in_source' };

  const chapter =
    input.chapterNumber !== null && input.chapterNumber !== undefined
      ? resolveManuscriptChapter(inventory.structure, { number: input.chapterNumber }).chapter
      : inventory.structure.chapters.find(
          (item) =>
            chunk.chunkIndex >= item.startChunkIndex && chunk.chunkIndex <= item.endChunkIndex
        ) || null;

  const now = new Date().toISOString();
  const metadata = {
    chapter_number: chapter?.number ?? input.chapterNumber ?? null,
    chapter_label: chapter?.label ?? null,
    chunk_id: chunk.chunkId,
    chunk_index: chunk.chunkIndex,
    char_start: chunk.charStart,
    char_end: chunk.charEnd,
    original,
    proposed,
    rationale: (input.rationale || '').slice(0, 2_000),
    status: 'proposed',
    conversation_id: input.conversationId || null,
    created_at: now,
  };

  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Правка · ${chapter?.label || `chunk ${chunk.chunkIndex}`}`,
      artifact_type: PROPOSAL_TYPE,
      content: `${chapter?.label || `chunk ${chunk.chunkIndex}`}\n\nORIGINAL:\n${original}\n\nPROPOSED:\n${proposed}`,
      source_conversation_id: input.conversationId || null,
      metadata,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  const proposal = mapProposal(data as Record<string, unknown>);
  return proposal ? { ok: true, proposal } : { ok: false, error: 'proposal_map_failed' };
}

export async function approveManuscriptEdit(input: {
  store?: SupabaseClient | null;
  ownerUserId: string;
  projectId: string;
  proposalId: string;
}): Promise<{ ok: true; revision: ManuscriptRevision } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('id', input.proposalId)
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', PROPOSAL_TYPE)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'proposal_not_found' };

  const proposal = mapProposal(data as Record<string, unknown>);
  if (!proposal) return { ok: false, error: 'proposal_invalid' };
  if (proposal.status !== 'proposed') {
    return { ok: false, error: `proposal_${proposal.status}` };
  }

  const existing = await listManuscriptRevisions({
    store,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    limit: 200,
  });
  if (existing.error) return { ok: false, error: existing.error };

  const revisionNumber =
    existing.revisions.reduce((max, revision) => Math.max(max, revision.revision), 0) + 1;
  const now = new Date().toISOString();
  const contentHash = hash(proposal.proposed);
  const revisionMetadata = {
    proposal_id: proposal.id,
    chapter_number: proposal.chapterNumber,
    chapter_label: proposal.chapterLabel,
    chunk_id: proposal.chunkId,
    original: proposal.original,
    approved_text: proposal.proposed,
    content_hash: contentHash,
    revision: revisionNumber,
    approved_at: now,
    approved_by: input.ownerUserId,
  };

  const revisionInsert = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Ревизия ${revisionNumber} · ${proposal.chapterLabel || proposal.chunkId}`,
      artifact_type: REVISION_TYPE,
      content: `REVISION ${revisionNumber}\n\nORIGINAL:\n${proposal.original}\n\nAPPROVED:\n${proposal.proposed}`,
      metadata: revisionMetadata,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (revisionInsert.error) return { ok: false, error: revisionInsert.error.message };

  const revision = mapRevision(revisionInsert.data as Record<string, unknown>);
  if (!revision) return { ok: false, error: 'revision_map_failed' };

  const { error: updateError } = await store
    .from('pierrot_project_artifacts')
    .update({
      metadata: {
        ...object((data as Record<string, unknown>).metadata),
        status: 'approved',
        revision_id: revision.id,
        approved_at: now,
        approved_by: input.ownerUserId,
      },
      updated_at: now,
    })
    .eq('id', proposal.id)
    .eq('owner_user_id', input.ownerUserId);

  if (updateError) {
    return {
      ok: false,
      error: `revision_saved_proposal_status_failed:${updateError.message}`,
    };
  }

  return { ok: true, revision };
}

export async function rejectManuscriptEdit(input: {
  store?: SupabaseClient | null;
  ownerUserId: string;
  projectId: string;
  proposalId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('id', input.proposalId)
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', PROPOSAL_TYPE)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'proposal_not_found' };

  const now = new Date().toISOString();
  const { error: updateError } = await store
    .from('pierrot_project_artifacts')
    .update({
      metadata: {
        ...object((data as Record<string, unknown>).metadata),
        status: 'rejected',
        rejected_at: now,
        rejection_reason: (input.reason || '').slice(0, 1_000),
      },
      updated_at: now,
    })
    .eq('id', input.proposalId)
    .eq('owner_user_id', input.ownerUserId);

  return updateError ? { ok: false, error: updateError.message } : { ok: true };
}

/** Minimal line diff for the owner UI. It never writes to the source file. */
export function buildEditDiff(original: string, proposed: string): string {
  const left = original.split(/\r?\n/);
  const right = proposed.split(/\r?\n/);
  const maxCells = 250_000;
  if (left.length * right.length > maxCells) {
    return `- ${original.replace(/\s+/g, ' ').trim()}\n+ ${proposed.replace(/\s+/g, ' ').trim()}`;
  }

  const dp: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0)
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        left[i] === right[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push(`  ${left[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${left[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${right[j]}`);
      j += 1;
    }
  }
  while (i < left.length) lines.push(`- ${left[i++]}`);
  while (j < right.length) lines.push(`+ ${right[j++]}`);

  return lines.join('\n');
}

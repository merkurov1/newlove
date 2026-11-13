import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  composeProjectBrief,
  loadUnframedProject,
  verifiedProjectMaterialIds,
} from './project';

assertServerOnly('lib/pierrot/editorial/projectSync');

/**
 * Idempotent, additive sync of verified UNFRAMED material into the existing
 * project workspace. It never deletes a relation, never duplicates a Brain
 * document and never rewrites the manuscript. The brief is regenerated from
 * verified sources and revisioned.
 */
export async function syncUnframedProjectKnowledge(input: {
  ownerUserId: string;
  store?: SupabaseClient | null;
  applyBrief?: boolean;
}): Promise<{
  ok: boolean;
  projectId: string | null;
  linkedDocumentIds: string[];
  briefSaved: boolean;
  briefRevision: number | null;
  error: string | null;
}> {
  const store = input.store ?? getServerSupabaseClient({ useServiceRole: true });
  const state = await loadUnframedProject({
    ownerUserId: input.ownerUserId,
    store,
    includeManuscript: true,
  });

  if (!state.project) {
    return {
      ok: false,
      projectId: null,
      linkedDocumentIds: [],
      briefSaved: false,
      briefRevision: null,
      error: state.projectUnavailable || 'project_not_found',
    };
  }

  if (state.materialsUnavailable) {
    return {
      ok: false,
      projectId: state.project.id,
      linkedDocumentIds: [],
      briefSaved: false,
      briefRevision: null,
      error: state.materialsUnavailable,
    };
  }

  const verifiedIds = verifiedProjectMaterialIds(state.materials);
  const rows = verifiedIds.map((documentId) => ({
    project_id: state.project!.id,
    document_id: documentId,
    owner_user_id: input.ownerUserId,
  }));

  if (rows.length > 0) {
    const { error } = await store
      .from('pierrot_project_knowledge')
      .upsert(rows, { onConflict: 'project_id,document_id' });
    if (error) {
      return {
        ok: false,
        projectId: state.project.id,
        linkedDocumentIds: [],
        briefSaved: false,
        briefRevision: null,
        error: error.message,
      };
    }
  }

  let briefSaved = false;
  let briefRevision: number | null = state.project.briefRevision;
  if (input.applyBrief !== false) {
    const brief = composeProjectBrief({
      ...state,
      materials: state.materials.map((material) => ({
        ...material,
        relation: verifiedIds.includes(material.id) ? 'linked' : material.relation,
      })),
    });
    const revision =
      state.project.projectBrief.trim() === brief.markdown.trim()
        ? state.project.briefRevision
        : state.project.briefRevision + 1;
    const { error } = await store
      .from('pierrot_projects')
      .update({
        project_brief: brief.markdown.slice(0, 60_000),
        brief_revision: revision,
        updated_at: new Date().toISOString(),
      })
      .eq('id', state.project.id)
      .eq('owner_user_id', input.ownerUserId);
    if (error) {
      return {
        ok: false,
        projectId: state.project.id,
        linkedDocumentIds: verifiedIds,
        briefSaved: false,
        briefRevision: null,
        error: error.message,
      };
    }
    briefSaved = true;
    briefRevision = revision;
  }

  return {
    ok: true,
    projectId: state.project.id,
    linkedDocumentIds: verifiedIds,
    briefSaved,
    briefRevision,
    error: null,
  };
}

import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import { createClient } from '@supabase/supabase-js';
import {
  UNFRAMED_MANUSCRIPT_ID,
  loadManuscriptInventory,
  type ManuscriptInventory,
} from '@/lib/knowledge/rag/manuscript';
import { resolveManuscriptChapter, type ManuscriptChapter } from '@/lib/knowledge/rag/manuscriptStructure';
import { CONTAINER_EPISODE, SPECTRAL_TIGER_EPISODE } from '@/lib/unframed/episodes';
import type { DiscoveryCandidate, EpisodeStatus } from './types';

assertServerOnly('lib/pierrot/editorial/episodes');

/**
 * Persistent UNFRAMED episode registry.
 *
 * It reuses the existing project artifact store: one `unframed_episode`
 * artifact per episode, one `unframed_script` artifact per script version, one
 * `unframed_story_decision` per rejected/accepted story, and one
 * `unframed_publication_draft` for page preparation. No duplicate manuscript
 * or episode content is created; source references point at Brain chunk IDs.
 */

export const EPISODE_ARTIFACT = 'unframed_episode';
export const SCRIPT_ARTIFACT = 'unframed_script';
export const DEVELOPMENT_ARTIFACT = 'unframed_development';
export const STORY_DECISION_ARTIFACT = 'unframed_story_decision';
export const PUBLICATION_DRAFT_ARTIFACT = 'unframed_publication_draft';
export const EDITORIAL_PROFILE_ARTIFACT = 'unframed_editorial_profile';
export const DISCOVERY_SET_ARTIFACT = 'unframed_discovery_set';

export type EpisodeSourcePassage = {
  chunkId: string;
  chunkIndex: number;
  heading: string;
  sectionPath: string[];
  excerpt: string;
  charStart: number;
  charEnd: number;
};

export type EpisodeRecord = {
  id: string;
  number: number;
  title: string;
  workingTitle: string;
  status: EpisodeStatus;
  manuscriptDocumentId: string;
  chapterNumber: number | null;
  chapterLabel: string | null;
  chunkIds: string[];
  sourcePassages: EpisodeSourcePassage[];
  centralStory: string;
  thesis: string;
  narrativeAngle: string;
  historicalPeriod: string;
  keyCharacters: string[];
  keyEvents: string[];
  visualConcept: string;
  scriptId: string | null;
  approvedScriptId: string | null;
  voiceover: string;
  visualPrompts: string[];
  music: string;
  videoUrl: string;
  publicationDate: string | null;
  publicPageUrl: string;
  description: string;
  relatedEpisodes: number[];
  editorialNotes: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{ status: EpisodeStatus; at: string; note: string }>;
};

export type ScriptVersion = {
  id: string;
  episodeNumber: number;
  revision: number;
  status: 'draft' | 'approved' | 'superseded';
  title: string;
  content: string;
  sourceChunkIds: string[];
  createdAt: string;
  approvedAt: string | null;
  note: string;
};

export type RejectedStory = {
  id: string;
  number: number | null;
  title: string;
  chapterNumber: number | null;
  chunkIds: string[];
  reason: string;
  createdAt: string;
};

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown, limit = 30): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
    : [];
}

function numbers(value: unknown, limit = 30): number[] {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item))
        .slice(0, limit)
    : [];
}

function storeOrDefault(store?: SupabaseClient | null, env?: RagEnvironment): SupabaseClient {
  return store || (env ? createServiceClient(env) : null) || getServerSupabaseClient({ useServiceRole: true });
}

export function mapEpisodeArtifact(row: Record<string, unknown>): EpisodeRecord | null {
  if (text(row.artifact_type) !== EPISODE_ARTIFACT) return null;
  const id = text(row.id);
  if (!id) return null;
  const meta = object(row.metadata);

  const passages: EpisodeSourcePassage[] = Array.isArray(meta.source_passages)
    ? meta.source_passages
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          chunkId: text(item.chunk_id),
          chunkIndex: Number(item.chunk_index || 0),
          heading: text(item.heading),
          sectionPath: strings(item.section_path, 8),
          excerpt: text(item.excerpt),
          charStart: Number(item.char_start || 0),
          charEnd: Number(item.char_end || 0),
        }))
        .filter((item) => item.chunkId)
    : [];

  const status = text(meta.status) as EpisodeStatus;
  return {
    id,
    number: Number(meta.episode_number || 0),
    title: text(meta.title) || text(row.title),
    workingTitle: text(meta.working_title),
    status: ['DISCOVERY', 'SELECTED', 'DEVELOPMENT', 'SCRIPT', 'PRODUCTION', 'EDITING', 'READY', 'PUBLISHED', 'ARCHIVED'].includes(status)
      ? status
      : 'DEVELOPMENT',
    manuscriptDocumentId: text(meta.manuscript_document_id) || UNFRAMED_MANUSCRIPT_ID,
    chapterNumber: typeof meta.chapter_number === 'number' ? meta.chapter_number : null,
    chapterLabel: text(meta.chapter_label) || null,
    chunkIds: strings(meta.chunk_ids, 40),
    sourcePassages: passages,
    centralStory: text(meta.central_story),
    thesis: text(meta.thesis),
    narrativeAngle: text(meta.narrative_angle),
    historicalPeriod: text(meta.historical_period),
    keyCharacters: strings(meta.key_characters, 30),
    keyEvents: strings(meta.key_events, 30),
    visualConcept: text(meta.visual_concept),
    scriptId: text(meta.script_id) || null,
    approvedScriptId: text(meta.approved_script_id) || null,
    voiceover: text(meta.voiceover),
    visualPrompts: strings(meta.visual_prompts, 50),
    music: text(meta.music),
    videoUrl: text(meta.video_url),
    publicationDate: text(meta.publication_date) || null,
    publicPageUrl: text(meta.public_page_url),
    description: text(meta.description),
    relatedEpisodes: numbers(meta.related_episodes, 20),
    editorialNotes: text(meta.editorial_notes),
    createdAt: text(meta.created_at) || text(row.created_at),
    updatedAt: text(row.updated_at) || text(row.created_at),
    history: Array.isArray(meta.history)
      ? meta.history
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            status: text(item.status) as EpisodeStatus,
            at: text(item.at),
            note: text(item.note),
          }))
          .slice(0, 50)
      : [],
  };
}

export async function listEpisodeRecords(input: {
  ownerUserId: string;
  projectId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  limit?: number;
}): Promise<{ episodes: EpisodeRecord[]; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', EPISODE_ARTIFACT)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 300));

  if (error) return { episodes: [], error: error.message };
  return {
    episodes: (Array.isArray(data) ? data : [])
      .map((row) => mapEpisodeArtifact(row as Record<string, unknown>))
      .filter((item): item is EpisodeRecord => item !== null)
      .sort((left, right) => left.number - right.number),
    error: null,
  };
}

export async function getEpisodeByNumber(input: {
  ownerUserId: string;
  projectId: string;
  number: number;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<EpisodeRecord | null> {
  const listed = await listEpisodeRecords(input);
  if (listed.error) throw new Error(listed.error);
  return listed.episodes.find((episode) => episode.number === input.number) || null;
}

export function episodeTitle(input: {
  number: number;
  title?: string;
  workingTitle?: string;
}): string {
  return input.title || input.workingTitle || `Episode ${input.number}`;
}

export async function saveEpisodeRecord(input: {
  ownerUserId: string;
  projectId: string;
  episode: EpisodeRecord;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; episode: EpisodeRecord } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store, input.env);
  const now = new Date().toISOString();
  const episode = input.episode;
  const metadata = {
    episode_number: episode.number,
    title: episode.title,
    working_title: episode.workingTitle,
    status: episode.status,
    manuscript_document_id: episode.manuscriptDocumentId,
    chapter_number: episode.chapterNumber,
    chapter_label: episode.chapterLabel,
    chunk_ids: episode.chunkIds.slice(0, 40),
    source_passages: episode.sourcePassages.slice(0, 12).map((passage) => ({
      chunk_id: passage.chunkId,
      chunk_index: passage.chunkIndex,
      heading: passage.heading,
      section_path: passage.sectionPath.slice(0, 8),
      excerpt: passage.excerpt.slice(0, 1_200),
      char_start: passage.charStart,
      char_end: passage.charEnd,
    })),
    central_story: episode.centralStory.slice(0, 4_000),
    thesis: episode.thesis.slice(0, 4_000),
    narrative_angle: episode.narrativeAngle.slice(0, 4_000),
    historical_period: episode.historicalPeriod,
    key_characters: episode.keyCharacters.slice(0, 30),
    key_events: episode.keyEvents.slice(0, 30),
    visual_concept: episode.visualConcept.slice(0, 4_000),
    script_id: episode.scriptId,
    approved_script_id: episode.approvedScriptId,
    voiceover: episode.voiceover.slice(0, 20_000),
    visual_prompts: episode.visualPrompts.slice(0, 50),
    music: episode.music.slice(0, 2_000),
    video_url: episode.videoUrl,
    publication_date: episode.publicationDate,
    public_page_url: episode.publicPageUrl,
    description: episode.description.slice(0, 4_000),
    related_episodes: episode.relatedEpisodes.slice(0, 20),
    editorial_notes: episode.editorialNotes.slice(0, 8_000),
    created_at: episode.createdAt,
    history: episode.history.slice(-50),
  };

  const payload: Record<string, unknown> = {
    project_id: input.projectId,
    owner_user_id: input.ownerUserId,
    title: `${episode.number}. ${episodeTitle(episode)}`.slice(0, 240),
    artifact_type: EPISODE_ARTIFACT,
    content: episode.description.slice(0, 20_000),
    metadata,
    updated_at: now,
    created_at: episode.createdAt || now,
  };
  if (episode.id) payload.id = episode.id;

  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  const mapped = mapEpisodeArtifact(data as Record<string, unknown>);
  return mapped ? { ok: true, episode: mapped } : { ok: false, error: 'episode_map_failed' };
}

export async function createEpisodeRecord(input: {
  ownerUserId: string;
  projectId: string;
  number: number;
  title: string;
  workingTitle?: string;
  status?: EpisodeStatus;
  chapterNumber?: number | null;
  chapterLabel?: string | null;
  chunkIds?: string[];
  sourcePassages?: EpisodeSourcePassage[];
  centralStory?: string;
  thesis?: string;
  narrativeAngle?: string;
  historicalPeriod?: string;
  visualConcept?: string;
  description?: string;
  relatedEpisodes?: number[];
  editorialNotes?: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; episode: EpisodeRecord } | { ok: false; error: string }> {
  const existing = await getEpisodeByNumber({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    number: input.number,
    store: input.store,
    env: input.env,
  }).catch(() => null);
  if (existing) return { ok: true, episode: existing };

  const now = new Date().toISOString();
  return saveEpisodeRecord({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    store: input.store,
    env: input.env,
    episode: {
      id: '',
      number: input.number,
      title: input.title,
      workingTitle: input.workingTitle || input.title,
      status: input.status || 'SELECTED',
      manuscriptDocumentId: UNFRAMED_MANUSCRIPT_ID,
      chapterNumber: input.chapterNumber ?? null,
      chapterLabel: input.chapterLabel ?? null,
      chunkIds: input.chunkIds || [],
      sourcePassages: input.sourcePassages || [],
      centralStory: input.centralStory || '',
      thesis: input.thesis || '',
      narrativeAngle: input.narrativeAngle || '',
      historicalPeriod: input.historicalPeriod || '',
      keyCharacters: [],
      keyEvents: [],
      visualConcept: input.visualConcept || '',
      scriptId: null,
      approvedScriptId: null,
      voiceover: '',
      visualPrompts: [],
      music: '',
      videoUrl: '',
      publicationDate: null,
      publicPageUrl: '',
      description: input.description || '',
      relatedEpisodes: input.relatedEpisodes || [],
      editorialNotes: input.editorialNotes || '',
      createdAt: now,
      updatedAt: now,
      history: [{ status: input.status || 'SELECTED', at: now, note: 'record_created' }],
    },
  });
}

export async function updateEpisodeRecord(input: {
  ownerUserId: string;
  projectId: string;
  episode: EpisodeRecord;
  patch: Partial<EpisodeRecord>;
  statusNote?: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; episode: EpisodeRecord } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const nextStatus = input.patch.status || input.episode.status;
  const statusChanged = nextStatus !== input.episode.status;
  const history = statusChanged
    ? [
        ...input.episode.history,
        { status: nextStatus, at: now, note: input.statusNote || 'status_change' },
      ]
    : input.episode.history;

  return saveEpisodeRecord({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    store: input.store,
    env: input.env,
    episode: {
      ...input.episode,
      ...input.patch,
      status: nextStatus,
      updatedAt: now,
      history,
    },
  });
}

/** Populate the two verified published episodes once. Idempotent. */
export async function seedPublishedEpisodes(input: {
  ownerUserId: string;
  projectId: string;
  inventory: ManuscriptInventory;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ created: number[]; error: string | null }> {
  const existing = await listEpisodeRecords(input);
  if (existing.error) return { created: [], error: existing.error };
  const existingNumbers = new Set(existing.episodes.map((episode) => episode.number));
  const created: number[] = [];

  for (const episode of [SPECTRAL_TIGER_EPISODE, CONTAINER_EPISODE]) {
    if (existingNumbers.has(episode.number)) continue;
    const chapterMatch = episode.chapter.label.match(/^(\d{1,3})/);
    const chapterNumber = chapterMatch ? Number(chapterMatch[1]) : null;
    const chapter = chapterNumber
      ? resolveManuscriptChapter(input.inventory.structure, { number: chapterNumber }).chapter
      : null;
    const chapterChunks = chapter
      ? input.inventory.chunks.filter(
          (chunk) =>
            chunk.chunkIndex >= chapter.startChunkIndex &&
            chunk.chunkIndex <= chapter.endChunkIndex
        )
      : [];
    const sourcePassages: EpisodeSourcePassage[] = chapterChunks.slice(0, 3).map((chunk) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading,
      sectionPath: chunk.sectionPath,
      excerpt: episode.chapter.paragraphs[0]?.slice(0, 1_200) || '',
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
    }));

    const result = await createEpisodeRecord({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      number: episode.number,
      title: episode.title,
      workingTitle: episode.title,
      status: 'PUBLISHED',
      chapterNumber,
      chapterLabel: chapter?.label || episode.chapter.label,
      chunkIds: chapterChunks.map((chunk) => chunk.chunkId),
      sourcePassages,
      centralStory: episode.tagline,
      thesis: episode.statement,
      narrativeAngle: episode.seriesLabel,
      historicalPeriod: episode.year || '',
      visualConcept: episode.format || '4K / Cyber-Noir Narrative',
      description: episode.tagline,
      relatedEpisodes: [],
      editorialNotes: `Verified repository dataset: ${episode.chapter.sourceLine}`,
      store: input.store,
      env: input.env,
    });
    if (!result.ok) return { created, error: result.error };

    const published = await updateEpisodeRecord({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      episode: result.episode,
      patch: {
        videoUrl: episode.video.url,
        publicPageUrl:
          episode.slug === 'spectral-tiger' ? '/unframed/spectral-tiger' : '/unframed/container',
        music: '',
      },
      statusNote: 'published_repository_backfill',
      store: input.store,
      env: input.env,
    });
    if (!published.ok) return { created, error: published.error };
    created.push(episode.number);
  }

  return { created, error: null };
}

export function mapScriptArtifact(row: Record<string, unknown>): ScriptVersion | null {
  if (text(row.artifact_type) !== SCRIPT_ARTIFACT) return null;
  const meta = object(row.metadata);
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    episodeNumber: Number(meta.episode_number || 0),
    revision: Number(meta.revision || 1),
    status: (['draft', 'approved', 'superseded'].includes(text(meta.status))
      ? text(meta.status)
      : 'draft') as ScriptVersion['status'],
    title: text(meta.title),
    content: text(row.content),
    sourceChunkIds: strings(meta.source_chunk_ids, 40),
    createdAt: text(meta.created_at) || text(row.created_at),
    approvedAt: text(meta.approved_at) || null,
    note: text(meta.note),
  };
}

export async function listScripts(input: {
  ownerUserId: string;
  projectId: string;
  episodeNumber: number;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ scripts: ScriptVersion[]; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', SCRIPT_ARTIFACT)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) return { scripts: [], error: error.message };
  return {
    scripts: (Array.isArray(data) ? data : [])
      .map((row) => mapScriptArtifact(row as Record<string, unknown>))
      .filter(
        (script): script is ScriptVersion =>
          script !== null && script.episodeNumber === input.episodeNumber
      )
      .sort((left, right) => right.revision - left.revision),
    error: null,
  };
}

export async function saveScriptVersion(input: {
  ownerUserId: string;
  projectId: string;
  episodeNumber: number;
  title: string;
  content: string;
  sourceChunkIds: string[];
  note?: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; script: ScriptVersion } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store, input.env);
  const existing = await listScripts(input);
  if (existing.error) return { ok: false, error: existing.error };
  const revision = existing.scripts.reduce((max, script) => Math.max(max, script.revision), 0) + 1;
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Ep ${input.episodeNumber} script r${revision}`,
      artifact_type: SCRIPT_ARTIFACT,
      content: input.content.slice(0, 120_000),
      metadata: {
        episode_number: input.episodeNumber,
        revision,
        status: 'draft',
        title: input.title,
        source_chunk_ids: input.sourceChunkIds.slice(0, 40),
        created_at: now,
        note: input.note || '',
      },
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  const script = mapScriptArtifact(data as Record<string, unknown>);
  return script ? { ok: true, script } : { ok: false, error: 'script_map_failed' };
}

export async function attachDraftScript(input: {
  ownerUserId: string;
  projectId: string;
  episode: EpisodeRecord;
  scriptId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: boolean; error: string | null }> {
  const updated = await updateEpisodeRecord({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    episode: input.episode,
    patch: { scriptId: input.scriptId, status: 'SCRIPT' },
    statusNote: 'script_draft_created',
    store: input.store,
    env: input.env,
  });
  return updated.ok ? { ok: true, error: null } : { ok: false, error: updated.error };
}

export async function approveScript(input: {
  ownerUserId: string;
  projectId: string;
  episode: EpisodeRecord;
  scriptId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; script: ScriptVersion; episode: EpisodeRecord } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store, input.env);
  const scripts = await listScripts({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    episodeNumber: input.episode.number,
    store,
  });
  if (scripts.error) return { ok: false, error: scripts.error };
  const script = scripts.scripts.find((item) => item.id === input.scriptId);
  if (!script) return { ok: false, error: 'script_not_found' };

  const now = new Date().toISOString();
  for (const approved of scripts.scripts.filter((item) => item.status === 'approved')) {
    await store
      .from('pierrot_project_artifacts')
      .update({
        metadata: {
          episode_number: approved.episodeNumber,
          revision: approved.revision,
          status: 'superseded',
          title: approved.title,
          source_chunk_ids: approved.sourceChunkIds,
          created_at: approved.createdAt,
          approved_at: approved.approvedAt,
          note: approved.note,
        },
        updated_at: now,
      })
      .eq('id', approved.id)
      .eq('owner_user_id', input.ownerUserId);
  }

  const { error } = await store
    .from('pierrot_project_artifacts')
    .update({
      metadata: {
        episode_number: script.episodeNumber,
        revision: script.revision,
        status: 'approved',
        title: script.title,
        source_chunk_ids: script.sourceChunkIds,
        created_at: script.createdAt,
        approved_at: now,
        note: script.note,
      },
      updated_at: now,
    })
    .eq('id', script.id)
    .eq('owner_user_id', input.ownerUserId);
  if (error) return { ok: false, error: error.message };

  const updated = await updateEpisodeRecord({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    episode: input.episode,
    patch: {
      approvedScriptId: script.id,
      scriptId: script.id,
      status: input.episode.status === 'PUBLISHED' ? 'PUBLISHED' : 'SCRIPT',
    },
    statusNote: `script_approved_r${script.revision}`,
    store,
  });
  if (!updated.ok) return { ok: false, error: updated.error };
  return { ok: true, script: { ...script, status: 'approved', approvedAt: now }, episode: updated.episode };
}

export async function recordRejectedStory(input: {
  ownerUserId: string;
  projectId: string;
  number?: number | null;
  title: string;
  chapterNumber?: number | null;
  chunkIds?: string[];
  reason: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: true; story: RejectedStory } | { ok: false; error: string }> {
  const store = storeOrDefault(input.store, input.env);
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Rejected: ${input.title}`.slice(0, 240),
      artifact_type: STORY_DECISION_ARTIFACT,
      content: input.reason.slice(0, 20_000),
      metadata: {
        decision: 'rejected',
        episode_number: input.number ?? null,
        title: input.title,
        chapter_number: input.chapterNumber ?? null,
        chunk_ids: input.chunkIds || [],
        reason: input.reason,
        created_at: now,
      },
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  const row = data as Record<string, unknown>;
  const meta = object(row.metadata);
  return {
    ok: true,
    story: {
      id: text(row.id),
      number: typeof meta.episode_number === 'number' ? meta.episode_number : null,
      title: text(meta.title),
      chapterNumber: typeof meta.chapter_number === 'number' ? meta.chapter_number : null,
      chunkIds: strings(meta.chunk_ids, 40),
      reason: text(meta.reason),
      createdAt: text(meta.created_at),
    },
  };
}

export async function listRejectedStories(input: {
  ownerUserId: string;
  projectId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ stories: RejectedStory[]; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', STORY_DECISION_ARTIFACT)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return { stories: [], error: error.message };
  return {
    stories: (Array.isArray(data) ? data : []).map((row) => {
      const meta = object((row as Record<string, unknown>).metadata);
      return {
        id: text((row as Record<string, unknown>).id),
        number: typeof meta.episode_number === 'number' ? meta.episode_number : null,
        title: text(meta.title),
        chapterNumber: typeof meta.chapter_number === 'number' ? meta.chapter_number : null,
        chunkIds: strings(meta.chunk_ids, 40),
        reason: text(meta.reason),
        createdAt: text(meta.created_at),
      };
    }),
    error: null,
  };
}

export async function saveDiscoverySet(input: {
  ownerUserId: string;
  projectId: string;
  candidates: DiscoveryCandidate[];
  query: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ id: string | null; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Discovery: ${input.query}`.slice(0, 240),
      artifact_type: DISCOVERY_SET_ARTIFACT,
      content: input.candidates.map((candidate) => `${candidate.number}. ${candidate.title}`).join('\n'),
      metadata: {
        query: input.query,
        created_at: now,
        candidates: input.candidates.map((candidate) => ({
          number: candidate.number,
          chapter_number: candidate.chapterNumber,
          chapter_label: candidate.chapterLabel,
          title: candidate.title,
          chunk_id: candidate.chunkId,
          chunk_index: candidate.chunkIndex,
          historical_period: candidate.historicalPeriod,
          source_excerpt: candidate.sourceExcerpt,
          editorial_question: candidate.editorialQuestion,
          visual_direction: candidate.visualDirection,
          score: candidate.score,
        })),
      },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  return error ? { id: null, error: error.message } : { id: text(data?.id) || null, error: null };
}

export async function saveDevelopmentDraft(input: {
  ownerUserId: string;
  projectId: string;
  episodeNumber: number;
  title: string;
  content: string;
  sourceChunkIds: string[];
  note?: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ id: string | null; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Ep ${input.episodeNumber} development: ${input.title}`.slice(0, 240),
      artifact_type: DEVELOPMENT_ARTIFACT,
      content: input.content.slice(0, 120_000),
      metadata: {
        episode_number: input.episodeNumber,
        title: input.title,
        source_chunk_ids: input.sourceChunkIds.slice(0, 40),
        created_at: now,
        note: input.note || '',
      },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  return error ? { id: null, error: error.message } : { id: text(data?.id) || null, error: null };
}

export async function savePublicationDraft(input: {
  ownerUserId: string;
  projectId: string;
  episodeNumber: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ id: string | null; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      title: `Ep ${input.episodeNumber} publication draft: ${input.title}`.slice(0, 240),
      artifact_type: PUBLICATION_DRAFT_ARTIFACT,
      content: input.content.slice(0, 60_000),
      metadata: { episode_number: input.episodeNumber, created_at: now, ...input.metadata },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  return error ? { id: null, error: error.message } : { id: text(data?.id) || null, error: null };
}

export function chapterForEpisode(  inventory: ManuscriptInventory,
  episode: Pick<EpisodeRecord, 'chapterNumber' | 'chapterLabel'>
): ManuscriptChapter | null {
  if (episode.chapterNumber !== null && episode.chapterNumber !== undefined) {
    return resolveManuscriptChapter(inventory.structure, { number: episode.chapterNumber }).chapter;
  }
  if (episode.chapterLabel) {
    return resolveManuscriptChapter(inventory.structure, {
      title: episode.chapterLabel,
    }).chapter;
  }
  return null;
}

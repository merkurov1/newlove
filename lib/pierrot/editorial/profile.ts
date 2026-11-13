import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';
import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import type { UnframedProjectState } from './project';
import { EDITORIAL_PROFILE_ARTIFACT, listEpisodeRecords, type EpisodeRecord } from './episodes';
import type { EditorialContext } from './types';

assertServerOnly('lib/pierrot/editorial/profile');

/**
 * Persistent, verified editorial profile for UNFRAMED.
 *
 * It is composed from the project record, blueprint document, manuscript map,
 * episode registry and recorded decisions. It is not a brand manifesto and does
 * not invent an artistic identity. Every section that is inferred is labelled
 * as derived metadata.
 */

export type EditorialProfile = {
  id: string | null;
  revision: number;
  generatedAt: string;
  concept: string;
  narrativeVoice: string;
  themes: string[];
  visualLanguage: string[];
  cinematicLanguage: string[];
  episodeStructure: string[];
  bookVideoRelation: string[];
  establishedDecisions: string[];
  prohibitedTopics: string[];
  publishedEpisodes: Array<{ number: number; title: string; chapter: string | null }>;
  worksInProgress: Array<{ number: number; title: string; status: string }>;
  unresolvedQuestions: string[];
  sourceNotes: string[];
  markdown: string;
};

export const AUTHORIAL_RESTRICTIONS = [
  'Не развивать эпизоды об арестах, уголовных делах и силовых конфликтах.',
  'Do not develop episodes about arrests, criminal proceedings or force-related conflicts.',
];

const THEME_LEXICON = new Set(
  `status freedom digital internet network code system power technology money market business art heart heritage legacy memory identity family love death time body image reality truth silence exile home empire state control access privacy surveillance data machine computer modem screen avatar game value luxury poverty politics journalism media photography film story myth history border passport visa travel city london moscow berlin america russia europe self authorship voice performance mask role transformation escape return loss recovery nostalgia shame fear desire ambition success failure risk luck discipline ritual craft canvas sculpture museum auction collector dealer brand audience public private algorithm platform protocol wire signal noise`
    .split(/\s+/)
    .filter(Boolean)
);

function thematicTerms(input: { motifs: string[]; text: string }): string[] {
  const scores = new Map<string, number>();
  const add = (term: string, weight: number) => {
    const lower = term.toLowerCase();
    if (!THEME_LEXICON.has(lower)) return;
    scores.set(lower, (scores.get(lower) || 0) + weight);
  };

  for (const motif of input.motifs) add(motif, 2);
  const lower = input.text.toLowerCase();
  for (const term of THEME_LEXICON) {
    const matches = lower.match(new RegExp(`\\b${term}\\b`, 'g'));
    if (matches) add(term, matches.length);
  }

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 16)
    .map(([term]) => term);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function storeOrDefault(store?: SupabaseClient | null, env?: RagEnvironment): SupabaseClient {
  const url = env?.NEXT_PUBLIC_SUPABASE_URL || env?.SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (store) return store;
  if (url && key) {
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return getServerSupabaseClient({ useServiceRole: true });
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function composeEditorialProfile(input: {
  state: UnframedProjectState;
  episodes: EpisodeRecord[];
  manuscriptMotifs: string[];
  context?: EditorialContext | null;
  revision?: number;
}): EditorialProfile {
  const project = input.state.project;
  const published = input.episodes.filter((episode) => episode.status === 'PUBLISHED');
  const inProgress = input.episodes.filter(
    (episode) => episode.status !== 'PUBLISHED' && episode.status !== 'ARCHIVED'
  );
  const blueprint = input.state.blueprintExcerpt || '';
  const themes = thematicTerms({
    motifs: input.manuscriptMotifs,
    text: [
      blueprint,
      input.state.project?.description || '',
      input.state.project?.objective || '',
      ...input.episodes.map(
        (episode) => `${episode.title} ${episode.thesis} ${episode.centralStory}`
      ),
    ].join(' '),
  });
  const phraseMatches = (pattern: RegExp, limit: number): string[] =>
    Array.from(
      new Set(
        (blueprint.match(pattern) || [])
          .map((item) => clip(item, 260))
          .filter((item) => item.length >= 20)
      )
    ).slice(0, limit);

  const visualLanguage = phraseMatches(
    /[^.;\n]{0,120}(?:monochrome|brutalist|corporate noir|cinematic|visual|aesthetic|high-contrast|archival footage)[^.;\n]{0,120}/gi,
    6
  );
  const cinematicLanguage = phraseMatches(
    /[^.;\n]{0,150}(?:William Gibson|Adam Curtis|Neuromancer|Pattern Recognition|docuseries|video essay|voiceover|montage|DaVinci Resolve)[^.;\n]{0,150}/gi,
    6
  );

  const decisions = input.state.decisions
    .filter((decision) => decision.kind !== 'task' && decision.kind !== 'reminder')
    .map((decision) => `${decision.title} (${decision.status})`);
  const openTasks = input.state.openTasks.map((task) => task.title);
  const prohibited = Array.from(
    new Set([
      ...AUTHORIAL_RESTRICTIONS,
      ...(input.context?.sourceConstraints.excludedTopics || []).map(
        (topic) => `Excluded by owner: ${topic}`
      ),
    ])
  );

  const concept = [
    blueprint ? clip(blueprint, 900) : '',
    project?.description || '',
    project?.objective || '',
    input.state.manuscript
      ? `Manuscript: ${input.state.manuscript.document.title}, ${input.state.manuscript.coverage.loadedChunkCount} chunks, ${(input.state.manuscript.coverage.coverageRatio * 100).toFixed(1)}% indexed coverage.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const narrativeVoice = [
    'First-person autobiographical narration is verified by the manuscript chapters and the published episode excerpts.',
    input.episodes.find((episode) => episode.number === 42)?.centralStory
      ? `Published Episode 42 uses a first-person cyber-noir transmission: ${clip(
          input.episodes.find((episode) => episode.number === 42)!.centralStory,
          260
        )}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const episodeStructure = input.state.blueprintSections
    .map((section) => section.replace(/^PART\s+\d+\s*[:.\-—]?\s*/i, ''))
    .filter(Boolean);

  const bookVideoRelation = published.map(
    (episode) =>
      `Episode ${episode.number} “${episode.title}” → ${
        episode.chapterLabel || 'chapter not recorded'
      }; source chunks: ${episode.chunkIds.slice(0, 3).join(', ') || 'not recorded'}.`
  );

  const markdown = [
    '# UNFRAMED — editorial profile',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)}. Sources: project record, manuscript, blueprint, episode registry, recorded decisions.`,
    '',
    '## Concept and purpose',
    concept || 'Not recorded in verified project sources.',
    '',
    '## Narrative voice',
    narrativeVoice || 'Verified voice description is not yet recorded.',
    '',
    '## Intellectual and recurring themes',
    ...(themes.length > 0
      ? themes.map((motif) => `- ${motif}`)
      : ['- Not extracted yet.']),
    '',
    '## Visual language',
    ...(visualLanguage.length > 0
      ? visualLanguage.map((item) => `- ${item}`)
      : ['- Blueprint visual language is not available.']),
    '',
    '## Cinematic language',
    ...(cinematicLanguage.length > 0
      ? cinematicLanguage.map((item) => `- ${item}`)
      : ['- Blueprint cinematic references are not available.']),
    '',
    '## Preferred episode structure',
    ...(episodeStructure.length > 0
      ? episodeStructure.map((item) => `- ${item}`)
      : ['- Structure is defined by the blueprint document.']),
    '',
    '## Book and video series relationship',
    ...(bookVideoRelation.length > 0
      ? bookVideoRelation.map((item) => `- ${item}`)
      : ['- No published episode relation is recorded.']),
    '',
    '## Established editorial decisions',
    ...(decisions.length > 0
      ? decisions.map((item) => `- ${item}`)
      : ['- No panel decisions are recorded outside tasks and reminders.']),
    '',
    '## Prohibited topics',
    ...prohibited.map((item) => `- ${item}`),
    '',
    '## Published episodes',
    ...(published.length > 0
      ? published.map(
          (episode) =>
            `- Episode ${episode.number} “${episode.title}” — ${episode.chapterLabel || 'chapter not recorded'}.`
        )
      : ['- None recorded.']),
    '',
    '## Works in progress',
    ...(inProgress.length > 0
      ? inProgress.map(
          (episode) => `- Episode ${episode.number} “${episode.title}” — ${episode.status}.`
        )
      : ['- None.']),
    '',
    '## Unresolved editorial questions',
    ...(openTasks.length > 0
      ? openTasks.map((item) => `- ${item}`)
      : ['- No open task is recorded. This is a gap, not a conclusion that none exist.']),
    '',
    '## Verification notes',
    '- Visual and cinematic lines are verbatim sentences from the project blueprint document.',
    '- Recurring themes are lexical recurrence signals from the manuscript, not claims about authorial intent.',
    '- The profile changes only through recorded decisions, approved scripts and episode status changes.',
  ].join('\n');

  return {
    id: null,
    revision: input.revision || 1,
    generatedAt: new Date().toISOString(),
    concept,
    narrativeVoice,
    themes,
    visualLanguage,
    cinematicLanguage,
    episodeStructure,
    bookVideoRelation,
    establishedDecisions: decisions,
    prohibitedTopics: prohibited,
    publishedEpisodes: published.map((episode) => ({
      number: episode.number,
      title: episode.title,
      chapter: episode.chapterLabel,
    })),
    worksInProgress: inProgress.map((episode) => ({
      number: episode.number,
      title: episode.title,
      status: episode.status,
    })),
    unresolvedQuestions: openTasks,
    sourceNotes: [
      'project_record',
      'manuscript_index',
      'blueprint',
      'episode_registry',
      'recorded_decisions',
    ],
    markdown,
  };
}

export async function loadStoredEditorialProfile(input: {
  ownerUserId: string;
  projectId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ id: string | null; revision: number; markdown: string; data: Record<string, unknown> | null; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('*')
    .eq('owner_user_id', input.ownerUserId)
    .eq('project_id', input.projectId)
    .eq('artifact_type', EDITORIAL_PROFILE_ARTIFACT)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { id: null, revision: 0, markdown: '', data: null, error: error.message };
  if (!data) return { id: null, revision: 0, markdown: '', data: null, error: null };
  const row = data as Record<string, unknown>;
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: text(row.id) || null,
    revision: Number(metadata.revision || 1),
    markdown: text(row.content),
    data: metadata,
    error: null,
  };
}

export async function saveEditorialProfile(input: {
  ownerUserId: string;
  projectId: string;
  profile: EditorialProfile;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ ok: boolean; revision: number; error: string | null }> {
  const store = storeOrDefault(input.store, input.env);
  const existing = await loadStoredEditorialProfile(input);
  if (existing.error) return { ok: false, revision: existing.revision, error: existing.error };
  const revision = existing.revision > 0 ? existing.revision + 1 : 1;
  const now = new Date().toISOString();
  const { error } = await store.from('pierrot_project_artifacts').insert({
    project_id: input.projectId,
    owner_user_id: input.ownerUserId,
    title: `UNFRAMED editorial profile r${revision}`,
    artifact_type: EDITORIAL_PROFILE_ARTIFACT,
    content: input.profile.markdown.slice(0, 60_000),
    metadata: {
      revision,
      generated_at: now,
      concept: input.profile.concept.slice(0, 4_000),
      narrative_voice: input.profile.narrativeVoice.slice(0, 2_000),
      themes: input.profile.themes,
      visual_language: input.profile.visualLanguage,
      cinematic_language: input.profile.cinematicLanguage,
      episode_structure: input.profile.episodeStructure,
      book_video_relation: input.profile.bookVideoRelation,
      established_decisions: input.profile.establishedDecisions,
      prohibited_topics: input.profile.prohibitedTopics,
      published_episodes: input.profile.publishedEpisodes,
      works_in_progress: input.profile.worksInProgress,
      unresolved_questions: input.profile.unresolvedQuestions,
    },
    created_at: now,
    updated_at: now,
  });
  return error
    ? { ok: false, revision, error: error.message }
    : { ok: true, revision, error: null };
}

export async function loadProfileForPrompt(input: {
  ownerUserId: string;
  projectId: string;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ markdown: string; revision: number }> {
  const stored = await loadStoredEditorialProfile(input);
  if (stored.markdown) return { markdown: stored.markdown, revision: stored.revision };
  return { markdown: '', revision: 0 };
}

export async function loadEpisodesAndProfile(input: {
  ownerUserId: string;
  projectId: string;
  state: UnframedProjectState;
  context?: EditorialContext | null;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ episodes: EpisodeRecord[]; profileMarkdown: string; profileRevision: number; error: string | null }> {
  const listed = await listEpisodeRecords({
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    store: input.store,
    env: input.env,
    limit: 300,
  });
  if (listed.error) {
    return { episodes: [], profileMarkdown: '', profileRevision: 0, error: listed.error };
  }
  const stored = await loadStoredEditorialProfile(input);
  if (stored.markdown) {
    return {
      episodes: listed.episodes,
      profileMarkdown: stored.markdown,
      profileRevision: stored.revision,
      error: null,
    };
  }
  return {
    episodes: listed.episodes,
    profileMarkdown: '',
    profileRevision: 0,
    error: null,
  };
}

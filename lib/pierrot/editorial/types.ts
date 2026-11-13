/**
 * Shared contracts for UNFRAMED manuscript and project editorial operations.
 *
 * These types are deliberately separate from the generic Brain RAG contracts:
 * the manuscript has a document-level identity, an ordered chunk inventory and
 * chapter boundaries that a top-K semantic search cannot represent.
 */

export type ManuscriptOperation =
  | 'manuscript.read'
  | 'manuscript.inspect'
  | 'manuscript.outline'
  | 'manuscript.search'
  | 'manuscript.chapter'
  | 'manuscript.compare'
  | 'manuscript.analyze'
  | 'manuscript.quote'
  | 'manuscript.chronology'
  | 'manuscript.find_gaps';

export type ProjectOperation =
  | 'project.overview'
  | 'project.episodes'
  | 'project.history'
  | 'project.brief'
  | 'project.link_episode'
  | 'episode.discover'
  | 'episode.open'
  | 'episode.select'
  | 'episode.develop'
  | 'episode.script'
  | 'episode.status'
  | 'episode.revise'
  | 'episode.approve_script'
  | 'episode.publish_prepare'
  | 'episode.reject';

export type EditorialOperation = ManuscriptOperation | ProjectOperation;

export type EpisodeStatus =
  | 'DISCOVERY'
  | 'SELECTED'
  | 'DEVELOPMENT'
  | 'SCRIPT'
  | 'PRODUCTION'
  | 'EDITING'
  | 'READY'
  | 'PUBLISHED'
  | 'ARCHIVED';

export const EPISODE_STATUSES: EpisodeStatus[] = [
  'DISCOVERY',
  'SELECTED',
  'DEVELOPMENT',
  'SCRIPT',
  'PRODUCTION',
  'EDITING',
  'READY',
  'PUBLISHED',
  'ARCHIVED',
];

export type EditorialSourceConstraints = {
  excludedTopics: string[];
  fromYear: number | null;
  toYear: number | null;
  raw: string[];
};

export type EditorialContext = {
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  documentId: string | null;
  documentTitle: string | null;
  episodeId: string | null;
  activeEpisodeRecordId: string | null;
  activeEpisodeNumber: number | null;
  activeStage: EpisodeStatus | null;
  activeScriptId: string | null;
  approvedScriptId: string | null;
  discoveryCandidates: DiscoveryCandidate[];
  lastDiscoveryId: string | null;
  activeChapterNumber: number | null;
  activeTask: string | null;
  currentEditorialObjective: string | null;
  lastRetrievalScope: string | null;
  lastEvidenceChunkIds: string[];
  sourceConstraints: EditorialSourceConstraints;
  updatedAt: string | null;
};

export type DiscoveryCandidate = {
  number: number;
  chapterNumber: number | null;
  chapterLabel: string;
  title: string;
  chunkId: string;
  chunkIndex: number;
  historicalPeriod: string | null;
  sourceExcerpt: string;
  editorialQuestion: string;
  visualDirection: string;
  score: number;
};

export function emptySourceConstraints(): EditorialSourceConstraints {
  return { excludedTopics: [], fromYear: null, toYear: null, raw: [] };
}

export function emptyEditorialContext(): EditorialContext {
  return {
    projectId: null,
    projectSlug: null,
    projectName: null,
    documentId: null,
    documentTitle: null,
    episodeId: null,
    activeEpisodeRecordId: null,
    activeEpisodeNumber: null,
    activeStage: null,
    activeScriptId: null,
    approvedScriptId: null,
    discoveryCandidates: [],
    lastDiscoveryId: null,
    activeChapterNumber: null,
    activeTask: null,
    currentEditorialObjective: null,
    lastRetrievalScope: null,
    lastEvidenceChunkIds: [],
    sourceConstraints: emptySourceConstraints(),
    updatedAt: null,
  };
}

export type EditorialIntent = {
  operation: EditorialOperation;
  confidence: number;
  signals: string[];
  manuscriptRequested: boolean;
  projectRequested: boolean;
  explicitDocument: boolean;
  explicitProject: boolean;
  followUp: boolean;
  chapterNumber: number | null;
  chapterNumbers: number[];
  chapterTitle: string | null;
  episodeNumber: number | null;
  targetEpisodeStatus: EpisodeStatus | null;
  candidateNumber: number | null;
  compareChapters: [number, number] | null;
  quotePhrase: string | null;
  searchQuery: string;
  wantsFullRead: boolean;
  wantsBroadCoverage: boolean;
  constraints: EditorialSourceConstraints;
  needsClarification: boolean;
  clarification: string | null;
};

export type EditorialCoverageReport = {
  documentId: string;
  documentTitle: string;
  chunksLoaded: number;
  chunksExpected: number;
  charactersLoaded: number;
  sourceCharacters: number;
  coverageRatio: number;
  complete: boolean;
  requestedScope: string;
  scopeComplete: boolean;
  modelReadComplete: boolean;
  notes: string[];
};

export type EditorialDiagnostic = {
  requestId: string | null;
  conversationId: string | null;
  projectId: string | null;
  documentId: string | null;
  operation: EditorialOperation | 'none';
  resolvedIntent: string | null;
  retrievalStrategy: string | null;
  requestedSources: string[];
  selectedSources: string[];
  returnedChunkIds: string[];
  chunkCount: number;
  coverage: number | null;
  truncated: boolean;
  fallbackReason: string | null;
  errors: string[];
  durationMs: number;
  finishReason: string | null;
};

export type EditorialResult =
  | {
      status: 'deterministic';
      markdown: string;
      contextPatch: Partial<EditorialContext>;
      diagnostic: EditorialDiagnostic;
    }
  | {
      status: 'needs_model';
      systemPrompt: string;
      markdownFallback: string;
      contextPatch: Partial<EditorialContext>;
      diagnostic: EditorialDiagnostic;
      generatedArtifact?: {
        kind: 'script' | 'development' | 'concept';
        episodeNumber: number;
        title: string;
        sourceChunkIds: string[];
      };
    }
  | {
      status: 'clarify';
      markdown: string;
      contextPatch: Partial<EditorialContext>;
      diagnostic: EditorialDiagnostic;
    }
  | {
      status: 'failed';
      markdown: string;
      contextPatch: Partial<EditorialContext>;
      diagnostic: EditorialDiagnostic;
    };

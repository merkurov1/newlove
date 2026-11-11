import type { PierrotProject } from '@/lib/pierrot/projects/types';

export type UnifiedSearchHit = {
  source: 'conversation' | 'task' | 'decision' | 'memory' | 'document' | 'artifact' | 'issue';
  id: string;
  title: string;
  snippet: string;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  href: string | null;
  status: string | null;
  updatedAt: string | null;
  /** Original message identity, when the hit came from a transcript. */
  messageId?: string | null;
  conversationId?: string | null;
  eventAt?: string | null;
  ingestedAt?: string | null;
  retrievalMethod?: 'exact_phrase' | 'keyword' | 'semantic' | 'hybrid' | 'chronological' | 'project_scope';
  confidence?: number;
  evidenceClass?: 'MEASURED' | 'USER_CONFIRMED' | 'DIRECTLY_OBSERVED' | 'DOCUMENTED' | 'INFERRED' | 'UNKNOWN';
};

export type UnifiedSearchResult = {
  query: string;
  project: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null;
  hits: UnifiedSearchHit[];
  notes: string[];
};

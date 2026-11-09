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
};

export type UnifiedSearchResult = {
  query: string;
  project: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null;
  hits: UnifiedSearchHit[];
  notes: string[];
};

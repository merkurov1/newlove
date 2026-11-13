export type PierrotProjectStatus = 'active' | 'paused' | 'archived';

export type PierrotProject = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  description: string;
  objective: string;
  status: PierrotProjectStatus;
  /** Internal ordering value, never the owner's explicit rating. */
  priority: number;
  /** Owner's explicit 1..10 rating, separate from priority/importance. */
  ownerRating: number | null;
  ownerRatingUpdatedAt: string | null;
  /** Single canonical conversation for this project; never one chat per visit. */
  conversationId: string | null;
  projectBrief: string;
  briefRevision: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PierrotProjectSnapshot = PierrotProject & {
  /** Latest completed project review summary, if one exists. */
  latestReview?: {
    summary: string;
    completedAt: string;
    runId: string;
  } | null;
  /** Current decisions only. Historical records stay in historicalDecisions. */
  decisions: Array<{
    id: string;
    title: string;
    content: string;
    status: string;
    kind?: string;
    updatedAt: string;
  }>;
  historicalDecisions?: Array<{
    id: string;
    title: string;
    content: string;
    status: string;
    kind?: string;
    updatedAt: string;
  }>;
  /** Active tasks only. Completed/archived/superseded are separate. */
  tasks: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  completedTasks?: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  archivedTasks?: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  supersededTasks?: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  knowledge: Array<{ id: string; title: string | null; status: string | null; ingestionStatus?: string | null; extractionStatus?: string | null; chunkCount?: number; sourceCharCount?: number; accessClass?: string | null }>;
  /** Explicit failure of the project→document relation query. */
  knowledgeUnavailable?: string | null;
  artifacts: Array<{ id: string; title: string; artifactType: string; updatedAt: string }>;
};

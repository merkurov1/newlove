export type PierrotProjectStatus = 'active' | 'paused' | 'archived';

export type PierrotProject = {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  description: string;
  objective: string;
  status: PierrotProjectStatus;
  priority: number;
  projectBrief: string;
  briefRevision: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PierrotProjectSnapshot = PierrotProject & {
  decisions: Array<{
    id: string;
    title: string;
    content: string;
    status: string;
    kind?: string;
    updatedAt: string;
  }>;
  tasks: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  conversations: Array<{ id: string; title: string; updatedAt: string }>;
  knowledge: Array<{ id: string; title: string | null; status: string | null }>;
  artifacts: Array<{ id: string; title: string; artifactType: string; updatedAt: string }>;
};

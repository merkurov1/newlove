import type {
  SkillAnalysisEvidenceRef,
  SkillAnalysisSourceStatus,
  SkillDefinition,
  SkillRecord,
} from '../types';

export type AnalysisWorkItem = {
  id: string;
  source: 'owner_chat' | 'dev_task' | 'memory';
  date: string | null;
  text: string;
  assistantText: string | null;
  conversationId: string | null;
  href: string | null;
  tools: string[];
  labels: string[];
};

export type AnalysisToolEvent = {
  id: string;
  conversationId: string | null;
  eventName: string;
  tool: string | null;
  operation: string | null;
  sourceModes: string[];
  ok: boolean | null;
  date: string | null;
};

export type AnalysisEvidenceBundle = {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  workItems: AnalysisWorkItem[];
  toolEvents: AnalysisToolEvent[];
  memories: Array<{
    id: string;
    title: string;
    content: string;
    kind: string;
    date: string | null;
    project: string | null;
  }>;
  devTasks: Array<{
    id: string;
    title: string;
    status: string;
    repository: string;
    date: string | null;
    verificationStatus: string | null;
  }>;
  devRequests: Array<{
    id: string;
    conversationId: string | null;
    status: string;
    date: string | null;
    tools: string[];
    sideEffectCount: number;
  }>;
  skills: SkillRecord[];
  sources: SkillAnalysisSourceStatus[];
  counts: {
    conversations: number;
    messages: number;
    devTasks: number;
    devRequests: number;
    memoryRecords: number;
    toolTraceEvents: number;
  };
};

export type PreparedProposal = {
  clusterId: string;
  evidence: SkillAnalysisEvidenceRef[];
  definition: SkillDefinition;
  changelog: string;
  gaps: string[];
};

export type ExistingSkillView = {
  skill: SkillRecord;
  definition: SkillDefinition;
  text: string;
};

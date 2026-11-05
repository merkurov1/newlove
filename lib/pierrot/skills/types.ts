/**
 * Client-safe Skill Foundry contract.
 *
 * Memory answers “what is known”; a skill describes a repeatable procedure and
 * the safety conditions under which Pierrot may use it.
 */

export const SKILL_STATUSES = ['draft', 'testing', 'active', 'disabled', 'archived'] as const;

export type SkillStatus = (typeof SKILL_STATUSES)[number];

export type SkillTest = {
  name: string;
  input?: string;
  expected: string;
  checks?: string[];
};

export type SkillExample = {
  title: string;
  input?: string;
  result: string;
  date?: string;
};

export type SkillDefinition = {
  name: string;
  description: string;
  purpose: string;
  conditions: string[];
  inputs: string[];
  steps: string[];
  tools: string[];
  constraints: string[];
  expectedResult: string;
  tests: SkillTest[];
  examples: SkillExample[];
};

export type SkillVersion = {
  id: string;
  skillId: string;
  version: number;
  definition: SkillDefinition;
  changelog: string | null;
  status: SkillStatus;
  createdAt: string;
};

export type SkillRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: SkillStatus;
  currentVersionId: string | null;
  currentVersion: SkillVersion | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillCheckPhase = 'structural' | 'historical' | 'execution';

export type SkillCheck = {
  name: string;
  passed: boolean;
  detail?: string;
  /** Structural checks gate approval. Historical/execution checks are evidence. */
  phase?: SkillCheckPhase;
  /** Defaults to true for backwards compatibility with existing runs. */
  blocking?: boolean;
  /** Identifiers of the source conversations/tasks examined by the check. */
  evidence?: string[];
};

export type SkillRun = {
  id: string;
  skillId: string;
  versionId: string;
  status: 'passed' | 'failed';
  checks: SkillCheck[];
  createdAt: string;
};

export type SkillDetail = SkillRecord & {
  versions: SkillVersion[];
  latestRun: SkillRun | null;
};

export type SkillWriteInput = {
  definition: SkillDefinition;
  changelog?: string | null;
  slug?: string;
};

export type SkillSuggestion = {
  definition: SkillDefinition;
  changelog: string;
  basedOn: string[];
  gaps: string[];
};

export type SkillSuggestionResult = {
  available: boolean;
  suggestion: SkillSuggestion | null;
  reason?: string;
};

export function skillStatusLabel(status: SkillStatus): string {
  switch (status) {
    case 'draft':
      return 'черновик';
    case 'testing':
      return 'проверка';
    case 'active':
      return 'активен';
    case 'disabled':
      return 'отключён';
    default:
      return 'архив';
  }
}

/* ------------------------------------------------------------------ */
/* Skill analysis contract                                             */
/* ------------------------------------------------------------------ */

export type SkillAnalysisSourceKey =
  'owner_chat' | 'memory' | 'dev_mode' | 'tool_events' | 'existing_skills' | 'brain';

export type SkillAnalysisSourceStatus = {
  key: SkillAnalysisSourceKey;
  label: string;
  status: 'available' | 'partial' | 'unavailable' | 'not_used';
  count: number;
  note: string;
};

export type SkillAnalysisEvidenceRef = {
  source: 'owner_chat' | 'dev_task' | 'memory' | 'dev_request' | 'event';
  id: string;
  label: string;
  date: string | null;
  conversationId?: string | null;
  href?: string | null;
};

export type SkillAnalysisProcedure = {
  id: string;
  name: string;
  description: string;
  exampleCount: number;
  evidence: SkillAnalysisEvidenceRef[];
  sequence: string[];
  tools: string[];
  repeatability: 'высокая' | 'средняя' | 'низкая';
  usefulness: string;
  relatedSkillIds: string[];
};

export type SkillAnalysisProblem = {
  id: string;
  category:
    | 'repeated_without_skill'
    | 'repeated_explanation'
    | 'repeated_failure'
    | 'missing_context'
    | 'unused_capability'
    | 'skill_overlap'
    | 'skill_incomplete';
  description: string;
  evidence: SkillAnalysisEvidenceRef[];
};

export type SkillAnalysisProposal = {
  id: string;
  kind: 'new' | 'improve';
  name: string;
  problem: string;
  evidence: SkillAnalysisEvidenceRef[];
  howItWorks: string;
  difference: string;
  limitations: string[];
  definition: SkillDefinition;
  changelog: string;
  gaps: string[];
  relatedSkillId?: string;
};

export type SkillAnalysisReview = {
  skillId: string;
  name: string;
  status: SkillStatus;
  issues: string[];
  recommendation: string;
  evidence: SkillAnalysisEvidenceRef[];
  proposedDefinition: SkillDefinition | null;
  changelog: string;
};

export type SkillAnalysisReport = {
  id: string | null;
  generatedAt: string;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  overview: string;
  sources: SkillAnalysisSourceStatus[];
  procedures: SkillAnalysisProcedure[];
  problems: SkillAnalysisProblem[];
  proposals: SkillAnalysisProposal[];
  skillReviews: SkillAnalysisReview[];
  stats: {
    conversations: number;
    messages: number;
    devTasks: number;
    devRequests: number;
    memoryRecords: number;
    toolTraceEvents: number;
  };
};

export type StoredSkillAnalysis = {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  report: SkillAnalysisReport;
  createdAt: string;
};

export function emptySkillDefinition(): SkillDefinition {
  return {
    name: '',
    description: '',
    purpose: '',
    conditions: [],
    inputs: [],
    steps: [],
    tools: [],
    constraints: [],
    expectedResult: '',
    tests: [],
    examples: [],
  };
}

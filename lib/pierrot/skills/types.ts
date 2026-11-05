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

export type SkillRun = {
  id: string;
  skillId: string;
  versionId: string;
  status: 'passed' | 'failed';
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
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

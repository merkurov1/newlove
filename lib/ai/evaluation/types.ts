import type { LlmProvider, LlmTokenUsage } from '../telemetry';

export type EvaluationCheck =
  | { kind: 'includes'; value: string; label?: string }
  | { kind: 'excludes'; value: string; label?: string }
  | { kind: 'anyOf'; values: string[]; label?: string }
  | { kind: 'minWords'; value: number; label?: string };

export type EvaluationCase = {
  id: string;
  language: 'ru' | 'en';
  /** What this case is meant to catch. No private production text. */
  purpose: string;
  system: string;
  prompt: string;
  checks: EvaluationCheck[];
  maxWords?: number;
};

export type EvaluatorRequest = {
  system: string;
  prompt: string;
  maxOutputTokens: number;
};

export type EvaluatorResponse = {
  provider: LlmProvider;
  model: string;
  text: string;
  latencyMs: number;
  usage: LlmTokenUsage;
};

export type Evaluator = {
  id: string;
  provider: LlmProvider;
  model: string;
  run: (request: EvaluatorRequest) => Promise<EvaluatorResponse>;
};

export type CaseEvaluation = {
  caseId: string;
  providerId: string;
  provider: LlmProvider;
  model: string;
  ok: boolean;
  qualityScore: number;
  checksPassed: number;
  checksTotal: number;
  failedChecks: string[];
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  costSource: 'provider_reported' | 'estimated_from_tariff' | 'unknown';
  errorCode: string | null;
};

export type ProviderEvaluationSummary = {
  providerId: string;
  provider: LlmProvider;
  model: string;
  cases: number;
  successfulCases: number;
  qualityScore: number | null;
  averageLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  costComplete: boolean;
  /** Total cost (including failed attempts) divided by successful cases. */
  costPerSuccessfulTaskUsd: number | null;
  unknownUsageCases: number;
  unknownCostCases: number;
  failedCaseIds: string[];
};

export type ProviderComparisonReport = {
  generatedAt: string;
  caseIds: string[];
  identicalCases: true;
  results: CaseEvaluation[];
  summaries: ProviderEvaluationSummary[];
  limitations: string[];
};

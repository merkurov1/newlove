import { estimateLlmCost, type LlmTokenUsage } from '../telemetry';
import type {
  CaseEvaluation,
  EvaluationCase,
  EvaluationCheck,
  Evaluator,
  ProviderComparisonReport,
  ProviderEvaluationSummary,
} from './types';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isCheckPassed(check: EvaluationCheck, text: string): boolean {
  const normalized = normalize(text);

  switch (check.kind) {
    case 'includes':
      return normalized.includes(normalize(check.value));
    case 'excludes':
      return !normalized.includes(normalize(check.value));
    case 'anyOf':
      return check.values.some((value) => normalized.includes(normalize(value)));
    case 'minWords':
      return wordCount(text) >= check.value;
    default:
      return false;
  }
}

function describeCheck(check: EvaluationCheck): string {
  switch (check.kind) {
    case 'includes':
      return check.label ?? `includes "${check.value}"`;
    case 'excludes':
      return check.label ?? `excludes "${check.value}"`;
    case 'anyOf':
      return check.label ?? `any of ${check.values.join(' / ')}`;
    case 'minWords':
      return check.label ?? `at least ${check.value} words`;
    default:
      return 'unknown check';
  }
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return left + right;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function scoreCase(
  caseDefinition: EvaluationCase,
  text: string
): {
  ok: boolean;
  qualityScore: number;
  checksPassed: number;
  checksTotal: number;
  failedChecks: string[];
} {
  const failedChecks: string[] = [];
  let passed = 0;

  for (const check of caseDefinition.checks) {
    if (isCheckPassed(check, text)) {
      passed += 1;
    } else {
      failedChecks.push(describeCheck(check));
    }
  }

  const hasLengthCheck = typeof caseDefinition.maxWords === 'number' && caseDefinition.maxWords > 0;

  if (hasLengthCheck && wordCount(text) > (caseDefinition.maxWords ?? 0)) {
    failedChecks.push(`at most ${caseDefinition.maxWords} words`);
  } else if (hasLengthCheck) {
    passed += 1;
  }

  const checksTotal = caseDefinition.checks.length + (hasLengthCheck ? 1 : 0);
  const checksPassed = passed;
  const qualityScore = checksTotal === 0 ? 1 : checksPassed / checksTotal;

  return {
    ok: failedChecks.length === 0,
    qualityScore,
    checksPassed,
    checksTotal,
    failedChecks,
  };
}

function summarize(evaluator: Evaluator, results: CaseEvaluation[]): ProviderEvaluationSummary {
  const succeeded = results.filter((result) => result.ok);
  const costs = results.map((result) => result.estimatedCostUsd);
  const costComplete = results.every(
    (result) => result.costSource !== 'unknown' && result.estimatedCostUsd !== null
  );
  const totalCost = costs.reduce<number | null>((total, value) => addNullable(total, value), null);

  return {
    providerId: evaluator.id,
    provider: evaluator.provider,
    model: evaluator.model,
    cases: results.length,
    successfulCases: succeeded.length,
    qualityScore: average(results.map((result) => result.qualityScore)),
    averageLatencyMs: average(results.map((result) => result.latencyMs)),
    inputTokens: results.reduce<number | null>(
      (total, result) => addNullable(total, result.inputTokens),
      null
    ),
    outputTokens: results.reduce<number | null>(
      (total, result) => addNullable(total, result.outputTokens),
      null
    ),
    totalTokens: results.reduce<number | null>(
      (total, result) => addNullable(total, result.totalTokens),
      null
    ),
    estimatedCostUsd: totalCost,
    costComplete,
    costPerSuccessfulTaskUsd:
      costComplete && totalCost !== null && succeeded.length > 0
        ? Number((totalCost / succeeded.length).toFixed(8))
        : null,
    unknownUsageCases: results.filter((result) => result.inputTokens === null).length,
    unknownCostCases: results.filter((result) => result.costSource === 'unknown').length,
    failedCaseIds: results.filter((result) => !result.ok).map((result) => result.caseId),
  };
}

/**
 * Run every case against every evaluator with the exact same system prompt,
 * user prompt and output budget. Results never store the generated answer.
 */
export async function compareEvaluators(input: {
  cases: EvaluationCase[];
  evaluators: Evaluator[];
  maxOutputTokens?: number;
  concurrency?: number;
}): Promise<ProviderComparisonReport> {
  const cases = input.cases;
  const evaluators = input.evaluators;
  const maxOutputTokens = Math.min(Math.max(input.maxOutputTokens ?? 600, 100), 2_000);

  if (cases.length === 0) throw new Error('evaluation_cases_empty');
  if (evaluators.length === 0) throw new Error('evaluation_evaluators_empty');

  const results: CaseEvaluation[] = [];

  for (const evaluator of evaluators) {
    const caseResults: CaseEvaluation[] = [];

    for (const caseDefinition of cases) {
      const startedAt = Date.now();

      try {
        const response = await evaluator.run({
          system: caseDefinition.system,
          prompt: caseDefinition.prompt,
          maxOutputTokens,
        });
        const score = scoreCase(caseDefinition, response.text);
        const usage: LlmTokenUsage = response.usage;
        const cost = estimateLlmCost({
          provider: response.provider,
          model: response.model,
          usage,
        });

        caseResults.push({
          caseId: caseDefinition.id,
          providerId: evaluator.id,
          provider: response.provider,
          model: response.model,
          ok: score.ok,
          qualityScore: score.qualityScore,
          checksPassed: score.checksPassed,
          checksTotal: score.checksTotal,
          failedChecks: score.failedChecks,
          latencyMs: response.latencyMs,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: cost.costUsd,
          costSource: cost.source,
          errorCode: null,
        });
      } catch (error) {
        caseResults.push({
          caseId: caseDefinition.id,
          providerId: evaluator.id,
          provider: evaluator.provider,
          model: evaluator.model,
          ok: false,
          qualityScore: 0,
          checksPassed: 0,
          checksTotal: caseDefinition.checks.length,
          failedChecks: ['provider error'],
          latencyMs: Date.now() - startedAt,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null,
          costSource: 'unknown',
          errorCode:
            error instanceof Error ? error.message.slice(0, 120) : 'provider_request_failed',
        });
      }
    }

    results.push(...caseResults);
  }

  return {
    generatedAt: new Date().toISOString(),
    caseIds: cases.map((item) => item.id),
    identicalCases: true,
    results,
    summaries: evaluators.map((evaluator) =>
      summarize(
        evaluator,
        results.filter((result) => result.providerId === evaluator.id)
      )
    ),
    limitations: [
      'Quality is a deterministic checklist, not a human editorial rating.',
      'Cost per successful task is total estimated cost divided by successful cases; unknown prices keep it null.',
      'A live comparison performs real paid provider calls. It must be owner-approved and bounded.',
    ],
  };
}

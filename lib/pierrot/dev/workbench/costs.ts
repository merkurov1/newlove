import type {
  DevAttemptCost,
  DevCostConfidence,
  DevCostEstimate,
  DevCostModelRate,
  DevCostRate,
} from './types';

/**
 * Dev Cost Ledger helpers.
 *
 * Rules:
 *   * Unknown is never zero. A missing price, missing runtime or missing token
 *     report produces `null`, not `0`.
 *   * Model cost is reported only when OpenCode sent it in `step_finish`. When
 *     the CLI omitted the price but reported tokens, a versioned tariff is used
 *     and the result is explicitly marked as estimated.
 *   * Codespaces cost is an estimate derived from measured wall-clock runtime
 *     and either an explicit hourly rate or the public machine list price.
 *   * GitHub does not expose billable Codespaces minutes through this token, so
 *     those values are always labelled as estimated, never as billed. A
 *     separate account-level snapshot may be available from the billing API.
 *   * Tariffs are versioned and stored with each amount. Historical amounts are
 *     never silently recalculated with today's price.
 */

export const COST_PRICING_VERSION = 'github-codespaces-list-price-2025-01';
export const COST_PRICING_EFFECTIVE_AT = '2025-01-01T00:00:00.000Z';
export const COST_PRICING_SOURCE =
  'https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces';

export const MODEL_PRICING_VERSION = 'deepseek-api-price-2025-09-05';
export const MODEL_PRICING_EFFECTIVE_AT = '2025-09-05T00:00:00.000Z';
export const MODEL_PRICING_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing';

// USD per running hour for GitHub-hosted Codespaces machine types.
const MACHINE_HOURLY_USD: Record<string, number> = {
  basicLinux32gb: 0.18,
  standardLinux32gb: 0.36,
  premiumLinux: 0.72,
  largePremiumLinux: 1.44,
  xLargePremiumLinux: 2.88,
};

const DEEPSEEK_RATE: DevCostModelRate = {
  version: MODEL_PRICING_VERSION,
  source: MODEL_PRICING_SOURCE,
  effectiveAt: MODEL_PRICING_EFFECTIVE_AT,
  currency: 'USD',
  inputPerMillionUsd: 0.28,
  outputPerMillionUsd: 0.42,
  cacheReadPerMillionUsd: 0.028,
  // DeepSeek publishes cache-hit and cache-miss input rates, not a separate
  // cache-write rate. Cache-write tokens are therefore priced as cache misses.
  cacheWritePerMillionUsd: 0.28,
};

export type OpenCodeUsage = {
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** Best-known cost: reported when available, otherwise estimated. */
  costUsd: number | null;
  reportedCostUsd: number | null;
  estimatedCostUsd: number | null;
  costKind: 'reported' | 'estimated' | 'unknown';
  steps: number;
  provenance: string;
  rate: DevCostModelRate | null;
};

export type CodespaceCostEstimate = {
  machine: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  runtimeMs: number | null;
  billableMs: number | null;
  hourlyUsd: number | null;
  estimatedUsd: number | null;
  confirmedUsd: number | null;
  costKind: 'estimated' | 'confirmed' | 'unknown';
  billingSource: string;
  storageUsd: number | null;
  sharedUsd: number | null;
  provenance: string;
  rate: DevCostRate | null;
};

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function envRate(prefix: string): number | null {
  const raw = process.env[prefix];
  if (raw === undefined || raw.trim() === '') return null;
  return finite(raw);
}

function providerFromModel(model: string | null): string | null {
  if (!model || !model.includes('/')) return null;
  return model.split('/')[0]?.trim().toLowerCase() || null;
}

export function modelRateFor(
  provider: string | null,
  model: string | null
): DevCostModelRate | null {
  const overrideInput = envRate('PIERROT_DEV_MODEL_INPUT_USD_PER_M');
  const overrideOutput = envRate('PIERROT_DEV_MODEL_OUTPUT_USD_PER_M');
  if (overrideInput !== null || overrideOutput !== null) {
    return {
      version:
        text(process.env.PIERROT_DEV_MODEL_PRICING_VERSION, 120) ||
        'env-model-price-override',
      source: 'PIERROT_DEV_MODEL_* environment override',
      effectiveAt: new Date().toISOString(),
      currency: 'USD',
      inputPerMillionUsd: overrideInput ?? DEEPSEEK_RATE.inputPerMillionUsd,
      outputPerMillionUsd: overrideOutput ?? DEEPSEEK_RATE.outputPerMillionUsd,
      cacheReadPerMillionUsd:
        envRate('PIERROT_DEV_MODEL_CACHE_READ_USD_PER_M') ??
        DEEPSEEK_RATE.cacheReadPerMillionUsd,
      cacheWritePerMillionUsd:
        envRate('PIERROT_DEV_MODEL_CACHE_WRITE_USD_PER_M') ??
        DEEPSEEK_RATE.cacheWritePerMillionUsd,
    };
  }

  const normalizedProvider = provider?.toLowerCase() || providerFromModel(model);
  const normalizedModel = model?.toLowerCase() || '';
  if (normalizedProvider === 'deepseek' || normalizedModel.includes('deepseek')) {
    return DEEPSEEK_RATE;
  }
  return null;
}

export function modelPricingRateInfo(): DevCostRate {
  const rate = modelRateFor(
    text(process.env.PIERROT_DEV_OPENCODE_PROVIDER, 80) || 'deepseek',
    text(process.env.PIERROT_DEV_OPENCODE_MODEL, 120) || 'deepseek/deepseek-chat'
  );
  return rate || DEEPSEEK_RATE;
}

export function codespaceRateInfo(_machine: string | null): DevCostRate {
  const configured = envRate('PIERROT_DEV_CODESPACE_HOURLY_USD');
  if (configured !== null) {
    return {
      version: 'env-codespace-hourly-override',
      source: 'PIERROT_DEV_CODESPACE_HOURLY_USD environment override',
      effectiveAt: new Date().toISOString(),
      currency: 'USD',
    };
  }
  return {
    version: COST_PRICING_VERSION,
    source: COST_PRICING_SOURCE,
    effectiveAt: COST_PRICING_EFFECTIVE_AT,
    currency: 'USD',
  };
}

export function codespaceHourlyRate(machine: string | null): number | null {
  const configured = envRate('PIERROT_DEV_CODESPACE_HOURLY_USD');
  if (configured !== null) return configured;
  if (!machine) return null;
  return MACHINE_HOURLY_USD[machine] ?? null;
}

export function estimateCodespaceCost(input: {
  machine: string | null;
  runtimeMs: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}): CodespaceCostEstimate {
  const startedAt = iso(input.startedAt);
  const finishedAt = iso(input.finishedAt);
  let runtimeMs = finite(input.runtimeMs);
  if (runtimeMs === null && startedAt && finishedAt) {
    runtimeMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  }
  const hourlyUsd = codespaceHourlyRate(input.machine);
  const rate = hourlyUsd === null ? null : codespaceRateInfo(input.machine);
  if (runtimeMs === null || hourlyUsd === null) {
    return {
      machine: input.machine,
      startedAt,
      finishedAt,
      runtimeMs,
      billableMs: runtimeMs,
      hourlyUsd,
      estimatedUsd: null,
      confirmedUsd: null,
      costKind: 'unknown',
      billingSource:
        runtimeMs === null
          ? 'unavailable:runtime-not-measured'
          : 'unavailable:codespace-hourly-rate-not-configured',
      storageUsd: null,
      sharedUsd: null,
      provenance:
        runtimeMs === null
          ? 'unavailable:runtime-not-measured'
          : 'unavailable:codespace-hourly-rate-not-configured',
      rate,
    };
  }
  return {
    machine: input.machine,
    startedAt,
    finishedAt,
    runtimeMs,
    billableMs: runtimeMs,
    hourlyUsd,
    estimatedUsd: round6((hourlyUsd * runtimeMs) / 3_600_000),
    confirmedUsd: null,
    costKind: 'estimated',
    billingSource: rate?.version || 'sku-rate',
    storageUsd: null,
    sharedUsd: null,
    provenance: `estimated:${rate?.version || COST_PRICING_VERSION}`,
    rate,
  };
}

function computeModelCost(
  rate: DevCostModelRate,
  tokens: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
  }
): number | null {
  if (
    tokens.inputTokens === null &&
    tokens.outputTokens === null &&
    tokens.cacheReadTokens === null &&
    tokens.cacheWriteTokens === null
  ) {
    return null;
  }
  const inputRate = rate.inputPerMillionUsd ?? 0;
  const outputRate = rate.outputPerMillionUsd ?? 0;
  const cacheReadRate = rate.cacheReadPerMillionUsd ?? inputRate;
  const cacheWriteRate = rate.cacheWritePerMillionUsd ?? inputRate;
  const cost =
    (tokens.inputTokens ?? 0) * inputRate +
    (tokens.outputTokens ?? 0) * outputRate +
    (tokens.cacheReadTokens ?? 0) * cacheReadRate +
    (tokens.cacheWriteTokens ?? 0) * cacheWriteRate;
  return round6(cost / 1_000_000);
}

export function normalizeOpenCodeUsage(value: unknown): OpenCodeUsage {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const provider =
    text(record.provider, 80) ||
    text(record.providerID, 80) ||
    text(record.providerId, 80) ||
    text(process.env.PIERROT_DEV_OPENCODE_PROVIDER, 80);
  const model =
    text(record.model, 120) ||
    text(record.modelID, 120) ||
    text(record.modelId, 120) ||
    text(process.env.PIERROT_DEV_OPENCODE_MODEL, 120);
  const inputTokens = finite(record.inputTokens);
  const outputTokens = finite(record.outputTokens);
  const reasoningTokens = finite(record.reasoningTokens);
  const cacheReadTokens = finite(record.cacheReadTokens);
  const cacheWriteTokens = finite(record.cacheWriteTokens);
  const reportedCostUsd = finite(record.reportedCostUsd) ?? finite(record.costUsd);
  const rate = modelRateFor(provider, model);
  const estimatedCostUsd =
    reportedCostUsd === null && rate
      ? computeModelCost(rate, {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
        })
      : null;
  const costUsd = reportedCostUsd ?? estimatedCostUsd;
  const steps = finite(record.steps);
  const costKind =
    reportedCostUsd !== null ? 'reported' : estimatedCostUsd !== null ? 'estimated' : 'unknown';
  const suppliedProvenance = text(record.provenance, 120);
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
    reportedCostUsd,
    estimatedCostUsd,
    costKind,
    steps: steps === null ? 0 : Math.trunc(steps),
    provenance:
      costKind === 'reported'
        ? suppliedProvenance || 'opencode-step-finish'
        : costKind === 'estimated'
          ? `estimated:${rate?.version || 'model-rate'}`
          : 'unavailable:opencode-did-not-report-cost',
    rate,
  };
}

export function buildAttemptCost(input: {
  usage?: unknown;
  machine?: string | null;
  runtimeMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** False when the attempt failed before OpenCode was started. */
  modelStarted?: boolean;
}): DevAttemptCost {
  const modelStarted = input.modelStarted !== false;
  const model = normalizeOpenCodeUsage(input.usage);
  if ((!modelStarted || model.steps === 0) && model.costUsd === null) {
    model.provenance = modelStarted
      ? 'unavailable:opencode-did-not-report-cost'
      : 'unavailable:model-not-started';
    model.costKind = 'unknown';
  }
  const codespace = estimateCodespaceCost({
    machine: input.machine || null,
    runtimeMs: typeof input.runtimeMs === 'number' ? input.runtimeMs : null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  });
  const effectiveCodespace = codespace.confirmedUsd ?? codespace.estimatedUsd;
  const unknown: string[] = [];
  if (model.costUsd === null) {
    unknown.push(modelStarted ? 'model cost' : 'model cost (model did not run)');
  }
  if (effectiveCodespace === null) unknown.push('Codespaces cost');
  const totalUsd =
    model.costUsd === null || effectiveCodespace === null
      ? null
      : round6(model.costUsd + effectiveCodespace);

  return {
    model,
    codespace,
    totalUsd,
    unknown,
    measuredAt: new Date().toISOString(),
  };
}

export function readAttemptCost(
  verification: Record<string, unknown> | undefined
): DevAttemptCost | null {
  const value = verification?.cost;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!record.model && !record.codespace) return null;
  return value as DevAttemptCost;
}

/** Normalized best-known values for both old and new stored cost shapes. */
export function attemptCostValues(cost: DevAttemptCost | null | undefined): {
  modelReportedUsd: number | null;
  modelEstimatedUsd: number | null;
  modelEffectiveUsd: number | null;
  codespaceEstimatedUsd: number | null;
  codespaceConfirmedUsd: number | null;
  codespaceEffectiveUsd: number | null;
  totalUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  unknown: string[];
} {
  if (!cost) {
    return {
      modelReportedUsd: null,
      modelEstimatedUsd: null,
      modelEffectiveUsd: null,
      codespaceEstimatedUsd: null,
      codespaceConfirmedUsd: null,
      codespaceEffectiveUsd: null,
      totalUsd: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      unknown: ['no attempt cost recorded'],
    };
  }
  const reported =
    cost.model.costKind === 'estimated'
      ? null
      : finite(cost.model.reportedCostUsd) ?? finite(cost.model.costUsd);
  const estimated = finite(cost.model.estimatedCostUsd);
  const modelEffective = finite(cost.model.costUsd) ?? reported ?? estimated;
  const codespaceEstimated = finite(cost.codespace.estimatedUsd);
  const codespaceConfirmed = finite(cost.codespace.confirmedUsd);
  const codespaceEffective = codespaceConfirmed ?? codespaceEstimated;
  const total =
    modelEffective === null || codespaceEffective === null
      ? null
      : round6(modelEffective + codespaceEffective);
  return {
    modelReportedUsd: reported,
    modelEstimatedUsd: estimated,
    modelEffectiveUsd: modelEffective,
    codespaceEstimatedUsd: codespaceEstimated,
    codespaceConfirmedUsd: codespaceConfirmed,
    codespaceEffectiveUsd: codespaceEffective,
    totalUsd: total,
    inputTokens: finite(cost.model.inputTokens),
    outputTokens: finite(cost.model.outputTokens),
    reasoningTokens: finite(cost.model.reasoningTokens),
    cacheReadTokens: finite(cost.model.cacheReadTokens),
    cacheWriteTokens: finite(cost.model.cacheWriteTokens),
    unknown: Array.isArray(cost.unknown)
      ? cost.unknown.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function summarizeCosts(
  costs: Array<DevAttemptCost | null | undefined>
): {
  modelUsd: number | null;
  modelReportedUsd: number | null;
  modelEstimatedUsd: number | null;
  codespaceEstimatedUsd: number | null;
  codespaceConfirmedUsd: number | null;
  totalUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  attemptsWithCost: number;
  attemptsMissingCost: number;
  attemptsWithEstimatedModel: number;
  attemptsWithEstimatedCodespace: number;
  unknown: string[];
  provenance: string;
} {
  let modelSum: number | null = 0;
  let modelReportedSum: number | null = 0;
  let modelEstimatedSum: number | null = 0;
  let codespaceEstimatedSum: number | null = 0;
  let codespaceConfirmedSum: number | null = 0;
  let codespaceEffectiveSum: number | null = 0;
  let inputTokens: number | null = 0;
  let outputTokens: number | null = 0;
  let reasoningTokens: number | null = 0;
  let withCost = 0;
  let estimatedModel = 0;
  let estimatedCodespace = 0;
  const unknown = new Set<string>();

  for (const cost of costs) {
    if (!cost) continue;
    withCost += 1;
    const values = attemptCostValues(cost);
    modelSum =
      modelSum === null || values.modelEffectiveUsd === null
        ? null
        : modelSum + values.modelEffectiveUsd;
    modelReportedSum =
      modelReportedSum === null || values.modelReportedUsd === null
        ? null
        : modelReportedSum + values.modelReportedUsd;
    modelEstimatedSum =
      modelEstimatedSum === null || values.modelEstimatedUsd === null
        ? null
        : modelEstimatedSum + values.modelEstimatedUsd;
    codespaceEstimatedSum =
      codespaceEstimatedSum === null || values.codespaceEstimatedUsd === null
        ? null
        : codespaceEstimatedSum + values.codespaceEstimatedUsd;
    codespaceConfirmedSum =
      codespaceConfirmedSum === null || values.codespaceConfirmedUsd === null
        ? null
        : codespaceConfirmedSum + values.codespaceConfirmedUsd;
    codespaceEffectiveSum =
      codespaceEffectiveSum === null || values.codespaceEffectiveUsd === null
        ? null
        : codespaceEffectiveSum + values.codespaceEffectiveUsd;
    inputTokens =
      inputTokens === null || values.inputTokens === null ? null : inputTokens + values.inputTokens;
    outputTokens =
      outputTokens === null || values.outputTokens === null
        ? null
        : outputTokens + values.outputTokens;
    reasoningTokens =
      reasoningTokens === null || values.reasoningTokens === null
        ? null
        : reasoningTokens + values.reasoningTokens;
    if (values.modelEstimatedUsd !== null) estimatedModel += 1;
    if (
      values.codespaceEstimatedUsd !== null &&
      values.codespaceConfirmedUsd === null
    ) {
      estimatedCodespace += 1;
    }
    for (const item of values.unknown) unknown.add(item);
  }

  if (withCost === 0) {
    return {
      modelUsd: null,
      modelReportedUsd: null,
      modelEstimatedUsd: null,
      codespaceEstimatedUsd: null,
      codespaceConfirmedUsd: null,
      totalUsd: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      attemptsWithCost: 0,
      attemptsMissingCost: costs.length,
      attemptsWithEstimatedModel: 0,
      attemptsWithEstimatedCodespace: 0,
      unknown: ['no attempt cost recorded'],
      provenance: 'unavailable:no-attempt-cost',
    };
  }

  const totalUsd =
    modelSum === null || codespaceEffectiveSum === null
      ? null
      : round6(modelSum + codespaceEffectiveSum);

  return {
    modelUsd: modelSum === null ? null : round6(modelSum),
    modelReportedUsd: modelReportedSum === null ? null : round6(modelReportedSum),
    modelEstimatedUsd: modelEstimatedSum === null ? null : round6(modelEstimatedSum),
    codespaceEstimatedUsd:
      codespaceEstimatedSum === null ? null : round6(codespaceEstimatedSum),
    codespaceConfirmedUsd:
      codespaceConfirmedSum === null ? null : round6(codespaceConfirmedSum),
    totalUsd,
    inputTokens,
    outputTokens,
    reasoningTokens,
    attemptsWithCost: withCost,
    attemptsMissingCost: Math.max(0, costs.length - withCost),
    attemptsWithEstimatedModel: estimatedModel,
    attemptsWithEstimatedCodespace: estimatedCodespace,
    unknown: [...unknown],
    provenance:
      estimatedModel > 0 || estimatedCodespace > 0
        ? 'reported/estimated-model-usage + estimated-codespaces-runtime'
        : 'reported-model-usage + estimated-codespaces-runtime',
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function tokenRange(expected: number, minFactor: number, maxFactor: number) {
  const min = Math.max(0, Math.round(expected * minFactor));
  const max = Math.max(min + 1, Math.round(expected * maxFactor));
  return { min, expected: Math.round(expected), max };
}

/**
 * Deterministic pre-execution estimate from task text. This deliberately does
 * not pretend to be a forecast from historical runs: the assumptions are stored
 * with the value and shown in Admin.
 */
export function estimateTaskCost(input: {
  title?: string | null;
  objective?: string | null;
  acceptanceCriteria?: string[] | null;
  tests?: string[] | null;
  affectedFiles?: string[] | null;
  machine?: string | null;
  provider?: string | null;
  model?: string | null;
}): DevCostEstimate {
  const title = text(input.title, 500) || '';
  const objective = text(input.objective, 12_000) || '';
  const criteria = Array.isArray(input.acceptanceCriteria)
    ? input.acceptanceCriteria.filter((item): item is string => typeof item === 'string')
    : [];
  const tests = Array.isArray(input.tests)
    ? input.tests.filter((item): item is string => typeof item === 'string')
    : [];
  const affectedFiles = Array.isArray(input.affectedFiles)
    ? input.affectedFiles.filter((item): item is string => typeof item === 'string')
    : [];
  const textChars = title.length + objective.length + criteria.join(' ').length;
  const expectedInputTokens = clamp(
    2_500 + Math.ceil(textChars / 3) + criteria.length * 250 + tests.length * 150,
    4_000,
    120_000
  );
  const expectedOutputTokens = clamp(
    1_800 + criteria.length * 700 + tests.length * 250 + affectedFiles.length * 150,
    2_000,
    50_000
  );
  const inputTokens = tokenRange(expectedInputTokens, 0.4, 2.5);
  const outputTokens = tokenRange(expectedOutputTokens, 0.4, 2.5);

  const provider =
    text(input.provider, 80) ||
    text(process.env.PIERROT_DEV_OPENCODE_PROVIDER, 80) ||
    'deepseek';
  const model =
    text(input.model, 120) ||
    text(process.env.PIERROT_DEV_OPENCODE_MODEL, 120) ||
    'deepseek/deepseek-chat';
  const modelRate = modelRateFor(provider, model);
  const modelCost = modelRate
    ? {
        minUsd:
          modelRate.inputPerMillionUsd === null || modelRate.outputPerMillionUsd === null
            ? null
            : round6(
                (inputTokens.min * modelRate.inputPerMillionUsd +
                  outputTokens.min * modelRate.outputPerMillionUsd) /
                  1_000_000
              ),
        expectedUsd:
          modelRate.inputPerMillionUsd === null || modelRate.outputPerMillionUsd === null
            ? null
            : round6(
                (inputTokens.expected * modelRate.inputPerMillionUsd +
                  outputTokens.expected * modelRate.outputPerMillionUsd) /
                  1_000_000
              ),
        maxUsd:
          modelRate.inputPerMillionUsd === null || modelRate.outputPerMillionUsd === null
            ? null
            : round6(
                (inputTokens.max * modelRate.inputPerMillionUsd +
                  outputTokens.max * modelRate.outputPerMillionUsd) /
                  1_000_000
              ),
      }
    : { minUsd: null, expectedUsd: null, maxUsd: null };

  const machine =
    text(input.machine, 120) ||
    text(process.env.PIERROT_DEV_CODESPACE_MACHINE, 120) ||
    'standardLinux32gb';
  const hourlyUsd = codespaceHourlyRate(machine);
  const expectedExecutionMs =
    8 * 60_000 +
    criteria.length * 2 * 60_000 +
    tests.length * 2 * 60_000 +
    affectedFiles.length * 60_000;
  // Include Codespace startup and an idle buffer. Queue waiting time is not part
  // of the Codespace billable lifecycle.
  const expectedRuntimeMs = clamp(
    Math.round(expectedExecutionMs * 1.15 + 3 * 60_000),
    10 * 60_000,
    180 * 60_000
  );
  const minRuntimeMs = Math.max(5 * 60_000, Math.round(expectedRuntimeMs * 0.5));
  const maxRuntimeMs = Math.min(240 * 60_000, Math.round(expectedRuntimeMs * 2));
  const codespaceCost = (runtimeMs: number) =>
    hourlyUsd === null ? null : round6((hourlyUsd * runtimeMs) / 3_600_000);

  const modelAssumptions = [
    'Token ranges are inferred from task title, objective, acceptance criteria and declared checks; no usage exists before execution.',
    'Estimate assumes cache misses only; it does not assume cache savings.',
    modelRate
      ? `Model price uses ${modelRate.version} (${modelRate.currency}) effective ${modelRate.effectiveAt}, source ${modelRate.source}.`
      : 'No versioned tariff matches the selected provider/model, so model cost stays unknown.',
  ];
  const codespaceAssumptions = [
    'Codespaces compute uses the public machine list price, not a GitHub invoice.',
    'Runtime includes a startup allowance and a 15% idle buffer; queue waiting time is excluded.',
    'Storage and shared account charges are excluded because per-attempt attribution is not reliable.',
  ];
  const unknown: string[] = [];
  if (modelCost.expectedUsd === null) unknown.push('model tariff unavailable');
  if (hourlyUsd === null) unknown.push('Codespaces tariff unavailable');

  const totalFor = (key: 'minUsd' | 'expectedUsd' | 'maxUsd') => {
    const modelValue = modelCost[key];
    const codespaceValue =
      key === 'minUsd'
        ? codespaceCost(minRuntimeMs)
        : key === 'maxUsd'
          ? codespaceCost(maxRuntimeMs)
          : codespaceCost(expectedRuntimeMs);
    return modelValue === null || codespaceValue === null
      ? null
      : round6(modelValue + codespaceValue);
  };

  const confidence: DevCostConfidence =
    modelCost.expectedUsd !== null && hourlyUsd !== null
      ? criteria.length <= 12
        ? 'medium'
        : 'low'
      : 'low';

  return {
    persisted: false,
    pricingVersion: `${modelRate?.version || 'model-rate-unknown'}+${COST_PRICING_VERSION}`,
    currency: 'USD',
    createdAt: new Date().toISOString(),
    confidence,
    assumptions: [...modelAssumptions, ...codespaceAssumptions],
    model: {
      provider,
      model,
      ...modelCost,
      inputTokens,
      outputTokens,
      rate:
        modelRate || {
          version: 'model-rate-unknown',
          source: 'no matching tariff',
          effectiveAt: MODEL_PRICING_EFFECTIVE_AT,
          currency: 'USD',
          inputPerMillionUsd: null,
          outputPerMillionUsd: null,
          cacheReadPerMillionUsd: null,
          cacheWritePerMillionUsd: null,
        },
      assumptions: modelAssumptions,
    },
    codespaces: {
      machine,
      minUsd: codespaceCost(minRuntimeMs),
      expectedUsd: codespaceCost(expectedRuntimeMs),
      maxUsd: codespaceCost(maxRuntimeMs),
      runtimeMs: { min: minRuntimeMs, expected: expectedRuntimeMs, max: maxRuntimeMs },
      hourlyUsd,
      rate: codespaceRateInfo(machine),
      assumptions: codespaceAssumptions,
    },
    total: {
      minUsd: totalFor('minUsd'),
      expectedUsd: totalFor('expectedUsd'),
      maxUsd: totalFor('maxUsd'),
    },
    unknown,
  };
}

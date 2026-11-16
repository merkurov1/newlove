import type { DevAttemptCost } from './types';

/**
 * Dev Cost Ledger helpers.
 *
 * Rules:
 *   * Unknown is never zero. A missing price, missing runtime or missing token
 *     report produces `null`, not `0`.
 *   * Model cost is actual only when OpenCode reported it in `step_finish`.
 *   * Codespaces cost is an estimate derived from measured wall-clock runtime
 *     and either an explicit hourly rate or the public machine list price.
 *   * GitHub does not expose billable Codespaces minutes through this token, so
 *     those values are always labelled as estimated, never as billed.
 */

export const COST_PRICING_VERSION = 'github-codespaces-list-price-2025-01';
export const COST_PRICING_EFFECTIVE_AT = '2025-01-01T00:00:00.000Z';

// USD per running hour for GitHub-hosted Codespaces machine types.
const MACHINE_HOURLY_USD: Record<string, number> = {
  basicLinux32gb: 0.18,
  standardLinux32gb: 0.36,
  premiumLinux: 0.72,
  largePremiumLinux: 1.44,
  xLargePremiumLinux: 2.88,
};

export type OpenCodeUsage = {
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  steps: number;
  provenance: string;
};

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function configuredHourlyRate(): number | null {
  const raw = process.env.PIERROT_DEV_CODESPACE_HOURLY_USD;
  if (raw === undefined || raw.trim() === '') return null;
  return finite(raw);
}

export function codespaceHourlyRate(machine: string | null): number | null {
  const configured = configuredHourlyRate();
  if (configured !== null) return configured;
  if (!machine) return null;
  return MACHINE_HOURLY_USD[machine] ?? null;
}

export function estimateCodespaceCost(input: {
  machine: string | null;
  runtimeMs: number | null;
}): {
  machine: string | null;
  runtimeMs: number | null;
  hourlyUsd: number | null;
  estimatedUsd: number | null;
  provenance: string;
} {
  const runtimeMs = finite(input.runtimeMs);
  const hourlyUsd = codespaceHourlyRate(input.machine);
  if (runtimeMs === null || hourlyUsd === null) {
    return {
      machine: input.machine,
      runtimeMs,
      hourlyUsd,
      estimatedUsd: null,
      provenance:
        runtimeMs === null
          ? 'unavailable:runtime-not-measured'
          : 'unavailable:codespace-hourly-rate-not-configured',
    };
  }
  return {
    machine: input.machine,
    runtimeMs,
    hourlyUsd,
    estimatedUsd: Math.round((hourlyUsd * runtimeMs) / 3_600_000 * 1e6) / 1e6,
    provenance: `estimated:${COST_PRICING_VERSION}`,
  };
}

export function normalizeOpenCodeUsage(value: unknown): OpenCodeUsage {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const provider = typeof record.provider === 'string' ? record.provider.slice(0, 80) : null;
  const model = typeof record.model === 'string' ? record.model.slice(0, 120) : null;
  const inputTokens = finite(record.inputTokens);
  const outputTokens = finite(record.outputTokens);
  const reasoningTokens = finite(record.reasoningTokens);
  const cacheReadTokens = finite(record.cacheReadTokens);
  const cacheWriteTokens = finite(record.cacheWriteTokens);
  const costUsd = finite(record.costUsd);
  const steps = finite(record.steps);
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
    steps: steps === null ? 0 : Math.trunc(steps),
    provenance:
      costUsd === null
        ? 'unavailable:opencode-did-not-report-cost'
        : typeof record.provenance === 'string'
          ? record.provenance.slice(0, 120)
          : 'opencode-step-finish',
  };
}

export function buildAttemptCost(input: {
  usage?: unknown;
  machine?: string | null;
  runtimeMs?: number | null;
}): DevAttemptCost {
  const model = normalizeOpenCodeUsage(input.usage);
  const codespace = estimateCodespaceCost({
    machine: input.machine || null,
    runtimeMs: typeof input.runtimeMs === 'number' ? input.runtimeMs : null,
  });
  const unknown: string[] = [];
  if (model.costUsd === null) unknown.push('model cost');
  if (codespace.estimatedUsd === null) unknown.push('Codespaces cost');
  const totalUsd =
    model.costUsd === null || codespace.estimatedUsd === null
      ? null
      : Math.round((model.costUsd + codespace.estimatedUsd) * 1e6) / 1e6;

  return {
    model,
    codespace,
    totalUsd,
    unknown,
    measuredAt: new Date().toISOString(),
  };
}

export function readAttemptCost(verification: Record<string, unknown> | undefined): DevAttemptCost | null {
  const value = verification?.cost;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!record.model && !record.codespace) return null;
  return value as DevAttemptCost;
}

export function summarizeCosts(
  costs: Array<DevAttemptCost | null | undefined>
): {
  modelUsd: number | null;
  codespaceEstimatedUsd: number | null;
  totalUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  attemptsWithCost: number;
  attemptsMissingCost: number;
  unknown: string[];
  provenance: string;
} {
  let modelSum: number | null = 0;
  let codespaceSum: number | null = 0;
  let inputTokens: number | null = 0;
  let outputTokens: number | null = 0;
  let reasoningTokens: number | null = 0;
  let withCost = 0;
  const unknown = new Set<string>();

  for (const cost of costs) {
    if (!cost) continue;
    withCost += 1;
    modelSum = modelSum === null || cost.model.costUsd === null ? null : modelSum + cost.model.costUsd;
    codespaceSum =
      codespaceSum === null || cost.codespace.estimatedUsd === null
        ? null
        : codespaceSum + cost.codespace.estimatedUsd;
    inputTokens =
      inputTokens === null || cost.model.inputTokens === null
        ? null
        : inputTokens + cost.model.inputTokens;
    outputTokens =
      outputTokens === null || cost.model.outputTokens === null
        ? null
        : outputTokens + cost.model.outputTokens;
    reasoningTokens =
      reasoningTokens === null || cost.model.reasoningTokens === null
        ? null
        : reasoningTokens + cost.model.reasoningTokens;
    for (const item of cost.unknown) unknown.add(item);
  }

  if (withCost === 0) {
    return {
      modelUsd: null,
      codespaceEstimatedUsd: null,
      totalUsd: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      attemptsWithCost: 0,
      attemptsMissingCost: costs.length,
      unknown: ['no attempt cost recorded'],
      provenance: 'unavailable:no-attempt-cost',
    };
  }

  const totalUsd =
    modelSum === null || codespaceSum === null
      ? null
      : Math.round((modelSum + codespaceSum) * 1e6) / 1e6;

  return {
    modelUsd: modelSum,
    codespaceEstimatedUsd: codespaceSum,
    totalUsd,
    inputTokens,
    outputTokens,
    reasoningTokens,
    attemptsWithCost: withCost,
    attemptsMissingCost: Math.max(0, costs.length - withCost),
    unknown: [...unknown],
    provenance: 'actual-model-usage + estimated-codespaces-runtime',
  };
}

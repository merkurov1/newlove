/**
 * Task-aware generation budgets and coordinated timeouts for Pierrot.
 *
 * Output budgets are application policy, not a claim about provider context
 * windows. Each provider adapter clamps the requested value to the model's
 * supported output cap before the request is sent.
 */

export type PierrotTaskKind = 'conversation' | 'analysis' | 'research' | 'structured';

export type PierrotGenerationPolicy = {
  task: PierrotTaskKind;
  maxOutputTokens: number;
  providerTimeoutMs: number;
  totalTimeoutMs: number;
  reason: string;
};

export const PIERROT_PROVIDER_OUTPUT_CAP = 8192;
export const PIERROT_CLIENT_TIMEOUT_MS = 240_000;
export const PIERROT_API_MAX_DURATION_SECONDS = 300;

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

const BUDGETS: Record<PierrotTaskKind, { env: string; fallback: number; min: number; max: number }> = {
  conversation: {
    env: 'PIERROT_OUTPUT_TOKENS_CONVERSATION',
    fallback: 1_400,
    min: 600,
    max: 2_000,
  },
  analysis: {
    env: 'PIERROT_OUTPUT_TOKENS_ANALYSIS',
    fallback: 3_500,
    min: 1_500,
    max: 5_000,
  },
  research: {
    env: 'PIERROT_OUTPUT_TOKENS_RESEARCH',
    fallback: 6_000,
    min: 3_000,
    max: 8_000,
  },
  structured: {
    env: 'PIERROT_OUTPUT_TOKENS_STRUCTURED',
    fallback: 8_000,
    min: 4_000,
    max: 10_000,
  },
};

const TIMEOUTS: Record<PierrotTaskKind, { provider: number; total: number }> = {
  conversation: { provider: 35_000, total: 60_000 },
  analysis: { provider: 60_000, total: 120_000 },
  research: { provider: 90_000, total: 210_000 },
  structured: { provider: 90_000, total: 240_000 },
};

export function classifyPierrotTask(input: {
  message: string;
  isReasoning?: boolean;
  hasRetrievedContext?: boolean;
  hasWebContext?: boolean;
  historyLength?: number;
}): { task: PierrotTaskKind; reason: string } {
  const text = input.message.toLowerCase();
  const historyLength = input.historyLength ?? 0;

  const structured =
    /(?:график|диаграмм|таблиц|chart|diagram|table|structured|визуализ|visuali[sz]|сравнительн|comparison)/i.test(
      text
    );
  if (structured) {
    return { task: 'structured', reason: 'structured_output_requested' };
  }

  const research =
    /(?:исследуй|исследован|глубок|подробн|развёрнут|развернут|истори|архив|research|in depth|deep dive|historical|long-form|essay|проанализируй|анализ)/i.test(
      text
    );
  if (research || (input.hasWebContext && text.length > 240) || historyLength > 12) {
    return { task: 'research', reason: research ? 'research_intent' : 'long_context' };
  }

  if (
    input.isReasoning ||
    input.hasRetrievedContext ||
    input.hasWebContext ||
    text.length > 280 ||
    historyLength > 6
  ) {
    return {
      task: 'analysis',
      reason: input.isReasoning
        ? 'reasoning_intent'
        : input.hasRetrievedContext || input.hasWebContext
          ? 'retrieved_evidence'
          : 'long_request',
    };
  }

  return { task: 'conversation', reason: 'default_conversation' };
}

export function resolvePierrotGenerationPolicy(input: {
  message: string;
  isReasoning?: boolean;
  hasRetrievedContext?: boolean;
  hasWebContext?: boolean;
  historyLength?: number;
}): PierrotGenerationPolicy {
  const classified = classifyPierrotTask(input);
  const budget = BUDGETS[classified.task];
  const requested = readInt(budget.env, budget.fallback, budget.min, budget.max);
  const maxOutputTokens = Math.min(requested, PIERROT_PROVIDER_OUTPUT_CAP);
  const timeout = TIMEOUTS[classified.task];

  return {
    task: classified.task,
    maxOutputTokens,
    providerTimeoutMs: timeout.provider,
    totalTimeoutMs: timeout.total,
    reason: classified.reason,
  };
}

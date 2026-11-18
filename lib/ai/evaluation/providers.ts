import OpenAI from 'openai';
import { generateGeminiText, isGeminiConfigured } from '../gemini';
import type { Evaluator } from './types';
import type { LlmProvider, LlmTokenUsage } from '../telemetry';

function usageSource(input: number | null, output: number | null): LlmTokenUsage['usageSource'] {
  if (input === null && output === null) return 'unknown';
  return input !== null && output !== null ? 'provider_reported' : 'partial';
}

function geminiUsage(value: unknown): LlmTokenUsage {
  if (!value || typeof value !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: 'unknown',
      providerReportedCostUsd: null,
    };
  }

  const usage = value as Record<string, unknown>;
  const read = (key: string): number | null =>
    typeof usage[key] === 'number' && Number.isFinite(usage[key]) ? (usage[key] as number) : null;
  const input = read('promptTokenCount');
  const output = read('candidatesTokenCount');

  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: read('totalTokenCount'),
    usageSource: usageSource(input, output),
    providerReportedCostUsd: null,
  };
}

export type GeminiEvaluatorOptions = {
  apiKey?: string;
  timeoutMs?: number;
};

export function createGeminiEvaluator(options: GeminiEvaluatorOptions = {}): Evaluator {
  if (options.apiKey === undefined && !isGeminiConfigured()) {
    throw new Error('gemini_not_configured');
  }

  // The shared Gemini helper pins the production model. Do not let an
  // evaluation label claim a different model than the one actually called.
  const model = 'gemini-3.5-flash';

  return {
    id: `gemini:${model}`,
    provider: 'gemini',
    model,
    async run(request) {
      const startedAt = Date.now();
      const result = await generateGeminiText({
        system: request.system,
        prompt: request.prompt,
        temperature: 0.2,
        maxOutputTokens: request.maxOutputTokens,
        timeoutMs: options.timeoutMs ?? 45_000,
      });

      return {
        provider: 'gemini',
        model: result.model || model,
        text: result.content,
        latencyMs: Date.now() - startedAt,
        usage: geminiUsage(result.usage),
      };
    },
  };
}

export type DeepSeekEvaluatorOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export function createDeepSeekEvaluator(options: DeepSeekEvaluatorOptions = {}): Evaluator {
  const apiKey = (options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('deepseek_not_configured');

  const model = options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const client = new OpenAI({
    apiKey,
    baseURL: (options.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
      .trim()
      .replace(/\/+$/, ''),
    timeout: options.timeoutMs ?? 45_000,
    maxRetries: 0,
  });

  return {
    id: `deepseek:${model}`,
    provider: 'deepseek',
    model,
    async run(request) {
      const startedAt = Date.now();
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        temperature: 0.2,
        max_tokens: request.maxOutputTokens,
      });
      const text = completion.choices[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('deepseek_empty_response');

      const input = completion.usage?.prompt_tokens ?? null;
      const output = completion.usage?.completion_tokens ?? null;
      const provider: LlmProvider = 'deepseek';

      return {
        provider,
        model,
        text,
        latencyMs: Date.now() - startedAt,
        usage: {
          inputTokens: input,
          outputTokens: output,
          totalTokens: completion.usage?.total_tokens ?? null,
          usageSource: usageSource(input, output),
          providerReportedCostUsd: null,
        },
      };
    },
  };
}

export function evaluationAvailability(): {
  gemini: boolean;
  deepseek: boolean;
  liveRunAllowed: boolean;
} {
  return {
    gemini: isGeminiConfigured(),
    deepseek: Boolean((process.env.DEEPSEEK_API_KEY || '').trim()),
    liveRunAllowed: (process.env.ALLOW_PAID_AI_EVALUATION || '').trim().toLowerCase() === 'true',
  };
}

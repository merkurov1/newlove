import OpenAI from 'openai';

import {
  FLOW_PROOFREAD_MAX_INPUT_CHARS,
  FLOW_PROOFREAD_TIMEOUT_MS,
  FlowProofreadError,
  buildFlowProofreadMessages,
  isFlowProofreadError,
  parseFlowProofreadResponse,
  validateFlowProofreadText,
} from './proofread';

export type FlowProofreadProviderResult = {
  text: string;
  model: string;
};

export type FlowProofreadProviderDeps = {
  /** Test-only transport override. Production always uses DeepSeek. */
  complete?: (request: {
    model: string;
    messages: ReturnType<typeof buildFlowProofreadMessages>;
    temperature: number;
    maxTokens: number;
  }) => Promise<string>;
};

function resolveModel(): string {
  return (process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim() || 'deepseek-chat';
}

function resolveBaseUrl(): string {
  return (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim().replace(/\/+$/u, '');
}

function outputTokenBudget(inputLength: number): number {
  return Math.min(8_192, Math.max(512, Math.ceil(inputLength / 2) + 512));
}

function mapProviderError(error: unknown): FlowProofreadError {
  if (isFlowProofreadError(error)) return error;

  const status = (error as { status?: unknown } | null)?.status;
  const name = error instanceof Error ? error.name.toLowerCase() : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (status === 429) {
    return new FlowProofreadError('provider_rate_limited');
  }

  if (status === 401 || status === 403) {
    return new FlowProofreadError('provider_unauthorized');
  }

  if (
    status === 408 ||
    status === 504 ||
    name.includes('timeout') ||
    name.includes('timedout') ||
    name.includes('aborterror') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout')
  ) {
    return new FlowProofreadError('provider_timeout');
  }

  return new FlowProofreadError('provider_error');
}

/**
 * Send only the current post body to DeepSeek and validate the result.
 *
 * The API key, base URL and model follow the existing server-side DeepSeek
 * conventions. No other provider is ever used as a fallback: the owner
 * explicitly requested DeepSeek for this operation.
 */
export async function proofreadFlowText(
  input: string,
  deps: FlowProofreadProviderDeps = {}
): Promise<FlowProofreadProviderResult> {
  if (typeof input !== 'string' || !input.trim()) {
    throw new FlowProofreadError('empty_input');
  }

  if (input.length > FLOW_PROOFREAD_MAX_INPUT_CHARS) {
    throw new FlowProofreadError('input_too_long');
  }

  const model = resolveModel();
  const messages = buildFlowProofreadMessages(input);
  const maxTokens = outputTokenBudget(input.length);

  let raw: string;

  try {
    if (deps.complete) {
      raw = await deps.complete({
        model,
        messages,
        temperature: 0,
        maxTokens,
      });
    } else {
      const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();

      if (!apiKey) {
        throw new FlowProofreadError('provider_not_configured');
      }

      const client = new OpenAI({
        apiKey,
        baseURL: resolveBaseUrl(),
        timeout: FLOW_PROOFREAD_TIMEOUT_MS,
        maxRetries: 0,
      });

      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });

      raw = completion.choices?.[0]?.message?.content ?? '';
    }
  } catch (error) {
    throw mapProviderError(error);
  }

  const parsed = parseFlowProofreadResponse(raw);

  if (parsed === null) {
    throw new FlowProofreadError(
      typeof raw === 'string' && raw.trim() ? 'invalid_output' : 'empty_output'
    );
  }

  const validation = validateFlowProofreadText(input, parsed);

  if (!validation.ok) {
    throw new FlowProofreadError(
      validation.reason === 'empty_output' ? 'empty_output' : 'invalid_output'
    );
  }

  return { text: validation.text, model };
}

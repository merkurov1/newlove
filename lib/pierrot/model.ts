import OpenAI from 'openai';
import { generateGeminiText, isGeminiConfigured, streamGeminiText } from '@/lib/ai/gemini';
import { globalLimits } from '@/lib/operations/config';
import {
  assertCircuitClosed,
  recordCircuitFailure,
  recordCircuitSuccess,
} from '@/lib/operations/circuitBreaker';

function streamAbortError(): Error {
  const error = new Error('The response stream was cancelled.');
  error.name = 'AbortError';
  return error;
}

export class PierrotStreamInterruptedError extends Error {
  readonly provider: 'gemini' | 'deepseek' | 'openrouter';

  constructor(provider: 'gemini' | 'deepseek' | 'openrouter') {
    super('The response stream was interrupted after output started.');
    this.name = 'PierrotStreamInterruptedError';
    this.provider = provider;
  }
}

// Helper to invoke DeepSeek
// Helper to invoke DeepSeek
async function callDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false
): Promise<string> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  await assertCircuitClosed('pierrot_llm');
  const limits = globalLimits();
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    timeout: limits.pierrotLlmTimeoutMs,
    maxRetries: 0,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: isReasoning ? undefined : 0.7,
      max_tokens: limits.pierrotLlmMaxTokens,
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('DeepSeek returned empty response.');
    }

    await recordCircuitSuccess('pierrot_llm');
    return reply.trim();
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'pierrot_llm',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'deepseek_request_failed',
      permanent,
    });

    throw error;
  }
}

async function streamDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<{ reply: string; provider: 'deepseek'; model: string }> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  await assertCircuitClosed('pierrot_llm');
  const limits = globalLimits();
  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
    timeout: limits.pierrotLlmTimeoutMs,
    maxRetries: 0,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';
  let content = '';

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: isReasoning ? undefined : 0.7,
        max_tokens: limits.pierrotLlmMaxTokens,
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (!text) continue;
      content += text;
      onDelta(text);
    }

    if (!content.trim()) {
      throw new Error('DeepSeek returned empty response.');
    }

    await recordCircuitSuccess('pierrot_llm');
    return { reply: content.trim(), provider: 'deepseek', model };
  } catch (error) {
    if (signal?.aborted) throw error;

    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'pierrot_llm',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'deepseek_request_failed',
      permanent,
    });

    throw error;
  }
}

async function callOpenRouterDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false
): Promise<string> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  await assertCircuitClosed('openrouter');
  const limits = globalLimits();
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: limits.pierrotLlmTimeoutMs,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Merkurov Pierrot',
    },
  });

  try {
    const completion = await client.chat.completions.create({
      model: isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: isReasoning ? undefined : 0.7,
      max_tokens: limits.pierrotLlmMaxTokens,
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('OpenRouter returned an empty response.');
    }

    await recordCircuitSuccess('openrouter');
    return reply.trim();
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'openrouter',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'openrouter_request_failed',
      permanent,
    });

    throw error;
  }
}

async function streamOpenRouterDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<{ reply: string; provider: 'openrouter'; model: string }> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  await assertCircuitClosed('openrouter');
  const limits = globalLimits();
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: limits.pierrotLlmTimeoutMs,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Merkurov Pierrot',
    },
  });

  const model = isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat';
  let content = '';

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: isReasoning ? undefined : 0.7,
        max_tokens: limits.pierrotLlmMaxTokens,
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (!text) continue;
      content += text;
      onDelta(text);
    }

    if (!content.trim()) {
      throw new Error('OpenRouter returned an empty response.');
    }

    await recordCircuitSuccess('openrouter');
    return { reply: content.trim(), provider: 'openrouter', model };
  } catch (error) {
    if (signal?.aborted) throw error;

    const status = (error as { status?: unknown } | null)?.status;
    const permanent = typeof status === 'number' && [400, 401, 402, 403, 404].includes(status);

    await recordCircuitFailure({
      dependency: 'openrouter',
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'openrouter_request_failed',
      permanent,
    });

    throw error;
  }
}

export type PierrotModelResult = {
  reply: string;
  provider: 'gemini' | 'deepseek' | 'openrouter';
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
};

/**
 * Gemini -> DeepSeek Direct -> OpenRouter DeepSeek.
 *
 * The same system prompt, conversation history, RAG context and output format
 * are passed to every provider. A provider failure never reaches the visitor
 * until every fallback has failed.
 */
export async function callPierrotModel(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false
): Promise<PierrotModelResult> {
  const startedAt = Date.now();
  let geminiFailed = false;

  if (isGeminiConfigured()) {
    try {
      const gemini = await generateGeminiText({
        system: systemPrompt,
        messages: messages.flatMap((message) => {
          if (message.role !== 'user' && message.role !== 'assistant') return [];

          const content =
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          return [
            {
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content,
            },
          ];
        }),
        temperature: 0.7,
        maxOutputTokens: globalLimits().pierrotLlmMaxTokens,
        timeoutMs: globalLimits().pierrotLlmTimeoutMs,
      });

      return {
        reply: gemini.content,
        provider: 'gemini',
        model: gemini.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
      };
    } catch (error) {
      geminiFailed = true;
      console.warn(
        '[Pierrot AI] Gemini unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  let deepseekError: unknown = null;

  try {
    const reply = await callDeepSeek(systemPrompt, messages, isReasoning);

    return {
      reply,
      provider: 'deepseek',
      model: isReasoning ? 'deepseek-reasoner' : 'deepseek-chat',
      latencyMs: Date.now() - startedAt,
      fallbackUsed: geminiFailed,
    };
  } catch (error) {
    deepseekError = error;
    console.warn(
      '[Pierrot AI] DeepSeek direct unavailable; trying OpenRouter:',
      error instanceof Error ? error.message : 'deepseek_request_failed'
    );
  }

  try {
    const reply = await callOpenRouterDeepSeek(systemPrompt, messages, isReasoning);

    return {
      reply,
      provider: 'openrouter',
      model: isReasoning ? 'deepseek/deepseek-r1-0528' : 'deepseek/deepseek-chat',
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
    };
  } catch {
    throw deepseekError instanceof Error
      ? deepseekError
      : new Error('All AI providers are unavailable.');
  }
}

/**
 * Streaming version of callPierrotModel with the same provider order.
 *
 * Fallback is allowed only before the first emitted token. Once a provider has
 * emitted text, a failure becomes PierrotStreamInterruptedError and is never
 * followed by a second provider's answer.
 */
export async function streamPierrotModel(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<PierrotModelResult> {
  const startedAt = Date.now();
  let emitted = false;
  const emit = (text: string) => {
    if (!text) return;
    emitted = true;
    onDelta(text);
  };

  let geminiFailed = false;

  if (signal?.aborted) throw streamAbortError();

  if (isGeminiConfigured()) {
    try {
      const gemini = await streamGeminiText({
        system: systemPrompt,
        messages: messages.flatMap((message) => {
          if (message.role !== 'user' && message.role !== 'assistant') return [];

          const content =
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

          return [
            {
              role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content,
            },
          ];
        }),
        temperature: 0.7,
        maxOutputTokens: globalLimits().pierrotLlmMaxTokens,
        timeoutMs: globalLimits().pierrotLlmTimeoutMs,
        signal,
        onDelta: emit,
      });

      return {
        reply: gemini.content,
        provider: 'gemini',
        model: gemini.model,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: false,
      };
    } catch (error) {
      if (emitted) throw new PierrotStreamInterruptedError('gemini');
      if (signal?.aborted) throw streamAbortError();

      geminiFailed = true;
      console.warn(
        '[Pierrot AI] Gemini streaming unavailable; trying DeepSeek:',
        error instanceof Error ? error.message : 'gemini_request_failed'
      );
    }
  }

  let deepseekError: unknown = null;

  try {
    const deepseek = await streamDeepSeek(systemPrompt, messages, isReasoning, emit, signal);

    return {
      reply: deepseek.reply,
      provider: 'deepseek',
      model: deepseek.model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: geminiFailed,
    };
  } catch (error) {
    if (emitted) throw new PierrotStreamInterruptedError('deepseek');
    if (signal?.aborted) throw streamAbortError();

    deepseekError = error;
    console.warn(
      '[Pierrot AI] DeepSeek streaming unavailable; trying OpenRouter:',
      error instanceof Error ? error.message : 'deepseek_request_failed'
    );
  }

  if (signal?.aborted) throw streamAbortError();

  try {
    const openrouter = await streamOpenRouterDeepSeek(
      systemPrompt,
      messages,
      isReasoning,
      emit,
      signal
    );

    return {
      reply: openrouter.reply,
      provider: 'openrouter',
      model: openrouter.model,
      latencyMs: Date.now() - startedAt,
      fallbackUsed: true,
    };
  } catch {
    if (emitted) throw new PierrotStreamInterruptedError('openrouter');

    throw deepseekError instanceof Error
      ? deepseekError
      : new Error('All AI providers are unavailable.');
  }
}

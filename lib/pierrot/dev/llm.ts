import { assertServerOnly } from '@/lib/serverOnly';
import OpenAI from 'openai';
import { getDevRepositoryConfigs } from './repositories';
import { PIERROT_DEV_SYSTEM_PROMPT } from './prompt';
import { extractDevDiagnosis } from './diagnosis';
import { DEV_TOOL_NAMES, devToolDefinitions, executeDevTool, isDevWriteTool } from './tools';
import type { DevModelResult, DevTokenUsage, DevToolEvent, DevToolTraceEntry } from './types';

assertServerOnly('lib/pierrot/dev/llm');

const DEFAULT_MAX_TOOL_CALLS = 10;
const MAX_TOOL_RESULT_CHARS = 18_000;
const MAX_TOTAL_TOOL_RESULT_CHARS = 64_000;
const DEFAULT_REQUEST_DEADLINE_MS = 90_000;
const DEFAULT_TOOL_TIMEOUT_MS = 20_000;
const MAX_REQUEST_DEADLINE_MS = 110_000;
const MAX_TOOL_TIMEOUT_MS = 30_000;
const FALLBACK_RESERVE_MIN_MS = 15_000;
const FALLBACK_RESERVE_RATIO = 0.25;
const MIN_FALLBACK_WINDOW_MS = 8_000;

type ProviderConfig = {
  provider: 'deepseek' | 'openrouter';
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type SideEffect = {
  tool: string;
  repository: string | null;
  summary: string;
};

export type DevAttempt = {
  provider: string;
  model: string;
  errorCode: string | null;
  errorMessage: string | null;
  toolTrace: DevToolTraceEntry[];
  usage: DevTokenUsage;
};

export class DevAbortError extends Error {
  readonly code = 'DEV_REQUEST_ABORTED';
  constructor(message = 'Dev request was aborted.') {
    super(message);
    this.name = 'DevAbortError';
  }
}

export class DevDeadlineError extends Error {
  readonly code = 'DEV_REQUEST_DEADLINE_EXCEEDED';
  constructor() {
    super('Dev request exceeded its global deadline.');
    this.name = 'DevDeadlineError';
  }
}

class DevToolLimitError extends Error {
  readonly code = 'DEV_TOOL_LIMIT_EXCEEDED';
  readonly toolTrace: DevToolTraceEntry[];
  readonly events: DevToolEvent[];
  readonly usage: DevTokenUsage;

  constructor(toolTrace: DevToolTraceEntry[], events: DevToolEvent[], usage: DevTokenUsage) {
    super('Dev model exceeded the tool-call limit.');
    this.name = 'DevToolLimitError';
    this.toolTrace = toolTrace;
    this.events = events;
    this.usage = usage;
  }
}

class DevToolTimeoutError extends Error {
  readonly code = 'DEV_TOOL_TIMEOUT';
  constructor(tool: string) {
    super(`GitHub tool "${tool}" timed out.`);
    this.name = 'DevToolTimeoutError';
  }
}

export class DevPartialCompletionError extends Error {
  readonly code = 'DEV_PARTIALLY_COMPLETED';
  readonly result: DevModelResult;
  constructor(result: DevModelResult) {
    super('The request was partially completed and must not be replayed automatically.');
    this.name = 'DevPartialCompletionError';
    this.result = result;
  }
}

export class DevProviderError extends Error {
  readonly code = 'DEV_PROVIDER_FAILED';
  readonly attempts: DevAttempt[];
  readonly toolTrace: DevToolTraceEntry[];
  readonly events: DevToolEvent[];
  constructor(
    message: string,
    attempts: DevAttempt[],
    toolTrace: DevToolTraceEntry[],
    events: DevToolEvent[]
  ) {
    super(message);
    this.name = 'DevProviderError';
    this.attempts = attempts;
    this.toolTrace = toolTrace;
    this.events = events;
  }
}

function providerConfigs(): ProviderConfig[] {
  const result: ProviderConfig[] = [];
  const deepseek = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openrouter = (process.env.OPENROUTER_API_KEY || '').trim();

  if (deepseek) {
    result.push({
      provider: 'deepseek',
      baseURL: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim(),
      apiKey: deepseek,
      model: (process.env.PIERROT_DEV_MODEL || 'deepseek-chat').trim(),
    });
  }

  if (openrouter) {
    result.push({
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouter,
      model: (process.env.PIERROT_DEV_OPENROUTER_MODEL || 'deepseek/deepseek-chat').trim(),
      headers: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Merkurov Pierrot Dev',
      },
    });
  }

  return result;
}

export function isDevModelConfigured(): boolean {
  return providerConfigs().length > 0;
}

export function getDevProviderNames(): string[] {
  return providerConfigs().map((config) => config.provider);
}

function envNumber(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export function getDevExecutionLimits() {
  return {
    maxToolCalls: envNumber('PIERROT_DEV_MAX_TOOL_CALLS', DEFAULT_MAX_TOOL_CALLS, 32),
    requestDeadlineMs: envNumber(
      'PIERROT_DEV_REQUEST_DEADLINE_MS',
      DEFAULT_REQUEST_DEADLINE_MS,
      MAX_REQUEST_DEADLINE_MS
    ),
    toolTimeoutMs: envNumber(
      'PIERROT_DEV_TOOL_TIMEOUT_MS',
      DEFAULT_TOOL_TIMEOUT_MS,
      MAX_TOOL_TIMEOUT_MS
    ),
  };
}

/**
 * Time reserved for a fallback provider before the first provider starts. It is
 * never allowed to consume the whole request window.
 */
export function fallbackReserveMs(deadlineMs: number, providerCount: number): number {
  if (providerCount < 2) return 0;
  const raw = Math.max(FALLBACK_RESERVE_MIN_MS, deadlineMs * FALLBACK_RESERVE_RATIO);
  const cap = Math.max(0, deadlineMs - MIN_FALLBACK_WINDOW_MS);
  return Math.floor(Math.min(raw, cap));
}

function isAbortLike(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return error instanceof Error && /aborted|abort/i.test(error.message);
  }

  const record = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';

  return (
    name === 'AbortError' ||
    name === 'APIUserAbortError' ||
    code === 'ABORT_ERR' ||
    /request was aborted|aborted|abort/i.test(message)
  );
}

/**
 * OpenAI SDK abort variants are untyped. Turn them into explicit Dev errors so
 * the fallback loop never mistakes a user abort or deadline for a provider
 * outage.
 */
export function normalizeProviderError(
  error: unknown,
  options: { deadlineAt: number; signal?: AbortSignal }
): Error {
  if (
    error instanceof DevAbortError ||
    error instanceof DevDeadlineError ||
    error instanceof DevToolLimitError ||
    error instanceof DevToolTimeoutError ||
    error instanceof DevPartialCompletionError
  ) {
    return error;
  }

  if (options.signal?.aborted) return new DevAbortError();
  if (Date.now() >= options.deadlineAt) return new DevDeadlineError();
  if (isAbortLike(error)) return new DevAbortError();

  return error instanceof Error ? error : new Error('Dev provider request failed.');
}

function toolCallKey(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = args[key];
      return result;
    }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

function partialReplyFromTrace(trace: DevToolTraceEntry[], reason: string): string {
  const files = Array.from(new Set(trace.flatMap((entry) => entry.meta?.paths || []))).slice(0, 8);
  const recentSteps = trace
    .slice(-6)
    .map((entry) => `- ${entry.name}: ${entry.summary}`)
    .join('\n');

  return [
    'Исследование прервано до формирования вывода.',
    `Причина: ${reason}.`,
    `Успешно выполнено tool calls: ${trace.length}.`,
    files.length > 0 ? `Прочитанные файлы: ${files.join(', ')}.` : null,
    recentSteps ? `Последние шаги:\n${recentSteps}` : null,
    'Собранные свидетельства сохранены в trace. Продолжи запрос с того же места или задай более узкий вопрос.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function compactHistory(history: ChatMessage[]): ChatMessage[] {
  const maxChars = 60_000;
  let used = 0;
  const result: ChatMessage[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    const content =
      message.content.length > remaining
        ? message.content.slice(message.content.length - remaining)
        : message.content;
    result.unshift({ role: message.role, content });
    used += content.length;
  }

  return result;
}

function parseArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function contextMessage(activeRepository?: string): string {
  const repos = getDevRepositoryConfigs();

  return [
    'DEV MODE REPOSITORIES',
    ...repos.map(
      (repo) =>
        `- ${repo.key}: ${repo.fullName} (default: ${repo.defaultBranch}, work: ${repo.workBranch}) — ${repo.description}`
    ),
    activeRepository ? `Active repository selected by the owner: ${activeRepository}.` : '',
    '',
    'Every repository tool requires an explicit repository parameter. Never present one repository as the other.',
    'GitHub access is READ ONLY. No write tool exists. Do not claim that a file, commit or PR was created.',
    'Always report the repository, branch and commit SHA returned by tools.',
    'If a tool returns complete=false or a warning, state what is missing instead of guessing.',
    'A commit or PR is not proof that a task is complete. Tests that were not run must be described as not run.',
  ]
    .filter(Boolean)
    .join('\n');
}

function usageFrom(completion: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}): DevTokenUsage {
  return {
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null,
    totalTokens: completion.usage?.total_tokens ?? null,
  };
}

function phaseForTool(name: string): DevToolEvent['phase'] {
  if (name === 'search_repo') return 'searching';
  if (name === 'read_file' || name === 'read_file_range') return 'reading';
  if (
    name === 'compare_refs' ||
    name === 'get_commit' ||
    name === 'get_pull_request' ||
    name === 'get_check_runs' ||
    name === 'get_workflow_runs'
  ) {
    return 'analyzing';
  }
  return 'researching';
}

function toolLabel(name: string): string {
  switch (name) {
    case 'search_repo':
      return 'Ищу по репозиторию';
    case 'read_file':
    case 'read_file_range':
      return 'Читаю файлы';
    case 'get_repo_tree':
      return 'Изучаю структуру репозитория';
    case 'compare_refs':
      return 'Сравниваю изменения';
    case 'get_check_runs':
    case 'get_workflow_runs':
      return 'Проверяю CI';
    case 'get_commit':
      return 'Читаю commit';
    case 'list_commits':
      return 'Смотрю историю';
    default:
      return 'Исследую репозиторий';
  }
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeout]);
  }
  return signal;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  toolName: string
): Promise<T> {
  if (signal?.aborted) throw new DevAbortError();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DevToolTimeoutError(toolName)), timeoutMs);
    if (signal) {
      abortListener = () => reject(new DevAbortError());
      signal.addEventListener('abort', abortListener, { once: true });
    }
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

function assertWithinDeadline(deadlineAt: number): void {
  if (Date.now() >= deadlineAt) throw new DevDeadlineError();
}

type ExecutionState = {
  sideEffects: SideEffect[];
  lastTrace: DevToolTraceEntry[];
  lastEvents: DevToolEvent[];
  lastUsage: DevTokenUsage;
};

async function runProvider(input: {
  config: ProviderConfig;
  history: ChatMessage[];
  signal?: AbortSignal;
  deadlineAt: number;
  requestId: string;
  repository?: string;
  state: ExecutionState;
  onEvent?: (event: DevToolEvent) => void;
}): Promise<{
  result: Omit<DevModelResult, 'latencyMs' | 'requestId'>;
}> {
  const limits = getDevExecutionLimits();
  const trace: DevToolTraceEntry[] = [];
  const events: DevToolEvent[] = [];
  const sideEffects = input.state.sideEffects;
  const executedCalls = new Map<string, string>();
  let usedToolResultChars = 0;
  const usage: DevTokenUsage = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  };
  const syncState = () => {
    input.state.lastTrace = trace;
    input.state.lastEvents = events;
    input.state.lastUsage = usage;
  };

  const emit = (event: DevToolEvent) => {
    events.push(event);
    input.onEvent?.(event);
  };

  const client = new OpenAI({
    baseURL: input.config.baseURL,
    apiKey: input.config.apiKey,
    timeout: Math.max(1_000, input.deadlineAt - Date.now()),
    maxRetries: 0,
    ...(input.config.headers ? { defaultHeaders: input.config.headers } : {}),
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: PIERROT_DEV_SYSTEM_PROMPT },
    { role: 'system', content: contextMessage(input.repository) },
    ...compactHistory(input.history).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const availableTools = devToolDefinitions();
  emit({
    type: 'status',
    phase: 'connecting',
    label: `Подключаюсь к репозиторию · ${input.config.provider}`,
  });
  emit({
    type: 'status',
    phase: 'analyzing',
    label: `Анализирую задачу · ${input.config.provider}`,
  });

  for (let iteration = 0; iteration <= limits.maxToolCalls; iteration += 1) {
    assertWithinDeadline(input.deadlineAt);

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model: input.config.model,
          messages,
          temperature: 0.2,
          max_tokens: Number(process.env.PIERROT_DEV_MAX_TOKENS || 6000),
          ...(availableTools.length > 0
            ? { tools: availableTools, tool_choice: 'auto' as const }
            : {}),
        },
        {
          signal: combineSignals(input.signal, Math.max(1_000, input.deadlineAt - Date.now())),
        }
      );
    } catch (error) {
      throw normalizeProviderError(error, {
        deadlineAt: input.deadlineAt,
        signal: input.signal,
      });
    }
    assertWithinDeadline(input.deadlineAt);

    const nextUsage = usageFrom(completion);
    usage.promptTokens = nextUsage.promptTokens;
    usage.completionTokens = nextUsage.completionTokens;
    usage.totalTokens = nextUsage.totalTokens;
    syncState();

    const choice = completion.choices[0]?.message;
    if (!choice) throw new Error('Dev model returned no message.');

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      const rawReply = (choice.content || '').trim();
      if (!rawReply) throw new Error('Dev model returned an empty answer.');

      emit({ type: 'status', phase: 'preparing', label: 'Готовлю вывод' });
      const parsed = extractDevDiagnosis(rawReply, trace);
      const reply =
        parsed.reply ||
        (parsed.diagnosis
          ? 'Диагностика подготовлена. Структурированный результат доступен в Task Studio.'
          : '');

      if (!reply) throw new Error('Dev model returned an empty answer.');

      emit({ type: 'status', phase: 'completed', label: 'Ответ готов' });
      return {
        result: {
          reply,
          provider: input.config.provider,
          model: input.config.model,
          toolTrace: trace,
          events,
          usage,
          status: sideEffects.length > 0 ? 'partially_completed' : 'completed',
          sideEffects,
          diagnosis: parsed.diagnosis,
        },
      };
    }

    messages.push({
      role: 'assistant',
      content: choice.content || null,
      tool_calls: choice.tool_calls,
    });

    for (const call of choice.tool_calls) {
      assertWithinDeadline(input.deadlineAt);

      if (trace.length >= limits.maxToolCalls) {
        throw new DevToolLimitError(trace, events, usage);
      }

      const functionCall = 'function' in call ? call.function : null;
      const name = functionCall?.name || 'unknown_tool';
      const args = parseArguments(functionCall?.arguments);
      const known = DEV_TOOL_NAMES.includes(name as (typeof DEV_TOOL_NAMES)[number]);

      emit({
        type: 'status',
        phase: known ? phaseForTool(name) : 'analyzing',
        label: known ? toolLabel(name) : 'Проверяю запрос',
        tool: name,
      });

      if (known && !isDevWriteTool(name)) {
        const callKey = toolCallKey(name, args);
        if (executedCalls.has(callKey)) {
          const payload = {
            error: 'Duplicate tool call with identical arguments. Use the previous tool result.',
            code: 'DEV_DUPLICATE_TOOL_CALL',
            complete: false,
            source: 'github',
          };
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(payload),
          });
          syncState();
          emit({
            type: 'tool',
            tool: name,
            ok: false,
            summary: 'duplicate call skipped',
            code: payload.code,
          });
          continue;
        }
      }

      if (!known || isDevWriteTool(name)) {
        const payload = {
          error: known
            ? 'Write tools are not available in read-only Dev Mode.'
            : `Unknown Dev tool: ${name}.`,
          code: known ? 'GITHUB_WRITES_DISABLED' : 'UNKNOWN_TOOL',
          complete: false,
          source: 'github',
        };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(payload),
        });
        trace.push({
          name,
          repository: typeof args.repository === 'string' ? args.repository : null,
          ok: false,
          durationMs: 0,
          summary: payload.error,
          meta: null,
          errorCode: payload.code,
        });
        syncState();
        emit({
          type: 'tool',
          tool: name,
          ok: false,
          summary: payload.error,
        });
        continue;
      }

      const execution = await withTimeout(
        executeDevTool(name, args),
        limits.toolTimeoutMs,
        input.signal,
        name
      );

      const serialized = JSON.stringify(execution.result);
      const remainingBudget = Math.max(0, MAX_TOTAL_TOOL_RESULT_CHARS - usedToolResultChars);
      let content: string;

      if (remainingBudget === 0) {
        content = JSON.stringify({
          error: 'Tool-result budget for this request is exhausted. Narrow the next request.',
          code: 'DEV_TOOL_RESULT_BUDGET_EXHAUSTED',
          complete: false,
          source: 'github',
        });
      } else {
        const cap = Math.min(MAX_TOOL_RESULT_CHARS, remainingBudget);
        content =
          serialized.length > cap ? `${serialized.slice(0, cap)}\n…[truncated]` : serialized;
        usedToolResultChars += content.length;
      }

      executedCalls.set(toolCallKey(name, args), content);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content,
      });
      trace.push(execution.trace);
      syncState();
      emit({
        type: 'tool',
        tool: name,
        repository: execution.trace.repository,
        ok: execution.trace.ok,
        summary: execution.trace.summary,
      });

      const record = execution.result as Record<string, unknown>;
      if (record.sideEffect === true || isDevWriteTool(name)) {
        sideEffects.push({
          tool: name,
          repository: typeof record.repository === 'string' ? record.repository : null,
          summary: execution.trace.summary,
        });
      }
    }
  }

  throw new DevToolLimitError(trace, events, usage);
}

export async function callDevModel(input: {
  history: ChatMessage[];
  requestId: string;
  signal?: AbortSignal;
  onEvent?: (event: DevToolEvent) => void;
  deadlineMs?: number;
  repository?: string;
}): Promise<DevModelResult> {
  const providers = providerConfigs();
  if (providers.length === 0) {
    throw new Error('No dev model provider is configured.');
  }

  const limits = getDevExecutionLimits();
  const startedAt = Date.now();
  const requestWindowMs = Math.min(
    typeof input.deadlineMs === 'number' && input.deadlineMs > 0
      ? input.deadlineMs
      : limits.requestDeadlineMs,
    MAX_REQUEST_DEADLINE_MS
  );
  const deadlineAt = startedAt + requestWindowMs;
  const reserve = fallbackReserveMs(requestWindowMs, providers.length);

  const attempts: DevAttempt[] = [];
  const allTrace: DevToolTraceEntry[] = [];
  const allEvents: DevToolEvent[] = [];
  const state: ExecutionState = {
    sideEffects: [],
    lastTrace: [],
    lastEvents: [],
    lastUsage: { promptTokens: null, completionTokens: null, totalTokens: null },
  };
  let lastError: unknown = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];

    if (input.signal?.aborted) throw new DevAbortError();
    if (Date.now() >= deadlineAt) {
      if (attempts.length === 0) throw new DevDeadlineError();
      break;
    }

    // Reserve a real fallback window before the first provider starts, instead
    // of discovering after 85 seconds that no fallback time remains.
    const attemptDeadlineAt =
      index === 0 && providers.length > 1 ? deadlineAt - reserve : deadlineAt;

    if (attemptDeadlineAt - Date.now() < 1_000) {
      if (attempts.length === 0) throw new DevDeadlineError();
      break;
    }

    try {
      const run = await runProvider({
        config: provider,
        history: input.history,
        signal: input.signal,
        deadlineAt: attemptDeadlineAt,
        requestId: input.requestId,
        repository: input.repository,
        state,
        onEvent: (event) => {
          input.onEvent?.(event);
        },
      });

      return {
        ...run.result,
        requestId: input.requestId,
        latencyMs: Date.now() - startedAt,
        // Keep traces from earlier provider attempts so a fallback is visible
        // in history instead of silently disappearing.
        toolTrace: [...allTrace, ...run.result.toolTrace],
        events: [...allEvents, ...run.result.events],
        sideEffects: run.result.sideEffects,
        diagnosis: run.result.diagnosis,
      };
    } catch (error) {
      const normalized = normalizeProviderError(error, {
        deadlineAt: attemptDeadlineAt,
        signal: input.signal,
      });
      const code =
        normalized && typeof normalized === 'object' && 'code' in normalized
          ? String((normalized as { code?: unknown }).code || 'DEV_PROVIDER_FAILED')
          : 'DEV_PROVIDER_FAILED';
      const message =
        normalized instanceof Error ? normalized.message : 'Dev provider request failed.';

      const attemptTrace =
        normalized && typeof normalized === 'object' && 'toolTrace' in normalized
          ? (normalized as { toolTrace?: DevToolTraceEntry[] }).toolTrace || []
          : state.lastTrace;
      const attemptEvents =
        normalized && typeof normalized === 'object' && 'events' in normalized
          ? (normalized as { events?: DevToolEvent[] }).events || []
          : state.lastEvents;
      const attemptUsage =
        normalized && typeof normalized === 'object' && 'usage' in normalized
          ? (normalized as { usage?: DevTokenUsage }).usage || state.lastUsage
          : state.lastUsage;

      allTrace.push(...attemptTrace);
      allEvents.push(...attemptEvents);
      attempts.push({
        provider: provider.provider,
        model: provider.model,
        errorCode: code,
        errorMessage: message,
        toolTrace: attemptTrace,
        usage: attemptUsage,
      });
      lastError = normalized;

      // A side effect must never be replayed by another provider.
      if (state.sideEffects.length > 0) {
        throw new DevPartialCompletionError({
          reply:
            'Запрос частично выполнен. Повторный запуск через другого провайдера остановлен, чтобы не повторить побочный эффект.',
          provider: provider.provider,
          model: provider.model,
          toolTrace: allTrace,
          events: allEvents,
          usage: attemptUsage,
          requestId: input.requestId,
          status: 'partially_completed',
          latencyMs: Date.now() - startedAt,
          sideEffects: state.sideEffects,
          diagnosis: null,
        });
      }

      // Never replay a long investigation from scratch. Once repository
      // evidence exists, preserve the trace and return a labelled partial
      // result instead of spending the remaining deadline on a second run.
      if (allTrace.length > 0) {
        throw new DevPartialCompletionError({
          reply: partialReplyFromTrace(allTrace, message),
          provider: provider.provider,
          model: provider.model,
          toolTrace: allTrace,
          events: allEvents,
          usage: attemptUsage,
          requestId: input.requestId,
          status: 'partially_completed',
          latencyMs: Date.now() - startedAt,
          sideEffects: state.sideEffects,
          diagnosis: null,
        });
      }

      if (normalized instanceof DevAbortError) throw normalized;

      // The first provider may use only its reserved window. Reaching that
      // window is not the same as exhausting the global deadline; if fallback
      // time remains, the next provider must still get a chance.
      if (
        normalized instanceof DevDeadlineError &&
        (attemptDeadlineAt >= deadlineAt || Date.now() >= deadlineAt)
      ) {
        break;
      }

      if (index === providers.length - 1) break;
      if (deadlineAt - Date.now() < MIN_FALLBACK_WINDOW_MS) break;

      // No evidence yet: a provider fallback is safe. Emit an honest event.
      const fallbackEvent: DevToolEvent = {
        type: 'status',
        phase: 'analyzing',
        label: `Провайдер ${provider.provider} недоступен, переключаюсь`,
      };
      allEvents.push(fallbackEvent);
      input.onEvent?.(fallbackEvent);
    }
  }

  if (lastError instanceof DevAbortError) throw lastError;
  if (lastError instanceof DevDeadlineError) throw lastError;

  const detail =
    attempts.length > 1
      ? attempts.map((attempt) => `${attempt.provider}: ${attempt.errorMessage}`).join('; ')
      : lastError instanceof Error
        ? lastError.message
        : 'All dev model providers are unavailable.';

  throw new DevProviderError(detail, attempts, allTrace, allEvents);
}

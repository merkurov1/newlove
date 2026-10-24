import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DeepSeekChunk,
  DeepSeekProgress,
  DeepSeekProgressEntry,
  DeepSeekStage,
  NormalizedMessage,
} from './types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from './types';
import type { EventsResult, SynthesisResult, TopicsResult } from './deepseek-schema';
import {
  eventsResultSchema,
  invalidSourceIds,
  synthesisSchema,
  topicsResultSchema,
  validateResult,
} from './deepseek-schema';
import {
  ensureDir,
  errorMessage,
  readJson,
  readJsonOrThrow,
  sleep,
  writeJsonAtomic,
  writeTextAtomic,
} from './util';

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  budgetUsd: number;
  maxRequests: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  thinking: 'enabled' | 'disabled';
}

export function deepSeekConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  return {
    apiKey: env.DEEPSEEK_API_KEY ?? '',
    baseUrl: (env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, ''),
    model: env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
    maxOutputTokens: positiveInt(env.DEEPSEEK_MAX_OUTPUT_TOKENS, 6000),
    temperature: Number(env.DEEPSEEK_TEMPERATURE ?? '0.1'),
    timeoutMs: positiveInt(env.DEEPSEEK_TIMEOUT_MS, 180_000),
    maxRetries: positiveInt(env.DEEPSEEK_MAX_RETRIES, 4),
    // Conservative peak Flash prices in USD per 1M tokens, from the official
    // pricing page checked on 2026-10-24. Override for off-peak or another model.
    budgetUsd: Number(env.DEEPSEEK_BUDGET_USD ?? '1'),
    maxRequests: positiveInt(env.DEEPSEEK_MAX_REQUESTS, 100),
    inputPricePerMillion: Number(env.DEEPSEEK_INPUT_USD_PER_MILLION ?? '0.3'),
    outputPricePerMillion: Number(env.DEEPSEEK_OUTPUT_USD_PER_MILLION ?? '1.2'),
    thinking: env.DEEPSEEK_THINKING === 'enabled' ? 'enabled' : 'disabled',
  };
}

export interface DeepSeekUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DeepSeekChatResult {
  data: unknown;
  rawContent: string;
  usage: DeepSeekUsage;
  model: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class DeepSeekError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly code: string;

  constructor(
    message: string,
    options: { status?: number | null; retryable?: boolean; code?: string } = {}
  ) {
    super(message);
    this.name = 'DeepSeekError';
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.code = options.code ?? 'DEEPSEEK_ERROR';
  }
}

/**
 * Minimal official-API client. It uses the OpenAI-compatible
 * `/chat/completions` endpoint documented at api-docs.deepseek.com and never
 * puts the API key in prompts, results, logs or thrown errors.
 */
export class DeepSeekClient {
  private readonly config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
  }

  get model(): string {
    return this.config.model;
  }

  hasKey(): boolean {
    return this.config.apiKey.trim().length > 0;
  }

  assertKey(): void {
    if (!this.hasKey()) {
      throw new DeepSeekError(
        'DEEPSEEK_API_KEY не задан. Экспортируйте ключ в окружение, не записывая его в репозиторий.',
        { code: 'MISSING_API_KEY' }
      );
    }
  }

  async probe(): Promise<{ models: string[]; modelAvailable: boolean }> {
    this.assertKey();
    const candidates = [`${this.config.baseUrl}/models`, `${this.config.baseUrl}/v1/models`];
    let lastError: unknown = null;

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          lastError = new DeepSeekError(`GET /models вернул HTTP ${response.status}`, {
            status: response.status,
            retryable: response.status >= 500,
          });
          continue;
        }
        const payload = (await response.json()) as { data?: Array<{ id?: string }> };
        const models = (payload.data ?? [])
          .map((item) => item.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return { models, modelAvailable: models.includes(this.config.model) };
      } catch (error) {
        lastError = error;
      }
    }

    throw new DeepSeekError(`Не удалось проверить DeepSeek API: ${errorMessage(lastError)}`, {
      code: 'PROBE_FAILED',
    });
  }

  async chatJson(system: string, user: string): Promise<DeepSeekChatResult> {
    this.assertKey();

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt += 1) {
      try {
        return await this.requestOnce(system, user);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof DeepSeekError ? error.retryable : true;
        if (!retryable || attempt > this.config.maxRetries) break;
        const waitMs = Math.min(60_000, 2 ** (attempt - 1) * 1500);
        await sleep(waitMs);
      }
    }

    if (lastError instanceof DeepSeekError) throw lastError;
    throw new DeepSeekError(`DeepSeek API: ${errorMessage(lastError)}`, {
      code: 'REQUEST_FAILED',
      retryable: true,
    });
  }

  private async requestOnce(system: string, user: string): Promise<DeepSeekChatResult> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: this.config.maxOutputTokens,
      temperature: this.config.temperature,
      stream: false,
      thinking: { type: this.config.thinking },
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new DeepSeekError(`Сетевая ошибка DeepSeek: ${errorMessage(error)}`, {
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status >= 500;
      throw new DeepSeekError(
        `DeepSeek API вернул HTTP ${response.status}: ${redact(bodyText).slice(0, 500)}`,
        { status: response.status, retryable, code: retryable ? 'TRANSIENT' : 'API_ERROR' }
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      // The JSON-mode guide warns that content can occasionally be empty.
      throw new DeepSeekError('DeepSeek вернул пустой content (JSON mode); повторяю запрос.', {
        code: 'EMPTY_CONTENT',
        retryable: true,
      });
    }

    const parsed = parseJsonObject(content);
    if (!parsed.ok) {
      throw new DeepSeekError(`DeepSeek вернул невалидный JSON: ${parsed.error}`, {
        code: 'INVALID_JSON',
        retryable: true,
      });
    }

    const inputTokens =
      payload.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 3);
    const outputTokens = payload.usage?.completion_tokens ?? Math.ceil(content.length / 3);
    return {
      data: parsed.value,
      rawContent: content,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: estimateCost(inputTokens, outputTokens, this.config),
      },
      model: payload.model ?? this.config.model,
    };
  }
}

export interface ChunkOptions {
  maxCharacters: number;
  overlapMessages: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxCharacters: 60_000,
  overlapMessages: 20,
};

/**
 * Sequential time chunks. Each message is a target exactly once; overlap
 * messages are context only and never counted twice as analysis targets.
 */
export function buildChunks(
  messages: NormalizedMessage[],
  options: Partial<ChunkOptions> = {}
): DeepSeekChunk[] {
  const config = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const maxCharacters = Math.max(1000, config.maxCharacters);
  const overlap = Math.max(0, Math.min(200, config.overlapMessages));
  const sorted = [...messages].sort((a, b) => a.dateMs - b.dateMs || a.id - b.id);

  const chunks: DeepSeekChunk[] = [];
  let targets: NormalizedMessage[] = [];
  let targetCharacters = 0;
  let previousTargets: NormalizedMessage[] = [];

  const flush = () => {
    if (targets.length === 0) return;
    const context = overlap > 0 ? previousTargets.slice(-overlap) : [];
    const contextIds = context.map((message) => message.id);
    const targetIds = targets.map((message) => message.id);
    const lines = [
      ...context.map((message) => formatMessageLine('context', message)),
      ...targets.map((message) => formatMessageLine('target', message)),
    ];
    chunks.push({
      index: chunks.length,
      id: `chunk-${String(chunks.length + 1).padStart(4, '0')}`,
      fromMessageId: targetIds[0] ?? 0,
      toMessageId: targetIds[targetIds.length - 1] ?? 0,
      dateFrom: targets[0]?.date ?? '',
      dateTo: targets[targets.length - 1]?.date ?? '',
      targetMessageIds: targetIds,
      contextMessageIds: contextIds,
      text: lines.join('\n'),
      approximateCharacters: lines.reduce((sum, line) => sum + line.length + 1, 0),
    });
    previousTargets = targets;
    targets = [];
    targetCharacters = 0;
  };

  for (const message of sorted) {
    const line = formatMessageLine('target', message);
    if (targets.length > 0 && targetCharacters + line.length > maxCharacters) flush();
    targets.push(message);
    targetCharacters += line.length + 1;
  }
  flush();

  return chunks;
}

export interface PlanOptions extends ChunkOptions {
  budgetUsd: number;
  maxRequests: number;
  model: string;
}

export async function createPlan(
  messages: NormalizedMessage[],
  directory: string,
  options: Partial<PlanOptions> = {},
  reset = false
): Promise<{ chunks: DeepSeekChunk[]; progress: DeepSeekProgress }> {
  const chunks = buildChunks(messages, options);
  const progressPath = path.join(directory, 'progress.json');
  const chunksPath = path.join(directory, 'chunks.json');
  await ensureDir(directory);

  const existing = await readJson<DeepSeekProgress>(progressPath);
  if (existing && !reset) {
    const existingChunks = await readJsonOrThrow<DeepSeekChunk[]>(chunksPath);
    if (JSON.stringify(existingChunks) !== JSON.stringify(chunks)) {
      throw new Error(
        'План фрагментов изменился. Удалите analysis/deepseek или запустите plan --reset, чтобы не смешивать старые результаты.'
      );
    }
    return { chunks: existingChunks, progress: existing };
  }

  const createdAt = new Date().toISOString();
  const entries: DeepSeekProgressEntry[] = [];
  for (const chunk of chunks) {
    entries.push(makeEntry('events', chunk.index, 'pending'));
    entries.push(makeEntry('topics', chunk.index, 'pending'));
  }
  entries.push(makeEntry('synthesis', null, 'pending'));

  const progress: DeepSeekProgress = {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    chatId: messages[0]?.chatId ?? 0,
    model: options.model ?? DEFAULT_DEEPSEEK_MODEL,
    createdAt,
    updatedAt: createdAt,
    status: 'planned',
    chunks,
    entries,
    usage: {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      budgetUsd: options.budgetUsd ?? 1,
      maxRequests: options.maxRequests ?? 100,
    },
  };

  await writeJsonAtomic(chunksPath, chunks);
  await writeJsonAtomic(progressPath, progress);
  return { chunks, progress };
}

export interface DeepSeekRunOptions {
  messages: NormalizedMessage[];
  directory: string;
  config: DeepSeekConfig;
  client?: DeepSeekClient;
  maxCharacters?: number;
  overlapMessages?: number;
  retryFailed?: boolean;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

export async function runDeepSeek(options: DeepSeekRunOptions): Promise<DeepSeekProgress> {
  const client = options.client ?? new DeepSeekClient(options.config);
  const log = options.onProgress ?? (() => undefined);
  const created = await createPlan(options.messages, options.directory, {
    maxCharacters: options.maxCharacters,
    overlapMessages: options.overlapMessages,
    budgetUsd: options.config.budgetUsd,
    maxRequests: options.config.maxRequests,
    model: options.config.model,
  });
  const progress = created.progress;
  progress.usage.budgetUsd = options.config.budgetUsd;
  progress.usage.maxRequests = options.config.maxRequests;
  progress.model = options.config.model;

  if (options.dryRun) {
    await saveProgress(options.directory, progress);
    return progress;
  }

  client.assertKey();
  progress.status = 'running';
  await saveProgress(options.directory, progress);

  const allowedByChunk = new Map<number, Set<number>>();
  for (const chunk of progress.chunks) {
    // Events and topics may only cite their own target messages. Context from
    // the previous chunk is background and is analysed as that chunk's target.
    allowedByChunk.set(chunk.index, new Set(chunk.targetMessageIds));
  }
  const allIds = new Set(options.messages.map((message) => message.id));

  for (const stage of ['events', 'topics'] as const) {
    for (const chunk of progress.chunks) {
      const entry = findEntry(progress, stage, chunk.index);
      if (!shouldRun(entry, options.retryFailed === true, options.directory)) {
        if (entry.status === 'complete') log(`${stage} ${chunk.id}: уже готово`);
        continue;
      }

      const budget = checkBudget(progress, options.config, chunk.approximateCharacters);
      if (!budget.ok) {
        entry.status = 'failed';
        entry.error = budget.reason;
        entry.updatedAt = new Date().toISOString();
        progress.status = 'partial';
        await saveProgress(options.directory, progress);
        log(`${stage} ${chunk.id}: остановлено — ${budget.reason}`);
        continue;
      }

      entry.status = 'running';
      entry.attempts += 1;
      entry.updatedAt = new Date().toISOString();
      entry.error = null;
      await saveProgress(options.directory, progress);
      log(
        `${stage} ${chunk.id}: запрос к ${options.config.model} (${chunk.approximateCharacters} символов)`
      );

      try {
        const result =
          stage === 'events'
            ? await runEventsStage(client, chunk, allowedByChunk.get(chunk.index) ?? new Set())
            : await runTopicsStage(client, chunk, allowedByChunk.get(chunk.index) ?? new Set());
        addUsage(progress, result.usage);
        const fileName = `${stage}-${String(chunk.index + 1).padStart(4, '0')}.json`;
        await writeJsonAtomic(path.join(options.directory, fileName), {
          stage,
          chunkIndex: chunk.index,
          chunkId: chunk.id,
          model: result.model,
          createdAt: new Date().toISOString(),
          usage: result.usage,
          data: result.data,
        });
        await writeTextAtomic(
          path.join(options.directory, `${stage}-${chunk.id}.raw.json`),
          result.rawContent
        );
        entry.status = 'complete';
        entry.resultFile = fileName;
        entry.inputTokens += result.usage.inputTokens;
        entry.outputTokens += result.usage.outputTokens;
        entry.costUsd += result.usage.costUsd;
      } catch (error) {
        entry.status = 'failed';
        entry.error = errorMessage(error);
        progress.status = 'partial';
        log(`${stage} ${chunk.id}: ошибка — ${entry.error}`);
      }
      entry.updatedAt = new Date().toISOString();
      await saveProgress(options.directory, progress);
    }
  }

  const allChunksDone = progress.entries
    .filter((entry) => entry.stage !== 'synthesis')
    .every((entry) => entry.status === 'complete');

  if (allChunksDone) {
    const synthesisEntry = findEntry(progress, 'synthesis', null);
    if (shouldRun(synthesisEntry, options.retryFailed === true, options.directory)) {
      const budget = checkBudget(progress, options.config, 30_000);
      if (!budget.ok) {
        synthesisEntry.status = 'failed';
        synthesisEntry.error = budget.reason;
        synthesisEntry.updatedAt = new Date().toISOString();
        progress.status = 'partial';
      } else {
        synthesisEntry.status = 'running';
        synthesisEntry.attempts += 1;
        synthesisEntry.updatedAt = new Date().toISOString();
        await saveProgress(options.directory, progress);
        log('synthesis: итоговый синтез');
        try {
          const result = await runSynthesisStage(options.directory, client, progress, allIds);
          addUsage(progress, result.usage);
          await writeJsonAtomic(path.join(options.directory, 'synthesis.json'), {
            stage: 'synthesis',
            model: result.model,
            createdAt: new Date().toISOString(),
            usage: result.usage,
            data: result.data,
          });
          await writeTextAtomic(
            path.join(options.directory, 'synthesis.raw.json'),
            result.rawContent
          );
          synthesisEntry.status = 'complete';
          synthesisEntry.resultFile = 'synthesis.json';
          synthesisEntry.inputTokens += result.usage.inputTokens;
          synthesisEntry.outputTokens += result.usage.outputTokens;
          synthesisEntry.costUsd += result.usage.costUsd;
        } catch (error) {
          synthesisEntry.status = 'failed';
          synthesisEntry.error = errorMessage(error);
          progress.status = 'partial';
          log(`synthesis: ошибка — ${synthesisEntry.error}`);
        }
        synthesisEntry.updatedAt = new Date().toISOString();
      }
    }
  } else {
    log('synthesis: пропущен, пока не завершены все фрагменты');
  }

  progress.status = progress.entries.every((entry) => entry.status === 'complete')
    ? 'complete'
    : 'partial';
  progress.updatedAt = new Date().toISOString();
  await saveProgress(options.directory, progress);
  return progress;
}

async function runEventsStage(
  client: DeepSeekClient,
  chunk: DeepSeekChunk,
  allowedIds: Set<number>
): Promise<{ data: EventsResult; rawContent: string; usage: DeepSeekUsage; model: string }> {
  return runStructuredStage(client, {
    system: eventsSystemPrompt(),
    user: chunkUserPrompt(chunk, 'events'),
    schema: eventsResultSchema,
    allowedIds,
  });
}

async function runTopicsStage(
  client: DeepSeekClient,
  chunk: DeepSeekChunk,
  allowedIds: Set<number>
): Promise<{ data: TopicsResult; rawContent: string; usage: DeepSeekUsage; model: string }> {
  return runStructuredStage(client, {
    system: topicsSystemPrompt(),
    user: chunkUserPrompt(chunk, 'topics'),
    schema: topicsResultSchema,
    allowedIds,
  });
}

async function runSynthesisStage(
  directory: string,
  client: DeepSeekClient,
  progress: DeepSeekProgress,
  allowedIds: Set<number>
): Promise<{ data: SynthesisResult; rawContent: string; usage: DeepSeekUsage; model: string }> {
  const events: EventsResult['events'] = [];
  const topics: TopicsResult['topics'] = [];
  for (const chunk of progress.chunks) {
    const eventsFile = path.join(
      directory,
      `events-${String(chunk.index + 1).padStart(4, '0')}.json`
    );
    const topicsFile = path.join(
      directory,
      `topics-${String(chunk.index + 1).padStart(4, '0')}.json`
    );
    const eventsData = await readJsonOrThrow<{ data: EventsResult }>(eventsFile);
    const topicsData = await readJsonOrThrow<{ data: TopicsResult }>(topicsFile);
    events.push(...eventsData.data.events);
    topics.push(...topicsData.data.topics);
  }

  const compact = {
    events,
    topics,
    rules: [
      'Синтез только по переданным событиям и темам.',
      'Не добавляй дедлайны, согласования и завершения без sourceMessageIds.',
      'Психолингвистика — только наблюдаемые языковые особенности; интерпретации помечай kind=interpretation.',
    ],
  };
  const user = [
    'Собери итоговый JSON-синтез переписки.',
    'Верни ровно объект с полями summary, timeline, editorialEvents, recurringThemes, openQuestions, linguisticObservations, limitations, disclaimer.',
    'Каждый timeline/editorialEvents/recurringThemes/linguisticObservations элемент обязан содержать sourceMessageIds или evidenceMessageIds из переданных данных.',
    'Если данных для вывода нет, верни пустой массив, а не выдуманный факт.',
    'Данные:',
    JSON.stringify(compact),
  ].join('\n');

  return runStructuredStage(client, {
    system: synthesisSystemPrompt(),
    user,
    schema: synthesisSchema,
    allowedIds,
  });
}

interface StageInput<T> {
  system: string;
  user: string;
  schema: import('zod').ZodType<T>;
  allowedIds: Set<number>;
}

async function runStructuredStage<T>(
  client: DeepSeekClient,
  input: StageInput<T>
): Promise<{ data: T; rawContent: string; usage: DeepSeekUsage; model: string }> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await client.chatJson(input.system, input.user);
      const validated = validateResult(input.schema, result.data);
      if (!validated.success) {
        throw new DeepSeekError(`Ответ не прошёл схему: ${validated.error}`, {
          code: 'SCHEMA_ERROR',
          retryable: false,
        });
      }
      const invalid = findInvalidSourceIds(validated.data, input.allowedIds);
      if (invalid.length > 0) {
        throw new DeepSeekError(
          `Модель сослалась на несуществующие ID сообщений: ${invalid.slice(0, 20).join(', ')}`,
          { code: 'INVALID_SOURCE_IDS', retryable: false }
        );
      }
      return {
        data: validated.data,
        rawContent: result.rawContent,
        usage: result.usage,
        model: result.model,
      };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof DeepSeekError ? error.retryable : true;
      if (!retryable || attempt >= 2) break;
      await sleep(1000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function findInvalidSourceIds(value: unknown, allowed: Set<number>): number[] {
  const invalid = new Set<number>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) {
      if (childKey === 'sourceMessageIds' || childKey === 'evidenceMessageIds') {
        if (Array.isArray(child)) {
          for (const id of child) {
            if (typeof id === 'number') {
              for (const missing of invalidSourceIds([id], allowed)) invalid.add(missing);
            }
          }
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return [...invalid].sort((a, b) => a - b);
}

function eventsSystemPrompt(): string {
  return [
    'Ты аналитик редакционной переписки. Отвечай строго одним JSON-объектом, без markdown и пояснений.',
    'Извлекай только события, которые явно подтверждены сообщениями: редакционные поручения, сроки, сдачу текстов, просьбы о правках, согласования, ссылки на публикации и завершение задач.',
    'Не выдумывай дедлайны. Если срок не назван явно или относительно, deadline=null или kind="unclear", а не придуманная дата.',
    'Не объявляй задачу завершённой, если это не подтверждено сообщением.',
    'Для каждого события обязательны sourceMessageIds — ID только из блока target (context — только для понимания).',
    'confidence — твоя уверенность от 0 до 1. При сомнении ставь ниже.',
    'Формат JSON: {"events":[{"type":"assignment|deadline|text_delivery|revision_request|approval|publication_link|task_completion|other","summary":"...","sourceMessageIds":[123],"confidence":0.8,"date":null,"deadline":null,"status":"stated|agreed|in_progress|completed|cancelled|uncertain","participants":[]}],"notes":[]}',
  ].join('\n');
}

function topicsSystemPrompt(): string {
  return [
    'Ты аналитик переписки. Отвечай строго одним JSON-объектом, без markdown и пояснений.',
    'Выдели темы, которые действительно обсуждаются в целевых сообщениях. Не приписывай темы, которых нет в тексте.',
    'Каждая тема обязана содержать sourceMessageIds из блока target и confidence от 0 до 1.',
    'Формат JSON: {"topics":[{"label":"...","description":"...","sourceMessageIds":[123],"confidence":0.8}],"notes":[]}',
  ].join('\n');
}

function synthesisSystemPrompt(): string {
  return [
    'Ты аналитик редакционной переписки. Отвечай строго одним JSON-объектом, без markdown и пояснений.',
    'Синтезируй только переданные события и темы. Не добавляй новых фактов, дедлайнов или завершений задач.',
    'Психолингвистический раздел: описывай только наблюдаемые языковые особенности (лексика, длина реплик, обращения, повторы, изменения во времени).',
    'Любые догадки о мотивах, эмоциях или личности помечай kind="interpretation", указывай alternativeInterpretations и не подавай как установленный факт.',
    'У каждого наблюдения и события должны быть evidenceMessageIds/sourceMessageIds из переданных данных.',
    'Поля editorialEvents обязательны у каждого объекта: type, summary, sourceMessageIds, confidence, date, deadline, status, participants.',
    'type — строго одно из: assignment, deadline, text_delivery, revision_request, approval, publication_link, task_completion, other.',
    'status — строго одно из: stated, agreed, in_progress, completed, cancelled, uncertain.',
    'date — строка ISO или null. deadline — null или объект {raw, date, kind, confidence, sourceMessageIds}, где kind — explicit|relative|unclear.',
    'Не переводи значения enum на русский язык. Не пропускай nullable-поля: date и deadline должны присутствовать, даже если равны null.',
    'Формат JSON: {"summary":"...","timeline":[{"date":null,"summary":"...","sourceMessageIds":[123],"confidence":0.8}],"editorialEvents":[{"type":"other","summary":"...","sourceMessageIds":[123],"confidence":0.8,"date":null,"deadline":null,"status":"uncertain","participants":[]}],"recurringThemes":[{"label":"...","summary":"...","sourceMessageIds":[123],"confidence":0.8}],"openQuestions":[],"linguisticObservations":[{"kind":"observable","observation":"...","evidenceMessageIds":[123],"confidence":0.8,"alternativeInterpretations":[]}],"limitations":[],"disclaimer":"..."}',
  ].join('\n');
}

function chunkUserPrompt(chunk: DeepSeekChunk, mode: 'events' | 'topics'): string {
  const instruction =
    mode === 'events'
      ? 'Извлеки редакционные события из блока target. Строки context — только фон.'
      : 'Выдели темы из блока target. Строки context — только фон.';
  const allowedTargetIds = chunk.targetMessageIds.join(', ');
  // Older plans stored numeric IDs on context lines. They are useful for
  // understanding but must never be cited as sources; hide them from the
  // model so the validation below can enforce target-only citations.
  const text = chunk.text.replace(/^\[context\] \[\d+\]/gm, '[context] [ctx]');

  return [
    instruction,
    `Фрагмент ${chunk.id}: ${chunk.dateFrom} — ${chunk.dateTo}.`,
    'Строки имеют формат: [target|context] [messageId] ISO-время | отправитель | текст.',
    'Разрешённые sourceMessageIds — только ID из блока target:',
    allowedTargetIds,
    'Не используй context-ID и не придумывай ID. Любой другой ID запрещён.',
    'Верни только JSON по заданной схеме.',
    text,
  ].join('\n');
}

function formatMessageLine(role: 'target' | 'context', message: NormalizedMessage): string {
  const sender =
    message.sender.displayName ?? message.sender.username ?? String(message.sender.id ?? 'unknown');
  const text = (message.text ?? '[без текста]').replace(/\s+/g, ' ').trim();
  const media = message.hasMedia ? ` [media:${message.media?.kind ?? 'unknown'}]` : '';
  return `[${role}] [${message.id}] ${message.date} | ${sender}${media} | ${text}`;
}

function makeEntry(
  stage: DeepSeekStage,
  chunkIndex: number | null,
  status: DeepSeekProgressEntry['status']
): DeepSeekProgressEntry {
  return {
    stage,
    chunkIndex,
    status,
    attempts: 0,
    updatedAt: new Date().toISOString(),
    error: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    resultFile: null,
  };
}

function findEntry(
  progress: DeepSeekProgress,
  stage: DeepSeekStage,
  chunkIndex: number | null
): DeepSeekProgressEntry {
  const entry = progress.entries.find(
    (candidate) => candidate.stage === stage && candidate.chunkIndex === chunkIndex
  );
  if (!entry) throw new Error(`Нет записи прогресса для ${stage}:${chunkIndex ?? 'all'}`);
  return entry;
}

function shouldRun(entry: DeepSeekProgressEntry, retryFailed: boolean, directory: string): boolean {
  if (entry.status === 'complete' && entry.resultFile) {
    // A missing result file means the checkpoint and files disagree.
    return !existsSync(path.join(directory, entry.resultFile));
  }
  if (entry.status === 'failed') return Boolean(retryFailed);
  return true;
}

function checkBudget(
  progress: DeepSeekProgress,
  config: DeepSeekConfig,
  approximateCharacters: number
): { ok: true } | { ok: false; reason: string } {
  if (progress.usage.requests >= config.maxRequests) {
    return { ok: false, reason: `достигнут лимит запросов (${config.maxRequests})` };
  }
  const estimatedInput = Math.ceil(approximateCharacters / 3) + 2000;
  const estimatedCost =
    (estimatedInput / 1_000_000) * config.inputPricePerMillion +
    (config.maxOutputTokens / 1_000_000) * config.outputPricePerMillion;
  if (progress.usage.estimatedCostUsd + estimatedCost > config.budgetUsd) {
    return {
      ok: false,
      reason: `бюджет $${config.budgetUsd} не позволяет следующий запрос (оценка ещё $${estimatedCost.toFixed(4)})`,
    };
  }
  return { ok: true };
}

function addUsage(progress: DeepSeekProgress, usage: DeepSeekUsage): void {
  progress.usage.requests += 1;
  progress.usage.inputTokens += usage.inputTokens;
  progress.usage.outputTokens += usage.outputTokens;
  progress.usage.estimatedCostUsd += usage.costUsd;
}

async function saveProgress(directory: string, progress: DeepSeekProgress): Promise<void> {
  progress.updatedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(directory, 'progress.json'), progress);
}

function estimateCost(inputTokens: number, outputTokens: number, config: DeepSeekConfig): number {
  return (
    (inputTokens / 1_000_000) * config.inputPricePerMillion +
    (outputTokens / 1_000_000) * config.outputPricePerMillion
  );
}

function parseJsonObject(
  content: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'ожидался JSON-объект' };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function redact(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/(sk-[A-Za-z0-9_-]+)/g, '[REDACTED]');
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads a previous result file, used by tests and the synthesis step. */
export async function readDeepSeekResult<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

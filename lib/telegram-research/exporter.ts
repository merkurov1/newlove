import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  ChatIdentity,
  ExportCheckpoint,
  ExportErrorRecord,
  Manifest,
  ManifestCounts,
  NormalizedMessage,
  RawPageRecord,
} from './types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from './types';
import type { LatestVisibleMessage, TgHistoryResponse } from './tg-cli';
import { TgCliError } from './tg-cli';
import {
  mergeMessages,
  messageKey,
  normalizeHistoryPage,
  sortMessages,
  toJsonLines,
  type NormalizeContext,
} from './normalize';
import {
  ensureDir,
  errorMessage,
  readJson,
  sha256,
  sleep,
  writeJsonAtomic,
  writeTextAtomic,
} from './util';

export interface ExportClient {
  historyPage(peer: string, offsetId: number, limit?: number): Promise<TgHistoryResponse>;
}

export interface ExportOptions {
  client: ExportClient;
  peer: string;
  chat: ChatIdentity;
  paths: {
    root: string;
    state: string;
    corpus: string;
    manifest: string;
    rawPagesDir: string;
    meta: string;
  };
  pageSize?: number;
  maxPages?: number;
  maxHeadPages?: number;
  maxMessages?: number;
  maxRetries?: number;
  selfId?: number | null;
  latestVisible?: () => Promise<LatestVisibleMessage | null>;
  now?: () => Date;
  sleepFn?: (ms: number) => Promise<void>;
  onProgress?: (message: string) => void;
}

export interface ExportResult {
  state: ExportCheckpoint;
  manifest: Manifest;
  messages: NormalizedMessage[];
  limitHit: boolean;
}

const FILE_SCHEMA = TELEGRAM_RESEARCH_SCHEMA_VERSION;

export async function exportHistory(options: ExportOptions): Promise<ExportResult> {
  const pageSize = clampInt(options.pageSize ?? 100, 1, 100);
  const maxPages = clampInt(options.maxPages ?? 10_000, 1, 1_000_000);
  const maxHeadPages = clampInt(options.maxHeadPages ?? 50, 1, 10_000);
  const maxMessages = clampInt(options.maxMessages ?? 1_000_000, 1, 10_000_000);
  const maxRetries = clampInt(options.maxRetries ?? 5, 0, 20);
  const now = options.now ?? (() => new Date());
  const pause = options.sleepFn ?? ((ms: number) => sleep(ms));
  const log = options.onProgress ?? (() => undefined);

  await ensureDir(options.paths.rawPagesDir);
  const existingPages = await loadRawPages(options.paths.rawPagesDir);
  const existingState = await readJson<ExportCheckpoint>(options.paths.state);

  const state: ExportCheckpoint = existingState ?? {
    schemaVersion: FILE_SCHEMA,
    status: 'running',
    chat: options.chat,
    startedAt: now().toISOString(),
    updatedAt: now().toISOString(),
    finishedAt: null,
    strategy: 'messages.list+raw_json',
    pageSize,
    pagesCompleted: 0,
    headPagesCompleted: 0,
    nextOffsetId: 0,
    reachedStart: false,
    headStable: false,
    messageCount: 0,
    duplicateCount: 0,
    messageEmptyCount: 0,
    minMessageId: null,
    maxMessageId: null,
    apiCalls: 0,
    retries: 0,
    emptyPages: 0,
    errors: [],
    limits: { maxPages, maxMessages, maxRetries },
  };

  state.status = 'running';
  state.chat = options.chat;
  state.pageSize = pageSize;
  const previousLimits = existingState?.limits;
  state.limits = { maxPages, maxMessages, maxRetries };
  if (
    previousLimits &&
    (maxPages > previousLimits.maxPages || maxMessages > previousLimits.maxMessages)
  ) {
    // A rerun with higher limits can continue past a guard that stopped an
    // earlier attempt. The stale guard error must not keep the result partial.
    for (const error of state.errors) {
      if (error.code === 'PAGE_LIMIT' || error.code === 'MESSAGE_LIMIT') {
        error.resolved = true;
      }
    }
  }
  state.updatedAt = now().toISOString();
  if (state.finishedAt) state.finishedAt = null;

  const messages = new Map<string, NormalizedMessage>();
  let duplicates = 0;
  let messageEmptyCount = 0;
  const unsupportedKinds: Record<string, number> = {};
  let maxBackwardPage = 0;
  let maxHeadPage = 0;

  for (const page of existingPages) {
    const context: NormalizeContext = {
      chatId: options.chat.id,
      chatType: options.chat.type,
      selfId: options.selfId ?? null,
      page: page.page,
    };
    const normalized = normalizeHistoryPage(responseFromRecord(page), context);
    duplicates += mergeMessages(messages, normalized.messages);
    messageEmptyCount += normalized.emptyRecords;
    addCounts(unsupportedKinds, normalized.unsupportedKinds);
    if (page.phase === 'backward') maxBackwardPage = Math.max(maxBackwardPage, page.page);
    if (page.phase === 'head') maxHeadPage = Math.max(maxHeadPage, page.page);
  }

  state.pagesCompleted = Math.max(state.pagesCompleted, maxBackwardPage);
  state.headPagesCompleted = Math.max(state.headPagesCompleted, maxHeadPage);
  state.duplicateCount = Math.max(state.duplicateCount, duplicates);
  state.messageEmptyCount = Math.max(state.messageEmptyCount, messageEmptyCount);

  log(
    `Восстановлено страниц: ${existingPages.length}, сообщений: ${messages.size}, дубликатов: ${duplicates}`
  );

  let limitHit = false;

  if (!state.reachedStart) {
    let offsetId = state.nextOffsetId ?? 0;
    let pageNumber = maxBackwardPage;

    while (!state.reachedStart) {
      if (pageNumber >= maxPages) {
        limitHit = true;
        state.errors.push({
          at: now().toISOString(),
          phase: 'backward',
          page: pageNumber + 1,
          attempt: 1,
          code: 'PAGE_LIMIT',
          message: `Достигнут предохранитель maxPages=${maxPages}`,
          waitSeconds: null,
          resolved: false,
        });
        break;
      }
      if (messages.size >= maxMessages) {
        limitHit = true;
        state.errors.push({
          at: now().toISOString(),
          phase: 'backward',
          page: pageNumber + 1,
          attempt: 1,
          code: 'MESSAGE_LIMIT',
          message: `Достигнут предохранитель maxMessages=${maxMessages}`,
          waitSeconds: null,
          resolved: false,
        });
        break;
      }

      const fetched = await fetchPageWithRetries({
        client: options.client,
        peer: options.peer,
        offsetId,
        limit: pageSize,
        phase: 'backward',
        pageNumber: pageNumber + 1,
        maxRetries,
        state,
        now,
        pause,
        log,
      });

      if (!fetched) break;

      pageNumber += 1;
      const record: RawPageRecord = {
        schemaVersion: FILE_SCHEMA,
        phase: 'backward',
        page: pageNumber,
        requestedOffsetId: offsetId,
        requestedLimit: pageSize,
        receivedAt: now().toISOString(),
        attempts: fetched.attempts,
        response: fetched.response.raw,
      };
      await writeJsonAtomic(pagePath(options.paths.rawPagesDir, 'backward', pageNumber), record);

      const normalized = normalizeHistoryPage(fetched.response, {
        chatId: options.chat.id,
        chatType: options.chat.type,
        selfId: options.selfId ?? null,
        page: pageNumber,
      });
      duplicates += mergeMessages(messages, normalized.messages);
      messageEmptyCount += normalized.emptyRecords;
      addCounts(unsupportedKinds, normalized.unsupportedKinds);

      state.pagesCompleted = pageNumber;
      state.apiCalls += 1;
      state.duplicateCount = duplicates;
      state.messageEmptyCount = messageEmptyCount;
      resolvePageErrors(state, 'backward', pageNumber);
      updateRange(state, messages);
      state.updatedAt = now().toISOString();
      await writeJsonAtomic(options.paths.state, state);

      log(
        `Страница ${pageNumber}: +${normalized.messages.length} сообщений, всего ${messages.size}, offset=${offsetId}`
      );

      if (fetched.response.messages.length === 0) {
        state.reachedStart = true;
        state.emptyPages += 1;
        state.nextOffsetId = null;
        break;
      }

      if (normalized.minMessageId === null) {
        state.errors.push({
          at: now().toISOString(),
          phase: 'backward',
          page: pageNumber,
          attempt: 1,
          code: 'NO_MESSAGE_IDS',
          message: 'Страница не содержит валидных ID; пагинация остановлена, чтобы не зациклиться',
          waitSeconds: null,
          resolved: false,
        });
        break;
      }

      const nextOffset = normalized.minMessageId;
      if (nextOffset >= offsetId && offsetId !== 0) {
        state.errors.push({
          at: now().toISOString(),
          phase: 'backward',
          page: pageNumber,
          attempt: 1,
          code: 'NO_PROGRESS',
          message: `Пагинация не продвинулась: offsetId=${offsetId}, minId=${nextOffset}`,
          waitSeconds: null,
          resolved: false,
        });
        break;
      }

      offsetId = nextOffset;
      state.nextOffsetId = nextOffset;

      if (nextOffset <= 1) {
        state.reachedStart = true;
        state.nextOffsetId = null;
        break;
      }
    }
  }

  if (state.reachedStart) {
    await runHeadSync({
      options,
      state,
      messages,
      maxHeadPages,
      pageSize,
      maxRetries,
      now,
      pause,
      log,
      existingHeadPages: maxHeadPage,
      onDuplicates: (count) => {
        duplicates += count;
      },
      onEmpty: (count) => {
        messageEmptyCount += count;
      },
      onUnsupported: (counts) => addCounts(unsupportedKinds, counts),
    });
  }

  const sorted = sortMessages(messages.values());
  updateRange(state, messages);

  const finalState: ExportCheckpoint = {
    ...state,
    status:
      state.reachedStart && state.headStable && !hasUnresolvedErrors(state) && !limitHit
        ? 'complete'
        : 'partial',
    messageCount: sorted.length,
    duplicateCount: duplicates,
    messageEmptyCount,
    updatedAt: now().toISOString(),
    finishedAt: now().toISOString(),
  };
  await writeJsonAtomic(options.paths.state, finalState);

  const corpusText = toJsonLines(sorted);
  await writeTextAtomic(options.paths.corpus, corpusText);

  const latestVisible = options.latestVisible
    ? await safeLatestVisible(options.latestVisible)
    : null;
  const manifest = buildManifest({
    chat: options.chat,
    state: finalState,
    messages: sorted,
    corpusText,
    latestVisible,
    limitHit,
    unsupportedKinds,
  });
  await writeJsonAtomic(options.paths.manifest, manifest);
  await writeJsonAtomic(options.paths.meta, {
    schemaVersion: FILE_SCHEMA,
    chat: options.chat,
    peer: options.peer,
    exportedAt: now().toISOString(),
    strategy: state.strategy,
    timezone: 'UTC',
  });

  return { state: finalState, manifest, messages: sorted, limitHit };
}

interface FetchArgs {
  client: ExportClient;
  peer: string;
  offsetId: number;
  limit: number;
  phase: 'backward' | 'head';
  pageNumber: number;
  maxRetries: number;
  state: ExportCheckpoint;
  now: () => Date;
  pause: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

async function fetchPageWithRetries(
  args: FetchArgs
): Promise<{ response: TgHistoryResponse; attempts: number } | null> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= args.maxRetries + 1; attempt += 1) {
    try {
      const response = await args.client.historyPage(args.peer, args.offsetId, args.limit);
      resolvePageErrors(args.state, args.phase, args.pageNumber);
      if (attempt > 1) {
        args.state.retries += attempt - 1;
        args.state.errors.push({
          at: args.now().toISOString(),
          phase: args.phase,
          page: args.pageNumber,
          attempt: attempt - 1,
          code: lastError instanceof TgCliError ? lastError.code : 'RETRY',
          message: `Временная ошибка, повтор ${attempt - 1} успешен: ${errorMessage(lastError)}`,
          waitSeconds: null,
          resolved: true,
        });
      }
      return { response, attempts: attempt };
    } catch (error) {
      lastError = error;
      args.state.retries += 1;
      const waitSeconds = error instanceof TgCliError ? error.waitSeconds : null;
      const retryable = !(error instanceof TgCliError) || error.retryable;
      const record: ExportErrorRecord = {
        at: args.now().toISOString(),
        phase: args.phase,
        page: args.pageNumber,
        attempt,
        code: error instanceof TgCliError ? error.code : null,
        message: errorMessage(error),
        waitSeconds,
        resolved: false,
      };
      args.state.errors.push(record);

      if (!retryable || attempt > args.maxRetries) {
        args.state.updatedAt = args.now().toISOString();
        return null;
      }

      const backoffSeconds = Math.min(60, 2 ** (attempt - 1));
      const waitMs = Math.max((waitSeconds ?? 0) * 1000, backoffSeconds * 1000);
      args.log(
        `Страница ${args.pageNumber}: ошибка «${record.message}», повтор через ${Math.round(waitMs / 1000)} с`
      );
      await args.pause(waitMs);
    }
  }

  return null;
}

interface HeadSyncArgs {
  options: ExportOptions;
  state: ExportCheckpoint;
  messages: Map<string, NormalizedMessage>;
  maxHeadPages: number;
  pageSize: number;
  maxRetries: number;
  now: () => Date;
  pause: (ms: number) => Promise<void>;
  log: (message: string) => void;
  existingHeadPages: number;
  onDuplicates: (count: number) => void;
  onEmpty: (count: number) => void;
  onUnsupported: (counts: Record<string, number>) => void;
}

/**
 * A second pass from the newest message down to the already exported range.
 * It catches messages that arrived while the backward pass was running and
 * provides the independent "head is stable" check.
 */
async function runHeadSync(args: HeadSyncArgs): Promise<void> {
  let offsetId = 0;
  let pageNumber = args.existingHeadPages;
  const exportedMax = args.state.maxMessageId ?? 0;

  while (pageNumber < args.maxHeadPages) {
    const fetched = await fetchPageWithRetries({
      client: args.options.client,
      peer: args.options.peer,
      offsetId,
      limit: args.pageSize,
      phase: 'head',
      pageNumber: pageNumber + 1,
      maxRetries: args.maxRetries,
      state: args.state,
      now: args.now,
      pause: args.pause,
      log: args.log,
    });
    if (!fetched) {
      args.state.headStable = false;
      return;
    }

    pageNumber += 1;
    const record: RawPageRecord = {
      schemaVersion: FILE_SCHEMA,
      phase: 'head',
      page: pageNumber,
      requestedOffsetId: offsetId,
      requestedLimit: args.pageSize,
      receivedAt: args.now().toISOString(),
      attempts: fetched.attempts,
      response: fetched.response.raw,
    };
    await writeJsonAtomic(pagePath(args.options.paths.rawPagesDir, 'head', pageNumber), record);

    const normalized = normalizeHistoryPage(fetched.response, {
      chatId: args.options.chat.id,
      chatType: args.options.chat.type,
      selfId: args.options.selfId ?? null,
      page: pageNumber,
    });
    const duplicates = mergeMessages(args.messages, normalized.messages);
    args.onDuplicates(duplicates);
    args.onEmpty(normalized.emptyRecords);
    args.onUnsupported(normalized.unsupportedKinds);

    args.state.headPagesCompleted = pageNumber;
    args.state.apiCalls += 1;
    args.state.duplicateCount += duplicates;
    resolvePageErrors(args.state, 'head', pageNumber);
    args.state.updatedAt = args.now().toISOString();
    updateRange(args.state, args.messages);
    await writeJsonAtomic(args.options.paths.state, args.state);

    args.log(
      `Проверка головы ${pageNumber}: +${normalized.messages.length}, max=${args.state.maxMessageId}`
    );

    if (fetched.response.messages.length === 0) {
      args.state.emptyPages += 1;
      args.state.headStable = args.messages.size > 0;
      return;
    }

    if (normalized.minMessageId === null) {
      args.state.headStable = false;
      return;
    }

    if (exportedMax > 0 && normalized.minMessageId <= exportedMax) {
      args.state.headStable = true;
      return;
    }

    if (normalized.minMessageId >= offsetId && offsetId !== 0) {
      args.state.headStable = false;
      return;
    }

    offsetId = normalized.minMessageId;
    if (offsetId <= 1) {
      args.state.headStable = true;
      return;
    }
  }

  args.state.headStable = false;
}

function buildManifest(input: {
  chat: ChatIdentity;
  state: ExportCheckpoint;
  messages: NormalizedMessage[];
  corpusText: string;
  latestVisible: LatestVisibleMessage | null;
  limitHit: boolean;
  unsupportedKinds: Record<string, number>;
}): Manifest {
  const { messages, state } = input;
  const ids = new Set(messages.map((message) => message.id));
  const counts = countMessages(messages);
  const noUnresolvedErrors = !hasUnresolvedErrors(state);
  const sortedAndUnique = isSortedAndUnique(messages);
  const latestMatched =
    input.latestVisible === null
      ? null
      : state.maxMessageId !== null && input.latestVisible.id <= state.maxMessageId;

  const checks: Manifest['completeness']['checks'] = {
    authWasRequired: true,
    reachedEmptyPage: state.reachedStart,
    headStable: state.headStable,
    latestVisibleMessageMatched: latestMatched,
    noUnresolvedErrors,
    withinLimits: !input.limitHit,
    corpusSortedAndUnique: sortedAndUnique,
  };

  const reasons: string[] = [];
  const gaps: Manifest['completeness']['gaps'] = [];
  if (!state.reachedStart) {
    reasons.push('Не достигнуто начало истории: пагинация остановилась раньше.');
    gaps.push({
      kind: 'history_start_not_reached',
      detail: `Последний nextOffsetId=${state.nextOffsetId ?? '—'}`,
    });
  }
  if (!state.headStable) {
    reasons.push('Не подтверждена стабильность головы диалога.');
    gaps.push({
      kind: 'head_not_stable',
      detail: 'Head sync не дошёл до экспортированного диапазона.',
    });
  }
  if (!noUnresolvedErrors) {
    reasons.push('Есть неразрешённые ошибки экспорта (см. export-state.json).');
    for (const error of state.errors.filter((item) => !item.resolved)) {
      gaps.push({
        kind: 'export_error',
        detail: `${error.phase} page ${error.page}, attempt ${error.attempt}: ${
          error.code ?? 'ERROR'
        } ${error.message}`,
      });
    }
  }
  if (input.limitHit) {
    reasons.push('Сработал предохранитель maxPages/maxMessages.');
    gaps.push({ kind: 'limit_reached', detail: 'Экспорт остановлен предохранителем.' });
  }
  if (latestMatched === false) {
    reasons.push('Самое новое видимое сообщение новее экспортированного максимума.');
    gaps.push({
      kind: 'newer_messages_outside_corpus',
      detail: `latestVisible=${input.latestVisible?.id ?? '—'}, exportedMax=${
        state.maxMessageId ?? '—'
      }`,
    });
  }
  if (latestMatched === null) {
    reasons.push(
      'Не удалось независимо проверить самое новое сообщение через tg messages list --fresh.'
    );
    gaps.push({
      kind: 'latest_visible_not_checked',
      detail: 'Проверка последнего видимого сообщения недоступна.',
    });
  }
  if (!sortedAndUnique) {
    reasons.push('Корпус не отсортирован или содержит дубликаты.');
    gaps.push({ kind: 'corpus_integrity', detail: 'Нарушена сортировка или уникальность.' });
  }

  const allChecksPass =
    state.reachedStart &&
    state.headStable &&
    noUnresolvedErrors &&
    !input.limitHit &&
    latestMatched === true &&
    sortedAndUnique;

  const status: Manifest['completeness']['status'] = allChecksPass
    ? 'complete'
    : state.reachedStart && noUnresolvedErrors && sortedAndUnique
      ? 'partial'
      : 'incomplete';

  const missingReplyTargets = messages.filter(
    (message) => message.reply?.toMessageId != null && !ids.has(message.reply.toMessageId)
  ).length;
  const forwardsWithoutSource = messages.filter(
    (message) =>
      message.forward && message.forward.fromId === null && message.forward.fromName === null
  ).length;

  const first = messages[0] ?? null;
  const last = messages[messages.length - 1] ?? null;

  return {
    schemaVersion: FILE_SCHEMA,
    chat: input.chat,
    export: {
      startedAt: state.startedAt,
      finishedAt: state.finishedAt ?? new Date().toISOString(),
      strategy: state.strategy,
      pageSize: state.pageSize,
      pages: state.pagesCompleted,
      headPages: state.headPagesCompleted,
      apiCalls: state.apiCalls,
      retries: state.retries,
      emptyPages: state.emptyPages,
      duplicatesDropped: state.duplicateCount,
      messageEmptyRecords: state.messageEmptyCount,
      reachedStart: state.reachedStart,
      headStable: state.headStable,
      sourceTimezone: 'UTC',
    },
    corpus: {
      file: 'corpus.jsonl',
      messageCount: messages.length,
      firstMessage: first ? { id: first.id, date: first.date } : null,
      lastMessage: last ? { id: last.id, date: last.date } : null,
      dateRange: first && last ? { from: first.date, to: last.date } : null,
      sha256: sha256(input.corpusText),
    },
    counts,
    completeness: {
      status,
      reasons,
      gaps,
      checks,
      latestVisibleMessage:
        input.latestVisible === null
          ? null
          : {
              id: input.latestVisible.id,
              exportedMaxId: state.maxMessageId,
              checkedAt: input.latestVisible.checkedAt,
              source: 'tg messages list --fresh',
            },
    },
    dataQuality: {
      unknownSender: messages.filter((message) => message.sender.id === null).length,
      missingReplyTargets,
      forwardsWithoutSource,
      emptyTextMessages: messages.filter((message) => message.text === '').length,
      duplicatesInRawPages: state.duplicateCount,
      unsupportedMessageKinds: input.unsupportedKinds,
      notes: [
        'Временные метки Telegram — Unix seconds; в корпусе они сохранены как UTC ISO-8601.',
        'Медиа не скачивались: сохранены только текстовые подписи и метаданные.',
        'Telegram не отдаёт удалённые сообщения через историю; флаг isDeleted отражает только то, что вернул API.',
        'Полнота подтверждается пустой страницей, стабильной головой и независимой проверкой последнего видимого сообщения.',
      ],
    },
    generatedBy: {
      tool: 'telegram-research',
      version: '0.1.0',
      command: 'telegram-research export',
    },
  };
}

function countMessages(messages: NormalizedMessage[]): ManifestCounts {
  const participants = new Set<string>();
  for (const message of messages) {
    participants.add(message.sender.id === null ? 'unknown' : String(message.sender.id));
  }
  return {
    total: messages.length,
    withText: messages.filter((message) => message.text !== null && message.text.length > 0).length,
    withoutText: messages.filter((message) => message.text === null).length,
    mediaOnly: messages.filter((message) => message.hasMedia && message.text === null).length,
    media: messages.filter((message) => message.hasMedia).length,
    service: messages.filter((message) => message.isService).length,
    edited: messages.filter((message) => message.isEdited).length,
    deleted: messages.filter((message) => message.isDeleted).length,
    forwarded: messages.filter((message) => message.forward !== null).length,
    replies: messages.filter((message) => message.reply?.toMessageId != null).length,
    outgoing: messages.filter((message) => message.isOutgoing).length,
    participants: participants.size,
  };
}

function isSortedAndUnique(messages: NormalizedMessage[]): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const key = messageKey(message);
    if (seen.has(key)) return false;
    seen.add(key);
    if (index > 0) {
      const previous = messages[index - 1];
      if (previous.dateMs > message.dateMs) return false;
      if (previous.dateMs === message.dateMs && previous.id >= message.id) return false;
    }
  }
  return true;
}

function updateRange(state: ExportCheckpoint, messages: Map<string, NormalizedMessage>): void {
  state.messageCount = messages.size;
  state.minMessageId = null;
  state.maxMessageId = null;
  for (const message of messages.values()) {
    state.minMessageId =
      state.minMessageId === null ? message.id : Math.min(state.minMessageId, message.id);
    state.maxMessageId =
      state.maxMessageId === null ? message.id : Math.max(state.maxMessageId, message.id);
  }
}

function hasUnresolvedErrors(state: ExportCheckpoint): boolean {
  return state.errors.some((error) => !error.resolved);
}

function resolvePageErrors(
  state: ExportCheckpoint,
  phase: 'backward' | 'head',
  page: number
): void {
  for (const error of state.errors) {
    if (error.phase === phase && error.page === page) error.resolved = true;
  }
}

async function safeLatestVisible(
  callback: () => Promise<LatestVisibleMessage | null>
): Promise<LatestVisibleMessage | null> {
  try {
    return await callback();
  } catch {
    return null;
  }
}

async function loadRawPages(directory: string): Promise<RawPageRecord[]> {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const records: RawPageRecord[] = [];
  for (const file of files.filter((name) => /^(backward|head)-\d+\.json$/.test(name))) {
    const record = await readJson<RawPageRecord>(path.join(directory, file));
    if (record) records.push(record);
  }

  return records.sort((a, b) => {
    const byTime = (a.receivedAt ?? '').localeCompare(b.receivedAt ?? '');
    if (byTime !== 0) return byTime;
    return `${a.phase}-${a.page}`.localeCompare(`${b.phase}-${b.page}`);
  });
}

function responseFromRecord(record: RawPageRecord): TgHistoryResponse {
  const raw = record.response;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Повреждённая сырая страница ${record.phase}-${record.page}: ответ не объект`);
  }
  const payload = raw as Record<string, unknown>;
  return {
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    chats: Array.isArray(payload.chats) ? payload.chats : [],
    count: typeof payload.count === 'number' ? payload.count : null,
    raw,
  };
}

function pagePath(directory: string, phase: 'backward' | 'head', page: number): string {
  return path.join(directory, `${phase}-${String(page).padStart(6, '0')}.json`);
}

function addCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

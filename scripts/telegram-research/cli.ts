#!/usr/bin/env bun
/**
 * Local Telegram Research CLI.
 *
 * Usage:
 *   bun run scripts/telegram-research/cli.ts find --handle @Vorobievaya
 *   bun run scripts/telegram-research/cli.ts export --handle @Vorobievaya --confirm @Vorobievaya
 *   bun run scripts/telegram-research/cli.ts stats --handle @Vorobievaya
 */

import { readFile } from 'node:fs/promises';

import type {
  ApprovalRecord,
  ChatIdentity,
  DiscoveryRecord,
  Manifest,
  NormalizedMessage,
} from '../../lib/telegram-research/types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from '../../lib/telegram-research/types';
import { chatPaths, normalizeHandle, slugifyChat } from '../../lib/telegram-research/paths';
import { TgCliError, TgClient } from '../../lib/telegram-research/tg-cli';
import { exportHistory } from '../../lib/telegram-research/exporter';
import { parseJsonLines } from '../../lib/telegram-research/normalize';
import { computeAnalysis } from '../../lib/telegram-research/stats';
import { verifyCorpus } from '../../lib/telegram-research/verify';
import {
  DEFAULT_CHUNK_OPTIONS,
  DeepSeekClient,
  DeepSeekError,
  createPlan,
  deepSeekConfigFromEnv,
  runDeepSeek,
} from '../../lib/telegram-research/deepseek';
import {
  ensureDir,
  errorMessage,
  readJson,
  writeJsonAtomic,
} from '../../lib/telegram-research/util';

const DEFAULT_HANDLE = process.env.TELEGRAM_RESEARCH_CHAT ?? '@Vorobievaya';

interface ParsedFlags {
  command: string;
  flags: Record<string, string | boolean>;
}

async function main(): Promise<number> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    case 'auth-status':
      return authStatus(flags);
    case 'find':
      return find(flags);
    case 'export':
      return exportCommand(flags);
    case 'stats':
      return stats(flags);
    case 'verify':
      return verify(flags);
    case 'plan':
      return plan(flags);
    case 'deepseek':
      return deepseek(flags);
    default:
      console.error(`Неизвестная команда: ${command}`);
      printHelp();
      return 3;
  }
}

async function authStatus(flags: Record<string, string | boolean>): Promise<number> {
  const client = new TgClient({ account: stringFlag(flags, 'account') });
  const version = await client.version();
  const status = await client.authStatus();
  printJson({ tgVersion: version, authenticated: status.authenticated, message: status.message });
  return status.authenticated ? 0 : 2;
}

async function find(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const client = new TgClient({ account: stringFlag(flags, 'account') });
  await client.requireAuth();
  const chat = await client.findChat(handle);
  const self = await client.me();
  const paths = chatPaths(slugifyChat(chat.username ?? handle));
  const discovery: DiscoveryRecord = {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    handle: normalizeHandle(handle),
    chat,
    self,
    discoveredAt: new Date().toISOString(),
    confirmationRequired: true,
  };
  await ensureDir(paths.root);
  await writeJsonAtomic(paths.discovery, discovery);

  console.error('Найден диалог. Проверьте метаданные перед экспортом:');
  console.error(`  ID:        ${chat.id}`);
  console.error(`  Тип:       ${chat.type}`);
  console.error(`  Название:  ${chat.title}`);
  console.error(`  Username:  ${chat.username ?? '—'}`);
  console.error(`  Имя:       ${[chat.firstName, chat.lastName].filter(Boolean).join(' ') || '—'}`);
  console.error(`  Бот:       ${chat.isBot ? 'да' : 'нет'}`);
  console.error(
    `  Вы:        ${self ? `${self.displayName ?? self.username ?? self.id} (${self.id})` : 'не удалось получить'}`
  );
  console.error('');
  console.error('Если это нужный контакт, подтвердите и запустите экспорт:');
  console.error(
    `  bun run scripts/telegram-research/cli.ts export --handle ${handle} --confirm ${chat.id}`
  );
  console.error('');
  printJson(discovery);
  return 0;
}

async function exportCommand(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const confirm = stringFlag(flags, 'confirm');
  if (!confirm) {
    throw new CliUsageError(
      'Экспорт не запущен: нужен явный --confirm <ID или @username> после проверки метаданных.',
      'Сначала выполните find, затем повторите export с --confirm.'
    );
  }

  const client = new TgClient({ account: stringFlag(flags, 'account') });
  await client.requireAuth();

  const chat = await client.findChat(handle);
  const discovery = await readJson<DiscoveryRecord>(
    chatPaths(slugifyChat(chat.username ?? handle)).discovery
  );

  if (discovery && discovery.chat.id !== chat.id) {
    throw new CliUsageError(
      `Диалог ${handle} теперь резолвится в другой ID (${chat.id}, ранее ${discovery.chat.id}).`,
      'Повторите find и подтвердите контакт заново.'
    );
  }

  assertConfirmation(confirm, handle, chat);

  const self = discovery?.self ?? (await client.me());
  const paths = chatPaths(slugifyChat(chat.username ?? handle));
  await ensureDir(paths.root);
  await ensureDir(paths.rawPagesDir);
  await ensureDir(paths.analysisDir);

  const approval: ApprovalRecord = {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    handle: normalizeHandle(handle),
    confirmedBy: confirm,
    confirmedAt: new Date().toISOString(),
    chat,
  };
  await writeJsonAtomic(paths.approval, approval);

  const peer = chat.username ? `@${chat.username}` : String(chat.id);
  console.error(`Экспорт ${chat.title} (${chat.id}) через ${peer}`);
  console.error(`Данные: ${paths.root}`);
  console.error('Медиа не скачиваются; сохраняются текст, подписи и метаданные.');

  const result = await exportHistory({
    client,
    peer,
    chat,
    selfId: self?.id ?? null,
    paths,
    pageSize: numberFlag(flags, 'page-size', 100),
    maxPages: numberFlag(flags, 'max-pages', 10_000),
    maxHeadPages: numberFlag(flags, 'max-head-pages', 50),
    maxMessages: numberFlag(flags, 'max-messages', 1_000_000),
    maxRetries: numberFlag(flags, 'max-retries', 5),
    latestVisible: () => client.latestVisibleMessage(peer),
    onProgress: (message) => console.error(message),
  });

  console.error('');
  console.error(
    `Готово: ${result.manifest.corpus.messageCount} сообщений, статус ${result.manifest.completeness.status}.`
  );
  console.error(`Корпус: ${paths.corpus}`);
  console.error(`Манифест: ${paths.manifest}`);
  if (result.manifest.completeness.status !== 'complete') {
    console.error('Внимание: полнота не подтверждена. Причины:');
    for (const reason of result.manifest.completeness.reasons) console.error(`  - ${reason}`);
  }

  printJson({
    chat: result.manifest.chat,
    messageCount: result.manifest.corpus.messageCount,
    completeness: result.manifest.completeness,
    manifest: paths.manifest,
    corpus: paths.corpus,
  });
  return result.manifest.completeness.status === 'complete' ? 0 : 2;
}

async function stats(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const paths = chatPaths(slugifyChat(handle));
  const messages = await loadCorpus(paths.corpus);
  const manifest = await readJson<Manifest>(paths.manifest);
  const report = computeAnalysis(
    messages,
    {
      timezone: stringFlag(flags, 'timezone') ?? process.env.TELEGRAM_RESEARCH_TIMEZONE ?? 'UTC',
      sessionGapSeconds: hoursFlag(flags, 'session-gap-hours', 6) * 3600,
      longPauseSeconds: daysFlag(flags, 'long-pause-days', 7) * 86_400,
      estimateWindowSeconds: hoursFlag(flags, 'estimate-window-hours', 6) * 3600,
    },
    { chat: manifest?.chat ?? fallbackChat(messages), manifest }
  );
  await ensureDir(paths.analysisDir);
  await writeJsonAtomic(paths.stats, report);

  console.error(`Статистика: ${paths.stats}`);
  console.error(`Сообщений: ${report.source.messageCount}`);
  console.error(
    `Период: ${report.source.firstMessageAt ?? '—'} — ${report.source.lastMessageAt ?? '—'}`
  );
  console.error(`Часовой пояс отображения: ${report.options.timezone}`);
  console.error(`Сессий: ${report.sessions.count} (порог ${report.options.sessionGapSeconds} с)`);
  console.error(
    `Прямых ответов: ${report.responses.directReplies.count}; оценочных: ${report.responses.estimatedReplies.count}`
  );

  if (flags['print'] === true) printJson(report);
  else {
    printJson({
      report: paths.stats,
      messageCount: report.source.messageCount,
      sessionCount: report.sessions.count,
      directReplies: report.responses.directReplies.count,
      estimatedReplies: report.responses.estimatedReplies.count,
      timezone: report.options.timezone,
      completeness: report.source.manifestCompleteness,
    });
  }
  return 0;
}

async function verify(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const paths = chatPaths(slugifyChat(handle));
  const report = await verifyCorpus(paths.corpus, paths.manifest);

  if (flags['deep'] === true) {
    const client = new TgClient({ account: stringFlag(flags, 'account') });
    const peer = report.manifest.chat.username
      ? `@${report.manifest.chat.username}`
      : String(report.manifest.chat.id);
    const latest = await client.latestVisibleMessage(peer);
    const max = report.manifest.corpus.lastMessage?.id ?? null;
    report.checks.push({
      name: 'live head check',
      ok: latest !== null && max !== null && latest.id <= max,
      detail:
        latest === null
          ? 'не удалось получить последнее видимое сообщение'
          : `latest=${latest.id}, exportedMax=${max ?? '—'}`,
    });
    report.ok = report.checks.every((check) => check.ok);
  }

  if (flags['print'] === true) printJson(report);
  else {
    printJson({
      ok: report.ok,
      messages: report.messages,
      completeness: report.manifest.completeness.status,
      checks: report.checks,
      manifest: paths.manifest,
    });
  }
  return report.ok ? 0 : 1;
}

async function plan(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const paths = chatPaths(slugifyChat(handle));
  const messages = await loadCorpus(paths.corpus);
  const config = deepSeekConfigFromEnv();
  const result = await createPlan(
    messages,
    paths.deepseekDir,
    {
      maxCharacters: numberFlag(flags, 'max-chars', DEFAULT_CHUNK_OPTIONS.maxCharacters),
      overlapMessages: numberFlag(flags, 'overlap', DEFAULT_CHUNK_OPTIONS.overlapMessages),
      budgetUsd: numberFlag(flags, 'budget-usd', config.budgetUsd),
      maxRequests: numberFlag(flags, 'max-requests', config.maxRequests),
      model: stringFlag(flags, 'model') ?? config.model,
    },
    flags['reset'] === true
  );

  printJson({
    plan: paths.deepseekDir,
    model: result.progress.model,
    chunks: result.chunks.length,
    targetMessages: result.chunks.reduce((sum, chunk) => sum + chunk.targetMessageIds.length, 0),
    contextMessages: result.chunks.reduce((sum, chunk) => sum + chunk.contextMessageIds.length, 0),
    approximateCharacters: result.chunks.reduce(
      (sum, chunk) => sum + chunk.approximateCharacters,
      0
    ),
    budgetUsd: result.progress.usage.budgetUsd,
    maxRequests: result.progress.usage.maxRequests,
    note: 'План не отправляет запросы в DeepSeek. Для запуска добавьте --run.',
  });
  return 0;
}

async function deepseek(flags: Record<string, string | boolean>): Promise<number> {
  const handle = handleFlag(flags);
  const paths = chatPaths(slugifyChat(handle));
  const baseConfig = deepSeekConfigFromEnv();
  const config = {
    ...baseConfig,
    model: stringFlag(flags, 'model') ?? baseConfig.model,
    budgetUsd: numberFlag(flags, 'budget-usd', baseConfig.budgetUsd),
    maxRequests: numberFlag(flags, 'max-requests', baseConfig.maxRequests),
  };
  const client = new DeepSeekClient(config);

  if (flags['probe'] === true) {
    const result = await client.probe();
    printJson({
      baseUrl: config.baseUrl,
      model: config.model,
      modelAvailable: result.modelAvailable,
      models: result.models,
    });
    return result.modelAvailable ? 0 : 2;
  }

  const messages = await loadCorpus(paths.corpus);
  const wantsRun = flags['run'] === true;
  const progress = await runDeepSeek({
    messages,
    directory: paths.deepseekDir,
    config,
    maxCharacters: numberFlag(flags, 'max-chars', DEFAULT_CHUNK_OPTIONS.maxCharacters),
    overlapMessages: numberFlag(flags, 'overlap', DEFAULT_CHUNK_OPTIONS.overlapMessages),
    retryFailed: flags['retry-failed'] === true,
    dryRun: !wantsRun,
    onProgress: (message) => console.error(message),
  });

  const failed = progress.entries.filter((entry) => entry.status === 'failed');
  printJson({
    directory: paths.deepseekDir,
    model: progress.model,
    status: progress.status,
    dryRun: !wantsRun,
    chunks: progress.chunks.length,
    completed: progress.entries.filter((entry) => entry.status === 'complete').length,
    failed: failed.map((entry) => ({
      stage: entry.stage,
      chunkIndex: entry.chunkIndex,
      attempts: entry.attempts,
      error: entry.error,
    })),
    usage: progress.usage,
    note: wantsRun
      ? undefined
      : 'Dry-run: запросы в DeepSeek не отправлялись. Для запуска добавьте --run.',
  });
  return progress.status === 'complete' ? 0 : wantsRun ? 2 : 0;
}

function parseArgs(argv: string[]): ParsedFlags {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) continue;
    const withoutPrefix = arg.slice(2);
    const equals = withoutPrefix.indexOf('=');
    if (equals >= 0) {
      flags[withoutPrefix.slice(0, equals)] = withoutPrefix.slice(equals + 1);
      continue;
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[withoutPrefix] = next;
      index += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }
  return { command, flags };
}

function handleFlag(flags: Record<string, string | boolean>): string {
  return stringFlag(flags, 'handle') ?? DEFAULT_HANDLE;
}

function stringFlag(flags: Record<string, string | boolean>, name: string): string | null {
  const value = flags[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberFlag(
  flags: Record<string, string | boolean>,
  name: string,
  fallback: number
): number {
  const raw = stringFlag(flags, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliUsageError(`Некорректное значение --${name}: ${raw}`);
  }
  return parsed;
}

function hoursFlag(
  flags: Record<string, string | boolean>,
  name: string,
  fallback: number
): number {
  const value = numberFlag(flags, name, fallback);
  if (value <= 0) throw new CliUsageError(`--${name} должен быть больше нуля`);
  return value;
}

function daysFlag(flags: Record<string, string | boolean>, name: string, fallback: number): number {
  return hoursFlag(flags, name, fallback) * 24;
}

async function loadCorpus(file: string): Promise<NormalizedMessage[]> {
  try {
    return parseJsonLines(await readFile(file, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new CliUsageError(
        `Корпус не найден: ${file}`,
        'Сначала выполните export после подтверждения диалога.'
      );
    }
    throw new CliUsageError(`Не удалось прочитать корпус ${file}: ${errorMessage(error)}`);
  }
}

function assertConfirmation(confirm: string, handle: string, chat: ChatIdentity): void {
  const normalized = normalizeHandle(confirm);
  const accepted = new Set([
    normalizeHandle(handle),
    normalizeHandle(chat.username ?? ''),
    String(chat.id),
  ]);
  if (!accepted.has(normalized)) {
    throw new CliUsageError(
      `--confirm ${confirm} не совпадает с найденным диалогом (${chat.username ? `@${chat.username}` : chat.title}, ID ${chat.id}).`,
      'Экспорт не запущен. Сверьте метаданные и подтвердите точный ID или @username.'
    );
  }
}

function fallbackChat(messages: NormalizedMessage[]): ChatIdentity {
  return {
    id: messages[0]?.chatId ?? 0,
    type: 'unknown',
    title: 'unknown',
    username: null,
    source: 'unknown',
    fetchedAt: new Date().toISOString(),
  };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(
    [
      'Telegram Research (локальный контур)',
      '',
      'Команды:',
      '  auth-status',
      '  find    --handle @Vorobievaya [--account <id>]',
      '  export  --handle @Vorobievaya --confirm <ID|@username>',
      '  stats   --handle @Vorobievaya [--timezone Europe/Moscow] [--session-gap-hours 6]',
      '  verify  --handle @Vorobievaya [--deep]',
      '  plan    --handle @Vorobievaya [--max-chars 60000] [--overlap 20] [--reset]',
      '  deepseek --handle @Vorobievaya [--probe | --run] [--retry-failed]',
      '',
      'Переменные окружения:',
      '  TG_BIN, TG_ACCOUNT, TELEGRAM_RESEARCH_DATA_DIR, TELEGRAM_RESEARCH_CHAT',
      '  DEEPSEEK_API_KEY (только для --run/--probe), DEEPSEEK_MODEL, DEEPSEEK_BUDGET_USD',
      '',
      'Авторизация Telegram выполняется вручную через tg auth login; см. docs/telegram-research.md.',
    ].join('\n')
  );
}

class CliUsageError extends Error {
  readonly hint: string | null;

  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = 'CliUsageError';
    this.hint = hint;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      if (error.hint) console.error(error.hint);
      process.exitCode = 3;
      return;
    }
    if (error instanceof TgCliError) {
      console.error(`${error.code ?? 'TG_ERROR'}: ${error.message}`);
      if (error.suggestion) console.error(`Подсказка: ${error.suggestion}`);
      process.exitCode = error.exitCode ?? 1;
      return;
    }
    if (error instanceof DeepSeekError) {
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(`Ошибка: ${errorMessage(error)}`);
    process.exitCode = 1;
  });

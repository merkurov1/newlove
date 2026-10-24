import { spawn } from 'node:child_process';
import { asArray, asNumber, asRecord, asString } from './util';

export interface TgErrorDetails {
  code: string | null;
  message: string;
  waitSeconds: number | null;
  exitCode: number | null;
  details: Record<string, unknown> | null;
  suggestion: string | null;
}

export class TgCliError extends Error {
  readonly code: string | null;
  readonly waitSeconds: number | null;
  readonly exitCode: number | null;
  readonly details: Record<string, unknown> | null;
  readonly suggestion: string | null;

  constructor(details: TgErrorDetails) {
    super(details.message);
    this.name = 'TgCliError';
    this.code = details.code;
    this.waitSeconds = details.waitSeconds;
    this.exitCode = details.exitCode;
    this.details = details.details;
    this.suggestion = details.suggestion;
  }

  get retryable(): boolean {
    if (this.code === 'RATE_LIMITED') return true;
    if (this.code === 'NETWORK_ERROR') return true;
    if (this.code === 'TELEGRAM_ERROR') return true;
    return false;
  }
}

export interface TgRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TgHistoryResponse {
  messages: unknown[];
  users: unknown[];
  chats: unknown[];
  count: number | null;
  raw: unknown;
}

export interface AuthStatus {
  authenticated: boolean;
  message: string | null;
  account: Record<string, unknown> | null;
}

export interface FindChatResult {
  id: number;
  type: string;
  title: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isBot: boolean;
  isPremium: boolean;
  isContact: boolean;
  lastMessageAt: number | null;
  source: 'api' | 'cache';
  fetchedAt: string;
}

export interface LatestVisibleMessage {
  id: number;
  checkedAt: string;
}

export interface TgClientOptions {
  bin?: string;
  account?: string | null;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Thin wrapper around the official `tg` CLI. It never writes credentials to
 * disk or logs: authentication lives in telegram-sync-cli's own data dir.
 */
export class TgClient {
  private readonly bin: string;
  private readonly account: string | null;
  private readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: TgClientOptions = {}) {
    this.bin = options.bin ?? process.env.TG_BIN ?? 'tg';
    this.account = options.account ?? process.env.TG_ACCOUNT ?? null;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.env = options.env ?? process.env;
  }

  private accountArgs(): string[] {
    return this.account ? [`--account=${this.account}`] : [];
  }

  async run(args: string[]): Promise<TgRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(
          new TgCliError({
            code: 'TIMEOUT',
            message: `tg не ответил за ${Math.round(this.timeoutMs / 1000)} с`,
            waitSeconds: null,
            exitCode: null,
            details: { args: redactArgs(args) },
            suggestion: 'Проверьте сеть и повторите команду.',
          })
        );
      }, this.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const code = (error as NodeJS.ErrnoException).code;
        reject(
          new TgCliError({
            code: 'TG_NOT_INSTALLED',
            message:
              code === 'ENOENT'
                ? `Команда ${this.bin} не найдена. Установите telegram-sync-cli (см. docs/telegram-research.md).`
                : `Не удалось запустить tg: ${error.message}`,
            waitSeconds: null,
            exitCode: null,
            details: { bin: this.bin },
            suggestion: null,
          })
        );
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
    });
  }

  private async runJson(args: string[]): Promise<unknown> {
    const result = await this.run(args);
    if (result.exitCode !== 0) {
      throw parseTgError(result);
    }
    return parseJsonOutput(result.stdout);
  }

  async version(): Promise<string> {
    const result = await this.run(['--version']);
    if (result.exitCode !== 0) throw parseTgError(result);
    return result.stdout.trim();
  }

  async authStatus(): Promise<AuthStatus> {
    const output = asRecord(await this.runJson(['auth', 'status', '--format=json']));
    const data = asRecord(output?.data);
    return {
      authenticated: data?.authenticated === true,
      message: asString(data?.message),
      account: asRecord(data?.account),
    };
  }

  async requireAuth(): Promise<AuthStatus> {
    const status = await this.authStatus();
    if (!status.authenticated) {
      throw new TgCliError({
        code: 'AUTH_REQUIRED',
        message:
          'Telegram не авторизован. Выполните ручной вход: см. docs/telegram-research.md, раздел «Авторизация».',
        waitSeconds: null,
        exitCode: 2,
        details: { status: status.message },
        suggestion: 'tg auth login --phone +<ваш номер>',
      });
    }
    return status;
  }

  /** Resolve a dialog by @username and return user + chat metadata. */
  async findChat(handle: string): Promise<FindChatResult> {
    await this.requireAuth();
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    const account = this.accountArgs();

    const chatResult = await settle(
      this.runJson(['chats', 'get', `--id=${normalized}`, '--fresh', '--format=json', ...account])
    );
    const userResult = await settle(
      this.runJson(['user', normalized, '--fresh', '--format=json', ...account])
    );
    const chatData =
      chatResult.status === 'fulfilled' ? asRecord(asRecord(chatResult.value)?.data) : null;
    const userData =
      userResult.status === 'fulfilled'
        ? asRecord(asRecord(asRecord(userResult.value)?.data)?.user)
        : null;

    if (!chatData && !userData) {
      const errors = [chatResult, userResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        );
      throw new TgCliError({
        code: 'TELEGRAM_ERROR',
        message: `Не удалось найти диалог ${normalized}: ${errors.join('; ')}`,
        waitSeconds: null,
        exitCode: 5,
        details: { handle: normalized },
        suggestion: 'Проверьте username и авторизацию: tg auth status.',
      });
    }

    const chatId = asNumber(chatData?.id) ?? asNumber(userData?.id);
    if (chatId === null) {
      throw new TgCliError({
        code: 'TELEGRAM_ERROR',
        message: `Telegram не вернул ID для ${normalized}`,
        waitSeconds: null,
        exitCode: 5,
        details: { handle: normalized },
        suggestion: null,
      });
    }

    const firstName = asString(userData?.firstName);
    const lastName = asString(userData?.lastName);
    const titleFromUser = [firstName, lastName].filter(Boolean).join(' ').trim();

    return {
      id: chatId,
      type: asString(chatData?.type) ?? 'private',
      title: asString(chatData?.title) ?? titleFromUser ?? normalized,
      username: asString(chatData?.username) ?? asString(userData?.username),
      firstName,
      lastName,
      isBot: userData?.isBot === true,
      isPremium: userData?.isPremium === true,
      isContact: userData?.isContact === true,
      lastMessageAt: asNumber(chatData?.lastMessageAt),
      source: asString(chatData?.source) === 'cache' ? 'cache' : 'api',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * One history page, newest first. The high-level `messages list` command is
   * used because `tg api messages.getHistory` requires an MTProto peer object
   * and rejects a plain @username. `messages list --fresh` fetches the page
   * and stores the original raw message JSON in the local cache; we read that
   * JSON through the read-only `tg sql` interface so no media is downloaded
   * and the original Telegram fields (media metadata, reply/forward, edits)
   * remain available to the normalizer.
   */
  async historyPage(peer: string, offsetId: number, limit = 100): Promise<TgHistoryResponse> {
    const args = [
      'messages',
      'list',
      `--chat=${peer}`,
      `--limit=${limit}`,
      '--fresh',
      '--format=json',
      ...this.accountArgs(),
    ];

    if (offsetId > 0) {
      args.push(`--before=${offsetId}`);
    }

    const output = asRecord(await this.runJson(args));
    const data = asRecord(output?.data);
    const items = asArray(data?.items)
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null);

    const chatId = asNumber(data?.chatId) ?? asNumber(items[0]?.chatId);

    if (chatId === null) {
      throw new TgCliError({
        code: 'INVALID_RESPONSE',
        message: 'messages list не вернул chatId',
        waitSeconds: null,
        exitCode: 1,
        details: { keys: data ? Object.keys(data).slice(0, 20) : [] },
        suggestion: 'Проверьте формат `tg messages list --format=json`.',
      });
    }

    const messageIds = [
      ...new Set(
        items
          .map((item) => asNumber(item.messageId))
          .filter((id): id is number => id !== null && Number.isSafeInteger(id) && id > 0)
      ),
    ];

    const rawById = new Map<number, Record<string, unknown>>();

    if (messageIds.length > 0) {
      const query =
        `SELECT message_id, raw_json FROM messages_cache ` +
        `WHERE chat_id = ${chatId} AND message_id IN (${messageIds.join(', ')})`;

      const sqlOutput = asRecord(
        await this.runJson(['sql', '--query', query, '--output=json', ...this.accountArgs()])
      );
      const rows = asArray(asRecord(sqlOutput?.data)?.rows);

      for (const rowRaw of rows) {
        const row = asRecord(rowRaw);
        const id = asNumber(row?.message_id);
        const raw = parseRawJson(asString(row?.raw_json));
        if (id !== null && raw) rawById.set(id, raw);
      }
    }

    const messages: Record<string, unknown>[] = [];

    for (const item of items) {
      const id = asNumber(item.messageId);
      if (id === null) continue;
      const raw = rawById.get(id) ?? highLevelItemToRaw(item);
      if (raw) messages.push(raw);
    }

    const users = collectUsers(items);
    const chats = collectChats(items);
    const payload = {
      ...(data ?? {}),
      messages,
      users,
      chats,
      count: asNumber(data?.count) ?? items.length,
      source: 'messages.list+raw_json',
    };

    return {
      messages,
      users,
      chats,
      count: asNumber(data?.count),
      raw: payload,
    };
  }

  /**
   * Newest visible message via the high-level command. This both caches the
   * page and gives a second, independent completeness check.
   */
  async latestVisibleMessage(peer: string): Promise<LatestVisibleMessage | null> {
    try {
      const output = asRecord(
        await this.runJson([
          'messages',
          'list',
          `--chat=${peer}`,
          '--limit=1',
          '--fresh',
          '--format=json',
          ...this.accountArgs(),
        ])
      );
      const data = asRecord(output?.data);
      const item = asRecord(asArray(data?.items)[0]);
      const id = asNumber(item?.messageId);
      return id === null ? null : { id, checkedAt: new Date().toISOString() };
    } catch {
      return null;
    }
  }

  async me(): Promise<{ id: number; username: string | null; displayName: string | null } | null> {
    try {
      const output = asRecord(await this.runJson(['me', '--format=json', ...this.accountArgs()]));
      const data = asRecord(output?.data);
      const user = asRecord(data?.user) ?? data;
      const id = asNumber(user?.id);
      if (id === null) return null;
      const firstName = asString(user?.firstName);
      const lastName = asString(user?.lastName);
      return {
        id,
        username: asString(user?.username),
        displayName: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
      };
    } catch {
      return null;
    }
  }
}

async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

function parseRawJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

/**
 * Fallback for the rare case when a message is present in the high-level page
 * but its raw_json row is not available. The full raw JSON is preferred.
 */
function highLevelItemToRaw(item: Record<string, unknown>): Record<string, unknown> | null {
  const id = asNumber(item.messageId);
  const date = asNumber(item.date);

  if (id === null || id <= 0 || date === null) return null;

  const raw: Record<string, unknown> = {
    _: item.messageType === 'service' ? 'messageService' : 'message',
    id,
    date,
    message: asString(item.text) ?? '',
    out: item.isOutgoing === true,
  };

  const fromId = asNumber(item.fromId);
  if (fromId !== null) raw.fromId = { _: 'peerUser', userId: fromId };

  const replyToId = asNumber(item.replyToId);
  if (replyToId !== null && replyToId > 0) raw.replyTo = { replyToMsgId: replyToId };

  const forwardFromId = asNumber(item.forwardFromId);
  if (forwardFromId !== null && forwardFromId > 0) {
    raw.fwdFrom = { fromId: { _: 'peerUser', userId: forwardFromId } };
  }

  const editDate = asNumber(item.editDate);
  if (editDate !== null && editDate > 0) raw.editDate = editDate;

  if (item.hasMedia === true) {
    raw.media = { _: 'messageMediaUnsupported', messageType: item.messageType ?? null };
  }

  if (item.isDeleted === true) raw.isDeleted = true;

  return raw;
}

function collectUsers(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const users = new Map<number, Record<string, unknown>>();

  for (const item of items) {
    const sender = asRecord(item.sender);
    const id = asNumber(sender?.id);
    if (id === null) continue;

    users.set(id, {
      _: 'user',
      id,
      username: asString(sender?.username),
      firstName: asString(sender?.firstName),
      lastName: asString(sender?.lastName),
    });
  }

  return [...users.values()];
}

function collectChats(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const chats = new Map<number, Record<string, unknown>>();

  for (const item of items) {
    const chat = asRecord(item.chat);
    const id = asNumber(chat?.id);
    const type = asString(chat?.type);

    if (id === null || type === null) continue;

    const absoluteId = Math.abs(id);

    if (type === 'group') {
      chats.set(absoluteId, {
        _: 'chat',
        id: absoluteId,
        title: asString(chat?.title),
        username: asString(chat?.username),
      });
    } else if (type === 'supergroup' || type === 'channel') {
      chats.set(absoluteId, {
        _: 'channel',
        id: absoluteId,
        title: asString(chat?.title),
        username: asString(chat?.username),
      });
    }
  }

  return [...chats.values()];
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new TgCliError({
      code: 'EMPTY_RESPONSE',
      message: 'tg вернул пустой ответ',
      waitSeconds: null,
      exitCode: 1,
      details: null,
      suggestion: null,
    });
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Some commands print an info line before JSON; take the last object.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        // Fall through to the typed error below.
      }
    }
    throw new TgCliError({
      code: 'INVALID_RESPONSE',
      message: 'tg вернул не-JSON ответ',
      waitSeconds: null,
      exitCode: 1,
      details: { preview: sanitizePreview(trimmed) },
      suggestion: 'Запустите команду с --format=json.',
    });
  }
}

function sanitizePreview(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key["'\s:=]+)[^\s"']+/gi, '$1[REDACTED]')
    .slice(0, 500);
}

/** Parse telegram-sync-cli's stable JSON error shape from stderr. */
export function parseTgError(result: TgRunResult): TgCliError {
  const candidates = [result.stderr, result.stdout];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = asRecord(JSON.parse(trimmed.slice(start, end + 1)));
      const error = asRecord(parsed?.error);
      if (!error) continue;
      const message = asString(error.message) ?? 'Неизвестная ошибка tg';
      const waitFromMessage = /FLOOD_WAIT_(\d+)/.exec(message)?.[1];
      const details = asRecord(error.details);
      return new TgCliError({
        code: asString(error.code),
        message,
        waitSeconds:
          asNumber(details?.wait_seconds) ?? (waitFromMessage ? Number(waitFromMessage) : null),
        exitCode: result.exitCode,
        details,
        suggestion: asString(error.suggestion),
      });
    } catch {
      // Try the next candidate.
    }
  }

  return new TgCliError({
    code: null,
    message: sanitizePreview(
      result.stderr.trim() || result.stdout.trim() || `tg завершился с кодом ${result.exitCode}`
    ),
    waitSeconds: null,
    exitCode: result.exitCode,
    details: null,
    suggestion: null,
  });
}

function redactArgs(args: string[]): string[] {
  return args.map((arg) =>
    /token|key|hash|password/i.test(arg) ? arg.replace(/=.*/, '=[REDACTED]') : arg
  );
}

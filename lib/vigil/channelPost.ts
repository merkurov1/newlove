import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/vigil/channelPost');

const FALLBACK_SITE_URL = 'https://www.merkurov.love';
const DEFAULT_TEMPLE_CHANNEL_ID = '@heartandangel';
const REQUEST_TIMEOUT_MS = 8_000;

export const VIGIL_CHANNEL_MESSAGE = 'Зажгли ещё одно сердечко. ❤️';
export const VIGIL_CHANNEL_LINK_LABEL = 'Открыть храм';
export const VIGIL_CHANNEL_PATH = '/temple';

export type VigilChannelPostResult =
  | { ok: true; messageId: number; chatId: number }
  | { ok: false; reason: 'not_configured' | 'request_failed' };

type TelegramSendResponse = {
  ok?: boolean;
  description?: unknown;
  result?: {
    message_id?: unknown;
    chat?: { id?: unknown };
  };
};

export type VigilChannelPostDeps = {
  fetch?: typeof fetch;
  token?: string;
  channelId?: string;
  siteUrl?: string;
  timeoutMs?: number;
};

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveSiteUrl(explicit?: string): string {
  const candidate = (
    explicit ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    FALLBACK_SITE_URL
  ).trim();

  try {
    const url = new URL(candidate);

    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    // Fall through to the canonical public site.
  }

  return FALLBACK_SITE_URL;
}

function readTempleBotToken(): string {
  return (process.env.TEMPLE_BOT_TOKEN || '').trim();
}

function readTempleChannelId(): string {
  return (
    process.env.TEMPLE_CHANNEL_ID ||
    process.env.HEART_AND_ANGEL_CHANNEL_ID ||
    DEFAULT_TEMPLE_CHANNEL_ID
  ).trim();
}

export function getVigilChannelDestination(siteUrl?: string): string {
  return `${resolveSiteUrl(siteUrl)}${VIGIL_CHANNEL_PATH}`;
}

export function buildVigilChannelPost(siteUrl?: string): string {
  const destination = getVigilChannelDestination(siteUrl);

  return [
    VIGIL_CHANNEL_MESSAGE,
    '',
    `<a href="${escapeHtmlAttribute(destination)}">${VIGIL_CHANNEL_LINK_LABEL}</a>`,
  ].join('\n');
}

/**
 * Publishes exactly one anonymous post to the Heart & Angel channel through the
 * existing Temple bot. Identity, intention and supporter counts are never
 * accepted or included. A missing configuration or a Telegram failure must
 * never change the outcome of the Vigil itself.
 */
export async function publishVigilChannelPost(
  deps: VigilChannelPostDeps = {}
): Promise<VigilChannelPostResult> {
  const token = deps.token ?? readTempleBotToken();
  const channelId = deps.channelId ?? readTempleChannelId();

  if (!token || !channelId) {
    console.warn('[vigil] Channel post skipped: Temple bot token or channel is not configured.');
    return { ok: false, reason: 'not_configured' };
  }

  const fetcher = deps.fetch ?? fetch;

  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: buildVigilChannelPost(deps.siteUrl),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });

    const result = (await response.json().catch(() => null)) as TelegramSendResponse | null;

    if (!response.ok || result?.ok !== true || !result.result) {
      console.warn('[vigil] Channel post failed:', {
        status: response.status,
        description: result?.description ?? 'Unknown Telegram API error',
      });
      return { ok: false, reason: 'request_failed' };
    }

    return {
      ok: true,
      messageId: Number(result.result.message_id),
      chatId: Number(result.result.chat?.id ?? 0),
    };
  } catch {
    // Never log the request URL: it contains the bot token.
    console.warn('[vigil] Channel post failed: request error');
    return { ok: false, reason: 'request_failed' };
  }
}

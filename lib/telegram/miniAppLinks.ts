/**
 * Build a Telegram Mini App deep link for a first-party Flow route.
 *
 * The bot username is deployment configuration, never guessed from a channel
 * name. When it is absent (or the path is not on the Mini App allowlist) the
 * caller keeps the canonical web URL, so publishing still works.
 */

import { buildTelegramStartParam } from './miniAppRoutes';

const BOT_USERNAME = /^[a-z][a-z0-9_]{3,31}$/i;

type MiniAppEnv = {
  TELEGRAM_MINI_APP_BOT_USERNAME?: string;
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?: string;
};

export function telegramMiniAppBotUsername(
  env: MiniAppEnv = process.env as MiniAppEnv
): string | null {
  const raw =
    env.TELEGRAM_MINI_APP_BOT_USERNAME ||
    env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    '';
  const username = raw.trim().replace(/^@/, '');

  return BOT_USERNAME.test(username) ? username : null;
}

export function buildTelegramMiniAppUrl(
  path: string,
  botUsername: string | null | undefined = telegramMiniAppBotUsername()
): string | null {
  const username = (botUsername ?? '').trim().replace(/^@/, '');

  if (!BOT_USERNAME.test(username)) return null;

  const startParam = buildTelegramStartParam(path);
  if (!startParam) return null;

  return `https://t.me/${username}?startapp=${encodeURIComponent(startParam)}`;
}

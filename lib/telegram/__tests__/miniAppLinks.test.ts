/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildTelegramMiniAppUrl,
  telegramMiniAppBotUsername,
} from '../miniAppLinks';
import { resolveTelegramStartParam } from '../miniAppRoutes';

describe('Telegram Mini App links', () => {
  it('builds an allowlisted startapp link for a Flow publication', () => {
    const url = buildTelegramMiniAppUrl('/flow/structural-integrity', 'PierrotAi_bot');

    expect(url).toMatch(/^https:\/\/t\.me\/PierrotAi_bot\?startapp=/);

    const param = decodeURIComponent(new URL(url!).searchParams.get('startapp') ?? '');
    expect(resolveTelegramStartParam(param)).toBe('/flow/structural-integrity');
  });

  it('accepts a leading @ in configuration', () => {
    expect(buildTelegramMiniAppUrl('/flow', '@PierrotAi_bot')).toBe(
      'https://t.me/PierrotAi_bot?startapp=flow'
    );
  });

  it('never guesses a bot username or an unsafe route', () => {
    expect(buildTelegramMiniAppUrl('/flow', null)).toBeNull();
    expect(buildTelegramMiniAppUrl('/admin', 'PierrotAi_bot')).toBeNull();
    expect(buildTelegramMiniAppUrl('/flow', 'not a username')).toBeNull();
    expect(telegramMiniAppBotUsername({})).toBeNull();
  });

  it('reads the deployment configuration', () => {
    expect(
      telegramMiniAppBotUsername({
        TELEGRAM_MINI_APP_BOT_USERNAME: ' PierrotAi_bot ',
      } as NodeJS.ProcessEnv)
    ).toBe('PierrotAi_bot');
    expect(
      telegramMiniAppBotUsername({
        NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: '@PierrotAi_bot',
      } as NodeJS.ProcessEnv)
    ).toBe('PierrotAi_bot');
  });
});

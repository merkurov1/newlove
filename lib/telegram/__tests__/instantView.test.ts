/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildTelegramInstantViewUrl,
  normalizeFlowInstantViewPageUrl,
  telegramInstantViewTemplateHash,
} from '../instantView';

const CANONICAL = 'https://www.merkurov.love/flow/test-slug';
const HASH = '22e613409c3e034789';

describe('Telegram Instant View URLs', () => {
  it('builds the supported t.me/iv wrapper only with a verified hash', () => {
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toBe(`https://t.me/iv?url=${encodeURIComponent(CANONICAL)}&rhash=${HASH}`);
  });

  it('accepts the legacy environment alias', () => {
    expect(telegramInstantViewTemplateHash({ TELEGRAM_INSTANT_VIEW_HASH: HASH })).toBe(HASH);
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_HASH: HASH,
      })
    ).toContain(`rhash=${HASH}`);
  });

  it('trims surrounding whitespace from configuration', () => {
    expect(
      telegramInstantViewTemplateHash({
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: `  ${HASH}  `,
      })
    ).toBe(HASH);
  });

  it.each([
    undefined,
    '',
    '   ',
    'not-a-hash',
    'template-hash',
    '<real editor hash>',
    '1234567',
    `${HASH}?url=https://evil.example`,
  ])('never invents a hash for %p', (value) => {
    expect(
      telegramInstantViewTemplateHash({
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: value as string | undefined,
      })
    ).toBeNull();
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: value as string | undefined,
      })
    ).toBeNull();
  });

  it('supports the non-www canonical host and unicode slugs', () => {
    const unicode = 'https://merkurov.love/flow/%D1%84%D0%BE%D1%82%D0%BE-o43hd';

    expect(normalizeFlowInstantViewPageUrl(unicode)).toBe(unicode);
    expect(
      buildTelegramInstantViewUrl(unicode, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toContain(encodeURIComponent(unicode));
  });

  it.each([
    'https://www.merkurov.love/flow',
    'https://www.merkurov.love/flow/',
    'https://www.merkurov.love/flow/rss',
    'https://www.merkurov.love/flow/test-slug/extra',
    'https://www.merkurov.love/journal/test-slug',
    'https://www.merkurov.love/admin/flow/test-slug',
    'https://evil.example/flow/test-slug',
    'https://merkurov.love.evil.example/flow/test-slug',
    'http://www.merkurov.love/flow/test-slug',
    'javascript:alert(1)',
    'not a url',
  ])('rejects non-public or non-canonical page URL %p', (url) => {
    expect(normalizeFlowInstantViewPageUrl(url)).toBeNull();
    expect(
      buildTelegramInstantViewUrl(url, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toBeNull();
  });
});

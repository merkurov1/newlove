/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  buildShareText,
  buildTelegramShareDeepLink,
  isSafeStoryMediaUrl,
  performShare,
  planShareFallbacks,
  planStoryShare,
} from '../share';

const request = {
  kind: 'flow' as const,
  title: 'Structural Integrity',
  url: 'https://www.merkurov.love/flow/structural-integrity',
  excerpt: 'A note on what holds.',
  imageUrl: 'https://cdn.example.com/card.png',
};

beforeEach(() => {
  delete (navigator as unknown as { share?: unknown }).share;
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

describe('share planning', () => {
  it('builds concise dignified text without user data', () => {
    const text = buildShareText(request);

    expect(text).toContain('Structural Integrity');
    expect(text).toContain('A note on what holds.');
    expect(text).not.toMatch(/telegram_user|@/);
  });

  it('refuses non-https story media', () => {
    expect(isSafeStoryMediaUrl('http://cdn.example.com/card.png')).toBe(false);
    expect(planStoryShare({ ...request, imageUrl: 'javascript:alert(1)' })).toEqual({
      supported: false,
      reason: 'invalid-media',
    });
    expect(planStoryShare({ ...request, imageUrl: null })).toEqual({
      supported: false,
      reason: 'no-media',
    });
  });

  it('orders fallbacks and rejects unsafe deep links', () => {
    expect(
      planShareFallbacks({
        telegramDeepLink: 'https://t.me/share/url?url=https%3A%2F%2Fexample.com',
        navigatorShare: true,
      })
    ).toEqual(['telegram-link', 'navigator-share', 'copy']);

    expect(
      planShareFallbacks({ telegramDeepLink: 'javascript:alert(1)', navigatorShare: false })
    ).toEqual(['copy']);
    expect(buildTelegramShareDeepLink('javascript:alert(1)')).toBeNull();
  });
});

describe('performShare', () => {
  it('uses shareToStory only when the caller explicitly asks for a story', async () => {
    const shareToStory = jest.fn();
    const openTelegramLink = jest.fn();

    // The default share must not hijack the reader into the story editor.
    const normal = await performShare({
      request,
      storyApi: { shareToStory },
      openTelegramLink,
      storyMode: 'off',
    });

    expect(normal).toBe('telegram-link');
    expect(shareToStory).not.toHaveBeenCalled();

    const outcome = await performShare({
      request,
      storyApi: { shareToStory },
      storyMode: 'auto',
    });

    expect(outcome).toBe('story');
    expect(shareToStory).toHaveBeenCalledWith(
      request.imageUrl,
      expect.objectContaining({
        widget_link: expect.objectContaining({ url: request.url }),
      })
    );
  });

  it('story-only never falls through to a different share destination', async () => {
    const openTelegramLink = jest.fn();
    const copy = jest.fn(async () => undefined);

    const outcome = await performShare({
      request,
      storyMode: 'only',
      openTelegramLink,
      copy,
    });

    expect(outcome).toBe('failed');
    expect(openTelegramLink).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it('falls back when story sharing throws, without blocking the flow', async () => {
    const outcome = await performShare({
      request,
      storyMode: 'auto',
      storyApi: {
        shareToStory: () => {
          throw new Error('story unavailable');
        },
      },
      copy: async () => undefined,
    });

    // A thrown story share is treated as a dismissal, never as a hard failure
    // that could interrupt ritual completion.
    expect(outcome).toBe('dismissed');
  });

  it('requires a server-prepared id for shareMessage', async () => {
    const shareMessage = jest.fn();
    const prepareMessage = jest.fn(async () => null);
    const copy = jest.fn(async () => undefined);

    const outcome = await performShare({
      request,
      messageApi: { shareMessage },
      prepareMessage,
      copy,
    });

    expect(outcome).toBe('copied');
    expect(shareMessage).not.toHaveBeenCalled();
    expect(copy).toHaveBeenCalledWith(request.url);
  });

  it('passes a real prepared id to shareMessage when the server returns one', async () => {
    const shareMessage = jest.fn();

    const outcome = await performShare({
      request,
      messageApi: { shareMessage },
      prepareMessage: async () => 'prepared-real-id',
    });

    expect(outcome).toBe('message');
    expect(shareMessage).toHaveBeenCalledWith('prepared-real-id');
  });

  it('falls back to a Telegram deep link, then copy, in an ordinary browser', async () => {
    const openTelegramLink = jest.fn();
    const copy = jest.fn(async () => undefined);

    const linked = await performShare({ request, openTelegramLink, copy });
    expect(linked).toBe('telegram-link');
    expect(openTelegramLink).toHaveBeenCalledWith(
      expect.stringContaining('https://t.me/share/url?')
    );

    const copied = await performShare({ request, copy });
    expect(copied).toBe('copied');
  });

  it('does not throw when every share mechanism is unavailable', async () => {
    const outcome = await performShare({ request });

    expect(outcome).toBe('failed');
  });
});

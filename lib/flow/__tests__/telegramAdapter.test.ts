/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { normalizeFlowItem } from '../content';
import {
  publishTelegramContent,
  splitTelegramHtml,
} from '../telegram';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

type FetchCall = {
  url: string;
  body: Record<string, any>;
};

function installFetch(
  handler: (call: FetchCall) => { ok: boolean; result?: any; description?: string; error_code?: number }
) {
  const calls: FetchCall[] = [];

  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    calls.push(call);

    const response = handler(call);

    return {
      ok: response.ok,
      status: response.ok ? 200 : 400,
      json: async () => ({
        ok: response.ok,
        result: response.result,
        description: response.description,
        error_code: response.error_code,
      }),
    } as unknown as Response;
  }) as never;

  return calls;
}

function success(messageId: number) {
  return {
    ok: true,
    result: { message_id: messageId, chat: { id: -1001 } },
  };
}

function content(overrides: Record<string, unknown> = {}) {
  return normalizeFlowItem({
    id: 'item-1',
    slug: 'telegram-test',
    title: 'Telegram test',
    body_md: 'Short body.',
    type: 'note',
    lang: 'ru',
    metadata: {},
    published_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T10:00:00.000Z',
    ...overrides,
  } as any);
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.PIERROT_BOT_TOKEN = 'test-bot';
  process.env.TELEGRAM_CHANNEL_ID = '@test-channel';
  delete process.env.OSIRIS_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('Telegram HTML chunking', () => {
  it('splits long text into balanced chunks without losing content', () => {
    const sentence = 'Память становится инфраструктурой, когда внимание превращается в протокол. ';
    const html = `<b>${sentence.repeat(150)}</b>`;
    const chunks = splitTelegramHtml(html, 3900);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 3900)).toBe(true);
    expect(chunks.every((chunk) => (chunk.match(/<b>/g) ?? []).length === (chunk.match(/<\/b>/g) ?? []).length)).toBe(true);

    const joined = chunks.join(' ');
    expect(joined).toContain('Память становится инфраструктурой');
    expect(joined).toContain('протокол.');
  });

  it('never splits a link destination or an HTML entity', () => {
    const url = 'https://example.com/article?utm_source=flow&utm_campaign=long-name&x=1';
    const html = `${'Слово '.repeat(900)}<a href="${url}">ссылка &amp; подпись</a>`;
    const chunks = splitTelegramHtml(html, 1200);
    const joined = chunks.join('');

    expect(joined).toContain(url);
    expect(joined).toContain('&amp;');
    expect(joined).not.toContain('&am\np;');
    expect(chunks.every((chunk) => chunk.length <= 1250)).toBe(true);
  });

  it('preserves Cyrillic and emoji graphemes', () => {
    const html = `<i>${'🙂 слово '.repeat(800)}</i>`;
    const chunks = splitTelegramHtml(html, 500);
    const joined = chunks.join('');

    expect(joined).toContain('🙂');
    expect(joined).toContain('слово');
    expect((joined.match(/🙂/g) ?? []).length).toBe(800);
  });
});

describe('Telegram publisher', () => {
  it('sends long text as sequential full messages, not a caption slice', async () => {
    const body = `${'Длинный текст про память и сети. '.repeat(300)}КОНЕЦ`;
    const calls = installFetch((call) =>
      call.url.includes('/sendMessage')
        ? success(callsIndex(call))
        : { ok: false, description: 'unexpected endpoint' }
    );

    const result = await publishTelegramContent(content({ body_md: body }));

    expect(result.ok).toBe(true);
    expect(result.textPartsSent).toBeGreaterThan(1);
    expect(calls.every((call) => call.url.includes('/sendMessage'))).toBe(true);
    expect(calls.every((call) => call.body.text.length <= 4096)).toBe(true);
    expect(calls.map((call) => call.body.text).join(' ')).toContain('КОНЕЦ');
    expect(calls.map((call) => call.body.text).join(' ')).toContain('Длинный текст');
  });

  it('splits more than ten images into logical albums and keeps all of them', async () => {
    const metadata = {
      images: Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`),
    };
    const calls = installFetch((call) => {
      if (call.url.includes('/sendMediaGroup')) {
        return {
          ok: true,
          result: call.body.media.map((_: unknown, index: number) => ({
            message_id: 100 + index,
            chat: { id: -1001 },
          })),
        };
      }
      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(content({ metadata }));

    const groups = calls.filter((call) => call.url.includes('/sendMediaGroup'));
    expect(groups).toHaveLength(2);
    expect(groups[0].body.media).toHaveLength(10);
    expect(groups[1].body.media).toHaveLength(2);
    expect(groups[0].body.media[0].caption).toContain('Short body.');
    expect(groups[1].body.media[0].caption).toBeUndefined();
    expect(result.sentImageUrls).toHaveLength(12);
    expect(result.failedImages).toBe(0);
  });

  it('falls back to individual photos when an album fails', async () => {
    const metadata = {
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    };
    const calls = installFetch((call) => {
      if (call.url.includes('/sendMediaGroup')) {
        return { ok: false, description: 'wrong file identifier' };
      }

      if (call.url.includes('/sendPhoto')) {
        return call.body.photo.endsWith('1.jpg')
          ? { ok: false, description: 'image unavailable' }
          : success(51);
      }

      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(content({ metadata }));

    expect(calls.some((call) => call.url.includes('/sendMediaGroup'))).toBe(true);
    expect(calls.filter((call) => call.url.includes('/sendPhoto'))).toHaveLength(2);
    expect(result.ok).toBe(false);
    expect(result.failedImages).toBe(1);
    expect(result.sentImageUrls).toEqual(['https://cdn.example.com/2.jpg']);
    expect(result.textPartsSent).toBeGreaterThan(0);
  });

  it('marks a timeout as uncertain and does not claim success', async () => {
    global.fetch = jest.fn(async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'AbortError';
      throw error;
    }) as never;

    const result = await publishTelegramContent(content());

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.textPartsSent).toBe(0);
  });

  it('resumes only the missing text parts on retry', async () => {
    const body = `${'Текст для нескольких сообщений. '.repeat(400)}ФИНАЛ`;

    let nextId = 0;
    installFetch(() => success((nextId += 1)));

    const first = await publishTelegramContent(content({ body_md: body }));
    expect(first.textPartsSent).toBeGreaterThan(1);

    const calls = installFetch((call) => success(callsIndex(call)));
    const second = await publishTelegramContent(content({ body_md: body }), {
      resume: { textParts: 1 },
    });

    expect(second.textPartsSent).toBe(first.textPartsSent);
    expect(calls.filter((call) => call.url.includes('/sendMessage'))).toHaveLength(
      first.textPartsSent - 1
    );
  });

  it('skips images already delivered on a partial retry', async () => {
    const metadata = {
      images: [
        'https://cdn.example.com/1.jpg',
        'https://cdn.example.com/2.jpg',
      ],
    };
    const calls = installFetch((call) =>
      call.url.includes('/sendPhoto') ? success(10) : { ok: true, result: [] }
    );

    const result = await publishTelegramContent(content({ metadata }), {
      resume: { imageUrls: ['https://cdn.example.com/1.jpg'] },
    });

    const photos = calls.filter((call) => call.url.includes('/sendPhoto'));
    expect(photos).toHaveLength(1);
    expect(photos[0].body.photo).toBe('https://cdn.example.com/2.jpg');
    expect(result.sentImageUrls).toEqual(['https://cdn.example.com/2.jpg']);
  });

  it('sends a short photo post as media with the full caption and no extra message', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/sendPhoto')) return success(21);
      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(
      content({
        type: 'photo',
        body_md: 'Короткая подпись.',
        metadata: { image: 'https://cdn.example.com/photo.jpg' },
      })
    );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sendPhoto');
    expect(calls[0].body.caption).toContain('Короткая подпись.');
    expect(calls[0].body.caption).toContain('Читать в Flow');
    expect(calls[0].body.show_caption_above_media).toBe(true);
  });

  it('sends an opening caption first, then the article continuation in order', async () => {
    const body = `${'Длинный абзац статьи. '.repeat(120)}ФИНАЛ`;
    const calls = installFetch((call) => {
      if (call.url.includes('/sendPhoto')) return success(22);
      if (call.url.includes('/sendMessage')) return success(23);
      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(
      content({
        type: 'article',
        title: 'Длинная статья',
        body_md: body,
        metadata: { image: 'https://cdn.example.com/cover.jpg' },
      })
    );

    expect(result.ok).toBe(true);
    expect(calls[0].url).toContain('/sendPhoto');
    expect(calls[0].body.caption.length).toBeLessThanOrEqual(1024);
    expect(calls.slice(1).every((call) => call.url.includes('/sendMessage'))).toBe(true);
    expect(calls.map((call) => call.body.caption ?? call.body.text).join(' ')).toContain('ФИНАЛ');
  });

  it('sends a downloadable video as a video, not a photo', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/sendVideo')) return success(31);
      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(
      content({
        type: 'video',
        body_md: 'Видео.',
        metadata: {
          videos: [{ url: 'https://cdn.example.com/clip.mp4', title: 'Clip' }],
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(calls.some((call) => call.url.includes('/sendVideo'))).toBe(true);
    expect(calls.some((call) => call.url.includes('/sendPhoto'))).toBe(false);
    expect(calls[0].body.video).toBe('https://cdn.example.com/clip.mp4');
  });

  it('falls back to a clearly linked video thumbnail when upload fails', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/sendVideo')) {
        return { ok: false, description: 'video unavailable' };
      }
      if (call.url.includes('/sendPhoto')) return success(32);
      return { ok: false, description: 'unexpected endpoint' };
    });

    const result = await publishTelegramContent(
      content({
        type: 'video',
        body_md: 'Видео.',
        metadata: {
          videos: [
            {
              url: 'https://www.youtube.com/watch?v=abc123def45',
              title: 'Clip',
              thumbnail: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
            },
          ],
        },
      })
    );

    expect(calls.some((call) => call.url.includes('/sendPhoto'))).toBe(true);
    const photo = calls.find((call) => call.url.includes('/sendPhoto'));
    expect(photo?.body.photo).toBe('https://i.ytimg.com/vi/abc123def45/hqdefault.jpg');
    expect(photo?.body.caption).toContain('Видео');
    expect(result.sentImageUrls).toContain('https://www.youtube.com/watch?v=abc123def45');
  });

  it('allows one source preview only for text-only external link posts', async () => {
    const calls = installFetch((call) =>
      call.url.includes('/sendMessage') ? success(41) : { ok: false, description: 'unexpected endpoint' }
    );

    await publishTelegramContent(
      content({
        type: 'link',
        title: 'External source',
        body_md: 'Commentary.',
        source_url: 'https://example.com/source',
        metadata: {},
      })
    );

    expect(calls[0].body.link_preview_options).toEqual({
      url: 'https://example.com/source',
      prefer_large_media: true,
    });
  });

  it('disables previews for ordinary notes', async () => {
    const calls = installFetch((call) =>
      call.url.includes('/sendMessage') ? success(42) : { ok: false, description: 'unexpected endpoint' }
    );

    await publishTelegramContent(content({ body_md: 'A note.' }));

    expect(calls[0].body.link_preview_options).toEqual({ is_disabled: true });
  });
});

let callCounter = 0;

function callsIndex(_call: FetchCall): number {
  callCounter += 1;
  return callCounter;
}

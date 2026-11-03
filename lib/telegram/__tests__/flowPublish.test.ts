/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/flow/publish', () => ({
  createFlowItem: jest.fn(),
}));

const { createFlowItem } = require('@/lib/flow/publish') as {
  createFlowItem: jest.Mock;
};
const { crosspostSummary, publishTelegramFlowItem } = require('../flowPublish') as {
  crosspostSummary: typeof import('../flowPublish').crosspostSummary;
  publishTelegramFlowItem: typeof import('../flowPublish').publishTelegramFlowItem;
};

const store = {} as any;

function mockPublication(overrides: Record<string, unknown> = {}) {
  (createFlowItem as jest.Mock).mockResolvedValue({
    ok: true,
    item: { id: 'item-1', slug: 'tg-10-20', title: 'Telegram note' },
    crosspost: null,
    aiContext: null,
    duplicate: false,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.merkurov.love';
  mockPublication();
});

describe('Telegram direct Flow publishing', () => {
  it('publishes immediately with a deterministic idempotent slug', async () => {
    const result = await publishTelegramFlowItem({
      store,
      userId: 10,
      chatId: 10,
      messageId: 20,
      mode: 'note',
      text: 'A direct note',
    });

    expect(result).toMatchObject({
      ok: true,
      url: 'https://www.merkurov.love/flow/tg-10-20',
      duplicate: false,
    });
    expect(createFlowItem).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        type: 'note',
        status: 'published',
        visibility: 'public',
        slug: 'tg-10-20',
        idempotencyKey: 'tg-10-20',
        body_md: 'A direct note',
        metadata: expect.objectContaining({
          source: 'telegram',
          telegram_user_id: 10,
          telegram_chat_id: 10,
          telegram_message_id: 20,
          telegram_flow_mode: 'note',
        }),
      })
    );
  });

  it('requires a URL in Link mode', async () => {
    const result = await publishTelegramFlowItem({
      store,
      userId: 10,
      chatId: 10,
      messageId: 21,
      mode: 'link',
      text: 'No URL here',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Link mode needs a valid http(s) URL in the message.',
    });
    expect(createFlowItem).not.toHaveBeenCalled();
  });

  it('uses the first URL as the source in Link mode', async () => {
    await publishTelegramFlowItem({
      store,
      userId: 10,
      chatId: 10,
      messageId: 22,
      mode: 'link',
      text: 'Worth reading https://example.com/article.',
    });

    expect(createFlowItem).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        type: 'link',
        source_url: 'https://example.com/article',
      })
    );
  });

  it('requires an uploaded image in Media mode', async () => {
    const result = await publishTelegramFlowItem({
      store,
      userId: 10,
      chatId: 10,
      messageId: 23,
      mode: 'media',
      text: 'Caption only',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Send a photo for the Media mode.',
    });
  });

  it('stores the uploaded media URL and caption', async () => {
    await publishTelegramFlowItem({
      store,
      userId: 10,
      chatId: 10,
      messageId: 24,
      mode: 'media',
      text: 'Caption',
      imageUrl: 'https://cdn.example.com/photo.jpg',
    });

    expect(createFlowItem).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        type: 'photo',
        metadata: expect.objectContaining({
          images: ['https://cdn.example.com/photo.jpg'],
        }),
      })
    );
  });
});

describe('crosspost summary', () => {
  it('reports actual channel states and uncertain failures', () => {
    const summary = crosspostSummary({
      channels: {
        telegram: { status: 'published' },
        bluesky: { status: 'failed', uncertain: true },
        facebook: { status: 'skipped' },
      },
    } as any);

    expect(summary).toBe('Telegram: published · Bluesky: failed (unconfirmed) · Facebook: skipped');
  });
});

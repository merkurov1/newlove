/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../crosspost', () => ({
  crosspostFlowItem: jest.fn(async () => ({
    channels: { telegram: { status: 'published' } },
  })),
}));

jest.mock('../publishedContext', () => ({
  ensurePublishedFlowContext: jest.fn(async () => ({ status: 'ready' })),
}));

const { crosspostFlowItem } = require('../crosspost') as {
  crosspostFlowItem: jest.Mock;
};
const { ensurePublishedFlowContext } = require('../publishedContext') as {
  ensurePublishedFlowContext: jest.Mock;
};
const { createFlowItem } = require('../publish') as {
  createFlowItem: typeof import('../publish').createFlowItem;
};

type InsertRow = Record<string, any>;

function fakeStore(
  options: {
    insertError?: { code?: string; message?: string } | null;
    existing?: InsertRow | null;
  } = {}
) {
  const inserted: InsertRow[] = [];

  const client = {
    from(table: string) {
      if (table !== 'items') throw new Error(`Unexpected table ${table}`);

      return {
        insert(value: InsertRow) {
          inserted.push(value);
          return {
            select() {
              return {
                async single() {
                  if (options.insertError) {
                    return { data: null, error: options.insertError };
                  }

                  return {
                    data: { id: 'item-1', ...value },
                    error: null,
                  };
                },
              };
            },
          };
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: options.existing ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { client: client as any, inserted };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shared Flow publication service', () => {
  it('publishes immediately, crossposts and generates context', async () => {
    const store = fakeStore();

    const result = await createFlowItem(store.client, {
      body_md: 'A short note',
      type: 'note',
      status: 'published',
      visibility: 'public',
      metadata: { source: 'telegram' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.item.status).toBe('published');
    expect(result.item.visibility).toBe('public');
    expect(result.duplicate).toBe(false);
    expect(result.crosspost).not.toBeNull();
    expect(crosspostFlowItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', status: 'published' })
    );
    expect(ensurePublishedFlowContext).toHaveBeenCalled();
    expect(store.inserted[0].published_at).toBeTruthy();
  });

  it('preserves the EN language for a photo item', async () => {
    const store = fakeStore();

    const result = await createFlowItem(store.client, {
      body_md: '',
      type: 'photo',
      lang: 'en',
      status: 'published',
      visibility: 'public',
      metadata: { images: ['https://cdn.example.com/photo-en.jpg'] },
    });

    expect(result.ok).toBe(true);
    expect(store.inserted[0]).toMatchObject({
      type: 'photo',
      lang: 'en',
      metadata: {
        images: ['https://cdn.example.com/photo-en.jpg'],
      },
    });
  });

  it('preserves the RU language for a photo item', async () => {
    const store = fakeStore();

    await createFlowItem(store.client, {
      body_md: '',
      type: 'photo',
      lang: 'ru',
      status: 'published',
      visibility: 'public',
      metadata: { images: ['https://cdn.example.com/photo-ru.jpg'] },
    });

    expect(store.inserted[0]).toMatchObject({
      type: 'photo',
      lang: 'ru',
    });
  });

  it('normalizes a valid language tag without rewriting EN to RU', async () => {
    const store = fakeStore();

    await createFlowItem(store.client, {
      body_md: '',
      type: 'photo',
      lang: 'EN',
      status: 'published',
      visibility: 'public',
      metadata: { images: ['https://cdn.example.com/photo.jpg'] },
    });

    expect(store.inserted[0].lang).toBe('en');
  });

  it('keeps existing non-photo publication language behaviour', async () => {
    const cases = [
      { type: 'note', lang: 'en' },
      { type: 'article', lang: 'ru' },
      { type: 'link', lang: 'en' },
      { type: 'video', lang: 'ru' },
      { type: 'quote', lang: 'en' },
    ] as const;

    for (const testCase of cases) {
      const store = fakeStore();

      await createFlowItem(store.client, {
        body_md: 'Body copy',
        type: testCase.type,
        lang: testCase.lang,
        status: 'published',
        visibility: 'public',
      });

      expect(store.inserted[0]).toMatchObject({
        type: testCase.type,
        lang: testCase.lang,
      });
    }
  });

  it('does not crosspost a draft', async () => {
    const store = fakeStore();

    const result = await createFlowItem(store.client, {
      body_md: 'Draft text',
      status: 'draft',
      visibility: 'private',
    });

    expect(result.ok).toBe(true);
    expect(crosspostFlowItem).not.toHaveBeenCalled();
  });

  it('can return before deferred distribution runs', async () => {
    const store = fakeStore();

    const result = await createFlowItem(
      store.client,
      {
        body_md: 'Fast publication',
        status: 'published',
        visibility: 'public',
      },
      { deferDistribution: true }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.crosspost).toBeNull();
    expect(result.aiContext).toBeNull();
    expect(crosspostFlowItem).not.toHaveBeenCalled();
    expect(ensurePublishedFlowContext).not.toHaveBeenCalled();
  });

  it('uses a deterministic slug for idempotent Telegram publication', async () => {
    const store = fakeStore();

    await createFlowItem(store.client, {
      body_md: 'Telegram note',
      idempotencyKey: 'tg-10-20',
      status: 'published',
    });

    expect(store.inserted[0].slug).toBe('tg-10-20');
  });

  it('returns the existing item when the deterministic slug already exists', async () => {
    const store = fakeStore({
      insertError: { code: '23505', message: 'duplicate key' },
      existing: {
        id: 'item-existing',
        slug: 'tg-10-20',
        title: 'Already published',
        status: 'published',
        visibility: 'public',
      },
    });

    const result = await createFlowItem(store.client, {
      body_md: 'Telegram note',
      idempotencyKey: 'tg-10-20',
      status: 'published',
    });

    expect(result).toMatchObject({
      ok: true,
      duplicate: true,
      item: { id: 'item-existing' },
    });
    expect(crosspostFlowItem).not.toHaveBeenCalled();
  });

  it('reports a real insert failure', async () => {
    const store = fakeStore({
      insertError: { code: '42501', message: 'permission denied' },
    });

    const result = await createFlowItem(store.client, {
      body_md: 'Text',
      status: 'published',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      error: 'Failed to create item.',
    });
  });
});

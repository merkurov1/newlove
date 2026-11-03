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

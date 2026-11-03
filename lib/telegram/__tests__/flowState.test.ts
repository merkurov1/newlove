/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  clearTelegramFlowMode,
  getTelegramFlowMode,
  isTelegramFlowMode,
  setTelegramFlowMode,
  TELEGRAM_FLOW_STATE_TTL_MS,
} from '../flowState';

type Row = {
  telegram_user_id: number;
  telegram_chat_id: number;
  mode: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

function fakeStore() {
  const rows = new Map<string, Row>();
  const key = (userId: number, chatId: number) => `${userId}:${chatId}`;

  return {
    rows,
    client: {
      from() {
        return {
          async upsert(value: Row) {
            rows.set(key(value.telegram_user_id, value.telegram_chat_id), value);
            return { error: null };
          },
          select() {
            return {
              eq(_column: string, userId: number) {
                return {
                  eq(_column2: string, chatId: number) {
                    return {
                      async maybeSingle() {
                        return {
                          data: rows.get(key(userId, chatId)) ?? null,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq(_column: string, userId: number) {
                return {
                  async eq(_column2: string, chatId: number) {
                    rows.delete(key(userId, chatId));
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
    } as any,
  };
}

describe('Telegram Flow mode state', () => {
  it('stores a mode bound to user and chat', async () => {
    const store = fakeStore();
    const now = Date.UTC(2026, 10, 3, 12, 0, 0);

    await setTelegramFlowMode(store.client, {
      userId: 100,
      chatId: 100,
      mode: 'link',
      now,
    });

    expect(
      await getTelegramFlowMode(store.client, {
        userId: 100,
        chatId: 100,
        now,
      })
    ).toBe('link');

    expect(
      await getTelegramFlowMode(store.client, {
        userId: 100,
        chatId: 200,
        now,
      })
    ).toBeNull();

    expect(store.rows.get('100:100')?.expires_at).toBe(
      new Date(now + TELEGRAM_FLOW_STATE_TTL_MS).toISOString()
    );
  });

  it('expires and removes stale modes', async () => {
    const store = fakeStore();
    const now = Date.UTC(2026, 10, 3, 12, 0, 0);

    await setTelegramFlowMode(store.client, {
      userId: 100,
      chatId: 100,
      mode: 'note',
      now,
    });

    expect(
      await getTelegramFlowMode(store.client, {
        userId: 100,
        chatId: 100,
        now: now + TELEGRAM_FLOW_STATE_TTL_MS + 1,
      })
    ).toBeNull();
    expect(store.rows.size).toBe(0);
  });

  it('clears a mode explicitly', async () => {
    const store = fakeStore();

    await setTelegramFlowMode(store.client, {
      userId: 100,
      chatId: 100,
      mode: 'article',
    });
    await clearTelegramFlowMode(store.client, {
      userId: 100,
      chatId: 100,
    });

    expect(
      await getTelegramFlowMode(store.client, {
        userId: 100,
        chatId: 100,
      })
    ).toBeNull();
  });

  it('accepts only the existing Flow modes', () => {
    expect(isTelegramFlowMode('note')).toBe(true);
    expect(isTelegramFlowMode('media')).toBe(true);
    expect(isTelegramFlowMode('video')).toBe(false);
    expect(isTelegramFlowMode('draft')).toBe(false);
  });
});

/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimTelegramUpdate,
  releaseTelegramUpdateClaim,
  telegramUpdateKey,
} from '../updateIdempotency';

function storeWithInsert(result: { error: { code?: string } | null }) {
  const insert = jest.fn(async () => result);
  const store = {
    from: jest.fn(() => ({ insert })),
  } as unknown as SupabaseClient;

  return { store, insert };
}

describe('Telegram update idempotency', () => {
  it('uses one stable key per Telegram update', () => {
    expect(telegramUpdateKey(987654)).toBe('telegram:pierrot:987654');
  });

  it('claims a new update through the existing ingest_log table', async () => {
    const { store, insert } = storeWithInsert({ error: null });

    await expect(claimTelegramUpdate(store, 42)).resolves.toBe('claimed');
    expect(insert).toHaveBeenCalledWith({
      idempotency_key: 'telegram:pierrot:42',
      source: 'telegram_pierrot',
      item_id: null,
    });
  });

  it('recognises a redelivered update by the unique constraint', async () => {
    const { store } = storeWithInsert({ error: { code: '23505' } });

    await expect(claimTelegramUpdate(store, 42)).resolves.toBe('duplicate');
  });

  it('reports storage failure instead of processing unguarded', async () => {
    const { store } = storeWithInsert({ error: { code: '08006' } });

    await expect(claimTelegramUpdate(store, 42)).resolves.toBe('unavailable');
  });

  it('can release a claim when Telegram must retry', async () => {
    const deleteRow = jest.fn(async () => ({ error: null }));
    const is = jest.fn(() => deleteRow);
    const eq = jest.fn(() => ({ is }));
    const del = jest.fn(() => ({ eq }));
    const store = {
      from: jest.fn(() => ({ delete: del })),
    } as unknown as SupabaseClient;

    await releaseTelegramUpdateClaim(store, 42);

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('idempotency_key', 'telegram:pierrot:42');
    expect(is).toHaveBeenCalledWith('item_id', null);
  });
});

/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPersonalAssistantStore } from '../store';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

type QueryState = {
  table: string;
  op: string | null;
  payload: unknown;
  options: unknown;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
  orders: Array<[string, unknown]>;
  limit: number | null;
};

type QueryResponse = { data: unknown; error: unknown };

function createFakeClient(respond: (state: QueryState) => QueryResponse) {
  const states: QueryState[] = [];

  const from = (table: string) => {
    const state: QueryState = {
      table,
      op: null,
      payload: undefined,
      options: undefined,
      eqs: [],
      ins: [],
      orders: [],
      limit: null,
    };
    states.push(state);

    const builder: Record<string, unknown> = {};

    const settle = () => Promise.resolve(respond(state));

    builder.select = (..._args: unknown[]) => {
      if (!state.op) state.op = 'select';
      return builder;
    };
    builder.insert = (payload: unknown) => {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    };
    builder.update = (payload: unknown) => {
      state.op = 'update';
      state.payload = payload;
      return builder;
    };
    builder.upsert = (payload: unknown, options: unknown) => {
      state.op = 'upsert';
      state.payload = payload;
      state.options = options;
      return builder;
    };
    builder.delete = () => {
      state.op = 'delete';
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      state.eqs.push([column, value]);
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      state.ins.push([column, values]);
      return builder;
    };
    builder.order = (column: string, options: unknown) => {
      state.orders.push([column, options]);
      return builder;
    };
    builder.limit = (value: number) => {
      state.limit = value;
      return builder;
    };
    builder.maybeSingle = settle;
    builder.single = settle;
    builder.then = (
      onFulfilled?: (value: QueryResponse) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => settle().then(onFulfilled, onRejected);

    return builder as unknown as ReturnType<SupabaseClient['from']>;
  };

  return {
    client: { from } as unknown as SupabaseClient,
    states,
  };
}

describe('personal assistant store scoping', () => {
  it('resolves a profile by the server-side Telegram user id', async () => {
    const fake = createFakeClient(() => ({
      data: {
        id: PROFILE_ID,
        telegram_user_id: 291983727,
        display_name: 'Светлана Георгиевна',
        memory_enabled: true,
      },
      error: null,
    }));
    const store = createPersonalAssistantStore(fake.client);

    const profile = await store.ensureProfile(291983727);

    expect(profile.id).toBe(PROFILE_ID);
    expect(fake.states[0]?.table).toBe('pierrot_assistant_profiles');
    expect(fake.states[0]?.eqs).toContainEqual(['telegram_user_id', 291983727]);
  });

  it('filters every transcript read and write by profile_id', async () => {
    const fake = createFakeClient((state) => {
      if (state.op === 'upsert') return { data: null, error: null };
      return {
        data: [
          { role: 'assistant', content: 'second' },
          { role: 'user', content: 'first' },
        ],
        error: null,
      };
    });
    const store = createPersonalAssistantStore(fake.client);

    const history = await store.loadHistory(PROFILE_ID, 20);
    await store.appendMessage({
      profileId: PROFILE_ID,
      messageId: 'tgu_12345678',
      role: 'user',
      content: 'hello',
      language: 'en',
    });

    expect(history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
    ]);

    expect(fake.states[0]?.eqs).toContainEqual(['profile_id', PROFILE_ID]);
    expect(fake.states[1]?.op).toBe('upsert');
    expect((fake.states[1]?.payload as Record<string, unknown>).profile_id).toBe(PROFILE_ID);
    expect((fake.states[1]?.options as Record<string, unknown>).onConflict).toBe(
      'profile_id,message_id'
    );
  });

  it('updates memory only through the profile-scoped profile id', async () => {
    const fake = createFakeClient(() => ({ data: null, error: null }));
    const store = createPersonalAssistantStore(fake.client);

    await store.setMemoryEnabled(PROFILE_ID, false);

    expect(fake.states[0]?.table).toBe('pierrot_assistant_profiles');
    expect(fake.states[0]?.eqs).toContainEqual(['id', PROFILE_ID]);
  });

  it('forgets only matching active memories of this profile', async () => {
    let calls = 0;
    const fake = createFakeClient(() => {
      calls += 1;
      if (calls === 1) {
        return {
          data: [
            { id: 'memory-1', content: 'phone number 123', created_at: '2026-01-01' },
            { id: 'memory-2', content: 'favourite flower', created_at: '2026-01-02' },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const store = createPersonalAssistantStore(fake.client);

    const count = await store.forgetMemory(PROFILE_ID, 'phone');

    expect(count).toBe(1);
    expect(fake.states[0]?.eqs).toContainEqual(['profile_id', PROFILE_ID]);
    expect(fake.states[0]?.eqs).toContainEqual(['status', 'active']);
    expect(fake.states[1]?.eqs).toContainEqual(['profile_id', PROFILE_ID]);
    expect(fake.states[1]?.ins).toContainEqual(['id', ['memory-1']]);
  });

  it('rejects a non-UUID profile id before any query', () => {
    const fake = createFakeClient(() => ({ data: null, error: null }));
    const store = createPersonalAssistantStore(fake.client);

    return expect(store.loadHistory('not-a-profile', 10)).rejects.toThrow(
      'Invalid personal assistant profile id.'
    );
  });

  it('refuses to create a profile for a non-allowlisted Telegram user', async () => {
    const fake = createFakeClient(() => ({ data: null, error: null }));
    const store = createPersonalAssistantStore(fake.client);

    await expect(store.ensureProfile(123456789)).rejects.toThrow(
      'Telegram user is not allowed to use the personal assistant profile.'
    );
    expect(fake.states).toHaveLength(0);
  });
});

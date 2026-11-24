/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';

import {
  joinGroupVigil,
  leaveGroupVigil,
  verifyGroupVigilContext,
} from '../groupVigil';

const BOT_TOKEN = '123456:test-bot-token';

function signedInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const params = new URLSearchParams(fields);

  if (botToken) {
    const dataCheckString = Array.from(params.entries())
      .map(([key, value]) => [key, value] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

    params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  }

  return params.toString();
}

function groupFields(overrides: Record<string, string> = {}) {
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 97518066, first_name: 'Anton' }),
    chat_type: 'supergroup',
    chat_instance: '-987654321',
    chat: JSON.stringify({ id: -1001234567890, type: 'supergroup', title: 'The Vigil' }),
    ...overrides,
  };
}

function fakeStore() {
  const upsert = jest.fn(async () => ({ error: null }));
  const deleteEq = jest.fn(async () => ({ error: null }));
  const deleteSecondEq = jest.fn(() => ({ eq: deleteEq }));
  const deleteFirstEq = jest.fn(() => ({ eq: deleteSecondEq }));

  const countEqSecond = jest.fn(async () => ({ count: 3, error: null }));
  const countEqFirst = jest.fn(() => ({ eq: countEqSecond }));
  const countSelect = jest.fn(() => ({ eq: countEqFirst }));

  const readMaybeSingle = jest.fn(async () => ({ data: { telegram_user_id: '97518066' }, error: null }));
  const readEqThird = jest.fn(() => ({ maybeSingle: readMaybeSingle }));
  const readEqSecond = jest.fn(() => ({ eq: readEqThird }));
  const readEqFirst = jest.fn(() => ({ eq: readEqSecond }));
  const readSelect = jest.fn(() => ({ eq: readEqFirst }));

  const store = {
    from: jest.fn((table: string) => {
      if (table === 'telegram_group_vigil_participants') {
        return {
          upsert,
          select: countSelect,
          delete: () => ({ eq: deleteFirstEq }),
        };
      }

      return { upsert, select: readSelect };
    }),
  };

  return { store: store as never, upsert, countSelect, readSelect };
}

describe('Shared Vigil group binding', () => {
  it('accepts a group context that is present in verified initData', () => {
    const result = verifyGroupVigilContext({
      initData: signedInitData(groupFields()),
      botToken: BOT_TOKEN,
    });

    expect(result).toMatchObject({
      ok: true,
      telegramUserId: '97518066',
      chat: {
        id: '-1001234567890',
        instance: '-987654321',
        type: 'supergroup',
      },
    });
  });

  it('refuses a client-supplied chat context that is not signed', () => {
    // A DM launch carries no chat_type/chat_instance. A caller cannot add one.
    const result = verifyGroupVigilContext({
      initData: signedInitData(
        groupFields({
          chat_type: '',
          chat_instance: '',
          chat: '',
        })
      ),
      botToken: BOT_TOKEN,
    });

    expect(result).toEqual({ ok: false, reason: 'group_context_unavailable' });
  });

  it('rejects tampered chat_instance and a wrong bot token', () => {
    const signed = signedInitData(groupFields());

    expect(
      verifyGroupVigilContext({
        initData: signed.replace(encodeURIComponent('-987654321'), 'attacker-instance'),
        botToken: BOT_TOKEN,
      })
    ).toEqual({ ok: false, reason: 'invalid_initdata' });

    expect(
      verifyGroupVigilContext({ initData: signed, botToken: '654321:other' })
    ).toEqual({ ok: false, reason: 'invalid_initdata' });
  });

  it('fails closed without a bot token', () => {
    expect(
      verifyGroupVigilContext({ initData: signedInitData(groupFields()), botToken: '' })
    ).toEqual({ ok: false, reason: 'missing_bot_token' });
  });

  it('joins idempotently with a composite key and returns an aggregate only', async () => {
    const context = verifyGroupVigilContext({
      initData: signedInitData(groupFields()),
      botToken: BOT_TOKEN,
    });

    expect(context.ok).toBe(true);

    if (!context.ok) return;

    const { store, upsert } = fakeStore();
    const first = await joinGroupVigil(store, context);
    const second = await joinGroupVigil(store, context);

    expect(first).toEqual({ ok: true, joined: true, participants: 3 });
    expect(second).toEqual(first);

    const participantUpserts = upsert.mock.calls.filter(
      (call) => (call[1] as { onConflict?: string })?.onConflict ===
        'group_chat_id,chat_instance,telegram_user_id'
    );

    expect(participantUpserts.length).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toContain('97518066');
  });

  it('leaves idempotently and never touches the individual supporter table', async () => {
    const context = verifyGroupVigilContext({
      initData: signedInitData(groupFields()),
      botToken: BOT_TOKEN,
    });

    if (!context.ok) throw new Error('expected verified context');

    const { store } = fakeStore();
    const result = await leaveGroupVigil(store, context);

    expect(result).toEqual({ ok: true, joined: false, participants: 3 });
    expect((store as unknown as { from: jest.Mock }).from).not.toHaveBeenCalledWith(
      'vigil_hearts'
    );
  });
});

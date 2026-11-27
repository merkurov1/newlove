/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEMPLE_ANALYTICS_EVENTS_TABLE,
  TEMPLE_ANALYTICS_SESSIONS_TABLE,
  hashTempleAnalyticsVisitor,
  recordTempleAnalyticsEvent,
  resolveTempleAnalyticsSession,
  resolveTempleAnalyticsVisitor,
  templeAnalyticsChannelFromRequest,
  templeAnalyticsSourceFromRequest,
} from '@/lib/temple/analytics.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TELEGRAM_ID = '100200300';
const VISITOR_COOKIE = '22222222-2222-4222-8222-222222222222';
const SESSION_COOKIE = '33333333-3333-4333-8333-333333333333';

type UpsertCall = {
  table: string;
  rows: unknown;
  options: unknown;
};

function fakeClient(calls: UpsertCall[]): SupabaseClient {
  return {
    from(table: string) {
      return {
        upsert: async (rows: unknown, options: unknown) => {
          calls.push({ table, rows, options });
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function request(cookie?: string, userAgent = 'Mozilla/5.0'): Request {
  return new Request('https://www.merkurov.love/api/temple/analytics', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': userAgent,
      ...(cookie ? { cookie } : {}),
      referer: 'https://t.me/Love_Temple_bot',
    },
  });
}

beforeEach(() => {
  process.env.TEMPLE_ANALYTICS_SECRET = 'test-analytics-secret';
  jest.clearAllMocks();
});

describe('Temple analytics privacy', () => {
  it('hashes verified identities and never stores raw ids, names or emails', async () => {
    const calls: UpsertCall[] = [];
    const cookie = `temple_analytics_visitor=${VISITOR_COOKIE}; temple_analytics_session=${SESSION_COOKIE}`;

    const result = await recordTempleAnalyticsEvent(fakeClient(calls), request(cookie), {
      eventName: 'page_view',
      identity: {
        key: `sb:${USER_ID}`,
        userId: USER_ID,
        displayName: 'Pilgrim',
        source: 'supabase',
        email: 'pilgrim@example.com',
      },
      path: '/temple?secret=1',
      eventKey: 'page:one',
    });

    expect(result.ok).toBe(true);

    const events = calls.find((call) => call.table === TEMPLE_ANALYTICS_EVENTS_TABLE);
    expect(events).toBeTruthy();

    const serialized = JSON.stringify(events?.rows);

    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('pilgrim@example.com');
    expect(serialized).not.toContain('Pilgrim');
    expect(serialized).toContain('/temple');
    expect(serialized).toContain('t.me');
    expect(serialized).toContain('supabase');
  });

  it('hashes Telegram ids and keeps them out of the stored row', async () => {
    const calls: UpsertCall[] = [];

    await recordTempleAnalyticsEvent(
      fakeClient(calls),
      request(undefined, 'TelegramBot (like TwitterBot)'),
      {
        eventName: 'ritual_complete',
        identity: {
          key: `tg:${TELEGRAM_ID}`,
          userId: TELEGRAM_ID,
          displayName: 'Anna',
          source: 'telegram',
          email: null,
        },
        ritual: 'VIGIL_SPARK',
        eventKey: 'vigil:one',
      }
    );

    const serialized = JSON.stringify(
      calls.find((call) => call.table === TEMPLE_ANALYTICS_EVENTS_TABLE)?.rows
    );

    expect(serialized).not.toContain(TELEGRAM_ID);
    expect(serialized).not.toContain('Anna');
    expect(serialized).toContain('telegram');
    expect(serialized).toContain('VIGIL_SPARK');
  });

  it('creates one session and emits session_start only for a new session', async () => {
    const newCalls: UpsertCall[] = [];

    const first = await recordTempleAnalyticsEvent(
      fakeClient(newCalls),
      request(`temple_analytics_visitor=${VISITOR_COOKIE}`),
      { eventName: 'page_view', eventKey: 'page:first' }
    );

    expect(first.ok).toBe(true);
    expect(first.setCookies.some((cookie) => cookie.includes('temple_analytics_session'))).toBe(
      true
    );

    const sessionRow = newCalls.find((call) => call.table === TEMPLE_ANALYTICS_SESSIONS_TABLE);
    expect(sessionRow).toBeTruthy();

    const rows = newCalls.find((call) => call.table === TEMPLE_ANALYTICS_EVENTS_TABLE)
      ?.rows as Array<{ event_name: string }>;

    expect(rows.map((row) => row.event_name)).toEqual(['session_start', 'page_view']);

    const existingCalls: UpsertCall[] = [];

    await recordTempleAnalyticsEvent(
      fakeClient(existingCalls),
      request(
        `temple_analytics_visitor=${VISITOR_COOKIE}; temple_analytics_session=${SESSION_COOKIE}`
      ),
      { eventName: 'page_view', eventKey: 'page:second' }
    );

    expect(existingCalls.some((call) => call.table === TEMPLE_ANALYTICS_SESSIONS_TABLE)).toBe(
      false
    );

    const existingRows = existingCalls.find((call) => call.table === TEMPLE_ANALYTICS_EVENTS_TABLE)
      ?.rows as Array<{ event_name: string }>;

    expect(existingRows.map((row) => row.event_name)).toEqual(['page_view']);
  });

  it('reuses a provided event key so a retry cannot create a second action', async () => {
    const calls: UpsertCall[] = [];

    await recordTempleAnalyticsEvent(fakeClient(calls), request(undefined), {
      eventName: 'page_view',
      eventKey: 'stable-client-key',
      identity: null,
    });

    const rows = calls.find((call) => call.table === TEMPLE_ANALYTICS_EVENTS_TABLE)?.rows as Array<{
      event_key: string;
    }>;

    expect(rows[rows.length - 1].event_key).toBe('stable-client-key');
  });
});

describe('Temple analytics cookie and source helpers', () => {
  it('rejects malformed cookies instead of trusting them', () => {
    const visitor = resolveTempleAnalyticsVisitor({ temple_analytics_visitor: 'not-a-uuid' }, null);

    expect(visitor.identityKind).toBe('guest');
    expect(visitor.visitorKey).toMatch(/^v1:/);
    expect(visitor.visitorCookie).toBeTruthy();

    const session = resolveTempleAnalyticsSession({
      temple_analytics_session: 'not-a-uuid',
    });

    expect(session.isNew).toBe(true);
  });

  it('uses a different hash per namespace', () => {
    expect(hashTempleAnalyticsVisitor('guest', 'x')).not.toBe(
      hashTempleAnalyticsVisitor('telegram', 'x')
    );
  });

  it('reduces referers to a safe source and detects Telegram', () => {
    expect(templeAnalyticsSourceFromRequest(request())).toBe('t.me');
    expect(templeAnalyticsChannelFromRequest(request(undefined, 'TelegramBot'))).toBe('telegram');
    expect(templeAnalyticsChannelFromRequest(request(undefined, 'Mozilla/5.0'))).toBe('web');
  });
});

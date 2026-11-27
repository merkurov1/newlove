import {
  TEMPLE_ANALYTICS_METHODOLOGY,
  buildTempleAnalyticsReport,
  detectTempleAnalyticsChannel,
  isTempleAnalyticsClientEventName,
  isTempleAnalyticsEventName,
  normalizeTempleAnalyticsRitual,
  sanitizeTempleAnalyticsPath,
  sanitizeTempleAnalyticsSource,
  templeAnalyticsActionKey,
  type TempleAnalyticsEventRow,
} from '@/lib/temple/analytics';

const NOW = Date.parse('2026-11-30T00:00:00.000Z');

function at(daysAgo: number, hour: number = 10): string {
  return new Date(NOW - daysAgo * 86_400_000 + hour * 3_600_000).toISOString();
}

function row(
  overrides: Partial<TempleAnalyticsEventRow> & {
    event_key: string;
    event_name: string;
    occurred_at: string;
  }
): TempleAnalyticsEventRow {
  return {
    visitor_key: 'v1:a',
    session_key: 'session-a',
    identity_kind: 'guest',
    channel: 'web',
    source: 'direct',
    path: '/temple',
    ritual: null,
    ...overrides,
  };
}

function fixture(): TempleAnalyticsEventRow[] {
  return [
    // Visitor A returns on the next UTC day (D1).
    row({
      event_key: 'a-page-1',
      event_name: 'page_view',
      occurred_at: at(10),
      visitor_key: 'v1:a',
      session_key: 'a-1',
      channel: 'telegram',
      source: 'telegram',
    }),
    row({
      event_key: 'a-open',
      event_name: 'ritual_open',
      occurred_at: at(10, 11),
      visitor_key: 'v1:a',
      session_key: 'a-1',
      channel: 'telegram',
      source: 'telegram',
      ritual: 'ASH',
    }),
    row({
      event_key: 'a-complete',
      event_name: 'ritual_complete',
      occurred_at: at(10, 12),
      visitor_key: 'v1:a',
      session_key: 'a-1',
      channel: 'telegram',
      source: 'telegram',
      ritual: 'ASH',
    }),
    row({
      event_key: 'a-page-2',
      event_name: 'page_view',
      occurred_at: at(9),
      visitor_key: 'v1:a',
      session_key: 'a-2',
      channel: 'telegram',
      source: 'telegram',
    }),
    // Visitor B returns on day +8 (D7).
    row({
      event_key: 'b-page-1',
      event_name: 'page_view',
      occurred_at: at(20),
      visitor_key: 'v1:b',
      session_key: 'b-1',
    }),
    row({
      event_key: 'b-page-2',
      event_name: 'page_view',
      occurred_at: at(12),
      visitor_key: 'v1:b',
      session_key: 'b-2',
    }),
    // Visitor C is seen once.
    row({
      event_key: 'c-page',
      event_name: 'page_view',
      occurred_at: at(5),
      visitor_key: 'v1:c',
      session_key: 'c-1',
    }),
    // Retry of A's completion key must not inflate conversions.
    row({
      event_key: 'a-complete',
      event_name: 'ritual_complete',
      occurred_at: at(10, 12),
      visitor_key: 'v1:other',
      session_key: 'other',
      channel: 'telegram',
      source: 'telegram',
      ritual: 'ASH',
    }),
  ];
}

describe('Temple analytics event contract', () => {
  it('accepts only the documented event names', () => {
    expect(isTempleAnalyticsEventName('session_start')).toBe(true);
    expect(isTempleAnalyticsEventName('ritual_complete')).toBe(true);
    expect(isTempleAnalyticsEventName('click')).toBe(false);
    expect(isTempleAnalyticsClientEventName('page_view')).toBe(true);
    expect(isTempleAnalyticsClientEventName('ritual_nav')).toBe(true);
    expect(isTempleAnalyticsClientEventName('ritual_complete')).toBe(false);
  });

  it('sanitizes paths to the allowlisted Temple surfaces', () => {
    expect(sanitizeTempleAnalyticsPath('/temple')).toBe('/temple');
    expect(sanitizeTempleAnalyticsPath('/vigil?token=secret')).toBe('/vigil');
    expect(sanitizeTempleAnalyticsPath('/temple/whispers#x')).toBe('/temple/whispers');
    expect(sanitizeTempleAnalyticsPath('/admin/users')).toBeNull();
    expect(sanitizeTempleAnalyticsPath('https://evil.test/temple')).toBeNull();
    expect(sanitizeTempleAnalyticsPath(null)).toBeNull();
  });

  it('reduces sources to a coarse host or campaign token', () => {
    expect(sanitizeTempleAnalyticsSource('https://t.me/channel?x=1')).toBe('t.me');
    expect(sanitizeTempleAnalyticsSource('www.Example.com/path')).toBe('example.com');
    expect(sanitizeTempleAnalyticsSource('newsletter')).toBe('newsletter');
    expect(sanitizeTempleAnalyticsSource('bad source with spaces')).toBe('badsourcewithspaces');
    expect(sanitizeTempleAnalyticsSource('')).toBeNull();
  });

  it('detects Telegram and keeps web separate', () => {
    expect(detectTempleAnalyticsChannel('TelegramBot (like TwitterBot)')).toBe('telegram');
    expect(detectTempleAnalyticsChannel('Mozilla/5.0', true)).toBe('telegram');
    expect(detectTempleAnalyticsChannel('Mozilla/5.0', false)).toBe('web');
  });

  it('canonicalizes ritual aliases without inventing one', () => {
    expect(normalizeTempleAnalyticsRitual('let it go')).toBe('ASH');
    expect(normalizeTempleAnalyticsRitual('VIGIL_SPARK')).toBe('VIGIL_SPARK');
    expect(normalizeTempleAnalyticsRitual('Calm')).toBe('MEDITATION');
    expect(normalizeTempleAnalyticsRitual('hello')).toBeNull();
  });

  it('builds stable server action keys', () => {
    expect(templeAnalyticsActionKey('cast', 'rec-1')).toBe('cast:rec-1');
    expect(templeAnalyticsActionKey('vigil_spark', 1)).toBe('vigil_spark:1');
  });
});

describe('Temple analytics report', () => {
  it('counts unique identities, sessions, D1/D7 and conversion without retries', () => {
    const report = buildTempleAnalyticsReport(fixture(), {
      nowMs: NOW,
      windowDays: 30,
    });

    expect(report.uniqueVisitors).toBe(3);
    expect(report.sessions).toBe(5);
    expect(report.pageViews).toBe(5);
    expect(report.ritualStarts).toBe(1);
    expect(report.ritualCompletions).toBe(1);
    expect(report.conversionRate).toBe(1);
    expect(report.returningVisitors).toBe(2);
    expect(report.d1ReturningVisitors).toBe(1);
    expect(report.d7ReturningVisitors).toBe(1);
    expect(report.byRitual.ASH).toEqual({ starts: 1, completions: 1 });
    expect(report.methodology).toBe(TEMPLE_ANALYTICS_METHODOLOGY);
  });

  it('keeps channel and source breakdowns exact per identity and session', () => {
    const report = buildTempleAnalyticsReport(fixture(), {
      nowMs: NOW,
      windowDays: 30,
    });

    expect(report.byChannel.telegram).toMatchObject({
      visitors: 1,
      sessions: 2,
      pageViews: 2,
      ritualStarts: 1,
      ritualCompletions: 1,
    });
    expect(report.byChannel.web).toMatchObject({
      visitors: 2,
      sessions: 3,
      pageViews: 3,
      ritualStarts: 0,
      ritualCompletions: 0,
    });
    expect(report.bySource.direct).toMatchObject({
      visitors: 2,
      sessions: 3,
      pageViews: 3,
    });
  });

  it('excludes events outside the window and never invents a rate', () => {
    const report = buildTempleAnalyticsReport(
      [
        row({
          event_key: 'old',
          event_name: 'page_view',
          occurred_at: at(400),
        }),
      ],
      { nowMs: NOW, windowDays: 30 }
    );

    expect(report.uniqueVisitors).toBe(0);
    expect(report.sessions).toBe(0);
    expect(report.conversionRate).toBeNull();
    expect(report.reliableSince).toBeNull();
  });

  it('does not merge guest and signed-in identities with identical display data', () => {
    const report = buildTempleAnalyticsReport(
      [
        row({
          event_key: 'guest',
          event_name: 'page_view',
          occurred_at: at(1),
          visitor_key: 'v1:guest-hash',
          identity_kind: 'guest',
        }),
        row({
          event_key: 'signed',
          event_name: 'page_view',
          occurred_at: at(1, 11),
          visitor_key: 'v1:supabase-hash',
          identity_kind: 'supabase',
        }),
      ],
      { nowMs: NOW, windowDays: 30 }
    );

    expect(report.uniqueVisitors).toBe(2);
    expect(report.sessions).toBe(1);
  });
});

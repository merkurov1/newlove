import {
  RITUAL_EVENT_TYPES,
  TEMPLE_RITUAL_DEFINITIONS,
  isTempleChroniclesPage,
  projectPublicTempleEvent,
  type TempleChronicleEvent,
  type TempleLogRow,
} from '@/lib/temple/feed';
import {
  buildTempleChroniclesPage,
  decodeTempleCursor,
  encodeTempleCursor,
  groupTempleChronicleEvents,
  mergeTempleChronicleEvents,
} from '@/lib/temple/chronicles';

const NOW = '2026-11-24T12:00:00.000Z';

function row(
  id: string,
  eventType: string,
  overrides: Partial<TempleLogRow> = {}
): TempleLogRow {
  return {
    id,
    event_type: eventType,
    author: 'Anonymous',
    message: 'private stored text that must never be published',
    created_at: NOW,
    ...overrides,
  };
}

function event(
  id: string,
  occurredAt: string
): TempleChronicleEvent {
  return {
    id,
    ritual: 'ASH',
    ritualLabel: 'Let It Go',
    description: 'Released a burden and let it go.',
    occurredAt,
    visitor: null,
  };
}

describe('public chronicle projection', () => {
  it.each(RITUAL_EVENT_TYPES)(
    'gives %s a human label and description',
    (eventType) => {
      const projected = projectPublicTempleEvent(row(`id-${eventType}`, eventType));

      expect(projected).not.toBeNull();
      expect(projected?.ritual).toBe(eventType);
      expect(projected?.ritualLabel).toBe(
        TEMPLE_RITUAL_DEFINITIONS[eventType].label
      );
      expect(projected?.description).toBe(
        TEMPLE_RITUAL_DEFINITIONS[eventType].description
      );
      expect(projected?.description).not.toBe('');
    }
  );

  it('never copies the stored message into a public event', () => {
    const projected = projectPublicTempleEvent(
      row('raw', 'WHISPER', {
        message: 'VISIT 12s duration=12 intensity=0.4',
      })
    );

    expect(projected?.description).toBe('Left a whisper in the Temple.');
    expect(JSON.stringify(projected)).not.toContain('VISIT');
    expect(JSON.stringify(projected)).not.toContain('intensity');
  });

  it('keeps Absolution anonymous and completion-only even for legacy rows', () => {
    const projected = projectPublicTempleEvent(
      row('absolution', 'ABSOLUTION', {
        author: 'Alice Example',
        message: 'Alice confessed: "Lust: Digital voyeurism"',
        is_public_identity: true,
      })
    );

    expect(projected?.visitor).toBeNull();
    expect(projected?.description).toBe('Completed the Absolution ritual.');
    expect(JSON.stringify(projected)).not.toContain('Alice');
    expect(JSON.stringify(projected)).not.toContain('Lust');
  });

  it('redacts raw Cast answers for legacy rows', () => {
    const projected = projectPublicTempleEvent(
      row('cast', 'CAST', {
        author: 'Pilgrim',
        message: 'answer 1: a private answer that must never be public',
      })
    );

    expect(projected?.description).toBe('Completed the Cast ritual.');
    expect(JSON.stringify(projected)).not.toContain('private answer');
  });

  it('shows a visitor name only after explicit opt-in', () => {
    expect(
      projectPublicTempleEvent(row('private', 'ASH', { author: 'Alice' }))
        ?.visitor
    ).toBeNull();

    expect(
      projectPublicTempleEvent(
        row('public', 'ASH', {
          author: 'Alice',
          is_public_identity: true,
        })
      )?.visitor
    ).toBe('Alice');
  });

  it('ignores incomplete, infrastructure and unknown rows', () => {
    expect(projectPublicTempleEvent(row('modal', 'MODAL_OPEN'))).toBeNull();
    expect(projectPublicTempleEvent(row('nav', 'NAV'))).toBeNull();
    expect(projectPublicTempleEvent(row('unknown', 'MYSTERY'))).toBeNull();
  });
});

describe('chronicle cursor pagination', () => {
  it('round-trips a stable (occurredAt, id) cursor', () => {
    const cursor = encodeTempleCursor({ occurredAt: NOW, id: 'trace-42' });

    expect(decodeTempleCursor(cursor)).toEqual({
      occurredAt: NOW,
      id: 'trace-42',
    });
  });

  it('rejects malformed or unsafe cursors', () => {
    expect(decodeTempleCursor('not-a-cursor')).toBeNull();
    expect(decodeTempleCursor('')).toBeNull();
    expect(
      decodeTempleCursor(
        encodeTempleCursor({ occurredAt: 'not-a-date', id: 'trace-1' })
      )
    ).toBeNull();
  });

  it('returns one extra row as hasMore and a cursor for the next page', () => {
    const page = buildTempleChroniclesPage(
      [
        row('newest', 'ASH', { created_at: '2026-11-24T12:00:00.000Z' }),
        row('middle', 'VIGIL_SPARK', {
          created_at: '2026-11-24T11:00:00.000Z',
        }),
        row('oldest', 'CAST', { created_at: '2026-11-24T10:00:00.000Z' }),
      ],
      2
    );

    expect(page.events.map((item) => item.id)).toEqual(['newest', 'middle']);
    expect(page.hasMore).toBe(true);
    expect(decodeTempleCursor(page.nextCursor)).toEqual({
      occurredAt: '2026-11-24T11:00:00.000Z',
      id: 'middle',
    });
  });

  it('sorts ties by id descending and deduplicates repeated ids', () => {
    const page = buildTempleChroniclesPage(
      [
        row('a', 'ASH', { created_at: NOW }),
        row('b', 'ASH', { created_at: NOW }),
        row('b', 'ASH', { created_at: NOW }),
        row('c', 'ASH', { created_at: NOW }),
      ],
      10
    );

    expect(page.events.map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('chronicle merging and grouping', () => {
  it('deduplicates realtime refreshes and keeps newest first', () => {
    const existing = [
      event('b', '2026-11-24T11:00:00.000Z'),
      event('a', '2026-11-24T10:00:00.000Z'),
    ];
    const incoming = [
      event('c', '2026-11-24T12:00:00.000Z'),
      event('b', '2026-11-24T11:00:00.000Z'),
    ];

    expect(
      mergeTempleChronicleEvents(existing, incoming).map((item) => item.id)
    ).toEqual(['c', 'b', 'a']);
  });

  it('groups events by UTC calendar day with a stable label', () => {
    const days = groupTempleChronicleEvents([
      event('1', '2026-11-24T23:59:00.000Z'),
      event('2', '2026-11-24T00:01:00.000Z'),
      event('3', '2026-11-23T12:00:00.000Z'),
    ]);

    expect(days.map((day) => day.key)).toEqual(['2026-11-24', '2026-11-23']);
    expect(days[0].events.map((item) => item.id)).toEqual(['1', '2']);
    expect(days[0].label).toBe('24 November 2026');
  });
});

describe('chronicle page validation', () => {
  it('accepts a well-formed page and rejects arbitrary payloads', () => {
    expect(
      isTempleChroniclesPage({
        ok: true,
        events: [event('1', NOW)],
        pageInfo: { nextCursor: null, hasMore: false, limit: 20 },
        aggregates: null,
        error: null,
      })
    ).toBe(true);

    expect(isTempleChroniclesPage({ ok: true, events: [{ id: 1 }] })).toBe(
      false
    );
  });
});

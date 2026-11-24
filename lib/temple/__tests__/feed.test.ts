import {
  TEMPLE_TRACE_LIMIT,
  aggregateTempleRows,
  classifyTempleEventType,
  isNamedTempleAuthor,
  normalizeAuthorKey,
  normalizeTempleEventType,
  selectTempleTraces,
  type TempleLogRow,
} from '@/lib/temple/feed';

const WINDOW_END = Date.parse('2026-11-24T12:00:00.000Z');
const WINDOW_START = WINDOW_END - 30 * 24 * 60 * 60 * 1000;

function row(
  id: string,
  eventType: string,
  createdAt: string,
  author = 'Pilgrim'
): TempleLogRow {
  return {
    id,
    event_type: eventType,
    author,
    message: `${eventType} message`,
    created_at: createdAt,
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('Temple event normalization', () => {
  it('normalizes case, whitespace and hyphen variants to one canonical type', () => {
    expect(normalizeTempleEventType('vigil')).toBe('VIGIL');
    expect(normalizeTempleEventType('Vigil Spark')).toBe('VIGIL_SPARK');
    expect(normalizeTempleEventType('vigil-spark')).toBe('VIGIL_SPARK');
    expect(normalizeTempleEventType('VIGILSPARK')).toBe('VIGIL_SPARK');
    expect(normalizeTempleEventType('Let It Go')).toBe('ASH');
    expect(normalizeTempleEventType('letitgo')).toBe('ASH');
    expect(normalizeTempleEventType('let-go')).toBe('ASH');
    expect(normalizeTempleEventType('modal-open')).toBe('MODAL_OPEN');
    expect(normalizeTempleEventType('Heart & Angel')).toBe('HEARTANDANGEL');
  });

  it('classifies rituals, incomplete signals, infrastructure and unknown types separately', () => {
    expect(classifyTempleEventType('ash')).toBe('ritual');
    expect(classifyTempleEventType('VIGIL_SPARK')).toBe('ritual');
    expect(classifyTempleEventType('modal_open')).toBe('incomplete');
    expect(classifyTempleEventType('intensity')).toBe('incomplete');
    expect(classifyTempleEventType('enter')).toBe('infrastructure');
    expect(classifyTempleEventType('nav')).toBe('infrastructure');
    expect(classifyTempleEventType('page_view')).toBe('infrastructure');
    expect(classifyTempleEventType('mystery_event')).toBe('unclassified');
  });

  it('counts named authors case-insensitively without treating placeholders as people', () => {
    expect(normalizeAuthorKey('  Alice   Example ')).toBe('alice example');
    expect(isNamedTempleAuthor('Alice')).toBe(true);
    expect(isNamedTempleAuthor('PILGRIM')).toBe(false);
    expect(isNamedTempleAuthor('Anonymous')).toBe(false);
    expect(isNamedTempleAuthor('')).toBe(false);
  });
});

describe('Temple Chronicles aggregation', () => {
  it('covers the whole window and uses inclusive UTC boundaries', () => {
    const rows = [
      row('before', 'ASH', iso(WINDOW_START - 1)),
      row('at-start', 'ASH', iso(WINDOW_START)),
      row('inside', 'ASH', iso(WINDOW_END - 1000)),
      row('at-end', 'ASH', iso(WINDOW_END)),
      row('after', 'ASH', iso(WINDOW_END + 1)),
    ];

    const stats = aggregateTempleRows(rows, WINDOW_START, WINDOW_END);

    expect(stats.completedRituals).toBe(3);
    expect(stats.byType).toEqual({ ASH: 3 });
  });

  it('does not double-count legacy case variants or duplicate rows', () => {
    const rows = [
      row('1', 'vigil_spark', iso(WINDOW_END - 6_000), 'Pilgrim'),
      row('2', 'VIGIL_SPARK', iso(WINDOW_END - 5_000), 'pilgrim'),
      row('3', 'vigil-spark', iso(WINDOW_END - 4_000), '  PILGRIM '),
      row('4', 'Vigil Spark', iso(WINDOW_END - 3_000), 'Alice'),
      row('4', 'Vigil Spark', iso(WINDOW_END - 3_000), 'Alice'),
      row('5', 'VIGILSPARK', iso(WINDOW_END - 2_000), 'alice'),
      row('6', 'vigil', iso(WINDOW_END - 1_000), 'Anonymous'),
    ];

    const stats = aggregateTempleRows(rows, WINDOW_START, WINDOW_END);

    expect(stats.completedRituals).toBe(6);
    expect(stats.byType).toEqual({ VIGIL_SPARK: 5, VIGIL: 1 });
    expect(stats.vigilSparks).toBe(6);
    expect(stats.namedAuthors).toBe(1);
  });

  it('excludes entry, navigation, incomplete and unclassified rows from completed rituals', () => {
    const rows = [
      row('ritual', 'ASH', iso(WINDOW_END - 1_000)),
      row('modal', 'MODAL_OPEN', iso(WINDOW_END - 2_000)),
      row('intensity', 'INTENSITY', iso(WINDOW_END - 3_000)),
      row('enter', 'enter', iso(WINDOW_END - 4_000)),
      row('nav', 'NAV', iso(WINDOW_END - 5_000)),
      row('unknown', 'MYSTERY', iso(WINDOW_END - 6_000)),
    ];

    const stats = aggregateTempleRows(rows, WINDOW_START, WINDOW_END);

    expect(stats.completedRituals).toBe(1);
    expect(stats.byType).toEqual({ ASH: 1 });
    expect(stats.namedAuthors).toBe(0);
  });
});

describe('Temple trace selection', () => {
  it('returns exactly the seven newest eligible rituals and preserves the raw type', () => {
    const rows: TempleLogRow[] = [];

    for (let index = 0; index < 12; index += 1) {
      rows.push(
        row(
          `ritual-${index}`,
          index % 2 === 0 ? 'ash' : 'VIGIL_SPARK',
          iso(WINDOW_END - index * 1_000)
        )
      );
    }

    rows.push(
      row('enter', 'enter', iso(WINDOW_END + 10_000)),
      row('nav', 'nav', iso(WINDOW_END + 9_000)),
      row('modal', 'MODAL_OPEN', iso(WINDOW_END + 8_000)),
      row('unknown', 'MYSTERY', iso(WINDOW_END + 7_000))
    );

    const traces = selectTempleTraces(rows);

    expect(traces).toHaveLength(TEMPLE_TRACE_LIMIT);
    expect(traces.map((trace) => trace.id)).toEqual([
      'ritual-0',
      'ritual-1',
      'ritual-2',
      'ritual-3',
      'ritual-4',
      'ritual-5',
      'ritual-6',
    ]);
    expect(traces[0].event_type).toBe('ash');
    expect(traces[0].canonical_type).toBe('ASH');
    expect(traces[1].event_type).toBe('VIGIL_SPARK');
    expect(traces[1].canonical_type).toBe('VIGIL_SPARK');
  });

  it('does not let infrastructure or incomplete rows crowd out rituals', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, index) =>
        row('enter-' + index, 'enter', iso(WINDOW_END - index * 1_000))
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        row('modal-' + index, 'MODAL_OPEN', iso(WINDOW_END - index * 1_000))
      ),
      row('ritual-newest', 'ASH', iso(WINDOW_END - 5_000)),
      row('ritual-older', 'CAST', iso(WINDOW_END - 10_000)),
    ];

    const traces = selectTempleTraces(rows);

    expect(traces.map((trace) => trace.id)).toEqual([
      'ritual-newest',
      'ritual-older',
    ]);
  });
});

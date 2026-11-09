/** @jest-environment node */

import fs from 'fs';
import path from 'path';
import {
  detectIntakeMutation,
  detectIntakeQuery,
  formatIntakeAnswer,
  formatIntakeSaved,
} from '../query';
import { intakeRangeForQuery, saveIntakeItems } from '../store';
import type { IntakeLog } from '../types';

const ROW: IntakeLog = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'user-1',
  type: 'food',
  itemName: 'яйца',
  quantity: 2,
  unit: null,
  rawText: 'Съел два яйца',
  occurredAt: '2026-11-09T08:00:00.000Z',
  timezone: 'Europe/London',
  sourceMessageId: 'msg-1',
  confidence: 0.9,
  createdAt: '2026-11-09T08:00:01.000Z',
};

describe('intake query detection', () => {
  it.each([
    ['Что я сегодня ел?', { kind: 'list', period: 'today' }],
    ['Покажи всё за вчера', { kind: 'list', period: 'yesterday' }],
    ['Сколько раз я ел сегодня?', { kind: 'count', period: 'today' }],
    ['Сколько воды выпил?', { kind: 'water', period: 'today' }],
    ['Что я ел на этой неделе?', { kind: 'list', period: 'week' }],
    ['Покажи историю за последние семь дней', { kind: 'list', period: 'last7' }],
    ['What did I eat today?', { kind: 'list', period: 'today' }],
  ])('%s', (message, expected) => {
    expect(detectIntakeQuery(message)).toEqual(expected);
  });

  it('does not treat ordinary food discussion as a query', () => {
    expect(detectIntakeQuery('Расскажи о средиземноморской диете')).toBeNull();
  });
});

describe('intake mutation detection', () => {
  it('detects deleting the last record', () => {
    expect(detectIntakeMutation('Удали последнюю запись о еде')).toEqual({
      kind: 'delete_last',
    });
  });

  it('detects correcting the last record', () => {
    expect(
      detectIntakeMutation('Исправь последнюю запись: это был чай')
    ).toEqual({ kind: 'correct_last', replacement: 'это был чай' });
  });

  it('does not treat an ordinary edit request as an intake mutation', () => {
    expect(detectIntakeMutation('Исправь текст статьи')).toBeNull();
  });
});

describe('intake formatting', () => {
  it('lists products and totals without calculating calories', () => {
    const text = formatIntakeAnswer({
      rows: [ROW],
      query: { kind: 'list', period: 'today' },
      language: 'ru',
      timezone: 'Europe/London',
      timezoneKnown: true,
    });

    expect(text).toContain('яйца');
    expect(text).toContain('2');
    expect(text).toContain('1 записей о еде');
    expect(text).not.toContain('калорий:');
  });

  it('sums only measured water and states what is missing', () => {
    const water: IntakeLog = {
      ...ROW,
      id: 'w1',
      type: 'drink',
      itemName: 'вода',
      quantity: 500,
      unit: 'мл',
    };
    const unknown: IntakeLog = {
      ...ROW,
      id: 'w2',
      type: 'drink',
      itemName: 'вода',
      quantity: null,
      unit: null,
    };
    const text = formatIntakeAnswer({
      rows: [water, unknown],
      query: { kind: 'water', period: 'today' },
      language: 'ru',
      timezone: 'Europe/London',
      timezoneKnown: true,
    });

    expect(text).toContain('500 мл');
    expect(text).toContain('подтверждён только для 1 из 2');
  });

  it('flags an unknown timezone instead of pretending day boundaries are exact', () => {
    const text = formatIntakeAnswer({
      rows: [],
      query: { kind: 'list', period: 'today' },
      language: 'ru',
      timezone: 'UTC',
      timezoneKnown: false,
    });
    expect(text).toContain('Часовой пояс владельца не настроен');
  });

  it('formats a saved confirmation', () => {
    expect(
      formatIntakeSaved(
        [
          {
            type: 'drink',
            itemName: 'кофе с молоком',
            quantity: null,
            unit: null,
            occurredAt: ROW.occurredAt,
            timezone: 'Europe/London',
          },
        ],
        'ru'
      )
    ).toBe('Записал:\n- кофе с молоком');
  });
});

describe('timezone-aware ranges', () => {
  const now = new Date('2026-11-09T12:00:00.000Z');

  it('uses the owner timezone for today', () => {
    const range = intakeRangeForQuery(
      { kind: 'list', period: 'today' },
      { now, timezone: 'Europe/London' }
    );
    expect(range.from?.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(range.to?.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('uses the owner timezone for yesterday', () => {
    const range = intakeRangeForQuery(
      { kind: 'list', period: 'yesterday' },
      { now, timezone: 'Europe/London' }
    );
    expect(range.from?.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(range.to?.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });
});

describe('duplicate protection', () => {
  it('uses an idempotent upsert keyed by owner, message and item index', async () => {
    const upsert = jest.fn().mockReturnValue({
      select: () => Promise.resolve({ data: [], error: null }),
    });
    const store = { from: jest.fn(() => ({ upsert })) } as never;

    const result = await saveIntakeItems(store, {
      userId: 'user-1',
      items: [
        {
          type: 'food',
          itemName: 'яйца',
          quantity: 2,
          unit: null,
          occurredAt: ROW.occurredAt,
          timezone: 'Europe/London',
        },
      ],
      rawText: 'Съел два яйца',
      sourceMessageId: 'msg-1',
      confidence: 0.9,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          source_message_id: 'msg-1',
          item_index: 0,
        }),
      ]),
      { onConflict: 'user_id,source_message_id,item_index', ignoreDuplicates: true }
    );
    expect(result.duplicate).toBe(true);
  });

  it('defines RLS and a unique source/item index in the migration', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'migrations/2026-11-25_pierrot_intake_logs.sql'),
      'utf8'
    );
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/unique index[^;]+source_message_id[^;]+item_index/is);
    expect(sql).toMatch(/revoke all on public\.intake_logs from anon/i);
  });
});

/** @jest-environment node */

import {
  buildDailyDigest,
  classifyActivityCategory,
  detectCompletionSignal,
  groupTimelineByDay,
} from '../timeline';
import type { TimelineEvent } from '../types';

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: 'e1',
    type: 'message',
    title: 'Event',
    description: 'Event',
    occurredAt: '2026-11-11T10:00:00.000Z',
    recordedAt: '2026-11-11T10:00:00.000Z',
    evidenceClass: 'DIRECTLY_OBSERVED',
    projectId: null,
    entityId: null,
    conversationId: 'c1',
    messageId: 'm1',
    category: 'PROJECT_DEVELOPMENT',
    status: 'observed',
    intention: false,
    completed: false,
    href: null,
    metadata: {},
    ...overrides,
  };
}

describe('timeline chronology', () => {
  it('groups by the display timezone, not by UTC date', () => {
    const groups = groupTimelineByDay(
      [
        event({ id: 'late', occurredAt: '2026-11-10T23:30:00.000Z' }),
        event({ id: 'early', occurredAt: '2026-11-10T20:30:00.000Z' }),
      ],
      'Europe/Moscow'
    );

    expect(groups.map((group) => group.day)).toEqual(['2026-11-10', '2026-11-11']);
    expect(groups[1].events[0].id).toBe('late');
  });

  it('keeps event time separate from ingestion time', () => {
    const groups = groupTimelineByDay(
      [
        event({
          id: 'imported',
          occurredAt: '2026-11-09T10:00:00.000Z',
          recordedAt: '2026-11-11T10:00:00.000Z',
        }),
      ],
      'UTC'
    );
    expect(groups[0].day).toBe('2026-11-09');
  });
});

describe('daily digest evidence rules', () => {
  it('does not turn an intention into a completed achievement', () => {
    const digest = buildDailyDigest({
      timezone: 'Europe/Moscow',
      period: {
        key: 'today',
        from: '2026-11-10T21:00:00.000Z',
        to: '2026-11-11T21:00:00.000Z',
        label: '11 ноября 2026',
      },
      events: [
        event({
          id: 'intent',
          description: 'Нужно сделать промо-видео',
          completed: false,
          intention: true,
          evidenceClass: 'DIRECTLY_OBSERVED',
        }),
        event({
          id: 'done',
          description: 'Промо-видео опубликовано',
          completed: true,
          intention: false,
          evidenceClass: 'USER_CONFIRMED',
        }),
      ],
    });

    expect(digest.completed.map((item) => item.id)).toEqual(['done']);
    expect(digest.intentions.map((item) => item.id)).toEqual(['intent']);
  });

  it('reports missing activity as a gap, not as zero work', () => {
    const digest = buildDailyDigest({
      timezone: 'UTC',
      period: {
        key: 'today',
        from: '2026-11-11T00:00:00.000Z',
        to: '2026-11-12T00:00:00.000Z',
        label: '11 November 2026',
      },
      events: [],
    });
    expect(digest.completed).toHaveLength(0);
    expect(digest.gaps.join(' ')).toMatch(/не означает/i);
  });
});

describe('activity and completion signals', () => {
  it('classifies work categories from real wording', () => {
    expect(classifyActivityCategory('Написал главу о Spectral Tiger')).toBe('WRITING');
    expect(classifyActivityCategory('Опубликовал промо-видео')).toBe('PUBLISHING');
    expect(classifyActivityCategory('Починил deploy на Vercel')).toBe('TECHNICAL_WORK');
  });

  it('distinguishes a completed action from a future intention', () => {
    expect(detectCompletionSignal('Я завершил финальную структуру книги')).toEqual({
      completed: true,
      intention: false,
    });
    expect(detectCompletionSignal('Нужно завершить финальную структуру')).toEqual({
      completed: false,
      intention: true,
    });
  });
});

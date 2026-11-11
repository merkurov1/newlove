/** @jest-environment node */

import { formatContextReport } from '../report';
import type { ContextQueryResult, TimelineEvent } from '../types';

function baseResult(overrides: Partial<ContextQueryResult>): ContextQueryResult {
  return {
    plan: {
      intent: 'DAILY_SUMMARY',
      originalQuery: 'Что мы делали сегодня?',
      query: '',
      confidence: 0.8,
      signals: [],
      period: {
        key: 'today',
        from: '2026-11-10T21:00:00.000Z',
        to: '2026-11-11T21:00:00.000Z',
        label: '11 ноября 2026',
      },
      timezone: 'Europe/Moscow',
      timezoneKnown: true,
      projectHint: null,
      entityTypeHint: null,
      wantsOriginalSource: false,
      explicit: true,
    },
    hits: [],
    documents: [],
    timeline: [],
    daily: null,
    projectState: null,
    ambiguities: [],
    notes: [],
    gaps: [],
    counts: {
      messages: 0,
      conversations: 0,
      projects: 0,
      tasks: 0,
      decisions: 0,
      documents: 0,
      projectEvents: 0,
      entities: 0,
    },
    widenedFromProject: false,
    ...overrides,
  };
}

const event: TimelineEvent = {
  id: 'e1',
  type: 'task',
  title: 'Промо-видео',
  description: 'Промо-видео опубликовано',
  occurredAt: '2026-11-11T10:00:00.000Z',
  recordedAt: '2026-11-11T10:00:00.000Z',
  evidenceClass: 'USER_CONFIRMED',
  projectId: 'p1',
  entityId: null,
  conversationId: 'c1',
  messageId: 'm1',
  category: 'PUBLISHING',
  status: 'completed',
  intention: false,
  completed: true,
  href: '/admin/pierrot?project=unframed',
  metadata: {},
};

describe('context report', () => {
  it('shows confirmed completion separately from intentions', () => {
    const result = baseResult({
      daily: {
        timezone: 'Europe/Moscow',
        period: null,
        completed: [event],
        decisions: [],
        deliverables: [],
        intentions: [
          {
            ...event,
            id: 'e2',
            description: 'Нужно собрать предложение',
            completed: false,
            intention: true,
            evidenceClass: 'DIRECTLY_OBSERVED',
          },
        ],
        discussions: [],
        gaps: [],
      },
    });

    const text = formatContextReport(result, 'ru');
    expect(text).toContain('Завершено (подтверждено)');
    expect(text).toContain('Промо-видео опубликовано');
    expect(text).toContain('В работе / намерения');
    expect(text).toContain('Нужно собрать предложение');
    expect(text).toContain('подтверждено владельцем');
  });

  it('presents ambiguous entities as separate candidates', () => {
    const result = baseResult({
      plan: {
        ...baseResult({}).plan,
        intent: 'ENTITY_DISTINCTION',
        originalQuery: 'What is UNFRAMED?',
      },
      ambiguities: [
        {
          name: 'UNFRAMED',
          reason: 'MULTIPLE_TYPES',
          hint: null,
          candidates: [
            {
              id: 'book',
              entityType: 'BOOK',
              name: 'UNFRAMED',
              description: 'Literary work.',
              projectId: 'p1',
              status: 'active',
              score: 1,
              aliases: [],
            },
            {
              id: 'project',
              entityType: 'PROJECT',
              name: 'UNFRAMED',
              description: 'Creative project.',
              projectId: 'p1',
              status: 'active',
              score: 1,
              aliases: [],
            },
          ],
        },
      ],
    });

    const text = formatContextReport(result, 'en');
    expect(text).toContain('refers to more than one entity');
    expect(text).toContain('BOOK');
    expect(text).toContain('PROJECT');
    expect(text).toContain('I will not choose one');
  });

  it('names missing history instead of inventing it', () => {
    const result = baseResult({
      plan: {
        ...baseResult({}).plan,
        intent: 'PROJECT_HISTORY',
        originalQuery: 'Show the history of UNFRAMED',
        timezone: 'UTC',
      },
      gaps: ['No saved messages in this period.'],
    });

    const text = formatContextReport(result, 'en');
    expect(text).toContain('No saved events matched this request');
    expect(text).toContain('will not reconstruct history from guesses');
  });
});

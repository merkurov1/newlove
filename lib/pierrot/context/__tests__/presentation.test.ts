/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { buildContextResponse } from '../presentation';
import type {
  ContextHit,
  ContextQueryResult,
  ContextQueryPlan,
  TimelineEvent,
} from '../types';

function plan(overrides: Partial<ContextQueryPlan> = {}): ContextQueryPlan {
  return {
    intent: 'DAILY_SUMMARY',
    originalQuery: 'Что я сегодня делал?',
    query: 'делал',
    confidence: 0.8,
    signals: ['intent:daily', 'period:today'],
    period: {
      key: 'today',
      from: '2026-11-11T00:00:00.000Z',
      to: '2026-11-12T00:00:00.000Z',
      label: '11 ноября 2026',
    },
    timezone: 'Europe/Moscow',
    timezoneKnown: true,
    projectHint: null,
    entityTypeHint: null,
    wantsOriginalSource: false,
    explicit: true,
    ...overrides,
  };
}

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'event-1',
    type: 'deliverable',
    title: 'Опубликован выпуск Journal',
    description: 'Выпуск опубликован.',
    occurredAt: '2026-11-11T10:00:00.000Z',
    recordedAt: '2026-11-11T10:01:00.000Z',
    evidenceClass: 'DOCUMENTED',
    projectId: 'project-1',
    entityId: null,
    conversationId: 'conversation-1',
    messageId: 'message-1',
    category: 'PUBLISHING',
    status: 'completed',
    intention: false,
    completed: true,
    href: '/letters/issue-25',
    metadata: {},
    ...overrides,
  };
}

function hit(overrides: Partial<ContextHit> = {}): ContextHit {
  return {
    id: 'hit-1',
    sourceType: 'message',
    sourceId: 'message-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    projectId: 'project-1',
    projectName: 'UNFRAMED',
    projectSlug: 'unframed',
    entityId: 'entity-1',
    title: 'UNFRAMED episode proposal',
    excerpt: 'Обсуждали структуру эпизода.',
    eventAt: '2026-11-10T10:00:00.000Z',
    ingestedAt: '2026-11-10T10:00:01.000Z',
    retrievalMethod: 'hybrid',
    confidence: 0.8,
    evidenceClass: 'DOCUMENTED',
    href: '/admin/pierrot?message=message-1',
    metadata: {},
    ...overrides,
  };
}

function result(overrides: Partial<ContextQueryResult> = {}): ContextQueryResult {
  const completed = event();
  return {
    plan: plan(),
    hits: [],
    documents: [],
    timeline: [completed],
    daily: {
      timezone: 'Europe/Moscow',
      period: plan().period,
      completed: [completed],
      decisions: [],
      deliverables: [],
      intentions: [],
      discussions: [],
      gaps: [],
    },
    projectState: null,
    ambiguities: [],
    notes: [],
    gaps: [],
    counts: {
      messages: 4,
      conversations: 2,
      projects: 1,
      tasks: 1,
      decisions: 0,
      documents: 0,
      projectEvents: 1,
      entities: 1,
    },
    widenedFromProject: false,
    ...overrides,
  };
}

describe('context presentation', () => {
  it('composes a daily report as metrics and a timeline, without inventing a chart', () => {
    const response = buildContextResponse(result(), 'Короткий итог дня.', 'ru');
    const types = response?.blocks.map((block) => block.type);

    expect(types).toContain('text');
    expect(types).toContain('metric');
    expect(types).toContain('timeline');
    expect(types).not.toContain('chart');
    expect(JSON.stringify(response)).not.toContain('fabricated');
  });

  it('adds a real chart when the user explicitly asks for a graph', () => {
    const response = buildContextResponse(
      result({
        plan: plan({ originalQuery: 'Покажи график дня' }),
        timeline: [
          event({ id: 'e1', occurredAt: '2026-11-10T10:00:00.000Z' }),
          event({ id: 'e2', occurredAt: '2026-11-11T10:00:00.000Z' }),
        ],
      }),
      'Итог.',
      'ru'
    );

    const chart = response?.blocks.find((block) => block.type === 'chart');
    expect(chart?.type === 'chart' && chart.data).toHaveLength(2);
    expect(chart?.type === 'chart' && chart.xKey).toBe('date');
  });

  it('adds a diagram from retrieved entities when asked for one', () => {
    const response = buildContextResponse(
      result({
        plan: plan({ originalQuery: 'Покажи диаграмму проекта' }),
        hits: [hit(), hit({ id: 'hit-2', entityId: 'entity-2', title: 'Spectral Tiger' })],
      }),
      'Итог.',
      'ru'
    );

    const diagram = response?.blocks.find((block) => block.type === 'diagram');
    expect(diagram?.type === 'diagram' && diagram.nodes.length).toBeGreaterThanOrEqual(2);
    expect(diagram?.type === 'diagram' && diagram.edges.length).toBeGreaterThan(0);
  });

  it('does not draw a diagram or chart when the evidence is insufficient', () => {
    const response = buildContextResponse(
      result({
        plan: plan({ originalQuery: 'Покажи график и диаграмму' }),
        hits: [],
        timeline: [],
      }),
      'Итог.',
      'ru'
    );

    expect(response?.blocks.some((block) => block.type === 'chart')).toBe(false);
    expect(response?.blocks.some((block) => block.type === 'diagram')).toBe(false);
    expect(response?.blocks.some((block) => block.type === 'warning')).toBe(true);
  });

  it('composes project status as a status block plus remaining work', () => {
    const response = buildContextResponse(
      result({
        plan: plan({ intent: 'PROJECT_STATUS', query: 'статус проекта' }),
        projectState: {
          projectId: 'project-1',
          projectName: 'UNFRAMED',
          status: 'IN_PROGRESS',
          statusReason: 'Серия в работе, книга завершена.',
          workstreams: [
            {
              id: 'workstream-1',
              entityType: 'BOOK',
              name: 'UNFRAMED_BOOK',
              status: 'COMPLETED',
              openTasks: 0,
              completedTasks: 4,
              deliverables: 3,
              notes: [],
              evidenceIds: ['event-1'],
            },
          ],
          completed: [event()],
          remaining: [event({ id: 'event-2', title: 'Episode 1', completed: false })],
          blocked: [],
          decisions: [],
          deliverables: [],
          gaps: [],
        },
      }),
      'Проект в работе.',
      'ru'
    );

    const status = response?.blocks.find((block) => block.type === 'project_status');
    expect(status?.type === 'project_status' && status.projectName).toBe('UNFRAMED');
    expect(status?.type === 'project_status' && status.status).toBe('IN_PROGRESS');
  });
});

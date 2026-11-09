/** @jest-environment node */

import { detectUnifiedSearchIntent } from '../intent';
import { formatUnifiedSearchReport } from '../format';

describe('unified owner search intent', () => {
  it('detects a search across conversations', () => {
    expect(detectUnifiedSearchIntent('Найди всё, что мы обсуждали по Heart & Angel')).toMatchObject({
      scope: 'all',
      explicit: true,
    });
    expect(detectUnifiedSearchIntent('Где мы обсуждали новую структуру Sidebar?')).toMatchObject({
      scope: 'all',
      explicit: true,
    });
  });

  it('detects tasks, decisions, documents and issues', () => {
    expect(detectUnifiedSearchIntent('Какие задачи остались по Art Engine?')).toMatchObject({
      scope: 'tasks',
    });
    expect(detectUnifiedSearchIntent('Покажи последние решения по Pierrot')).toMatchObject({
      scope: 'decisions',
    });
    expect(detectUnifiedSearchIntent('Найди заметку о проекте Unframed')).toMatchObject({
      scope: 'documents',
    });
    expect(detectUnifiedSearchIntent('Найди GitHub issues по Art Engine')).toMatchObject({
      scope: 'issues',
    });
  });

  it('does not turn ordinary chat into a search command', () => {
    expect(detectUnifiedSearchIntent('Как дела с Journal?')).toBeNull();
    expect(detectUnifiedSearchIntent('Что у нас сегодня?')).toBeNull();
    expect(detectUnifiedSearchIntent('Запомни, что нужно проверить лот')).toBeNull();
  });
});

describe('unified search report', () => {
  it('keeps sources, project badges and links without copying full transcripts', () => {
    const text = formatUnifiedSearchReport({
      query: 'Heart & Angel',
      project: { id: 'p1', name: 'Heart & Angel', slug: 'heart-and-angel' },
      hits: [
        {
          source: 'conversation',
          id: 'c1',
          title: 'Мобильная версия',
          snippet: 'Owner: нужно опустить шарик ниже',
          projectId: 'p1',
          projectName: 'Heart & Angel',
          projectSlug: 'heart-and-angel',
          href: '/admin/pierrot?project=heart-and-angel',
          status: null,
          updatedAt: '2026-11-06T10:00:00Z',
        },
        {
          source: 'task',
          id: 't1',
          title: 'Опустить шарик',
          snippet: 'Проверить на мобильных',
          projectId: 'p1',
          projectName: 'Heart & Angel',
          projectSlug: 'heart-and-angel',
          href: '/admin/pierrot?project=heart-and-angel',
          status: 'current',
          updatedAt: '2026-11-06T10:00:00Z',
        },
      ],
      notes: [],
    });

    expect(text).toContain('Разговоры');
    expect(text).toContain('Задачи');
    expect(text).toContain('Heart & Angel');
    expect(text).toContain('[Открыть](/admin/pierrot?project=heart-and-angel)');
    expect(text.length).toBeLessThan(2_000);
  });
});

/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { detectEditorialIntent } from '../editorial/intent';
import { emptyEditorialContext } from '../editorial/types';
import { planPierrotTurn, resolveEditorialOwnership } from '../orchestrator';

const now = new Date('2026-11-11T12:00:00.000Z');
const options = { now, timezone: 'Europe/Moscow', timezoneKnown: true };

describe('turn orchestration', () => {
  it('routes an explicit historical question to the context engine', () => {
    const plan = planPierrotTurn({ message: 'Что я делал сегодня?', ...options });

    expect(plan.route).toBe('context');
    expect(plan.contextQuery?.intent).toBe('DAILY_SUMMARY');
    expect(plan.reasons).toContain('context:DAILY_SUMMARY');
  });

  it('routes a website analytics question to the owner tool, not the context engine', () => {
    const plan = planPierrotTurn({
      message: 'Покажи статистику Bluesky',
      executionPlan: {
        ownerTool: { kind: 'website', query: 'Покажи статистику Bluesky' },
        operation: 'website.report',
      } as never,
      ...options,
    });

    expect(plan.route).toBe('owner_tool');
    expect(plan.contextQuery).toBeNull();
    expect(plan.reasons).toContain('owner_tool:website');
  });

  it('leaves an ordinary question to the model and records why', () => {
    const plan = planPierrotTurn({ message: 'Напиши короткое стихотворение.', ...options });

    expect(plan.route).toBe('general');
    expect(plan.reasons).toContain('general:model');
  });

  it('marks an explicit graph request while still routing through retrieval', () => {
    const plan = planPierrotTurn({ message: 'Покажи график и диаграмму', ...options });

    expect(plan.route).toBe('context');
    expect(plan.visualization).toBe(true);
  });
});

describe('editorial ownership inside an active UNFRAMED chat', () => {
  const activeContext = {
    ...emptyEditorialContext(),
    projectId: 'project-1',
    projectSlug: 'unframed',
    projectName: 'UNFRAMED',
    documentId: 'doc_unframed_manuscript',
    documentTitle: 'UNFRAMED',
  };

  it.each([
    'Как прошёл мой день?',
    'Изучи историю наших диалогов за день',
    'Что мы обсуждали вчера?',
    'Найди в наших разговорах решение по конкретному вопросу.',
    'Покажи график активности за неделю.',
  ])('keeps the global request with the Context Engine: %s', (message) => {
    const plan = planPierrotTurn({ message, ...options });
    const editorialIntent = detectEditorialIntent({
      message,
      activeContext,
      conversationProjectSlug: 'unframed',
    });

    expect(plan.route).toBe('context');
    expect(
      resolveEditorialOwnership({ editorialIntent, contextQuery: plan.contextQuery })
    ).not.toBe('editorial');
  });

  it('keeps an explicit manuscript or chapter request in editorial mode', () => {
    for (const message of [
      'Прочитай главу 14',
      'Найди в книге сцены про Лондон',
      'Что сейчас происходит с проектом UNFRAMED?',
    ]) {
      const plan = planPierrotTurn({ message, ...options });
      const editorialIntent = detectEditorialIntent({
        message,
        activeContext,
        conversationProjectSlug: 'unframed',
      });

      expect(editorialIntent).not.toBeNull();
      expect(
        resolveEditorialOwnership({ editorialIntent, contextQuery: plan.contextQuery })
      ).toBe('editorial');
    }
  });
});

/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { detectContextQuery } from '../intent';

const now = new Date('2026-11-11T12:00:00.000Z');
const options = { now, timezone: 'Europe/Moscow', timezoneKnown: true };

/**
 * Regression set from natural Russian/English requests observed on
 * 11 November 2026. Each case asserts the route, not a generated answer.
 */
describe('context intent regression set', () => {
  it.each([
    ['Что я сегодня делал?', 'DAILY_SUMMARY', 'today'],
    ['Как прошёл мой день?', 'DAILY_SUMMARY', 'today'],
    ['Покажи нормальную картину дня', 'DAILY_SUMMARY', 'today'],
    ['Изучи историю наших диалогов за день', 'PROJECT_HISTORY', 'today'],
    ['Что мы закончили сегодня?', 'ACHIEVEMENT_LOG', 'today'],
    ['Что произошло с проектом за последнюю неделю?', 'PROJECT_HISTORY', 'this_week'],
    ['Найди, о чём мы договорились', 'CONVERSATION_SEARCH', null],
    ['Что изменилось после последнего обновления?', 'PROJECT_HISTORY', null],
    ['Продолжим Unframed', 'PROJECT_HISTORY', null],
    ['Что осталось незавершённым?', 'PROJECT_STATUS', null],
  ])('%s → %s (%s)', (message, intent, periodKey) => {
    const plan = detectContextQuery(message, options);

    expect(plan).not.toBeNull();
    expect(plan?.intent).toBe(intent);
    if (periodKey) expect(plan?.period?.key).toBe(periodKey);
  });

  it('keeps Bluesky statistics with the analytics tool, not the context engine', () => {
    expect(detectContextQuery('Покажи статистику Bluesky', options)).toBeNull();
  });

  it('recognises a request for a graph as an explicit visualisation turn', () => {
    const plan = detectContextQuery('Покажи график и диаграмму', options);

    expect(plan?.intent).toBe('PROJECT_HISTORY');
    expect(plan?.signals).toContain('intent:visualization');
    expect(plan?.period?.key).toBe('last_n_days');
  });

  it('does not treat an ordinary request as historical context', () => {
    expect(detectContextQuery('Что такое структурализм?', options)).toBeNull();
    expect(detectContextQuery('Напиши короткое стихотворение', options)).toBeNull();
  });
});

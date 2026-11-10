/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { detectMediaCatalogQuestion } from '../mediaCatalogIntent';

describe('Pierrot media catalogue routing', () => {
  it.each([
    ['Сколько у меня публикаций за 2026 год?', 'count', 'own'],
    ['Покажи все мои публикации за 2026 год', 'own_period', 'own'],
    ['В каких зарубежных СМИ меня упоминали в 2026 году?', 'mentions', 'mentions'],
    ['Сколько раз меня упоминали в Le Monde?', 'count', 'mentions'],
    ['Покажи все публикации The Washington Post', 'outlet_search', 'all'],
    ['Найди публикации, в которых обсуждается регулирование интернета', 'topic_search', 'all'],
    ['Сравни мои колонки за октябрь 2026 года', 'compare', 'own'],
    ['Какие публикации ещё не проиндексированы?', 'diagnostics', 'all'],
    ['Что говорится в публикации «Не только MAX»?', 'content', 'all'],
    ['Статистика Media Archive', 'analytics', 'all'],
  ] as const)('routes %s to %s', (query, kind, scope) => {
    const plan = detectMediaCatalogQuestion(query);

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe(kind);
    expect(plan?.scope).toBe(scope);
  });

  it('uses the complete catalogue for “публикации в СМИ за 2026 год”', () => {
    const plan = detectMediaCatalogQuestion('Публикации в СМИ за 2026 год');

    expect(plan?.kind).toBe('list');
    expect(plan?.scope).toBe('all');
    expect(plan?.year).toBe(2026);
  });

  it('extracts year, month and outlet filters', () => {
    const plan = detectMediaCatalogQuestion('Сравни мои колонки за октябрь 2026 года');

    expect(plan?.year).toBe(2026);
    expect(plan?.month).toBe(10);
  });

  it('keeps the ambiguous bare publication count on the clarification path', () => {
    expect(detectMediaCatalogQuestion('Сколько у меня публикаций?')).toBeNull();
  });

  it.each([
    'Найди мои статьи про ИИ',
    'Покажи последние публикации',
    'Что я писал про регулирование интернета?',
    'Найди тексты, где я упоминал Vitalik',
    'Найди в Brain заметку о Sotheby’s',
  ])('does not steal personal/Brain request: %s', (query) => {
    expect(detectMediaCatalogQuestion(query)).toBeNull();
  });

  it('recovers the original analysis task and year after a correction', () => {
    const first = 'Сделай анализ медиа за 2026 год';
    const second = 'Нет, ты всё выдумал, поищи по базе медиа';
    const third = 'Ещё раз посмотри в базу медиа какие последние записи';

    const secondPlan = detectMediaCatalogQuestion(second, {
      contextMessages: [first],
    });
    const thirdPlan = detectMediaCatalogQuestion(third, {
      contextMessages: [first, second],
    });

    expect(secondPlan?.kind).toBe('analysis');
    expect(secondPlan?.year).toBe(2026);
    expect(secondPlan?.scope).toBe('all');
    expect(thirdPlan?.kind).toBe('analysis');
    expect(thirdPlan?.year).toBe(2026);
  });

  it('detects a Media analysis report without falling back to semantic list', () => {
    const plan = detectMediaCatalogQuestion('Сделай анализ медиа за 2026 год');
    expect(plan?.kind).toBe('analysis');
    expect(plan?.year).toBe(2026);
  });

  it('extracts a quoted title for content retrieval', () => {
    const plan = detectMediaCatalogQuestion('Что говорится в публикации «Не только MAX»?');
    expect(plan?.titleQuery).toBe('Не только MAX');
  });

  it('extracts pagination', () => {
    const plan = detectMediaCatalogQuestion('Покажи все публикации за 2026 год, страница 3');
    expect(plan?.page).toBe(3);
  });

  it('marks foreign mentions separately from Russian mentions', () => {
    const plan = detectMediaCatalogQuestion(
      'В каких зарубежных СМИ меня упоминали в 2026 году?'
    );
    expect(plan?.filters.foreign).toBe(true);
    expect(plan?.scope).toBe('mentions');
  });
});

/** @jest-environment node */

import {
  classifyFeedback,
  feedbackCategoryLabel,
  toRegressionCase,
} from '../classify';

describe('feedback classification', () => {
  it('separates hallucination, context loss and entity confusion', () => {
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'Ты это выдумал, в документе такого нет' })
        ?.category
    ).toBe('HALLUCINATION');
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'Мы же это обсуждали вчера, ты забыл' })
        ?.category
    ).toBe('CONTEXT_LOSS');
    expect(
      classifyFeedback({
        rating: 'down',
        correctionText: 'Это книга, а не проект — ты перепутал сущности',
      })?.category
    ).toBe('ENTITY_CONFUSION');
  });

  it('separates cross-session, wrong tools and timezone failures', () => {
    expect(
      classifyFeedback({
        rating: 'down',
        correctionText: 'Это было в другом чате, найди тот разговор',
      })?.category
    ).toBe('CROSS_SESSION_FAILURE');
    expect(
      classifyFeedback({
        rating: 'down',
        correctionText: 'Я не просил аналитику, это неверный инструмент',
      })?.category
    ).toBe('WRONG_TOOL');
    expect(
      classifyFeedback({
        rating: 'down',
        correctionText: 'Ты неверно определил день: я просил GMT, а не Москву',
      })?.category
    ).toBe('TIMEZONE_ERROR');
  });

  it('does not treat a format preference as a factual correction', () => {
    const classification = classifyFeedback({
      rating: 'down',
      correctionText: 'Слишком длинно, не нужна таблица',
    });
    expect(classification?.category).toBe('WRONG_FORMAT');
    expect(classification?.correctionKind).toBe('PREFERENCE');
  });

  it('classifies rendering, analytics, period and performance failures separately', () => {
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'График не отображается, пустой экран' })
        ?.category
    ).toBe('RENDERING_FAILURE');
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'Аналитика сломалась, отчёт не построился' })
        ?.category
    ).toBe('ANALYTICS_ERROR');
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'Ты взял не тот период и сравнил разные периоды' })
        ?.category
    ).toBe('PERIOD_ERROR');
    expect(
      classifyFeedback({ rating: 'down', correctionText: 'Слишком долго, ответ зависает' })
        ?.category
    ).toBe('PERFORMANCE_ERROR');
  });

  it('returns null for positive feedback', () => {
    expect(classifyFeedback({ rating: 'up' })).toBeNull();
  });

  it('produces a durable regression case from a correction', () => {
    const classification = classifyFeedback({
      rating: 'down',
      correctionText: 'Это книга, а не проект',
    });
    expect(classification).not.toBeNull();
    const regression = toRegressionCase({
      id: 'case-1',
      classification: classification!,
      originalQuestion: 'Что такое UNFRAMED?',
      failedAnswer: 'UNFRAMED — это сериал.',
      correction: 'Это книга, а не проект',
      now: new Date('2026-11-11T12:00:00.000Z'),
    });

    expect(regression.category).toBe('ENTITY_CONFUSION');
    expect(regression.expectedBehavior).toMatch(/entity type/i);
    expect(regression.originalQuestion).toBe('Что такое UNFRAMED?');
    expect(feedbackCategoryLabel('ENTITY_CONFUSION')).toBe('Смешение сущностей');
  });
});

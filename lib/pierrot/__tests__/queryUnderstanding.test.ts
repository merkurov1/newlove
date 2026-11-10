/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { extractRequestedDocumentTitle, understandPierrotQuery } from '../queryUnderstanding';

const history = [
  { role: 'user' as const, content: 'Найди Weekly Review' },
  { role: 'assistant' as const, content: 'Commercial report.' },
];

describe('Pierrot query understanding', () => {
  it('routes a named Weekly Review document to Brain', () => {
    const plan = understandPierrotQuery('Найди Weekly Review');

    expect(plan.intent).toBe('document_lookup');
    expect(plan.documentTitle).toMatch(/weekly review/i);
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.commercial).toBe(false);
  });

  it('keeps the document intent when the owner corrects the previous tool', () => {
    const plan = understandPierrotQuery(
      'Не то! Найди Weekly Review В brain и сделай краткий перевод на русский'
    );

    expect(plan.intent).toBe('document_lookup');
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.commercial).toBe(false);
  });

  it('inherits a document title from history for a correction without a title', () => {
    const plan = understandPierrotQuery(
      'Я имею в виду документ в Brain, а не коммерческую статистику',
      { history }
    );

    expect(plan.intent).toBe('document_lookup');
    expect(plan.documentTitle).toMatch(/weekly review/i);
    expect(plan.correction).toBe(true);
  });

  it('routes biography to Brain, not Graph Stats', () => {
    const plan = understandPierrotQuery('Расскажи мою биографию');

    expect(plan.intent).toBe('biography');
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.graph).toBe(false);
    expect(plan.sources.analytics).toBe(false);
  });

  it('routes changing personal views away from Commercial', () => {
    const plan = understandPierrotQuery('Как изменились мои взгляды?');

    expect(plan.intent).toBe('views_over_time');
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.commercial).toBe(false);
  });

  it('detects a strict current-week period and personal analysis', () => {
    const plan = understandPierrotQuery('Как у меня дела за последнюю неделю?');

    expect(plan.intent).toBe('personal_analysis');
    expect(plan.period?.label).toBe('last_7_days');
    expect(plan.sources.brain).toBe(true);
  });

  it('routes media mentions to Media and Web with a period', () => {
    const plan = understandPierrotQuery(
      'Найди СМИ и каналы, которые цитировали меня за последний месяц'
    );

    expect(plan.intent).toBe('media_mentions');
    expect(plan.sources.media).toBe(true);
    expect(plan.sources.web).toBe(true);
    expect(plan.period?.label).toBe('last_30_days');
  });

  it('routes an iOS question to project context without Analytics', () => {
    const plan = understandPierrotQuery('Как продвигается моё iOS-приложение?');

    expect(plan.intent).toBe('project');
    expect(plan.sources.project).toBe(true);
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.analytics).toBe(false);
  });

  it('keeps commercial requests commercial', () => {
    const plan = understandPierrotQuery('Покажи продажи, подписки и донаты');

    expect(plan.intent).toBe('commercial');
    expect(plan.sources.commercial).toBe(true);
  });

  it('keeps general knowledge free of personal Brain context', () => {
    const plan = understandPierrotQuery('Кто такой Махатма Ганди?');

    expect(plan.intent).toBe('general');
    expect(plan.sources.brain).toBe(false);
  });

  it('recognises a combined Brain + Web research question', () => {
    const plan = understandPierrotQuery(
      'Что известно о Махатме Ганди и что из этого связано с моими текстами?'
    );

    expect(plan.intent).toBe('brain_web_research');
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.web).toBe(true);
  });
});

describe('document title extraction', () => {
  it('extracts a quoted exact title', () => {
    expect(
      extractRequestedDocumentTitle(
        'Найди в Brain документ с точным названием «Anton Merkurov — Weekly Review»'
      )
    ).toEqual({
      title: 'Anton Merkurov — Weekly Review',
      kind: 'exact',
    });
  });

  it('does not treat a bare weekly word as a document title', () => {
    expect(extractRequestedDocumentTitle('Там weekly в базе появился!')).toBeNull();
  });

  it('preserves the Media source across a correction', () => {
    const plan = understandPierrotQuery('Нет, ты всё выдумал, поищи по базе медиа', {
      history: [{ role: 'user', content: 'Сделай анализ медиа за 2026 год' }],
    });

    expect(plan.correction).toBe(true);
    expect(plan.intent).toBe('media_mentions');
    expect(plan.sources.media).toBe(true);
    expect(plan.sources.brain).toBe(false);
  });

  it('lets an explicit media source correction override a previous Brain task', () => {
    const plan = understandPierrotQuery('По базе медиа, а не Brain', {
      history: [{ role: 'user', content: 'Найди в Brain заметку о Sotheby’s' }],
    });

    expect(plan.intent).toBe('media_mentions');
    expect(plan.sources.media).toBe(true);
    expect(plan.sources.brain).toBe(false);
  });
});


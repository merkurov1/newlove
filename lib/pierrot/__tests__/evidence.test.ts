/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  buildSourceStatuses,
  guardAnswerEvidence,
  type EvidenceRequestedSources,
} from '../evidence';

const requested = (
  overrides: Partial<EvidenceRequestedSources> = {}
): EvidenceRequestedSources => ({
  brain: false,
  media: false,
  web: false,
  ...overrides,
});

describe('source status mapping', () => {
  it('keeps empty, unavailable and timeout distinct', () => {
    expect(
      buildSourceStatuses({
        brain: { outcome: 'no_match' },
        media: { outcome: 'no_match' },
        web: { outcome: 'no_results' },
        requested: requested({ brain: true, media: true, web: true }),
      })
    ).toEqual({ brain: 'empty', media: 'empty', web: 'empty' });

    expect(
      buildSourceStatuses({
        brain: { outcome: 'unavailable', code: 'timeout' },
        media: { outcome: 'unavailable', code: 'database_unavailable' },
        web: { outcome: 'unavailable', code: 'missing_api_key' },
        requested: requested({ brain: true, media: true, web: true }),
      })
    ).toEqual({ brain: 'timeout', media: 'unavailable', web: 'unavailable' });
  });

  it('marks sources that were not requested as not_requested', () => {
    expect(
      buildSourceStatuses({
        requested: requested(),
      })
    ).toEqual({ brain: 'not_requested', media: 'not_requested', web: 'not_requested' });
  });
});

describe('answer evidence guard', () => {
  it('blocks a claim of found publications when the web search failed', () => {
    const result = guardAnswerEvidence({
      reply:
        'Вот публикации за месяц: «Le Monde» и Telegram-канал @fake. Источник: https://fake.example/story',
      statuses: { brain: 'not_requested', media: 'empty', web: 'unavailable' },
      requested: requested({ web: true, media: true }),
      language: 'ru',
      intent: 'media_mentions',
    });

    expect(result.reply).not.toContain('fake.example');
    expect(result.reply).not.toContain('Le Monde');
    expect(result.reply).toContain('Внешний поиск');
    expect(result.violations).toContain('web_claim_without_results');
  });

  it('removes an invented URL even when web evidence exists', () => {
    const result = guardAnswerEvidence({
      reply:
        'According to the source: [real](https://real.example/a) and [fake](https://fake.example/b).',
      statuses: { brain: 'not_requested', media: 'not_requested', web: 'success' },
      requested: requested({ web: true }),
      allowedExternalUrls: ['https://real.example/a'],
      language: 'en',
      intent: 'web_research',
    });

    expect(result.reply).toContain('https://real.example/a');
    expect(result.reply).not.toContain('https://fake.example/b');
    expect(result.violations).toContain('unverified_external_url_removed');
  });

  it('does not present personal material as grounded when Brain is empty', () => {
    const result = guardAnswerEvidence({
      reply: 'В твоих текстах ты писал, что это твоя главная позиция.',
      statuses: { brain: 'empty', media: 'not_requested', web: 'not_requested' },
      requested: requested({ brain: true }),
      language: 'ru',
      intent: 'personal_analysis',
    });

    expect(result.reply).not.toContain('В твоих текстах');
    expect(result.reply).toContain('Brain');
    expect(result.violations).toContain('brain_claim_without_context');
  });

  it('preserves an honest negative answer without duplicating the limitation', () => {
    const result = guardAnswerEvidence({
      reply: 'Внешний поиск недоступен, поэтому подтвердить публикации не могу.',
      statuses: { brain: 'not_requested', media: 'not_requested', web: 'unavailable' },
      requested: requested({ web: true }),
      language: 'ru',
      intent: 'web_research',
    });

    expect(result.reply).toContain('Внешний поиск недоступен');
    expect(result.violations).not.toContain('web_claim_without_results');
  });

  it('adds a Brain limitation when the answer is otherwise safe', () => {
    const result = guardAnswerEvidence({
      reply: 'Общий ответ без ссылок на архив.',
      statuses: { brain: 'timeout', media: 'not_requested', web: 'not_requested' },
      requested: requested({ brain: true }),
      language: 'ru',
      intent: 'biography',
    });

    expect(result.reply).toContain('Brain');
    expect(result.violations).toContain('source_limitation_disclosed');
  });
});

describe('extended source statuses', () => {
  it('keeps permission denied separate from unavailable and empty', () => {
    expect(
      buildSourceStatuses({
        brain: { outcome: 'unavailable', code: 'unauthorized_scope' },
        requested: requested({ brain: true }),
      }).brain
    ).toBe('permission_denied');
  });

  it('discloses permission denial without claiming the data is absent', () => {
    const result = guardAnswerEvidence({
      reply: 'Общий ответ.',
      statuses: { brain: 'permission_denied', media: 'not_requested', web: 'not_requested' },
      requested: requested({ brain: true }),
      language: 'ru',
      intent: 'biography',
    });

    expect(result.reply).toContain('недоступен');
    expect(result.reply).not.toContain('нет информации');
  });
});

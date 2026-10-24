/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { computeAnalysis, validateTimezone } from '../stats';
import { makeChat, makeMessage } from '../testing';

const chat = makeChat();

function sample() {
  return [
    makeMessage({
      id: 1,
      dateMs: Date.parse('2024-01-01T22:30:00.000Z'),
      senderId: 42,
      text: 'Привет, есть текст?',
    }),
    makeMessage({
      id: 2,
      dateMs: Date.parse('2024-01-01T22:40:00.000Z'),
      senderId: 1,
      text: 'Да, отправил в редакцию.',
      replyToId: 1,
    }),
    makeMessage({
      id: 3,
      dateMs: Date.parse('2024-01-01T22:45:00.000Z'),
      senderId: 42,
      text: 'Спасибо, посмотрю.',
    }),
    makeMessage({
      id: 4,
      dateMs: Date.parse('2024-01-02T06:00:00.000Z'),
      senderId: 1,
      text: 'Доброе утро.',
    }),
    makeMessage({
      id: 5,
      dateMs: Date.parse('2024-01-10T10:00:00.000Z'),
      senderId: 42,
      text: 'Возвращаюсь к правкам.',
    }),
  ];
}

describe('computeAnalysis', () => {
  it('считает участников, активность и длину сообщений', () => {
    const report = computeAnalysis(sample(), { timezone: 'UTC' }, { chat });
    expect(report.source.messageCount).toBe(5);
    expect(report.participants).toHaveLength(2);
    expect(report.participants.find((participant) => participant.id === 42)?.messages).toBe(3);
    expect(report.participants.find((participant) => participant.id === 1)?.messages).toBe(2);
    expect(report.activity.byYear['2024'].total).toBe(5);
    expect(report.activity.byMonth['2024-01'].total).toBe(5);
    expect(report.activity.byHour.find((bucket) => bucket.hour === 22)?.total).toBe(3);
    expect(report.lengths.characters.count).toBe(5);
    expect(report.lengths.words.count).toBe(5);
  });

  it('разделяет прямые и оценочные ответы', () => {
    const report = computeAnalysis(sample(), { timezone: 'UTC' }, { chat });
    expect(report.responses.replyLinksAvailable).toBe(true);
    expect(report.responses.messagesWithReplyField).toBe(1);
    expect(report.responses.directReplies.count).toBe(1);
    expect(report.responses.directReplies.seconds?.median).toBe(600);
    expect(report.responses.estimatedReplies.count).toBe(1);
    expect(report.responses.estimatedReplies.seconds?.median).toBe(300);
    expect(report.responses.estimatedReplies.method).toContain('не является доказанным');
    expect(report.responses.directReplies.count + report.responses.estimatedReplies.count).toBe(2);
  });

  it('строит сессии и считает длительные паузы', () => {
    const report = computeAnalysis(sample(), { timezone: 'UTC' }, { chat });
    expect(report.sessions.count).toBe(3);
    expect(report.sessions.startsByParticipant['id:42']).toBe(2);
    expect(report.sessions.startsByParticipant['id:1']).toBe(1);
    expect(report.sessions.longPauseGaps).toBe(1);
    expect(report.sessions.longPauseResumesByParticipant['id:42']).toBe(1);
    expect(report.sessions.sessions[2].gapBeforeSeconds).toBeGreaterThan(7 * 24 * 3600);
  });

  it('учитывает настраиваемый порог сессии', () => {
    const report = computeAnalysis(
      sample(),
      { timezone: 'UTC', sessionGapSeconds: 8 * 3600 },
      { chat }
    );
    expect(report.sessions.count).toBe(2);
  });

  it('переводит активность в IANA-зону, не меняя timestamps', () => {
    const utc = computeAnalysis(sample(), { timezone: 'UTC' }, { chat });
    const moscow = computeAnalysis(sample(), { timezone: 'Europe/Moscow' }, { chat });
    expect(utc.activity.byHour.find((bucket) => bucket.hour === 22)?.total).toBe(3);
    expect(moscow.activity.byHour.find((bucket) => bucket.hour === 1)?.total).toBe(3);
    expect(moscow.source.firstMessageAt).toBe(utc.source.firstMessageAt);
    expect(moscow.options.timezone).toBe('Europe/Moscow');
  });

  it('корректно обрабатывает пустой текст и media-only', () => {
    const messages = [
      makeMessage({ id: 1, dateMs: Date.parse('2024-01-01T00:00:00.000Z'), text: '' }),
      makeMessage({
        id: 2,
        dateMs: Date.parse('2024-01-01T00:01:00.000Z'),
        text: null,
        hasMedia: true,
        mediaKind: 'messageMediaPhoto',
      }),
    ];
    const report = computeAnalysis(messages, { timezone: 'UTC' }, { chat });
    expect(report.dataQuality.messagesWithEmptyString).toBe(1);
    expect(report.dataQuality.messagesWithoutText).toBe(1);
    expect(report.dataQuality.mediaOnlyMessages).toBe(1);
    expect(report.lengths.characters.count).toBe(2);
  });

  it('помечает неизвестного отправителя и не падает', () => {
    const report = computeAnalysis(
      [makeMessage({ id: 1, dateMs: 1_700_000_000_000, senderId: null, text: 'без автора' })],
      { timezone: 'UTC' },
      { chat }
    );
    expect(report.dataQuality.unknownSenderMessages).toBe(1);
    expect(report.participants[0].key).toBe('unknown');
  });

  it('валидирует часовую зону', () => {
    expect(validateTimezone('Europe/Moscow')).toBe('Europe/Moscow');
    expect(() => validateTimezone('Mars/Olympus')).toThrow(/IANA/);
  });
});

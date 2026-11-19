/** @jest-environment node */

import { detectYouTubeQuestion, resolveYouTubePeriod } from '../question';

const NOW = new Date('2026-11-19T12:00:00.000Z');

describe('YouTube owner question detection', () => {
  it('recognises the same channel question from both project chats', () => {
    const pierrot = detectYouTubeQuestion('Pierrot: статистика YouTube-канала за 30 дней', {
      now: NOW,
    });
    const unframed = detectYouTubeQuestion('UNFRAMED: статистика YouTube-канала за 30 дней', {
      now: NOW,
    });

    expect(pierrot?.scope).toBe('channel_overview');
    expect(unframed?.scope).toBe('channel_overview');
    expect(pierrot?.periodKey).toBe(unframed?.periodKey);
    expect(pierrot?.timezone).toBe('Europe/London');
  });

  it('recognises two named UNFRAMED videos and chooses compare_videos', () => {
    const question = detectYouTubeQuestion(
      'Сравни ролики UNFRAMED The Spectral Tiger и Step Out of the Physical Container за месяц',
      { now: NOW }
    );

    expect(question?.scope).toBe('compare_videos');
    expect(question?.videoIds).toEqual(expect.arrayContaining(['TmC6Lr5K4R8', 'ZGhmmDVVwQg']));
    expect(question?.periodKey).toBe('last_30_days');
  });

  it('keeps a video comparison request even when the owner has not named ids yet', () => {
    const question = detectYouTubeQuestion('Сравни два ролика UNFRAMED за месяц', {
      now: NOW,
    });

    expect(question?.scope).toBe('compare_videos');
    expect(question?.videoIds).toEqual([]);
  });

  it('recognises traffic, engagement and daily dynamics scopes', () => {
    expect(detectYouTubeQuestion('Откуда трафик на YouTube за неделю?', { now: NOW })?.scope).toBe(
      'traffic_sources'
    );
    expect(
      detectYouTubeQuestion('Вовлечённость и удержание на YouTube канале', { now: NOW })?.scope
    ).toBe('engagement');
    expect(
      detectYouTubeQuestion('Динамика просмотров YouTube по дням за 7 дней', { now: NOW })?.scope
    ).toBe('time_series');
  });

  it('keeps a bare YouTube URL as publication intake, not analytics', () => {
    expect(detectYouTubeQuestion('https://youtu.be/TmC6Lr5K4R8', { now: NOW })).toBeNull();
    expect(detectYouTubeQuestion('Опубликуй это видео на YouTube', { now: NOW })).toBeNull();
  });

  it('resolves explicit dates and keeps the reporting timezone', () => {
    const question = detectYouTubeQuestion('Статистика YouTube канала 2026-10-01 — 2026-10-31', {
      now: NOW,
    });

    expect(question?.periodKey).toBe('custom');
    const period = resolveYouTubePeriod(question!, { now: NOW, language: 'ru' });
    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-10-31');
    expect(period.previousStart).toBe('2026-08-30');
    expect(period.timezone).toBe('Europe/London');
  });
});

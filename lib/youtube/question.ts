import { assertServerOnly } from '@/lib/serverOnly';

import { extractYouTubeVideoId } from '@/lib/flow/youtube';
import { parseCustomPeriod } from '@/lib/pierrot/commercialQuestion';
import {
  addZonedDays,
  startOfZonedDay,
  type ReportingPeriodKey,
} from '@/lib/pierrot/reportingPeriod';

import { resolveWebsitePeriod } from '@/lib/analytics/website/period';

import { getYouTubeTimezone } from './config';
import { findKnownVideoIds } from './projects';
import type { YouTubeLanguage, YouTubePeriod, YouTubeReportKind } from './types';

assertServerOnly('lib/youtube/question');

export type YouTubeQuestionScope = YouTubeReportKind;

export type YouTubeQuestion = {
  scope: YouTubeQuestionScope;
  periodKey: ReportingPeriodKey;
  customPeriod?: { start: string; end: string };
  videoIds: string[];
  timezone: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function extractYouTubeVideoIds(message: string): string[] {
  const ids = new Set<string>();
  const urls = message.match(/https?:\/\/[^\s<>"']+/gi) ?? [];

  for (const url of urls) {
    const id = extractYouTubeVideoId(url);
    if (id) ids.add(id);
  }

  const contextualId = message.match(
    /(?:video(?:\s*id)?|youtube|ролик|видео)\s*[:#-]?\s*([A-Za-z0-9_-]{11})\b/i
  );
  if (contextualId && extractYouTubeVideoId(`https://youtu.be/${contextualId[1]}`)) {
    ids.add(contextualId[1]);
  }

  for (const known of findKnownVideoIds(message)) ids.add(known);

  return Array.from(ids);
}

const EXPLICIT_COMMAND = /^\/(youtube|yt|video)\b/i;
const YOUTUBE_SIGNAL = /(youtube|ютуб|youtu\.be|youtube\.com|shorts|шортс|ролик)/i;
const ANALYTICS_SIGNAL =
  /(статистик|аналитик|метрик|просмотр|views?|watch\s*time|вовлеч|engagement|подписчик|subscriber|лайк|like|коммент|comment|динамик|тренд|trend|сравн|compare|трафик|traffic|reach|охват|источник|source|удержан|retention|канал|channel|сколько|how\s+many|показ|impression|ctr|как\s+дела|что\s+происходит|how\s+is|performance|результат)/i;
const COMPARE_SIGNAL =
  /(сравн|compare|vs\.?|против|динамик|тренд|trend|что\s+изменилось|what\s+changed)/i;
const TRAFFIC_SIGNAL = /(трафик|traffic|источник|source|откуда\s+приход|referr|search|поиск)/i;
const ENGAGEMENT_SIGNAL =
  /(вовлеч|engagement|лайк|like|коммент|comment|репост|share|удержан|retention|процент\s+просмотр|average\s+view)/i;
const SERIES_SIGNAL =
  /(динамик|по\s+дням|по\s+дням|график|chart|time\s*series|day\s*by\s*day|тренд|trend|рост|падени)/i;

export function detectYouTubeQuestion(
  message: string,
  options: { now?: Date; timezone?: string } = {}
): YouTubeQuestion | null {
  if (typeof message !== 'string' || !message.trim()) return null;

  const text = normalize(message);
  const explicit = EXPLICIT_COMMAND.test(text);
  const videoIds = extractYouTubeVideoIds(message);
  const youtubeSignal = YOUTUBE_SIGNAL.test(text) || videoIds.length > 0;
  const analyticsSignal = ANALYTICS_SIGNAL.test(text);

  // A bare YouTube URL remains publication intake, not analytics.
  if (!explicit && (!youtubeSignal || !analyticsSignal)) return null;

  // Avoid hijacking "опубликуй это видео на YouTube".
  if (
    !explicit &&
    /(опублику|запост|добав|созда|загрузи|publish|post|upload|добавь)/i.test(text) &&
    !/(статистик|аналитик|метрик|просмотр|views?|сравн|compare)/i.test(text)
  ) {
    return null;
  }

  const timezone = options.timezone ?? getYouTubeTimezone();
  const now = options.now ?? new Date();
  const period = detectPeriod(message, text, now, timezone, explicit);

  let scope: YouTubeQuestionScope = 'channel_overview';

  if (videoIds.length >= 2 && (COMPARE_SIGNAL.test(text) || explicit)) {
    scope = 'compare_videos';
  } else if (COMPARE_SIGNAL.test(text) && /(ролик|видео|video|shorts|шортс)/i.test(text)) {
    // The owner asked to compare videos but did not name two ids. Keep the
    // video-comparison tool so it asks for precise videos instead of silently
    // switching to a period comparison.
    scope = 'compare_videos';
  } else if (
    COMPARE_SIGNAL.test(text) &&
    /(период|period|недел|month|месяц|квартал|quarter)/i.test(text)
  ) {
    scope = 'compare_periods';
  } else if (TRAFFIC_SIGNAL.test(text)) {
    scope = 'traffic_sources';
  } else if (ENGAGEMENT_SIGNAL.test(text)) {
    scope = 'engagement';
  } else if (SERIES_SIGNAL.test(text)) {
    scope = 'time_series';
  } else if (videoIds.length > 0) {
    scope = 'video_overview';
  }

  if (
    (scope === 'compare_videos' || scope === 'compare_periods') &&
    !explicit &&
    period.periodKey === 'last_7_days' &&
    !/(7|семь|недел|week)/i.test(text)
  ) {
    period.periodKey = 'last_30_days';
  }

  return {
    scope,
    periodKey: period.periodKey,
    ...(period.customPeriod ? { customPeriod: period.customPeriod } : {}),
    videoIds,
    timezone,
  };
}

function detectPeriod(
  message: string,
  text: string,
  now: Date,
  timezone: string,
  explicit: boolean
): { periodKey: ReportingPeriodKey; customPeriod?: { start: string; end: string } } {
  const custom = parseCustomPeriod(message, now, timezone);
  if (custom) return { periodKey: 'custom', customPeriod: custom };

  if (/(сегодня|today)/i.test(text)) {
    const today = iso(startOfZonedDay(now, timezone));
    return { periodKey: 'custom', customPeriod: { start: today, end: today } };
  }

  if (/(вчера|yesterday)/i.test(text)) {
    const yesterday = iso(addZonedDays(startOfZonedDay(now, timezone), -1, timezone));
    return { periodKey: 'custom', customPeriod: { start: yesterday, end: yesterday } };
  }

  if (/(90\s*дней|90\s*days|три\s+месяца|three\s+months|квартал|quarter)/i.test(text)) {
    return { periodKey: 'custom', ...ninetyDays(now, timezone) };
  }

  if (/(30\s*дней|30\s*days|месяц|month)/i.test(text)) return { periodKey: 'last_30_days' };
  if (/(7\s*дней|7\s*days|недел|week)/i.test(text)) return { periodKey: 'last_7_days' };
  if (/(год|year)/i.test(text)) return { periodKey: 'this_year' };

  return { periodKey: explicit ? 'last_30_days' : 'last_7_days' };
}

function ninetyDays(now: Date, timezone: string): { customPeriod: { start: string; end: string } } {
  const end = iso(startOfZonedDay(now, timezone));
  const start = iso(addZonedDays(startOfZonedDay(now, timezone), -89, timezone));

  return { customPeriod: { start, end } };
}

export function resolveYouTubePeriod(
  question: YouTubeQuestion,
  options: { now?: Date; language?: YouTubeLanguage } = {}
): YouTubePeriod {
  const period = resolveWebsitePeriod({
    periodKey: question.periodKey,
    customPeriod: question.customPeriod,
    timezone: question.timezone,
    now: options.now,
    comparisonRequested: true,
    language: options.language ?? 'ru',
  });

  return {
    key: period.key,
    label: period.label,
    timezone: period.timezone,
    start: period.start,
    end: period.end,
    previousStart: period.previousStart,
    previousEnd: period.previousEnd,
    previousLabel: period.previousLabel,
    comparison: true,
  };
}

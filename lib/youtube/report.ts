import { assertServerOnly } from '@/lib/serverOnly';

import type {
  YouTubeBreakdownRow,
  YouTubeLanguage,
  YouTubeMetric,
  YouTubePublicVideo,
  YouTubeReport,
} from './types';

assertServerOnly('lib/youtube/report');

function number(value: number | null, language: YouTubeLanguage): string {
  if (value === null || !Number.isFinite(value)) return '—';

  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 0,
  }).format(value);
}

function float(value: number | null, language: YouTubeLanguage): string {
  if (value === null || !Number.isFinite(value)) return '—';

  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(value);
}

function metricValue(metric: YouTubeMetric, language: YouTubeLanguage): string {
  if (!metric.available || metric.value === null) return '—';
  if (metric.unit === 'percent') return `${float(metric.value, language)}%`;
  if (metric.unit === 'seconds') return formatDuration(metric.value);
  return number(metric.value, language);
}

function previousValue(metric: YouTubeMetric, language: YouTubeLanguage): string {
  if (metric.previous === null) return '—';
  if (metric.unit === 'percent') return `${float(metric.previous, language)}%`;
  if (metric.unit === 'seconds') return formatDuration(metric.previous);
  return number(metric.previous, language);
}

function delta(metric: YouTubeMetric, language: YouTubeLanguage): string {
  if (metric.deltaPercent === null || !Number.isFinite(metric.deltaPercent)) return '—';

  const sign = metric.deltaPercent > 0 ? '+' : '';
  return `${sign}${float(metric.deltaPercent, language)}%`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours > 0) return `${hours} ч ${minutes} мин ${rest} с`;
  if (minutes > 0) return `${minutes} мин ${rest} с`;
  return `${rest} с`;
}

function dateTime(value: string, language: YouTubeLanguage, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';

  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function sourceLabel(metric: YouTubeMetric, language: YouTubeLanguage): string {
  if (metric.source === 'youtube_data_api') {
    return language === 'ru' ? 'Data API · публично' : 'Data API · public';
  }

  return language === 'ru' ? 'Analytics · приватно' : 'Analytics · private';
}

function metricTable(metrics: YouTubeMetric[], language: YouTubeLanguage): string {
  return table(
    [
      language === 'ru' ? 'Показатель' : 'Metric',
      language === 'ru' ? 'Значение' : 'Value',
      language === 'ru' ? 'Предыдущий' : 'Previous',
      language === 'ru' ? 'Изменение' : 'Change',
      language === 'ru' ? 'Источник' : 'Source',
    ],
    metrics.map((metric) => [
      metric.label,
      metricValue(metric, language),
      previousValue(metric, language),
      delta(metric, language),
      sourceLabel(metric, language),
    ])
  );
}

function breakdownTable(rows: YouTubeBreakdownRow[], language: YouTubeLanguage): string {
  return table(
    [
      language === 'ru' ? 'Источник трафика' : 'Traffic source',
      language === 'ru' ? 'Просмотры' : 'Views',
      language === 'ru' ? 'Доля' : 'Share',
      language === 'ru' ? 'Изменение' : 'Change',
    ],
    rows.map((row) => [
      row.label,
      number(row.value, language),
      row.share === null ? '—' : `${float(row.share, language)}%`,
      row.deltaPercent === null
        ? '—'
        : `${row.deltaPercent > 0 ? '+' : ''}${float(row.deltaPercent, language)}%`,
    ])
  );
}

function publicVideosTable(videos: YouTubePublicVideo[], language: YouTubeLanguage): string {
  return table(
    [
      language === 'ru' ? 'Видео' : 'Video',
      language === 'ru' ? 'Проект' : 'Project',
      language === 'ru' ? 'Опубликовано' : 'Published',
      language === 'ru' ? 'Просмотры (всего)' : 'Views (total)',
      language === 'ru' ? 'Лайки' : 'Likes',
      language === 'ru' ? 'Комментарии' : 'Comments',
      'Shorts',
    ],
    videos.map((video) => [
      `[${video.title || video.videoId}](${video.url})`,
      video.project || '—',
      video.publishedAt ? video.publishedAt.slice(0, 10) : '—',
      number(video.publicViews, language),
      number(video.publicLikes, language),
      number(video.publicComments, language),
      video.isShort === null ? '—' : video.isShort ? 'да' : 'нет',
    ])
  );
}

function seriesTable(report: YouTubeReport): string {
  if (report.series.length === 0) return '';

  return table(
    [
      report.language === 'ru' ? 'Дата' : 'Date',
      report.language === 'ru' ? 'Просмотры' : 'Views',
      report.language === 'ru' ? 'Минуты' : 'Minutes',
      report.language === 'ru' ? 'Подписчики +' : 'Subscribers +',
      report.language === 'ru' ? 'Подписчики −' : 'Subscribers −',
    ],
    report.series.map((point) => [
      point.date,
      number(point.views, report.language),
      number(point.watchMinutes, report.language),
      number(point.subscribersGained, report.language),
      number(point.subscribersLost, report.language),
    ])
  );
}

function factualObservations(report: YouTubeReport): string[] {
  const observations: string[] = [];
  const views = report.metrics.find((metric) => metric.key === 'views');
  const watch = report.metrics.find((metric) => metric.key === 'estimatedMinutesWatched');
  const gained = report.metrics.find((metric) => metric.key === 'subscribersGained');
  const lost = report.metrics.find((metric) => metric.key === 'subscribersLost');

  if (views?.deltaPercent !== null && views?.deltaPercent !== undefined && views.available) {
    const direction =
      views.deltaPercent > 0 ? 'выше' : views.deltaPercent < 0 ? 'ниже' : 'на том же уровне';
    observations.push(
      report.language === 'ru'
        ? `Просмотры за период ${direction} предыдущего на ${float(Math.abs(views.deltaPercent), report.language)}%.`
        : `Period views are ${direction} than the previous period by ${float(Math.abs(views.deltaPercent), report.language)}%.`
    );
  }

  if (watch?.deltaPercent !== null && watch?.deltaPercent !== undefined && watch.available) {
    observations.push(
      report.language === 'ru'
        ? `Время просмотра изменилось на ${watch.deltaPercent > 0 ? '+' : ''}${float(watch.deltaPercent, report.language)}% к предыдущему периоду.`
        : `Watch time changed by ${watch.deltaPercent > 0 ? '+' : ''}${float(watch.deltaPercent, report.language)}% versus the previous period.`
    );
  }

  if (gained?.available && lost?.available && gained.value !== null && lost.value !== null) {
    const net = gained.value - lost.value;
    observations.push(
      report.language === 'ru'
        ? `Подписчики за период: +${number(gained.value, 'ru')} / −${number(lost.value, 'ru')} → ${net >= 0 ? '+' : ''}${number(net, 'ru')}.`
        : `Subscribers in the period: +${number(gained.value, 'en')} / −${number(lost.value, 'en')} → ${net >= 0 ? '+' : ''}${number(net, 'en')}.`
    );
  }

  return observations;
}

export function formatYouTubeReport(report: YouTubeReport): string {
  const language = report.language;
  const ru = language === 'ru';
  const lines: string[] = [];
  const title =
    report.channel?.title ||
    report.channelId ||
    (ru ? 'канал не подключён' : 'channel not connected');
  const projects = report.sharedProjects.map((project) => project.name).join(' + ');

  lines.push(`## YouTube · ${ru ? 'общий канал' : 'shared channel'} ${projects}`);
  lines.push(
    `**${ru ? 'Канал' : 'Channel'}:** ${title}${report.channelId ? ` · \`${report.channelId}\`` : ''}`
  );
  lines.push(
    `**${ru ? 'Период' : 'Period'}:** ${report.period.label} · ${report.period.start} — ${report.period.end} (${report.period.timezone})`
  );

  if (report.period.comparison) {
    lines.push(
      `**${ru ? 'Сравнение с' : 'Compared with'}:** ${report.period.previousLabel} · ${report.period.previousStart} — ${report.period.previousEnd}`
    );
  }

  lines.push(
    `**${ru ? 'Данные получены' : 'Fetched at'}:** ${dateTime(report.provenance.fetchedAt, language, report.period.timezone)}${report.provenance.cached ? ` · ${ru ? 'кеш' : 'cached'} ${report.provenance.cacheAgeSeconds ?? 0} ${ru ? 'с' : 's'}` : ''}`
  );
  lines.push(
    `**${ru ? 'Источники' : 'Sources'}:** ${
      [
        report.provenance.dataApi.length ? 'YouTube Data API v3' : null,
        report.analyticsAvailable ? 'YouTube Analytics API v2' : null,
      ]
        .filter(Boolean)
        .join(' · ') || (ru ? 'нет доступных источников' : 'no available sources')
    }`
  );
  lines.push(
    ru
      ? '_Публичные счётчики Data API и приватные метрики Analytics различаются: это не одни и те же измерения._'
      : '_Public Data API counters and private Analytics metrics are different measurements and are never merged._'
  );

  if (report.metrics.length > 0) {
    lines.push('');
    lines.push(ru ? '### Метрики' : '### Metrics');
    lines.push(metricTable(report.metrics, language));
  }

  if (report.kind === 'compare_periods' && report.comparisonPeriod) {
    lines.push('');
    lines.push(
      ru
        ? `Предыдущий период: ${report.comparisonPeriod.start} — ${report.comparisonPeriod.end}. Изменение считается только там, где Analytics вернул оба значения.`
        : `Previous period: ${report.comparisonPeriod.start} — ${report.comparisonPeriod.end}. Changes are calculated only where Analytics returned both values.`
    );
  }

  if (report.series.length > 0) {
    lines.push('');
    lines.push(ru ? '### Динамика по дням' : '### Daily dynamics');
    lines.push(seriesTable(report));
  }

  if (report.breakdowns.length > 0) {
    lines.push('');
    lines.push(ru ? '### Источники трафика' : '### Traffic sources');
    lines.push(breakdownTable(report.breakdowns, language));
  }

  if (report.videos.length > 0) {
    lines.push('');
    lines.push(ru ? '### Видео (публичные счётчики)' : '### Videos (public counters)');
    lines.push(publicVideosTable(report.videos, language));
  }

  if (report.videoAnalytics.length > 0) {
    lines.push('');
    lines.push(ru ? '### Аналитика видео за период' : '### Video analytics for the period');

    for (const video of report.videoAnalytics) {
      const publicVideo = report.videos.find((entry) => entry.videoId === video.videoId);
      lines.push('');
      lines.push(
        `**${video.title || video.videoId}**${video.project ? ` · ${video.project}` : ''}`
      );
      lines.push(`${ru ? 'Ссылка' : 'Link'}: https://www.youtube.com/watch?v=${video.videoId}`);
      lines.push(metricTable(video.metrics, language));
      if (publicVideo?.publishedAt) {
        lines.push(`${ru ? 'Опубликовано' : 'Published'}: ${publicVideo.publishedAt.slice(0, 10)}`);
      }
    }
  }

  const observations = factualObservations(report);
  if (observations.length > 0) {
    lines.push('');
    lines.push(ru ? '### Что видно по данным' : '### What the data shows');
    lines.push(...observations.map((item) => `- ${item}`));
  }

  const unavailable = report.metrics
    .filter((metric) => !metric.available && metric.unavailableReason)
    .map((metric) => `${metric.label}: ${metric.unavailableReason}`);

  for (const video of report.videoAnalytics) {
    for (const metric of video.metrics) {
      if (!metric.available && metric.unavailableReason) {
        unavailable.push(
          `${video.title || video.videoId} · ${metric.label}: ${metric.unavailableReason}`
        );
      }
    }
  }

  if (unavailable.length > 0) {
    lines.push('');
    lines.push(ru ? '### Недоступно (не ноль)' : '### Unavailable (not zero)');
    lines.push(
      ...Array.from(new Set(unavailable))
        .slice(0, 10)
        .map((item) => `- ${item}`)
    );
  }

  if (report.limitations.length > 0) {
    lines.push('');
    lines.push(ru ? '### Ограничения' : '### Limitations');
    lines.push(...report.limitations.map((item) => `- ${item}`));
  }

  if (
    report.dataState === 'not_configured' ||
    (!report.analyticsAvailable &&
      /не подключ|not connected|reconnect|переподключ/i.test(
        report.analyticsUnavailableReason || ''
      ))
  ) {
    lines.push('');
    lines.push(
      ru
        ? 'Подключите общий канал один раз в `/admin/pierrot/analytics` — после этого статистика будет доступна и в Pierrot, и в UNFRAMED.'
        : 'Connect the shared channel once in `/admin/pierrot/analytics`; the same analytics will then be available in both Pierrot and UNFRAMED.'
    );
  }

  return lines.join('\n');
}

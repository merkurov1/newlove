import type {
  AnalysisOptions,
  AnalysisReport,
  ChatIdentity,
  DistributionSummary,
  HistogramBucket,
  LengthStats,
  Manifest,
  MonthlyDynamics,
  NormalizedMessage,
  ParticipantStats,
  ReplyStats,
  SessionStats,
  SessionSummary,
} from './types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from './types';
import { messageKey, sortMessages } from './normalize';
import { mean, median, percentile, round } from './util';

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  timezone: 'UTC',
  sessionGapSeconds: 6 * 60 * 60,
  longPauseSeconds: 7 * 24 * 60 * 60,
  estimateWindowSeconds: 6 * 60 * 60,
  topParticipants: 50,
};

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: number;
  weekday: number;
}

interface SessionBuilder {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  gapBeforeSeconds: number | null;
  messages: NormalizedMessage[];
}

const WEEKDAY_LABELS = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    throw new Error(
      `Неизвестная часовая зона «${timezone}». Укажите IANA-зону, например UTC или Europe/Moscow.`
    );
  }
}

export function computeAnalysis(
  inputMessages: NormalizedMessage[],
  options: Partial<AnalysisOptions> = {},
  source: { chat: ChatIdentity; manifest?: Manifest | null; corpusSha256?: string | null }
): AnalysisReport {
  const config: AnalysisOptions = {
    ...DEFAULT_ANALYSIS_OPTIONS,
    ...options,
    timezone: validateTimezone(options.timezone ?? DEFAULT_ANALYSIS_OPTIONS.timezone),
  };

  const unsorted = [...inputMessages];
  let outOfOrder = 0;
  for (let index = 1; index < unsorted.length; index += 1) {
    if (unsorted[index - 1].dateMs > unsorted[index].dateMs) outOfOrder += 1;
  }

  const messages = sortMessages(inputMessages);
  const duplicateIds = messages.length - new Set(messages.map(messageKey)).size;
  const formatter = createZonedFormatter(config.timezone);
  const byId = new Map<number, NormalizedMessage>();
  for (const message of messages) byId.set(message.id, message);

  const participants = collectParticipants(messages);
  const participantKey = (message: NormalizedMessage): string => senderKey(message);
  const ensureParticipant = (key: string, message?: NormalizedMessage): ParticipantStats => {
    let participant = participants.get(key);
    if (!participant) {
      participant = {
        id: message?.sender.id ?? null,
        key,
        displayName: message?.sender.displayName ?? null,
        username: message?.sender.username ?? null,
        isSelf: message?.sender.isSelf ?? false,
        messages: 0,
        share: 0,
        characters: 0,
        words: 0,
        links: 0,
        media: 0,
        repliesSent: 0,
        directRepliesSent: 0,
        estimatedRepliesSent: 0,
        sessionsStarted: 0,
        longPauseResumes: 0,
        firstMessageAt: null,
        lastMessageAt: null,
        medianCharacters: 0,
        medianWords: 0,
        medianDirectReplySeconds: null,
        medianEstimatedReplySeconds: null,
      };
      participants.set(key, participant);
    }
    return participant;
  };
  for (const message of messages) {
    const key = participantKey(message);
    const participant = ensureParticipant(key, message);
    participant.messages += 1;
    participant.characters += message.textLength;
    participant.words += message.wordCount;
    participant.links += message.links.length;
    if (message.hasMedia) participant.media += 1;
    if (message.reply?.toMessageId != null) participant.repliesSent += 1;
    if (participant.firstMessageAt === null) participant.firstMessageAt = message.date;
    participant.lastMessageAt = message.date;
  }

  const activity = {
    byYear: {} as Record<string, { total: number; byParticipant: Record<string, number> }>,
    byMonth: {} as Record<string, { total: number; byParticipant: Record<string, number> }>,
    byWeekday: WEEKDAY_LABELS.map((label, index) => ({
      key: String(index),
      label,
      total: 0,
      byParticipant: {} as Record<string, number>,
    })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: 0,
      byParticipant: {} as Record<string, number>,
    })),
  };

  const monthMessages = new Map<string, NormalizedMessage[]>();
  for (const message of messages) {
    const zoned = zonedParts(message.dateMs, formatter);
    const key = participantKey(message);
    bumpActivity(activity.byYear, zoned.year, key);
    bumpActivity(activity.byMonth, `${zoned.year}-${zoned.month}`, key);
    activity.byWeekday[zoned.weekday].total += 1;
    activity.byWeekday[zoned.weekday].byParticipant[key] =
      (activity.byWeekday[zoned.weekday].byParticipant[key] ?? 0) + 1;
    activity.byHour[zoned.hour].total += 1;
    activity.byHour[zoned.hour].byParticipant[key] =
      (activity.byHour[zoned.hour].byParticipant[key] ?? 0) + 1;

    const monthKey = `${zoned.year}-${zoned.month}`;
    const bucket = monthMessages.get(monthKey) ?? [];
    bucket.push(message);
    monthMessages.set(monthKey, bucket);
  }

  const lengths = computeLengths(messages);
  const responses = computeReplies(messages, byId, config, participants);
  const sessions = computeSessions(messages, config, participants);
  const dynamics = computeDynamics(monthMessages, sessions, byId, formatter);

  for (const participant of participants.values()) {
    participant.share =
      messages.length === 0 ? 0 : round(participant.messages / messages.length, 4);
    const own = messages.filter((message) => participantKey(message) === participant.key);
    participant.medianCharacters = round(median(own.map((message) => message.textLength)), 1);
    participant.medianWords = round(median(own.map((message) => message.wordCount)), 1);
  }

  const dataQuality = {
    totalMessages: messages.length,
    totalCharacters: messages.reduce((sum, message) => sum + message.textLength, 0),
    messagesWithoutText: messages.filter((message) => message.text === null).length,
    messagesWithEmptyString: messages.filter((message) => message.text === '').length,
    mediaOnlyMessages: messages.filter((message) => message.hasMedia && message.text === null)
      .length,
    serviceMessages: messages.filter((message) => message.isService).length,
    unknownSenderMessages: messages.filter((message) => message.sender.id === null).length,
    unresolvedReplyTargets: messages.filter(
      (message) => message.reply?.toMessageId != null && !byId.has(message.reply.toMessageId)
    ).length,
    forwardsWithoutSource: messages.filter(
      (message) =>
        message.forward && message.forward.fromId === null && message.forward.fromName === null
    ).length,
    outOfOrderMessages: outOfOrder,
    duplicateIds,
    messagesOutsideDateRange: messages.filter(
      (message) => !Number.isFinite(message.dateMs) || message.dateMs <= 0
    ).length,
    zeroLengthIntervals: countZeroIntervals(messages),
  };

  const sortedParticipants = [...participants.values()]
    .sort((a, b) => b.messages - a.messages || a.key.localeCompare(b.key))
    .slice(0, config.topParticipants);

  return {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      chat: source.chat,
      corpusFile: 'corpus.jsonl',
      corpusSha256: source.manifest?.corpus.sha256 ?? source.corpusSha256 ?? null,
      manifestCompleteness: source.manifest?.completeness.status ?? 'unknown',
      messageCount: messages.length,
      firstMessageAt: messages[0]?.date ?? null,
      lastMessageAt: messages[messages.length - 1]?.date ?? null,
    },
    options: config,
    participants: sortedParticipants,
    activity,
    lengths,
    responses,
    sessions,
    dynamics,
    dataQuality,
    methodology: {
      timezone: config.timezone,
      timestamps:
        'В корпусе все даты хранятся в UTC ISO-8601; год/месяц/день/час считаются в указанной IANA-зоне, поэтому переходы на летнее время учитываются.',
      directReplies:
        'Прямой ответ — сообщение с replyToId, для которого цель найдена в корпусе, а отправитель отличается от автора цели. Время ответа = дата ответа минус дата исходного сообщения.',
      estimatedReplies:
        'Оценочный ответ — следующее сообщение другого участника без replyToId, если разрыв не больше estimateWindowSeconds. Это не доказанный ответ, поэтому метрика хранится отдельно от прямых ответов и никогда с ними не суммируется.',
      sessions:
        'Сессия — непрерывная последовательность сообщений, где каждый следующий разрыв не больше sessionGapSeconds. Порог настраивается.',
      longPauses:
        'Длительная пауза — разрыв больше longPauseSeconds между сессиями. Инициатор следующей сессии считается возобновившим разговор после такой паузы.',
      participantIdentity:
        'Участник определяется по sender.id из Telegram. Сообщения без отправителя попадают в группу unknown.',
      limitations: [
        'Telegram не возвращает удалённые сообщения через историю, поэтому статистика по удалённым сообщениям неполна.',
        'Reply-связи есть только там, где Telegram их вернул; оценочные ответы — эвристика, а не факт.',
        'Медиа не скачивались: длина и слова считаются только по тексту и подписям.',
        'Часовой пояс отображения задаётся при запуске и записывается в отчёт; исходные timestamps не переписываются.',
        'Психолингвистические выводы в отчёт не входят: модуль считает только наблюдаемые числовые признаки.',
      ],
    },
  };
}

function collectParticipants(messages: NormalizedMessage[]): Map<string, ParticipantStats> {
  const result = new Map<string, ParticipantStats>();
  for (const message of messages) {
    const key = senderKey(message);
    if (!result.has(key)) {
      result.set(key, {
        id: message.sender.id,
        key,
        displayName: message.sender.displayName,
        username: message.sender.username,
        isSelf: message.sender.isSelf,
        messages: 0,
        share: 0,
        characters: 0,
        words: 0,
        links: 0,
        media: 0,
        repliesSent: 0,
        directRepliesSent: 0,
        estimatedRepliesSent: 0,
        sessionsStarted: 0,
        longPauseResumes: 0,
        firstMessageAt: null,
        lastMessageAt: null,
        medianCharacters: 0,
        medianWords: 0,
        medianDirectReplySeconds: null,
        medianEstimatedReplySeconds: null,
      });
    }
  }
  return result;
}

function senderKey(message: NormalizedMessage): string {
  return message.sender.id === null ? 'unknown' : `id:${message.sender.id}`;
}

function computeLengths(messages: NormalizedMessage[]): LengthStats {
  const characters = messages.map((message) => message.textLength);
  const words = messages.map((message) => message.wordCount);
  const links = messages.map((message) => message.links.length);

  return {
    characters: distribution(characters),
    words: distribution(words),
    linksPerMessage: distribution(links),
    characterHistogram: histogram(characters, [0, 20, 50, 100, 200, 500, 1000, 2000]),
    wordHistogram: histogram(words, [0, 3, 10, 20, 50, 100]),
    linkHistogram: histogram(links, [0, 1, 2, 5]),
    messagesWithLinks: messages.filter((message) => message.links.length > 0).length,
    totalLinks: links.reduce((sum, value) => sum + value, 0),
  };
}

function computeReplies(
  messages: NormalizedMessage[],
  byId: Map<number, NormalizedMessage>,
  config: AnalysisOptions,
  participants: Map<string, ParticipantStats>
): ReplyStats {
  const directSeconds: number[] = [];
  const estimatedSeconds: number[] = [];
  const directByParticipant = new Map<string, number[]>();
  const estimatedByParticipant = new Map<string, number[]>();
  const adjacency: Record<string, Record<string, number>> = {};
  let withReply = 0;
  let resolvable = 0;
  let crossParticipant = 0;
  let previous: NormalizedMessage | null = null;

  for (const message of messages) {
    const key = senderKey(message);
    if (previous) {
      const previousKey = senderKey(previous);
      adjacency[previousKey] = adjacency[previousKey] ?? {};
      adjacency[previousKey][key] = (adjacency[previousKey][key] ?? 0) + 1;
    }

    if (message.reply?.toMessageId != null) {
      withReply += 1;
      const target = byId.get(message.reply.toMessageId);
      if (target) {
        resolvable += 1;
        if (senderKey(target) !== key) {
          crossParticipant += 1;
          const seconds = Math.max(0, (message.dateMs - target.dateMs) / 1000);
          if (seconds > 0) {
            directSeconds.push(seconds);
            const list = directByParticipant.get(key) ?? [];
            list.push(seconds);
            directByParticipant.set(key, list);
          }
        }
      }
    } else if (
      previous &&
      senderKey(previous) !== key &&
      message.dateMs > previous.dateMs &&
      (message.dateMs - previous.dateMs) / 1000 <= config.estimateWindowSeconds
    ) {
      const seconds = (message.dateMs - previous.dateMs) / 1000;
      estimatedSeconds.push(seconds);
      const list = estimatedByParticipant.get(key) ?? [];
      list.push(seconds);
      estimatedByParticipant.set(key, list);
    }

    previous = message;
  }

  for (const [key, seconds] of directByParticipant) {
    const participant = participants.get(key);
    if (participant) {
      participant.directRepliesSent = seconds.length;
      participant.medianDirectReplySeconds = round(median(seconds), 1);
    }
  }
  for (const [key, seconds] of estimatedByParticipant) {
    const participant = participants.get(key);
    if (participant) {
      participant.estimatedRepliesSent = seconds.length;
      participant.medianEstimatedReplySeconds = round(median(seconds), 1);
    }
  }

  const byParticipant = (
    source: Map<string, number[]>
  ): Record<string, { count: number; medianSeconds: number }> => {
    const result: Record<string, { count: number; medianSeconds: number }> = {};
    for (const [key, seconds] of source) {
      result[key] = { count: seconds.length, medianSeconds: round(median(seconds), 1) };
    }
    return result;
  };

  return {
    replyLinksAvailable: withReply > 0,
    messagesWithReplyField: withReply,
    messagesWithResolvableReply: resolvable,
    replyCoverage: messages.length === 0 ? 0 : round(withReply / messages.length, 4),
    resolvableReplyCoverage: messages.length === 0 ? 0 : round(resolvable / messages.length, 4),
    crossParticipantReplies: crossParticipant,
    directReplies: {
      count: directSeconds.length,
      seconds: distributionOrNull(directSeconds),
      byParticipant: byParticipant(directByParticipant),
    },
    estimatedReplies: {
      count: estimatedSeconds.length,
      seconds: distributionOrNull(estimatedSeconds),
      byParticipant: byParticipant(estimatedByParticipant),
      method:
        'Следующее сообщение другого участника без replyToId в пределах estimateWindowSeconds; не является доказанным ответом.',
    },
    adjacencyMatrix: adjacency,
  };
}

function computeSessions(
  messages: NormalizedMessage[],
  config: AnalysisOptions,
  participants: Map<string, ParticipantStats>
): SessionStats {
  const builders: SessionBuilder[] = [];
  let current: SessionBuilder | null = null;

  for (const message of messages) {
    if (!current) {
      current = {
        start: message.date,
        end: message.date,
        startMs: message.dateMs,
        endMs: message.dateMs,
        gapBeforeSeconds: null,
        messages: [message],
      };
      continue;
    }

    const gap: number = (message.dateMs - current.endMs) / 1000;
    if (gap > config.sessionGapSeconds) {
      builders.push(current);
      current = {
        start: message.date,
        end: message.date,
        startMs: message.dateMs,
        endMs: message.dateMs,
        gapBeforeSeconds: gap,
        messages: [message],
      };
    } else {
      current.messages.push(message);
      current.end = message.date;
      current.endMs = message.dateMs;
    }
  }
  if (current) builders.push(current);

  const sessions: SessionSummary[] = builders.map((builder, index) => {
    const counts: Record<string, number> = {};
    for (const message of builder.messages) {
      const key = senderKey(message);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const initiator = senderKey(builder.messages[0]);
    const isLongPauseResume =
      index > 0 && (builder.gapBeforeSeconds ?? 0) > config.longPauseSeconds;
    const initiatorStats = participants.get(initiator);
    if (initiatorStats) {
      initiatorStats.sessionsStarted += 1;
      if (isLongPauseResume) initiatorStats.longPauseResumes += 1;
    }
    return {
      index,
      start: builder.start,
      end: builder.end,
      durationSeconds: round((builder.endMs - builder.startMs) / 1000, 1),
      gapBeforeSeconds:
        builder.gapBeforeSeconds === null ? null : round(builder.gapBeforeSeconds, 1),
      messageCount: builder.messages.length,
      initiatedBy: initiator,
      participants: counts,
      isLongPauseResume,
      firstMessageId: builder.messages[0].id,
      lastMessageId: builder.messages[builder.messages.length - 1].id,
    };
  });

  const startsByParticipant: Record<string, number> = {};
  const longPauseResumesByParticipant: Record<string, number> = {};
  for (const session of sessions) {
    startsByParticipant[session.initiatedBy] = (startsByParticipant[session.initiatedBy] ?? 0) + 1;
    if (session.isLongPauseResume) {
      longPauseResumesByParticipant[session.initiatedBy] =
        (longPauseResumesByParticipant[session.initiatedBy] ?? 0) + 1;
    }
  }

  return {
    thresholdSeconds: config.sessionGapSeconds,
    longPauseSeconds: config.longPauseSeconds,
    count: sessions.length,
    medianDurationSeconds: round(median(sessions.map((session) => session.durationSeconds)), 1),
    meanDurationSeconds: round(mean(sessions.map((session) => session.durationSeconds)), 1),
    medianMessagesPerSession: round(median(sessions.map((session) => session.messageCount)), 1),
    startsByParticipant,
    longPauseResumesByParticipant,
    longPauseGaps: sessions.filter((session) => session.isLongPauseResume).length,
    sessions,
  };
}

function computeDynamics(
  monthMessages: Map<string, NormalizedMessage[]>,
  sessions: SessionStats,
  byId: Map<number, NormalizedMessage>,
  formatter: Intl.DateTimeFormat
): { byMonth: MonthlyDynamics[] } {
  const monthOf = (dateMs: number): string => {
    const parts = zonedParts(dateMs, formatter);
    return `${parts.year}-${parts.month}`;
  };

  const sessionsByMonth = new Map<string, SessionSummary[]>();
  for (const session of sessions.sessions) {
    const month = monthOf(Date.parse(session.start));
    const bucket = sessionsByMonth.get(month) ?? [];
    bucket.push(session);
    sessionsByMonth.set(month, bucket);
  }

  const months = [...monthMessages.keys()].sort();
  const byMonth: MonthlyDynamics[] = months.map((month) => {
    const messages = monthMessages.get(month) ?? [];
    const byParticipant: Record<string, number> = {};
    for (const message of messages) {
      const key = senderKey(message);
      byParticipant[key] = (byParticipant[key] ?? 0) + 1;
    }

    const directLatencies: number[] = [];
    let directCount = 0;
    for (const message of messages) {
      if (message.reply?.toMessageId == null) continue;
      const target = byId.get(message.reply.toMessageId);
      if (!target || senderKey(target) === senderKey(message)) continue;
      directCount += 1;
      const seconds = (message.dateMs - target.dateMs) / 1000;
      if (seconds > 0) directLatencies.push(seconds);
    }

    const monthSessions = sessionsByMonth.get(month) ?? [];
    const startsByParticipant: Record<string, number> = {};
    for (const session of monthSessions) {
      startsByParticipant[session.initiatedBy] =
        (startsByParticipant[session.initiatedBy] ?? 0) + 1;
    }

    return {
      month,
      messages: messages.length,
      byParticipant,
      characters: messages.reduce((sum, message) => sum + message.textLength, 0),
      links: messages.reduce((sum, message) => sum + message.links.length, 0),
      directReplies: directCount,
      replyCoverage: messages.length === 0 ? 0 : round(directCount / messages.length, 4),
      medianDirectReplySeconds: directLatencies.length ? round(median(directLatencies), 1) : null,
      sessions: monthSessions.length,
      startsByParticipant,
    };
  });

  return { byMonth };
}

function createZonedFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
}

function zonedParts(dateMs: number, formatter: Intl.DateTimeFormat): ZonedParts {
  const parts = formatter.formatToParts(new Date(dateMs));
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const hour = Number(values.hour ?? '0');
  return {
    year: values.year ?? '1970',
    month: values.month ?? '01',
    day: values.day ?? '01',
    hour: hour === 24 ? 0 : hour,
    weekday: WEEKDAY_SHORT[values.weekday ?? 'Sun'] ?? 0,
  };
}

function bumpActivity(
  target: Record<string, { total: number; byParticipant: Record<string, number> }>,
  key: string,
  participant: string
): void {
  const bucket = target[key] ?? { total: 0, byParticipant: {} };
  bucket.total += 1;
  bucket.byParticipant[participant] = (bucket.byParticipant[participant] ?? 0) + 1;
  target[key] = bucket;
}

function distribution(values: number[]): DistributionSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p90: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: round(mean(values), 2),
    median: round(median(values), 2),
    p90: round(percentile(values, 90), 2),
    p99: round(percentile(values, 99), 2),
  };
}

function distributionOrNull(values: number[]): DistributionSummary | null {
  return values.length === 0 ? null : distribution(values);
}

function histogram(values: number[], limits: number[]): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  for (let index = 0; index < limits.length; index += 1) {
    const from = index === 0 ? 0 : (limits[index - 1] ?? 0) + 1;
    const to = index === 0 && limits[0] === 0 ? 0 : (limits[index] ?? null);
    buckets.push({ from, to, count: 0 });
  }
  buckets.push({ from: (limits[limits.length - 1] ?? 0) + 1, to: null, count: 0 });

  for (const value of values) {
    let placed = false;
    for (const bucket of buckets) {
      if (value >= bucket.from && (bucket.to === null || value <= bucket.to)) {
        bucket.count += 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const last = buckets[buckets.length - 1];
      last.count += 1;
    }
  }
  return buckets;
}

function countZeroIntervals(messages: NormalizedMessage[]): number {
  let count = 0;
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index].dateMs === messages[index - 1].dateMs) count += 1;
  }
  return count;
}

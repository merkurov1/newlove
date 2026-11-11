import type {
  ActivityCategory,
  ContextPeriod,
  DailyDigest,
  EvidenceClass,
  TimelineEvent,
} from './types';

/**
 * Pure chronology and daily-digest helpers.
 *
 * The rules here are intentionally conservative: an intention is not a
 * completed deliverable, and an AI inference is never presented as an owner
 * confirmation.
 */

const CATEGORY_PATTERNS: Array<{ category: ActivityCategory; patterns: RegExp[] }> = [
  {
    category: 'PUBLISHING',
    patterns: [
      /(опубликова|публикац|выпустил|издал|publish|published|release[d]?|shipped|launch(?:ed)?)/i,
      /(выпуск|issue|edition)/i,
    ],
  },
  {
    category: 'WRITING',
    patterns: [
      /(написал|написала|пишу|текст|глава|chapter|рукопис|manuscript|статья|article|draft|черновик|редактур)/i,
    ],
  },
  {
    category: 'ART',
    patterns: [
      /(картин|арт|artwork|illustration|иллюстрац|визуал|postcard|открытк|скульптур|рисун|дизайн|design)/i,
    ],
  },
  {
    category: 'TECHNICAL_WORK',
    patterns: [
      /(код|code|deploy|supabase|vercel|github|api|bug|фикс|fix|сборк|build|миграц|migration|database|база данных|typescript|react|next\.js)/i,
    ],
  },
  {
    category: 'CREATIVE_WORK',
    patterns: [
      /(идея|концепц|сценар|сери[яи]|series|episode|эпизод|creative|творческ|структур[аы] повеств)/i,
    ],
  },
  {
    category: 'COMMUNICATION',
    patterns: [
      /(письмо|email|telegram|bluesky|созвон|звонок|встреч|meeting|call|переписк|коммуникац)/i,
    ],
  },
  {
    category: 'ADMINISTRATION',
    patterns: [
      /(счет|счёт|invoice|бюджет|budget|договор|contract|налог|tax|админ|admin|form|заявк)/i,
    ],
  },
  {
    category: 'PERSONAL_ACTIVITY',
    patterns: [/(прогул|спорт|отдых|personal|личн|здоров|family|семь)/i],
  },
  {
    category: 'PROJECT_DEVELOPMENT',
    patterns: [
      /(проект|project|план|plan|структур|roadmap|proposal|предложени|бриф|brief|стратег|strategy)/i,
    ],
  },
];

const INTENTION_PATTERNS = [
  /(нужно|надо|следует|планирую|планируем|собираюсь|собираемся|хочу|хотим|предстоит|следующ\w*\s+шаг)/i,
  /(need to|should|plan(?:ning)? to|going to|will|next step|to-?do|сделать|подготовить|добавить)/i,
];

const COMPLETION_PATTERNS = [
  /(сделал|сделала|сделали|завершил|завершила|завершили|закончил|закончила|закончили|выполнил|выполнила|выполнили|готово|готова|готовы|завершено|выполнено)/i,
  /(опубликовал|опубликовала|опубликовали|выпустил|выпустила|выпустили|издал|издала|издали)/i,
  /(done|completed?|finished?|published?|shipped|released?|delivered?)/i,
  /(готово|сделано|завершено)\s*[:—-]/i,
];

const NEGATED_COMPLETION = /(не\s+(?:сделал|сделала|завершил|завершила|закончил|закончила|готово|опубликовал)|not\s+(?:done|completed?|finished?|published?))/i;

export function classifyActivityCategory(text: string): ActivityCategory {
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry.category;
  }
  return 'PROJECT_DEVELOPMENT';
}

export type CompletionSignal = {
  completed: boolean;
  intention: boolean;
};

/**
 * Distinguishes "I finished X" from "I need to finish X". Both can be true in
 * one sentence; the caller must not turn the intention into a deliverable.
 */
export function detectCompletionSignal(text: string): CompletionSignal {
  const intention = INTENTION_PATTERNS.some((pattern) => pattern.test(text));
  const negated = NEGATED_COMPLETION.test(text);
  const completed = !negated && COMPLETION_PATTERNS.some((pattern) => pattern.test(text));
  return { completed, intention };
}

function eventTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sorts by actual event time, then by ingestion time, then by a stable id.
 * It never merges two different events just because they share a day.
 */
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = eventTime(left.occurredAt);
    const rightTime = eventTime(right.occurredAt);
    if (leftTime !== rightTime) return leftTime - rightTime;
    const leftRecorded = eventTime(left.recordedAt);
    const rightRecorded = eventTime(right.recordedAt);
    if (leftRecorded !== rightRecorded) return leftRecorded - rightRecorded;
    return left.id.localeCompare(right.id);
  });
}

export function dedupeTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const result: TimelineEvent[] = [];
  for (const event of events) {
    const key = `${event.type}:${event.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

export function timelineDayKey(iso: string, timezone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function groupTimelineByDay(
  events: TimelineEvent[],
  timezone: string
): Array<{ day: string; events: TimelineEvent[] }> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of sortTimeline(dedupeTimeline(events))) {
    const day = timelineDayKey(event.occurredAt, timezone) || 'undated';
    const list = groups.get(day) || [];
    list.push(event);
    groups.set(day, list);
  }
  return Array.from(groups.entries()).map(([day, list]) => ({ day, events: list }));
}

export function formatTimelineTime(
  iso: string | null,
  timezone: string,
  language: 'ru' | 'en' = 'ru'
): string {
  if (!iso) return language === 'ru' ? 'без времени' : 'undated';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return language === 'ru' ? 'без времени' : 'undated';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function isWithinPeriod(event: TimelineEvent, period: ContextPeriod | null): boolean {
  if (!period) return true;
  const time = eventTime(event.occurredAt);
  return time >= eventTime(period.from) && time < eventTime(period.to);
}

function uniqueEvents(events: TimelineEvent[]): TimelineEvent[] {
  return dedupeTimeline(sortTimeline(events));
}

function isConfirmedCompletion(event: TimelineEvent): boolean {
  if (!event.completed) return false;
  return (
    event.evidenceClass === 'USER_CONFIRMED' ||
    event.evidenceClass === 'DIRECTLY_OBSERVED' ||
    event.evidenceClass === 'MEASURED'
  );
}

/**
 * Builds a concise daily digest. `completed` contains only events that are
 * both marked complete and backed by confirmation/observation. Intentions stay
 * in `intentions` even when they mention a completion verb.
 */
export function buildDailyDigest(input: {
  events: TimelineEvent[];
  timezone: string;
  period: ContextPeriod | null;
  gaps?: string[];
}): DailyDigest {
  const inPeriod = uniqueEvents(input.events.filter((event) => isWithinPeriod(event, input.period)));
  const completed = inPeriod.filter(
    (event) => isConfirmedCompletion(event) && !event.intention
  );
  const decisions = inPeriod.filter(
    (event) =>
      event.type === 'decision' &&
      !['superseded', 'rejected', 'archived'].includes((event.status || '').toLowerCase()) &&
      (event.evidenceClass === 'USER_CONFIRMED' || event.evidenceClass === 'DOCUMENTED')
  );
  const deliverables = inPeriod.filter(
    (event) =>
      (event.type === 'deliverable' || event.type === 'artifact' || event.type === 'document') &&
      (event.evidenceClass === 'USER_CONFIRMED' || event.evidenceClass === 'DOCUMENTED' || event.evidenceClass === 'MEASURED')
  );
  const intentions = inPeriod.filter(
    (event) => event.intention && !completed.some((done) => done.id === event.id)
  );
  const discussions = inPeriod.filter(
    (event) =>
      event.type === 'message' &&
      !completed.some((done) => done.id === event.id) &&
      !intentions.some((item) => item.id === event.id)
  );

  const gaps = [...(input.gaps || [])];
  if (inPeriod.length === 0) {
    gaps.push(
      input.period
        ? 'За выбранный период не найдено ни одного сохранённого события. Это не означает, что работы не было.'
        : 'Не найдено сохранённых событий. Это не означает, что работы не было.'
    );
  }

  return {
    timezone: input.timezone,
    period: input.period,
    completed: completed.slice(0, 12),
    decisions: decisions.slice(0, 10),
    deliverables: deliverables.slice(0, 10),
    intentions: intentions.slice(0, 10),
    discussions: discussions.slice(0, 12),
    gaps,
  };
}

export const TIMELINE_EVIDENCE_LABELS_RU: Record<EvidenceClass, string> = {
  MEASURED: 'измерено',
  USER_CONFIRMED: 'подтверждено владельцем',
  DIRECTLY_OBSERVED: 'наблюдалось',
  DOCUMENTED: 'документ',
  INFERRED: 'вывод',
  UNKNOWN: 'неизвестно',
};

export const TIMELINE_EVIDENCE_LABELS_EN: Record<EvidenceClass, string> = {
  MEASURED: 'measured',
  USER_CONFIRMED: 'owner-confirmed',
  DIRECTLY_OBSERVED: 'observed',
  DOCUMENTED: 'documented',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
};

import type { PierrotMemoryKind } from './types';

export type PierrotMemoryAction =
  | 'none'
  | 'remember'
  | 'save'
  | 'remind'
  | 'list'
  | 'search'
  | 'history_search'
  | 'current_status'
  | 'create_task'
  | 'rate'
  | 'complete'
  | 'archive'
  | 'forget'
  | 'restore'
  | 'delete'
  | 'cleanup'
  | 'cleanup_preview'
  | 'clarify';

export type PierrotMemoryMutationScope = 'single' | 'selection' | 'project' | 'all' | 'none';

export type PierrotMemoryIntent = {
  action: PierrotMemoryAction;
  kind: PierrotMemoryKind | null;
  content: string | null;
  query: string | null;
  title: string | null;
  reviewAt: string | null;
  possibleConflict: boolean;
  /** True only for an explicit “навсегда / permanently” delete. */
  permanent: boolean;
  /** Search should include archived/superseded records. */
  includeArchive: boolean;
  /** The command refers to records from the most recent displayed list. */
  listReference: 'none' | 'all' | 'last' | 'last_two' | 'these';
  /** Strict target scope. Multi-record scopes require preview + confirmation. */
  scope: PierrotMemoryMutationScope;
  /** Exact project name/slug/id extracted from a project-scoped command. */
  projectRef: string | null;
  /** Owner rating 1..10, kept separate from model importance/confidence. */
  rating: number | null;
  ratingTarget: 'project' | 'task' | null;
  confidence: number;
  reason: string;
};

type HistoryItem = { role: 'user' | 'assistant'; content: string };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastAssistantText(history?: HistoryItem[]): string | null {
  if (!history) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role === 'assistant' && item.content.trim()) return item.content.trim();
  }

  return null;
}

function cleanContent(value: string): string {
  return value
    .replace(/^[\s:—–-]+/, '')
    .replace(/^(что|that)\s+/i, '')
    .replace(/^["«“]/, '')
    .replace(/["»”]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4_000);
}

function makeTitle(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() || content.trim();
  return (first.length > 96 ? `${first.slice(0, 93).trimEnd()}…` : first).slice(0, 200);
}

function atNine(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

const MONTHS: Record<string, number> = {
  января: 0,
  январь: 0,
  февраля: 1,
  февраль: 1,
  марта: 2,
  март: 2,
  апреля: 3,
  апрель: 3,
  мая: 4,
  май: 4,
  июня: 5,
  июнь: 5,
  июля: 6,
  июль: 6,
  августа: 7,
  август: 7,
  сентября: 8,
  сентябрь: 8,
  октября: 9,
  октябрь: 9,
  ноября: 10,
  ноябрь: 10,
  декабря: 11,
  декабрь: 11,
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function applyTime(date: Date, text: string): Date {
  const match = text.match(/(?:в|at)\s+([01]?\d|2[0-3])[:.](\d{2})/i);
  if (!match) return date;

  const next = new Date(date);
  next.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
  return next;
}

/**
 * Small deterministic reminder-date parser. It is deliberately conservative:
 * an unrecognised phrase leaves the reminder without a due date rather than
 * inventing one. It never creates calendar events.
 */
export function parseReminderDate(text: string, now: Date = new Date()): string | null {
  const normalized = normalize(text);

  const relative = normalized.match(
    /через\s+(\d{1,2})\s*(минут|минуты|час|часа|часов|день|дня|дней|недел|месяц|месяца|месяцев)/i
  );

  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const next = new Date(now);

    if (unit.startsWith('минут')) next.setUTCMinutes(next.getUTCMinutes() + amount);
    else if (unit.startsWith('час')) next.setUTCHours(next.getUTCHours() + amount);
    else if (unit.startsWith('д')) next.setUTCDate(next.getUTCDate() + amount);
    else if (unit.startsWith('недел')) next.setUTCDate(next.getUTCDate() + amount * 7);
    else next.setUTCDate(next.getUTCDate() + amount * 30);

    return applyTime(next, normalized).toISOString();
  }

  if (/(^|\s)послезавтра(\s|$)/i.test(normalized)) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 2);
    return applyTime(atNine(next), normalized).toISOString();
  }

  if (/(^|\s)завтра(\s|$)|(^|\s)tomorrow(\s|$)/i.test(normalized)) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    return applyTime(atNine(next), normalized).toISOString();
  }

  const iso = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const next = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return applyTime(atNine(next), normalized).toISOString();
  }

  const dotted = normalized.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (dotted) {
    const next = new Date(Date.UTC(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1])));
    return applyTime(atNine(next), normalized).toISOString();
  }

  const named = normalized.match(
    /(^|\s)(\d{1,2})\s+(января|январь|февраля|февраль|марта|март|апреля|апрель|мая|май|июня|июнь|июля|июль|августа|август|сентября|сентябрь|октября|октябрь|ноября|ноябрь|декабря|декабрь|january|february|march|april|may|june|july|august|september|october|november|december)(?=\s|$)/i
  );

  if (named) {
    const month = MONTHS[named[3].toLowerCase()];
    const year = now.getUTCFullYear();
    let next = new Date(Date.UTC(year, month, Number(named[2])));
    if (next.getTime() < now.getTime()) {
      next = new Date(Date.UTC(year + 1, month, Number(named[2])));
    }
    return applyTime(atNine(next), normalized).toISOString();
  }

  const weekday = normalized.match(
    /(^|\s)(?:в|on)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=\s|$)/i
  );

  if (weekday) {
    const names = [
      ['воскресенье', 'sunday'],
      ['понедельник', 'monday'],
      ['вторник', 'tuesday'],
      ['сред', 'wednesday'],
      ['четверг', 'thursday'],
      ['пятниц', 'friday'],
      ['суббот', 'saturday'],
    ];
    const target = names.findIndex((group) =>
      group.some((name) => weekday[2].toLowerCase().startsWith(name))
    );
    if (target >= 0) {
      const next = new Date(now);
      const current = next.getUTCDay();
      let delta = (target - current + 7) % 7;
      if (delta === 0) delta = 7;
      next.setUTCDate(next.getUTCDate() + delta);
      return applyTime(atNine(next), normalized).toISOString();
    }
  }

  if (/(^|\s)(на следующей неделе|next week)(\s|$)/i.test(normalized)) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 7);
    return applyTime(atNine(next), normalized).toISOString();
  }

  return null;
}

const LIST_PATTERNS = [
  /что\s+я\s+(?:просил\s+)?(?:сохранить|запомнить)/i,
  /что\s+(?:у\s+нас\s+)?(?:сохранено|запомнено|в\s+заметках)/i,
  /покажи\s+(?:всю\s+)?память/i,
  /покажи\s+(?:все\s+)?сохраненн/i,
  /что\s+(?:у\s+нас\s+)?(?:в\s+)?памяти/i,
  /покажи\s+(?:все\s+)?напоминани/i,
  /что\s+осталось\s+незавершенн/i,
  /что\s+ты\s+обо\s+мне\s+помнишь/i,
  /покажи\s+(?:все\s+)?(?:сохраненн|запомненн)/i,
  /список\s+(?:сохраненн|запомненн|напоминани)/i,
  /what\s+do\s+you\s+remember\s+about\s+me/i,
  /show\s+(?:my\s+)?(?:memory|saved|reminders)/i,
  /what\s+(?:have\s+i|did\s+i)\s+(?:save|remember)/i,
  /what\s+(?:have\s+we|did\s+we)\s+(?:saved|remembered)/i,
  /покажи\s+(?:мне\s+)?(?:все\s+)?(?:текущие\s+|активные\s+|открытые\s+)?(?:задачи|задач|напоминания)/i,
  /покажи\s+(?:мне\s+)?(?:все\s+)?(?:технические|рабочие)\s+(?:задачи|задач)/i,
  /покажи\s+(?:мне\s+)?(?:текущий\s+)?список\s+(?:задач|напоминаний)/i,
  /какие\s+(?:у\s+меня\s+)?(?:есть\s+)?(?:текущие\s+|активные\s+|открытые\s+)?(?:задачи|задач)/i,
  /какие\s+(?:ещё|еще\s+)?(?:технические\s+)?задачи/i,
  /перечисли\s+(?:все\s+)?(?:текущие\s+|активные\s+|технические\s+)?(?:задачи|задач)/i,
  /список\s+(?:текущих\s+|активных\s+|открытых\s+)?(?:задач|задачи|напоминаний)/i,
  /что\s+(?:сейчас\s+)?(?:в\s+)?(?:задачах|напоминаниях)/i,
  /show\s+(?:my\s+)?(?:current\s+|active\s+|open\s+)?tasks/i,
  /what\s+are\s+my\s+(?:current\s+|active\s+|open\s+)?tasks/i,
  /list\s+(?:my\s+)?(?:current\s+|active\s+|open\s+)?tasks/i,
];

const SEARCH_PATTERNS = [
  /найди\s+(?:в\s+памяти|запись|заметку|напоминание)/i,
  /поищи\s+в\s+памяти/i,
  /search\s+(?:my\s+)?memory/i,
  /find\s+(?:a\s+)?(?:memory|saved|reminder)/i,
];

const HISTORY_PATTERNS = [
  /что\s+(?:мы\s+)?(?:решали|записали|сохраняли|обсуждали)\s+(?:про|о|по)/i,
  /что\s+было\s+(?:раньше|до\s+этого)/i,
  /истори[яю]\s+(?:по|про|вопроса)/i,
  /(?:what|which)\s+did\s+we\s+(?:decide|agree)\s+(?:about|on)/i,
  /decision\s+history/i,
];

const CURRENT_PATTERNS = [
  /что\s+(?:сейчас|теперь)\s+актуально/i,
  /что\s+актуально\s+(?:по|про|насчет)/i,
  /что\s+(?:сейчас\s+)?действует\s+(?:по|про)/i,
  /what\s+is\s+(?:currently\s+)?(?:current|in\s+effect)\s+(?:about|on|for)/i,
];

const CLEANUP_PREVIEW = [
  /покажи[^.!?]*(?:что|какие)[^.!?]*(?:можно|стоит|нужно)\s*(?:почистить|удалить|заархивировать|убрать)/i,
  /что\s+(?:можно|стоит|нужно)\s*(?:почистить|заархивировать|убрать)/i,
  /кандидат[а-я]*\s+на\s+очистк/i,
  /(?:убери|убрать|почисти|очисти)[^.!?]*(?:в\s+архив)?[^.!?]*(?:вс[её](?:\s|$)|лишн|мусор|ненужн)/i,
  /(?:убери|убрать|почисти|очисти)[^.!?]*(?:в\s+архив)?[^.!?]*вс[её][^.!?]*(?:неактуальн|устар|лишн)/i,
  /что\s+(?:можно|стоит|нужно)\s+(?:убрать|заархивировать|архивировать)\s+в\s+архив/i,
  /what\s+can\s+(?:i|we)\s+clean(?:\s+up)?/i,
  /(?:archive|clean\s+up)[^.!?]*(?:everything|anything)[^.!?]*(?:irrelevant|outdated|stale|unused)/i,
  /memory\s+cleanup\s+candidates/i,
];

const CLEANUP = [
  /^(?:пожалуйста[,\s]*)?(?:почисти|очисти|прибери)\s+(?:память|записи|список)/i,
  /^(?:please[,\s]*)?(?:clean|tidy)\s+(?:up\s+)?(?:my\s+)?memory/i,
  /проведи\s+уборку\s+памяти/i,
];

const COMPLETE_PATTERNS = [
  /(?:^|\s)(?:заверши|завершить|выполни|выполнить|закрой|закрыть|отметь|отметить|пометь|пометить|считай|считать)\s+(?:как\s+)?(?:напоминание|задачу|это|запись)?\s*/i,
  /(?:^|\s)(?:mark|set)\b[^.!?]{0,160}?\b(?:done|complete|completed|finished)\b/i,
  /(?:^|[\s,.;:—–-])(?:задача|задачу|запись|напоминание|task|note|reminder)?[^.!?]{0,160}?(?:^|[\s,.;:—–-])(?:выполнена|выполнено|выполнен|выполнены|сделана|сделано|сделан|сделаны|готова|готово|готов|готовы|завершена|завершено|завершён|завершены)(?=$|[\s,.;:—–!?])/iu,
  /(?:^|\s)(?:это\s+)?(?:уже\s+)?(?:сделано|выполнено|готово)(?:\s|[.,!?]|$)/i,
  /(?:^|[\s,.;:—–-])(?:выполнены|сделаны|завершены|готовы|completed|done|finished)(?=$|[\s,.;:—–!?])/i,
  /(?:^|\s)(?:complete|finish|close)\s+(?:the\s+)?(?:reminder|task|this|it)\b/i,
  /^(?:done|completed|finished)(?:\s|[.,!?]|$)/i,
  /(?:^|\s)(?:this|it|that)\s+(?:is|was|has\s+been)\s+(?:already\s+)?(?:done|completed|finished)(?:\s|[.,!?]|$)/i,
];

const INCOMPLETE_STATE =
  /(?:^|\s)не\s+(?:выполнена|выполнено|выполнен|выполнены|сделана|сделано|сделан|сделаны|готова|готово|готов|готовы|завершена|завершено|завершён|завершены|done|completed|finished)/i;

const PLAIN_ARCHIVE_PATTERNS = [
  /(?:^|[\s,.;:—–-])(?:удали|удалить|сотри|стереть|убери|убрать)\s+(?:эту\s+|это\s+|этот\s+|the\s+)?(?:задачу|запись|заметку|напоминание|пункт|task|note|record|reminder)(?=$|[\s,.;:—–!?])/i,
  /(?:^|[\s,.;:—–-])(?:удали|удалить|сотри|стереть|убери|убрать)\s+(?:всё|все|все\s+это|всё\s+это|всё\s+перечисленное|все\s+перечисленное|this\s+list|all\s+listed|everything\s+listed)(?=$|[\s,.;:—–!?])/i,
  /(?:^|[\s,.;:—–-])(?:убери|убрать)\s+(?:это|эту|этот)(?=$|[\s,.;:—–!?])/i,
  /(?:^|[\s,.;:—–-])(?:delete|remove|discard)\s+(?:this|that|it|the\s+(?:task|note|record|reminder))(?=$|[\s,.;:—–!?])/i,
  /^(?:удали|удалить|сотри|стереть|убери|убрать|delete|remove|discard)[.!?]?$/i,
];

const ARCHIVE_PATTERNS = [
  /(?:^|[\s,.;:—–-])(?:архивируй(?:те)?|архивировать|убери(?:те)?\s+(?:это\s+)?в\s+архив|убрать\s+(?:это\s+)?в\s+архив|перемести(?:те)?\s+в\s+архив)(?=$|[\s,.;:—–!?])/i,
  /(?:^|\s)в\s+архив(?=$|[\s,.;:—–!?])/i,
  /^(?:please[,\s]*)?(?:archive|move\s+to\s+archive)\s+(?:this|it|that|the\s+(?:note|record|reminder|task))\b/i,
  /(?:^|[\s,.;:—–-])archive\s+(?:it|this|that|the\s+(?:note|record|reminder|task))(?=$|[\s,.;:—–!?])/i,
  /(?:^|[\s,.;:—–-])move\s+(?:it|this|that|the\s+(?:note|record|reminder|task))\s+to\s+(?:the\s+)?archive(?=$|[\s,.;:—–!?])/i,
  /^(?:please[,\s]*)?archive\s+(?:all|everything|these|the\s+listed)\b/i,
];

const ARCHIVE_COMMAND_SOURCE =
  /(?:^|[\s,.;:—–-])(?:архивируй(?:те)?|архивировать|убери(?:те)?\s+(?:это\s+)?в\s+архив|убрать\s+(?:это\s+)?в\s+архив|перемести(?:те)?\s+в\s+архив|archive\s+(?:it|this|that|the\s+(?:note|record|reminder|task)|all|everything|these|the\s+listed)|move\s+(?:it|this|that|the\s+(?:note|record|reminder|task))\s+to\s+(?:the\s+)?archive)(?=$|[\s,.;:—–!?])/gi;
const PLAIN_ARCHIVE_COMMAND_SOURCE =
  /(?:^|[\s,.;:—–-])(?:удали|удалить|сотри|стереть|убери|убрать|delete|remove|discard)\s*(?:эту\s+|это\s+|этот\s+|the\s+)?(?:задачу|запись|заметку|напоминание|пункт|task|note|record|reminder|всё|все|всё\s+перечисленное|все\s+перечисленное|this\s+list|all\s+listed|everything\s+listed)?/gi;
const COMPLETE_COMMAND_SOURCE =
  /(?:^|[\s,.;:—–-])(?:заверши(?:те)?|завершить|выполни(?:те)?|выполнить|закрой(?:те)?|закрыть|отметь(?:те)?|отметить|пометь(?:те)?|пометить|считай(?:те)?|считать|complete|finish|close|mark|set)(?=$|[\s,.;:—–!?])/gi;
const COMPLETION_STATE_SOURCE =
  /(?:^|[\s,.;:—–-])(?:уже\s+)?(?:выполнена|выполнено|выполнен|выполнены|выполненной|выполненную|выполненными|сделана|сделано|сделан|сделаны|сделанной|сделанную|сделанными|готова|готово|готов|готовы|готовой|завершена|завершено|завершён|завершены|завершённой|завершённую|завершёнными|completed|finished|done|ready|неактуальн[а-я]*|устар[а-я]*|ненужн[а-я]*|лишн[а-я]*)(?=$|[\s,.;:—–!?])/gi;
const TASK_LEAD_SOURCE =
  /^(?:пожалуйста[,\s]*)?(?:the\s+)?(?:задача|задачу|запись|заметку|напоминание|task|note|reminder)\s+(?:(?:про|о|об|по|about|on|for)\s+)?/i;

const FORGET_PATTERNS = [
  /^(?:пожалуйста[,\s]*)?(?:забудь|забыть|забудьте)\s+(?:про|о|об)?\s*/i,
  /^(?:убери|убрать)\s+(?:это\s+)?из\s+памяти\s*/i,
  /^(?:please[,\s]*)?(?:forget)\s+(?:about\s+)?/i,
  /^(?:это|эта\s+запись|это\s+решение)\s+больше\s+не\s+актуальн/i,
  /^(?:this|that|it)\s+is\s+no\s+longer\s+(?:relevant|current|true)/i,
];

const DELETE_PATTERNS = [
  /^(?:пожалуйста[,\s]*)?(?:удали|удалить|сотри|стереть)\s+(?:навсегда|безвозвратно|окончательно)\s*/i,
  /^(?:удали|удалить)\s+(?:запись|заметку|напоминание)?\s*(?:навсегда|безвозвратно)/i,
  /^(?:please[,\s]*)?(?:delete|remove|erase)\s+(?:permanently|for\s+good)\s*/i,
  /^(?:delete|erase)\s+(?:the\s+)?(?:record|memory|note|reminder)\s+(?:permanently|for\s+good)/i,
];

const RESTORE_PATTERNS = [
  /^(?:пожалуйста[,\s]*)?(?:верни|восстанови)\s+(?:это\s+)?(?:в\s+память|из\s+архива)\s*/i,
  /^(?:пожалуйста[,\s]*)?(?:верни|восстанови)\s+(?:запись|заметку|напоминание)?\s*/i,
  /^(?:please[,\s]*)?(?:restore|bring\s+back)\s+(?:the\s+)?(?:memory|record|note|reminder)?\s*/i,
  // “Ты случайно завершил эту задачу, восстанови её” is a correction after an
  // operation and must also reach the restore path.
  /(?:^|[\s,.;:—–-])(?:верни|верните|восстанови|восстановите)(?=\s|$)/i,
  /(?:^|[\s,.;:—–-])(?:restore|bring\s+back)\b/i,
];

const CREATE_REMEMBER =
  /^(?:пожалуйста[,\s]*)?(?:запомни|запомните|запомнить)(?:\s+(?:что|это|следующее))?\s*[:,—–-]?\s*/i;
const CREATE_SAVE =
  /^(?:пожалуйста[,\s]*)?(?:сохрани|сохраните|сохранить)(?:\s+(?:это|эту\s+идею|этот\s+текст|эту\s+мысль|идею|заметку|пока|на\s+потом|себе))?\s*[:,—–-]?\s*/i;
const CREATE_REMIND =
  /^(?:пожалуйста[,\s]*)?(?:напомни|напомните|напомнить)(?:\s+(?:мне|потом|позже|об\s+этом))*\s*[:,—–-]?\s*/i;
const CREATE_REMEMBER_EN =
  /^(?:please[,\s]*)?(?:remember|keep\s+(?:this\s+)?in\s+mind|note\s+that)\s*[:,—–-]?\s*/i;
const CREATE_SAVE_EN =
  /^(?:please[,\s]*)?(?:save|keep|store)\s+(?:this\s+(?:idea|text|thought)|this|it|for\s+later)\s*[:,—–-]?\s*/i;
const CREATE_REMIND_EN =
  /^(?:please[,\s]*)?(?:remind\s+me|remind)\s*(?:later|about|to)?\s*[:,—–-]?\s*/i;

const CONFLICT =
  /(вместо|больше\s+не|отменя|отмени|заменя|replace|instead|no\s+longer|not\s+anymore)/i;

function result(
  action: PierrotMemoryAction,
  options: Partial<PierrotMemoryIntent> = {}
): PierrotMemoryIntent {
  return {
    action,
    kind: null,
    content: null,
    query: null,
    title: null,
    reviewAt: null,
    possibleConflict: false,
    permanent: false,
    includeArchive: false,
    listReference: 'none',
    scope: 'none',
    projectRef: null,
    rating: null,
    ratingTarget: null,
    confidence: options.confidence ?? 0.7,
    reason: options.reason ?? action,
    ...options,
  };
}

function createIntent(
  action: 'remember' | 'save' | 'remind',
  message: string,
  history: HistoryItem[] | undefined,
  contentOverride?: string
): PierrotMemoryIntent {
  const kind = action === 'remember' ? 'memory' : action === 'save' ? 'saved' : 'reminder';
  const cleaned = cleanContent(contentOverride ?? '');
  const fallback = cleaned.length > 0 ? cleaned : lastAssistantText(history);
  let content = fallback ? cleanContent(fallback) : '';
  const reviewAt = action === 'remind' ? parseReminderDate(message) : null;

  if (action === 'remind' && content) {
    content = cleanContent(
      content
        .replace(/(^|\s)(завтра|послезавтра|tomorrow|next\s+week)(?=\s|$)/gi, ' ')
        .replace(
          /\bчерез\s+\d{1,2}\s*(минут[а-я]*|час[а-я]*|день|дня|дней|недел[а-я]*|месяц[а-я]*)\b/gi,
          ' '
        )
        .replace(
          /(^|\s)в\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=\s|$)/gi,
          ' '
        )
        .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
        .replace(/\b\d{1,2}\.\d{1,2}\.20\d{2}\b/g, ' ')
    );
  }

  if (!content) {
    return result('clarify', {
      kind,
      possibleConflict: CONFLICT.test(message),
      confidence: 0.4,
      reason: 'content_missing',
    });
  }

  return result(action, {
    kind,
    content,
    title: makeTitle(content),
    reviewAt,
    possibleConflict: CONFLICT.test(message),
    confidence: 0.86,
    reason: action,
  });
}

function stripCommand(message: string, patterns: RegExp[]): string {
  let value = message.trim();

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      value = value.slice(match[0].length);
      break;
    }
  }

  return value
    .replace(/^[\s:—–,-]+/, '')
    .replace(/^(?:по|про|об|о|about|on|for)\s+/i, '')
    .replace(/[\s?.!]+$/, '')
    .trim()
    .slice(0, 500);
}

function queryWithHistory(
  message: string,
  patterns: RegExp[],
  history?: HistoryItem[]
): string | null {
  const query = stripCommand(message, patterns);
  if (query) return query;

  const previous = lastAssistantText(history);
  return previous ? previous.slice(0, 500) : null;
}

function cleanMutationValue(value: string): string {
  let cleaned = value
    .replace(
      /(?:^|\s)(?:это|эта|этот|эту|эти|этих|уже|её|ее|его|их|it|this|that|them|as|как)(?=\s|$)/gi,
      ' '
    )
    .replace(/^[\s,.;:—–-]+/g, '')
    .replace(/^(?:the\s+)?(?:task|note|record|reminder|задачу|запись|заметку|напоминание)\s+/gi, '')
    .replace(/^(?:про|о|об|about|on|for)\s+/i, '')
    .replace(/[\s,.;:—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(?:задачу|запись|заметку|напоминание|task|note|record|reminder)$/i.test(cleaned)) {
    cleaned = '';
  }

  return cleaned.slice(0, 500);
}

function commandTarget(message: string, patterns: RegExp[]): string | null {
  const value = cleanMutationValue(stripCommand(message, patterns));
  return value || null;
}

/**
 * Extract the record title from an archive/completion sentence. Commands and
 * completion adjectives can appear at the beginning, in the middle or at the
 * end (“Задача X выполнена, убери в архив”). The previous assistant answer is
 * used only when the owner supplied no title at all.
 */
function mutationTarget(
  message: string,
  options: { archive: boolean; history?: HistoryItem[] }
): string | null {
  let value = message.trim();

  if (options.archive) {
    value = value.replace(ARCHIVE_COMMAND_SOURCE, ' ');
    value = value.replace(PLAIN_ARCHIVE_COMMAND_SOURCE, ' ');
  }

  value = value.replace(COMPLETE_COMMAND_SOURCE, ' ').trim();
  value = value.replace(TASK_LEAD_SOURCE, ' ');
  value = value.replace(COMPLETION_STATE_SOURCE, ' ');
  value = value.replace(
    /(?:^|\s)(?:это|эта|этот|эту|эти|этих|уже|её|ее|его|их|it|this|that|them)(?=\s|$)/gi,
    ' '
  );
  value = cleanMutationValue(value);

  if (value) return value;
  return null;
}

function detectListReference(message: string): PierrotMemoryIntent['listReference'] {
  const text = normalize(message);

  if (
    /(всё\s+перечисленное|все\s+перечисленное|все\s+перечисленные|all\s+listed|everything\s+listed|all\s+of\s+these)/i.test(
      text
    )
  ) {
    return 'all';
  }
  if (/(последние\s+две|последних\s+двух|last\s+two)/i.test(text)) return 'last_two';
  if (
    /(эту\s+задачу|эту\s+запись|эту\s+заметку|это\s+напоминание|this\s+task|this\s+record|this\s+note|this\s+reminder)/i.test(
      text
    )
  ) {
    return 'last';
  }
  if (
    /(?:^|\s)(?:закрой|заверши|отметь|пометь|считай|close|finish|complete|mark)\s+(?:эту\s+)?(?:задачу|напоминание|task|reminder)/i.test(
      text
    )
  ) {
    return 'last';
  }
  if (/(это|these|this\s+list|этот\s+список)/i.test(text)) return 'these';

  return 'none';
}

const GENERIC_SCOPE_WORDS =
  /^(?:все|всё|все\s+мои|мои|текущие|активные|открытые|незавершённые|незавершенные|all|my|current|active|open|unfinished|pending|проект|проекта|проекту|project)$/i;

const PROJECT_SCOPE_CANDIDATES: RegExp[] = [
  /(?:все|всех|всё|all|every)\s+(?:мои\s+|my\s+)?(?:задачи|задач|tasks?)\s+(?:по|в|из|для|проекта|проекту|project)\s+(.+)$/i,
  /(?:все|all|every)\s+(?:задачи|tasks?)\s+(?:проекта|project)\s+(.+)$/i,
  /^\s*(?:все\s+|all\s+)?(?:задачи|задач|tasks?)\s+(?:в|во|по|из|для|проекта|проекту|project)\s+(.+)$/i,
  /(?:заверши(?:те)?|завершить|выполни(?:те)?|выполнить|закрой(?:те)?|закрыть|complete|finish|close)\s+(?:все|all)\s+(?:задачи|tasks?)\s+(?:по|в|из|для|проекта|проекту|project)\s+(.+)$/i,
  /(?:все|all|every)\s+(?:задачи|tasks?)\s+(.+)$/i,
];

function cleanProjectRef(value: string): string {
  return value
    .split(
      /\s*[—–-]\s*(?=(?:уже\s+)?(?:выполн|заверш|сдел|готов|done|completed|finished|отметь|пометь))/i
    )[0]
    .replace(
      /\s+(?:уже\s+)?(?:выполнены|выполнено|выполнен|завершены|завершено|завершён|сделаны|сделано|готовы|готово|done|completed|finished)(?:\s|$).*$/i,
      ''
    )
    .replace(/^(?:(?:по|в|из|для)\s+)?(?:проект[аеу]?|project)\s+/i, '')
    .replace(/^(?:по|в|из|для)\s+/i, '')
    .replace(/[.!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function detectProjectRef(message: string): string | null {
  for (const pattern of PROJECT_SCOPE_CANDIDATES) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const ref = cleanProjectRef(match[1]);
    if (!ref) continue;
    if (GENERIC_SCOPE_WORDS.test(ref)) continue;
    return ref;
  }
  return null;
}

const CREATE_TASK_COMMAND =
  /^(?:пожалуйста[,\s]*)?(?:(?:запомни|запомните|remember)\s+(?:новую\s+)?(?:задачу|task)|(?:добав(?:ь|ьте)|добавить|созда(?:й|йте)|создать|завед(?:и|ите)|завести|постав(?:ь|ьте)|поставить|запиш(?:и|ите)|записать|add|create|make)\s+(?:новую\s+|new\s+)?(?:задачу|задачy|таск|task))(?=\s|$|[:—–-])\s*[:—–-]?\s*/i;

const UNNAMED_PROJECT_SCOPE =
  /(?:^|\s)(?:все\s+)?(?:задачи|задач|tasks?)\s+(?:в|во|по|из|для)\s+проект[аеу]?(?=\s|[,.!?]|$)/i;

const TASK_REFERENCE_APPEND =
  /^(?:пожалуйста[,\s]*)?(?:добав(?:ь|ьте)|добавить|запиш(?:и|ите)|записать|add|create)\s+(?:это|это\s+всё|это\s+все|всё\s+это|все\s+это|this|all\s+this)\s+(?:в\s+|to\s+)?(?:задачи|задачу|таски|tasks?)(?=\s|$|[.!?])/i;

const TASK_PROJECT_PREFIX =
  /^\s*(?:в|во|по|для)\s+(?:проект[аеу]?\s+|project\s+)?(.+?)\s*[,:—–-]?\s*(?=(?:добав(?:ь|ьте)|добавить|созда(?:й|йте)|создать|завед(?:и|ите)|завести|постав(?:ь|ьте)|поставить|запиш(?:и|ите)|записать|add|create)\s+(?:новую\s+)?(?:задачу|таск|task))/i;

const TASK_PROJECT_SUFFIX =
  /(?:\s|^)(?:в|во|по|для)\s+(?:проект[аеу]?|project)\s+([\p{L}\p{N}][\p{L}\p{N} &'’_./-]{0,100})/iu;

const PROJECT_REF_STOP =
  /\s+(?:на|в|во|с|со|по|для|если|чтобы|котор[а-яё]*|где|когда|и\s+не|не\s+трогай|—|–|,|;)\s+/i;

function cleanTaskProjectRef(value: string): string | null {
  const cleaned = value
    .split(PROJECT_REF_STOP)[0]
    .replace(/^[\s:—–,.-]+/, '')
    .replace(/[\s,.;:!?—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  if (!cleaned) return null;
  if (/^(?:проект|проекта|проекту|project|задачи|задачу|это|it|this)$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function extractTaskCreation(
  message: string
): { content: string; projectRef: string | null } | null {
  let working = message.trim();
  let projectRef: string | null = null;

  const prefix = working.match(TASK_PROJECT_PREFIX);
  if (prefix) {
    const candidate = cleanTaskProjectRef(prefix[1]);
    if (candidate) {
      projectRef = candidate;
      working = working.slice(prefix[0].length);
    }
  }

  const command = working.match(CREATE_TASK_COMMAND);
  if (!command) return null;

  working = working.slice(command[0].length).trim();

  if (!projectRef) {
    const suffix = working.match(TASK_PROJECT_SUFFIX);
    if (suffix && suffix.index !== undefined) {
      const candidate = cleanTaskProjectRef(suffix[1]);
      if (candidate) {
        projectRef = candidate;
        // The capture is intentionally greedy so it can contain a multi-word
        // project name. Remove only the project phrase, never the task text
        // that follows it.
        const start = suffix.index;
        const relative = suffix[0].indexOf(candidate);
        const end = relative >= 0 ? start + relative + candidate.length : start + suffix[0].length;
        working = `${working.slice(0, start)} ${working.slice(end)}`;
      }
    }
  }

  const content = cleanContent(
    working
      .replace(/^[\s:—–,.-]+/, '')
      .replace(/^(?:что|чтобы|to)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return { content, projectRef };
}

function extractRating(
  message: string
): { target: 'project' | 'task'; ref: string; rating: number } | null {
  const patterns: Array<{ pattern: RegExp; target: 'project' | 'task' }> = [
    {
      pattern:
        /(?:поставь|поставить|установи|установить|задай|задать|оцени|оценить|rate|set)\s+(?:проекту|проект|project)\s+(.+?)\s+(?:оценку|рейтинг|rating|на)?\s*[:—–-]?\s*(\d{1,2})(?:\s*(?:\/\s*10|из\s*10))?/iu,
      target: 'project',
    },
    {
      pattern:
        /(?:поставь|поставить|установи|установить|задай|задать|оцени|оценить|rate|set)\s+(?:задаче|задачу|задачe|task)\s+(.+?)\s+(?:оценку|рейтинг|rating|на)?\s*[:—–-]?\s*(\d{1,2})(?:\s*(?:\/\s*10|из\s*10))?/iu,
      target: 'task',
    },
    {
      pattern:
        /оценка\s+(?:проекта|проекту|project)\s+(.+?)\s*[:—–-]\s*(\d{1,2})(?:\s*(?:\/\s*10|из\s*10))?/iu,
      target: 'project',
    },
    {
      pattern:
        /оценка\s+(?:задачи|задаче|task)\s+(.+?)\s*[:—–-]\s*(\d{1,2})(?:\s*(?:\/\s*10|из\s*10))?/iu,
      target: 'task',
    },
  ];

  for (const item of patterns) {
    const match = message.match(item.pattern);
    if (!match?.[2]) continue;
    const rating = Number(match[2]);
    const ref = cleanMutationValue(match[1]);
    if (!ref || !Number.isInteger(rating) || rating < 1 || rating > 10) continue;
    return { target: item.target, ref, rating };
  }

  return null;
}

function detectMutationScope(
  message: string,
  listReference: PierrotMemoryIntent['listReference'],
  projectRef: string | null
): PierrotMemoryMutationScope {
  if (projectRef) return 'project';

  const text = normalize(message);
  if (
    /(?:все|всё|все\s+мои|all|every)\s+(?:мои\s+|my\s+)?(?:текущие|активные|открытые|незавершённые|незавершенные|current|active|open|unfinished|pending)?\s*(?:задачи|задач|tasks?)(?:\s|$)/i.test(
      text
    ) &&
    !/(?:эти|этих|перечислен|these|listed)/i.test(text)
  ) {
    return 'all';
  }

  if (listReference === 'last') return 'single';
  if (listReference === 'all' || listReference === 'last_two' || listReference === 'these') {
    return 'selection';
  }

  return 'single';
}

/**
 * Detects the owner’s memory intention. It is deliberately command-first:
 * casual mentions of “remember” do not create records.
 */
export function detectMemoryIntent(
  message: string,
  options: { history?: HistoryItem[] } = {}
): PierrotMemoryIntent {
  const original = message.trim();
  const text = normalize(original);

  if (!text) return result('none', { confidence: 1, reason: 'empty' });

  // Preview must run before the destructive-sounding cleanup command.
  if (CLEANUP_PREVIEW.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('cleanup_preview', { confidence: 0.92, reason: 'cleanup_preview' });
  }

  if (CLEANUP.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('cleanup', { confidence: 0.9, reason: 'cleanup_request' });
  }

  if (DELETE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('delete', {
      query: commandTarget(original, DELETE_PATTERNS),
      permanent: true,
      includeArchive: true,
      confidence: 0.93,
      reason: 'permanent_delete_request',
    });
  }

  if (RESTORE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    const listReference = detectListReference(original);
    return result('restore', {
      query: commandTarget(original, RESTORE_PATTERNS),
      listReference,
      scope: listReference === 'last' ? 'single' : 'none',
      includeArchive: true,
      confidence: 0.88,
      reason: 'restore_request',
    });
  }

  if (FORGET_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('forget', {
      query: commandTarget(original, FORGET_PATTERNS),
      includeArchive: true,
      confidence: 0.9,
      reason: 'forget_request',
    });
  }

  // Explicit archive wins over the completion adjective that often accompanies
  // it (“Задача X выполнена, убери в архив”).
  if (
    ARCHIVE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text)) ||
    PLAIN_ARCHIVE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))
  ) {
    const listReference = detectListReference(original);
    const projectRef = detectProjectRef(original);
    if (!projectRef && UNNAMED_PROJECT_SCOPE.test(original)) {
      return result('clarify', {
        confidence: 0.5,
        reason: 'project_scope_missing',
      });
    }
    return result('archive', {
      query: mutationTarget(original, { archive: true, history: options.history }),
      listReference,
      projectRef,
      scope: detectMutationScope(original, listReference, projectRef),
      confidence: 0.9,
      reason: 'archive_request',
    });
  }

  // Explicit task creation is a real write. References such as “добавь это
  // всё в задачи” are deliberately not guessed: an ambiguous pronoun must
  // not create a batch of tasks or produce a false “added” answer.
  const taskCreation = extractTaskCreation(original);
  if (taskCreation) {
    return result('create_task', {
      content: taskCreation.content || null,
      projectRef: taskCreation.projectRef,
      confidence: taskCreation.content ? 0.93 : 0.55,
      reason: taskCreation.content ? 'task_creation_request' : 'task_content_missing',
    });
  }

  if (TASK_REFERENCE_APPEND.test(text)) {
    return result('clarify', {
      confidence: 0.4,
      reason: 'task_reference_ambiguous',
    });
  }

  const rating = extractRating(original);
  if (rating) {
    return result('rate', {
      rating: rating.rating,
      ratingTarget: rating.target,
      query: rating.target === 'task' ? rating.ref : null,
      projectRef: rating.target === 'project' ? rating.ref : null,
      confidence: 0.94,
      reason: 'owner_rating_request',
    });
  }

  for (const pattern of CURRENT_PATTERNS) {
    if (pattern.test(original) || pattern.test(text)) {
      return result('current_status', {
        query: queryWithHistory(original, CURRENT_PATTERNS, options.history),
        confidence: 0.88,
        reason: 'current_status_request',
      });
    }
  }

  for (const pattern of HISTORY_PATTERNS) {
    if (pattern.test(original) || pattern.test(text)) {
      return result('history_search', {
        query: queryWithHistory(original, HISTORY_PATTERNS, options.history),
        includeArchive: true,
        confidence: 0.86,
        reason: 'history_search_request',
      });
    }
  }

  const incompleteState = INCOMPLETE_STATE.test(original) || INCOMPLETE_STATE.test(text);

  if (!incompleteState) {
    for (const pattern of COMPLETE_PATTERNS) {
      if (pattern.test(original) || pattern.test(text)) {
        const listReference = detectListReference(original);
        const projectRef = detectProjectRef(original);
        if (!projectRef && UNNAMED_PROJECT_SCOPE.test(original)) {
          return result('clarify', {
            confidence: 0.5,
            reason: 'project_scope_missing',
          });
        }
        return result('complete', {
          query: mutationTarget(original, { archive: false, history: options.history }),
          listReference,
          projectRef,
          scope: detectMutationScope(original, listReference, projectRef),
          confidence: 0.86,
          reason: 'complete_request',
        });
      }
    }
  }

  for (const pattern of LIST_PATTERNS) {
    if (pattern.test(original) || pattern.test(text)) {
      return result('list', { confidence: 0.9, reason: 'list_request' });
    }
  }

  for (const pattern of SEARCH_PATTERNS) {
    if (pattern.test(original) || pattern.test(text)) {
      return result('search', {
        query: queryWithHistory(original, SEARCH_PATTERNS, options.history),
        confidence: 0.85,
        reason: 'search_request',
      });
    }
  }

  if (/^(запиши|записать|write\s+this\s+down|make\s+a\s+note)(?=\s|$)/i.test(text)) {
    return result('clarify', {
      content: original,
      confidence: 0.35,
      reason: 'ambiguous_create',
    });
  }

  const rememberMatch = original.match(CREATE_REMEMBER) || original.match(CREATE_REMEMBER_EN);
  if (rememberMatch) {
    return createIntent(
      'remember',
      original,
      options.history,
      original.slice(rememberMatch[0].length)
    );
  }

  const saveMatch =
    original.match(CREATE_SAVE) ||
    original.match(CREATE_SAVE_EN) ||
    /(^|[.!?]\s*)к\s+этому\s+(?:надо|стоит|нужно)\s+вернуться/i.test(original);
  if (saveMatch && typeof saveMatch !== 'boolean') {
    return createIntent('save', original, options.history, original.slice(saveMatch[0].length));
  }
  if (saveMatch === true) {
    return createIntent('save', original, options.history);
  }

  const remindMatch = original.match(CREATE_REMIND) || original.match(CREATE_REMIND_EN);
  if (remindMatch) {
    return createIntent('remind', original, options.history, original.slice(remindMatch[0].length));
  }

  if (/пусть\s+это\s+останется\s+в\s+памяти/i.test(original)) {
    return createIntent('remember', original, options.history);
  }

  return result('none', { confidence: 0.95, reason: 'no_memory_command' });
}

/**
 * A write can be an addition, a refinement or an explicit replacement. The
 * store uses this verdict to decide whether it is allowed to link an older
 * record; nothing is ever deleted by a write.
 */
export function classifyMemoryWrite(intent: PierrotMemoryIntent): 'add' | 'refine' | 'replace' {
  if (intent.possibleConflict) return 'replace';
  if (
    intent.action === 'remember' &&
    /\b(уточняю|точнее|а\s+именно|rather|more\s+precisely)\b/i.test(intent.content || '')
  ) {
    return 'refine';
  }
  return 'add';
}

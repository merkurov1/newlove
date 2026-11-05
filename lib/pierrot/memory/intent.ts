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
  | 'complete'
  | 'archive'
  | 'forget'
  | 'restore'
  | 'delete'
  | 'cleanup'
  | 'cleanup_preview'
  | 'clarify';

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
  /^(?:пожалуйста[,\s]*)?(?:почисти|очисти|прибери)\s+(?:память|записи)/i,
  /^(?:please[,\s]*)?(?:clean|tidy)\s+(?:up\s+)?(?:my\s+)?memory/i,
  /проведи\s+уборку\s+памяти/i,
];

const COMPLETE_PATTERNS = [
  /(?:^|\s)(?:заверши|завершить|выполни|выполнить|закрой|закрыть)\s+(?:напоминание|задачу|это|запись)?\s*/i,
  /(?:^|[\s,.;:—–-])(?:задача|задачу|запись|напоминание|task|note|reminder)?[^.!?]{0,160}?(?:^|[\s,.;:—–-])(?:выполнена|выполнено|выполнен|сделана|сделано|сделан|готова|готово|готов|завершена|завершено|завершён)(?=$|[\s,.;:—–!?])/iu,
  /(?:^|\s)(?:это\s+)?(?:уже\s+)?(?:сделано|выполнено|готово)(?:\s|[.,!?]|$)/i,
  /(?:^|\s)(?:complete|finish|close)\s+(?:the\s+)?(?:reminder|task|this|it)\b/i,
  /(?:^|\s)(?:this|it|that)\s+(?:is|was|has\s+been)\s+(?:already\s+)?(?:done|completed|finished)(?:\s|[.,!?]|$)/i,
];

const INCOMPLETE_STATE =
  /(?:^|\s)не\s+(?:выполнена|выполнено|выполнен|сделана|сделано|сделан|готова|готово|готов|завершена|завершено|завершён|done|completed|finished)/i;

const ARCHIVE_PATTERNS = [
  /(?:^|[\s,.;:—–-])(?:архивируй(?:те)?|архивировать|убери(?:те)?\s+(?:это\s+)?в\s+архив|убрать\s+(?:это\s+)?в\s+архив|перемести(?:те)?\s+в\s+архив)(?=$|[\s,.;:—–!?])/i,
  /(?:^|\s)в\s+архив(?=$|[\s,.;:—–!?])/i,
  /^(?:please[,\s]*)?(?:archive|move\s+to\s+archive)\s+(?:this|it|that|the\s+(?:note|record|reminder|task))\b/i,
  /(?:^|[\s,.;:—–-])archive\s+(?:it|this|that|the\s+(?:note|record|reminder|task))(?=$|[\s,.;:—–!?])/i,
  /(?:^|[\s,.;:—–-])move\s+(?:it|this|that|the\s+(?:note|record|reminder|task))\s+to\s+(?:the\s+)?archive(?=$|[\s,.;:—–!?])/i,
];

const ARCHIVE_COMMAND_SOURCE =
  /(?:^|[\s,.;:—–-])(?:архивируй(?:те)?|архивировать|убери(?:те)?\s+(?:это\s+)?в\s+архив|убрать\s+(?:это\s+)?в\s+архив|перемести(?:те)?\s+в\s+архив|archive\s+(?:it|this|that|the\s+(?:note|record|reminder|task))|move\s+(?:it|this|that|the\s+(?:note|record|reminder|task))\s+to\s+(?:the\s+)?archive)(?=$|[\s,.;:—–!?])/gi;
const COMPLETE_COMMAND_SOURCE =
  /(?:^|[\s,.;:—–-])(?:заверши(?:те)?|завершить|выполни(?:те)?|выполнить|закрой(?:те)?|закрыть|complete|finish|close)(?=$|[\s,.;:—–!?])/gi;
const COMPLETION_STATE_SOURCE =
  /(?:^|[\s,.;:—–-])(?:уже\s+)?(?:выполнена|выполнено|выполнен|сделана|сделано|сделан|готова|готово|готов|завершена|завершено|завершён|completed|finished|done|ready|неактуальн[а-я]*|устар[а-я]*|ненужн[а-я]*|лишн[а-я]*)(?=$|[\s,.;:—–!?])/gi;
const TASK_LEAD_SOURCE =
  /^(?:пожалуйста[,\s]*)?(?:задача|задачу|запись|заметку|напоминание|task|note|reminder)\s+(?:(?:про|о|об|по|about|on)\s+)?/i;

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

  if (options.archive) value = value.replace(ARCHIVE_COMMAND_SOURCE, ' ');

  value = value.replace(COMPLETE_COMMAND_SOURCE, ' ');
  value = value.replace(TASK_LEAD_SOURCE, ' ');
  value = value.replace(COMPLETION_STATE_SOURCE, ' ');
  value = value.replace(
    /(?:^|\s)(?:это|эта|этот|эту|эти|этих|уже|её|ее|его|их|it|this|that|them)(?=\s|$)/gi,
    ' '
  );
  value = value
    .replace(/^[\s,.;:—–-]+/g, '')
    .replace(/[\s,.;:—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  if (value) return value;

  const previous = lastAssistantText(options.history);
  return previous ? previous.slice(0, 500) : null;
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
      query: queryWithHistory(original, DELETE_PATTERNS, options.history),
      permanent: true,
      includeArchive: true,
      confidence: 0.93,
      reason: 'permanent_delete_request',
    });
  }

  if (RESTORE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('restore', {
      query: queryWithHistory(original, RESTORE_PATTERNS, options.history),
      includeArchive: true,
      confidence: 0.88,
      reason: 'restore_request',
    });
  }

  if (FORGET_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('forget', {
      query: queryWithHistory(original, FORGET_PATTERNS, options.history),
      includeArchive: true,
      confidence: 0.9,
      reason: 'forget_request',
    });
  }

  // Explicit archive wins over the completion adjective that often accompanies
  // it (“Задача X выполнена, убери в архив”).
  if (ARCHIVE_PATTERNS.some((pattern) => pattern.test(original) || pattern.test(text))) {
    return result('archive', {
      query: mutationTarget(original, { archive: true, history: options.history }),
      confidence: 0.9,
      reason: 'archive_request',
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
        return result('complete', {
          query: mutationTarget(original, { archive: false, history: options.history }),
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

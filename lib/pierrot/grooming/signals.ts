/**
 * Pure text signals shared by workspace grooming and project review.
 *
 * These helpers deliberately do not call a model. They encode conservative
 * rules for the owner's real messages: an imperative sentence is not a task by
 * itself, and a URL is not a project material just because it appears in chat.
 */

const PERSISTENCE =
  /(?:всегда|каждый\s+раз|регулярн\w*|постоянн\w*|систематическ\w*|настро(?:й|ить)|автоматизир\w*|автоматическ\w*|в\s+продукте|в\s+пьеро|добавить\s+в\s+(?:систему|продукт))/iu;

const DEADLINE =
  /(?:(?:^|[\s,;:(])до\s+(?:пятниц\w*|понедельник\w*|вторник\w*|сред\w*|четверг\w*|суббот\w*|воскресень\w*|завтра|послезавтра|конца|конец|\d)|(?:^|[\s,;:(])к\s+(?:пятниц\w*|понедельник\w*|вторник\w*|сред\w*|четверг\w*|суббот\w*|воскресень\w*|\d)|завтра|послезавтра|на\s+этой\s+неделе|в\s+течение|дедлайн|срок)/iu;

const QUESTION_START =
  /^(?:можешь|можете|можно|не\s+мог(?:ли)?\s+бы|сможешь|сможете|what|how|why|where|when|can\s+you|could\s+you|would\s+you)(?=$|[\s,.;:!?])/iu;

const OPEN_QUESTION =
  /(?:^|[\s,;:])(?:вопрос|надо\s+решить|нужно\s+решить|требует\s+решения|осталось\s+решить|не\s+решено|открытый\s+вопрос)(?:\s|[:.,;]|$)/iu;

const ONE_OFF_ANALYSIS =
  /^(?:пожалуйста[,\s]*)?(?:можешь|можно|не\s+мог(?:ли)?\s+бы|сможешь|сделай|сделать|проведи|провести|проанализируй|проанализировать|найди|найти|покажи|показать|объясни|объяснить|перескажи|пересказать|посмотри|посмотреть|проверь|проверить|составь|составить|подготовь|подготовить)(?=$|[\s,.;:!?])/iu;

const META_INSTRUCTION =
  /^(?:пьеро[,:]?\s*)?(?:(?:добавь|добавьте|создай|создайте|поставь|поставьте|заведи|заведите|запиши|запишите)\s+(?:новую\s+)?(?:задачу|таск|task)(?=$|[\s,.;:!?])|(?:добавь|запиши)\s+(?:это\s+|всё\s+)?(?:в\s+)?(?:задачи|задачу|таск)(?=$|[\s,.;:!?])|(?:создай|создайте|добавь|добавьте|сформируй)\s+(?:недостающие|новые|все)\s+(?:задачи|задач)(?=$|[\s,.;:!?])|(?:перенеси|перемести|отправь)\s+(?:эту\s+)?задачу(?=$|[\s,.;:!?])|(?:убери|удалить|удали)\s+(?:её|ее|эту\s+задачу|задачу|запись)(?=$|[\s,.;:!?])|(?:создай|создайте)\s+(?:новый\s+)?проект(?=$|[\s,.;:!?])|(?:добавь|запиши|сохрани)\s+(?:это\s+)?в\s+проект(?=$|[\s,.;:!?])|(?:вот\s+это\s+)?к\s+проекту\s+добавь(?=$|[\s,.;:!?])|(?:наведи|приведи|проведи|сделай|запусти|повтори)(?=$|[\s,.;:!?]).*(?:порядок|ревизи|аудит|разбор|саммари|резюме|анализ)|(?:покажи|скажи|напиши|ответь|объясни|перескажи|сформулируй)(?=$|[\s,.;:!?]).*(?:чат|ответ|план|список|мне|здесь|сейчас)|(?:покажи|прочитай|открой|посмотри)(?=$|[\s,.;:!?]).*(?:файл|документ|страниц|репозитор|проект))/iu;

const ASSISTANT_SUMMARY =
  /^(?:в\s+твоей\s+оперативной\s+памяти|наш[её]л\s+несколько\s+записей|запомнено|ревизия\s+проекта|что\s+сделано|итого|кратко|сводка|project\s+summary)(?=$|[\s,.;:!?])/iu;

const HYPOTHETICAL =
  /(?:например|скажем|допустим|вот\s+пример|цитат\w*|пересказ\w*|представь|вообрази|если\s+бы)/iu;

const MATERIAL_SIGNAL =
  /(?:документ|ссылк|материал|файл|репозитор|стать[яию]|публикац|дизайн|макет|документац|исследован|источник|референс|пример|архив|notion|figma|google\s+docs|drive\.google|github\.com)/iu;

const EPHEMERAL_LINK_REQUEST =
  /(?:посмотри|глянь|проверь|открой|проанализируй|оцени|что\s+думаешь|как\s+тебе)(?=$|[\s,.;:!?])/iu;

const MATERIAL_SAVE =
  /(?:сохрани|сохранить|добавь|добавить|использу|использовать|материал|документ|источник|референс|основ)/iu;

const DURABLE_HOST =
  /(?:docs\.google\.com|drive\.google\.com|notion\.so|figma\.com|github\.com|gitlab\.com|youtube\.com|youtu\.be|vimeo\.com|arxiv\.org|doi\.org|medium\.com|substack\.com)/i;

const NOISY_URL =
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|schema\.org|w3\.org|nextjs\.org|reactjs\.org|npmjs\.com\/package)/i;

export const JUNK_TASK_PATTERNS: RegExp[] = [
  /^просто\s+добавь\s+это\s+в\s+задачи[.!]?$/iu,
  /^нет[,!]?\s+напиши\s+что-то\s+в\s+чат\s+проекта[.!]?$/iu,
  /^вот\s+это\s+к\s+проекту(?:\s+добавь)?[.!]?$/iu,
  /^перенеси\s+(?:эту\s+)?задачу\s+в\s+проект[^.]*[.!]?$/iu,
  /^перенеси\s+задачу(?=$|[\s,.;:!?])[^.]*[.!]?$/iu,
  /^создай\s+проект[^.]*\s+и\s+там\s+добавь\s+задачу[^.]*[.!]?$/iu,
];

export function cleanSignalText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Common owner vocabulary mixes Russian and English product names. Treat the
 * frequent pairs as the same token when checking for duplicate obligations.
 */
export function applyTaskAliases(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/гитхаб[\p{L}]*/gu, 'github')
    .replace(/гугл[\p{L}]*/gu, 'google')
    .replace(/аналитикс[\p{L}]*/gu, 'analytics')
    .replace(/статистик[\p{L}]*/gu, 'statistics')
    .replace(/стаститик[\p{L}]*/gu, 'statistics')
    .replace(/сайт[\p{L}]*/gu, 'site');
}

export function stripCodeBlocks(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/\r/g, '');
}

export function isDeadlineBound(value: string): boolean {
  return DEADLINE.test(value);
}

export function isPersistentRequest(value: string): boolean {
  return PERSISTENCE.test(value);
}

export function isQuestionLike(value: string): boolean {
  const clean = cleanSignalText(value);
  return /\?\s*$/u.test(clean) || OPEN_QUESTION.test(clean) || QUESTION_START.test(clean);
}

export function isOneOffAnalysis(value: string): boolean {
  const clean = cleanSignalText(value);
  if (!ONE_OFF_ANALYSIS.test(clean)) return false;
  if (isDeadlineBound(clean) || isPersistentRequest(clean)) return false;
  return true;
}

export function isMetaInstruction(value: string): boolean {
  const clean = cleanSignalText(value);
  return META_INSTRUCTION.test(clean) || ASSISTANT_SUMMARY.test(clean) || isOneOffAnalysis(clean);
}

/**
 * A pasted document or a multi-step audit brief is input for an operation, not
 * a list of owner tasks. Ignore the whole message rather than mining its
 * headings and numbered instructions for "tasks".
 */
export function bulkInstructionKind(value: string): 'document' | 'instruction' | null {
  const clean = value.replace(/\r/g, '').trim();
  if (!clean) return null;
  const lines = clean.split('\n').filter((line) => line.trim());
  const first = cleanSignalText(lines[0] || '');
  const hasHeadings = /^#{1,4}\s+\S/mu.test(clean);
  const looksLikeDocument =
    hasHeadings &&
    ((clean.length > 1_200 &&
      /(?:передача\s+проекта|документ\s+описывает|что\s+сделать|итог\s+в\s+двух|медиумы\s+проекта)/iu.test(
        clean
      )) ||
      /(?:передача\s+проекта|документ\s+описывает)[\s\S]{0,4000}что\s+сделать/iu.test(clean));

  if (looksLikeDocument) return 'document';
  if (
    /^(?:добавь|запиши|сохрани)\s+(?:это\s+)?в\s+проект\s+[#*]/iu.test(first) ||
    /^(?:вот\s+это\s+)?к\s+проекту\s+добавь\s+[#*]/iu.test(first)
  ) {
    return lines.length > 3 || clean.length > 500 ? 'document' : null;
  }
  if (
    /^(?:пьеро[,:]?\s*)?(?:наведи|проведи|проанализируй|разбери)(?=$|[\s,.;:!?]).*(?:порядок|аудит|ревизи|анализ|историю)/iu.test(
      first
    ) &&
    lines.length > 3
  ) {
    return 'instruction';
  }
  return null;
}

export function isQuotedOrHypothetical(value: string): boolean {
  const clean = cleanSignalText(value);
  if (!clean) return false;
  if (/^>\s?/u.test(clean)) return true;
  if (/^«[^»]+»[.!]?$/u.test(clean) || /^"[^"]+"[.!]?$/u.test(clean)) return true;
  return HYPOTHETICAL.test(clean);
}

/** Extract the real obligation from a command wrapper, never the wrapper. */
export function extractTaskPayload(value: string): string | null {
  const clean = cleanSignalText(stripCodeBlocks(value));
  if (!clean) return null;

  const patterns: RegExp[] = [
    /^(?:пожалуйста[,\s]*)?(?:добавь|добавьте|создай|создайте|поставь|поставьте|заведи|заведите|запиши|запишите)\s+(?:новую\s+)?(?:задачу|таск|task)\s*[:—–-]?\s*(.+)$/iu,
    /^(?:просто\s+)?(?:добавь|добавьте|запиши|запишите)\s+(?:это\s+|всё\s+|все\s+)?(?:в\s+)?(?:задачи|задачу|таск|tasks?)\s*[:—–-]?\s*(.+)$/iu,
    /^(?:создай|создайте|заведи|заведите)\s+(?:новый\s+)?проект\s+.+?\s+и\s+(?:там\s+)?(?:добавь|добавьте|создай|создайте)\s+(?:новую\s+)?(?:задачу|таск|task)\s*[:—–-]?\s*(.+)$/iu,
    /^(?:создай|создайте)\s+(?:новый\s+)?проект\s+.+?\s+и\s+там\s+добавь\s+(?:новую\s+)?задачу\s*[:—–-]?\s*(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (!match) continue;
    const payload = cleanSignalText(match[1] || '').replace(/^[-:—–\s]+/u, '');
    if (payload.length < 4) continue;
    if (/^(?:это|это\s+всё|всё\s+это|this|all\s+this)$/iu.test(payload)) continue;
    return payload.slice(0, 4_000);
  }
  return null;
}

/**
 * Normalise a task payload for display. A contextual word like "сюда" is
 * meaningless outside the conversation that produced it.
 */
export function prepareTaskText(value: string, projectName?: string | null): string {
  let text = cleanSignalText(value)
    .replace(/^[-:—–\s]+/u, '')
    .replace(/\s+в\s+проекту(?=$|[\s,.;:!?])/giu, ' в проекте')
    .trim();
  if (projectName) {
    text = text.replace(
      /(?:^|\s)(?:сюда|здесь|туда|в\s+этот\s+проект|в\s+нашем\s+проекте)(?=$|[\s,.;:!?])/giu,
      ` в проекте «${projectName}»`
    );
  }
  return cleanSignalText(text).slice(0, 4_000);
}

export function isCommandArtifact(value: string): boolean {
  const clean = cleanSignalText(value);
  if (!clean) return false;
  if (JUNK_TASK_PATTERNS.some((pattern) => pattern.test(clean))) return true;
  if (ASSISTANT_SUMMARY.test(clean)) return true;
  if (isQuestionLike(clean)) return true;
  if (META_INSTRUCTION.test(clean)) return true;
  return false;
}

export function sentenceWithUrl(value: string, url: string): string {
  const clean = value.replace(/\r/g, '');
  const segments = clean.split(/(?<=[.!?])\s+|\n+/u);
  return (
    segments.find((segment) => segment.includes(url))?.trim() ||
    cleanSignalText(value).slice(0, 1_000)
  );
}

export function normaliseUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    const pathname = url.pathname.replace(/\/+$/g, '') || '/';
    return `${url.protocol}//${url.host.toLowerCase()}${pathname}${url.search}`.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/g, '').toLowerCase();
  }
}

export function isNoisyUrl(value: string): boolean {
  return NOISY_URL.test(value);
}

/**
 * A material needs a real object in a user message, not an automatic summary,
 * a quoted example, or a one-off "look at this link" request.
 */
export function isMaterialCandidate(value: string, url: string): boolean {
  if (!value.trim() || !url.trim()) return false;
  if (isNoisyUrl(url)) return false;
  const sentence = sentenceWithUrl(value, url);
  if (!sentence) return false;
  if (isQuotedOrHypothetical(sentence)) return false;
  if (isQuestionLike(sentence) && !MATERIAL_SAVE.test(sentence)) return false;
  if (EPHEMERAL_LINK_REQUEST.test(sentence) && !MATERIAL_SAVE.test(sentence)) return false;
  if (MATERIAL_SIGNAL.test(sentence)) return true;
  return DURABLE_HOST.test(url);
}

export function materialTitleFromSentence(sentence: string, url: string): string {
  const withoutUrl = cleanSignalText(sentence.replace(url, ''))
    .replace(/[:—–-]+$/u, '')
    .trim();
  if (withoutUrl.length >= 4) {
    return (withoutUrl.length > 180 ? `${withoutUrl.slice(0, 177).trimEnd()}…` : withoutUrl).slice(
      0,
      200
    );
  }
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 180);
  }
}

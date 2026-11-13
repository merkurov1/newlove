import type {
  EditorialContext,
  EditorialIntent,
  EditorialOperation,
  EditorialSourceConstraints,
  EpisodeStatus,
} from './types';

/**
 * Deterministic editorial intent detection.
 *
 * It only decides whether the owner is talking about the UNFRAMED manuscript
 * or the UNFRAMED project, and which bounded operation is appropriate. It never
 * calls a model and never touches the database.
 */

export type DetectEditorialIntentInput = {
  message: string;
  activeContext?: EditorialContext | null;
  /** True when the current chat belongs to the UNFRAMED project. */
  conversationProjectSlug?: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MANUSCRIPT_MARKERS = [
  /\bunframed\b/i,
  /\bманфреймд\b/i,
  /\bанфреймд\b/i,
  /\bmanuscript\b/i,
  /рукопис/,
  /мемуар/,
  /\bmemoirs?\b/i,
  /\bmy\s+book\b/i,
  /мо[яйю]\s+книг/,
  /моей\s+книг/,
  /мою\s+книг/,
  /текст\s+книг/,
  /\bthe\s+text\b/i,
  /\bbook\s+we\s+(?:are|were)\s+editing\b/i,
];

const BOOK_NOISE =
  /(?:рецепт|кулинар|книжн[а-я]*\s+магазин|посоветуй\s+книг|bookstore|book\s+a\s+table|cookbook|recipe\s+book)/i;

const PROJECT_MARKERS = [
  /\bproject\s+unframed\b/i,
  /проект[а-я]*\s+unframed/i,
  /unframed\s+проект/i,
  /\bunframed\s+(?:project|series|episodes?|production)\b/i,
];

const CHAPTER_MARKER = /(?:глава|главы|главе|главу|главой|гл\.?|chapter)\s*(?:№\s*)?(\d{1,3})/i;
const CHAPTER_SUFFIX = /(\d{1,3})\s*(?:-?(?:я|ая|ю|ую|ой|ей|й))?\s*(?:глава|главу|главе|chapter)/i;

const COMPARE_MARKER =
  /(?:сравн|сопостав|compare|contrast|разниц|difference|versus|\bvs\b)/i;

const QUOTE_MARKER =
  /(?:процитиру|цитат|дословн|точн[а-я]*\s+цитат|quote|quotation|exact\s+(?:passage|phrase|quotation)|verbatim)/i;

const OUTLINE_MARKER =
  /(?:карт[ауы]\s+(?:(?:е[её]|его|the)\s+)?(?:структур|книг|рукопис)|структур[аы]\s+(?:книг|рукопис|текст)|оглавлени|содержани[ея]\s+книг|outline|book\s+map|manuscript\s+map|table\s+of\s+contents)/i;

const INSPECT_MARKER =
  /(?:что\s+(?:сейчас\s+)?(?:в|с)\s+(?:книг|рукопис)|состояни[ея]\s+(?:книг|рукопис|документ)|сколько\s+(?:глав|фрагмент|чанк|chunk|слов)|как\s+устроен[ао]?\s+(?:книг|рукопис|текст)|inspect|book\s+status|manuscript\s+status|how\s+many\s+chapters)/i;

const READ_ALL_MARKER =
  /(?:прочитай|перечитай|прочти|read|re-read|reread|go\s+through)\s+(?:всю|весь|целиком|полностью|the\s+whole|the\s+entire|all\s+of)?\s*(?:книг|рукопис|текст|manuscript|book)/i;

const READ_MARKER = /(?:прочита|прочти|перечита|read|reread|re-read|открой|open)/i;

const SEARCH_MARKER =
  /(?:найди|поищи|ищи|найти|подбери|отыщи|find|search|look\s+for|locate|where\s+(?:in|does))/i;

const SCENE_MARKER =
  /(?:сюжет|сцен|эпизод|истори[яи]\s+для|материал\s+для|иде[яй]\s+для|ролик|видео|выпуск|episode|scene|story\s+for|material\s+for|video)/i;

const CHRONOLOGY_MARKER =
  /(?:хронолог|последовательн[а-я]*\s+событ|timeline|chronolog|в\s+каком\s+году|какие\s+годы|date\s+references|time\s+period|период\s+времени)/i;

const GAP_MARKER =
  /(?:пробел[а-я]*|чего\s+не\s+хватает|недостающ[а-я]*|лакун|gap[s]?|missing\s+(?:chapter|scene|material)|narrative\s+gaps?)/i;

const ANALYSIS_MARKER =
  /(?:проанализиру|анализ|разбери|оцени|evaluate|analy[sz]e|critique|pacing|темп|структурн[а-я]*\s+баланс|structural\s+balance|сильн[а-я]*\s+материал|strong\s+material|самостоятельн[а-я]*\s+эссе|standalone\s+essay|противоречи|contradiction|повтор|recurring|паттерн|pattern)/i;

const PROJECT_STATUS_MARKER =
  /(?:что\s+(?:сейчас\s+)?(?:происходит|делается|готово|в\s+работе)|как\s+дела|статус|состояни|current\s+state|project\s+status|what(?:'s|\s+is)\s+(?:happening|the\s+state|the\s+status)|overview|обзор)/i;

const EPISODE_MARKER =
  /(?:выпуск|эпизод|episode|ролик|видео|video|сериал|series|production|продакшн|публикац)/i;

const HISTORY_MARKER =
  /(?:обсуждал|обсужден|решал|решил|договорил|идеи|предложен|discuss|decide|decision|idea|agenda|что\s+мы\s+(?:уже\s+)?(?:обсуждали|решили))/i;

const BRIEF_MARKER = /(?:бриф|brief|опиши\s+проект|describe\s+the\s+project)/i;

const EDIT_MARKER =
  /(?:предложи\s+правк|исправь|перепиши|отредактируй|редакторск[а-я]*\s+правк|propose\s+(?:an\s+)?edit|rewrite|edit\s+(?:this|the)\s+(?:passage|paragraph|chapter))/i;

const EPISODE_DISCOVERY_MARKER =
  /(?:найди|подбери|предложи|поищи|ищи|find|suggest|give me|discover|search).{0,90}(?:истори|сюжет|иде[яйю]|эпизод|выпуск|story|stories|ideas|episode)|(?:next|следующ)[а-яё]*\s+(?:episode|выпуск|эпизод)|(?:new|нов)[а-яё]*\s+(?:episode|выпуск|эпизод)/i;

const EPISODE_RETURN_MARKER =
  /(?:верн[её]мся|вернуться|возвращаемся|return|go\s+back|back\s+to|открой|open|покажи|show).{0,50}(?:episode|эпизод|выпуск)\s*№?\s*(\d{1,3})|(?:episode|эпизод|выпуск)\s*№?\s*(\d{1,3})/i;

const EPISODE_SCRIPT_MARKER =
  /(?:сценари|script|voiceover|закадров|черновик\s+текст|draft\s+(?:the\s+)?script|напиши\s+текст)/i;

const EPISODE_APPROVE_MARKER =
  /(?:утвержда|утверди|approve|финальн[а-яё]*\s+(?:сценари|верси|текст)|lock\s+(?:the\s+)?script|final\s+script)/i;

const EPISODE_REVISE_MARKER =
  /(?:друг[а-яё]*\s+верси|another\s+version|alternative\s+version|измени\s+(?:финал|концовк|ending)|change\s+the\s+ending|перепиши|rewrite|переделай|revise)/i;

const EPISODE_REJECT_MARKER =
  /(?:не\s+(?:нравится|подходит|берём|берем|выбираю)|отклон|reject|drop\s+this|не\s+то|не\s+этот)/i;

const EPISODE_SELECT_MARKER =
  /(?:выбира|выберу|беру|take|select|go\s+with|останавлива|согласен\s+на)/i;

const EPISODE_DEVELOP_MARKER =
  /(?:разработ|развей|develop|concept|концепц|структур|structure|scene|сцен|narrative\s+angle|угол\s+подачи|editorial\s+concept)/i;

const EPISODE_PUBLISH_MARKER =
  /(?:видео\s+готов|ролик\s+готов|video\s+is\s+ready|монтаж\s+заверш|editing\s+(?:is\s+)?done|готов[а-яё]*\s+к\s+публикац|ready\s+to\s+publish|prepare\s+the\s+page|подготовь\s+страниц|публикац|publish)/i;

const EPISODE_STATUS_ONLY =
  /(?:production|продакшн|снима|edited|монтаж|editing|ready|готов[а-яё]*|archived|архив)/i;

const DISCUSSION_HISTORY_MARKER =
  /(?:уже\s+)?(?:обсуждал|обсуждали|обсужден|решал|решали|договорил|договаривал|discussed|we\s+decided|what\s+did\s+we)/i;

const CONTINUATION_MARKER =
  /^(?:а\s+)?(?:еще|ещё|дальше|продолжай|продолжи|подробнее|more|continue|go\s+on|next|what\s+else|and\s+more|find\s+more|look\s+(?:at|into)\s+(?:another|more)|другую|другие)\b|^(?:а\s+)?теперь\s+(?:следующ|друг)|(?:найди|поищи|ищи)\s+(?:еще|ещё|more|друг|другие|глубже)|(?:search|look)\s+(?:deeper|more)/i;

const CONSTRAINT_MARKER =
  /(?:не\s+(?:рассматрива|трога|бери|включа|ищи)|исключ|без\s+тем|exclude|do\s+not\s+(?:include|consider|use)|without|only\s+|\bищи\b|\bискать\b)/i;

const RETURN_MARKER =
  /(?:верн[её]мся|вернуться|возвращаемся|return\s+to|back\s+to|продолжим\s+(?:проект|работу|книг|unframed)|let'?s\s+continue|continue\s+(?:unframed|the\s+project|working))/i;

const IDENTITY_MARKER =
  /(?:(?:найди|поищи|ищи|покажи|где|find|search|show|locate|where).{0,40}(?:книг|рукопис|manuscript|book|unframed)|(?:книг|рукопис|manuscript|book).{0,40}(?:в\s+brain|in\s+brain|в\s+архиве|in\s+the\s+archive))/i;

const EXPLICIT_OTHER_PROJECT =
  /(?:heart\s*&\s*angel|heartandangel|сердце\s+и\s+ангел|art\s+engine|journal|журнал|\bflow\b|поток|analytics|аналитик|bluesky|telegram|сайт|website|media|медиа|сми)/i;

const STOP_QUERY_WORDS = new Set([
  'найди',
  'поищи',
  'ищи',
  'найти',
  'покажи',
  'прочитай',
  'перечитай',
  'прочти',
  'книга',
  'книге',
  'книгу',
  'книги',
  'рукопись',
  'рукописи',
  'рукопись',
  'текст',
  'unframed',
  'book',
  'manuscript',
  'chapter',
  'глава',
  'главу',
  'главе',
  'все',
  'весь',
  'всю',
  'find',
  'search',
  'show',
  'read',
  'the',
  'all',
  'whole',
  'entire',
  'please',
  'мне',
  'мне',
  'это',
  'этот',
  'эту',
]);

function emptyConstraints(): EditorialSourceConstraints {
  return { excludedTopics: [], fromYear: null, toYear: null, raw: [] };
}

export function parseEditorialConstraints(message: string): EditorialSourceConstraints {
  const constraints = emptyConstraints();
  const raw = message.trim();

  const range =
    raw.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/) ||
    raw.match(/\b(?:с|from)\s*(20\d{2})\s*(?:по|to|until|through)\s*(20\d{2})\b/i) ||
    raw.match(/\b(20\d{2})\s*(?:по|to|until|through)\s*(20\d{2})\b/i);
  if (range) {
    const first = Number(range[1]);
    const second = Number(range[2]);
    constraints.fromYear = Math.min(first, second);
    constraints.toYear = Math.max(first, second);
    constraints.raw.push(range[0]);
  }

  const exclusionSentences = raw
    .split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      /(?:не\s+(?:рассматрива|трога|бери|включа|ищи)|исключ|exclude|do\s+not\s+(?:include|consider|use))/i.test(
        sentence
      )
    );

  for (const sentence of exclusionSentences) {
    const cleaned = sentence
      .replace(
        /^(?:и\s+)?(?:пожалуйста[, ]*)?(?:не\s+(?:рассматривай|трогай|бери|включай|ищи)|исключи|exclude|do\s+not\s+(?:include|consider|use))\s*/i,
        ''
      )
      .replace(/^(?:темы?|тему|topics?|anything\s+about)\s*/i, '')
      .replace(/\s+(?:и|and)\s+.*$/i, '')
      .replace(/[.!?;]+$/g, '')
      .trim();

    if (cleaned.length >= 3 && cleaned.length <= 120) {
      constraints.excludedTopics.push(cleaned);
      constraints.raw.push(sentence);
    }
  }

  // "Ищи период 2010–2015" / "only 2010-2015" is already a range and is not
  // an exclusion. The year range is retained as a positive constraint.
  if (constraints.fromYear !== null && /(?:период|period|годы|years|только|only)/i.test(raw)) {
    constraints.raw.push('period');
  }

  return constraints;
}

function mergeConstraints(
  inherited: EditorialSourceConstraints | null | undefined,
  current: EditorialSourceConstraints
): EditorialSourceConstraints {
  if (!inherited) return current;
  const hasNew = current.excludedTopics.length > 0 || current.fromYear !== null;
  if (hasNew) {
    return {
      excludedTopics: current.excludedTopics.length > 0 ? current.excludedTopics : inherited.excludedTopics,
      fromYear: current.fromYear ?? inherited.fromYear,
      toYear: current.toYear ?? inherited.toYear,
      raw: Array.from(new Set([...inherited.raw, ...current.raw])),
    };
  }
  return inherited;
}

function chapterNumbers(message: string): number[] {
  const found: number[] = [];
  const global = new RegExp(
    `${CHAPTER_MARKER.source}|${CHAPTER_SUFFIX.source}`,
    'gi'
  );
  for (const match of message.matchAll(global)) {
    const value = Number(match[1] || match[2]);
    if (Number.isFinite(value) && value > 0 && value <= 999) found.push(value);
  }
  return Array.from(new Set(found));
}

function compareNumbers(message: string): number[] {
  const marked = chapterNumbers(message);
  if (marked.length >= 2) return marked;

  const range = message.match(/(\d{1,3})\s*(?:и|and|&|,|vs\.?|versus|—|–|-)\s*(\d{1,3})/i);
  if (range) {
    return Array.from(
      new Set([Number(range[1]), Number(range[2])].filter((value) => Number.isFinite(value)))
    );
  }

  return marked;
}

function extractSearchQuery(message: string): string {
  const quoted = message.match(/[«"“„]([^»"”„]{3,240})[»"”„]/);
  if (quoted) return quoted[1].trim();

  const withoutExclusions = message
    .split(/[.!?;\n]+/)
    .filter(
      (sentence) =>
        !/(?:не\s+(?:рассматрива|трога|бери|включа|ищи)|исключ|exclude|do\s+not\s+(?:include|consider|use))/i.test(
          sentence
        )
    )
    .join(' ');

  const words = (withoutExclusions.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).filter(
    (word) => {
      const normalized = word.toLowerCase().replace(/ё/g, 'е');
      if (normalized.length < 3) return false;
      if (STOP_QUERY_WORDS.has(normalized)) return false;
      if (/^(?:19|20)\d{2}$/.test(normalized)) return false;
      if (/^(?:период|period|годы|years|год|year|только|only|еще|ещё|more|continue|продолжай|дальше)$/.test(normalized)) {
        return false;
      }
      return true;
    }
  );

  return words.slice(0, 24).join(' ');
}

function quotePhraseFor(message: string): string | null {
  const quoted = message.match(/[«"“„]([^»"”„]{4,500})[»"”„]/);
  if (quoted) return quoted[1].trim();
  const after = message.match(
    /(?:цитат[ауы]?|quote|passage|фрагмент|отрывок)\s*[:—–-]\s*(.{4,500})$/i
  );
  return after ? after[1].replace(/[.!?]+$/g, '').trim() : null;
}

function relativeChapterRequest(message: string): 'previous' | 'next' | null {
  if (
    /(?:предыдущ|прошл)[а-я]*\s+глав|previous\s+chapter|last\s+chapter/i.test(message)
  ) {
    return 'previous';
  }
  if (/(?:следующ|next)\s+глав|next\s+chapter/i.test(message)) return 'next';
  return null;
}

function episodeNumberFrom(message: string): number | null {
  const match = message.match(
    /(?:episode|эпизод|выпуск|\bep\.?)\s*№?\s*(\d{1,3})|(\d{1,3})\s*(?:-?[а-яё]*\s*)?(?:episode|эпизод|выпуск)/i
  );
  const value = Number(match?.[1] || match?.[2]);
  return Number.isFinite(value) && value >= 0 && value <= 999 ? value : null;
}

function candidateNumberFrom(message: string): number | null {
  const numeric = message.match(
    /(?:вариант|варианта|номер|#|№|option|number)\s*(\d{1,2})|(\d{1,2})\s*(?:-?[а-яё]*\s*)?(?:вариант|option)/i
  );
  if (numeric) {
    const value = Number(numeric[1] || numeric[2]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const words: Record<string, number> = {
    первый: 1,
    перва: 1,
    второй: 2,
    вторая: 2,
    третий: 3,
    третья: 3,
    четвертый: 4,
    четвертая: 4,
    пятый: 5,
    пятая: 5,
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
  };
  const found = message.toLowerCase().match(/\b(первый|перва|второй|вторая|третий|третья|четвертый|четвертая|пятый|пятая|first|second|third|fourth|fifth)\b/i);
  return found ? words[found[1].toLowerCase()] || null : null;
}

function statusTransitionFrom(message: string): EpisodeStatus | null {
  if (/(?:published|опубликован|публикац)/i.test(message)) return 'READY';
  if (/(?:ready|готов[а-яё]*\s+к\s+публикац|ready\s+to\s+publish)/i.test(message)) return 'READY';
  if (/(?:editing|монтаж|edit\s+done|смонтирован)/i.test(message)) return 'EDITING';
  if (/(?:production|продакшн|снима|съёмк|съемк)/i.test(message)) return 'PRODUCTION';
  if (/(?:script|сценари)/i.test(message)) return 'SCRIPT';
  if (/(?:development|разработ|развива)/i.test(message)) return 'DEVELOPMENT';
  return null;
}

function hasManuscriptMarker(text: string): boolean {
  return MANUSCRIPT_MARKERS.some((pattern) => pattern.test(text));
}

function hasProjectMarker(text: string): boolean {
  return PROJECT_MARKERS.some((pattern) => pattern.test(text));
}

function projectOperationFor(text: string): EditorialOperation | null {
  if (BRIEF_MARKER.test(text)) return 'project.brief';
  if (
    /(?:свяжи|связать|connect|link|relate)/i.test(text) &&
    EPISODE_MARKER.test(text) &&
    /(?:книг|рукопис|manuscript|book|глав|chapter|текст)/i.test(text)
  ) {
    return 'project.link_episode';
  }
  if (HISTORY_MARKER.test(text)) return 'project.history';
  if (EPISODE_MARKER.test(text) && /(?:как|какие|что|what|which|list|покажи|идеи|ideas|next|следующ)/i.test(text)) {
    return 'project.episodes';
  }
  if (PROJECT_STATUS_MARKER.test(text)) return 'project.overview';
  return null;
}

export function detectEditorialIntent(input: DetectEditorialIntentInput): EditorialIntent | null {
  const original = typeof input.message === 'string' ? input.message.trim() : '';
  if (!original) return null;

  const text = normalize(original);
  const active = input.activeContext || null;
  const activeDocument = active?.documentId || null;
  const activeProject =
    active?.projectSlug === 'unframed' ||
    input.conversationProjectSlug === 'unframed' ||
    null;

  const manuscriptMarker = hasManuscriptMarker(text);
  const weakBookRequest =
    /книг/.test(text) &&
    !BOOK_NOISE.test(text) &&
    (READ_MARKER.test(text) ||
      SEARCH_MARKER.test(text) ||
      /глав[а-я]*|chapter/i.test(text) ||
      Boolean(activeDocument || activeProject));
  const manuscriptAnchor = manuscriptMarker || weakBookRequest;
  const projectMarker = hasProjectMarker(text);
  const explicitOtherProject = EXPLICIT_OTHER_PROJECT.test(text) && !manuscriptAnchor;

  if (BOOK_NOISE.test(text) && !manuscriptMarker) return null;

  if (explicitOtherProject && !projectMarker) return null;

  const constraints = parseEditorialConstraints(original);
  const inheritedConstraints = mergeConstraints(active?.sourceConstraints, constraints);
  const chapterList = chapterNumbers(original);
  const compareList = compareNumbers(original);
  const compare = COMPARE_MARKER.test(text) && compareList.length >= 2;
  const quoteMarker = QUOTE_MARKER.test(text);
  const outline = OUTLINE_MARKER.test(text);
  const inspect = INSPECT_MARKER.test(text);
  const readAll = READ_ALL_MARKER.test(text);
  const readMarker = READ_MARKER.test(text);
  const searchMarker = SEARCH_MARKER.test(text);
  const sceneMarker = SCENE_MARKER.test(text);
  const chronology = CHRONOLOGY_MARKER.test(text);
  const gaps = GAP_MARKER.test(text);
  const analysis = ANALYSIS_MARKER.test(text);
  const edit = EDIT_MARKER.test(text);
  const continuation = CONTINUATION_MARKER.test(original);
  const constraintUpdate = CONSTRAINT_MARKER.test(text) && constraints.excludedTopics.length > 0;
  const returning = RETURN_MARKER.test(text);
  const relative = relativeChapterRequest(original);
  const episodeNumber = episodeNumberFrom(original);
  const candidateNumber = candidateNumberFrom(original);
  const activeEpisodeNumber = active?.activeEpisodeNumber ?? null;
  const episodeWork =
    (EPISODE_MARKER.test(text) || Boolean(activeEpisodeNumber)) &&
    (Boolean(manuscriptAnchor) ||
      Boolean(activeProject) ||
      /\bunframed\b/i.test(text) ||
      Boolean(activeEpisodeNumber));
  const discoveryRequest =
    EPISODE_DISCOVERY_MARKER.test(text) ||
    /(?:find|найди|подбери|предложи).{0,60}(?:next|следующ).{0,40}(?:episode|выпуск|эпизод)/i.test(
      original
    );
  const episodeReturn = EPISODE_RETURN_MARKER.test(original) || episodeNumber !== null;
  const scriptRequest = EPISODE_SCRIPT_MARKER.test(text);
  const approveRequest = EPISODE_APPROVE_MARKER.test(text);
  const reviseRequest = EPISODE_REVISE_MARKER.test(text);
  const rejectRequest = EPISODE_REJECT_MARKER.test(text);
  const selectRequest = EPISODE_SELECT_MARKER.test(text) && Boolean(active?.discoveryCandidates.length);
  const developRequest = EPISODE_DEVELOP_MARKER.test(text);
  const publishRequest =
    EPISODE_PUBLISH_MARKER.test(text) ||
    /(?:video|видео|ролик).{0,30}(?:ready|готов)/i.test(text);
  const targetEpisodeStatus = statusTransitionFrom(text);

  // A short follow-up is editorial only when this conversation already has an
  // active UNFRAMED document, task or project. It must never inherit UNFRAMED
  // for an unrelated new topic.
  const followUp =
    Boolean(activeDocument || (activeProject && active?.activeTask)) &&
    (continuation || constraintUpdate || returning);

  const sceneSearch = sceneMarker && (searchMarker || readMarker || followUp);
  const linkEpisode =
    /(?:свяжи|связать|connect|link|relate)/i.test(text) &&
    EPISODE_MARKER.test(text) &&
    /(?:книг|рукопис|manuscript|book|глав|chapter|текст)/i.test(text);
  const identityLookup = IDENTITY_MARKER.test(text) && !sceneSearch;

  const hasManuscriptAnchor =
    manuscriptAnchor ||
    Boolean(activeDocument) ||
    activeProject ||
    sceneSearch ||
    linkEpisode ||
    /\bглава\b|\bchapter\b|глав[ауеы]/i.test(text);

  if (!hasManuscriptAnchor && !followUp && !projectMarker) return null;

  if (explicitOtherProject && !manuscriptAnchor && !followUp) return null;

  // A project request with no manuscript language is project mode.
  const projectOp = projectMarker || activeProject || /\bпроект\b|\bproject\b/i.test(text)
    ? projectOperationFor(text)
    : null;

  const thematicManuscriptQuestion =
    /(?:в\s+книг[еи]|in\s+the\s+book|in\s+unframed).{0,80}(?:о|об|про|about)|(?:о|об|про)\s+.{2,80}(?:в\s+книг[еи]|in\s+the\s+book)/i.test(
      text
    );

  let operation: EditorialOperation | null = null;
  const signals: string[] = [];

  if (
    rejectRequest &&
    (activeEpisodeNumber !== null || (active?.discoveryCandidates.length || 0) > 0)
  ) {
    operation = 'episode.reject';
    signals.push('episode:reject');
  } else if (approveRequest && (activeEpisodeNumber !== null || active?.activeScriptId)) {
    operation = 'episode.approve_script';
    signals.push('episode:approve_script');
  } else if (
    publishRequest &&
    (activeEpisodeNumber !== null || episodeNumber !== null || Boolean(activeProject))
  ) {
    operation = 'episode.publish_prepare';
    signals.push('episode:publish_prepare');
  } else if (
    reviseRequest &&
    (activeEpisodeNumber !== null || Boolean(active?.activeScriptId) || Boolean(activeProject))
  ) {
    operation = 'episode.revise';
    signals.push('episode:revise');
  } else if (targetEpisodeStatus && episodeWork) {
    operation = 'episode.status';
    signals.push(`episode:status:${targetEpisodeStatus}`);
  } else if (scriptRequest && (episodeWork || Boolean(activeProject))) {
    operation = 'episode.script';
    signals.push('episode:script');
  } else if (developRequest && (episodeWork || Boolean(activeProject))) {
    operation = 'episode.develop';
    signals.push('episode:develop');
  } else if (selectRequest) {
    operation = 'episode.select';
    signals.push('episode:select');
  } else if (DISCUSSION_HISTORY_MARKER.test(text) && (Boolean(activeProject) || Boolean(manuscriptAnchor))) {
    operation = 'project.history';
    signals.push('project:history_request');
  } else if (episodeReturn && (episodeWork || Boolean(activeProject))) {
    operation = 'episode.open';
    signals.push('episode:open');
  } else if (discoveryRequest && (manuscriptAnchor || Boolean(activeProject))) {
    operation = 'episode.discover';
    signals.push('episode:discover');
  } else if (returning && activeEpisodeNumber !== null) {
    operation = 'episode.open';
    signals.push('context:resume_episode');
  } else if (compare && compareList.length >= 2) {
    operation = 'manuscript.compare';
    signals.push('manuscript:compare');
  } else if (linkEpisode) {
    operation = 'project.link_episode';
    signals.push('project:link_episode');
  } else if (chapterList.length === 1 && (readMarker || inspect || searchMarker || analysis || quoteMarker || chronology || gaps || edit)) {
    operation = 'manuscript.chapter';
    signals.push('manuscript:chapter');
  } else if (quoteMarker) {
    operation = 'manuscript.quote';
    signals.push('manuscript:quote');
  } else if (chronology) {
    operation = 'manuscript.chronology';
    signals.push('manuscript:chronology');
  } else if (gaps) {
    operation = 'manuscript.find_gaps';
    signals.push('manuscript:find_gaps');
  } else if (outline) {
    operation = 'manuscript.outline';
    signals.push('manuscript:outline');
  } else if (returning && (manuscriptAnchor || projectMarker)) {
    operation = 'project.overview';
    signals.push('context:return_to_project');
  } else if (sceneSearch) {
    operation = 'manuscript.search';
    signals.push('manuscript:scene_search');
  } else if (
    followUp &&
    active?.activeTask &&
    !chapterList.length &&
    !quoteMarker &&
    !outline &&
    !inspect &&
    !identityLookup
  ) {
    if (active.activeTask.startsWith('manuscript.')) {
      operation = active.activeTask as EditorialOperation;
    } else if (active.activeTask.startsWith('project.')) {
      operation = active.activeTask as EditorialOperation;
    } else if (active.activeTask.startsWith('episode.')) {
      operation = active.activeTask as EditorialOperation;
    }
    signals.push('context:inherit_task');
  } else if (identityLookup) {
    operation = 'manuscript.inspect';
    signals.push('manuscript:identity_lookup');
  } else if (readAll) {
    operation = 'manuscript.read';
    signals.push('manuscript:read_all');
  } else if (searchMarker) {
    operation = 'manuscript.search';
    signals.push('manuscript:search');
  } else if (analysis) {
    operation = 'manuscript.analyze';
    signals.push('manuscript:analyze');
  } else if (inspect) {
    operation = 'manuscript.inspect';
    signals.push('manuscript:inspect');
  } else if (readMarker) {
    operation = 'manuscript.chapter';
    signals.push('manuscript:read');
  } else if (projectOp) {
    operation = projectOp;
    signals.push(`project:${projectOp.split('.')[1]}`);
  } else if (projectMarker) {
    operation = 'project.overview';
    signals.push('project:overview');
  } else if (manuscriptAnchor) {
    // "Давай поработаем над UNFRAMED" is a project-level opening. A bare
    // mention of the book is a manuscript request.
    operation = thematicManuscriptQuestion
      ? 'manuscript.search'
      : /книг|\bbook\b|\bmanuscript\b|рукопис/i.test(text)
        ? 'manuscript.inspect'
        : 'project.overview';
    signals.push(thematicManuscriptQuestion ? 'manuscript:thematic' : 'project:open');
  }

  if (!operation) return null;

  const explicitProject = projectMarker;
  const explicitDocument =
    manuscriptMarker &&
    (/\bunframed\b/i.test(text) ||
      /\bmanuscript\b|рукопис|мемуар|книг|\bbook\b/i.test(text));

  const comparePair =
    compare && compareList.length >= 2
      ? ([compareList[0], compareList[1]] as [number, number])
      : null;
  let singleChapter =
    comparePair ? null : chapterList.length > 0 ? chapterList[0] : null;

  // "Другая глава" is relative to the active chapter. It must not fall back to
  // chapter 1 or to a semantic search.
  if (
    singleChapter === null &&
    /(?:друг|следующ|another|next)/i.test(text) &&
    /(?:глав|chapter)/i.test(text) &&
    active?.activeChapterNumber
  ) {
    operation = 'manuscript.chapter';
    singleChapter = active.activeChapterNumber + 1;
    signals.push('context:next_chapter');
  }

  const wantsBroadCoverage =
    /(?:все|всю|весь|all|every|complete|полн|целиком|more|ещё|еще|глубже|deeper|diverse|разн)/i.test(
      text
    ) || Boolean(searchMarker && sceneMarker);

  const quotePhrase = quoteMarker ? quotePhraseFor(original) : null;
  const searchQuery =
    operation === 'manuscript.quote' && quotePhrase
      ? quotePhrase
      : extractSearchQuery(original);

  let needsClarification = false;
  let clarification: string | null = null;

  if (
    operation === 'manuscript.chapter' &&
    singleChapter === null &&
    !relative &&
    !/prologue|пролог|epilogue|эпилог|introduction|вступлен|предислов/i.test(text)
  ) {
    needsClarification = true;
    clarification =
      'Уточните номер или название главы — я загружу её из рукописи целиком, с отчётом о покрытии.';
  }

  if (operation === 'manuscript.compare' && !comparePair) {
    needsClarification = true;
    clarification = 'Уточните две главы для сравнения, например: «Сравни главы 14 и 36».';
  }

  if (followUp && !activeDocument && !activeProject) {
    needsClarification = true;
    clarification =
      'Продолжение можно привязать к активному проекту. Уточните: работаем с книгой UNFRAMED или с проектом UNFRAMED?';
  }

  let confidence = 0.72;
  if (explicitDocument) confidence += 0.1;
  if (explicitProject) confidence += 0.06;
  if (chapterList.length > 0) confidence += 0.06;
  if (followUp) confidence += 0.05;
  if (constraintUpdate) confidence += 0.03;

  return {
    operation,
    confidence: Math.min(0.97, Number(confidence.toFixed(2))),
    signals: Array.from(new Set(signals)).slice(0, 12),
    manuscriptRequested:
      manuscriptAnchor ||
      operation.startsWith('manuscript.') ||
      Boolean(activeDocument && followUp),
    projectRequested: projectMarker || operation.startsWith('project.') || Boolean(activeProject),
    explicitDocument,
    explicitProject,
    followUp,
    chapterNumber: singleChapter,
    chapterNumbers: chapterList,
    chapterTitle: null,
    episodeNumber: episodeNumber ?? activeEpisodeNumber,
    targetEpisodeStatus,
    candidateNumber,
    compareChapters: comparePair,
    quotePhrase,
    searchQuery,
    wantsFullRead: readAll,
    wantsBroadCoverage,
    constraints: inheritedConstraints,
    needsClarification,
    clarification,
  };
}

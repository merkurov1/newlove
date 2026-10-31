import type { BrainSourceClass } from './types';

export type BrainQueryIntent =
  'document_lookup' | 'thematic_overview' | 'source_lookup' | 'biography' | 'project' | 'general';

export type BrainQueryPlan = {
  originalQuery: string;
  normalizedQuery: string;
  lexicalQuery: string;
  subject: string;
  language: 'ru' | 'en' | 'und';
  intent: BrainQueryIntent;
  requestedSources: BrainSourceClass[];
  requestedDomains: string[];
  requestedAuthors: string[];
  publishedFrom: string | null;
  publishedTo: string | null;
  wantsOverview: boolean;
  wantsRecent: boolean;
  specificDocument: boolean;
  confidence: number;
  signals: string[];
};

export type BrainDocumentClassInput = {
  source_type?: string | null;
  title?: string | null;
  source_domain?: string | null;
  canonical_url?: string | null;
  source_url?: string | null;
  source_path?: string | null;
  author?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type BrainSourceFilters = {
  sourceClasses: BrainSourceClass[];
  sourceTypes: string[] | null;
  sourceDomains: string[] | null;
  authors: string[] | null;
};

export const BRAIN_SOURCE_CLASSES: BrainSourceClass[] = [
  'article',
  'manuscript',
  'personal_writing',
  'art_project',
  'biography',
  'research',
  'other',
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTerm(text: string, term: string): boolean {
  const value = normalize(term);

  if (!value) return false;

  if (/^[a-zа-я0-9]+$/i.test(value) && value.length <= 5) {
    return new RegExp(`(^|[^a-zа-я0-9])${value}([^a-zа-я0-9]|$)`, 'i').test(text);
  }

  return text.includes(value);
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

const NOVAYA_TERMS = [
  'novaya',
  'novaya gazeta',
  'novayagazeta',
  'новая газета',
  'новой газете',
  'новую газету',
  'новой газеты',
];
const MANUSCRIPT_TERMS = [
  'unframed',
  'manuscript',
  'manuscripts',
  'рукопись',
  'рукописи',
  'рукописью',
  'рукописей',
  'рукописях',
  'мемуар',
  'мемуары',
  'мемуаров',
  'memoir',
  'memoirs',
  'книга',
  'книги',
  'книге',
  'книгу',
  'книгой',
  'книг',
  'книгах',
  'book',
  'books',
];
const PERSONAL_TERMS = [
  'substack',
  'personal writing',
  'my writing',
  'my essays',
  'my texts',
  'essays',
  'колонка',
  'колонки',
  'заметки',
  'мои тексты',
  'моих текстах',
  'мой блог',
  'мой канал',
];
const ART_PROJECT_TERMS = [
  'heart & angel',
  'heart and angel',
  'heartandangel',
  'heartangel',
  'сердце и ангел',
  'сердца и ангела',
  'открытка',
  'открытки',
  'temple',
  'art project',
  'art project',
];
const BIOGRAPHY_TERMS = [
  'biography',
  'biographical',
  'биография',
  'биографический',
  'about me',
  'обо мне',
  'моя жизнь',
  'мое прошлое',
  'кто я',
];
const RESEARCH_TERMS = [
  'research',
  'исследование',
  'исследования',
  'аналитика',
  'analytics',
  'report',
  'отчет',
];
const ARTICLE_TERMS = [
  'article',
  'articles',
  'статья',
  'статьи',
  'статьях',
  'публикация',
  'публикации',
  'column',
  'columns',
  'колонка',
  'колонки',
  'колонок',
];

function detectLanguage(text: string): 'ru' | 'en' | 'und' {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'und';
  if (cyrillic > latin) return 'ru';
  if (latin > cyrillic) return 'en';
  return 'und';
}

function yearRange(year: number): { from: string; to: string } {
  return {
    from: new Date(Date.UTC(year, 0, 1)).toISOString(),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString(),
  };
}

function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    to: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)).toISOString(),
  };
}

function parseTimeRange(text: string): {
  from: string | null;
  to: string | null;
  wantsRecent: boolean;
  signal: string | null;
} {
  const now = new Date();
  const yearMatch = text.match(/\b(20\d{2})\b/);

  if (yearMatch) {
    const range = yearRange(Number(yearMatch[1]));
    return { ...range, wantsRecent: false, signal: `year:${yearMatch[1]}` };
  }

  if (hasAny(text, ['last year', 'в прошлом году', 'прошлый год'])) {
    const range = yearRange(now.getUTCFullYear() - 1);
    return { ...range, wantsRecent: false, signal: 'last_year' };
  }

  if (hasAny(text, ['this year', 'в этом году', 'текущий год'])) {
    const range = yearRange(now.getUTCFullYear());
    return { ...range, wantsRecent: false, signal: 'this_year' };
  }

  if (hasAny(text, ['last month', 'в прошлом месяце', 'прошлый месяц'])) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const range = monthRange(date.getUTCFullYear(), date.getUTCMonth());
    return { ...range, wantsRecent: false, signal: 'last_month' };
  }

  if (
    hasAny(text, [
      'last two months',
      'past two months',
      'last 2 months',
      'последние два месяца',
      'последние 2 месяца',
      'за последние два месяца',
      'за последние 2 месяца',
    ])
  ) {
    return {
      from: new Date(now.getTime() - 62 * 24 * 60 * 60 * 1000).toISOString(),
      to: null,
      wantsRecent: true,
      signal: 'last_two_months',
    };
  }

  if (
    hasAny(text, [
      'last three months',
      'past three months',
      'last 3 months',
      'последние три месяца',
      'последние 3 месяца',
    ])
  ) {
    return {
      from: new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000).toISOString(),
      to: null,
      wantsRecent: true,
      signal: 'last_three_months',
    };
  }

  if (
    hasAny(text, [
      'last six months',
      'past six months',
      'last 6 months',
      'полгода',
      'последние шесть месяцев',
      'последние 6 месяцев',
    ])
  ) {
    return {
      from: new Date(now.getTime() - 183 * 24 * 60 * 60 * 1000).toISOString(),
      to: null,
      wantsRecent: true,
      signal: 'last_six_months',
    };
  }

  if (hasAny(text, ['recent', 'recently', 'latest', 'недавно', 'последние', 'свежие'])) {
    return {
      from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      to: null,
      wantsRecent: true,
      signal: 'recent',
    };
  }

  return { from: null, to: null, wantsRecent: false, signal: null };
}

const LEXICAL_STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'did',
  'do',
  'does',
  'explain',
  'for',
  'from',
  'have',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'say',
  'says',
  'говорит',
  'говорить',
  'tell',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'write',
  'written',
  'writes',
  'writing',
  'you',
  'your',
  'что',
  'я',
  'писал',
  'писала',
  'пишу',
  'пишет',
  'о',
  'об',
  'про',
  'в',
  'во',
  'на',
  'и',
  'мне',
  'мой',
  'моя',
  'мои',
  'моих',
  'как',
  'расскажи',
  'объясни',
  'это',
  'этот',
  'эта',
  'который',
  'которая',
  'которые',
  'что',
  'чем',
  'где',
  'когда',
  'почему',
  'ли',
  'же',
  'бы',
  // Source words: the source is already selected by the query plan, so these
  // tokens only add noise to the lexical part of the hybrid search.
  'unframed',
  'manuscript',
  'manuscripts',
  'рукопись',
  'рукописи',
  'рукописью',
  'рукописей',
  'рукописях',
  'мемуар',
  'мемуары',
  'мемуаров',
  'memoir',
  'memoirs',
  'книга',
  'книги',
  'книге',
  'книгу',
  'книгой',
  'книг',
  'книгах',
  'book',
  'books',
]);

function buildLexicalQuery(normalized: string): string {
  const stripped = normalized
    .replace(/\bwhat have i written in\b/g, ' ')
    .replace(/\bwhat do i write about\b/g, ' ')
    .replace(/\bwhat does\b/g, ' ')
    .replace(/\bwhat is\b/g, ' ')
    .replace(/\bwhat are\b/g, ' ')
    .replace(/\bsay about\b/g, ' ')
    .replace(/\bwrite about\b/g, ' ')
    .replace(/\babout\b/g, ' ')
    .replace(/\bnovaya gazeta\b/g, ' ')
    .replace(/\bnovayagazeta\b/g, ' ')
    .replace(/\bновой газете\b/g, ' ')
    .replace(/\bновой газеты\b/g, ' ')
    .replace(/\bновую газету\b/g, ' ')
    .replace(/\bновая газета\b/g, ' ')
    .replace(/\bunframed\b/g, ' ')
    .replace(/\bsubstack\b/g, ' ')
    .replace(/\bв книге\b/g, ' ')
    .replace(/\bв рукописи\b/g, ' ')
    .replace(/в новой газете/g, ' ')
    .replace(/в новой газеты/g, ' ')
    .replace(/в книге/g, ' ')
    .replace(/в рукописи/g, ' ');

  return stripped
    .replace(/[^\p{L}\p{N}\s&-]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word && !LEXICAL_STOP_WORDS.has(word))
    .join(' ')
    .trim();
}

/**
 * Lightweight, side-effect-free query understanding. It uses phrase/term
 * matching only; no model call and no database access.
 */
export function buildBrainQueryPlan(query: string): BrainQueryPlan {
  const originalQuery = query.trim();
  const normalizedQuery = normalize(originalQuery);
  const language = detectLanguage(originalQuery);
  const signals: string[] = [];
  const requestedSources: BrainSourceClass[] = [];
  const requestedDomains: string[] = [];
  const requestedAuthors: string[] = [];

  const addSource = (source: BrainSourceClass, signal: string) => {
    if (!requestedSources.includes(source)) requestedSources.push(source);
    signals.push(signal);
  };

  if (hasAny(normalizedQuery, NOVAYA_TERMS)) {
    addSource('article', 'source:novaya');
    requestedDomains.push('novayagazeta.ru', 'novayagazeta.eu');
  }

  if (hasAny(normalizedQuery, MANUSCRIPT_TERMS)) {
    addSource('manuscript', 'source:manuscript');
    signals.push('specific_document');
  }

  // "Новая газета колонки" is an article query, not a Substack query.
  if (hasAny(normalizedQuery, PERSONAL_TERMS) && !hasAny(normalizedQuery, NOVAYA_TERMS)) {
    addSource('personal_writing', 'source:personal_writing');
    requestedDomains.push('substack.com');
  }

  if (hasAny(normalizedQuery, ART_PROJECT_TERMS)) {
    addSource('art_project', 'source:art_project');
  }

  if (hasAny(normalizedQuery, BIOGRAPHY_TERMS)) {
    addSource('biography', 'source:biography');
  }

  if (hasAny(normalizedQuery, RESEARCH_TERMS)) {
    addSource('research', 'source:research');
  }

  if (hasAny(normalizedQuery, ARTICLE_TERMS) && !requestedSources.includes('article')) {
    addSource('article', 'source:article');
  }

  if (hasTerm(normalizedQuery, 'anton merkurov') || hasTerm(normalizedQuery, 'антон меркуров')) {
    requestedAuthors.push('anton merkurov');
    signals.push('author:anton_merkurov');
  }

  const time = parseTimeRange(normalizedQuery);

  if (time.signal) signals.push(`time:${time.signal}`);

  const wantsOverview = hasAny(normalizedQuery, [
    'what have i written',
    'what did i write',
    'what did i write about',
    'what do i write about',
    'what do i write',
    'my writing',
    'my articles',
    'my texts',
    'themes across',
    'main themes',
    'о чем я пишу',
    'о чем я писал',
    'что я писал',
    'что я пишу',
    'мои статьи',
    'мои тексты',
    'главные темы',
    'основные темы',
  ]);

  if (wantsOverview) signals.push('intent:thematic_overview');

  const specificDocument =
    requestedSources.includes('manuscript') ||
    hasAny(normalizedQuery, [
      'in the book',
      'in unframed',
      'в книге',
      'в рукописи',
      'what does unframed',
    ]);

  let intent: BrainQueryIntent = 'general';

  if (wantsOverview) intent = 'thematic_overview';
  else if (specificDocument) intent = 'document_lookup';
  else if (requestedSources.includes('art_project')) intent = 'project';
  else if (requestedSources.includes('biography')) intent = 'biography';
  else if (requestedSources.length > 0) intent = 'source_lookup';

  if (intent !== 'general') signals.push(`intent:${intent}`);

  const lexicalQuery = buildLexicalQuery(normalizedQuery);
  const subject = lexicalQuery || normalizedQuery;

  let confidence = 0.42;
  if (requestedSources.length > 0) confidence += 0.18;
  if (intent !== 'general') confidence += 0.14;
  if (time.signal) confidence += 0.08;
  if (requestedAuthors.length > 0) confidence += 0.06;
  confidence = Math.min(0.95, Number(confidence.toFixed(2)));

  return {
    originalQuery,
    normalizedQuery,
    lexicalQuery,
    subject,
    language,
    intent,
    requestedSources,
    requestedDomains: Array.from(new Set(requestedDomains)),
    requestedAuthors,
    publishedFrom: time.from,
    publishedTo: time.to,
    wantsOverview,
    wantsRecent: time.wantsRecent,
    specificDocument,
    confidence,
    signals: Array.from(new Set(signals)).slice(0, 12),
  };
}

function domainFromInput(input: BrainDocumentClassInput): string | null {
  const explicit = typeof input.source_domain === 'string' ? input.source_domain.trim() : '';
  if (explicit) return explicit.toLowerCase().replace(/^www\./, '');

  const raw = input.canonical_url || input.source_url || input.source_path || '';

  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function explicitClass(input: BrainDocumentClassInput): BrainSourceClass | null {
  const metadata = input.metadata || {};
  const raw =
    typeof metadata.knowledge_class === 'string'
      ? metadata.knowledge_class
      : typeof metadata.source_class === 'string'
        ? metadata.source_class
        : null;

  if (raw && (BRAIN_SOURCE_CLASSES as string[]).includes(raw)) {
    return raw as BrainSourceClass;
  }

  return null;
}

export function classifyBrainDocument(input: BrainDocumentClassInput): BrainSourceClass {
  const explicit = explicitClass(input);
  if (explicit) return explicit;

  const sourceType = (input.source_type || '').toLowerCase();
  const domain = domainFromInput(input) || '';
  const title = normalize(input.title || '');
  const author = normalize(input.author || '');

  if (sourceType === 'manuscript') return 'manuscript';
  if (sourceType === 'art_project') return 'art_project';
  if (sourceType === 'biography') return 'biography';
  if (sourceType === 'research') return 'research';
  if (sourceType === 'personal_writing') return 'personal_writing';
  if (sourceType === 'other') return 'other';

  if (domain.includes('heartandangel') || domain.includes('heart-and-angel')) {
    return 'art_project';
  }

  if (domain.includes('novayagazeta')) return 'article';

  if (
    domain.includes('substack.com') ||
    author === 'anton merkurov' ||
    author === 'антон меркуров'
  ) {
    return 'personal_writing';
  }

  if (sourceType === 'article') {
    if (hasAny(title, ['heart & angel', 'heart and angel', 'сердце и ангел'])) {
      return 'art_project';
    }

    return 'article';
  }

  return 'other';
}

/**
 * Maps a query plan to SQL-level filters. The current production schema uses
 * source_type article/manuscript, so personal writing is article + a domain
 * filter and biography can use the manuscript as a memoir fallback.
 */
export function resolveBrainSourceFilters(plan: BrainQueryPlan): BrainSourceFilters {
  if (plan.requestedSources.length === 0) {
    return {
      sourceClasses: [],
      sourceTypes: null,
      sourceDomains: plan.requestedDomains.length > 0 ? plan.requestedDomains : null,
      authors: plan.requestedAuthors.length > 0 ? plan.requestedAuthors : null,
    };
  }

  const sourceTypes = new Set<string>();
  const sourceDomains = new Set<string>(plan.requestedDomains);
  const sourceClasses = new Set<BrainSourceClass>();

  for (const source of plan.requestedSources) {
    sourceClasses.add(source);

    if (source === 'article') {
      sourceTypes.add('article');
    } else if (source === 'manuscript') {
      sourceTypes.add('manuscript');
    } else if (source === 'personal_writing') {
      sourceTypes.add('article');
      sourceTypes.add('personal_writing');
      sourceDomains.add('substack.com');
    } else if (source === 'art_project') {
      sourceTypes.add('art_project');
      sourceTypes.add('article');
    } else if (source === 'biography') {
      sourceTypes.add('biography');
      sourceTypes.add('manuscript');
      sourceClasses.add('manuscript');
    } else if (source === 'research') {
      sourceTypes.add('research');
      sourceTypes.add('article');
      sourceClasses.add('article');
    } else {
      sourceTypes.add('other');
    }
  }

  const domainBoundSources = new Set<BrainSourceClass>(['article', 'personal_writing']);
  const domainBound = plan.requestedSources.every((source) => domainBoundSources.has(source));

  return {
    sourceClasses: Array.from(sourceClasses),
    sourceTypes: sourceTypes.size > 0 ? Array.from(sourceTypes) : null,
    sourceDomains: domainBound && sourceDomains.size > 0 ? Array.from(sourceDomains) : null,
    // Author is a ranking signal, not a hard filter: Novaya Gazeta stores the
    // publication in `author`, not the byline person, so hard-filtering by a
    // person's name would incorrectly remove their published columns.
    authors: null,
  };
}

export function sourcePriorityForPlan(
  plan: BrainQueryPlan
): Partial<Record<BrainSourceClass, number>> {
  const priority: Partial<Record<BrainSourceClass, number>> = {
    article: 0.1,
    personal_writing: 0.09,
    manuscript: 0.07,
    research: 0.05,
    biography: 0.04,
    art_project: 0.04,
    other: 0,
  };

  if (plan.requestedSources.length > 0) {
    for (const key of Object.keys(priority) as BrainSourceClass[]) {
      priority[key] = plan.requestedSources.includes(key) ? 0.16 : 0.01;
    }
  }

  return priority;
}

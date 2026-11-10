const MEDIA_PHRASES = [
  'media archive',
  'медиа архив',
  'media coverage',
  'press coverage',
  'media intelligence',
  'in the press',
  'international media',
  'foreign media',
  'published in',
  'quoted in',
  'interview',
  'interviews',
  'citation',
  'citations',
  'direct quote',
  'direct quotes',
  'media publications',
  'media database',
  'media records',
  'media analysis',
  'media report',
  'latest media',
  'what did they write',
  'what did the press',
  'сми',
  'пресса',
  'прессе',
  'в прессе',
  'медиаархив',
  'медиа-архив',
  'база медиа',
  'базе медиа',
  'базу медиа',
  'базой медиа',
  'медиа баз',
  'анализ медиа',
  'обзор медиа',
  'отчет по медиа',
  'отчёт по медиа',
  'последние записи медиа',
  'записи медиа',
  'медиа за',
  'публикации обо мне',
  'публикациях обо мне',
  'публикации в сми',
  'иностранные издания',
  'иностранных публикациях',
  'зарубежных публикациях',
  'международных публикациях',
  'публикациях в прессе',
  'в медиа',
  'о медиа',
  'международные издания',
  'зарубежные издания',
  'цитаты',
  'цитат',
  'цитировали',
  'цитируют',
  'процитировали',
  'интервью',
  'комментарии в сми',
  'комментарий в сми',
  'что писали',
  'что писала пресса',
  'сравни публикации',
  'найди комментарии',
  'прямые цитаты',
  'пересказ',
  'упоминания',
];

const MEDIA_TERMS = [
  'media',
  'медиа',
  'press',
  'interview',
  'quote',
  'quotes',
  'citation',
  'издани',
  'пресс',
  'сми',
  'цитат',
  'цитир',
  'интервью',
  'публикац',
  'комментари',
  'база медиа',
  'записи медиа',
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Isolated media intent. A bare word "article" or "публикация" is deliberately
 * not enough; it must occur with a media/press/interview/quote signal.
 */
const MEDIA_WORD = /(?:^|[^\p{L}\p{N}])(медиа|media)(?=$|[^\p{L}\p{N}])/iu;
const MEDIA_ACTION =
  /(анализ|обзор|отчет|отчёт|статистик|список|покаж|поищ|найди|какие|сколько|последн|свеж|нов|запис|публикац|упомин|цитат|цитир|интервью|сравн|динамик|распределен|analysis|report|list|show|find|count|latest|recent|records?|publications?|mentions?|coverage|архив)/i;
const DATE_OR_RANGE = /(19\d{2}|20\d{2}|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|january|february|march|april|may|june|july|august|september|october|november|december)/i;

/**
 * Authoritative Media source detector.
 *
 * A standalone "медиа"/"media" is a source signal only when it is accompanied
 * by an archive action/noun or a date. This recognizes "анализ медиа",
 * "база медиа", "медиа за 2026" and "latest media records" without treating
 * every mention of the word "media" as an archive request.
 */
export function isMediaArchiveQuery(text: string): boolean {
  const normalized = normalize(text);

  if (!normalized) return false;

  // Explicit, standalone source selection by the owner has priority.
  if (/^(медиа|media)$/i.test(normalized)) return true;

  if (MEDIA_PHRASES.some((phrase) => normalized.includes(normalize(phrase)))) {
    return true;
  }

  if (MEDIA_WORD.test(normalized) && (MEDIA_ACTION.test(normalized) || DATE_OR_RANGE.test(normalized))) {
    return true;
  }

  if (
    /(публикац|колонк|стать[яи]|материал|publication|article)/i.test(normalized) &&
    DATE_OR_RANGE.test(normalized) &&
    /(все|мои|my|all|покаж|список|list|show)/i.test(normalized)
  ) {
    return true;
  }

  return MEDIA_TERMS.filter((term) => normalized.includes(term)).length >= 2;
}

const LATEST_TERMS = [
  'последн',
  'свеж',
  'недавн',
  'новые',
  'новых',
  'новейш',
  'latest',
  'recent',
  'newest',
  'last',
];

/**
 * True for "what did the press write recently / latest coverage" style
 * questions. These still need the Media Archive but are ordered by date
 * instead of semantic similarity.
 */
export function isLatestMediaQuery(text: string): boolean {
  const normalized = normalize(text);

  if (!normalized) return false;
  if (!isMediaArchiveQuery(normalized)) return false;

  return LATEST_TERMS.some((term) => normalized.includes(term));
}

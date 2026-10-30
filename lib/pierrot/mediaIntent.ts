const MEDIA_PHRASES = [
  'media archive',
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
  'what did they write',
  'what did the press',
  'сми',
  'пресса',
  'прессе',
  'в прессе',
  'медиаархив',
  'медиа-архив',
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
export function isMediaArchiveQuery(text: string): boolean {
  const normalized = normalize(text);

  if (!normalized) return false;

  if (MEDIA_PHRASES.some((phrase) => normalized.includes(normalize(phrase)))) {
    return true;
  }

  return MEDIA_TERMS.filter((term) => normalized.includes(term)).length >= 2;
}

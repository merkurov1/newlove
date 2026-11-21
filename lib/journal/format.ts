export type JournalDisplayLanguage = 'ru' | 'en';

const LOCALE: Record<JournalDisplayLanguage, string> = {
  ru: 'ru-RU',
  en: 'en-GB',
};

export function dateLong(value: string | null, lang: JournalDisplayLanguage): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function period(
  start: string | null,
  end: string | null,
  lang: JournalDisplayLanguage
): string {
  if (!start || !end) return '';
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).formatRange(a, b);
  } catch {
    return `${dateLong(start, lang)} — ${dateLong(end, lang)}`;
  }
}

export function stamp(
  value: string | null,
  lang: JournalDisplayLanguage
): { day: string; time: string } {
  if (!value) return { day: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '', time: '' };

  const day = new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .replace(/\./g, '');

  const time = new Intl.DateTimeFormat(LOCALE[lang], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);

  return { day, time };
}

export function items(n: number, lang: JournalDisplayLanguage): string {
  if (lang === 'en') return `${n} ${n === 1 ? 'item' : 'items'}`;

  const a = n % 10;
  const b = n % 100;
  const word =
    a === 1 && b !== 11
      ? 'материал'
      : a >= 2 && a <= 4 && (b < 10 || b >= 20)
        ? 'материала'
        : 'материалов';

  return `${n} ${word}`;
}

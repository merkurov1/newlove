/**
 * Deterministic, documented country inference for the Media Intelligence
 * dashboard.
 *
 * Priority:
 *   1. an explicit `ai_metadata.country` value on the media record;
 *   2. an explicit outlet mapping for publications whose country is known;
 *   3. a country-code TLD on the canonical URL.
 *
 * A language is never used as evidence of a country. Generic TLDs such as
 * .com or .org resolve to `null` unless the outlet is mapped explicitly.
 */

const OUTLET_COUNTRIES: Record<string, string> = {
  'новая газета': 'Russia',
  'novaya gazeta': 'Russia',
  'ведомости': 'Russia',
  'kommersant': 'Russia',
  'коммерсантъ': 'Russia',
  'коммерсантъ-деньги': 'Russia',
  'эхо москвы': 'Russia',
  'echo of moscow': 'Russia',
  'the moscow times': 'Netherlands',
  'meduza': 'Latvia',
  'медуза': 'Latvia',
  'bbc news русская служба': 'United Kingdom',
  'bbc': 'United Kingdom',
  'the washington post': 'United States',
  'washington post': 'United States',
  'current time': 'United States',
  'радио свобода': 'Czechia',
  'radio free europe/radio liberty': 'Czechia',
  'le monde': 'France',
  'le temps': 'Switzerland',
  'der spiegel': 'Germany',
  'spiegel': 'Germany',
  'gazeta wyborcza': 'Poland',
  'the guardian': 'United Kingdom',
  'the new york times': 'United States',
  'reuters': 'United Kingdom',
};

const TLD_COUNTRIES: Record<string, string> = {
  ru: 'Russia',
  by: 'Belarus',
  ua: 'Ukraine',
  kz: 'Kazakhstan',
  lv: 'Latvia',
  lt: 'Lithuania',
  ee: 'Estonia',
  cz: 'Czechia',
  de: 'Germany',
  pl: 'Poland',
  fr: 'France',
  uk: 'United Kingdom',
  nl: 'Netherlands',
  ch: 'Switzerland',
  us: 'United States',
  ca: 'Canada',
  il: 'Israel',
  ge: 'Georgia',
  am: 'Armenia',
  az: 'Azerbaijan',
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function inferMediaCountry(input: {
  explicit?: string | null;
  outlet?: string | null;
  url?: string | null;
}): string | null {
  const explicit = clean(input.explicit);

  if (explicit) return explicit.slice(0, 80);

  const outlet = clean(input.outlet).toLowerCase();

  if (outlet && OUTLET_COUNTRIES[outlet]) return OUTLET_COUNTRIES[outlet];

  const host = hostOf(clean(input.url));
  const tld = host.split('.').pop() || '';

  return TLD_COUNTRIES[tld] || null;
}

/**
 * Language targeting utilities for newsletters and dispatches.
 *
 * Rules:
 * - English issues/letters ('en') are delivered only to English subscribers (locale: 'en', 'en-US', etc.).
 * - Russian issues/letters ('ru' or unspecified) are delivered only to Russian subscribers (locale: 'ru', 'ru-RU', null, undefined, '').
 */

export function isSubscriberMatchingLang(
  subscriberLocale: string | null | undefined,
  issueLang: string | null | undefined,
): boolean {
  const normIssueLang = (issueLang || 'ru').toLowerCase().trim();
  const subLocale = (subscriberLocale || '').toLowerCase().trim();
  const isEnSubscriber = subLocale === 'en' || subLocale.startsWith('en');

  if (normIssueLang === 'en') {
    return isEnSubscriber;
  }

  // ru or default
  return !isEnSubscriber;
}

export function filterSubscribersByLang<T extends { locale?: string | null; lang?: string | null }>(
  subscribers: T[],
  issueLang: string | null | undefined,
): T[] {
  return subscribers.filter((sub) => {
    const locale = sub.locale || sub.lang;
    return isSubscriberMatchingLang(locale, issueLang);
  });
}

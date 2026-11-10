'use client';

import { useEffect } from 'react';

/**
 * Keep the document language in sync with the editorial page language.
 * The root layout is language-neutral, so localized sections declare their own
 * language without changing the global routing or metadata system.
 */
export default function HtmlLanguage({ lang }: { lang: 'ru' | 'en' }) {
  const script = `document.documentElement.lang=${JSON.stringify(lang)};`;

  useEffect(() => {
    document.documentElement.lang = lang;

    return () => {
      document.documentElement.lang = 'en';
    };
  }, [lang]);

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

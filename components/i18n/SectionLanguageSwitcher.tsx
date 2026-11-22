'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import {
  LANGUAGE_META,
  SECTION_LANGUAGES,
  localizedPath,
  type Language,
  type SectionKey,
} from '@/lib/i18n/config';

const LANGUAGE_CHOICE_KEY = 'merkurov.language-choice';

const LANGUAGE_SWITCHER_LABEL: Record<Language, string> = {
  en: 'Language selection',
  ru: 'Выбор языка',
  de: 'Sprachauswahl',
  fr: 'Choix de la langue',
  ar: 'اختيار اللغة',
};

function rememberLanguage(language: Language) {
  try {
    window.localStorage.setItem(LANGUAGE_CHOICE_KEY, language);
  } catch {
    // A blocked localStorage must not break navigation.
  }
}

type Props = {
  section: SectionKey;
  currentLang: Language;
  className?: string;
  showDetectionHint?: boolean;
};

export default function SectionLanguageSwitcher({
  section,
  currentLang,
  className = '',
  showDetectionHint = true,
}: Props) {
  const [detectedLanguage, setDetectedLanguage] = useState<Language | null>(null);
  const languages = SECTION_LANGUAGES[section];

  useEffect(() => {
    if (!showDetectionHint || currentLang !== 'en') return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANGUAGE_CHOICE_KEY);
    } catch {
      // Continue with browser detection when storage is unavailable.
    }

    if (stored) {
      // Keep offering an explicit non-English choice without forcing a redirect.
      if (
        stored !== 'en' &&
        stored !== currentLang &&
        (languages as readonly string[]).includes(stored)
      ) {
        setDetectedLanguage(stored as Language);
      }
      return;
    }

    const preferences =
      typeof navigator !== 'undefined' && navigator.languages?.length
        ? navigator.languages
        : typeof navigator !== 'undefined' && navigator.language
          ? [navigator.language]
          : [];

    const match = preferences
      .map((value) => String(value).toLowerCase().split(/[-_]/)[0])
      .find(
        (value): value is Language =>
          value !== currentLang && (languages as readonly string[]).includes(value)
      );

    if (match) setDetectedLanguage(match);
  }, [currentLang, languages, showDetectionHint]);

  return (
    <div className={`flex flex-col items-end gap-2 ${className}`} dir="ltr">
      {detectedLanguage && (
        <p className="max-w-xs text-end font-sans text-[11px] leading-relaxed text-zinc-500">
          This page is also available in{' '}
          <Link
            href={localizedPath(section, detectedLanguage)}
            hrefLang={detectedLanguage}
            onClick={() => rememberLanguage(detectedLanguage)}
            className="underline decoration-zinc-400 underline-offset-4 transition-colors hover:text-zinc-900"
          >
            {LANGUAGE_META[detectedLanguage].nativeName}
          </Link>
          .
        </p>
      )}

      <nav
        aria-label={LANGUAGE_SWITCHER_LABEL[currentLang]}
        className="flex items-center gap-0.5 rounded-full border border-[#1D1B18]/12 bg-white/55 p-0.5 shadow-[0_12px_30px_rgba(58,46,30,0.06)] backdrop-blur-md"
      >
        {languages.map((language) => {
          const active = language === currentLang;
          return (
            <Link
              key={language}
              href={localizedPath(section, language)}
              hrefLang={language}
              aria-current={active ? 'page' : undefined}
              aria-label={`${LANGUAGE_META[language].englishName} (${LANGUAGE_META[language].label})`}
              onClick={() => rememberLanguage(language)}
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? 'bg-[#1D1B18] text-[#F5F2EB] shadow-xs'
                  : 'text-[#6F6A60] hover:text-[#1D1B18]'
              }`}
            >
              {LANGUAGE_META[language].label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

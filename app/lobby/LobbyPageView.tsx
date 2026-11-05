import React from 'react';
import type { Metadata } from 'next';
import LobbyClient from './LobbyClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, profilePageJsonLd } from '@/lib/structuredData';
import { LOBBY_COPY, type LobbyLanguage } from '@/lib/i18n/lobby';
import { LANGUAGE_META, languageAlternates, localizedPath } from '@/lib/i18n/config';

export function lobbyMetadata(lang: LobbyLanguage): Metadata {
  const copy = LOBBY_COPY[lang];

  return pageMetadata({
    title: copy.meta.title,
    description: copy.meta.description,
    path: localizedPath('lobby', lang),
    type: 'profile',
    locale: LANGUAGE_META[lang].ogLocale,
    languages: languageAlternates('lobby'),
  });
}

export default function LobbyPageView({ lang }: { lang: LobbyLanguage }) {
  const copy = LOBBY_COPY[lang];

  return (
    <>
      <JsonLd
        data={profilePageJsonLd({
          path: localizedPath('lobby', lang),
          name: copy.meta.structuredName,
          description: copy.meta.description,
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.meta.breadcrumbs.home, path: '/' },
          { name: copy.meta.breadcrumbs.section, path: localizedPath('lobby', lang) },
        ])}
      />
      <LobbyClient lang={lang} />
    </>
  );
}

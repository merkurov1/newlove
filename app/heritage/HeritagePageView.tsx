import React from 'react';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd, personHeritageJsonLd } from '@/lib/structuredData';
import HeritageClient from '@/components/heritage/HeritageClient';
import { HERITAGE_COPY, type HeritageLanguage } from '@/lib/i18n/heritage';
import { LANGUAGE_META, languageAlternates, localizedPath } from '@/lib/i18n/config';

export function heritageMetadata(lang: HeritageLanguage): Metadata {
  const copy = HERITAGE_COPY[lang];

  return pageMetadata({
    title: copy.meta.title,
    description: copy.meta.description,
    path: localizedPath('heritage', lang),
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/artifacts/Heritage/TheThinker.jpg',
    imageAlt:
      lang === 'ru'
        ? 'Архив наследия Сергея Меркурова — «Мыслитель»'
        : 'Sergey Merkurov Heritage Archive — The Thinker',
    imageWidth: 1200,
    imageHeight: 675,
    locale: LANGUAGE_META[lang].ogLocale,
    languages: languageAlternates('heritage'),
  });
}

export default function HeritagePageView({ lang }: { lang: HeritageLanguage }) {
  const copy = HERITAGE_COPY[lang];

  return (
    <>
      <JsonLd data={personHeritageJsonLd()} />
      <JsonLd
        data={collectionPageJsonLd({
          path: localizedPath('heritage', lang),
          name: copy.structured.collectionName,
          description: copy.structured.collectionDescription,
          items: copy.structured.items,
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.structured.breadcrumbs.home, path: '/' },
          {
            name: copy.structured.breadcrumbs.section,
            path: localizedPath('heritage', lang),
          },
        ])}
      />
      <HeritageClient initialLang={lang} />
    </>
  );
}

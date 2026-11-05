import React from 'react';
import type { Metadata } from 'next';
import AdvisingClient from './AdvisingClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, professionalServiceJsonLd } from '@/lib/structuredData';
import { ADVISING_COPY, type AdvisingLanguage } from '@/lib/i18n/advising';
import { LANGUAGE_META, languageAlternates, localizedPath } from '@/lib/i18n/config';

export function advisingMetadata(lang: AdvisingLanguage): Metadata {
  const copy = ADVISING_COPY[lang];

  return pageMetadata({
    title: copy.meta.title,
    description: copy.meta.description,
    path: localizedPath('advising', lang),
    type: 'website',
    locale: LANGUAGE_META[lang].ogLocale,
    languages: languageAlternates('advising'),
  });
}

export default function AdvisingPageView({ lang }: { lang: AdvisingLanguage }) {
  const copy = ADVISING_COPY[lang];

  return (
    <>
      <JsonLd
        data={professionalServiceJsonLd({
          path: localizedPath('advising', lang),
          name: copy.meta.structuredName,
          description: copy.meta.description,
          serviceType: copy.meta.serviceType,
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.meta.breadcrumbs.home, path: '/' },
          { name: copy.meta.breadcrumbs.section, path: localizedPath('advising', lang) },
        ])}
      />
      <AdvisingClient lang={lang} />
    </>
  );
}

import React from 'react';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';
import KrassExhibition from '@/components/heritage/krass/KrassExhibition';
import { KRASS_COPY, displayTitle } from '@/lib/heritage/krass-copy';
import { KRASS_ITEMS, KRASS_OPENING_ITEM } from '@/lib/heritage/krass';
import type { KrassLang } from '@/lib/heritage/krass-types';
import { LANGUAGE_META, languageAlternates, localizedPath } from '@/lib/i18n/config';

export function krassMetadata(lang: KrassLang): Metadata {
  const copy = KRASS_COPY[lang];

  return pageMetadata({
    title: copy.meta.title,
    description: copy.meta.description,
    path: localizedPath('krass', lang),
    image: KRASS_OPENING_ITEM.imageUrl,
    imageAlt: copy.meta.ogAlt,
    imageWidth: KRASS_OPENING_ITEM.scan.width,
    imageHeight: KRASS_OPENING_ITEM.scan.height,
    locale: LANGUAGE_META[lang].ogLocale,
    alternateLocale: lang === 'ru' ? 'en_US' : 'ru_RU',
    languages: languageAlternates('krass'),
    keywords:
      lang === 'ru'
        ? [
            'Дмитрий Краснопевцев',
            'Рекламфильм',
            'советский киноплакат',
            'Алексей Фёдоров',
            'киноплакат 1950-х',
            'киноплакат 1960-х',
          ]
        : [
            'Dmitry Krasnopevtsev',
            'Reklamfilm',
            'Soviet film poster',
            'Alexei Fedorov',
            '1950s film poster',
            '1960s film poster',
          ],
    type: 'website',
  });
}

function krasnopevtsevJsonLd(lang: KrassLang) {
  const canonical = absoluteUrl('/heritage/krass');
  const ruName = 'Дмитрий Михайлович Краснопевцев';
  const enName = 'Dmitry Mikhailovich Krasnopevtsev';

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${canonical}#krasnopevtsev`,
    name: lang === 'ru' ? ruName : enName,
    alternateName:
      lang === 'ru'
        ? [enName, 'Dmitry Krasnopevtsev']
        : [ruName, 'Dmitry Krasnopevtsev'],
    birthDate: '1925-06-08',
    deathDate: '1995-02-28',
    jobTitle:
      lang === 'ru' ? 'Художник, художник киноплаката' : 'Artist, film poster designer',
    description:
      lang === 'ru'
        ? 'Советский художник, мастер метафизического натюрморта; в 1953–1973 годах работал художником киноплаката на «Рекламфильме».'
        : 'Soviet artist and master of the metaphysical still life; worked as a film-poster artist at Reklamfilm from 1953 to 1973.',
    sameAs: [
      'https://dodge.zimmerli.rutgers.edu/artists/dmitrii-krasnopevtsev',
      'https://artinvestment.ru/invest/artistofweek/20201221_krasnopevtsev_artist.html',
      'https://ru.wikipedia.org/wiki/Краснопевцев,_Дмитрий_Михайлович',
    ],
  };
}

function fedorovSeniorJsonLd(lang: KrassLang) {
  const canonical = absoluteUrl('/heritage/krass');
  const ruName = 'Алексей Алексеевич Фёдоров';
  const enName = 'Alexei Alekseevich Fedorov';

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${canonical}#fedorov-senior`,
    name: lang === 'ru' ? ruName : enName,
    alternateName: lang === 'ru' ? enName : ruName,
    birthDate: '1937',
    deathDate: '1994',
    description:
      lang === 'ru'
        ? 'Имя, связанное с историей собрания. В доступных источниках его биография и конкретные киноплакаты не документированы; ни один из 44 листов выставки ему не приписан.'
        : 'A name associated with the history of the collection. In the available sources his biography and specific film posters are not documented; none of the 44 sheets in the exhibition is attributed to him.',
    disambiguatingDescription:
      lang === 'ru'
        ? 'Не Алексей Фёдоров-младший (1970–2024), коллекционер, сформировавший собрание.'
        : 'Not Alexei Fedorov Jr. (1970–2024), the collector who formed the collection.',
  };
}

export default function KrassPageView({ lang }: { lang: KrassLang }) {
  const copy = KRASS_COPY[lang];
  const path = localizedPath('krass', lang);

  return (
    <>
      <JsonLd data={krasnopevtsevJsonLd(lang)} />
      <JsonLd data={fedorovSeniorJsonLd(lang)} />
      <JsonLd
        data={collectionPageJsonLd({
          path,
          name: copy.meta.title,
          description: copy.meta.description,
          items: KRASS_ITEMS.map((item) => ({
            name: displayTitle(item, lang),
            url: `${path}#work-${item.id}`,
            type: 'VisualArtwork',
          })),
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: lang === 'ru' ? 'Главная' : 'Home', path: '/' },
          {
            name: lang === 'ru' ? 'Наследие' : 'Heritage',
            path: localizedPath('heritage', lang),
          },
          { name: 'Krass', path },
        ])}
      />
      <KrassExhibition items={KRASS_ITEMS} opening={KRASS_OPENING_ITEM} lang={lang} />
    </>
  );
}

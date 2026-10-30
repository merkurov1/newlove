import type { Metadata } from 'next';
import HeartAndAngelHub from '@/components/HeartAndAngelHub';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  visualArtworkJsonLd,
} from '@/lib/structuredData';

const copy = ROUTE_COPY['/heartandangel'];

const works = [
  {
    path: '/heartandangel/world',
    name: 'Heart & Angel — World',
    description:
      'An eternal digital landscape where time flows, angels and demons coexist, and ambient music fills the air.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/World.png',
  },
  {
    path: '/heartandangel/calm',
    name: 'Heart & Angel — Keep Calm',
    description:
      'An interactive digital ritual for slowing down, finding balance and holding a fragile heart in motion.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
  },
  {
    path: '/heartandangel/letitgo',
    name: 'Heart & Angel — Let It Go',
    description:
      'An interactive ritual for releasing digital burdens into the sky within the Heart & Angel world.',
    image:
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
  },
];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/heartandangel',
  languages: {
    'x-default': '/heartandangel',
    en: '/heartandangel',
    ru: '/heartandangel',
  },
});

export default function HeartAndAngelPage() {
  return (
    <>
      <JsonLd
        data={collectionPageJsonLd({
          path: '/heartandangel',
          name: 'Heart & Angel — A Living Digital Mythology',
          description: copy.description,
          items: works.map((work) => ({ name: work.name, url: work.path })),
        })}
      />
      {works.map((work) => (
        <JsonLd
          key={work.path}
          data={visualArtworkJsonLd({
            path: work.path,
            name: work.name,
            description: work.description,
            image: work.image,
          })}
        />
      ))}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Heart & Angel', path: '/heartandangel' },
        ])}
      />
      <HeartAndAngelHub />
    </>
  );
}

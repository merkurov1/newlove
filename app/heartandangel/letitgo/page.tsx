import type { Metadata } from 'next';
import LetItGoAngel from '@/components/LetItGoAngel';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, visualArtworkJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = {
  title: 'Let It Go — Digital Temple',
  description: 'Let It Go is an interactive ritual for releasing digital burdens into the sky within the Heart & Angel digital world by Anton Merkurov.',
  alternates: { canonical: 'https://www.merkurov.love/heartandangel/letitgo' },
  openGraph: {
    title: 'Let It Go — Digital Temple',
    description: 'Release your burdens into the digital sky.',
    url: 'https://www.merkurov.love/heartandangel/letitgo',
    siteName: 'Merkurov Love',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 800,
        height: 800,
        alt: 'Let It Go Angel',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Let It Go — Digital Temple',
    description: 'Release your burdens into the digital sky.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png'],
  },
};

const LETITGO_DESCRIPTION =
  'Let It Go is an interactive ritual for releasing digital burdens into the sky within the Heart & Angel world.';

export default function Page() {
  return (
    <>
      <JsonLd
        data={visualArtworkJsonLd({
          path: '/heartandangel/letitgo',
          name: 'Heart & Angel — Let It Go',
          description: LETITGO_DESCRIPTION,
          image:
            'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Heart & Angel', path: '/heartandangel' },
          { name: 'Let It Go', path: '/heartandangel/letitgo' },
        ])}
      />
      <LetItGoAngel />
    </>
  );
}

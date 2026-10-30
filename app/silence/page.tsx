import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, creativeWorkJsonLd } from '@/lib/structuredData';
import SilenceClient from '@/components/SilenceClient';

const SILENCE_DESCRIPTION =
  'The Silence Index is a composite tracking Heritage versus Noise — gold and Hermes against bitcoin and Nvidia — with a live chart and brief analysis.';

export const metadata: Metadata = pageMetadata({
  title: 'The Silence Index — Heritage vs Noise | Anton Merkurov',
  description: SILENCE_DESCRIPTION,
  path: '/silence',
  languages: {
    'x-default': '/silence',
    en: '/silence',
    ru: '/silence',
  },
});

export default function Page() {
  return (
    <>
      <JsonLd
        data={creativeWorkJsonLd({
          path: '/silence',
          name: 'The Silence Index',
          description: SILENCE_DESCRIPTION,
          genre: 'Data artwork',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'The Silence Index', path: '/silence' },
        ])}
      />
      <SilenceClient />
    </>
  );
}

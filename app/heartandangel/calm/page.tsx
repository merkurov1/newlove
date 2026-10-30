import type { Metadata } from 'next';
import HeartPhysics from '@/components/HeartPhysics';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, visualArtworkJsonLd } from '@/lib/structuredData';

const CALM_URL =
  'https://www.merkurov.love/heartandangel/calm';

const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

const DAEMON_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png';

export const metadata: Metadata = {
  title: 'Keep Calm — Digital Temple | Merkurov Love',

  description:
    'Keep Calm is an interactive digital ritual for slowing down, finding balance and holding a fragile heart in motion inside the Heart & Angel world.',

  keywords: [
    'Keep Calm',
    'Digital Temple',
    'Heart & Angel',
    'Merkurov Love',
    'digital ritual',
    'interactive art',
    'digital art',
    'Anton Merkurov',
  ],

  authors: [
    {
      name: 'Anton Merkurov',
      url: 'https://www.merkurov.love',
    },
  ],

  creator: 'Anton Merkurov',
  publisher: 'Merkurov Love',

  alternates: {
    canonical: CALM_URL,
  },

  openGraph: {
    title: 'Keep Calm — Digital Temple',
    description:
      'Find your balance and maintain calm in the digital space.',
    url: CALM_URL,
    siteName: 'Merkurov Love',

    images: [
      {
        url: HEART_IMAGE,
        width: 800,
        height: 800,
        alt: 'Keep Calm — Heart & Angel',
      },
    ],

    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Keep Calm — Digital Temple',
    description:
      'Find your balance and maintain calm in the digital space.',
    images: [HEART_IMAGE],
    creator: '@merkurov',
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  category: 'art',
};

export default function CalmPage() {
  const CALM_DESCRIPTION =
    'Keep Calm is an interactive digital ritual for slowing down, finding balance and holding a fragile heart in motion inside the Heart & Angel world.';

  return (
    <>
      <JsonLd
        data={visualArtworkJsonLd({
          path: '/heartandangel/calm',
          name: 'Heart & Angel — Keep Calm',
          description: CALM_DESCRIPTION,
          image:
            'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Heart & Angel', path: '/heartandangel' },
          { name: 'Keep Calm', path: '/heartandangel/calm' },
        ])}
      />
      <div
        aria-labelledby="calm-title"
        className="min-h-[100dvh]"
      >
      <section className="sr-only">
        <h1 id="calm-title">
          Keep Calm
        </h1>

        <p>
          Hold the heart gently, breathe and find
          a moment of calm inside the Heart &amp;
          Angel world.
        </p>
      </section>

        <HeartPhysics
          daemonUrl={DAEMON_IMAGE}
          heartUrl={HEART_IMAGE}
        />
      </div>
    </>
  );
}

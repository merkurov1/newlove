
import type { Metadata, Viewport } from 'next';
import AuthProvider from '@/components/AuthProvider';
import { GlobalAudioProvider } from '@/components/AudioContext';

import './main.css';

import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TelegramMiniApp from '@/components/TelegramMiniApp';
import NextDynamic from 'next/dynamic';
import { unstable_cache } from 'next/cache';

const UserSidebar = NextDynamic(
  () => import('@/components/UserSidebar'),
  { ssr: false }
);

import {
  Inter,
  Cormorant_Garamond,
} from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400'],
  variable: '--font-inter',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
  variable: '--font-cormorant',
});

// --- STRATEGIC SEO: GLOBAL POSITIONING ---

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
};

export const metadata: Metadata = sanitizeMetadata({
  metadataBase: new URL('https://www.merkurov.love'),

  title: {
    default: 'Anton Merkurov | Art x Love x Money',
    template: '%s | Anton Merkurov',
  },

  description:
    'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',

  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'Art Dealer',
    'Digital Heritage',
    'Investment Art',
    'Soviet Avant-Garde',
    'Merkurov Legacy',
    'Global Nomad',
    'Digital Strategy',
    'Context Architecture',
  ],

  authors: [
    {
      name: 'Anton Merkurov',
      url: 'https://www.merkurov.love',
    },
  ],

  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  category: 'Art & Technology',

  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description:
      'Digital Strategist, Art Dealer, and Heritage Architect.',
    url: 'https://www.merkurov.love',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Unframed',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Digital Strategist, Art Dealer, and Heritage Architect.',
    images: [
      'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
    ],
    creator: '@merkurov',
    site: '@merkurov',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  },

  manifest: '/manifest.webmanifest',

  alternates: {
    canonical: '/',
    languages: {
      'en-US': 'https://www.merkurov.love',
      'ru-RU': 'https://www.merkurov.love',
      'x-default': 'https://www.merkurov.love',
    },
    types: {
      'application/rss+xml':
        'https://www.merkurov.love/rss.xml',
    },
  },

  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },

  other: {
    google: 'notranslate',
    'format-detection': 'telephone=no',
  },
});

export const revalidate = 300;

// --- STRUCTURED DATA: GOOGLE SEARCH CARD & KNOWLEDGE GRAPH ---

const googleSearchCardSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://www.merkurov.love/#website',
      url: 'https://www.merkurov.love',
      name: 'Anton Merkurov',
      alternateName: [
        'Антон Меркуров',
        'Anton Merkurov | Art x Love x Money',
        'Merkurov Love',
        'merkurov.love',
      ],
      description:
        'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',
      publisher: {
        '@id': 'https://www.merkurov.love/#person',
      },
      inLanguage: ['en-US', 'ru-RU'],
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://www.merkurov.love/flow?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Person',
      '@id': 'https://www.merkurov.love/#person',
      name: 'Anton Merkurov',
      alternateName: ['Антон Меркуров', 'Merkurov'],
      url: 'https://www.merkurov.love',
      image: {
        '@type': 'ImageObject',
        '@id': 'https://www.merkurov.love/#person-image',
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        caption: 'Anton Merkurov',
      },
      jobTitle: 'Digital Strategist, Art Dealer & Heritage Architect',
      description:
        'Great-grandson of Sergey Merkurov. Expert in digital heritage, high-end art investment, and context architecture.',
      sameAs: [
        'https://twitter.com/merkurov',
        'https://x.com/merkurov',
        'https://t.me/merkurov',
        'https://bsky.app/profile/merkurov.love',
        'https://www.linkedin.com/in/merkurov',
        'https://www.facebook.com/merkurov',
        'https://en.wikipedia.org/wiki/Sergey_Merkurov',
        'https://github.com/merkurov1',
      ],
      knowsAbout: [
        'Art Market',
        'Digital Heritage',
        'Soviet Monumentalism',
        'Contemporary Art',
        'Blockchain Technology',
        'Digital Strategy',
        'Context Architecture',
      ],
      worksFor: {
        '@type': 'Organization',
        '@id': 'https://www.merkurov.love/#organization',
      },
      mainEntityOfPage: 'https://www.merkurov.love',
    },
    {
      '@type': 'Organization',
      '@id': 'https://www.merkurov.love/#organization',
      name: 'Anton Merkurov Studio',
      alternateName: ['Merkurov Studio', 'merkurov.love'],
      url: 'https://www.merkurov.love',
      logo: {
        '@type': 'ImageObject',
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png',
        width: 512,
        height: 512,
      },
      founder: {
        '@id': 'https://www.merkurov.love/#person',
      },
      sameAs: [
        'https://twitter.com/merkurov',
        'https://t.me/merkurov',
      ],
    },
    {
      '@type': 'ProfilePage',
      '@id': 'https://www.merkurov.love/#profilepage',
      url: 'https://www.merkurov.love',
      name: 'Anton Merkurov — Official Website & Archive',
      isPartOf: {
        '@id': 'https://www.merkurov.love/#website',
      },
      about: {
        '@id': 'https://www.merkurov.love/#person',
      },
      mainEntity: {
        '@id': 'https://www.merkurov.love/#person',
      },
      inLanguage: 'en-US',
    },
  ],
};

const getPublicProjects = unstable_cache(
  async () => {
    try {
      const {
        getServerSupabaseClient,
      } = await import('@/lib/serverAuth');

      const supabase = getServerSupabaseClient({
        useServiceRole: true,
      });

      let projects: any[] = [];

      if (supabase) {
        const res = await supabase
          .from('projects')
          .select('id,slug,title,publishedAt')
          .eq('published', true)
          .order('publishedAt', {
            ascending: false,
          })
          .limit(10);

        projects =
          res && res.data
            ? res.data
            : [];
      }

      if (!Array.isArray(projects)) {
        return [];
      }

      return projects.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
      }));
    } catch (e) {
      console.error(
        'SSR getPublicProjects fatal error',
        e
      );

      return [];
    }
  },
  ['public-projects'],
  {
    revalidate: 300,
  }
);

const getSubscriberCount = unstable_cache(
  async () => {
    try {
      const {
        getServerSupabaseClient,
      } = await import('@/lib/serverAuth');

      const supabase = getServerSupabaseClient({
        useServiceRole: true,
      });

      if (!supabase) {
        return 0;
      }

      const res = await supabase
        .from('subscribers')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('isActive', true);

      return res &&
        typeof res.count === 'number'
        ? Number(res.count)
        : 0;
    } catch {
      return 0;
    }
  },
  ['active-subscriber-count'],
  {
    revalidate: 300,
  }
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const projects =
    await getPublicProjects();

  const subscriberCount =
    await getSubscriberCount();

  return (
    <html
      lang="en"
      className={inter.variable}
    >
      <head>
        <link
          rel="preconnect"
          href="https://txvkqcitalfbjytmnawq.supabase.co"
        />

        <link
          rel="dns-prefetch"
          href="https://txvkqcitalfbjytmnawq.supabase.co"
        />

        <script
          async
          src="https://telegram.org/js/telegram-web-app.js"
        />

        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="87795d47-f53d-4ef8-8e82-3ee195ea997b"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(googleSearchCardSchema),
          }}
        />
      </head>

      <body
        className={
          inter.className +
          ' ' +
          cormorant.className
        }
        style={{
          background: '#fff',
          color: '#333',
        }}
      >
        <AuthProvider>
          <GlobalAudioProvider>

            <TelegramMiniApp />

            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg"
            >
              Skip to content
            </a>

            <Header />

            <UserSidebar />

            <main id="main-content">
              {children}
            </main>

            <Footer />

          </GlobalAudioProvider>
        </AuthProvider>

        <Analytics />

        <SpeedInsights />
      </body>
    </html>
  );
}
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import AuthProvider from '@/components/AuthProvider';
import { GlobalAudioProvider } from '@/components/AudioContext';

import './main.css';

// ПРИМЕЧАНИЕ: Импорты Swiper рекомендовано перенести в сам компонент слайдера,
// чтобы не раздувать глобальный CSS для всех страниц.
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import {
  DEFAULT_OG_ALT,
  DEFAULT_OG_IMAGE,
  PERSON_NAME,
  SITE_LOCALE,
  SITE_NAME,
  SITE_URL,
  SOCIAL_HANDLE,
} from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { organizationJsonLd, personJsonLd, websiteJsonLd } from '@/lib/structuredData';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PierrotChat from '@/components/PierrotChat';
import { PierrotProvider } from '@/components/pierrot/PierrotContext';
import TelegramMiniApp from '@/components/TelegramMiniApp';
import NextDynamic from 'next/dynamic';
import { unstable_cache } from 'next/cache';

const UserSidebar = NextDynamic(() => import('@/components/UserSidebar'), { ssr: false });

// --- STRATEGIC SEO: GLOBAL POSITIONING ---

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'Anton Merkurov — Art, Love & Money',
    template: '%s',
  },

  description:
    'The official website of Anton Merkurov: art, heritage, advising, publishing and digital projects.',

  applicationName: SITE_NAME,
  keywords: [
    'Anton Merkurov',
    'Антон Меркуров',
    'Sergey Merkurov',
    'digital heritage',
    'art dealer',
    'Soviet avant-garde',
    'art market',
    'digital strategy',
  ],

  authors: [{ name: PERSON_NAME, url: SITE_URL }],
  creator: PERSON_NAME,
  publisher: PERSON_NAME,
  category: 'Art & Technology',

  // No canonical and no og:url here: every page computes and owns its own URL.
  openGraph: {
    title: 'Anton Merkurov — Art, Love & Money',
    description:
      'The official website of Anton Merkurov: art, heritage, advising, publishing and digital projects.',
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    type: 'website',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: DEFAULT_OG_ALT,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov — Art, Love & Money',
    description:
      'The official website of Anton Merkurov: art, heritage, advising, publishing and digital projects.',
    images: [DEFAULT_OG_IMAGE],
    creator: SOCIAL_HANDLE,
    site: SOCIAL_HANDLE,
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
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },

  manifest: '/manifest.webmanifest',

  alternates: {
    types: {
      // Site-wide RSS discovery points at the canonical Journal feed.
      // Flow pages override this with their own RSS/JSON alternates.
      'application/rss+xml': `${SITE_URL}/feed.xml`,
    },
  },

  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },

  other: {
    google: 'notranslate',
    'format-detection': 'telephone=no',
  },
};

export const revalidate = 300;

const getPublicProjects = unstable_cache(
  async () => {
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');

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

        projects = res && res.data ? res.data : [];
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
      console.error('SSR getPublicProjects fatal error', e);
      return [];
    }
  },
  ['public-projects'],
  { revalidate: 300 }
);

const getSubscriberCount = unstable_cache(
  async () => {
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');

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

      return res && typeof res.count === 'number' ? Number(res.count) : 0;
    } catch {
      return 0;
    }
  },
  ['active-subscriber-count'],
  { revalidate: 300 }
);

// Определение системных стеков вместо сетевых шрифтов
const systemSans =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
const systemSerif = 'Garamond, Georgia, "Baskerville", "Times New Roman", serif';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const projects = await getPublicProjects();
  const subscriberCount = await getSubscriberCount();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://txvkqcitalfbjytmnawq.supabase.co" />
        <link rel="dns-prefetch" href="https://txvkqcitalfbjytmnawq.supabase.co" />

        <JsonLd data={websiteJsonLd()} />
        <JsonLd data={personJsonLd()} />
        <JsonLd data={organizationJsonLd()} />
      </head>

      <body
        style={{
          background: '#fff',
          color: '#333',
          fontFamily: systemSans,
          // Пробрасываем системные фоллбеки в переменные, которые используются в стилях проекта
          ['--font-inter' as any]: systemSans,
          ['--font-cormorant' as any]: systemSerif,
        }}
      >
        <AuthProvider>
          <GlobalAudioProvider>
            <PierrotProvider>
              <TelegramMiniApp />

              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg"
              >
                Skip to content
              </a>

              <Header />

              <UserSidebar />

              <main id="main-content">{children}</main>

              <Footer />

              <PierrotChat />
            </PierrotProvider>
          </GlobalAudioProvider>
        </AuthProvider>

        <Analytics />
        <SpeedInsights />

        {/* Загружаем Telegram Web App асинхронно, чтобы исключить Forced Reflow при первой загрузке */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="lazyOnload" />

        {/* Аналитика Umami без блокировки основного потока */}
        <Script
          src="https://cloud.umami.is/script.js"
          data-website-id="87795d47-f53d-4ef8-8e82-3ee195ea997b"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}

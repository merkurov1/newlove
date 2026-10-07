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

export const metadata = sanitizeMetadata({
  metadataBase: new URL('https://www.merkurov.love'),

  title: {
    default: 'Anton Merkurov | Art x Love x Money',
    template: '%s | Anton Merkurov',
  },

  description:
    'Digital Strategist, Art Dealer, and Heritage Architect. The intersection of High-Tech and Old Money.',

  keywords: [
    'Anton Merkurov',
    'Art Dealer',
    'Digital Heritage',
    'Investment Art',
    'Soviet Avant-Garde',
    'Merkurov Legacy',
    'Global Nomad',
    'Digital Strategy',
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
    title: 'Anton Merkurov | Unframed',
    description: 'Art Dealer & System Architect.',
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

  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },

  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },

  alternates: {
    languages: {
      'en-US': 'https://www.merkurov.love',
    },
    types: {
      'application/rss+xml':
        'https://www.merkurov.love/rss.xml',
    },
  },

  other: {
    google: 'notranslate',
    'format-detection': 'telephone=no',
  },
});

export const revalidate = 300;

// --- STRUCTURED DATA ---

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',

  name: 'Anton Merkurov',

  url: 'https://www.merkurov.love',

  image:
    'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',

  sameAs: [
    'https://twitter.com/merkurov',
    'https://www.facebook.com/merkurov',
    'https://www.linkedin.com/in/merkurov',
    'https://en.wikipedia.org/wiki/Sergey_Merkurov',
  ],

  jobTitle: 'Art Dealer & Digital Strategist',

  knowsAbout: [
    'Art Market',
    'Digital Heritage',
    'Soviet Monumentalism',
    'Blockchain Technology',
  ],

  description:
    'Great-grandson of Sergey Merkurov. Expert in digital heritage and high-end art investment.',
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
            __html: JSON.stringify(jsonLd),
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
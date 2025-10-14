import AuthProvider from '@/components/AuthProvider';

import './main.css';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// --- ОБНОВЛЕННЫЙ БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: {
    default: 'Anton Merkurov | Art x Love x Money',
    template: '%s | Anton Merkurov',
  },
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.',
  keywords: ['Антон Меркуров', 'медиа', 'технологии', 'digital', 'искусство', 'блог', 'статьи', 'маркетинг'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  category: 'Technology',
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство.',
    url: 'https://merkurov.love',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Art x Love x Money',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png'],
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
    icon: '/favicon.ico',
  },
  verification: {},
  alternates: {
    canonical: 'https://merkurov.love',
    languages: {
      'ru-RU': 'https://merkurov.love',
    },
    types: {
      'application/rss+xml': 'https://merkurov.love/rss.xml',
    },
  },
});

// Force dynamic rendering for the entire app during this migration/debug pass.
// This avoids Next attempting to prerender/export pages which currently fail
// due to runtime serialization of complex server values. We'll narrow this
// later and re-enable static rendering per-route where safe.
export const dynamic = 'force-dynamic';



import { safeData } from '@/lib/safeSerialize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';

export default async function RootLayout({ children }) {
  // Динамически получаем проекты из Supabase
  let projects = [];
  try {
    const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
    const { supabase } = await getUserAndSupabaseForRequest(globalReq);
    if (supabase) {
      const { data, error } = await supabase.from('project').select('id,slug,title').eq('published', true).order('createdAt', { ascending: true });
      if (error) console.error('Supabase fetch projects error', error);
      projects = safeData(data || []);
    } else {
      projects = [];
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Database connection error:', error.message);
    }
    projects = [];
  }
  const settings = {
    site_name: 'Anton Merkurov',
    slogan: 'Art x Love x Money',
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png'
  };
  return (
    <html lang="ru">
      <head />
      <body>
        <AuthProvider>
          <Header settings={settings} projects={projects} />
          <main>
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

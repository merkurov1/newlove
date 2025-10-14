import AuthProvider from '@/components/AuthProvider';

import './main.css';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// --- ОБНОВЛЕННЫЙ БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  // Шаблон для заголовков страниц
  title: {
    default: 'Anton Merkurov | Art x Love x Money', // Заголовок для главной страницы
    template: '%s | Anton Merkurov', // Шаблон для дочерних страниц (напр. "Моя статья | Anton Merkurov")
  },
  description: "Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.",
  keywords: ['Антон Меркуров', 'медиа', 'технологии', 'digital', 'искусство', 'блог', 'статьи', 'маркетинг'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  category: 'Technology',
  // Метаданные для превью в соцсетях (Open Graph)
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство.',
    url: 'https://merkurov.love', // Убедитесь, что здесь основной домен
    siteName: 'Anton Merkurov',
    images: [
      {
        // ВАЖНО: Укажите здесь URL на красивую картинку для превью
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png', // Исправлен домен
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Art x Love x Money',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png'],
    creator: '@merkurov',
    site: '@merkurov',
  },
  // Дополнительные метаданные
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
  // Иконки сайта
  icons: {
    icon: '/favicon.ico',
    // shortcut: '/shortcut-icon.png',
    // apple: '/apple-touch-icon.png',
  },
  // Верификация для поисковых систем
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  // Альтернативные URL
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

export default async function RootLayout({ children }) {
  // Динамически получаем проекты из Supabase
  let projects = [];
  try {
    const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
    const mod = await import('@/lib/supabase-server');
    const { getUserAndSupabaseFromRequest } = mod;
    const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
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

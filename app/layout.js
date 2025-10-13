// app/layout.js

import './main.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import Providers from './providers';
import GlobalErrorHandler from '@/components/GlobalErrorHandler';
// `getUserAndSupabaseFromRequest` is imported dynamically inside the layout to avoid
// circular import issues during the Next.js production build.
import { safeData } from '@/lib/safeSerialize';
import nextDynamic from 'next/dynamic';
// Load analytics and umami as client-only dynamic components to prevent
// Next's prerender serializer from encountering non-serializable values.
const UserSidebar = nextDynamic(() => import('@/components/UserSidebar'), { ssr: false });
const Analytics = nextDynamic(() => import('@vercel/analytics/react').then(m => m.Analytics), { ssr: false });
const UmamiScript = nextDynamic(() => import('@/lib/umami').then(m => m.UmamiScript), { ssr: false });

// TEMP: force the app to be dynamic to avoid Next.js prerender serialization
// errors while we incrementally sanitize server-returned values. This will be
// reverted to per-page `export const dynamic` entries once pages are fixed.
export const dynamic = 'force-dynamic';

const inter = Inter({
  variable: '--font-inter', // Используем CSS переменную для большей гибкости
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

// --- ОБНОВЛЕННЫЙ БЛОК МЕТАДАННЫХ ---
export const metadata = {
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
};

// NOTE: Previously we forced the whole app to be dynamic to avoid prerender
// serialization errors during migration. Removing the global override now so
// we can surface and fix per-page serialization problems.


export default async function RootLayout({ children }) {
  // Временно отключаем запрос к базе данных до настройки DATABASE_URL
  let projects = [];
  try {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest } = mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
    if (supabase) {
      const { data, error } = await supabase.from('project').select('*').eq('published', true).order('createdAt', { ascending: true });
      if (error) console.error('Supabase fetch projects error', error);
      projects = safeData(data || []);
    } else {
      projects = [];
    }
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Database connection error:', error.message);
    }
    // Используем пустой массив для проектов
    projects = [];
  }

  const settings = { 
    site_name: 'Anton Merkurov', 
    slogan: 'Art x Love x Money', 
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png' 
  };

  let subscriberCount = 0;
  try {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod2 = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest: getUserAndSupabaseFromRequest2 } = mod2;
  const { supabase } = await getUserAndSupabaseFromRequest2(globalReq);
    if (supabase) {
      const { data, error } = await supabase.from('subscribers').select('id');
      if (!error) {
        const safe = safeData(data || []);
        subscriberCount = (safe && safe.length) || 0;
      } else console.error('Supabase count subscribers error', error);
    }
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при подсчёте подписчиков:', error);
    }
  }

  return (
    // Применяем шрифт через CSS переменную
    <html lang="ru" className={`${inter.variable} font-sans`}>
      <head>
        {/* Preload critical resources */}
        <link
          rel="preload"
          href={settings.logo_url}
          as="image"
          type="image/png"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png"
          as="image"
          type="image/png"
          crossOrigin="anonymous"
        />
        {/* DNS prefetch for external domains */}
        <link rel="dns-prefetch" href="//txvkqcitalfbjytmnawq.supabase.co" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//vercel.com" />
      </head>
  <body className="bg-white text-gray-800 min-h-screen overflow-x-hidden">
        <GlobalErrorHandler />
        <Providers>
          <AuthProvider>
            <div className="flex flex-col min-h-screen">
              <Header projects={projects} settings={settings} />
              <UserSidebar />
              <div className="flex flex-1 w-full px-0 py-0 gap-8">
                <main className="flex-grow">
                  {children}
                </main>
              </div>
              <Footer subscriberCount={subscriberCount} />
            </div>
          </AuthProvider>
        </Providers>
  <Analytics />
  {/* Umami analytics */}
  <UmamiScript websiteId="87795d47-f53d-4ef8-8e82-3ee195ea997b" />
      </body>
    </html>
  );
}

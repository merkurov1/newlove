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
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { Analytics } from '@vercel/analytics/react';
import { UmamiScript } from '@/lib/umami';
import nextDynamic from 'next/dynamic';

const UserSidebar = nextDynamic(() => import('@/components/UserSidebar'), { ssr: false });

const inter = Inter({
  variable: '--font-inter', // Используем CSS переменную для большей гибкости
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

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


export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head />
      <body>
        <main>
          <h1>Anton Merkurov</h1>
          <p>Сайт временно работает в ограниченном режиме.</p>
          {children}
        </main>
      </body>
    </html>
  );
}

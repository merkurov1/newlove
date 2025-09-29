// app/layout.js

import './main.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import prisma from '@/lib/prisma';
import { Analytics } from '@vercel/analytics/react';
import { UmamiScript } from '@/lib/umami';
import dynamic from 'next/dynamic';

const UserSidebar = dynamic(() => import('@/components/UserSidebar'), { ssr: false });

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
  // Метаданные для превью в соцсетях (Open Graph)
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство.',
    url: 'https://merkurov.love', // Убедитесь, что здесь основной домен
    siteName: 'Anton Merkurov',
    images: [
      {
        // ВАЖНО: Укажите здесь URL на красивую картинку для превью
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png', // Пример
        width: 1200,
        height: 630,
      },
    ],
    locale: 'ru_RU',
    type: 'website',
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
};


export default async function RootLayout({ children }) {
  const projects = await prisma.project.findMany({
    where: { published: true },
    orderBy: { createdAt: 'asc' },
  });

  const settings = { 
    site_name: 'Anton Merkurov', 
    slogan: 'Art x Love x Money', 
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png' 
  };

  return (
    // Применяем шрифт через CSS переменную
    <html lang="ru" className={`${inter.variable} font-sans`}>
      <body className="bg-white text-gray-800 min-h-screen">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Header projects={projects} settings={settings} />
            <div className="flex flex-1 w-full container mx-auto px-4 py-8 gap-8">
              <div className="hidden md:block">
                <UserSidebar />
              </div>
              <main className="flex-grow">
                {children}
              </main>
            </div>
            <Footer />
          </div>
        </AuthProvider>
  <Analytics />
  {/* Umami analytics */}
  <UmamiScript websiteId="87795d47-f53d-4ef8-8e82-3ee195ea997b" />
      </body>
    </html>
  );
}

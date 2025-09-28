import './main.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import prisma from '@/lib/prisma'; // <<< 1. Импортируем Prisma

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata = {
  title: "Merkurov.love",
  description: "Art x Love x Money"
};

export default async function RootLayout({ children }) {
  // 2. Запрашиваем проекты напрямую через Prisma
  const projects = await prisma.project.findMany({
    where: { published: true }, // Загружаем только опубликованные проекты
    orderBy: { createdAt: 'asc' }, // Сортируем для стабильного порядка в меню
  });

  // Временно задаем настройки сайта здесь.
  // В будущем их тоже можно будет перенести в базу данных.
  const settings = { 
    site_name: 'Merkurov.love', 
    slogan: 'Art x Love x Money', 
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png' 
  };

  return (
    <html lang="ru" className={inter.className}>
      <body className="bg-white text-gray-800 min-h-screen">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            {/* 3. Передаем проекты в Header */}
            <Header projects={projects} settings={settings} />
            <main className="flex-grow w-full container mx-auto px-4 py-8">
              {children}
            </main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}


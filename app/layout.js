// app/layout.js (ФИНАЛЬНЫЙ ФИКС)

import './globals.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase-server';
import AuthProvider from '@/components/AuthProvider';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

// КРИТИЧЕСКИ: Явно добавляем метаданные, чтобы Next.js корректно обрабатывал Root Layout
export const metadata = {
  title: 'Merkurov.love',
  description: 'Art x Love x Money',
};

// ... ваша функция getDataForLayout остается без изменений
async function getDataForLayout() {
  const supabase = createClient();
  let layoutData = {
    settings: { site_name: 'Merkurov.love', slogan: 'Art x Love x Money' },
    pages: []
  };
  try {
    const [settingsResult, pagesResult] = await Promise.all([
      supabase.from('settings').select('site_name, slogan').single(),
      supabase.from('projects').select('id, title, slug').order('created_at', { ascending: false })
    ]);
    if (settingsResult.data) layoutData.settings = settingsResult.data;
    if (pagesResult.data) layoutData.pages = pagesResult.data;
  } catch (error) {
    console.error('Ошибка при загрузке данных для layout:', error);
  }
  return layoutData;
}


export default async function RootLayout({ children }) {
  const { settings, pages } = await getDataForLayout();

  return (
    <html lang="ru" className={inter.className}>
      <body className="bg-white text-gray-800">
        {/* ▼▼▼ 2. Обернули всё в AuthProvider ▼▼▼ */}
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Header pages={pages} settings={settings} />
            <main className="flex-grow w-full container mx-auto px-4 py-8">
              {children}
            </main>
            <Footer />
          </div>
        </AuthProvider>
        {/* ▲▲▲ Конец обёртки ▲▲▲ */}
      </body>
    </html>
  );
}


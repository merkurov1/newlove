// app/layout.js

import './test_styles.css';
import { Inter } from 'next/font/google'; // <-- 1. Импортируем шрифт
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase-server';

// --- 2. Настраиваем шрифт ---
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

async function getDataForLayout() {
  // ... ваша функция getDataForLayout остается без изменений
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
    if (settingsResult.error) {
      console.error('Ошибка загрузки настроек сайта:', settingsResult.error.message);
    } else {
      layoutData.settings = settingsResult.data;
    }
    if (pagesResult.error) {
      console.error('Ошибка загрузки страниц для меню:', pagesResult.error.message);
    } else {
      layoutData.pages = pagesResult.data;
    }
  } catch (error) {
    console.error('Критическая ошибка при загрузке данных для layout:', error);
  }
  return layoutData;
}

export default async function RootLayout({ children }) {
  const { settings, pages } = await getDataForLayout();

  return (
    // --- 3. Применяем класс шрифта к <html> ---
    <html lang="ru" className={inter.className}>
      <body className="bg-white"> {/* Меняем фон на чисто белый */}
        <div className="flex flex-col min-h-screen">
          <Header pages={pages} settings={settings} />
          <main className="flex-grow w-full container mx-auto px-4 py-8">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

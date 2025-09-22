// app/layout.js

import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase-server';

// --- ИЗМЕНЕНИЕ 1: Обернем получение данных в try...catch для надежности ---
async function getDataForLayout() {
  const supabase = createClient();
  
  // Создаем объект для хранения результатов
  let layoutData = {
    settings: { site_name: 'Merkurov.love', slogan: 'Art x Love x Money' }, // Значения по умолчанию
    pages: []
  };

  try {
    // Параллельно запрашиваем настройки и страницы для меню
    const [settingsResult, pagesResult] = await Promise.all([
      supabase.from('settings').select('site_name, slogan').single(),
      supabase.from('projects').select('id, title, slug').order('created_at', { ascending: false })
    ]);

    // Проверяем результат настроек
    if (settingsResult.error) {
      console.error('Ошибка загрузки настроек сайта:', settingsResult.error.message);
    } else {
      layoutData.settings = settingsResult.data;
    }

    // Проверяем результат страниц
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


// --- ИЗМЕНЕНИЕ 2: Упрощаем основную функцию ---
export default async function RootLayout({ children }) {
  const { settings, pages } = await getDataForLayout();

  return (
    <html lang="ru">
      <body className="bg-gray-50">
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


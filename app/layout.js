// app/layout.js

import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase-server';

// Функция для получения настроек сайта (название, слоган)
async function getSiteSettings() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('settings')
    .select('site_name, slogan, logo_url')
    .single();

  if (error) {
    console.error('Error fetching site settings:', error);
    // Возвращаем значения по умолчанию, если произошла ошибка
    return { site_name: 'Site Name', slogan: 'Slogan', logo_url: '' };
  }
  return data;
}

// Функция для получения страниц для меню навигации
async function getPages() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects') // Ваша таблица со страницами
    .select('id, title, slug')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
  return data;
}

// Корневой макет вашего сайта
export default async function RootLayout({ children }) {
  // Асинхронно получаем все необходимые данные
  const pages = await getPages();
  const siteSettings = await getSiteSettings();

  return (
    <html lang="ru">
      <body>
        {/* ОСНОВНЫЕ ИЗМЕНЕНИЯ ЗДЕСЬ:
          - bg-gray-50: добавляет легкий фон для всего сайта.
          - space-y-8: создает вертикальные отступы между header, main и footer.
        */}
        <div className="flex flex-col min-h-screen bg-gray-50 space-y-8">
          <Header pages={pages} settings={siteSettings} />
          <main className="flex-grow container mx-auto p-4">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

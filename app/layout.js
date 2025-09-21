import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import { supabase } from '@/lib/supabase-build'; // Исправленный импорт

// ... (Your metadata)

async function getSiteSettings() {
  // Use the build-time client
  const { data, error } = await supabase 
    .from('settings') // Изменено с 'site_settings' на 'settings' (как в Header.js)
    .select('site_name, slogan, logo_url')
    .single();

  if (error) {
    console.error('Error fetching site settings:', error);
    return { site_name: 'Site Name', slogan: 'Slogan', logo_url: '' };
  }
  return data;
}

async function getPages() {
  // Use the build-time client
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, slug')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
  return data;
}

export default async function RootLayout({ children }) {
  const pages = await getPages();
  const siteSettings = await getSiteSettings();

  return (
    <html lang="ru">
      <body>
        <div className="flex flex-col min-h-screen">
          <Header pages={pages} siteSettings={siteSettings} />
          <main className="flex-grow container mx-auto p-4">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
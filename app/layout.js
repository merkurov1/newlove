// app/layout.js
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { supabase } from '@/utils/supabase';

export const metadata = {
  title: 'Антон Меркуров | Медиа, технологии, искусство',
  description: 'Блог и проекты Антона Меркурова',
};

async function getPages() {
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

  return (
    <html lang="ru">
      <body>
        <div className="flex flex-col min-h-screen">
          <Header pages={pages} />
          <main className="flex-grow container mx-auto p-4">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

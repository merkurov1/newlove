import './globals.css';
import Header from '@Header';
import Footer from '@Footer';
import { supabase } from '@/lib/supabase-server';

export const metadata = {
  title: 'Антон Меркуров | Медиа, технологии, искусство',
  description: 'Блог и проекты Антона Меркурова',
};

async function getPages() {
  try {
    const supabaseClient = supabase(); // Correctly initialize the client
    const { data, error } = await supabaseClient
      .from('projects')
      .select('id, title, slug')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pages:', error);
      return [];
    }
    return data;
  } catch (e) {
    console.error('Supabase client error in getPages:', e);
    return [];
  }
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

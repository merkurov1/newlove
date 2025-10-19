import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Письма и открытки | Anton Merkurov',
  description: 'Архив рассылки и заказ авторских физических открыток',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function LettersPage({ searchParams }: Props) {
  // NOTE: removed temporary server debug output for production.

  // Fetch published letters server-side to provide initial data to the client
  let initialLetters: any[] = [];
  let lastUpdated: string | null = null;
  try {
    // Use anon client by default so this page renders even when SUPABASE_SERVICE_ROLE_KEY
    // is not configured in the environment. Only use service role when debug is requested.
  const supabase = createClient();
    // Use anon-safe select columns (don't join protected `User` table here).
    const selectCols = 'id, title, slug, published, publishedAt, createdAt, authorId';

    const { data: lettersData, error } = await supabase
      .from('letters')
      // cast to any to avoid TypeScript parsing issues with PostgREST relation syntax
      .select(selectCols as any)
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(100);
    if (!error && Array.isArray(lettersData)) {
      initialLetters = lettersData.map((l: any) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        publishedAt: l.publishedAt,
        createdAt: l.createdAt,
        author: { name: (Array.isArray(l.User) ? l.User[0]?.name : l.User?.name) || null }
      }));
      if ((lettersData as any).length > 0) {
        const first = (lettersData as any)[0];
        lastUpdated = first.publishedAt || first.createdAt || null;
      }
    } else if (error) {
      console.error('Server initial letters fetch error', error);
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-8 px-2">
      <div className="max-w-5xl mx-auto">
        {/* Заголовок страницы */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-medium text-gray-900 mb-2">📮 Письма и открытки</h1>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            Архив авторской рассылки и заказ физических открыток с персональными сообщениями
          </p>
        </div>

        {/* server debug removed */}

        {/* Основное содержимое в две колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Левая колонка: Архив рассылки */}
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-blue-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Архив рассылки</h2>
              </div>
              <div className="mb-3 text-sm text-gray-500">
                {lastUpdated ? `Последнее обновление: ${new Date(lastUpdated).toLocaleString('ru-RU')}` : ''}
              </div>
              <LettersArchive initialLetters={initialLetters} lastUpdated={lastUpdated} />
            </div>
          </div>
          {/* Правая колонка: Заказ открыток */}
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-orange-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎨</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Авторские открытки</h2>
              </div>
              <PostcardShop />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const revalidate = 60 * 60 * 24 * 7; // revalidate once per week
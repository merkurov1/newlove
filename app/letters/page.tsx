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
  const debugParam = Array.isArray(searchParams?.debug) ? searchParams?.debug[0] : (searchParams?.debug as string | undefined);
  const wantDebug = debugParam === '1';

  // Server-side debug block (temporary): fetch counts/sample using service role
  let serverDebug: any = null;
  if (wantDebug) {
    try {
      const supabase = createClient({ useServiceRole: true });
      const pubResp = await supabase.from('letters').select('id', { count: 'exact', head: true }).eq('published', true);
      const unpubResp = await supabase.from('letters').select('id', { count: 'exact', head: true }).eq('published', false);
      const { data: sampleUnpublished } = await supabase.from('letters').select('id,title,slug,published,publishedAt,createdAt,authorId').eq('published', false).limit(10);
      serverDebug = {
        publishedCount: pubResp.count ?? 0,
        unpublishedCount: unpubResp.count ?? 0,
        sampleUnpublished: sampleUnpublished || []
      };
    } catch (e) {
      serverDebug = { error: String(e) };
    }
  }

  // Fetch published letters server-side to provide initial data to the client
  let initialLetters: any[] = [];
  let lastUpdated: string | null = null;
  try {
    const supabase = createClient({ useServiceRole: true });
    const { data: lettersData, error } = await supabase
      .from('letters')
      .select('id, title, slug, published, publishedAt, createdAt, authorId, User!letters_authorId_fkey(id, name, email)')
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
        author: { name: Array.isArray(l.User) ? l.User[0]?.name : l.User?.name }
      }));
      if (lettersData.length > 0) {
        lastUpdated = lettersData[0].publishedAt || lettersData[0].createdAt || null;
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

        {wantDebug && (
          <div className="mb-6 p-4 rounded bg-yellow-50 border border-yellow-200">
            <h3 className="font-medium">Server debug (temporary)</h3>
            <pre className="whitespace-pre-wrap text-xs mt-2 bg-white p-3 rounded border">{JSON.stringify(serverDebug, null, 2)}</pre>
          </div>
        )}

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
              <LettersArchive initialLetters={initialLetters} initialDebug={serverDebug} lastUpdated={lastUpdated} />
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
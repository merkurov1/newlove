import { Suspense } from 'react';
import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import nextDynamic from 'next/dynamic';

const NewsletterBanner = nextDynamic(() => import('@/components/NewsletterBanner'), { ssr: false });

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
    <>
      {/* Баннер подписки на рассылку */}
      <NewsletterBanner />
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Заголовок страницы */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">📮 Письма и открытки</h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Архив авторской рассылки и заказ физических открыток с персональными сообщениями
            </p>
          </div>

          {/* Основное содержимое - Bento Grid стиль */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-auto">
          {/* Открытки - первая (слева, большая карточка) */}
          <div className="lg:col-span-2 lg:row-span-2">
            <div className="group relative h-full bg-gradient-to-br from-orange-50 via-white to-pink-50 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-orange-100">
              {/* Декоративный элемент */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-200/30 to-pink-200/30 rounded-full blur-3xl -z-0"></div>

              <div className="relative z-10 p-6 md:p-8 h-full flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <span className="text-3xl">🎨</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Авторские открытки</h2>
                    <p className="text-sm text-gray-600">Физические открытки с персональными сообщениями</p>
                  </div>
                </div>

                <div className="flex-1">
                  <PostcardShop />
                </div>
              </div>
            </div>
          </div>

          {/* Архив рассылки - справа */}
          <div className="lg:col-span-1 lg:row-span-2">
            <div className="group relative h-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-blue-100">
              {/* Декоративный элемент */}
              <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-br from-blue-200/30 to-indigo-200/30 rounded-full blur-3xl -z-0"></div>

              <div className="relative z-10 p-6 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-2xl">📧</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Архив рассылки</h2>
                  </div>
                </div>

                {lastUpdated && (
                  <div className="mb-4 text-xs text-gray-500 bg-blue-50/50 rounded-lg px-3 py-2">
                    Обновлено: {new Date(lastUpdated).toLocaleDateString('ru-RU')}
                  </div>
                )}

                <div className="flex-1 overflow-auto">
                  <Suspense fallback={<div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-lg" />)}</div>}>
                    <LettersArchive initialLetters={initialLetters} lastUpdated={lastUpdated} />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Информационный блок внизу */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-6 py-3 shadow-sm border border-gray-100">
            <span className="text-sm text-gray-600">
              💌 Все письма доставляются с любовью через физическую почту
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export const revalidate = 60 * 60 * 24 * 7; // revalidate once per week
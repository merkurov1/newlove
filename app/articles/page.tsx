import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import './swiper-init';

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: 'Все публикации',
  description: 'Архив всех публикаций Антона Меркурова на темы медиа, технологий и искусства.',
});

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
  let { supabase } = await getSupabaseForRequest(globalReq) || {};
  if (!supabase) {
    try {
  const serverAuth = await import('@/lib/serverAuth');
  // Explicitly opt-in to the service-role client for server-side fallback
  // to ensure elevated read/export operations (RSS/build-time fetches)
  // succeed when request-scoped clients are unavailable.
  supabase = serverAuth.getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      console.error('Supabase client unavailable (both session and server fallback)', e);
      return (
        <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
          <div className="max-w-2xl mx-auto">
            <p className="text-gray-500 text-center">Сервис временно недоступен.</p>
          </div>
        </div>
      );
    }
  }
  const { data: articles = [], error } = await supabase.from('articles').select('id,title,slug,publishedAt').eq('published', true).order('publishedAt', { ascending: false });
  if (error) {
    console.error('Supabase fetch articles error', error);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 bg-clip-text mb-8 text-center">
          Публикации
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {articles && articles.length > 0 ? (
            articles.map((article: any) => (
              <Link key={article.id} href={`/${article.slug}`} className="group block rounded-xl bg-white/70 hover:bg-pink-50 transition-colors overflow-hidden border border-gray-200">
                <div className="aspect-[4/3] w-full bg-gray-100 relative">
                  {/* Здесь можно добавить превьюшку, если появится поле preview_image */}
                  {article.preview_image ? (
                    <Image
                      src={article.preview_image}
                      alt={article.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">—</div>
                  )}
                </div>
                <div className="flex flex-col px-4 py-3">
                  <span className="text-lg font-semibold text-gray-900 mb-1 truncate">{article.title}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-gray-400 text-center mt-12 col-span-full">Здесь пока ничего нет. Но скоро появится!</p>
          )}
        </div>
      </div>
    </div>
  );
}

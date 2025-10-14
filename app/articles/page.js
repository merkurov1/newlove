// app/articles/page.js


import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
// dynamic import to avoid circular/interop build issues
// Framer Motion удалён, только Tailwind

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: 'Все публикации',
  description: 'Архив всех публикаций Антона Меркурова на темы медиа, технологий и искусства.',
});

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default || mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
  if (!supabase) return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
      <div className="max-w-2xl mx-auto">
        <p className="text-gray-500 text-center">Сервис временно недоступен.</p>
      </div>
    </div>
  );
  const { data: articles = [], error } = await supabase.from('article').select('id,title,slug,publishedAt').eq('published', true).order('publishedAt', { ascending: false });
  if (error) {
    console.error('Supabase fetch articles error', error);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 bg-clip-text mb-8 text-center">
          Публикации
        </h1>
        <div className="space-y-4">
          {articles.length > 0 ? (
            articles.map(article => (
              <Link key={article.id} href={`/${article.slug}`} className="block rounded-xl bg-white/70 hover:bg-pink-50 transition-colors px-5 py-4">
                <div className="flex flex-col">
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
            <p className="text-gray-400 text-center mt-12">Здесь пока ничего нет. Но скоро появится!</p>
          )}
        </div>
      </div>
    </div>
  );
}

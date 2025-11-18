// Another minor change for Vercel redeploy
// Minor change for Vercel redeploy
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import './swiper-init';

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: 'Selection',
  description: 'Curated selection of works and articles by Anton Merkurov.',
});

export const dynamic = 'force-dynamic';

export default async function SelectionPage() {
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
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-black mb-8 text-center tracking-tight">Selection</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {articles && articles.length > 0 ? (
            articles.map((article: any) => (
              <Link key={article.id} href={`/${article.slug}`} className="group block rounded-2xl bg-white/90 hover:bg-pink-50 transition-colors overflow-hidden border border-gray-200 shadow-sm">
                <div className="aspect-[3/2] w-full bg-gray-100 relative" style={{ minHeight: 220 }}>
                  {article.preview_image ? (
                    <Image
                      src={article.preview_image}
                      alt={article.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">—</div>
                  )}
                </div>
                <div className="flex flex-col px-5 py-4">
                  <span className="text-lg font-semibold text-black mb-1 truncate">{article.title}</span>
                  <span className="text-xs text-gray-600">
                    {new Date(article.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-gray-400 text-center mt-12 col-span-full">Nothing here yet. Coming soon!</p>
          )}
        </div>
      </div>
    </div>
  );
}

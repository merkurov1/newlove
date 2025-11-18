// Another minor change for Vercel redeploy
// Minor change for Vercel redeploy
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import './swiper-init';
import dynamic from 'next/dynamic';

const AuctionSlider = dynamic(() => import('@/components/AuctionSlider'), { ssr: false });

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: 'Selection',
  description: 'Curated selection of works and articles.',
});

// export const dynamic = 'force-dynamic';

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
  const { data: articles = [], error } = await supabase.from('articles').select('id,title,slug,publishedAt,preview_image,content,artist,curatorNote,quote,specs').eq('published', true).order('publishedAt', { ascending: false });
  if (error) {
    console.error('Supabase fetch articles error', error);
  }


  // Helper: extract first image from content
  function extractFirstImage(content: string): string | null {
    if (!content) return null;
    const imgMatch = content.match(/<img[^>]+src=['\"]([^'\"]+)['\"]/i);
    if (imgMatch) return imgMatch[1];
    const mdMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    return null;
  }

  // Show a Swiper carousel at the top for articles with images (up to 8), then the grid below as before
  const featured = (articles || []).filter((a: any) => a.preview_image || extractFirstImage(a.content)).slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-10">
          {articles && articles.length > 0 ? (
            articles.map((article: any) => {
              const previewImage = article.preview_image || extractFirstImage(article.content);
              return (
                <Link key={article.id} href={`/${article.slug}`} className="block group border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors p-0 rounded-none overflow-hidden">
                  <div className="aspect-[3/2] w-full bg-gray-100 relative" style={{ minHeight: 220 }}>
                    {previewImage ? (
                      <Image
                        src={previewImage}
                        alt="Artwork preview"
                        fill
                        className="object-contain w-full h-full"
                        sizes="(max-width: 1024px) 100vw, 25vw"
                        priority={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">—</div>
                    )}
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="text-gray-400 text-center mt-12 col-span-full">Nothing here yet. Coming soon!</p>
          )}
        </div>
      </div>
    </div>
  );
}

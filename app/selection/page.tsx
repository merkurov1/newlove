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
  const { data: articles = [], error } = await supabase.from('articles').select('id,title,slug,publishedAt,preview_image,content').eq('published', true).order('publishedAt', { ascending: false });
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
        <h1 className="text-4xl font-bold text-black mb-8 text-center tracking-tight">Selection</h1>
        {featured.length > 0 && (
          <div className="mb-10">
            <AuctionSlider articles={featured} />
          </div>
        )}
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
                        alt={article.title}
                        fill
                        className="object-contain w-full h-full"
                        sizes="(max-width: 1024px) 100vw, 25vw"
                        priority={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">—</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 px-4 py-5">
                    {article.artist && (
                      <div className="font-serif text-[1.35rem] text-black leading-tight font-bold tracking-tight truncate">{article.artist}</div>
                    )}
                    {article.title && (
                      <div className="font-serif italic text-[1.05rem] text-neutral-700 truncate">{article.title}</div>
                    )}
                    {article.specs && (
                      <div className="font-mono text-[0.95rem] text-[#444] leading-snug mt-2 whitespace-pre-line">
                        {article.specs.split(/\n{2,}/).map((p: string, i: number) => (
                          <p key={i} className="mb-1 whitespace-pre-line">{p.trim()}</p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3">
                      <span className="text-xs text-gray-500">
                        {new Date(article.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="mt-4">
                      <span className="inline-block text-xs font-semibold text-blue-700 group-hover:underline">
                        Enquire &rarr;
                      </span>
                    </div>
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

import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import './swiper-init';
import dynamic from 'next/dynamic';

const AuctionSlider = dynamic(() => import('@/components/AuctionSlider'), { ssr: false });

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  title: 'Selection | Merkurov.love',
  description: 'Chronicles of silence & art.',
});

export default async function SelectionPage() {
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
  let { supabase } = await getSupabaseForRequest(globalReq) || {};
  if (!supabase) {
    try {
      const serverAuth = await import('@/lib/serverAuth');
      supabase = serverAuth.getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      console.error('Supabase client unavailable', e);
      return (
        <div className="min-h-screen bg-[#FDFBF7] py-20 px-6">
          <p className="font-mono text-xs text-center uppercase tracking-widest text-gray-500">System Offline</p>
        </div>
      );
    }
  }
  const { data: articles = [], error } = await supabase.from('articles').select('id,title,slug,publishedAt,preview_image,content,artist,curatorNote,quote,specs').eq('published', true).order('publishedAt', { ascending: false });
  if (error) {
    console.error('Supabase fetch articles error', error);
  }

  function extractFirstImage(content: any): string | null {
    if (!content) return null;
    try {
      const blocks = Array.isArray(content) ? content : JSON.parse(content);
      for (const block of blocks) {
        if (block?.type === 'image' && block?.data?.file?.url) return block.data.file.url;
        if (block?.type === 'richText' && block?.data?.html) {
          const imgMatch = block.data.html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
          if (imgMatch) return imgMatch[1];
        }
      }
    } catch {
      const str = String(content);
      const imgMatch = str.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
      if (imgMatch) return imgMatch[1];
      const mdMatch = str.match(/!\[[^\]]*\]\(([^)]+)\)/);
      if (mdMatch) return mdMatch[1];
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#111] selection:bg-black selection:text-white">
      
      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-7xl mx-auto px-6 py-20 md:py-32">
        
        {/* Header */}
        <header className="mb-16 border-b border-gray-200 pb-8">
           <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400">
              Curated Assets
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-gray-400">
              Live
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6">
            Selection.
          </h1>
          <p className="text-xl font-serif italic text-gray-600">
             Chronicles of silence & art.
          </p>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {articles && articles.length > 0 ? (
            articles.map((article: any) => {
              const previewImage = extractFirstImage(article.content);
              return (
                <Link key={article.id} href={`/${article.slug}`} className="block group">
                  <div className="border border-gray-200 bg-white p-2 group-hover:border-black transition-all duration-300 shadow-sm group-hover:shadow-md">
                    <div className="aspect-[3/2] w-full bg-gray-100 relative overflow-hidden">
                      {previewImage ? (
                        <Image
                          src={previewImage}
                          alt="Artwork preview"
                          fill
                          className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500"
                          sizes="(max-width: 1024px) 100vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-gray-300 font-serif italic">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="mt-4 px-2 pb-2">
                      <h3 className="font-serif text-lg leading-tight group-hover:text-red-700 transition-colors">
                        {article.title}
                      </h3>
                      <p className="font-mono text-[10px] text-gray-400 mt-2 uppercase tracking-widest">
                        {article.publishedAt ? new Date(article.publishedAt).getFullYear() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
             <div className="col-span-full py-20 text-center border border-dashed border-gray-300">
                <p className="font-serif italic text-gray-400 text-xl">The vault is currently sealed.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
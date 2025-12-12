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

  // Тянем поля, включая artist и specs
  const { data: articles = [], error } = await supabase
    .from('articles')
    .select('id,title,slug,publishedAt,preview_image,content,artist,curatorNote,quote,specs')
    .eq('published', true)
    .order('publishedAt', { ascending: false });

  if (error) {
    console.error('Supabase fetch articles error', error);
  }

  // Нормализуем превью-изображения: если нет поля preview_image — извлекаем первое изображение из контента
  let normalizedArticles: any[] | null = null;
  try {
    const { getFirstImage } = await import('@/lib/contentUtils');
    normalizedArticles = await Promise.all((articles || []).map(async (a: any) => {
      let preview = a.preview_image || null;
      if (!preview && a.content) {
        try {
          preview = await getFirstImage(a.content);
        } catch (e) {
          preview = null;
        }
      }

      // Если URL относительный — попытаемся его превратить в полный URL, используя переменные окружения Supabase
      if (preview && !/^https?:\/\//i.test(preview)) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
        if (supabaseUrl) {
          const base = supabaseUrl.replace(/\/$/, '');
          if (preview.startsWith('/')) {
            preview = `${base}${preview}`;
          } else if (!preview.startsWith('storage')) {
            // Если это просто путь внутри bucket, предположим публичный путь
            preview = `${base}/storage/v1/object/public/${preview}`;
          } else {
            preview = `${base}/${preview}`;
          }
        }
      }

      return { ...a, preview_image: preview };
    }));

    // Сохраняем нормализованный набор в отдельную переменную, не переназначая `articles`
    // normalizedArticles уже установлен выше
  } catch (e) {
    // Если что-то пошло не так — оставляем оригинальные данные
    if (process.env.NODE_ENV === 'development') console.error('Error normalizing preview images', e);
  }

  const articlesToRender = normalizedArticles ?? articles;

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
        
        {/* Header: Investment Terminal Style */}
        <header className="mb-16 border-b border-gray-200 pb-8">
           <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-500">
              Curated Inventory
            </span>
            <div className="flex items-center gap-4">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-gray-500">
                  Assets: {articlesToRender ? articlesToRender.length : 0}
              </span>
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-medium leading-none tracking-tight mb-6">
            Selection.
          </h1>
          <p className="text-xl font-serif italic text-gray-600">
             Chronicles of silence & art.
          </p>
        </header>

        {/* Grid: Auction Catalog Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-16">
          {articlesToRender && articlesToRender.length > 0 ? (
            articlesToRender.map((article: any) => {
              const previewImage = article.preview_image || extractFirstImage(article.content);
              // Fallback, если артист не указан в базе
              const artistName = article.artist || 'MERKUROV ESTATE'; 
              const specs = article.specs || null;

              return (
                <Link key={article.id} href={`/${article.slug}`} className="block group">
                  <div className="border border-gray-100 bg-white p-3 hover:border-black transition-all duration-300 shadow-sm hover:shadow-xl">
                    
                    {/* Image Area with Badge */}
                    <div className="aspect-[3/2] w-full bg-[#f4f4f4] relative overflow-hidden mb-3">
                      {/* STATUS BADGE (появляется на ховер) */}
                      <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                         <span className="bg-black text-white text-[9px] font-mono uppercase tracking-widest px-2 py-1">
                           Acquirable
                         </span>
                      </div>
                      
                      {previewImage ? (
                        <>
                          <Image
                            src={previewImage}
                            alt={article.title}
                            fill
                            className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500 ease-in-out transform group-hover:scale-105"
                            sizes="(max-width: 1024px) 100vw, 25vw"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] font-mono px-2 py-1 truncate">
                            {previewImage}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 font-mono text-xs uppercase tracking-widest">
                          [ NO VISUAL ]
                        </div>
                      )}
                    </div>

                    {/* Meta Data Block (Upper) */}
                    <div className="flex justify-between items-end border-b border-gray-100 pb-2 mb-3">
                      <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase text-gray-500">
                        {artistName}
                      </span>
                      <span className="font-mono text-[9px] text-gray-400">
                         {article.publishedAt ? new Date(article.publishedAt).getFullYear() : '—'}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-serif text-2xl leading-none text-gray-900 group-hover:text-red-700 transition-colors mb-2">
                      {article.title}
                    </h3>

                    {/* Specs removed intentionally */}

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
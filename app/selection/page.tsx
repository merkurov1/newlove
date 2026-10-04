import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import './swiper-init';
import CenteredHeader from '@/components/CenteredHeader';
import Header from '@/components/Header';

// --- SEO METADATA & CANONICAL ---
export const metadata: Metadata = {
  title: "Selection & Chronicles | Anton Merkurov",
  description: "Chronicles of silence & art. Curated selections and non-conformist masterworks by Anton Merkurov.",
  alternates: {
    canonical: "https://www.merkurov.love/selection",
  },
  openGraph: {
    title: "Selection & Chronicles | Anton Merkurov",
    description: "Chronicles of silence & art. Curated selections and non-conformist masterworks by Anton Merkurov.",
    url: "https://www.merkurov.love/selection",
    siteName: "Anton Merkurov",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Selection & Chronicles | Anton Merkurov",
    description: "Chronicles of silence & art. Curated selections and non-conformist masterworks by Anton Merkurov.",
    creator: "@merkurov",
    site: "@merkurov",
  },
};

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
        <div className="min-h-screen bg-[#FAF8F5] py-20 px-6">
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

  // Нормализуем превью-изображения
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

      if (preview && typeof preview === 'string') {
        preview = preview.replace(/([^:]\/)\/+/g, '$1');
      }

      if (preview && !/^https?:\/\//i.test(preview)) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
        if (supabaseUrl) {
          const base = supabaseUrl.replace(/\/$/, '');
          if (preview.startsWith('/')) {
            preview = `${base}${preview}`;
          } else if (!preview.startsWith('storage')) {
            preview = `${base}/storage/v1/object/public/${preview}`;
          } else {
            preview = `${base}/${preview}`;
          }
        }
      }

      return { ...a, preview_image: preview };
    }));
  } catch (e) {
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
    <div className="min-h-screen bg-[#FAF8F5] text-[#111] selection:bg-black selection:text-white relative overflow-x-hidden font-sans">
      
      {/* HEADER */}
      <Header />

      {/* HEADER (narrow container like /advising) */}
      <div className="max-w-3xl mx-auto px-6 pt-36 md:pt-44 pb-16">
        <CenteredHeader>
          <h1 className="text-5xl md:text-7xl font-serif font-light leading-none tracking-tight mb-6">Selection.</h1>
          <p className="text-xl font-serif italic text-gray-600 mb-6">Chronicles of silence & art.</p>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-500">
            [ Vault / {articlesToRender ? articlesToRender.length : 0} items ]
          </div>
        </CenteredHeader>
      </div>

      {/* Grid: Auction Catalog Style (wider container) */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-16">
          {articlesToRender && articlesToRender.length > 0 ? (
            articlesToRender.map((article: any) => {
              const previewImage = article.preview_image || extractFirstImage(article.content);
              const artistName = article.artist || 'MERKUROV ESTATE'; 

              return (
                <Link key={article.id} href={`/${article.slug}`} className="block group">
                  <div className="border border-gray-200/80 bg-white/80 backdrop-blur-xl p-3 hover:border-black transition-all duration-300 shadow-sm hover:shadow-xl rounded-2xl">
                    
                    {/* Image Area */}
                    <div className="aspect-[3/2] w-full bg-[#f4f4f4] relative overflow-hidden mb-3 rounded-xl">
                      {previewImage ? (
                        <Image
                          src={previewImage}
                          alt={article.title}
                          fill
                          className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500 ease-in-out transform group-hover:scale-105"
                          sizes="(max-width: 1024px) 100vw, 25vw"
                        />
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

                  </div>
                </Link>
              );
            })
          ) : (
             <div className="col-span-full py-20 text-center border border-dashed border-gray-300 rounded-3xl bg-white/50">
                <p className="font-serif italic text-gray-400 text-xl">The vault is currently sealed.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

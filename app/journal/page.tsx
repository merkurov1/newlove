import NewsletterSubscribe from '@/components/journal/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Journal | Merkurov',
  description: 'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

// Функция для очистки текста превью
function getPreviewText(content: any, limit = 240) {
  if (!content) return '';
  let text = '';
  
  if (typeof content === 'string') {
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json) || (json.blocks && Array.isArray(json.blocks))) {
        const blocks = Array.isArray(json) ? json : json.blocks;
        text = blocks.map((b: any) => b.data?.text || '').join(' ');
      } else {
        text = content;
      }
    } catch {
      text = content.replace(/<[^>]*>?/gm, '');
    }
  } else if (typeof content === 'object') {
     const blocks = Array.isArray(content) ? content : content.blocks || [];
     text = blocks.map((b: any) => b.data?.text || '').join(' ');
  }

  const clean = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.substring(0, limit) + '...' : clean;
}

export default async function JournalPage({ searchParams }: Props) {
  let initialLetters: any[] = [];
  try {
    const supabase = createClient();
    const selectCols = 'id, title, slug, content, summary, published, publishedAt, sentAt, createdAt, authorId';

    const { data: lettersData, error } = await supabase
      .from('letters')
      .select(selectCols as any)
      .eq('published', true)
      // Prefer `sentAt` for ordering (newest first). Fallbacks on server if null.
      .order('sentAt', { ascending: false })
      .limit(50);

    if (!error && Array.isArray(lettersData)) {
      initialLetters = lettersData.map((l: any) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        // Use summary when available, else try parsed preview, else fallback to stripped raw content
        preview:
          l.summary ||
          getPreviewText(l.content) ||
          (typeof l.content === 'string'
            ? (l.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 320) + (l.content.length > 320 ? '...' : ''))
            : ''),
        publishedAt: l.publishedAt,
      }));
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900 selection:bg-black selection:text-white pt-24 md:pt-32 pb-20">
        
        {/* HEADER */}
        <div className="max-w-7xl mx-auto px-6 mb-20 md:mb-28 border-b border-zinc-100 pb-12">
          <h1 className="text-6xl md:text-8xl font-serif font-medium tracking-tight text-black mb-6">
            The Journal
          </h1>
          <p className="text-xl md:text-2xl text-zinc-500 font-serif max-w-2xl leading-relaxed">
            Notes on art, technology, and the architecture of value.
          </p>
        </div>

        {/* LAYOUT */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-16">
            
            {/* ARTICLES FEED (8 cols) */}
            <div className="lg:col-span-8 space-y-20">
               {initialLetters.map((article) => (
                 <article key={article.id} className="group cursor-pointer">
                    <Link href={`/journal/${article.slug}`} className="block">
                      
                      {/* Date */}
                      <div className="mb-3 font-mono text-xs uppercase tracking-widest text-zinc-400">
                        {new Date(article.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>

                      {/* Title */}
                      <h2 className="text-3xl md:text-5xl font-serif font-medium text-black mb-4 group-hover:opacity-60 transition-opacity duration-300 leading-[1.1]">
                        {article.title}
                      </h2>

                      {/* Preview */}
                      <p className="text-base md:text-lg text-zinc-600 font-serif leading-relaxed mb-6 max-w-3xl">
                        {article.preview}
                      </p>

                      {/* Link */}
                      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b border-zinc-200 pb-1 group-hover:border-black transition-all">
                        Read <ArrowRight size={12} />
                      </div>

                    </Link>
                 </article>
               ))}
            </div>


            {/* SIDEBAR (4 cols) */}
            <aside className="lg:col-span-4 space-y-12 h-fit lg:sticky lg:top-32">
               
               {/* NEWSLETTER / OFFICE ACCESS */}
               <div className="bg-zinc-50 p-8 border border-zinc-100">
                  <h3 className="font-serif text-2xl text-black mb-3">
                    Private Office
                  </h3>
                  <p className="text-sm text-zinc-600 mb-6 leading-relaxed font-medium">
                    Subscribe to receive investment memorandums and updates directly. No noise.
                  </p>
                  <NewsletterSubscribe />
               </div>

               {/* LINKS */}
               <div>
                 <span className="block font-mono text-[10px] uppercase tracking-widest text-zinc-400 mb-4 border-b border-zinc-100 pb-2">
                    Explore
                 </span>
                 <ul className="space-y-3">
                    <li>
                       <Link href="/heartandangel" className="flex items-center justify-between text-sm font-bold uppercase tracking-widest text-zinc-800 hover:text-black hover:pl-2 transition-all">
                          <span>Art</span>
                          <ArrowUpRight size={14} className="text-zinc-400" />
                       </Link>
                    </li>
                    <li>
                       <Link href="/advising" className="flex items-center justify-between text-sm font-bold uppercase tracking-widest text-zinc-800 hover:text-black hover:pl-2 transition-all">
                          <span>Advising</span>
                          <ArrowUpRight size={14} className="text-zinc-400" />
                       </Link>
                    </li>
                    <li>
                       <Link href="/lobby" className="flex items-center justify-between text-sm font-bold uppercase tracking-widest text-zinc-800 hover:text-black hover:pl-2 transition-all">
                          <span>Lobby</span>
                          <ArrowUpRight size={14} className="text-zinc-400" />
                       </Link>
                    </li>
                 </ul>
               </div>

            </aside>

        </div>
    </main>
  );
}
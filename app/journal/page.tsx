import NewsletterSubscribe from '@/components/journal/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'THE MERKUROV JOURNAL',
  description: 'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function JournalPage({ searchParams }: Props) {
  let initialLetters: any[] = [];
  try {
    const supabase = createClient();
    const selectCols = 'id, title, slug, published, publishedAt, createdAt, authorId';

    // Забираем данные (сортировка уже верная - DESC)
    const { data: lettersData, error } = await supabase
      .from('letters')
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
        author: { name: (Array.isArray(l.User) ? l.User[0]?.name : l.User?.name) || null },
      }));
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }

  // Разделяем: Главная статья (Самая свежая) и Архив
  const heroArticle = initialLetters[0];
  const archiveArticles = initialLetters.slice(1);
  
  // Дата для шапки
  const today = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });

  return (
    <main className="min-h-screen bg-[#F3E5D8] text-[#1C1917] selection:bg-[#B91C1C] selection:text-white font-serif">
        
        {/* TOP TICKER (SILENCE INDEX MOCK - Подключи реальный компонент позже) */}
        <div className="bg-[#1C1917] text-[#F3E5D8] text-[10px] md:text-xs font-mono py-1 px-4 flex justify-between items-center overflow-hidden border-b border-black">
          <div className="flex gap-8 whitespace-nowrap overflow-x-auto no-scrollbar">
            <span className="text-[#B91C1C]">NOISE ALERT: HIGH VOLATILITY</span>
            <span>SILENCE INDEX: WATCHING</span>
            <span>GOLD: LONG</span>
            <span>HERITAGE: STABLE</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
          
          {/* MASTHEAD */}
          <header className="border-b-4 border-black mb-12 pt-8 pb-4">
            <div className="flex justify-between items-end mb-4 border-b border-black pb-2">
              <span className="hidden md:block text-xs font-bold uppercase tracking-widest">Est. 2025</span>
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-center">Belgrade • London • Void</span>
              <span className="hidden md:block text-xs font-bold uppercase tracking-widest">Price: Attention</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-black text-center tracking-tight leading-none uppercase scale-y-90 my-6">
              The Merkurov Journal
            </h1>
            <div className="flex justify-center mt-4">
              <div className="bg-black text-[#F3E5D8] px-3 py-1 text-xs font-bold uppercase tracking-wider">
                {today}
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* LEFT COLUMN: HERO STORY (8 cols) */}
            <div className="lg:col-span-8">
              {heroArticle && (
                <section className="mb-16 border-b border-black pb-12">
                   <div className="flex items-center gap-2 mb-4">
                      <span className="bg-[#B91C1C] w-2 h-2 rounded-full animate-pulse"></span>
                      <span className="text-[#B91C1C] font-bold uppercase text-xs tracking-widest">Latest Intelligence</span>
                   </div>
                   
                   <Link href={`/journal/${heroArticle.slug}`} className="group block">
                    <h2 className="text-4xl md:text-7xl font-bold leading-[0.9] mb-6 group-hover:underline decoration-4 underline-offset-8 decoration-[#B91C1C] transition-all">
                      {heroArticle.title}
                    </h2>
                   </Link>
                   
                   <div className="flex flex-col md:flex-row md:items-center justify-between text-sm font-sans tracking-wide border-t border-black/20 pt-4 mt-6">
                      <span className="font-bold uppercase">{heroArticle.author?.name || 'Anton Merkurov'}</span>
                      <span className="text-gray-600 font-mono text-xs mt-2 md:mt-0">
                        {new Date(heroArticle.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                   </div>
                </section>
              )}

              {/* ARCHIVE LIST */}
              <section>
                 <h3 className="text-xs font-bold uppercase tracking-widest mb-6 border-b border-black pb-2">Previous Dispatches</h3>
                 <div className="grid grid-cols-1 gap-0">
                    {archiveArticles.map((letter) => (
                      <Link key={letter.id} href={`/journal/${letter.slug}`} className="group flex flex-col md:flex-row md:items-baseline justify-between py-6 border-b border-black/10 hover:bg-[#EBE0D0] transition-colors px-2 -mx-2">
                         <h4 className="text-2xl font-bold mb-2 md:mb-0 group-hover:text-[#B91C1C] transition-colors">
                            {letter.title}
                         </h4>
                         <span className="font-mono text-xs text-gray-500 whitespace-nowrap md:ml-4">
                            {new Date(letter.publishedAt).toLocaleDateString('en-GB')}
                         </span>
                      </Link>
                    ))}
                 </div>
              </section>
            </div>

            {/* RIGHT COLUMN: SIDEBAR (4 cols) */}
            <aside className="lg:col-span-4 lg:border-l lg:border-black lg:pl-8 space-y-12">
               
               {/* NEWSLETTER BOX */}
               <div className="bg-white border-2 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h4 className="font-bold text-lg uppercase mb-2">Private Office Access</h4>
                  <p className="text-sm text-gray-600 italic mb-6">
                    "Data is the new marble. Receive the investment memorandums directly."
                  </p>
                  <NewsletterSubscribe />
               </div>

               {/* MARKET DATA WIDGET */}
               <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest border-b border-black pb-2">Market Sentiment</h4>
                  <div className="flex justify-between font-mono text-sm border-b border-black/10 pb-1">
                    <span>Silence (Heritage)</span>
                    <span className="text-green-700 font-bold">ACCUMULATE</span>
                  </div>
                  <div className="flex justify-between font-mono text-sm border-b border-black/10 pb-1">
                    <span>Noise (Crypto)</span>
                    <span className="text-[#B91C1C] font-bold">HEDGING</span>
                  </div>
                  <Link href="/silence" className="inline-flex items-center gap-1 text-xs font-bold uppercase mt-2 hover:underline">
                    View Full Index <ArrowUpRight size={12}/>
                  </Link>
               </div>
               
               {/* ADVERTISEMENT */}
               <div className="bg-[#1C1917] text-[#F3E5D8] p-8 text-center">
                  <span className="block text-[10px] uppercase tracking-widest mb-4 opacity-50">Advertisement</span>
                  <p className="font-serif text-xl italic mb-4 leading-tight">
                    "Do not leave your legacy to chance. Leave it to structure."
                  </p>
                  <Link href="/lobby" className="inline-block border border-[#F3E5D8] px-4 py-2 text-xs uppercase hover:bg-[#F3E5D8] hover:text-[#1C1917] transition-colors">
                    Contact The Office
                  </Link>
               </div>

            </aside>

          </div>
        </div>
    </main>
  );
}
import NewsletterSubscribe from '@/components/journal/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import nextDynamic from 'next/dynamic';

const NewsletterBanner = nextDynamic(() => import('@/components/NewsletterBanner'), { ssr: false });

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'JOURNAL | Anton Merkurov',
  description: 'Chronicles of the unframed. Notes on art, tech, and the void.',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function LettersPage({ searchParams }: Props) {
  let initialLetters: any[] = [];
  try {
    const supabase = createClient();
    const selectCols = 'id, title, slug, published, publishedAt, createdAt, authorId';

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

  return (
    <>
      <main className="min-h-screen bg-[#FDFBF7] text-[#111] selection:bg-black selection:text-white">
        
        {/* DECORATIVE BORDER TOP */}
        <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

        <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
          
          {/* Header */}
          <header className="mb-16 border-b border-gray-200 pb-8">
             <div className="flex justify-between items-center mb-6">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400">
                Merkurov Journal
              </span>
              <span className="font-mono text-[10px] tracking-widest uppercase text-gray-400">
                Index
              </span>
            </div>
            <h1
              className="text-5xl md:text-7xl font-serif font-medium tracking-tight leading-none mb-6"
              style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
            >
              The Archive.
            </h1>
            <div
              className="text-xl font-serif italic text-gray-600"
            >
              Chronicles of the unframed. Notes on art, tech, and the void.
            </div>
          </header>

          {/* Table of Contents */}
          <section className="w-full flex-1 mb-20">
            <ul className="flex flex-col">
              {initialLetters.map((letter) => (
                <li key={letter.id} className="border-b border-gray-200 group">
                  <a href={`/journal/${letter.slug}`} className="py-6 md:py-8 flex flex-col md:flex-row md:items-baseline justify-between transition-all duration-300 hover:pl-4">
                    <span
                      className="text-2xl md:text-3xl font-serif font-bold text-[#111] group-hover:text-red-700 transition-colors leading-tight mb-2 md:mb-0"
                    >
                      {letter.title}
                    </span>
                    <span
                      className="font-mono text-xs text-gray-400 tracking-widest uppercase shrink-0"
                    >
                      {letter.publishedAt ? new Date(letter.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'DRAFT'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* Newsletter Subscribe */}
          <section className="w-full mt-16 pt-12 border-t border-black">
             <div className="bg-white border border-gray-200 p-8 shadow-sm">
                <NewsletterSubscribe />
             </div>
          </section>
        </div>
      </main>
    </>
  );
}
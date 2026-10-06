import NewsletterSubscribe from '@/components/letters/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import nextDynamic from 'next/dynamic';

const NewsletterBanner = nextDynamic(() => import('@/components/NewsletterBanner'), { ssr: false });

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  alternates: { canonical: 'https://www.merkurov.love/letters' },
  title: 'JOURNAL | Anton Merkurov',
  description: 'Chronicles of the unframed. Notes on art, tech, and the void.',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function LettersPage({ searchParams }: Props) {
  let initialLetters: any[] = [];
  let lastUpdated: string | null = null;

  try {
    const supabase = createClient();
    
    const { data: lettersData, error } = await supabase
      .from('letters')
      .select('*')
      .eq('published', true)
      .limit(100);

    if (error) {
      console.error('Server initial letters fetch error:', error);
    } else if (Array.isArray(lettersData)) {
      initialLetters = lettersData.map((l: any) => {
        const pubDate = l.publishedAt || l.published_at || l.createdAt || l.created_at;
        return {
          id: l.id,
          title: l.title,
          slug: l.slug,
          publishedAt: pubDate,
          createdAt: l.createdAt || l.created_at,
          author: { name: l.author?.name || l.author_name || null },
        };
      });

      initialLetters.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });

      if (initialLetters.length > 0) {
        lastUpdated = initialLetters[0].publishedAt || initialLetters[0].createdAt || null;
      }
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error:', e);
  }

  return (
    <>
      <main className="min-h-screen bg-white text-black flex flex-col items-center px-4 pt-16 pb-0">
        {/* Header */}
        <header className="w-full max-w-2xl mx-auto text-center mb-12">
          <h1
            className="text-4xl md:text-5xl font-serif font-bold tracking-wide leading-tight mb-2"
            style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
          >
            JOURNAL
          </h1>
          <div
            className="text-lg md:text-xl font-serif italic text-gray-500 mb-2"
            style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
          >
            Chronicles of the unframed. Notes on art, tech, and the void.
          </div>
        </header>

        {/* Table of Contents */}
        <section className="w-full max-w-2xl mx-auto flex-1">
          {initialLetters.length === 0 ? (
            <div className="text-center text-gray-400 py-12 font-serif italic">
              No entries found.
            </div>
          ) : (
            <ul className="flex flex-col gap-10">
              {initialLetters.map((letter) => (
                <li key={letter.id}>
                  <a href={`/letters/${letter.slug}`} className="block group">
                    <span
                      className="block text-2xl md:text-3xl font-serif font-bold text-black group-hover:underline tracking-wide leading-snug"
                      style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
                    >
                      {letter.title}
                    </span>
                    <span
                      className="block text-xs text-gray-400 mt-1 tracking-widest"
                      style={{ letterSpacing: '0.12em' }}
                    >
                      {letter.publishedAt ? new Date(letter.publishedAt).getFullYear() : ''}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Minimalist Newsletter Subscribe at the very bottom */}
        <footer className="w-full max-w-2xl mx-auto mt-20 mb-8 flex flex-col items-center">
          <div className="w-full border-t border-gray-200 pt-8">
            <div className="w-full flex flex-col items-center">
              <div className="w-full max-w-md">
                <NewsletterSubscribe />
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

export const revalidate = 60 * 60 * 24 * 7; // revalidate once per week

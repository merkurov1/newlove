import NewsletterSubscribe from '@/components/journal/NewsletterSubscribe';
import { Suspense } from 'react';
import LettersArchive from '@/components/journal/LettersArchive';
import PostcardShop from '@/components/journal/PostcardShop';
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
  // NOTE: removed temporary server debug output for production.

  // Fetch published letters server-side to provide initial data to the client
  let initialLetters: any[] = [];
  let lastUpdated: string | null = null;
  try {
    // Use anon client by default so this page renders even when SUPABASE_SERVICE_ROLE_KEY
    // is not configured in the environment. Only use service role when debug is requested.
    const supabase = createClient();
    // Use anon-safe select columns (don't join protected `User` table here).
    const selectCols = 'id, title, slug, published, publishedAt, createdAt, authorId';

    const { data: lettersData, error } = await supabase
      .from('letters')
      // cast to any to avoid TypeScript parsing issues with PostgREST relation syntax
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
      if ((lettersData as any).length > 0) {
        const first = (lettersData as any)[0];
        lastUpdated = first.publishedAt || first.createdAt || null;
      }
    } else if (error) {
      console.error('Server initial letters fetch error', error);
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }
  // ...existing code...

  return (
    <>
      <main className="min-h-screen bg-white text-black flex flex-col items-center px-4 pt-8 sm:pt-16 pb-0">
        {/* Header */}
        <header className="w-full max-w-2xl mx-auto text-center mb-8 sm:mb-12">
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold tracking-wide leading-tight mb-2"
            style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
          >
            JOURNAL
          </h1>
          <div
            className="text-base sm:text-lg md:text-xl font-serif italic text-gray-500 mb-2 px-2"
            style={{ fontFamily: 'Playfair Display, Times New Roman, serif' }}
          >
            Chronicles of the unframed. Notes on art, tech, and the void.
          </div>
        </header>

        {/* Table of Contents */}
        <section className="w-full max-w-2xl mx-auto flex-1">
          <ul className="flex flex-col gap-6 sm:gap-10">
            {initialLetters.map((letter) => (
              <li key={letter.id}>
                <a href={`/journal/${letter.slug}`} className="block group">
                  <span
                    className="block text-xl sm:text-2xl md:text-3xl font-serif font-bold text-black group-hover:underline tracking-wide leading-snug"
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
        </section>

        {/* Newsletter Subscribe */}
        <section className="w-full max-w-2xl mx-auto mt-16 mb-8">
          <NewsletterSubscribe />
        </section>
      </main>
    </>
  );
}


import NewsletterSubscribe from '@/components/letters/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import nextDynamic from 'next/dynamic';

const NewsletterBanner = nextDynamic(
  () => import('@/components/NewsletterBanner'),
  { ssr: false },
);

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Letters Archive | Anton Merkurov',
  description:
    'The complete archive of published letters and Flow issues by Anton Merkurov, including original postcards and long-form dispatches.',
  alternates: { canonical: 'https://www.merkurov.love/journal' },
});

interface Props {
  searchParams?: {
    [key: string]: string | string[] | undefined;
  };
}

type ArchiveEntry = {
  id: string;
  title: string;
  slug: string;
  publishedAt: string | null;
  createdAt: string | null;
  kind: string;
  lang: string | null;
};

export default async function LettersPage({ searchParams }: Props) {
  let initialLetters: ArchiveEntry[] = [];
  let lastUpdated: string | null = null;

  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('letters')
      .select(
        'id,title,slug,published,publishedAt,createdAt,kind,lang,status',
      )
      .eq('published', true)
      .limit(100);

    if (error) {
      console.error('[Letters archive] Fetch error:', error);
    } else if (Array.isArray(data)) {
      initialLetters = data.map((letter: any) => ({
        id: String(letter.id),
        title: String(letter.title || 'Untitled'),
        slug: String(letter.slug || ''),
        publishedAt:
          letter.publishedAt || letter.published_at || null,
        createdAt:
          letter.createdAt || letter.created_at || null,
        kind: letter.kind || 'letter',
        lang: letter.lang || null,
      }));

      initialLetters.sort((a, b) => {
        const dateA = a.publishedAt || a.createdAt;
        const dateB = b.publishedAt || b.createdAt;

        return (
          new Date(dateB || 0).getTime() -
          new Date(dateA || 0).getTime()
        );
      });

      if (initialLetters.length > 0) {
        lastUpdated =
          initialLetters[0].publishedAt ||
          initialLetters[0].createdAt ||
          null;
      }
    }
  } catch (error) {
    console.error('[Letters archive] Unexpected fetch error:', error);
  }

  return (
    <>
      <div className="flex min-h-screen flex-col items-center bg-white px-4 pb-0 pt-16 text-black">
        <header className="mx-auto mb-12 w-full max-w-2xl text-center">
          <h1
            className="mb-2 text-4xl font-serif font-bold leading-tight tracking-wide md:text-5xl"
            style={{
              fontFamily: 'Playfair Display, Times New Roman, serif',
            }}
          >
            JOURNAL
          </h1>

          <div
            className="mb-2 font-serif text-lg italic text-gray-500 md:text-xl"
            style={{
              fontFamily: 'Playfair Display, Times New Roman, serif',
            }}
          >
            Chronicles of the unframed. Notes on art, tech, and the void.
          </div>

          {lastUpdated && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-gray-400">
              Updated{' '}
              {new Date(lastUpdated).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </p>
          )}
        </header>

        <section className="mx-auto w-full max-w-2xl flex-1">
          {initialLetters.length === 0 ? (
            <div className="py-12 text-center font-serif italic text-gray-400">
              No entries found.
            </div>
          ) : (
            <ul className="flex flex-col gap-10">
              {initialLetters.map((letter) => {
                const isIssue = letter.kind === 'issue';

                return (
                  <li key={letter.id}>
                    <a
                      href={`/letters/${letter.slug}`}
                      className="group block"
                    >
                      <span
                        className="block text-2xl font-serif font-bold leading-snug tracking-wide text-black group-hover:underline md:text-3xl"
                        style={{
                          fontFamily:
                            'Playfair Display, Times New Roman, serif',
                        }}
                      >
                        {letter.title}
                      </span>

                      <span className="mt-2 flex flex-wrap items-center gap-3 text-xs tracking-widest text-gray-400">
                        <span>
                          {letter.publishedAt || letter.createdAt
                            ? new Date(
                                letter.publishedAt || letter.createdAt!,
                              ).toLocaleDateString('en-GB', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: 'UTC',
                              })
                            : ''}
                        </span>

                        {isIssue && (
                          <span className="text-[#990F3D]">
                            {letter.lang === 'ru'
                              ? 'FLOW ISSUE · RU'
                              : 'FLOW ISSUE · EN'}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mx-auto mb-8 mt-20 flex w-full max-w-2xl flex-col items-center">
          <div className="w-full border-t border-gray-200 pt-8">
            <div className="flex w-full flex-col items-center">
              <div className="w-full max-w-md">
                <NewsletterSubscribe />
              </div>
            </div>
          </div>
        </footer>
      </div>

      <NewsletterBanner />
    </>
  );
}

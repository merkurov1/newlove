import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import CenteredHeader from '@/components/CenteredHeader';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import JournalViewClient, {
  type JournalArticle,
} from '@/components/journal/JournalViewClient';
import { extractPreview } from '@/lib/journal/preview';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  alternates: { canonical: 'https://www.merkurov.love/journal' },
  title: 'Journal | Merkurov',
  description:
    'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

interface Props {
  searchParams?:
    | Promise<{ [key: string]: string | string[] | undefined }>
    | { [key: string]: string | string[] | undefined };
}

export default async function JournalPage({ searchParams }: Props) {
  if (
    searchParams &&
    typeof (searchParams as Promise<unknown>).then === 'function'
  ) {
    await searchParams;
  }

  let initialLetters: JournalArticle[] = [];

  try {
    const supabase = createClient();

    const selectCols =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number,payload';

    let lettersData: any[] | null = null;
    let queryError: any = null;

    const primary = await supabase
      .from('letters')
      .select(selectCols)
      .eq('published', true)
      .order('sentAt', { ascending: false })
      .limit(100);

    lettersData = primary.data as any[] | null;
    queryError = primary.error;

    // Fallback if payload column or sentAt fails
    if (queryError) {
      const fallbackCols =
        'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number';
      const fallbackRes = await supabase
        .from('letters')
        .select(fallbackCols)
        .eq('published', true)
        .order('publishedAt', { ascending: false })
        .limit(100);

      lettersData = fallbackRes.data as any[] | null;
      queryError = fallbackRes.error;
    } else if (!lettersData || lettersData.length === 0) {
      const fallback = await supabase
        .from('letters')
        .select(selectCols)
        .eq('published', true)
        .order('publishedAt', { ascending: false })
        .limit(100);

      lettersData = fallback.data as any[] | null;
      queryError = fallback.error;
    }

    if (!queryError && Array.isArray(lettersData)) {
      initialLetters = lettersData.map((letter: any) => ({
        id: String(letter.id),
        title: String(letter.title || 'Untitled'),
        slug: String(letter.slug || ''),
        preview:
          extractPreview(letter.content, letter.payload, 280) ||
          (letter.kind === 'issue'
            ? letter.lang === 'ru'
              ? 'Газетный выпуск Flow.'
              : 'Flow newspaper issue.'
            : ''),
        publishedAt: letter.publishedAt || null,
        sentAt: letter.sentAt || null,
        createdAt: letter.createdAt || null,
        kind: letter.kind || 'letter',
        lang: letter.lang || null,
        number: letter.number || null,
      }));

      initialLetters.sort((a, b) => {
        const dateA = a.publishedAt || a.sentAt || a.createdAt;
        const dateB = b.publishedAt || b.sentAt || b.createdAt;
        return (
          new Date(dateB || 0).getTime() -
          new Date(dateA || 0).getTime()
        );
      });
    } else if (queryError) {
      console.error('[Journal] Query failed:', queryError);
    }
  } catch (error) {
    console.error('[Journal] Unexpected fetch error:', error);
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] font-sans text-[#111] selection:bg-black selection:text-white">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <CenteredHeader
          title={<>The Journal</>}
          subtitle={
            <>Notes on art, technology, and the architecture of value.</>
          }
        />
        <SubscribeFormClient />
      </div>

      <JournalViewClient articles={initialLetters} />
    </main>
  );
}

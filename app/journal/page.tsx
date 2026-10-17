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

const PAGE_SIZE = 10;

function mapLetter(letter: any): JournalArticle {
  const lang = String(letter.lang || '').trim();

  return {
    id: String(letter.id),
    title: String(letter.title || 'Untitled'),
    slug: String(letter.slug || ''),
    preview:
      extractPreview(letter.content, letter.payload, 280) ||
      (letter.kind === 'issue'
        ? /^en/i.test(lang)
          ? 'Flow newspaper issue.'
          : 'Газетный выпуск Flow.'
        : ''),
    publishedAt: letter.publishedAt || null,
    sentAt: letter.sentAt || null,
    createdAt: letter.createdAt || null,
    kind: letter.kind || 'letter',
    lang: lang || null,
    number: letter.number == null ? null : Number(letter.number),
  };
}

async function fetchLetters(
  supabase: ReturnType<typeof createClient>,
  kind: 'articles' | 'ru-issue' | 'en-issue',
) {
  const columnsWithPayload =
    'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number,payload';
  const columnsWithoutPayload =
    'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number';

  async function run(columns: string) {
    let query = supabase
      .from('letters')
      .select(columns)
      .eq('published', true);

    if (kind === 'articles') {
      query = query.or('kind.is.null,kind.neq.issue');
    } else {
      query = query.eq('kind', 'issue');

      if (kind === 'ru-issue') {
        query = query.ilike('lang', 'ru%');
      } else {
        query = query.ilike('lang', 'en%');
      }
    }

    query = query
      .order('publishedAt', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });

    if (kind === 'articles') {
      query = query.limit(PAGE_SIZE + 1);
    } else {
      query = query.limit(1);
    }

    return query;
  }

  let result = await run(columnsWithPayload);

  if (result.error) {
    result = await run(columnsWithoutPayload);
  }

  if (result.error) {
    console.error(`[Journal] Failed to fetch ${kind}:`, result.error);
    return [];
  }

  return Array.isArray(result.data) ? result.data : [];
}

export default async function JournalPage() {
  let initialArticles: JournalArticle[] = [];
  let latestIssues: JournalArticle[] = [];
  let initialHasMore = false;

  try {
    const supabase = createClient();

    const [articleRows, russianIssueRows, englishIssueRows] =
      await Promise.all([
        fetchLetters(supabase, 'articles'),
        fetchLetters(supabase, 'ru-issue'),
        fetchLetters(supabase, 'en-issue'),
      ]);

    initialHasMore = articleRows.length > PAGE_SIZE;
    initialArticles = articleRows.slice(0, PAGE_SIZE).map(mapLetter);

    latestIssues = [...russianIssueRows, ...englishIssueRows]
      .map(mapLetter)
      .sort((a, b) => {
        const dateA = a.publishedAt || a.sentAt || a.createdAt;
        const dateB = b.publishedAt || b.sentAt || b.createdAt;

        return (
          new Date(dateB || 0).getTime() -
          new Date(dateA || 0).getTime()
        );
      });
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

      <JournalViewClient
        initialArticles={initialArticles}
        latestIssues={latestIssues}
        initialHasMore={initialHasMore}
      />
    </main>
  );
}
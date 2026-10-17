import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import JournalViewClient, {
  type JournalArticle,
} from '@/components/journal/JournalViewClient';
import { extractPreview } from '@/lib/journal/preview';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  alternates: { canonical: 'https://www.merkurov.love/journal' },
  title: 'Flow Journal | Anton Merkurov',
  description:
    'The latest editions of Flow: independent notes on art, technology, culture and value.',
});

const PAGE_SIZE = 10;

function mapIssue(issue: any): JournalArticle {
  const lang = String(issue.lang || '').trim();

  return {
    id: String(issue.id),
    title: String(issue.title || 'Untitled'),
    slug: String(issue.slug || ''),
    preview: extractPreview(issue.content, issue.payload, 320),
    publishedAt: issue.publishedAt || null,
    sentAt: issue.sentAt || null,
    createdAt: issue.createdAt || null,
    kind: 'issue',
    lang: lang || null,
    number: issue.number == null ? null : Number(issue.number),
  };
}

async function fetchLatestIssues(): Promise<JournalArticle[]> {
  try {
    const supabase = createClient();

    const withPayload = await supabase
      .from('letters')
      .select(
        'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,number,payload',
      )
      .eq('published', true)
      .eq('kind', 'issue')
      .order('publishedAt', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);

    let rows = withPayload.data;

    if (withPayload.error) {
      const fallback = await supabase
        .from('letters')
        .select(
          'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,number',
        )
        .eq('published', true)
        .eq('kind', 'issue')
        .order('publishedAt', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (fallback.error) {
        console.error('[Journal] Failed to fetch issues:', fallback.error);
        return [];
      }

      rows = fallback.data;
    }

    if (!Array.isArray(rows)) return [];

    return rows.map(mapIssue);
  } catch (error) {
    console.error('[Journal] Unexpected error:', error);
    return [];
  }
}

export default async function JournalPage() {
  const issues = await fetchLatestIssues();
  const initialHasMore = issues.length > PAGE_SIZE;
  const initialIssues = issues.slice(0, PAGE_SIZE);

  return (
    <main className="min-h-screen bg-[#FFF1E5] text-[#33302E] selection:bg-[#990F3D] selection:text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="pt-5 sm:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFC1B3] pb-3 font-mono text-[10px] uppercase tracking-[0.13em] text-[#70675F]">
            <span>Anton Merkurov</span>
            <span>Independent publishing</span>
            <span>Art · Technology · Culture</span>
          </div>

          <div className="py-6 sm:py-9">
            <div className="border-b-[3px] border-[#33302E] pb-3 sm:pb-5">
              <h1 className="font-serif text-[clamp(3.3rem,10vw,7.5rem)] font-bold leading-[0.86] tracking-[-0.065em]">
                Flow Journal
              </h1>
            </div>

            <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <p className="max-w-xl font-serif text-lg italic leading-snug text-[#655A52] sm:text-xl">
                Independent notes on art, technology, culture and the
                architecture of value.
              </p>

              <a
                href="/letters"
                className="shrink-0 self-start border-b border-[#0D7680] pb-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#0D7680] transition-colors hover:text-[#07565D]"
              >
                Full archive →
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 border-y border-[#CFC1B3] sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="py-3 sm:pr-6">
              <span className="mr-2 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#990F3D]">
                The newsletter
              </span>
              <span className="font-serif text-sm text-[#655A52]">
                New editions, delivered by email.
              </span>
            </div>

            <div className="border-t border-[#CFC1B3] py-3 sm:border-l sm:border-t-0 sm:pl-6">
              <SubscribeFormClient />
            </div>
          </div>
        </header>

        <JournalViewClient
          initialArticles={initialIssues}
          initialHasMore={initialHasMore}
        />

        <footer className="mt-10 border-t-[3px] border-[#33302E] py-5">
          <div className="flex flex-col justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#70675F] sm:flex-row">
            <span>Flow Journal · Anton Merkurov</span>
            <a
              href="/letters"
              className="transition-colors hover:text-[#990F3D]"
            >
              Browse all editions →
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
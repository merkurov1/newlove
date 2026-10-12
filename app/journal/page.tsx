
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import CenteredHeader from '@/components/CenteredHeader';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';

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

function getPreviewText(content: unknown, limit = 320): string {
  if (!content) return '';

  const stripHtml = (html: string) =>
    String(html || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

  let text = '';

  if (typeof content === 'string') {
    try {
      const json = JSON.parse(content);
      const blocks = Array.isArray(json) ? json : json?.blocks || [];
      const parts: string[] = [];

      for (const block of blocks) {
        if (!block?.data) continue;
        const html =
          typeof block.data === 'string'
            ? block.data
            : block.data.html || block.data.text || '';
        const part = stripHtml(html);
        if (part) parts.push(part);
      }

      text = parts.join(' ');
      if (!text) text = stripHtml(content);
    } catch {
      text = stripHtml(content);
    }
  } else if (typeof content === 'object') {
    const value = content as { blocks?: any[] };
    const blocks = Array.isArray(content)
      ? (content as any[])
      : value.blocks || [];
    const parts: string[] = [];

    for (const block of blocks) {
      if (!block?.data) continue;
      const html =
        typeof block.data === 'string'
          ? block.data
          : block.data.html || block.data.text || '';
      const part = stripHtml(html);
      if (part) parts.push(part);
    }

    text = parts.join(' ');
  }

  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit
    ? `${clean.substring(0, limit)}...`
    : clean;
}

export default async function JournalPage({ searchParams }: Props) {
  // Resolve async searchParams in Next.js versions that provide a Promise.
  if (
    searchParams &&
    typeof (searchParams as Promise<unknown>).then === 'function'
  ) {
    await searchParams;
  }

  let initialLetters: Array<{
    id: string;
    title: string;
    slug: string;
    preview: string;
    publishedAt: string | null;
    sentAt: string | null;
    createdAt: string | null;
    kind: string;
    lang: string | null;
  }> = [];

  try {
    const supabase = createClient();

    const selectCols =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status';

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

    // Legacy fallback for installations where sentAt is not populated.
    if ((!lettersData || lettersData.length === 0) && !queryError) {
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
          letter.kind === 'issue'
            ? letter.lang === 'ru'
              ? 'Газетный выпуск Flow.'
              : 'Flow newspaper issue.'
            : getPreviewText(letter.content),
        publishedAt: letter.publishedAt || null,
        sentAt: letter.sentAt || null,
        createdAt: letter.createdAt || null,
        kind: letter.kind || 'letter',
        lang: letter.lang || null,
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
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-32">
        <CenteredHeader
          eyebrow={<>// System Logs</>}
          title={<>The Journal</>}
          subtitle={
            <>Notes on art, technology, and the architecture of value.</>
          }
        />
        <SubscribeFormClient />
      </div>

      <div className="mx-auto max-w-3xl space-y-12 px-6 pb-24">
        {initialLetters.length === 0 ? (
          <div className="py-12 text-center font-serif text-gray-500">
            No dispatches found.
          </div>
        ) : (
          initialLetters.map((article) => {
            const displayDate =
              article.publishedAt ||
              article.sentAt ||
              article.createdAt;

            const href =
              article.kind === 'issue'
                ? `/letters/${article.slug}`
                : `/journal/${article.slug}`;

            const isIssue = article.kind === 'issue';

            return (
              <article key={article.id} className="group">
                <Link href={href} className="block">
                  <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                    {displayDate && (
                      <time dateTime={displayDate}>
                        {new Date(displayDate).toLocaleDateString(
                          'en-GB',
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            timeZone: 'UTC',
                          },
                        )}
                      </time>
                    )}

                    {isIssue && (
                      <span className="text-[#990F3D]">
                        {article.lang === 'ru'
                          ? 'Flow · RU'
                          : 'Flow · EN'}
                      </span>
                    )}
                  </div>

                  <h2 className="mb-3 font-serif text-2xl font-medium leading-tight text-black transition-colors duration-300 group-hover:text-red-700 md:text-4xl">
                    {article.title}
                  </h2>

                  {article.preview && (
                    <p className="mb-4 whitespace-pre-line font-serif text-base leading-relaxed text-gray-700 md:text-lg">
                      {article.preview}
                    </p>
                  )}

                  <div className="inline-flex items-center gap-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-widest transition-all group-hover:border-red-700 group-hover:text-red-700">
                    {isIssue ? 'Read Issue' : 'Read Dispatch'}
                    <ArrowRight size={12} />
                  </div>
                </Link>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}

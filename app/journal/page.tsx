
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
    number?: number | null;
  }> = [];

  try {
    const supabase = createClient();

    const selectCols =
      'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,status,number';

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
          getPreviewText(letter.content, 260) ||
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

      <div className="mx-auto max-w-3xl space-y-8 px-6 pb-28">
        {initialLetters.length === 0 ? (
          <div className="py-16 text-center font-serif text-gray-500">
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

            const formattedDate = displayDate
              ? new Date(displayDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })
              : null;

            if (isIssue) {
              return (
                <article
                  key={article.id}
                  className="group relative overflow-hidden rounded-2xl border border-[#E8E2D8] bg-white/70 p-6 sm:p-8 transition-all duration-300 hover:border-[#990F3D]/40 hover:bg-white hover:shadow-[0_8px_30px_rgba(153,15,61,0.06)]"
                >
                  <Link href={href} className="block">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EAE1] pb-3 font-mono text-[11px] uppercase tracking-wider text-gray-400">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-2 w-2 rounded-full bg-[#990F3D]" />
                        <span className="font-semibold text-[#990F3D]">
                          Газета Flow
                          {article.number ? ` · № ${article.number}` : ''}
                        </span>
                        <span className="rounded bg-[#F4EFEA] px-1.5 py-0.5 text-[9px] text-gray-600">
                          {article.lang === 'ru' ? 'RU' : 'EN'}
                        </span>
                      </div>

                      {formattedDate && (
                        <time dateTime={displayDate || undefined} className="text-gray-400">
                          {formattedDate}
                        </time>
                      )}
                    </div>

                    <h2 className="mb-3 font-serif text-2xl font-medium leading-tight text-black transition-colors duration-200 group-hover:text-[#990F3D] sm:text-3xl">
                      {article.title}
                    </h2>

                    {article.preview && (
                      <p className="mb-5 line-clamp-3 font-serif text-base leading-relaxed text-gray-600 sm:text-[17px]">
                        {article.preview}
                      </p>
                    )}

                    <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[#990F3D] transition-transform duration-200 group-hover:translate-x-1">
                      Читать выпуск ↗
                    </div>
                  </Link>
                </article>
              );
            }

            return (
              <article
                key={article.id}
                className="group border-b border-[#E8E2D8]/80 pb-8 last:border-b-0"
              >
                <Link href={href} className="block">
                  <div className="mb-2.5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                    <span className="text-gray-500">Dispatch</span>
                    {formattedDate && (
                      <>
                        <span>·</span>
                        <time dateTime={displayDate || undefined}>
                          {formattedDate}
                        </time>
                      </>
                    )}
                  </div>

                  <h2 className="mb-3 font-serif text-2xl font-medium leading-tight text-black transition-colors duration-200 group-hover:text-[#990F3D] sm:text-3xl">
                    {article.title}
                  </h2>

                  {article.preview && (
                    <p className="mb-4 whitespace-pre-line font-serif text-base leading-relaxed text-gray-700 sm:text-lg">
                      {article.preview}
                    </p>
                  )}

                  <div className="inline-flex items-center gap-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-widest transition-all group-hover:border-[#990F3D] group-hover:text-[#990F3D]">
                    Read Dispatch
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

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import CenteredHeader from '@/components/CenteredHeader';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Journal | Merkurov',
  description: 'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

interface Props {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}

// Функция для очистки текста превью — поддерживает `data.html` и `data.text` в блоках
function getPreviewText(content: any, limit = 320) {
  if (!content) return '';

  const stripHtml = (html: string) =>
    String(html || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  let text = '';

  if (typeof content === 'string') {
    try {
      const json = JSON.parse(content);
      const blocks = Array.isArray(json) ? json : json?.blocks || [];
      const parts: string[] = [];
      for (const b of blocks) {
        if (!b || !b.data) continue;
        const html = typeof b.data === 'string' ? b.data : b.data.html || b.data.text || '';
        const part = stripHtml(html);
        if (part) parts.push(part);
      }
      text = parts.join(' ');
      if (!text) {
        text = stripHtml(content);
      }
    } catch {
      text = stripHtml(content);
    }
  } else if (typeof content === 'object') {
    const blocks = Array.isArray(content) ? content : content.blocks || [];
    const parts: string[] = [];
    for (const b of blocks) {
      if (!b || !b.data) continue;
      const html = typeof b.data === 'string' ? b.data : b.data.html || b.data.text || '';
      const part = stripHtml(html);
      if (part) parts.push(part);
    }
    text = parts.join(' ');
  }

  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.substring(0, limit) + '...' : clean;
}

export default async function JournalPage({ searchParams }: Props) {
  // Safe resolution for Next.js 15+ async searchParams
  if (searchParams instanceof Promise) {
    await searchParams;
  }

  let initialLetters: any[] = [];
  try {
    const supabase = createClient();
    const selectCols = 'id, title, slug, content, published, publishedAt, sentAt, createdAt, authorId';

    let lettersData: any[] | null = null;
    let queryError: any = null;

    try {
      const res = await supabase
        .from('letters')
        .select(selectCols)
        .eq('published', true)
        .order('sentAt', { ascending: false })
        .limit(50);
      lettersData = res.data as any[] | null;
      queryError = res.error;
    } catch (e) {
      queryError = e;
    }

    if ((!lettersData || lettersData.length === 0) && !queryError) {
      try {
        const res2 = await supabase
          .from('letters')
          .select(selectCols)
          .eq('published', true)
          .order('publishedAt', { ascending: false })
          .limit(50);
        lettersData = res2.data as any[] | null;
        queryError = res2.error;
      } catch (e) {
        queryError = e;
      }
    }

    if (!queryError && Array.isArray(lettersData) && lettersData.length > 0) {
      initialLetters = lettersData.map((l: any) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        preview:
          getPreviewText(l.content) ||
          (typeof l.content === 'string'
            ? (l.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 320) + (l.content.length > 320 ? '...' : ''))
            : ''),
        publishedAt: l.publishedAt,
        sentAt: l.sentAt,
        createdAt: l.createdAt,
      }));
    } else if (queryError) {
      console.error('Journal query error:', queryError);
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white">
        
        {/* HEADER */}
        <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
          <CenteredHeader eyebrow={<>// System Logs</>} title={<>The Journal</>} subtitle={<>Notes on art, technology, and the architecture of value.</>} />
          <SubscribeFormClient />
        </div>

        {/* ARTICLES */}
        <div className="max-w-3xl mx-auto px-6 space-y-12 pb-24">
          {initialLetters.length === 0 ? (
            <div className="text-center text-gray-500 font-serif py-12">No dispatches found.</div>
          ) : (
            initialLetters.map((article) => {
              const displayDate = article.publishedAt || article.sentAt || article.createdAt;
              return (
                <article key={article.id} className="group">
                  <Link href={`/journal/${article.slug}`} className="block">
                    {displayDate && (
                      <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                        {new Date(displayDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    )}
                    <h2 className="text-2xl md:text-4xl font-serif font-medium text-black mb-3 group-hover:text-red-600 transition-colors duration-300 leading-tight">
                      {article.title}
                    </h2>
                    <p className="text-base md:text-lg text-gray-700 font-serif leading-relaxed mb-4 whitespace-pre-line">
                      {article.preview}
                    </p>
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b border-black pb-1 group-hover:border-red-600 group-hover:text-red-600 transition-all">
                      Read Dispatch <ArrowRight size={12} />
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

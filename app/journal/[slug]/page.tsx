import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { description as seoDescription, pageMetadata, truncate } from '@/lib/seo';
import { blogPostingJsonLd, breadcrumbJsonLd, newsArticleJsonLd } from '@/lib/structuredData';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

interface PageProps {
  params: Promise<{ slug: string }> | { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const slug = resolvedParams.slug;
  const path = `/journal/${encodeURIComponent(slug)}`;

  try {
    // Public article metadata must not depend on request-scoped RLS. The row is
    // still constrained to published=true, and limit(1) tolerates duplicate
    // historical slugs that used to make .single() return a 404.
    const supabase = await createClient({ useServiceRole: true });
    const { data } = await supabase
      .from('letters')
      .select('title, content, publishedAt, createdAt, lang, kind')
      .eq('slug', slug)
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(1);
    const letter = data?.[0] ?? null;

    if (!letter) {
      return pageMetadata({
        title: 'Journal — article not found | Anton Merkurov',
        description: 'The requested journal article could not be found.',
        path,
        noindex: true,
      });
    }

    let summary = '';
    try {
      summary = generateDescription(letter.content || '') || '';
    } catch {
      summary = '';
    }

    let imageUrl: string | null = null;
    try {
      imageUrl = await getFirstImage(letter.content || '');
    } catch {
      imageUrl = null;
    }

    const title = truncate(String(letter.title || 'Journal'), 60);
    const summaryText = seoDescription(
      summary || `A journal dispatch by Anton Merkurov: ${letter.title}.`,
    );

    return pageMetadata({
      title,
      description: summaryText,
      path,
      type: 'article',
      image: imageUrl || undefined,
      imageAlt: String(letter.title || 'Journal article'),
      publishedTime: letter.publishedAt || letter.createdAt || undefined,
      modifiedTime: letter.publishedAt || letter.createdAt || undefined,
      authors: ['Anton Merkurov'],
    });
  } catch {
    return pageMetadata({
      title: 'Journal | Anton Merkurov',
      description: 'Essays, dispatches and market intelligence by Anton Merkurov.',
      path,
    });
  }
}

export default async function LetterPage({ params }: PageProps) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const slug = resolvedParams.slug;
  const supabase = await createClient({ useServiceRole: true });

  const { data } = await supabase
    .from('letters')
    .select(
      'id, title, slug, content, published, publishedAt, createdAt, lang, kind, authorId, users(name, email)'
    )
    .eq('slug', slug)
    .eq('published', true)
    .order('publishedAt', { ascending: false })
    .limit(1);

  const letter = data?.[0] ?? null;
  if (!letter) notFound();

  const letterAuthor = Array.isArray(letter.users) ? letter.users[0] : letter.users;
  const dateStr = new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  let blocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : (parsed.blocks ? parsed.blocks : [parsed]);
  } catch (e) {
    blocks = [];
  }

  const articlePath = `/journal/${encodeURIComponent(slug)}`;
  const articleSummary =
    seoDescription(
      generateDescription(letter.content || '') ||
        `A journal dispatch by Anton Merkurov: ${letter.title}.`,
    );
  let articleImage: string | null = null;
  try {
    articleImage = await getFirstImage(letter.content || '');
  } catch {
    articleImage = null;
  }
  const letterKind = String((letter as { kind?: string | null }).kind || '').toLowerCase();
  // NewsArticle is reserved for an explicit news type. Journal issues and
  // essays stay BlogPosting even when the headline sounds topical.
  const isNewsArticle = letterKind === 'news' || letterKind === 'breaking';
  const articleInput = {
    path: articlePath,
    headline: String(letter.title || 'Journal'),
    description: articleSummary,
    datePublished: letter.publishedAt || letter.createdAt || undefined,
    dateModified: letter.publishedAt || letter.createdAt || undefined,
    image: articleImage || undefined,
    inLanguage: letter.lang === 'ru' ? 'ru' : 'en',
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#FAF8F5] text-[#1C1A1B] selection:bg-[#1C1A1B] selection:text-[#FAF8F5] font-serif">
      <JsonLd
        data={
          isNewsArticle
            ? newsArticleJsonLd(articleInput)
            : blogPostingJsonLd(articleInput)
        }
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Journal', path: '/journal' },
          { name: String(letter.title || 'Article'), path: articlePath },
        ])}
      />
      <nav className="sticky top-0 z-50 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#DAD3CC] py-4 px-6 md:px-12 flex justify-between items-center">
        <Link 
          href="/journal" 
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#5B5658] hover:text-[#7A2233] transition-colors"
        >
          <ArrowLeft size={14} /> 
          <span>All Articles</span>
        </Link>
      </nav>

      <article className="max-w-3xl mx-auto min-w-0 px-6 py-16 md:py-24">
        <header className="mb-16 md:mb-20 text-center">
          <h1 className="text-4xl md:text-6xl font-serif font-normal leading-[1.08] tracking-[-0.02em] mb-8 text-balance break-words text-[#1C1A1B]">
            {letter.title}
          </h1>
          <div className="flex flex-wrap justify-center items-center gap-4 text-xs font-mono uppercase tracking-widest text-[#5B5658]">
             <span>{dateStr}</span>
             <span className="w-1 h-1 bg-[#DAD3CC] rounded-full"></span>
             <span>{letterAuthor?.name || 'Anton Merkurov'}</span>
          </div>
        </header>

        <div className="prose prose-lg md:prose-xl prose-stone max-w-none min-w-0
          prose-headings:font-serif prose-headings:font-normal prose-headings:text-[#1C1A1B]
          prose-p:font-serif prose-p:text-[#33302F] prose-p:leading-[1.8]
          prose-a:text-[#7A2233] prose-a:underline prose-a:decoration-1 hover:prose-a:opacity-70
          prose-blockquote:border-l-2 prose-blockquote:border-[#7A2233] prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-[#33302F]
          prose-code:font-mono prose-code:text-sm prose-code:bg-[#F1ECE5] prose-code:px-1 prose-code:rounded
          mb-24">
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-center py-12 text-[#8A8380] font-mono text-xs">
                 Content loading...
              </div>
            )}
        </div>

        <div className="flex justify-center mb-20">
           <div className="text-center">
              <span className="font-serif italic text-2xl text-[#8A8380]">A.M.</span>
           </div>
        </div>

        <section className="border-t border-[#DAD3CC] pt-16">
            <div className="flex items-center gap-3 mb-8">
               <MessageSquare size={18} className="text-[#8A8380]" />
               <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-[#1C1A1B]">
                 Discussion
               </h3>
            </div>
            <div className="bg-[#F1ECE5] rounded-xl p-6 md:p-8">
                <LetterCommentsClient slug={slug} />
            </div>
        </section>
      </article>
    </div>
  );
}

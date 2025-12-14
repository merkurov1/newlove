import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const supabase = createClient();
    const { data: letter } = await supabase
      .from('letters')
      .select('title, content')
      .eq('slug', slug)
      .eq('published', true)
      .single();

    if (!letter) return { title: 'Journal | Merkurov' };

    // Try to build a short description and extract the first image for social cards
    let description = '';
    try {
      description = generateDescription(letter.content || '') || '';
    } catch {
      description = '';
    }

    let imageUrl: string | null = null;
    try {
      imageUrl = await getFirstImage(letter.content || '');
    } catch {
      imageUrl = null;
    }

    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
    const canonical = `${site.replace(/\/$/, '')}/journal/${encodeURIComponent(slug)}`;

    return sanitizeMetadata({
      title: letter.title,
      description: (description || 'Read the full dispatch.').slice(0, 160),
      openGraph: {
        title: letter.title,
        description: (description || '').slice(0, 160),
        url: canonical,
        type: 'article',
        images: imageUrl ? [imageUrl] : undefined,
      },
      twitter: {
        card: imageUrl ? 'summary_large_image' : 'summary',
        title: letter.title,
        description: (description || '').slice(0, 160),
        images: imageUrl ? [imageUrl] : undefined,
      },
      alternates: { canonical },
    });
  } catch (e) {
    return { title: 'Journal | Merkurov' };
  }
}

export default async function LetterPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const supabase = createClient();

  const { data: letter, error } = await supabase
    .from('letters')
    .select(
      'id, title, slug, content, published, publishedAt, createdAt, authorId, users(name, email)'
    )
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !letter) notFound();

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

  return (
    <main className="min-h-screen bg-white text-zinc-900 selection:bg-black selection:text-white font-serif">
      
      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-zinc-100 py-4 px-6 md:px-12 flex justify-between items-center">
        <Link 
          href="/journal" 
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-black transition-colors"
        >
          <ArrowLeft size={14} /> 
          <span>All Articles</span>
        </Link>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        
        {/* HEADER */}
        <header className="mb-16 md:mb-20 text-center">
          <h1 className="text-4xl md:text-6xl font-serif font-medium leading-tight mb-8 text-black">
            {letter.title}
          </h1>
          
          <div className="flex justify-center items-center gap-4 text-xs font-mono uppercase tracking-widest text-zinc-500">
             <span>{dateStr}</span>
             <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
             <span>{letterAuthor?.name || 'Anton Merkurov'}</span>
          </div>
        </header>

        {/* CONTENT */}
        <div className="prose prose-lg md:prose-xl prose-stone max-w-none 
          prose-headings:font-serif prose-headings:font-medium prose-headings:text-black
          prose-p:font-serif prose-p:text-zinc-800 prose-p:leading-[1.8]
          prose-a:text-black prose-a:underline prose-a:decoration-1 hover:prose-a:opacity-70
          prose-blockquote:border-l-2 prose-blockquote:border-black prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-zinc-800
          prose-code:font-mono prose-code:text-sm prose-code:bg-zinc-100 prose-code:px-1 prose-code:rounded
          mb-24">
            
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-center py-12 text-zinc-400 font-mono text-xs">
                 Content loading...
              </div>
            )}
            
        </div>

        {/* SIGNATURE */}
        <div className="flex justify-center mb-20">
           <div className="text-center">
              <span className="font-serif italic text-2xl text-zinc-400">A.M.</span>
           </div>
        </div>

        {/* COMMENTS */}
        <section className="border-t border-zinc-100 pt-16">
            <div className="flex items-center gap-3 mb-8">
               <MessageSquare size={18} className="text-zinc-400" />
               <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-black">
                 Discussion
               </h3>
            </div>
            <div className="bg-zinc-50 rounded-xl p-6 md:p-8">
                <LetterCommentsClient slug={slug} />
            </div>
        </section>

      </article>
    </main>
  );
}
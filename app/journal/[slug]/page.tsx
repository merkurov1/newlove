import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { ArrowLeft, MessageSquare, Share2 } from 'lucide-react';

// --- METADATA GENERATION ---
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const supabase = createClient();
    const { data: letter, error } = await supabase
      .from('letters')
      .select('title, content')
      .eq('slug', slug)
      .eq('published', true)
      .single();

    if (error || !letter) return { title: 'Journal | Merkurov' };

    const title = letter.title || 'Intelligence Report';
    let rawText = '';
    try {
        const parsed = typeof letter.content === 'string' ? JSON.parse(letter.content) : letter.content;
        if (Array.isArray(parsed)) {
            rawText = parsed.map((b: any) => b.data?.text || '').join(' ');
        } else if (parsed?.blocks) {
            rawText = parsed.blocks.map((b: any) => b.data?.text || '').join(' ');
        }
    } catch {
        rawText = 'Read the full report.';
    }
    
    const description = rawText.slice(0, 160) || 'Market intelligence and heritage architecture.';
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
    const image = `${site}/default-og.png`;

    return sanitizeMetadata({
      title: `${title}`,
      description,
      openGraph: {
        title,
        description,
        url: `${site}/journal/${slug}`,
        images: [image],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image],
      },
    });
  } catch (e) {
    return { title: 'Journal | Merkurov' };
  }
}

// --- MAIN COMPONENT ---
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

  if (error || !letter) {
    notFound();
  }

  const letterAuthor = Array.isArray(letter.users) ? letter.users[0] : letter.users;
  const dateStr = new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Block Parsing
  let blocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : (parsed.blocks ? parsed.blocks : [parsed]);
  } catch (e) {
    blocks = [];
  }

  return (
    <main className="min-h-screen bg-white text-[#1C1917] selection:bg-red-600 selection:text-white font-serif">
      
      {/* NAVBAR (Sticky, White, Clean) */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 py-4 px-6 md:px-12 flex justify-between items-center transition-all">
        <Link 
          href="/journal" 
          className="group flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-500 hover:text-black transition-colors"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> 
          <span>Journal Index</span>
        </Link>
        <span className="hidden md:block font-mono text-[10px] uppercase text-gray-300 tracking-[0.2em]">
            Merkurov Intelligence
        </span>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        
        {/* ARTICLE HEADER */}
        <header className="mb-16 md:mb-24 text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-red-600">
                System Log
            </span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] mb-8 text-black tracking-tight">
            {letter.title}
          </h1>
          
          {/* Meta Row */}
          <div className="flex justify-center items-center gap-6 border-t border-b border-gray-100 py-4 mt-8">
             <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {dateStr}
             </div>
             <div className="w-px h-3 bg-gray-200"></div>
             <div className="text-xs font-mono uppercase tracking-widest text-gray-900">
                {letterAuthor?.name || 'A. Merkurov'}
             </div>
          </div>
        </header>

        {/* CONTENT BODY */}
        <div className="prose prose-lg md:prose-xl prose-stone max-w-none 
          
          /* Headings */
          prose-headings:font-serif prose-headings:font-medium prose-headings:text-black prose-headings:tracking-tight
          
          /* Paragraphs */
          prose-p:font-serif prose-p:text-gray-800 prose-p:leading-[1.8] prose-p:mb-8
          
          /* Links */
          prose-a:text-red-600 prose-a:no-underline hover:prose-a:underline hover:prose-a:decoration-1 hover:prose-a:underline-offset-4 transition-all
          
          /* Blockquotes */
          prose-blockquote:border-l-2 prose-blockquote:border-red-600 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-2xl prose-blockquote:font-serif prose-blockquote:text-black
          
          /* Code */
          prose-code:font-mono prose-code:text-sm prose-code:bg-gray-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-red-600
          
          /* Images */
          prose-img:rounded-sm prose-img:grayscale hover:prose-img:grayscale-0 prose-img:transition-all prose-img:duration-700
          
          mb-24">
            
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-center py-12">
                 <p className="font-mono text-xs text-gray-400">Content rendering...</p>
              </div>
            )}
            
        </div>

        {/* SIGNATURE */}
        <div className="flex justify-center mb-24 opacity-50">
           <span className="font-serif italic text-2xl">A.M.</span>
        </div>

        {/* COMMENTS SECTION */}
        <section className="border-t border-gray-100 pt-16">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-gray-900">
                 Discussion Protocol
               </h3>
               <MessageSquare size={16} className="text-gray-400" />
            </div>
            
            {/* Чистый контейнер для комментариев */}
            <div className="bg-gray-50/50 rounded-xl p-6 md:p-8">
                <LetterCommentsClient slug={slug} />
            </div>
        </section>

      </article>
    </main>
  );
}
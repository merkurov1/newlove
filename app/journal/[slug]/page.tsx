import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { parseRichTextContent } from '@/lib/contentParser';
import { ArrowLeft, MessageSquare } from 'lucide-react';

// --- METADATA GENERATION (SEO) ---
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

    if (error || !letter) return { title: 'Journal | Anton Merkurov' };

    const title = letter.title || 'Intelligence Report';
    // Парсим контент для description, если он в JSON формате
    let rawText = '';
    try {
        const parsed = typeof letter.content === 'string' ? JSON.parse(letter.content) : letter.content;
        // Простая эвристика для извлечения текста из блоков EditorJS
        if (Array.isArray(parsed)) {
            rawText = parsed.map((b: any) => b.data?.text || '').join(' ');
        }
    } catch {
        rawText = 'Read the full report.';
    }
    
    const description = rawText.slice(0, 160) || 'Market intelligence and heritage architecture.';
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
    const image = `${site}/default-og.png`;

    return sanitizeMetadata({
      title: `${title} | Merkurov Journal`,
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
    return { title: 'Journal | Anton Merkurov' };
  }
}

// --- MAIN PAGE COMPONENT ---
export default async function LetterPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const supabase = createClient();

  // Забираем данные (уже без проверки авторизации для редиректа)
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

  // Парсинг блоков для BlockRenderer
  let blocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch (e) {
    blocks = [];
  }

  return (
    <main className="min-h-screen bg-[#F3E5D8] text-[#1C1917] selection:bg-[#B91C1C] selection:text-white font-serif">
      
      {/* NAVIGATION BAR */}
      <nav className="sticky top-0 z-50 bg-[#F3E5D8]/95 backdrop-blur-sm border-b border-black py-4 px-4 md:px-8 flex justify-between items-center transition-all">
        <Link 
          href="/journal" 
          className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-[#B91C1C] transition-colors"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform"/> 
          <span>Index</span>
        </Link>
        <span className="font-mono text-[10px] uppercase opacity-60 hidden md:block">
            Merkurov Intelligence • {slug}
        </span>
      </nav>

      <article className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-20">
        
        {/* ARTICLE HEADER */}
        <header className="mb-12 md:mb-16 text-center">
          <div className="inline-block border-y border-black py-1 mb-6">
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em]">
                Official Dispatch
            </span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] mb-8 text-[#111]">
            {letter.title}
          </h1>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-6 text-xs font-mono uppercase text-[#57534E] border-t border-black/10 pt-6 max-w-lg mx-auto">
             <div className="flex items-center gap-2">
                <span className="font-bold text-[#1C1917]">{letterAuthor?.name || 'Anton Merkurov'}</span>
             </div>
             <span className="hidden md:block">•</span>
             <time dateTime={letter.publishedAt || letter.createdAt}>
               {dateStr}
             </time>
          </div>
        </header>

        {/* MAIN CONTENT (BlockRenderer) */}
        {/* Стилизация Typography под FT: крупный засечный шрифт, жесткие отступы */}
        <div className="prose prose-lg md:prose-xl prose-stone max-w-none 
          
          /* Headings */
          prose-headings:font-serif prose-headings:font-bold prose-headings:text-[#1C1917] prose-headings:tracking-tight
          
          /* Paragraphs */
          prose-p:font-serif prose-p:text-[#2C2C2C] prose-p:leading-[1.8] prose-p:mb-6
          
          /* Links */
          prose-a:text-[#B91C1C] prose-a:no-underline prose-a:border-b prose-a:border-[#B91C1C]/30 
          hover:prose-a:bg-[#B91C1C] hover:prose-a:text-white hover:prose-a:border-transparent transition-all
          
          /* Blockquotes */
          prose-blockquote:border-l-4 prose-blockquote:border-black prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-2xl prose-blockquote:font-serif prose-blockquote:bg-black/5 prose-blockquote:py-4 prose-blockquote:pr-4
          
          /* Code/Pre */
          prose-code:font-mono prose-code:text-sm prose-code:bg-[#E7E5DE] prose-code:px-1 prose-code:text-[#B91C1C]
          prose-pre:bg-[#1C1917] prose-pre:text-[#F3E5D8]
          
          /* Lists */
          prose-li:marker:text-black
          
          mb-24">
            
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-center py-20 border border-dashed border-black/20">
                 <p className="font-mono text-sm text-gray-500">Content rendering...</p>
              </div>
            )}
            
        </div>

        {/* FOOTER SIGNATURE */}
        <div className="flex justify-center mb-24">
            <div className="text-center">
                <div className="w-16 h-1 bg-black mx-auto mb-4"></div>
                <p className="font-serif italic text-lg">A.M.</p>
            </div>
        </div>

        {/* COMMENTS SECTION */}
        <section className="border-t-4 border-black pt-12">
            <div className="flex items-center gap-3 mb-8">
                <MessageSquare size={20} className="text-[#B91C1C]" />
                <h3 className="text-xl font-bold uppercase tracking-widest">Discussion</h3>
            </div>
            
            {/* Обертка для компонента комментариев, чтобы он выглядел как часть газеты */}
            <div className="bg-[#EAE0D5] border border-black/10 p-4 md:p-8 rounded-sm">
                <LetterCommentsClient slug={slug} />
            </div>
        </section>

      </article>
    </main>
  );
}
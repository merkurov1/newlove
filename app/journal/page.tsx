import NewsletterSubscribe from '@/components/journal/NewsletterSubscribe';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Journal | Merkurov Private Office',
  description: 'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

interface Props {
  searchParams?: { [key: string]: string | string[] | undefined };
}

// Helper to strip HTML/JSON and get plain text for preview
function getPreviewText(content: any, limit = 240) {
  if (!content) return '';
  let text = '';
  
  if (typeof content === 'string') {
    // Try to parse if it's a JSON string (EditorJS)
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json) || (json.blocks && Array.isArray(json.blocks))) {
        const blocks = Array.isArray(json) ? json : json.blocks;
        text = blocks.map((b: any) => b.data?.text || '').join(' ');
      } else {
        text = content; // Just HTML or plain text
      }
    } catch {
      text = content.replace(/<[^>]*>?/gm, ''); // Strip HTML tags
    }
  } else if (typeof content === 'object') {
     // Direct JSON object
     const blocks = Array.isArray(content) ? content : content.blocks || [];
     text = blocks.map((b: any) => b.data?.text || '').join(' ');
  }

  // Clean up and truncate
  const clean = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.substring(0, limit) + '...' : clean;
}

export default async function JournalPage({ searchParams }: Props) {
  let initialLetters: any[] = [];
  try {
    const supabase = createClient();
    // ADDED 'content' and 'summary' to fetch preview text
    const selectCols = 'id, title, slug, content, published, publishedAt, createdAt, authorId';

    const { data: lettersData, error } = await supabase
      .from('letters')
      .select(selectCols as any)
      .eq('published', true)
      // Oldest first (ascending) so chronological reading
      .order('publishedAt', { ascending: true })
      .limit(100);

    if (!error && Array.isArray(lettersData)) {
      initialLetters = lettersData.map((l: any) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        preview: l.summary || getPreviewText(l.content), // Use summary if exists, else parse content
        publishedAt: l.publishedAt,
        author: { name: 'Anton Merkurov' }, // Defaulting for visual consistency
      }));
    }
  } catch (e) {
    console.error('Server initial letters fetch unexpected error', e);
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#1C1917] selection:bg-red-600 selection:text-white pt-20 pb-20">

        {/* Decorative top border (like /advising) */}
        <div className="h-1 w-full bg-black fixed top-0 z-50" />

        {/* HEADER SECTION */}
        <div className="max-w-3xl mx-auto px-6 mb-12 md:mb-20">
          <div className="flex flex-col md:items-end justify-between border-b border-gray-100 pb-8 gap-6">
            <div className="max-w-2xl">
              <span className="block font-mono text-xs text-red-600 uppercase tracking-widest mb-3">
                // System Logs
              </span>
              <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-black leading-none">
                The Journal.
              </h1>
              <p className="mt-4 text-lg text-gray-500 font-serif italic max-w-xl">
                Chronicles of the unframed. Notes on art, tech, and the void.
              </p>
            </div>
          </div>
        </div>

        {/* MAIN GRID LAYOUT */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
            
            {/* LEFT COLUMN: ARTICLES FEED (8 COLS) */}
            <div className="lg:col-span-8">
               {initialLetters.map((article) => (
                 <article key={article.id} className="group cursor-pointer border-b border-gray-100 pb-8 mb-6 last:mb-0">
                    <Link href={`/journal/${article.slug}`} className="block">
                      
                      {/* Meta Data */}
                      <div className="flex items-center gap-3 mb-3 font-mono text-[10px] uppercase tracking-widest text-gray-400">
                        <span>{new Date(article.publishedAt).toLocaleDateString('en-GB')}</span>
                        <span className="w-8 h-[1px] bg-gray-200"></span>
                        <span>Intelligence</span>
                      </div>

                      {/* Title */}
                      <h2 className="text-2xl md:text-4xl font-serif font-medium text-black mb-3 group-hover:text-red-600 transition-colors duration-300 leading-tight">
                        {article.title}
                      </h2>

                      {/* Preview Text */}
                      <p className="text-base md:text-lg text-gray-600 font-serif leading-relaxed mb-4 max-w-2xl">
                        {article.preview}
                      </p>

                      {/* Read More Link */}
                      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b border-black pb-1 group-hover:border-red-600 group-hover:text-red-600 transition-all">
                        Read Dispatch <ArrowRight size={12} />
                      </div>

                    </Link>
                 </article>
               ))}
            </div>


            {/* RIGHT COLUMN: SIDEBAR (4 COLS) - STICKY */}
            <aside className="lg:col-span-4 space-y-12">
               <div className="sticky top-32">
                  
                  {/* NEWSLETTER WIDGET */}
                  <div className="bg-gray-50 border border-gray-100 p-8 mb-12">
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-4">
                      Direct Line
                    </span>
                    <h3 className="font-serif text-2xl text-black mb-2">
                      Private Office Access
                    </h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                      Receive investment memorandums and architectural updates directly to your inbox. No spam. Only signal.
                    </p>
                    <NewsletterSubscribe />
                  </div>

                  {/* NAVIGATION LINKS */}
                  <div className="border-t border-gray-100 pt-8">
                     <span className="block font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-6">
                        Navigation
                     </span>
                     <ul className="space-y-4">
                        <li>
                           <Link href="/silence" className="group flex justify-between items-center text-sm font-bold uppercase tracking-widest hover:text-red-600 transition-colors">
                              <span>Silence Index</span>
                              <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                           </Link>
                        </li>
                        <li>
                           <Link href="/lobby" className="group flex justify-between items-center text-sm font-bold uppercase tracking-widest hover:text-red-600 transition-colors">
                              <span>The Lobby</span>
                              <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                           </Link>
                        </li>
                     </ul>
                  </div>

               </div>
            </aside>

        </div>

    </main>
  );
}
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';

export default async function LetterFullPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Use anon client to check authentication status
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If not authenticated, redirect back to archive
  if (authError || !user) {
    redirect(`/journal/${slug}`);
  }

  // Authenticated: use service-role client for protected reads (joins on User table)
  const supabaseSvc = await createClient({ useServiceRole: true });
  const { data: letter, error } = await supabaseSvc
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

  // Parse stored content (EditorJS-style blocks) into an array for BlockRenderer
  let blocks: any[] = [];
  try {
    const raw =
      typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch (e) {
    blocks = [];
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[#FAF8F5] text-[#1C1A1B] font-serif">
      <div className="w-full max-w-3xl mx-auto min-w-0 px-4 sm:px-6 py-8 sm:py-16">
        <Link
          href="/journal"
          className="inline-flex items-center text-[#5B5658] hover:text-[#7A2233] mb-8 text-sm font-medium transition-colors"
        >
          ← Back to archive
        </Link>
        <article className="mb-12 min-w-0">
          <header className="mb-12 border-b border-[#DAD3CC] pb-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal text-balance break-words text-[#1C1A1B] leading-[1.1] tracking-[-0.02em] mb-6">
              {letter.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-base text-[#5B5658]">
              <span className="font-medium">{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Author'}</span>
              <span>•</span>
              <time dateTime={letter.publishedAt || letter.createdAt} className="text-sm">
                {new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>
          </header>
          <div className="prose prose-xl sm:prose-2xl max-w-none min-w-0 font-serif prose-headings:font-serif prose-headings:font-normal prose-headings:text-[#1C1A1B] prose-p:leading-relaxed prose-p:text-[#33302F] prose-a:text-[#7A2233] prose-a:underline hover:prose-a:opacity-70 prose-strong:text-[#1C1A1B] prose-blockquote:border-[#7A2233] prose-blockquote:text-[#33302F] prose-code:text-base prose-code:bg-[#F1ECE5] prose-code:px-1.5 prose-code:py-1 prose-code:rounded prose-pre:bg-[#1C1A1B] prose-pre:text-[#FAF8F5]">
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-[#5B5658] italic py-8">Letter content not yet added.</div>
            )}
          </div>
        </article>
        <LetterCommentsClient slug={slug} />
      </div>
    </div>
  );
}

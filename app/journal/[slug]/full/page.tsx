import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/journal/LetterCommentsClient';

export default async function LetterFullPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  // Use anon client to check authentication status
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If not authenticated, redirect back to archive
  if (authError || !user) {
    redirect(`/journal/${slug}`);
  }

  // Authenticated: use service-role client for protected reads (joins on User table)
  const supabaseSvc = createClient({ useServiceRole: true });
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
    <div className="min-h-screen bg-white">
      <div className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-16">
        <Link
          href="/journal"
          className="inline-flex items-center text-gray-600 hover:text-black mb-8 text-sm font-medium transition-colors"
        >
          ← Back to archive
        </Link>
        <article className="mb-12">
          <header className="mb-10 border-b border-gray-200 pb-8">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-black leading-tight mb-4">
              {letter.title}
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium">{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Author'}</span>
              <span>•</span>
              <time dateTime={letter.publishedAt || letter.createdAt} className="font-mono text-xs">
                {new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>
          </header>
          <div className="prose prose-lg sm:prose-xl max-w-none prose-headings:font-serif prose-headings:font-bold prose-p:leading-relaxed prose-p:text-gray-800 prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline prose-strong:text-black prose-code:text-sm prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100">
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-gray-500 italic py-8">Letter content not yet added.</div>
            )}
          </div>
        </article>
        <LetterCommentsClient slug={slug} />
      </div>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/letters/LetterCommentsClient';

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
    redirect(`/letters/${slug}`);
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
    console.error('Letter fetch error:', error);
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/letters"
          className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6 text-sm"
        >
          ← Back to archive
        </Link>
        <article className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8 sm:p-12 mb-8">
          <header className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{letter.title}</h1>
            <div className="flex items-center gap-4 text-base text-gray-500">
              <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Author'}</span>
              <span>•</span>
              <time dateTime={letter.publishedAt || letter.createdAt}>
                {new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>
          </header>
          <div className="prose prose-xl max-w-none font-sans">
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

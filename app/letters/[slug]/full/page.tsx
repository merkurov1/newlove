import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import LetterCommentsClient from '@/components/letters/LetterCommentsClient';

export default async function LetterFullPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  // Use anon client to check authentication status
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // If not authenticated, redirect back to archive
  if (authError || !user) {
    redirect(`/letters/${slug}`);
  }

  // Authenticated: use service-role client for protected reads (joins on User table)
  const supabaseSvc = createClient({ useServiceRole: true });

  const { data: letter, error } = await supabaseSvc
    .from('letters')
    .select('id, title, slug, content, published, publishedAt, createdAt, authorId, User!letters_authorId_fkey(name, email)')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !letter) {
    console.error('Letter fetch error:', error);
    notFound();
  }

  const letterAuthor = Array.isArray(letter.User) ? letter.User[0] : letter.User;
  const { data: comments } = await supabaseSvc
    .from('letter_comments')
    .select('id, content, created_at, user_id, author_display, User(name, email)')
    .eq('letter_id', letter.id)
    .eq('is_public', true)
    .order('created_at', { ascending: true });

  // Parse stored content (EditorJS-style blocks) into an array for BlockRenderer
  let blocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    blocks = [];
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/letters" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6 text-sm">← Вернуться к архиву</Link>
        <article className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8 mb-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{letter.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Автор'}</span>
              <span>•</span>
              <time dateTime={letter.publishedAt || letter.createdAt}>{new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </div>
          </header>
          <div className="prose prose-lg max-w-none">
            {blocks && blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content)}</div>
            )}
          </div>
        </article>

        {/* Server-rendered comments teaser. Client component will hide this on hydrate for authenticated users. */}
        <div id={`server-comments-${slug}`} className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Комментарии {comments && comments.length > 0 && `(${comments.length})`}</h2>
          {comments && comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map((comment: any) => {
                const commentUser = Array.isArray(comment.User) ? comment.User[0] : comment.User;
                return (
                  <div key={comment.id} className="border-b border-gray-100 last:border-0 pb-6 last:pb-0">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">{(comment.author_display || commentUser?.name || commentUser?.email)?.[0]?.toUpperCase() || 'U'}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">{comment.author_display || commentUser?.name || commentUser?.email?.split('@')[0] || 'Пользователь'}</span>
                          <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Пока нет комментариев. Будьте первым!</p>
          )}
        </div>

        {/* Client-side comments UI (form + submission). It will hide the server teaser when appropriate. */}
        <div className="mt-6">
          {/* @ts-ignore - render client component in a server component */}
          <LetterCommentsClient slug={slug} serverContainerId={`server-comments-${slug}`} />
        </div>
      </div>
    </div>
  );
}
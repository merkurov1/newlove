import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ReadMoreOrLoginClient from '@/components/letters/ReadMoreOrLoginClient';
import { parseRichTextContent } from '@/lib/contentParser';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const supabase = createClient({ useServiceRole: true });
    const { data: letter, error } = await supabase
      .from('letters')
      .select('title, content')
      .eq('slug', slug)
      .eq('published', true)
      .single();

    if (error || !letter) return { title: 'Письмо | Anton Merkurov' };

    const title = letter.title || 'Письмо';
    const description = String(parseRichTextContent(letter.content || '')).slice(0, 160);
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merkurov.love';
    const image = `${site}/default-og.png`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${site}/letters/${slug}`,
        images: [image],
        type: 'article'
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [image]
      }
    };
  } catch (e) {
    return { title: 'Письмо | Anton Merkurov' };
  }
}

// metadata is provided dynamically via generateMetadata above.

export default async function LetterPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  console.log('Preview user:', user ? user.id : 'no user'); // Debug log for Vercel

  // If user logged in, redirect to full
  if (user) {
    redirect(`/letters/${slug}/full`);
  }

  const supabasePublic = createClient({ useServiceRole: true });
  const { data: letter, error } = await supabasePublic
    .from('letters')
    .select('id, title, slug, content, published, publishedAt, createdAt, authorId, users!letters_authorId_fkey(name, email)')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !letter) {
    console.error('Letter fetch error:', error);
    notFound();
  }

  const letterAuthor = Array.isArray(letter.users) ? letter.users[0] : letter.users;
  const plainContent = parseRichTextContent(letter.content || '');
  const previewContent = plainContent.slice(0, 300);
  const hasMore = plainContent.length > 300;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <article className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{letter.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Автор'}</span>
              <span>•</span>
              <time dateTime={letter.publishedAt || letter.createdAt}>{new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </div>
          </header>
          <div className="prose prose-lg max-w-none">
            <div className="text-gray-700 leading-relaxed">{previewContent}{hasMore && '...'}</div>
          </div>
          {hasMore && (
            <div className="mt-8 pt-8 border-t border-gray-200">
              <ReadMoreOrLoginClient />
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
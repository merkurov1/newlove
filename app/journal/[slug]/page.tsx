import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ReadMoreOrLoginClient from '@/components/journal/ReadMoreOrLoginClient';
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

    if (error || !letter) return { title: 'Letter | Anton Merkurov' };

    const title = letter.title || 'Letter';
    const description = String(parseRichTextContent(letter.content || '')).slice(0, 160);
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
    const image = `${site}/default-og.png`;

    // BreadcrumbList Schema for better SEO
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: site,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Journal',
          item: `${site}/journal`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: title,
          item: `${site}/journal/${slug}`,
        },
      ],
    };

    return {
      title,
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
      other: {
        'script:ld+json:breadcrumb': JSON.stringify(breadcrumbSchema),
      },
    };
  } catch (e) {
    return { title: 'Letter | Anton Merkurov' };
  }
}

// metadata is provided dynamically via generateMetadata above.

export default async function LetterPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user logged in, redirect to full
  if (user) {
    redirect(`/journal/${slug}/full`);
  }

  const supabasePublic = createClient({ useServiceRole: true });
  const { data: letter, error } = await supabasePublic
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
          <div className="prose prose-lg max-w-none">
            {previewContent}
            {hasMore && <ReadMoreOrLoginClient />}
          </div>
        </article>
      </div>
    </div>
  );
}

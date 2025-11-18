import LettersArchive from '@/components/journal/LettersArchive';
import PostcardShop from '@/components/journal/PostcardShop';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ReadMoreOrLoginClient from '@/components/journal/ReadMoreOrLoginClient';
import { parseRichTextContent } from '@/lib/contentParser';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  title: 'Letters & Postcards (combined) | Anton Merkurov',
  description: 'Consolidated version of archive and letters pages for quick browsing',
});

interface Props {
  params?: { slug?: string };
}

// Helper: render archive (copied from app/letters/page.tsx)
function ArchiveView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-8 px-2">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-medium text-gray-900 mb-2">
            4ee Letters & Postcards (Combined)
          </h1>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            Archive of the authors newsletter and order of physical postcards  combined copy
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-blue-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">4e7</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Newsletter Archive</h2>
              </div>
              <LettersArchive />
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-orange-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">3a8</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Original Postcards</h2>
              </div>
              <PostcardShop />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper: preview view (copied from app/letters/[slug]/page.tsx)
async function PreviewView({ slug }: { slug: string }) {
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
              <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Author'}</span>
              <span></span>
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

import { notFound } from 'next/navigation';
import Image from 'next/image';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Markdown from 'markdown-to-jsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug);
  if (!article) {
    return sanitizeMetadata({
      title: 'Not Found',
      description: 'Article not found'
    });
  }

  const artist = article.artist || '';
  const title = article.title || '';
  const fullTitle = [artist, title].filter(Boolean).join(' - ');
  
  // Extract first image for OpenGraph
  function extractFirstImage(content: any): string | null {
    if (!content) return null;
    try {
      const blocks = Array.isArray(content) ? content : JSON.parse(content);
      for (const block of blocks) {
        if (block?.type === 'image' && block?.data?.file?.url) {
          return block.data.file.url;
        }
        if (block?.type === 'richText' && block?.data?.html) {
          const imgMatch = block.data.html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
          if (imgMatch) return imgMatch[1];
        }
      }
    } catch {
      const str = String(content);
      const imgMatch = str.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
      if (imgMatch) return imgMatch[1];
    }
    return null;
  }

  const previewImage = extractFirstImage(article.content);
  const description = article.curatorNote || article.quote || `${artist} - ${title}`;
  const baseUrl = 'https://www.merkurov.love';

  return sanitizeMetadata({
    title: fullTitle || 'Selection',
    description: description.slice(0, 160),
    openGraph: {
      title: fullTitle,
      description: description.slice(0, 160),
      url: `${baseUrl}/${params.slug}`,
      images: previewImage ? [{ url: previewImage }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: description.slice(0, 160),
      images: previewImage ? [previewImage] : [],
    },
  });
}

async function getArticle(slug: string) {
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
  let { supabase } = await getSupabaseForRequest(globalReq) || {};
  if (!supabase) {
    try {
      const serverAuth = await import('@/lib/serverAuth');
      supabase = serverAuth.getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      return null;
    }
  }
  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !article) return null;
  return article;
}

export default async function SelectionArticlePage({ params }: { params: { slug: string } }) {
  const article = await getArticle(params.slug);
  if (!article) return notFound();

  // Destructure fields for layout
  const {
    artist = '',
    title = '',
    quote = '',
    specs = '',
    content = '',
  } = article;
  const curatorNote = article.curatorNote ?? article.curatornote ?? '';

  // Extract first image from content (EditorJS blocks or string)
  function extractFirstImage(content: any): string | null {
    if (!content) return null;
    try {
      // If content is array of EditorJS blocks
      const blocks = Array.isArray(content) ? content : JSON.parse(content);
      for (const block of blocks) {
        if (block?.type === 'image' && block?.data?.file?.url) {
          return block.data.file.url;
        }
        if (block?.type === 'richText' && block?.data?.html) {
          const imgMatch = block.data.html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
          if (imgMatch) return imgMatch[1];
        }
      }
    } catch {
      // Fallback: try as HTML/Markdown string
      const str = String(content);
      const imgMatch = str.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
      if (imgMatch) return imgMatch[1];
      const mdMatch = str.match(/!\[[^\]]*\]\(([^)]+)\)/);
      if (mdMatch) return mdMatch[1];
    }
    return null;
  }

  const previewImage = extractFirstImage(content);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-8 sm:py-16 px-4">
      {/* Component 1: The Visual - Max width 1200px */}
      {previewImage && (
        <div className="w-full max-w-7xl mb-8 sm:mb-12 px-4">
          <Image
            src={previewImage}
            alt={title || artist}
            width={1200}
            height={900}
            className="w-full h-auto object-contain"
            priority
          />
        </div>
      )}
      
      {/* Component 2: The Header - Centered, max-width 800px */}
      <div className="w-full max-w-3xl text-center mb-8 sm:mb-12 px-4">
        {artist && (
          <h1 className="font-serif text-[1.75rem] sm:text-[2.5rem] text-black leading-tight mb-2">{artist}</h1>
        )}
        {title && (
          <h2 className="font-serif italic text-[1.25rem] sm:text-[1.5rem] text-gray-700">{title}</h2>
        )}
      </div>
      
      {/* Component 3: The Essay - Left/Justified, max-width 600px */}
      <div className="w-full max-w-2xl mb-6 px-4">
        {curatorNote && (
          <div className="font-serif text-base sm:text-[1.1rem] leading-[1.7] text-black text-left mb-6 prose prose-base sm:prose-lg">
            <Markdown>{curatorNote}</Markdown>
          </div>
        )}
        {quote && (
          <blockquote className="font-serif italic text-base sm:text-[1.1rem] leading-[1.7] text-gray-700 border-l-2 border-gray-300 pl-4 sm:pl-6 my-6">
            {quote}
          </blockquote>
        )}
      </div>
      
      {/* Component 4: The Data - Monospace, small, max-width 600px */}
      {specs && (
        <>
          <div className="w-full max-w-2xl border-t border-gray-200 my-6 px-4"></div>
          <div className="w-full max-w-2xl mb-12 px-4">
            <div className="font-mono text-sm sm:text-[0.9rem] text-gray-600 prose prose-sm">
              <Markdown>{specs}</Markdown>
            </div>
          </div>
        </>
      )}
      
      {/* Call to Action */}
      <div className="w-full max-w-2xl text-center px-4">
        <a
          href="mailto:merkurov@gmail.com?subject=Enquiry about artwork"
          className="inline-block text-sm font-semibold text-blue-700 hover:underline"
        >
          Enquire about this work →
        </a>
      </div>
    </div>
  );
}

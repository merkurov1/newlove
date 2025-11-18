import { notFound } from 'next/navigation';
import Image from 'next/image';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  // Optionally, fetch metadata for SEO
  return sanitizeMetadata({
    title: 'Selection',
    description: 'Curated selection of works and articles.'
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
    <div className="min-h-screen bg-white flex flex-col items-center py-10 px-2">
      {/* Hero Image */}
      {previewImage ? (
        <div className="w-full flex justify-center mb-8">
          <div className="w-full max-w-4xl" style={{ width: '80vw' }}>
            <Image
              src={previewImage}
              alt={title || artist}
              width={1200}
              height={900}
              className="w-full h-auto object-contain rounded-none shadow-none"
              priority
            />
          </div>
        </div>
      ) : (
        <div className="w-full flex justify-center mb-8">
          <div className="w-full max-w-4xl flex items-center justify-center text-gray-300 text-6xl" style={{ width: '80vw', height: 300 }}>
            —
          </div>
        </div>
      )}
      {/* Heading */}
      <div className="text-center mb-6">
        {artist && (
          <div className="font-serif text-[2.5rem] text-black leading-tight">{artist}</div>
        )}
        {title && (
          <div className="font-serif italic text-[1.5rem] text-neutral-700 mt-2">{title}</div>
        )}
      </div>
      {/* Curator's Note */}
      <div className="w-full flex justify-center mb-8">
        <div className="max-w-xl w-full font-serif text-[1.1rem] leading-[1.6] text-neutral-900 text-justify">
          {curatorNote && <div className="whitespace-pre-wrap">{curatorNote}</div>}
          {quote && (
            <blockquote className="italic border-l-4 border-neutral-300 pl-4 my-6 text-neutral-700">
              {quote}
            </blockquote>
          )}
        </div>
      </div>
      {/* Specs */}
      {specs && (
        <div className="mt-2 mb-8 text-[0.85rem] font-mono text-[#555] text-center whitespace-pre-wrap">
          {specs}
        </div>
      )}
      {/* Call to Action */}
      <div className="mt-10 mb-2">
        <a
          href="mailto:studio@merkurov.love?subject=Enquiry about artwork"
          className="text-base font-semibold text-blue-700 hover:underline"
        >
          Enquire about this work &rarr;
        </a>
      </div>
    </div>
  );
}

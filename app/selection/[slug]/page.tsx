
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
    preview_image,
    artist = '',
    title = '',
    quote = '',
    specs = '',
  } = article;
    const content = article.content ?? '';
    const curatorNote = article.curatorNote ?? article.curatornote ?? '';

  // Extract first image from content if preview_image is missing
  function extractFirstImage(content: string): string | null {
    if (!content) return null;
    // HTML <img src="...">
    const imgMatch = content.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
    if (imgMatch) return imgMatch[1];
    // Markdown ![](url)
    const mdMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    return null;
  }

    const previewImage = preview_image || extractFirstImage(content);

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
              onError={(e) => {
                // @ts-ignore
                e.currentTarget.style.display = 'none';
                // @ts-ignore
                if (e.currentTarget.parentElement) {
                  e.currentTarget.parentElement.innerHTML = '<div class=\'w-full h-full flex items-center justify-center text-gray-300 text-6xl\'>—</div>';
                }
              }}
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
          {curatorNote && <div>{curatorNote}</div>}
          {quote && (
            <blockquote className="italic border-l-4 border-neutral-300 pl-4 my-6 text-neutral-700">
              {quote}
            </blockquote>
          )}
        </div>
      </div>
      {/* Specs */}
      {specs && (
        <div className="mt-2 mb-8 text-[0.85rem] font-mono text-[#555] text-center whitespace-pre-line">
          {specs.split('|').map((line: string, i: number) => (
            <span key={i}>
              {line.trim()}
              {i < specs.split('|').length - 1 && <span className="mx-2">|</span>}
            </span>
          ))}
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

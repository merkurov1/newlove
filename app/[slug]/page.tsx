import { safeData } from '@/lib/safeSerialize';
import { pageMetadata, description as seoDescription, truncate, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { notFound } from 'next/navigation';
import Markdown from 'markdown-to-jsx';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import { attachTagsToArticles } from '@/lib/attachTagsToArticles';
import BlockRenderer from '@/components/BlockRenderer';
import SocialShare from '@/components/SocialShare';
import EditButton from '@/components/EditButton';
import { EditProvider } from '@/components/EditContext';
import DebugEditButton from '@/components/DebugEditButton';
import type { Metadata } from 'next';

const RelatedArticles = dynamic(() => import('@/components/RelatedArticles'), { ssr: false });

type ContentResult = {
  type: 'article' | 'project';
  content: any;
} | null;

async function getContent(slug: string): Promise<ContentResult> {
  // Исключаем статические маршруты
  const staticRoutes = [
    'admin',
    'api',
    'articles',
    'auth',
    'digest',
    'isakeyforall',
    'profile',
    'projects',
    'rss.xml',
    'selection',
    'sentry-example-page',
    'tags',
    'users',
    'you',
    'roles-demo',
  ];
  if (staticRoutes.includes(slug)) {
    return null;
  }

  try {
    // Сначала ищем статью (используем server service-role client для публичных запросов,
    // чтобы RLS для request-scoped клиентов не блокировал доступ к опубликованным материалам)
    let article = null;
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      const srv = getServerSupabaseClient({ useServiceRole: true });
      const { data, error } = await srv
        .from('articles')
        .select('*, author:authorId(name)')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();
      if (data) {
        // attach tags via helper if nested relation not available
        const attached = await attachTagsToArticles(srv, Array.isArray(data) ? data : [data]);
        article = Array.isArray(attached)
          ? attached[0] || null
          : attached && attached[0]
            ? attached[0]
            : Array.isArray(data)
              ? data[0]
              : data;
      }
    } catch (e) {
      // Silent failure for articles
    }

    if (article) {
      return { type: 'article', content: safeData(article) };
    }

    // Если статья не найдена, ищем проект (используем service-role client для публичных проектов)
    let project = null;
    if (!article) {
      try {
        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const srv = getServerSupabaseClient({ useServiceRole: true });
        const { data: p } = await srv
          .from('projects')
          .select('*')
          .eq('slug', slug)
          .eq('published', true)
          .maybeSingle();
        project = p;
      } catch (e) {
        project = null;
      }
    }

    if (project) {
      return { type: 'project', content: safeData(project) };
    }

    return null;
  } catch (error) {
    throw error;
  }
}

function getStructuredData(
  type: string,
  content: any,
  previewImage: string | null,
  description: string
) {
  const baseUrl = 'https://www.merkurov.love';
  let jsonLd: any = null;
  let breadcrumbSchema: any = null;

  if (type === 'article') {
    const artist = content.artist || '';
    const articleTitle = content.title || '';
    const fullTitle = [artist, articleTitle].filter(Boolean).join(' — ');

    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: fullTitle || content.title,
      author: {
        '@type': 'Person',
        name: content.author?.name || 'Anton Merkurov',
        url: baseUrl,
      },
      datePublished: content.publishedAt,
      dateModified: content.updatedAt || content.publishedAt,
      image: previewImage ? [previewImage] : ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png'],
      description: description,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${baseUrl}/${content.slug}`,
      },
      publisher: {
        '@id': 'https://www.merkurov.love/#person',
      },
      articleSection: content.tags?.[0]?.name || 'Editorial',
      keywords: content.tags?.map((t: any) => t.name).join(', ') || '',
      inLanguage: content.lang || 'en',
    };

    breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Главная',
          item: baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Selection',
          item: `${baseUrl}/selection`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: content.title,
          item: `${baseUrl}/${content.slug}`,
        },
      ],
    };
  } else if (type === 'project') {
    const isServicePage = content.slug === 'advising';
    const isAboutPage = content.slug === 'isakeyforall';

    if (isServicePage) {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: content.title,
        description: description,
        provider: {
          '@type': 'Person',
          name: 'Anton Merkurov',
          url: baseUrl,
        },
        image: previewImage || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        url: `${baseUrl}/${content.slug}`,
        serviceType: 'Art & Heritage Consulting',
        areaServed: {
          '@type': 'Place',
          name: 'Worldwide',
        },
      };
    } else if (isAboutPage) {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: content.title,
        description: description,
        url: `${baseUrl}/${content.slug}`,
        mainEntity: {
          '@type': 'Person',
          name: 'Anton Merkurov',
          url: baseUrl,
          description: description,
          image: previewImage || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        },
      };
    } else {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: content.title,
        description: description,
        url: `${baseUrl}/${content.slug}`,
        image: previewImage ? [previewImage] : [DEFAULT_OG_IMAGE],
        author: {
          '@type': 'Person',
          name: 'Anton Merkurov',
          url: baseUrl,
        },
        datePublished: content.publishedAt,
        dateModified: content.updatedAt || content.publishedAt,
        inLanguage: content.lang || 'en',
      };
    }

    breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Главная',
          item: baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: content.title,
          item: `${baseUrl}/${content.slug}`,
        },
      ],
    };
  }

  return { jsonLd, breadcrumbSchema };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const path = `/${encodeURIComponent(params.slug)}`;

  try {
    const result = await getContent(params.slug);
    if (!result) {
      return pageMetadata({
        title: 'Page not found | Anton Merkurov',
        description: 'The requested page could not be found on merkurov.love.',
        path,
        noindex: true,
      });
    }
    const { type, content } = result;
    const previewImage = content.content ? await getFirstImage(content.content) : null;
    const summary = seoDescription(
      content.content ? generateDescription(content.content) : content.title || 'Anton Merkurov',
    );
    const displayTitle = truncate(
      type === 'article' && content.artist
        ? [content.artist, content.title].filter(Boolean).join(' — ')
        : content.title || 'Anton Merkurov',
      60,
    );

    return pageMetadata({
      title: displayTitle,
      description: summary,
      path,
      type: type === 'article' ? 'article' : 'website',
      image: previewImage || undefined,
      imageAlt: displayTitle,
      publishedTime: content.publishedAt || undefined,
      modifiedTime: content.updatedAt || content.publishedAt || undefined,
      authors: ['Anton Merkurov'],
    });
  } catch {
    return pageMetadata({
      title: 'Anton Merkurov — Art, Love & Money',
      description: 'The official website of Anton Merkurov: art, heritage, advising and digital projects.',
      path,
    });
  }
}

export default async function ContentPage({ params }: { params: { slug: string } }) {
  const result = await getContent(params.slug);
  if (!result) notFound();
  const { type, content } = result;

  const previewImage = content.content ? await getFirstImage(content.content) : null;
  const description = content.content
    ? generateDescription(content.content)
    : content.title || 'Anton Merkurov';
  const { jsonLd, breadcrumbSchema } = getStructuredData(type, content, previewImage, description);

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      {type !== 'article' ? (
        <ProjectComponent project={content} />
      ) : (
        <ArticleComponent article={content} />
      )}
    </>
  );
}

function ArticleComponent({ article }: { article: any }) {
  const {
    artist = '',
    title = '',
    quote = '',
    specs = '',
    content = '',
  } = article;
  const curatorNote = article.curatorNote ?? article.curatornote ?? '';

  // Sanitize hrefs coming from potentially messy editor text.
  // Fixes cases where smart quotes or malformed slashes are included around URLs
  // (e.g. “https:/www.example.com” -> https://www.example.com).
  // This sanitizer is applied only to the web Markdown renderer so it doesn't
  // affect email rendering logic.
  function sanitizeHref(href?: string | null) {
    if (!href) return href || '';
    let s = String(href).trim();
    // Remove smart quotes and common directional quotes
    s = s.replace(/^[\u2018\u2019\u201C\u201D\u00AB\u00BB]+/, '').replace(/[\u2018\u2019\u201C\u201D\u00AB\u00BB]+$/, '');
    // Remove surrounding ASCII quotes
    s = s.replace(/^['"`]+/, '').replace(/['"`]+$/, '');
    // Fix common single-slash typo "https:/example.com" -> "https://example.com"
    s = s.replace(/^https?:\/([^\/])/, (m, p1) => m.replace(/:\//, '://'));
    // Ensure protocol present for obvious http(s) urls
    if (/^https?:\/\//i.test(s)) return s;
    // If it looks like a site (starts with www.) add protocol
    if (/^www\./i.test(s)) return 'https://' + s;
    return s;
  }

  // Extract first image from content (EditorJS blocks or string)
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
      const mdMatch = str.match(/!\[[^\]]*\]\(([^)]+)\)/);
      if (mdMatch) return mdMatch[1];
    }
    return null;
  }

  const previewImage = extractFirstImage(content);

  // Normalize preview URL to collapse duplicate slashes (preserve protocol)
  let normalizedPreview = previewImage;
  try {
    if (normalizedPreview && typeof normalizedPreview === 'string') {
      normalizedPreview = normalizedPreview.replace(/([^:]\/)\/+/g, '$1');
    }
  } catch (e) {
    normalizedPreview = previewImage;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-8 sm:py-16 px-4">
      {/* Component 1: The Visual - Max width 1200px */}
      {normalizedPreview && (
        <div className="w-full max-w-7xl mb-8 sm:mb-12 px-4">
          <Image
            src={normalizedPreview}
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
            <Markdown options={{ overrides: { a: { component: ({ href, children, ...rest }: any) => {
                const safe = sanitizeHref(href);
                return <a href={safe} {...rest}>{children}</a>;
              } } } }}>{curatorNote}</Markdown>
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
              <Markdown options={{ overrides: { a: { component: ({ href, children, ...rest }: any) => {
                    const safe = sanitizeHref(href);
                    return <a href={safe} {...rest}>{children}</a>;
                  } } } }}>{specs}</Markdown>
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

function ProjectComponent({ project }: { project: any }) {
  let blocks = [];
  try {
    if (project.content) {
      const raw =
        typeof project.content === 'string' ? project.content : JSON.stringify(project.content);
      const parsed = JSON.parse(raw);
      blocks = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    }
  } catch (error) {
    blocks = [];
  }

  return (
    <EditProvider
      value={{
        contentType: 'project',
        contentId: project.id,
        slug: project.slug,
        title: project.title,
        isEditable: true,
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article>
          <header className="mb-8">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 flex-1">
                {project.title}
              </h1>
              <EditButton variant="inline" showLabel={true} className="ml-4 flex-shrink-0" />
            </div>
          </header>

          <div className="prose prose-xl max-w-none">
            {blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-gray-500 italic py-8">Содержимое проекта пока не добавлено.</div>
            )}
          </div>
        </article>

        {/* Floating Edit Button - автоматически получает контекст */}
        <EditButton variant="floating" />
        <DebugEditButton />
      </div>
    </EditProvider>
  );
}

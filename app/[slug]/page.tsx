import { safeData } from '@/lib/safeSerialize';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { notFound } from 'next/navigation';
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

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const result = await getContent(params.slug);
    if (!result) {
      return { title: 'Не найдено' };
    }
    const { type, content } = result;
    const previewImage = content.content ? await getFirstImage(content.content) : null;
    const description = content.content
      ? generateDescription(content.content)
      : content.title || 'Описание недоступно';
    const baseUrl = 'https://www.merkurov.love';

    // JSON-LD для Article и Project
    let jsonLd = null;
    let breadcrumbSchema = null;

    if (type === 'article') {
      // Enhanced Article Schema
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: content.title,
        author: {
          '@type': 'Person',
          name: content.author?.name || 'Anton Merkurov',
          url: baseUrl,
        },
        datePublished: content.publishedAt,
        dateModified: content.updatedAt || content.publishedAt,
        image: previewImage ? [previewImage] : [],
        description: description,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${baseUrl}/${content.slug}`,
        },
        publisher: {
          '@type': 'Person',
          name: 'Anton Merkurov',
          logo: {
            '@type': 'ImageObject',
            url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png',
            width: 64,
            height: 64,
          },
        },
        articleSection: content.tags?.[0]?.name || 'Blog',
        keywords: content.tags?.map((t: any) => t.name).join(', ') || '',
        inLanguage: 'ru-RU',
      };

      // BreadcrumbList Schema for better Google display
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
            name: 'Статьи',
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
      // WebPage/Service Schema for projects (about, services pages)
      const isServicePage = content.slug === 'advising';
      const isAboutPage = content.slug === 'isakeyforall';

      if (isServicePage) {
        // Service/Offer Schema for advising page
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
          image: previewImage || `${baseUrl}/default-og.png`,
          url: `${baseUrl}/${content.slug}`,
          serviceType: 'Consulting',
          areaServed: {
            '@type': 'Place',
            name: 'Worldwide',
          },
        };
      } else if (isAboutPage) {
        // AboutPage Schema
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
            image: previewImage || `${baseUrl}/default-og.png`,
          },
        };
      } else {
        // Generic WebPage for other projects
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: content.title,
          description: description,
          url: `${baseUrl}/${content.slug}`,
          image: previewImage ? [previewImage] : [],
          author: {
            '@type': 'Person',
            name: 'Anton Merkurov',
            url: baseUrl,
          },
          datePublished: content.publishedAt,
          dateModified: content.updatedAt || content.publishedAt,
          inLanguage: 'ru-RU',
        };
      }

      // BreadcrumbList for projects
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
            name: 'Проекты',
            item: `${baseUrl}/projects`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: content.title,
            item: `${baseUrl}/${content.slug}`,
          },
        ],
      };
    }

    // Normalize preview image URL to avoid double-slashes which may confuse some crawlers
    let normalizedPreview = previewImage || null;
    try {
      if (normalizedPreview && typeof normalizedPreview === 'string') {
        normalizedPreview = normalizedPreview.replace(/([^:\/]\/)\//g, '$1');
        // ensure absolute URL
        if (!/^https?:\/\//i.test(normalizedPreview))
          normalizedPreview = `${baseUrl}/${normalizedPreview.replace(/^\//, '')}`;
      }
    } catch (e) {
      normalizedPreview = previewImage;
    }

    const meta = {
      title: content.title,
      description: description,
      openGraph: {
        title: content.title,
        description: description,
        url: `${baseUrl}/${content.slug}`,
        images: normalizedPreview ? [{ url: normalizedPreview }] : [],
        type: type === 'article' ? 'article' : 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: content.title,
        description: description,
        images: normalizedPreview ? [normalizedPreview] : [],
      },
      other: {
        ...(jsonLd && { 'script:ld+json:content': JSON.stringify(jsonLd) }),
        ...(breadcrumbSchema && { 'script:ld+json:breadcrumb': JSON.stringify(breadcrumbSchema) }),
      },
    };

    // Ensure metadata contains only serializable values (no React elements/functions)
    return sanitizeMetadata(meta);
  } catch (error) {
    return {
      title: 'Ошибка загрузки',
      description: 'Произошла ошибка при загрузке метаданных',
    };
  }
}

export default async function ContentPage({ params }: { params: { slug: string } }) {
  const result = await getContent(params.slug);
  if (!result) notFound();
  const { type, content } = result;
  if (type !== 'article') return <ProjectComponent project={content} />;
  return <ArticleComponent article={content} />;
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
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 flex-1">
                {project.title}
              </h1>
              <EditButton variant="inline" showLabel={true} className="ml-4 flex-shrink-0" />
            </div>
          </header>

          <div className="prose prose-lg max-w-none">
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

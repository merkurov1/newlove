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
  let blocks = [];
  try {
    if (article.content) {
      const raw =
        typeof article.content === 'string' ? article.content : JSON.stringify(article.content);
      const parsed = JSON.parse(raw);
      blocks = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    }
  } catch (error) {
    blocks = [];
  }

  return (
    <EditProvider
      value={{
        contentType: 'article',
        contentId: article.id,
        slug: article.slug,
        title: article.title,
        isEditable: true,
      }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article>
          <header className="mb-8">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 flex-1">
                {article.title}
              </h1>
              <EditButton variant="inline" showLabel={true} className="ml-4 flex-shrink-0" />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0 text-sm text-gray-600 mb-6">
              {article.author?.image && (
                <Image
                  src={article.author.image}
                  alt={article.author.name || 'Автор'}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span>Автор: {article.author?.name || 'Неизвестен'}</span>
              <span>•</span>
              <time dateTime={article.createdAt}>
                {new Date(article.createdAt).toLocaleDateString('ru-RU')}
              </time>
            </div>

            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {article.tags.map((tag: any) => (
                  <Link
                    key={tag.id}
                    href={`/tags/${tag.name}`}
                    className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full hover:bg-blue-200"
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            )}
          </header>

          <div className="prose prose-lg max-w-none">
            {blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-gray-500 italic py-8">Содержимое статьи пока не добавлено.</div>
            )}
          </div>

          <SocialShare
            title={article.title}
            url={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/${article.slug}`}
            description={generateDescription(article.content)}
          />
        </article>

        {/* Related Articles */}
        <RelatedArticles currentArticleId={article.id} tags={article.tags} limit={3} />

        {/* Floating Edit Button - автоматически получает контекст */}
        <EditButton variant="floating" />
        <DebugEditButton />
      </div>
    </EditProvider>
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

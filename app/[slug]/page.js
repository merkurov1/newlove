// app/[slug]/page.js
// helper will be dynamically imported inside getContent to avoid bundler/circular issues
import { safeData, safeLogError } from '@/lib/safeSerialize';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import Image from 'next/image';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import BlockRenderer from '@/components/BlockRenderer';
import SocialShare from '@/components/SocialShare';
import EditButton from '@/components/EditButton';
import { EditProvider } from '@/components/EditContext';
import DebugEditButton from '@/components/DebugEditButton';

async function getContent(slug) {
  console.log('🔍 getContent called for slug:', slug);
  
  // Исключаем статические маршруты
  const staticRoutes = ['admin', 'api', 'articles', 'auth', 'digest', 'profile', 'projects', 'rss.xml', 'sentry-example-page', 'tags', 'talks', 'users', 'you', 'roles-demo'];
  if (staticRoutes.includes(slug)) {
    console.log('⏭️ Skipping static route:', slug);
    return null;
  }
  
  try {
    console.log('📰 Searching for article with slug:', slug);
    // Use server-side Supabase client for public content lookup
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient();
    let article = null;
    if (serverSupabase) {
      // Fetch article from canonical plural table name
      const { data, error } = await serverSupabase.from('articles').select('*').eq('slug', slug).eq('published', true).maybeSingle();
      if (error) {
        safeLogError('Supabase fetch article error', error);
      } else if (data) {
        article = data;

        // Fetch tags via junction table _ArticleToTag -> Tag
        try {
          const { data: rels, error: relErr } = await serverSupabase.from('_ArticleToTag').select('A').eq('B', null).eq('A', data.id);
          // The above query is defensive; if the junction table uses columns A (entity) and B (tag)
          // we select B values by querying where A = article.id. Some deployments might differ;
          // fall back to a safer two-step approach below if rels is empty or errored.
        } catch (e) {
          // ignore tag fetch errors for stability — tags are optional
          safeLogError('Error fetching tags (first attempt)', e);
        }

        try {
          // Better: fetch tag ids from junction and then the Tag rows
          const { data: tagLinks } = await serverSupabase.from('_ArticleToTag').select('B').eq('A', data.id);
          const tagIds = (tagLinks || []).map(r => r.B).filter(Boolean);
          if (tagIds.length > 0) {
            const { data: tags } = await serverSupabase.from('Tag').select('id,name,slug').in('id', tagIds);
            article.tags = tags || [];
          } else {
            article.tags = [];
          }
        } catch (e) {
          safeLogError('Error fetching tags for article', e);
          article.tags = [];
        }
      }
    }
    
    if (article) {
      console.log('✅ Found article:', article.title);
      return { type: 'article', content: safeData(article) };
    }
    
    console.log('📁 Searching for project with slug:', slug);
    // Если статья не найдена, ищем проект
    let project = null;
    if (!article && serverSupabase) {
  const { data: p, error: pErr } = await serverSupabase.from('projects').select('*').eq('slug', slug).eq('published', true).maybeSingle();
  if (pErr) safeLogError('Supabase fetch project error', pErr);
      project = p;
    }
    
    if (project) {
      console.log('✅ Found project:', project.title);
      return { type: 'project', content: safeData(project) };
    }
    
    console.log('❌ No content found for slug:', slug);
    return null;
  } catch (error) {
    safeLogError('💥 Error in getContent', error);
    throw error;
  }
}

export async function generateMetadata({ params }) {
  console.log('🏷️ generateMetadata called for slug:', params.slug);
  
  try {
    const result = await getContent(params.slug);
    if (!result) {
      return { title: 'Не найдено' };
    }
    const { type, content } = result;
    const previewImage = content.content ? await getFirstImage(content.content) : null;
    const description = content.content ? generateDescription(content.content) : (content.title || 'Описание недоступно');
    const baseUrl = 'https://merkurov.love';

    // JSON-LD для Article
    let jsonLd = null;
    if (type === 'article') {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': content.title,
        'author': { '@type': 'Person', 'name': content.author?.name || 'Anton Merkurov' },
        'datePublished': content.publishedAt,
        'dateModified': content.updatedAt || content.publishedAt,
        'image': previewImage ? [previewImage] : [],
        'description': description,
        'mainEntityOfPage': `${baseUrl}/${content.slug}`,
        'publisher': {
          '@type': 'Organization',
          'name': 'Anton Merkurov',
          'logo': {
            '@type': 'ImageObject',
            'url': 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png'
          }
        }
      };
    }

    return {
      title: content.title,
      description: description,
      openGraph: {
        title: content.title,
        description: description,
        url: `${baseUrl}/${content.slug}`,
        images: previewImage ? [{ url: previewImage }] : [],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: content.title,
        description: description,
        images: previewImage ? [previewImage] : [],
      },
      ...(jsonLd && {
        other: {
          'application/ld+json': JSON.stringify(jsonLd)
        }
      })
    };
  } catch (error) {
    return { 
      title: 'Ошибка загрузки',
      description: 'Произошла ошибка при загрузке метаданных'
    };
  }
}


// Динамический импорт клиентского компонента


export default async function ContentPage({ params }) {
  const result = await getContent(params.slug);
  if (!result) notFound();
  const { type, content } = result;
  if (type !== 'article') return <ProjectComponent project={content} />;
  return <ArticleComponent article={content} />;
}


function ArticleComponent({ article }) {
  console.log('📰 Rendering ArticleComponent:', article.title);
  
  let blocks = [];
  try {
    if (article.content) {
      const raw = typeof article.content === 'string' ? article.content : JSON.stringify(article.content);
      const parsed = JSON.parse(raw);
      blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      console.log('📦 Parsed article blocks:', blocks.length, 'blocks');
    } else {
      console.log('⚠️ No content found for article');
    }
  } catch (error) {
    console.error('💥 Error parsing article content:', error);
    console.log('📋 Raw content:', article.content);
    blocks = [];
  }

  return (
    <EditProvider value={{ 
      contentType: 'article', 
      contentId: article.id, 
      slug: article.slug,
      title: article.title,
      isEditable: true 
    }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article>
          <header className="mb-8">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 flex-1">{article.title}</h1>
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
                {article.tags.map((tag) => (
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
              <div className="text-gray-500 italic py-8">
                Содержимое статьи пока не добавлено.
              </div>
            )}
          </div>
          
          <SocialShare 
            title={article.title}
            url={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/${article.slug}`}
            description={generateDescription(article.content)}
          />
        </article>
        
        {/* Floating Edit Button - автоматически получает контекст */}
        <EditButton variant="floating" />
        <DebugEditButton />
      </div>
    </EditProvider>
  );
}

function ProjectComponent({ project }) {
  console.log('📁 Rendering ProjectComponent:', project.title);
  
  let blocks = [];
  try {
    if (project.content) {
      const raw = typeof project.content === 'string' ? project.content : JSON.stringify(project.content);
      const parsed = JSON.parse(raw);
      blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      console.log('📦 Parsed project blocks:', blocks.length, 'blocks');
    } else {
      console.log('⚠️ No content found for project');
    }
  } catch (error) {
    console.error('💥 Error parsing project content:', error);
    console.log('📋 Raw content:', project.content);
    blocks = [];
  }

  return (
    <EditProvider value={{ 
      contentType: 'project', 
      contentId: project.id, 
      slug: project.slug,
      title: project.title,
      isEditable: true 
    }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article>
          <header className="mb-8">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 flex-1">{project.title}</h1>
              <EditButton variant="inline" showLabel={true} className="ml-4 flex-shrink-0" />
            </div>
          </header>
          
          <div className="prose prose-lg max-w-none">
            {blocks.length > 0 ? (
              <BlockRenderer blocks={blocks} />
            ) : (
              <div className="text-gray-500 italic py-8">
                Содержимое проекта пока не добавлено.
              </div>
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
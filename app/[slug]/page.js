// app/[slug]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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
    // Сначала ищем статью
    const article = await prisma.article.findUnique({
      where: { slug: slug, published: true },
      include: {
        author: { select: { name: true, image: true } },
        tags: true,
      },
    });
    
    if (article) {
      console.log('✅ Found article:', article.title);
      return { type: 'article', content: article };
    }
    
    console.log('📁 Searching for project with slug:', slug);
    // Если статья не найдена, ищем проект
    const project = await prisma.project.findUnique({
      where: { slug: slug, published: true }
    });
    
    if (project) {
      console.log('✅ Found project:', project.title);
      return { type: 'project', content: project };
    }
    
    console.log('❌ No content found for slug:', slug);
    return null;
  } catch (error) {
    console.error('💥 Error in getContent:', error);
    throw error;
  }
}

export async function generateMetadata({ params }) {
  console.log('🏷️ generateMetadata called for slug:', params.slug);
  
  try {
    const result = await getContent(params.slug);
    if (!result) {
      console.log('❌ No metadata result found');
      return { title: 'Не найдено' };
    }
    
    const { type, content } = result;
    console.log('✅ Generating metadata for:', { type, title: content.title });
    
    const previewImage = content.content ? await getFirstImage(content.content) : null;
    const description = content.content ? generateDescription(content.content) : (content.title || 'Описание недоступно');
    const baseUrl = 'https://merkurov.love';

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
    };
  } catch (error) {
    console.error('💥 Error in generateMetadata:', error);
    return { 
      title: 'Ошибка загрузки',
      description: 'Произошла ошибка при загрузке метаданных'
    };
  }
}

export default async function ContentPage({ params }) {
  console.log('🚀 ContentPage called with params:', params);
  
  try {
    const result = await getContent(params.slug);
    
    if (!result) {
      console.log('❌ No result found, calling notFound()');
      notFound();
    }
    
    const { type, content } = result;
    console.log('✅ Rendering content:', { type, title: content.title });
    
    if (type === 'article') {
      return <ArticleComponent article={content} />;
    } else {
      return <ProjectComponent project={content} />;
    }
  } catch (error) {
    console.error('💥 Error in ContentPage:', error);
    return (
      <div className="max-w-2xl mx-auto mt-16 p-6 bg-red-50 text-red-700 rounded shadow text-center">
        <h1 className="text-2xl font-bold mb-2">Ошибка загрузки</h1>
        <p>Произошла ошибка при загрузке содержимого: {error.message}</p>
        <pre className="mt-4 text-xs overflow-auto bg-red-100 p-2 rounded">
          {error.stack}
        </pre>
      </div>
    );
  }
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
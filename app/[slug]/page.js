import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

// Эта функция не меняется, она по-прежнему определяет тип контента
async function getContent(slug) {
  try {
    const project = await prisma.project.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (project) return { type: 'project', data: project };

    const article = await prisma.article.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (article) return { type: 'article', data: article };
    
    return null;
  } catch (error) {
    console.error(`!!! Ошибка при загрузке контента для slug [${slug}]:`, error);
    return null;
  }
}

// <<< 1. КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ЗДЕСЬ >>>
// Компонент теперь принимает `type`, чтобы знать, что отображать
function ContentDisplay({ content, type }) {
  const { title, publishedAt, content: htmlContent, author } = content;

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-8">{title}</h1>
      
      {/* <<< 2. УСЛОВНЫЙ РЕНДЕРИНГ >>>
          Этот блок с автором и датой будет показан ТОЛЬКО если type === 'article' */}
      {type === 'article' && (
        <div className="flex items-center space-x-4 mb-8 text-gray-500">
          {author.image && (
            <Image src={author.image} alt={author.name || ''} width={40} height={40} className="w-10 h-10 rounded-full" />
          )}
          <span>{author.name}</span>
          {publishedAt && (
              <>
                  <span>&middot;</span>
                  <time dateTime={publishedAt.toISOString()}>
                  {new Date(publishedAt).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                  })}
                  </time>
              </>
          )}
        </div>
      )}
      
      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {markdownContent}
        </ReactMarkdown>
      </div>
    </article>
  );
}

export default async function SlugPage({ params }) {
  const result = await getContent(params.slug);

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-8">{title}</h1>
      {type === 'article' && (
        <div className="flex items-center space-x-4 mb-8 text-gray-500">
          {author.image && (
            <Image src={author.image} alt={author.name || ''} width={40} height={40} className="w-10 h-10 rounded-full" />
          )}
          <span>{author.name}</span>
          {publishedAt && (
              <>
                  <span>&middot;</span>
                  <time dateTime={publishedAt.toISOString()}>
                  {new Date(publishedAt).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                  })}
                  </time>
              </>
          )}
        </div>
      )}
      <div className="prose lg:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </article>
  );



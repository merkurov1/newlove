import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

// Эта функция будет искать контент сначала среди проектов, потом среди статей
async function getContent(slug) {
  try {
    // 1. Ищем проект с таким slug
    const project = await prisma.project.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (project) return { type: 'project', data: project };

    // 2. Если проект не найден, ищем статью
    const article = await prisma.article.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (article) return { type: 'article', data: article };
    
    // 3. Если ничего не найдено, возвращаем null
    return null;
  } catch (error) {
    // В случае любой ошибки на сервере, выводим ее в лог Vercel
    // и возвращаем null, чтобы страница показала 404, а не упала.
    console.error(`!!! Ошибка при загрузке контента для slug [${slug}]:`, error);
    return null;
  }
}

// Универсальный компонент для отображения контента
function ContentDisplay({ content }) {
  const { title, publishedAt, content: markdownContent, author } = content;

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{title}</h1>
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

  if (!result) {
    notFound(); // Если ничего не найдено, показываем 404
  }

  return <ContentDisplay content={result.data} />;
}

// Эта функция генерирует метаданные (заголовок вкладки)
export async function generateMetadata({ params }) {
    const result = await getContent(params.slug);
    if (!result) {
        return { title: 'Страница не найдена' };
    }
    return {
      title: result.data.title,
    };
}



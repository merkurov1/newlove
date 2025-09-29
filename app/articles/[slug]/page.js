import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- НОВЫЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Находит URL первого изображения в Markdown-контенте
function getFirstImage(content) {
  if (!content) return null;
  const regex = /!\[.*?\]\((.*?)\)/;
  const match = content.match(regex);
  return match ? match[1] : null;
}

// Создаёт короткое текстовое описание из контента статьи
function generateDescription(content) {
  if (!content) return '';
  // Убираем Markdown-разметку, чтобы получить чистый текст
  const plainText = content
    .replace(/!\[.*?\]\(.*?\)/g, '') // убираем картинки
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // убираем ссылки, оставляя текст
    .replace(/#{1,6}\s/g, '') // убираем заголовки
    .replace(/[`*_\-~]/g, '') // убираем прочее форматирование
    .replace(/\s\s+/g, ' ') // убираем лишние пробелы
    .trim();
  // Ограничиваем длину до 160 символов
  return plainText.substring(0, 160);
}


// Эта функция находит статью в базе по slug из URL
async function getArticle(slug) {
  const article = await prisma.article.findUnique({
    where: {
      slug: slug,
      published: true, 
    },
    include: {
      author: {
        select: { name: true, image: true },
      },
    },
  });

  if (!article) {
    notFound();
  }
  return article;
}

// --- УЛУЧШЕННАЯ ФУНКЦИЯ ГЕНЕРАЦИИ МЕТАДАННЫХ ---
export async function generateMetadata({ params }) {
    const article = await getArticle(params.slug);
    const previewImage = getFirstImage(article.content);
    const description = generateDescription(article.content);
    
    // !!! ЗАМЕНИТЕ ЭТО НА URL ВАШЕГО САЙТА
    const baseUrl = 'https://merkurov.love';

    return {
      title: article.title,
      description: description,
      openGraph: {
        title: article.title,
        description: description,
        url: `${baseUrl}/${article.slug}`,
        siteName: 'Anton Merkurov', // <-- ИЛИ НАЗВАНИЕ ВАШЕГО ПРОЕКТА
        images: previewImage ? [
          {
            url: previewImage,
            width: 1200,
            height: 630,
          },
        ] : [],
        locale: 'ru_RU',
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: article.title,
        description: description,
        images: previewImage ? [previewImage] : [],
      },
    };
}


export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);

  return (
    <article className= Меркурова"max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{article.title}</h1>
      <div className="flex items-center space-x-4 mb-8 text-gray-500">
        {article.author.image && (
          <img src={article.author.image} alt={article.author.name} className="w-10 h-10 rounded-full" />
        )}
        <span>{article.author.name}</span>
        <span>&middot;</span>
        <time dateTime={article.publishedAt.toISOString()}>
          {new Date(article.publishedAt).toLocaleDateDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </div>
      
      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

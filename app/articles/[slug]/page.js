import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image'; // Импортируем Next.js Image
import MarkdownImage from '@/components/MarkdownImage'; // <-- 1. Импортируем наш новый компонент

// ... (вспомогательные функции getFirstImage, generateDescription, getArticle остаются без изменений)
function getFirstImage(content) {
  if (!content) return null;
  const regex = /!\[.*?\]\((.*?)\)/;
  const match = content.match(regex);
  return match ? match[1] : null;
}
function generateDescription(content) { /* ... */ }
async function getArticle(slug) { /* ... */ }

export async function generateMetadata({ params }) { /* ... */ }


export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);

  // --- 2. Новая логика для "обложки" ---
  const heroImage = getFirstImage(article.content);
  // Удаляем первую картинку из основного контента, чтобы избежать дублирования
  const contentWithoutHero = heroImage ? article.content.replace(/!\[.*?\]\(.*?\)\n?/, '') : article.content;

  // --- 3. Создаем объект для кастомных компонентов Markdown ---
  const components = {
    img: MarkdownImage, // Все <img> теперь будут рендериться через наш компонент
  };

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      {/* --- Информация о статье --- */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{article.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {article.author.image && (
            <Image src={article.author.image} alt={article.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />
          )}
          <span>{article.author.name}</span>
          <span>&middot;</span>
          <time dateTime={article.publishedAt.toISOString()}>
            {new Date(article.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
        </div>
      </div>
      
      {/* --- 4. Отображаем "обложку", если она есть --- */}
      {heroImage && (
        <div className="mb-12">
          <Image src={heroImage} alt={article.title} width={1200} height={675} className="rounded-xl shadow-lg w-full" priority />
        </div>
      )}

      {/* --- 5. Основной контент статьи --- */}
      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {contentWithoutHero}
        </ReactMarkdown>
      </div>
    </article>
  );
}

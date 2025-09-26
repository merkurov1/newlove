// app/[...slug]/page.js (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ СТИЛЕЙ)

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
// КРИТИЧЕСКИ ВАЖНО: Импортируем ReactMarkdown для безопасного рендеринга и стилизации
import ReactMarkdown from 'react-markdown';
// Импортируем плагин для интеграции с Tailwind Typography
import remarkGfm from 'remark-gfm'; 

async function getArticleBySlug(slug) {
  const supabaseClient = createClient();
  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, created_at, content')
    .eq('slug', slug.join('/'))
    .single();

  if (error) {
    console.error('Error fetching article:', error);
    return null;
  }
  return data;
}

export default async function CatchAllPage({ params }) {
  const article = await getArticleBySlug(params.slug);

  if (!article) {
    notFound();
  }
  
  // Контент для рендеринга (предполагаем, что это Markdown)
  const contentToRender = article.content || '';

  return (
    <article className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-light leading-tight text-gray-900">{article.title}</h1>
        <p className="mt-4 text-gray-500 text-sm">
          Опубликовано: {new Date(article.created_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>
      
      {/* ФИНАЛЬНОЕ РЕШЕНИЕ:
          Используем ReactMarkdown. Tailwind (просе) теперь может стилизовать
          элементы, созданные React-ом, а не просто HTML-строки.
      */}
      <div className="prose prose-lg mx-auto text-gray-800">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]} // Включаем поддержку таблиц и других элементов Markdown
        >
          {contentToRender}
        </ReactMarkdown>
      </div>
      
    </article>
  );
}


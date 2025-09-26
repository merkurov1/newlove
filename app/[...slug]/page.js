// app/[...slug]/page.js (ФИНАЛЬНОЕ РАБОЧЕЕ РЕШЕНИЕ)

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown'; // Импортируем ReactMarkdown
import remarkGfm from 'remark-gfm'; // Импортируем плагин для таблиц и сносок

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
  
  // ВАЖНО: Контент должен быть в формате Markdown.
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
      
      {/* ФИНАЛЬНОЕ РЕШЕНИЕ СТИЛЕЙ: 
        Используем ReactMarkdown, чтобы преобразовать контент в React-элементы.
        Это гарантирует, что Tailwind увидит структуру для стилизации через 'prose'.
      */}
      <div className="prose prose-lg mx-auto text-gray-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {contentToRender}
        </ReactMarkdown>
      </div>
      
    </article>
  );
}


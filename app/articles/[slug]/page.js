// app/articles/[slug]/page.js

// Было: import { createClient } from '../../lib/supabase-server.js';
// Стало:
import { createClient } from '@/lib/supabase-server';

import { notFound } from 'next/navigation';

async function getArticleBySlug(slug) {
  const supabaseClient = createClient();
  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, created_at, content')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching article:', error);
    return null;
  }
  return data;
}

export default async function ArticlePage({ params }) {
  const article = await getArticleBySlug(params.slug);

  if (!article) {
    notFound();
  }

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
      <div className="prose prose-lg mx-auto text-gray-800">
        <p>{article.content}</p>
      </div>
    </article>
  );
}

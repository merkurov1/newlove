// app/[...slug]/page.js
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Header from '@/app/header.js';

export default async function Page({ params }) {
  const { slug } = params;
  const articleSlug = Array.isArray(slug) ? slug[0] : slug;

  const { data: article, error } = await supabase
    .from('articles')
    .select('title, content')
    .eq('slug', articleSlug)
    .contains('tags', ['page'])
    .single();

  if (error || !article) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="article-main">
        <article className="article-container">
          <h1 className="article-title">{article.title}</h1>
          <div className="article-content" dangerouslySetInnerHTML={{ __html: article.content }} />
        </article>
      </main>
    </>
  );
}

export async function generateStaticParams() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug')
    .contains('tags', ['page']);

  // Если есть ошибка или данные не являются массивом, возвращаем пустой массив
  if (error || !articles || !Array.isArray(articles)) {
    console.error('Ошибка генерации статических параметров:', error);
    return [];
  }

  return articles.map((article) => ({
    slug: [article.slug],
  }));
}

import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

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
    <main>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
    </main>
  );
}

export async function generateStaticParams() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug')
    .contains('tags', ['page']);

  if (error) {
    console.error('Ошибка генерации статических параметров:', error);
    return [];
  }

  return articles.map((article) => ({
    slug: [article.slug],
  }));
}

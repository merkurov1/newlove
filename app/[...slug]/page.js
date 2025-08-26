// app/[...slug]/page.js
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase'; // Импорт серверного клиента для runtime
import { supabaseBuildClient } from '@/lib/supabase-build'; // Импорт клиента для build-time

// Эта функция работает во время сборки, поэтому она не может использовать `cookies`
export async function generateStaticParams() {
  const { data: articles } = await supabaseBuildClient
    .from('articles')
    .select('slug')
    .eq('is_draft', false);

  const { data: projects } = await supabaseBuildClient
    .from('projects')
    .select('slug');

  // Объединяем slugs из разных таблиц
  const allSlugs = [
    ...(articles || []).map(item => ({ slug: item.slug })),
    ...(projects || []).map(item => ({ slug: item.slug })),
  ];

  return allSlugs;
}

// Эта функция работает во время запроса и использует клиент с `cookies`
export default async function GenericPage({ params }) {
  const supabase = createClient();
  const slug = params.slug[0];

  // Попробуем найти статью по slug
  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .single();

  if (article) {
    // Если найдена статья, рендерим её
    return (
      <article>
        <h1>{article.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: article.body }} />
      </article>
    );
  }

  // Попробуем найти проект по slug
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single();

  if (project) {
    // Если найден проект, рендерим его
    return (
      <article>
        <h1>{project.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: project.body }} />
      </article>
    );
  }

  // Если ничего не найдено, возвращаем 404
  notFound();
}

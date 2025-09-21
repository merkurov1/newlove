// app/projects/[slug]/page.js

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';

// Эта функция теперь ищет страницу в таблице 'projects'
async function getProjectBySlug(slug) {
  const supabaseClient = createClient();
  const { data, error } = await supabaseClient
    .from('projects') // ИСПРАВЛЕНО: теперь ищем в таблице 'projects'
    .select('id, title, created_at, content')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching project:', error);
    // Эта ошибка может возникать, если страница с таким slug не найдена. Это нормально.
    return null;
  }
  return data;
}

export default async function ProjectPage({ params }) {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    notFound(); // Если страница не найдена, показываем ошибку 404
  }

  return (
    // Стили для отображения самой страницы, можете настроить под себя
    <article className="bg-white p-8 rounded-lg shadow-md max-w-4xl mx-auto">
      <header className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight text-gray-900">{project.title}</h1>
        <p className="mt-3 text-gray-500 text-sm">
          Опубликовано: {new Date(project.created_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>
      {/* ИСПОЛЬЗУЕМ dangerouslySetInnerHTML для рендеринга HTML из базы данных */}
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: project.content }}
      />
    </article>
  );
}

// app/projects/[slug]/page.js

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { marked } from 'marked'; // <-- 1. Импортируем marked

async function getProjectBySlug(slug) {
  const supabaseClient = createClient();
  const { data, error } = await supabaseClient
    .from('projects')
    .select('id, title, created_at, content')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching project:', error);
    return null;
  }
  return data;
}

export default async function ProjectPage({ params }) {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    notFound();
  }

  // --- 2. Превращаем Markdown в HTML перед отображением ---
  const htmlContent = await marked.parse(project.content || '');

  return (
    <article className="bg-white p-6 sm:p-8 rounded-lg shadow-md max-w-4xl mx-auto">
      <header className="mb-8 text-center">
        {/* Немного увеличим заголовок для выразительности */}
        <h1 className="text-4xl md:text-5xl font-bold leading-tight text-gray-900">{project.title}</h1>
        <p className="mt-3 text-gray-500 text-sm">
          Опубликовано: {new Date(project.created_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>

      {/* --- 3. Класс 'prose' теперь будет работать как надо --- */}
      <div
        className="prose prose-lg lg:prose-xl max-w-none"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </article>
  );
}

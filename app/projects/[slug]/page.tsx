// app/projects/[slug]/page.tsx
import { createClient } from '@supabase/supabase-js';
import BlockRenderer from '@/components/BlockRenderer';
import { notFound } from 'next/navigation';

// Эта функция может быть вынесена в отдельный файл lib/supabase.ts
// Убедитесь, что переменные окружения доступны на сервере
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Используйте SERVICE_ROLE_KEY для серверных компонентов
);

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const { data: project } = await supabase
    .from('projects')
    .select('title, content')
    .eq('slug', params.slug)
    .single();

  if (!project) {
    notFound();
  }

  // Supabase должен автоматически парсить jsonb, но на всякий случай оставляем проверку
  let blocks = project.content;
  if (typeof blocks === 'string') {
    try {
      blocks = JSON.parse(blocks);
    } catch (e) {
      console.error("Ошибка парсинга JSON:", e);
      blocks = [];
    }
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-8 text-center">
        {project.title}
      </h1>
      <div className="prose lg:prose-xl max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </article>
  );
}

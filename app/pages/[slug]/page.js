// app/pages/[slug]/page.js
import { supabase } from '@/lib/supabase';

async function getProjectBySlug(slug) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching page:', error);
    return null;
  }
  return data;
}

export default async function ProjectPage({ params }) {
  const page = await getProjectBySlug(params.slug);

  if (!page) {
    return <div className="text-center text-gray-500 mt-8">Страница не найдена.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">{page.title}</h1>
      <p className="text-gray-500 text-sm mb-6">Опубликовано: {new Date(page.created_at).toLocaleDateString()}</p>
      <div className="prose lg:prose-xl">
        <p>{page.content}</p>
      </div>
    </div>
  );
}

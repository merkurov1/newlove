import { supabase } from '@/lib/supabase-server'; 
import { notFound } from 'next/navigation';
import Image from 'next/image';

async function getProjectBySlug(slug) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, created_at, content, image_url')
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
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto my-8 p-8 bg-white rounded-lg shadow-xl border border-gray-100">
      {page.image_url && (
        <div className="mb-8">
          <Image
            src={page.image_url}
            alt={page.title}
            width={1200}
            height={600}
            className="rounded-lg w-full h-auto"
          />
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-4xl font-semibold text-gray-900 leading-tight mb-2">
          {page.title}
        </h1>
        <p className="text-gray-500 text-sm">
          Опубликовано: {new Date(page.created_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>

      <div className="prose prose-lg text-gray-800">
        <p>{page.content}</p>
      </div>
    </div>
  );
}

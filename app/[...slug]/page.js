// app/[...slug]/page.js

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server'; // For server rendering
import { supabaseBuildClient } from '@/lib/supabase-build-client'; // For static builds
import Image from 'next/image';

export async function generateStaticParams() {
  const { data: articles } = await supabaseBuildClient
    .from('articles')
    .select('slug')
    .eq('is_draft', false);

  const { data: projects } = await supabaseBuildClient
    .from('projects')
    .select('slug');

  const allSlugs = [
    ...(articles || []).map(item => ({ slug: [item.slug] })),
    ...(projects || []).map(item => ({ slug: [item.slug] })),
  ];
  
  return allSlugs;
}

export default async function GenericPage({ params }) {
  const supabase = createClient(); // This runs on the server side after a request
  const path = params.slug.join('/');

  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', path)
    .single();

  if (article) {
    return (
      <article className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-6">{article.title}</h1>
        {article.image_url && (
          <div className="relative w-full h-96 mb-8 rounded-lg overflow-hidden shadow-lg">
            <Image
              src={article.image_url}
              alt={article.title}
              fill
              className="rounded-lg object-cover"
            />
          </div>
        )}
        <div className="prose lg:prose-lg mx-auto" dangerouslySetInnerHTML={{ __html: article.body }} />
      </article>
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', path)
    .single();

  if (project) {
    return (
      <article className="prose lg:prose-xl mx-auto">
        <h1 className="text-center">{project.title}</h1>
        {project.image_url && (
          <Image src={project.image_url} alt={project.title} width={1200} height={800} className="rounded-lg shadow-md" />
        )}
        <div className="mt-8" dangerouslySetInnerHTML={{ __html: project.body }}></div>
      </article>
    );
  }

  notFound();
}

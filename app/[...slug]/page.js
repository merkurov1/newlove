// app/projects/[slug]/page.js
import { createClient } from '@/lib/supabase'; // Исправленный путь
import { notFound } from 'next/navigation';
import Image from 'next/image';

export async function generateStaticParams() {
  const supabase = createClient();
  const { data: projects } = await supabase.from('projects').select('slug');
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectPage({ params }) {
  const supabase = createClient();
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (!project) notFound();

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

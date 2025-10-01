
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-server';
import BlockRenderer from '@/components/BlockRenderer';

interface Project {
  id: string;
  slug: string;
  title: string;
  content: string;
  previewImage?: {
    url: string;
    alt?: string;
  };
}

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug, title, content, previewImage')
    .eq('slug', params.slug)
    .single();

  if (error || !project) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">{project.title}</h1>
      {project.previewImage && project.previewImage.url && (
        <div className="relative w-full h-80 mb-8">
          <Image
            src={project.previewImage.url}
            alt={project.previewImage.alt || project.title}
            fill
            style={{ objectFit: 'cover' }}
            className="rounded-lg shadow-md"
          />
        </div>
      )}
      {project.content && (
        <div className="prose prose-lg max-w-none">
          {Array.isArray(project.content)
            ? <BlockRenderer blocks={project.content} />
            : (() => {
                let blocks;
                try {
                  blocks = JSON.parse(project.content);
                } catch (e) {
                  return <pre style={{color:'red'}}>Ошибка парсинга: {String(e)}\n{String(project.content)}</pre>;
                }
                return <BlockRenderer blocks={blocks} />;
              })()
          }
        </div>
      )}
    </div>
  );
}
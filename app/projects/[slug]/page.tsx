import { createClient } from '@supabase/supabase-js';
import BlockRenderer from '@/components/BlockRenderer';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: project } = await supabase
    .from('projects')
    .select('title, content')
    .eq('slug', params.slug)
    .single();

  if (!project) return <div>Проект не найден</div>;

  return (
    <article>
      <h1>{project.title}</h1>
      <BlockRenderer blocks={project.content} />
    </article>
  );
}

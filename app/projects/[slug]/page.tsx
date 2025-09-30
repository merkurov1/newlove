import { createClient } from '@supabase/supabase-js';
import RichTextBlock from '@/components/RichTextBlock';
import GalleryGrid from '@/components/GalleryGrid';
// import CodeBlock from '@/components/CodeBlock'; // если потребуется

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
      {project.content.map((block: any, idx: number) => {
        switch (block.type) {
          case 'richText':
            return <RichTextBlock key={idx} html={block.html} />;
          case 'gallery':
            return <GalleryGrid key={idx} images={block.images} />;
          case 'codeBlock':
            return (
              <pre key={idx}>
                <code className={`language-${block.language}`}>{block.code}</code>
              </pre>
            );
          default:
            return null;
        }
      })}
    </article>
  );
}

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server'; // Исправленный путь к серверному клиенту
import Image from 'next/image';

// generateStaticParams должен возвращать массив объектов, где каждая
// запись имеет ключ, соответствующий названию папки динамического маршрута.
// В вашем случае, это 'slug'.
export async function generateStaticParams() {
  const supabase = createClient(); // Используем серверный клиент для генерации

  const { data: articles } = await supabase
    .from('articles')
    .select('slug')
    .eq('is_draft', false);

  const { data: projects } = await supabase
    .from('projects')
    .select('slug');

  // Убедимся, что slug — это не просто строка, а массив строк,
  // так как маршрут [...slug] является catch-all.
  const allSlugs = [
    ...(articles || []).map(item => ({ slug: [item.slug] })),
    ...(projects || []).map(item => ({ slug: [item.slug] })),
  ];
  
  return allSlugs;
}

export default async function GenericPage({ params }) {
  const supabase = createClient();
  const slug = params.slug.join('/'); // Собираем массив 'slug' в одну строку

  // Сначала пытаемся найти статью.
  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
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
              fill // Вместо layout="fill" используйте fill
              className="rounded-lg object-cover" // objectFit="cover" заменяется на className="object-cover"
            />
          </div>
        )}
        <div className="prose lg:prose-lg mx-auto">
          <div dangerouslySetInnerHTML={{ __html: article.body }} />
        </div>
      </article>
    );
  }

  // Если статья не найдена, ищем проект.
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
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

  // Если ни статья, ни проект не найдены, возвращаем 404.
  notFound();
}

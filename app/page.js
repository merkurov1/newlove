// app/page.js
import Link from 'next/link';
import { createClient } from '@/lib/supabase'; // Импорт серверного клиента
import Image from 'next/image';

async function getRecentContent() {
  const supabase = createClient();
  const { data: articles } = await supabase
    .from('articles')
    .select('id, title, slug, published_at, image_url')
    .order('published_at', { ascending: false })
    .limit(3);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, slug, published_at, image_url')
    .order('published_at', { ascending: false })
    .limit(3);

  return { articles, projects };
}

export default async function HomePage() {
  const { articles, projects } = await getRecentContent();

  return (
    <div>
      <section className="my-10">
        <h1 className="text-4xl font-bold mb-4">Здравствуйте, меня зовут Антон Меркуров.</h1>
        <p className="text-xl">Я медиаэксперт, работающий на пересечении современных медиа, технологий и искусства.</p>
      </section>

      <section className="my-10">
        <h2 className="text-2xl font-semibold mb-4">Последние проекты</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {projects?.map(project => (
            <Link key={project.id} href={`/projects/${project.slug}`} className="p-4 border rounded shadow">
              {project.image_url && (
                <Image src={project.image_url} alt={project.title} width={300} height={200} className="rounded" />
              )}
              <h3 className="text-lg font-medium">{project.title}</h3>
              <p className="text-sm text-gray-500">{new Date(project.published_at).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
        <Link href="/projects" className="mt-4 inline-block text-blue-600 hover:underline">
          Смотреть все проекты
        </Link>
      </section>

      <section className="my-10">
        <h2 className="text-2xl font-semibold mb-4">Свежие статьи</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {articles?.map(article => (
            <Link key={article.id} href={`/articles/${article.slug}`} className="p-4 border rounded shadow">
              {article.image_url && (
                <Image src={article.image_url} alt={article.title} width={300} height={200} className="rounded" />
              )}
              <h3 className="text-lg font-medium">{article.title}</h3>
              <p className="text-sm text-gray-500">{new Date(article.published_at).toLocaleDateString()}</p>
            </Link>
          ))}
        </div>
        <Link href="/articles" className="mt-4 inline-block text-blue-600 hover:underline">
          Читать все статьи
        </Link>
      </section>
    </div>
  );
}

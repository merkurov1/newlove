import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import MarkdownImage from '@/components/MarkdownImage'; // <-- Импортируем

// Вспомогательные функции (можно будет вынести в отдельный файл)
function getFirstImage(content) {
  if (!content) return null;
  const regex = /!\[.*?\]\((.*?)\)/;
  const match = content.match(regex);
  return match ? match[1] : null;
}
function generateDescription(content) {
    if (!content) return '';
    const plainText = content.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/#{1,6}\s/g, '').replace(/[`*_\-~]/g, '').replace(/\s\s+/g, ' ').trim();
    return plainText.substring(0, 160);
}
async function getProject(slug) { /* ... */ }

// Улучшенная генерация метаданных
export async function generateMetadata({ params }) {
    const project = await getProject(params.slug);
    const previewImage = getFirstImage(project.content);
    const description = generateDescription(project.content);
    const baseUrl = 'https://merkurov.love'; // <-- Убедитесь, что домен верный

    return {
      title: project.title,
      description: description,
      openGraph: {
        title: project.title,
        description: description,
        url: `${baseUrl}/projects/${project.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU',
        type: 'article',
      },
    };
}

export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);
  const heroImage = getFirstImage(project.content);
  const contentWithoutHero = heroImage ? project.content.replace(/!\[.*?\]\(.*?\)\n?/, '') : project.content;
  const components = { img: MarkdownImage };

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {project.author.image && (
            <Image src={project.author.image} alt={project.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />
          )}
          <span>{project.author.name}</span>
          <span>&middot;</span>
          <time dateTime={project.publishedAt.toISOString()}>
            {new Date(project.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
        </div>
      </div>
      
      {heroImage && (
        <div className="mb-12">
          <Image src={heroImage} alt={project.title} width={1200} height={675} className="rounded-xl shadow-lg w-full" priority />
        </div>
      )}

      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {contentWithoutHero}
        </ReactMarkdown>
      </div>
    </article>
  );
}

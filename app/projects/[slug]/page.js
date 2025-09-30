// app/projects/[slug]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import GalleryGrid from '@/components/GalleryGrid';
import parse, { domToReact } from 'html-react-parser';

async function getProject(slug) {
  const project = await prisma.project.findUnique({
    where: { slug: slug, published: true },
    include: { // <<< ИСПРАВЛЕНИЕ: ДОБАВЛЯЕМ ЗАГРУЗКУ ТЕГОВ
      author: { select: { name: true, image: true } },
      tags: true,
    },
  });
  if (!project) notFound();
  return project;
}

export async function generateMetadata({ params }) {
    const project = await getProject(params.slug);
    const previewImage = getFirstImage(project.content);
    const description = generateDescription(project.content);
    const baseUrl = 'https://merkurov.love';

    return {
      title: project.title,
      description: description,
      keywords: project.tags.map(tag => tag.name).join(', '),
      openGraph: {
        title: project.title,
        description: description,
        url: `${baseUrl}/projects/${project.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU', type: 'article',
      },
    };
}



  const project = await getProject(params.slug);
  const content = project.content;

  return (
    <article className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {project.author.image && <Image src={project.author.image} alt={project.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />}
          <span>{project.author.name}</span>
          <span>&middot;</span>
          <time dateTime={project.publishedAt.toISOString()}>{new Date(project.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
        </div>
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {project.tags.map(tag => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{tag.name}</Link>
            ))}
          </div>
        )}
      </div>
      {/* Тестовый gallery-grid вне markdown */}
      <div className="gallery-grid">
        <div>TEST 1</div>
        <div>TEST 2</div>
        <div>TEST 3</div>
      </div>
      <div className="prose lg:prose-xl max-w-none">
        {parse(content, {
          replace: domNode => {
            if (
              domNode.type === 'tag' &&
              domNode.name === 'div' &&
              domNode.attribs &&
              domNode.attribs.class &&
              domNode.attribs.class.split(' ').includes('gallery-grid')
            ) {
              // Собираем src всех <img> внутри div.gallery-grid
              const images = [];
              if (domNode.children) {
                domNode.children.forEach(child => {
                  if (child.name === 'img' && child.attribs && child.attribs.src) {
                    images.push(child.attribs.src);
                  }
                });
              }
              return <GalleryGrid images={images} />;
            }
          }
        })}
      </div>
    </article>
  );
}

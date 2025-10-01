

import { notFound } from 'next/navigation';
import Image from 'next/image';
import BlockRenderer from '@/components/BlockRenderer';
import prisma from '@/lib/prisma';

  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      previewImage: true,
    },
  });
  if (!project) {
    notFound();
  }
  let blocks: any[] = [];
  if (Array.isArray(project.content)) {
    blocks = project.content;
  } else {
    try {
      blocks = JSON.parse(project.content);
    } catch (e) {
      blocks = [];
    }
  }
  // previewImage хранится как JSON-объект или null
  let previewImage: { url?: string; alt?: string } | null = null;
  if (project.previewImage && typeof project.previewImage === 'object') {
    previewImage = project.previewImage as any;
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">{project.title}</h1>
      {previewImage && previewImage.url && (
        <div className="relative w-full h-80 mb-8">
          <Image
            src={previewImage.url}
            alt={previewImage.alt || project.title}
            fill
            style={{ objectFit: 'cover' }}
            className="rounded-lg shadow-md"
          />
        </div>
      )}
      <div className="prose prose-lg max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </div>
  );
}
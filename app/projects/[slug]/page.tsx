


import { notFound } from 'next/navigation';
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
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">{project.title}</h1>
      <div className="prose prose-lg max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </div>
  );
}
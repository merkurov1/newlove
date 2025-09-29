// app/admin/articles/edit/[id]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!article) notFound();
  return article;
}

export default async function EditArticlePage({ params }) {
  const article = await getArticle(params.id);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование публикации</h1>
      <ContentForm 
        initialData={article} 
        saveAction={updateArticle} 
        type="статью" 
      />
    </div>
  );
}

// app/admin/articles/edit/[id]/page.js

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

// Эта функция загружает данные статьи на сервере
async function getArticle(id) {
  const article = await prisma.article.findUnique({
    where: { id },
  });
  if (!article) {
    notFound();
  }
  return article;
}

// Сама страница теперь тоже серверный компонент
export default async function EditArticlePage({ params }) {
  const article = await getArticle(params.id);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование публикации</h1>
      {/* Используем наш универсальный компонент для редактирования */}
      <ContentForm 
        initialData={article} 
        saveAction={updateArticle} 
        type="статью" 
      />
    </div>
  );
}

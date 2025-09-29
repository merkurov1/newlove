// app/admin/articles/edit/[id]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateArticle } from '../../../actions';

async function getArticle(id) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: { tags: true }, // <-- ДОБАВЛЯЕМ ЗАГРУЗКУ ТЕГОВ
  });
  if (!article) notFound();
  return article;
}

export default async function EditArticlePage({ params }) { /* ... */ }

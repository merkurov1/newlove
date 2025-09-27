// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next'; // <<< ИЗМЕНЕНИЕ
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // <<< ИЗМЕНЕНИЕ
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// Вспомогательная функция для проверки прав администратора
async function verifyAdmin() {
  // <<< ИЗМЕНЕНИЕ: Используем новый метод getServerSession
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required.');
  }
  return session;
}

// Server Action для создания статьи
export async function createArticle(formData) {
  const session = await verifyAdmin();

  const title = formData.get('title');
  const description = formData.get('content');
  const slug = formData.get('slug');

  if (!title || !description || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    await prisma.newsArticle.create({
      data: {
        title,
        description,
        slug,
        url: `/articles/${slug}`,
        publishedAt: new Date(),
        sourceName: session.user.name || 'Admin',
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('Статья с таким URL (slug) уже существует.');
    }
    throw new Error('Не удалось создать статью.');
  }

  revalidatePath('/admin');
  revalidatePath('/articles');
  redirect('/admin');
}

// Server Action для удаления статьи
export async function deleteArticle(formData) {
  await verifyAdmin();

  const id = formData.get('id');

  if (!id) {
    throw new Error('Article ID is required.');
  }

  await prisma.newsArticle.delete({
    where: { id: parseInt(id, 10) },
  });

  revalidatePath('/admin');
  revalidatePath('/articles');
}

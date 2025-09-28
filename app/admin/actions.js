'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function verifyAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    throw new Error('Not authenticated or authorized!');
  }
  return session;
}

// --- СТАТЬИ (Article) ---

export async function createArticle(formData) {
  // ... этот код остается без изменений
}

// <<< НОВАЯ ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ СТАТЬИ >>>
export async function updateArticle(formData) {
  await verifyAdmin();

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !content || !slug) {
    throw new Error('ID, Title, content, and slug are required.');
  }

  try {
    await prisma.article.update({
      where: { id: id },
      data: {
        title,
        content,
        slug,
        published,
        publishedAt: published ? new Date() : null, // Обновляем дату публикации
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return { message: 'Публикация с таким URL (slug) уже существует.' };
    }
    return { message: 'Не удалось обновить публикацию.' };
  }

  // Очищаем кэш для списка в админке и для публичной страницы
  revalidatePath('/admin/articles');
  revalidatePath(`/articles/${slug}`);
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  // ... этот код остается без изменений
}


// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) {
  // ... этот код остается без изменений
}

export async function deleteProject(formData) {
  // ... этот код остается без изменений
}


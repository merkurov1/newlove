// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function verifyAdmin() {
  // ... (код этой функции не меняется)
}

// --- ВАШИ ПУБЛИКАЦИИ (Article) ---

export async function createArticle(formData) {
  await verifyAdmin();

  const title = formData.get('title');
  const content = formData.get('content');
  const slug = formData.get('slug');

  if (!title || !content || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    // <<< ИЗМЕНЕНИЕ: Создаем `article`, а не `newsArticle`
    await prisma.article.create({
      data: { title, content, slug },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('Публикация с таким URL (slug) уже существует.');
    }
    throw new Error('Не удалось создать публикацию.');
  }

  revalidatePath('/admin/articles');
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id');

  if (!id) {
    throw new Error('Article ID is required.');
  }

  // <<< ИЗМЕНЕНИЕ: Удаляем `article`
  await prisma.article.delete({
    where: { id: id }, // ID у этой модели - строка (cuid)
  });

  revalidatePath('/admin/articles');
  revalidatePath('/articles'); // Перепроверка публичной страницы
}


// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) {
  // ... (код этой функции не меняется)
}

export async function deleteProject(formData) {
  // ... (код этой функции не меняется)
}

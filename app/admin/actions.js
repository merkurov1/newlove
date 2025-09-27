// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

async function verifyAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required.');
  }
  return session;
}

// --- СТАТЬИ (NewsArticle) ---

export async function createArticle(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title');
  const description = formData.get('content');
  const slug = formData.get('slug');

  // ... (остальной код createArticle без изменений)
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

  revalidatePath('/admin/articles'); // Обновляем путь к списку статей
  redirect('/admin/articles'); // Перенаправляем на список статей
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id');

  if (!id) {
    throw new Error('Article ID is required.');
  }

  await prisma.newsArticle.delete({
    where: { id: parseInt(id, 10) },
  });

  revalidatePath('/admin/articles');
  revalidatePath('/articles');
}

// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) {
  await verifyAdmin();

  const title = formData.get('title');
  const content = formData.get('content');
  const slug = formData.get('slug');

  if (!title || !content || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    await prisma.project.create({
      data: { title, content, slug },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('Проект с таким URL (slug) уже существует.');
    }
    throw new Error('Не удалось создать проект.');
  }

  revalidatePath('/admin/projects');
  redirect('/admin/projects');
}

export async function deleteProject(formData) {
  await verifyAdmin();
  const id = formData.get('id');

  if (!id) {
    throw new Error('Project ID is required.');
  }

  await prisma.project.delete({
    where: { id: id },
  });

  revalidatePath('/admin/projects');
  revalidatePath(`/${id}`); // Перепроверка страницы самого проекта
}

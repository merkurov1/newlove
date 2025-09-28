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
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !content || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    await prisma.article.create({
      data: {
        title,
        content,
        slug,
        published,
        publishedAt: published ? new Date() : null,
        authorId: session.user.id,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return { message: 'Публикация с таким URL (slug) уже существует.' };
    }
    return { message: 'Не удалось создать публикацию.' };
  }

  revalidatePath('/admin/articles');
  redirect('/admin/articles');
}

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
        publishedAt: published ? new Date() : null,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return { message: 'Публикация с таким URL (slug) уже существует.' };
    }
    return { message: 'Не удалось обновить публикацию.' };
  }

  revalidatePath('/admin/articles');
  revalidatePath(`/${slug}`); // Исправлено для "плоских" URL
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Article ID is required.'); }
  await prisma.article.delete({ where: { id: id } });
  revalidatePath('/admin/articles');
  revalidatePath('/articles');
}

// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !content || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    await prisma.project.create({
      data: {
        title,
        content,
        slug,
        published,
        publishedAt: published ? new Date() : null,
        authorId: session.user.id,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return { message: 'Проект с таким URL (slug) уже существует.' };
    }
    return { message: 'Не удалось создать проект.' };
  }

  revalidatePath('/admin/projects');
  redirect('/admin/projects');
}

export async function updateProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !content || !slug) {
    throw new Error('ID, Title, content, and slug are required.');
  }

  await prisma.project.update({
    where: { id: id },
    data: {
      title,
      content,
      slug,
      published,
      publishedAt: published ? new Date() : null,
    },
  });

  revalidatePath('/admin/projects');
  revalidatePath(`/${slug}`); // Исправлено для "плоских" URL
  redirect('/admin/projects');
}

export async function deleteProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Project ID is required.'); }
  await prisma.project.delete({ where: { id: id } });
  revalidatePath('/admin/projects');
  revalidatePath('/projects');
}



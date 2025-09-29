'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';

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
  if (!title || !content || !slug) throw new Error('All fields are required.');
  await prisma.article.create({
    data: { title, content, slug, published, publishedAt: published ? new Date() : null, authorId: session.user.id },
  });
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
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');
  await prisma.article.update({
    where: { id: id },
    data: { title, content, slug, published, publishedAt: published ? new Date() : null },
  });
  revalidatePath('/admin/articles');
  revalidatePath(`/${slug}`);
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Article ID is required.'); }
  const article = await prisma.article.findUnique({ where: { id } });
  await prisma.article.delete({ where: { id: id } });
  revalidatePath('/admin/articles');
  if (article) revalidatePath(`/${article.slug}`);
}

// --- ПРОЕКТЫ (Project) ---
export async function createProject(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  if (!title || !content || !slug) throw new Error('All fields are required.');
  await prisma.project.create({
    data: { title, content, slug, published, publishedAt: published ? new Date() : null, authorId: session.user.id },
  });
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
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');
  await prisma.project.update({
    where: { id: id },
    data: { title, content, slug, published, publishedAt: published ? new Date() : null },
  });
  revalidatePath('/admin/projects');
  revalidatePath(`/${slug}`);
  redirect('/admin/projects');
}

export async function deleteProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Project ID is required.'); }
  const project = await prisma.project.findUnique({ where: { id } });
  await prisma.project.delete({ where: { id: id } });
  revalidatePath('/admin/projects');
  if (project) revalidatePath(`/${project.slug}`);
}

// --- ПОДПИСКИ (Subscription) ---
export async function subscribeToNewsletter(prevState, formData) {
  // ... (без изменений)
}

// --- РАССЫЛКИ (Letter) ---
export async function createLetter(formData) { /* ... */ }
export async function updateLetter(formData) { /* ... */ }
export async function deleteLetter(formData) { /* ... */ }
export async function sendLetter(prevState, formData) { /* ... */ }


// --- НОВЫЙ БЛОК: ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ---
export async function updateProfile(prevState, formData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { status: 'error', message: 'Вы не авторизованы.' };
  }

  const id = session.user.id;
  const username = formData.get('username')?.toString().toLowerCase().trim();
  const name = formData.get('name')?.toString().trim();
  const bio = formData.get('bio')?.toString();
  const website = formData.get('website')?.toString();

  if (!username || !name) {
    return { status: 'error', message: 'Имя и username обязательны.' };
  }
  
  // Простая валидация username
  if (!/^[a-z0-9_.]+$/.test(username)) {
      return { status: 'error', message: 'Username может содержать только строчные буквы, цифры, _ и .' };
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: {
        username: username,
        name: name,
        bio: bio,
        website: website,
      },
    });

    revalidatePath('/profile');
    revalidatePath(`/you/${updatedUser.username}`);
    
    return { status: 'success', message: 'Профиль успешно обновлен!' };

  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
      return { status: 'error', message: 'Этот username уже занят. Пожалуйста, выберите другой.' };
    }
    console.error('Ошибка обновления профиля:', error);
    return { status: 'error', message: 'Произошла неизвестная ошибка.' };
  }
}

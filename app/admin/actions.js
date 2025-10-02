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

// --- ИСПРАВЛЕННАЯ ЛОГИКА ОБРАБОТКИ ТЕГОВ ---
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function processTagsForPrisma(tagsString) {
  if (!tagsString) return [];
  try {
    const tagNames = JSON.parse(tagsString);
    if (!Array.isArray(tagNames)) return [];
    
    return tagNames.map(name => ({
      where: { name: name },
      create: { name: name, slug: slugify(name) },
    }));
  } catch (e) {
    return [];
  }
}

// --- СТАТЬИ (Article) ---
export async function createArticle(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = processTagsForPrisma(formData.get('tags')?.toString());

  if (!title || !contentRaw || !slug) throw new Error('All fields are required.');
  
  // Проверка уникальности slug
  const existing = await prisma.article.findUnique({ where: { slug } });
  if (existing) {
    throw new Error('Статья с таким slug уже существует. Пожалуйста, выберите другой URL.');
  }

  // Валидация JSON контента
  let blocks;
  try {
    blocks = JSON.parse(contentRaw);
  } catch {
    throw new Error('Content is not valid JSON');
  }
  if (!Array.isArray(blocks)) throw new Error('Content is not an array of blocks');
  
  // Валидация структуры блоков
  const validBlocks = blocks.filter(
    b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
  );
  if (validBlocks.length === 0) throw new Error('No valid blocks');
  
  await prisma.article.create({
    data: { 
      title, 
      content: JSON.stringify(validBlocks), // Сохраняем как строку для совместимости с String полем
      slug, 
      published, 
      publishedAt: published ? new Date() : null, 
      authorId: session.user.id,
      tags: { connectOrCreate: tagsToConnect },
    },
  });
  revalidatePath('/admin/articles');
  redirect('/admin/articles');
}

export async function updateArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = processTagsForPrisma(formData.get('tags')?.toString());

  if (!id || !title || !contentRaw || !slug) throw new Error('All fields are required.');
  
  // Валидация JSON контента
  let blocks;
  try {
    blocks = JSON.parse(contentRaw);
  } catch {
    throw new Error('Content is not valid JSON');
  }
  if (!Array.isArray(blocks)) throw new Error('Content is not an array of blocks');
  
  // Валидация структуры блоков
  const validBlocks = blocks.filter(
    b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
  );
  if (validBlocks.length === 0) throw new Error('No valid blocks');
  
  await prisma.article.update({
    where: { id: id },
    data: { 
      title, 
      content: JSON.stringify(validBlocks), // Сохраняем как строку для совместимости с String полем
      slug, 
      published, 
      publishedAt: published ? new Date() : null,
      tags: { 
        set: [], // Сначала отсоединяем все старые теги
        connectOrCreate: tagsToConnect, // Затем присоединяем новый набор
      },
    },
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
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = processTagsForPrisma(formData.get('tags')?.toString());

  if (!title || !contentRaw || !slug) throw new Error('All fields are required.');

  // Проверка уникальности slug
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) {
    throw new Error('Проект с таким slug уже существует. Пожалуйста, выберите другой URL.');
  }

  let blocks;
  try {
    blocks = JSON.parse(contentRaw);
  } catch {
    throw new Error('Content is not valid JSON');
  }
  if (!Array.isArray(blocks)) throw new Error('Content is not an array of blocks');
  // Жёсткая валидация структуры блоков
  const validBlocks = blocks.filter(
    b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
  );
  if (validBlocks.length === 0) throw new Error('No valid blocks');

  await prisma.project.create({
    data: { 
      title, content: JSON.stringify(validBlocks), slug, published, 
      publishedAt: published ? new Date() : null, 
      authorId: session.user.id,
      tags: { connectOrCreate: tagsToConnect },
    },
  });
  revalidatePath('/admin/projects');
  redirect('/admin/projects');
}

export async function updateProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = processTagsForPrisma(formData.get('tags')?.toString());

  if (!id || !title || !contentRaw || !slug) throw new Error('All fields are required.');

  let blocks;
  try {
    blocks = JSON.parse(contentRaw);
  } catch {
    throw new Error('Content is not valid JSON');
  }
  if (!Array.isArray(blocks)) throw new Error('Content is not an array of blocks');
  // Жёсткая валидация структуры блоков
  const validBlocks = blocks.filter(
    b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
  );
  if (validBlocks.length === 0) throw new Error('No valid blocks');

  await prisma.project.update({
    where: { id: id },
    data: { 
      title, content: JSON.stringify(validBlocks), slug, published, 
      publishedAt: published ? new Date() : null,
      tags: { 
        set: [],
        connectOrCreate: tagsToConnect,
      },
    },
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

// --- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ---
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
  if (!/^[a-z0-9_.]+$/.test(username)) {
      return { status: 'error', message: 'Username может содержать только строчные буквы, цифры, _ и .' };
  }
  try {
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { username, name, bio, website },
    });
    revalidatePath('/profile');
    revalidatePath(`/you/${updatedUser.username}`);
    return { status: 'success', message: 'Профиль успешно обновлен!' };
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('username')) {
      return { status: 'error', message: 'Этот username уже занят. Пожалуйста, выберите другой.' };
    }
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка обновления профиля:', error);
    }
    return { status: 'error', message: 'Произошла неизвестная ошибка.' };
  }
}


// --- РАССЫЛКИ И ПОДПИСКИ (без изменений) ---
export async function subscribeToNewsletter(prevState, formData) { /* ... */ }
export async function createLetter(formData) { /* ... */ }
export async function updateLetter(formData) { /* ... */ }
export async function deleteLetter(formData) { /* ... */ }
export async function sendLetter(prevState, formData) { /* ... */ }

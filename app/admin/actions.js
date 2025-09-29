// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// ... (старые функции, например verifyAdmin, без изменений)
async function verifyAdmin() { /* ... */ }

// --- НОВАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ для Тегов ---
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')           // Заменяем пробелы на -
    .replace(/[^\w\-]+/g, '')       // Удаляем все не-слова/не-дефисы
    .replace(/\-\-+/g, '-')         // Заменяем несколько -- на один -
    .replace(/^-+/, '')             // Убираем дефисы в начале
    .replace(/-+$/, '');            // Убираем дефисы в конце
}

async function processTags(tagsString) {
  if (!tagsString) return undefined;
  
  const tagNames = JSON.parse(tagsString);
  if (tagNames.length === 0) {
      return { set: [] }; // Если теги были, но все удалены
  }

  // Используем Prisma connectOrCreate:
  // он либо находит тег с таким именем, либо создает новый
  return {
    set: tagNames.map(name => ({ id: '' })), // Временное решение для очистки
    connectOrCreate: tagNames.map(name => ({
      where: { name: name },
      create: { name: name, slug: slugify(name) },
    })),
  };
}

// --- ОБНОВЛЕННЫЕ ЭКШЕНЫ ДЛЯ СТАТЕЙ ---
export async function createArticle(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsData = await processTags(formData.get('tags')?.toString());
  
  if (!title || !content || !slug) throw new Error('All fields are required.');

  await prisma.article.create({
    data: { 
      title, content, slug, published, 
      publishedAt: published ? new Date() : null, 
      authorId: session.user.id,
      tags: tagsData, // <-- Добавляем теги
    },
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
  const tagsData = await processTags(formData.get('tags')?.toString());
  
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');

  await prisma.article.update({
    where: { id: id },
    data: { 
      title, content, slug, published, 
      publishedAt: published ? new Date() : null,
      tags: tagsData, // <-- Обновляем теги
    },
  });
  revalidatePath('/admin/articles');
  revalidatePath(`/${slug}`);
  redirect('/admin/articles');
}

// --- ОБНОВЛЕННЫЕ ЭКШЕНЫ ДЛЯ ПРОЕКТОВ ---
export async function createProject(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsData = await processTags(formData.get('tags')?.toString());

  if (!title || !content || !slug) throw new Error('All fields are required.');

  await prisma.project.create({
    data: { 
      title, content, slug, published, 
      publishedAt: published ? new Date() : null, 
      authorId: session.user.id,
      tags: tagsData, // <-- Добавляем теги
    },
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
  const tagsData = await processTags(formData.get('tags')?.toString());

  if (!id || !title || !content || !slug) throw new Error('All fields are required.');

  await prisma.project.update({
    where: { id: id },
    data: { 
      title, content, slug, published, 
      publishedAt: published ? new Date() : null,
      tags: tagsData, // <-- Обновляем теги
    },
  });
  revalidatePath('/admin/projects');
  revalidatePath(`/${slug}`);
  redirect('/admin/projects');
}


// ... (остальные ваши экшены: deleteArticle, deleteProject, subscribeToNewsletter, updateProfile и т.д. остаются без изменений)
// Просто вставьте этот код выше остальных экшенов в вашем файле actions.js

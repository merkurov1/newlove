// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// Вспомогательная функция для проверки прав администратора
async function verifyAdmin() {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin access required.');
  }
  return session;
}

// Server Action для создания статьи
export async function createArticle(formData) {
  const session = await verifyAdmin();

  // Получаем данные из формы
  const title = formData.get('title');
  const description = formData.get('content'); // Поле textarea у нас называется 'content'
  const slug = formData.get('slug');

  if (!title || !description || !slug) {
    throw new Error('Title, content, and slug are required.');
  }

  try {
    // Создаем запись в таблице NewsArticle
    await prisma.newsArticle.create({
      data: {
        title,
        description,
        slug,
        url: `/articles/${slug}`, // Генерируем URL на основе слага
        publishedAt: new Date(), // Устанавливаем текущую дату публикации
        sourceName: session.user.name || 'Admin', // Указываем автора из сессии
      },
    });
  } catch (error) {
    // Обрабатываем возможную ошибку, если такой slug или url уже существует
    if (error.code === 'P2002') {
      throw new Error('Статья с таким URL (slug) уже существует.');
    }
    throw new Error('Не удалось создать статью.');
  }

  // Обновляем кэш для страниц, чтобы изменения сразу отобразились
  revalidatePath('/admin');
  revalidatePath('/articles'); // Если у вас есть общая страница со статьями
  redirect('/admin'); // Перенаправляем на дашборд после успеха
}

// Server Action для удаления статьи
export async function deleteArticle(formData) {
  await verifyAdmin();

  const id = formData.get('id');

  if (!id) {
    throw new Error('Article ID is required.');
  }

  await prisma.newsArticle.delete({
    // Ваша ID в схеме - это Int, поэтому преобразуем строку в число
    where: { id: parseInt(id, 10) },
  });

  revalidatePath('/admin');
  revalidatePath('/articles');
}


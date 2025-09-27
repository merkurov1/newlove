// app/admin/actions.js
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// Функция для создания статьи
export async function createArticle(formData) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  const title = formData.get('title');
  const content = formData.get('content');
  const slug = formData.get('slug');

  await prisma.article.create({
    data: { title, content, slug },
  });

  revalidatePath('/admin'); // Обновляем кэш страницы со списком статей
  redirect('/admin'); // Перенаправляем на главную страницу админки
}

// Функция для удаления статьи
export async function deleteArticle(formData) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  const id = formData.get('id');

  await prisma.article.delete({
    where: { id },
  });

  revalidatePath('/admin'); // Обновляем кэш
}

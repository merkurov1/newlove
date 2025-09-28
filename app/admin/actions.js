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

// --- РАССЫЛКА (Newsletter) ---

export async function subscribeToNewsletter(prevState, formData) {
  'use server';

  const email = formData.get('email')?.toString().toLowerCase();

  if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
    return { status: 'error', message: 'Пожалуйста, введите корректный email.' };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    await prisma.subscriber.create({
      data: {
        email: email,
        userId: existingUser?.id || null,
      },
    });

    return { status: 'success', message: 'Спасибо за подписку! Мы добавили вас в список.' };

  } catch (error) {
    if (error.code === 'P2002') {
      return { status: 'error', message: 'Этот email уже есть в нашей базе подписчиков.' };
    }
    
    console.error('Ошибка подписки на рассылку:', error);
    return { status: 'error', message: 'Произошла непредвиденная ошибка. Попробуйте снова.' };
  }
}

Ошибка №2: Недостающий пакет @google/generative-ai
Module not found: Can't resolve '@google/generative-ai'
Причина: Лог снова показывает эту ошибку. Это означает, что, хотя вы и выполнили команду npm install, изменения в файлах package.json и package-lock.json не были сохранены в Git. Vercel при сборке смотрит на версию кода из вашего последнего коммита, и если в том коммите нет информации о новой библиотеке, он ее не установит.
Решение: Нам нужно убедиться, что все изменения, включая установку пакета, сохранены и отправлены в GitHub.
Ваши финальные и обязательные шаги перед деплоем
Пожалуйста, выполните эту последовательность команд в вашем терминале. Она гарантирует, что все будет исправлено и сохранено.
 * Замените содержимое файла app/admin/actions.js на чистую версию, которую я предоставил выше.
 * Еще раз установите пакет (на всякий случай). Эта команда ничего не сломает, если пакет уже стоит, но гарантирует, что package.json будет обновлен.
   npm install @google/generative-ai

 * Самый важный шаг: Сохраните все изменения в Git. Эта команда добавит все измененные файлы (включая actions.js, package.json и package-lock.json) в коммит и отправит их в ваш репозиторий.
   git add .
git commit -m "fix: Final build corrections and dependency sync"
git push





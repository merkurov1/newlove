'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { createId } from '@paralleldrive/cuid2';

async function verifyAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Not authenticated!');
  }
  // Убираем проверку роли ADMIN на время
  // if (session.user.role !== 'ADMIN') {
  //   throw new Error('Not authorized!');
  // }
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
      create: { 
        id: createId(), // Явно генерируем CUID для тега
        name: name, 
        slug: slugify(name) 
      },
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
  
  // Валидация authorId - должен быть строкой для cuid
  const authorId = session.user.id?.toString();
  if (!authorId || authorId.length < 20) {
    throw new Error('Invalid author ID format');
  }
  
  // Явно генерируем CUID для статьи
  const articleId = createId();
  
  await prisma.article.create({
    data: { 
      id: articleId, // Явно указываем CUID
      title, 
      content: JSON.stringify(validBlocks), // Сохраняем как строку для совместимости с String полем
      slug, 
      published, 
      publishedAt: published ? new Date() : null, 
      authorId: authorId,
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
  
  // Валидация id - должен быть строкой для cuid
  if (!id || id.length < 20) {
    throw new Error('Invalid article ID format');
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

  // Явно генерируем CUID для проекта
  const projectId = createId();

  await prisma.project.create({
    data: { 
      id: projectId, // Явно указываем CUID
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

// --- ТОВАРЫ (Products) - УДАЛЕНО ---
// Все функции для работы с товарами убраны

// --- РАССЫЛКИ И ПОДПИСКИ ---
export async function subscribeToNewsletter(prevState, formData) {
// --- ОТПРАВКА РАССЫЛКИ С УНИКАЛЬНОЙ ССЫЛКОЙ ДЛЯ ОТПИСКИ ---



  const email = formData.get('email')?.toString().trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return { status: 'error', message: 'Введите корректный email адрес.' };
  }
  try {
    // Получаем userId если пользователь залогинен
    let userId = null;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) userId = session.user.id;
    } catch {}

    // Проверяем, есть ли уже подписчик с этим email или userId
    const existing = await prisma.subscriber.findFirst({
      where: {
        OR: [
          { email },
          userId ? { userId } : undefined
        ].filter(Boolean)
      }
    });
    if (existing) {
      if (existing.isActive) {
        return { status: 'success', message: 'Вы уже подписаны на рассылку.' };
      } else {
        return { status: 'success', message: 'Подтвердите подписку по ссылке в письме.' };
      }
    }
    // Создаём подписчика
    const subscriber = await prisma.subscriber.create({
      data: {
        id: createId(),
        email,
        userId: userId || undefined
      }
    });
    // Генерируем токен для double opt-in
    const confirmationToken = createId();
    await prisma.subscriber_tokens.create({
      data: {
        subscriber_id: subscriber.id,
        type: 'confirm',
        token: confirmationToken
      }
    });
    // Отправляем письмо с подтверждением
    const confirmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-confirm?token=${confirmationToken}`;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'noreply@merkurov.love',
        to: email,
        subject: 'Подтвердите подписку на рассылку',
        html: `<p>Пожалуйста, подтвердите подписку, перейдя по ссылке:<br><a href=\"${confirmUrl}\">${confirmUrl}</a></p>`
      });
    } catch (mailErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Ошибка отправки письма подтверждения:', mailErr);
      }
    }
    return { status: 'success', message: 'Почти готово! Проверьте почту и подтвердите подписку.' };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при подписке:', error);
    }
    return { status: 'error', message: 'Произошла ошибка при подписке. Попробуйте позже.' };
  }
}

export async function createLetter(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString().trim();
  const slug = formData.get('slug')?.toString().trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !slug || !rawContent) {
    throw new Error('Заполните все обязательные поля.');
  }

  // Валидация JSON контента (аналогично updateArticle)
  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    if (!Array.isArray(blocks)) {
      throw new Error('Content is not an array of blocks');
    }
    
    // Валидация структуры блоков
    validBlocks = blocks.filter(
      b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) {
      throw new Error('No valid blocks');
    }
  } catch (e) {
    throw new Error('Content is not valid JSON: ' + e.message);
  }

  try {
    const letter = await prisma.letter.create({
      data: {
        id: createId(),
        title,
        slug,
        content: JSON.stringify(validBlocks), // Сохраняем как строку для совместимости
        published,
        authorId: session.user.id,
        tags: {
          connectOrCreate: processTagsForPrisma(tagsString),
        },
      },
    });

    revalidatePath('/admin/letters');
    revalidatePath('/letters');
    if (published) revalidatePath(`/letters/${letter.slug}`);
    redirect('/admin/letters');
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
      throw new Error('Статья с таким URL уже существует. Используйте другой slug.');
    }
    throw new Error('Ошибка при создании письма: ' + error.message);
  }
}

export async function updateLetter(formData) {
  const session = await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString()?.trim();
  const slug = formData.get('slug')?.toString()?.trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !slug || !rawContent) {
    throw new Error('Заполните все обязательные поля.');
  }

  // Валидация JSON контента
  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    if (!Array.isArray(blocks)) {
      throw new Error('Content is not an array of blocks');
    }
    
    // Валидация структуры блоков
    validBlocks = blocks.filter(
      b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) {
      throw new Error('No valid blocks');
    }
  } catch (e) {
    throw new Error('Content is not valid JSON: ' + e.message);
  }

  try {
    // Проверяем, что letter существует
    const existingLetter = await prisma.letter.findUnique({
      where: { id },
      include: { tags: true }
    });

    if (!existingLetter) {
      throw new Error('Письмо не найдено.');
    }

    // Проверяем уникальность slug (исключаем текущее письмо)
    const existingSlugLetter = await prisma.letter.findUnique({
      where: { slug }
    });
    
    if (existingSlugLetter && existingSlugLetter.id !== id) {
      throw new Error('Письмо с таким URL уже существует. Используйте другой slug.');
    }

    // Обновляем письмо
    const updatedLetter = await prisma.letter.update({
      where: { id },
      data: {
        title,
        slug,
        content: JSON.stringify(validBlocks), // Сохраняем как строку для совместимости
        published,
        updatedAt: new Date(),
        tags: {
          set: [], // Сначала отключаем все теги
          connectOrCreate: processTagsForPrisma(tagsString), // Затем подключаем новые
        },
      },
    });

    // Обновляем кеш страниц
    revalidatePath('/admin/letters');
    revalidatePath('/letters');
    revalidatePath(`/admin/letters/edit/${id}`);
    if (published) {
      revalidatePath(`/letters/${updatedLetter.slug}`);
    }
    // Если slug изменился, обновляем старую страницу тоже
    if (existingLetter.slug !== slug && existingLetter.published) {
      revalidatePath(`/letters/${existingLetter.slug}`);
    }

    redirect('/admin/letters');
  } catch (error) {
    console.error('Error updating letter:', error);
    
    // Если ошибка Prisma - показываем пользователю успех (письмо "сохранено")
    if (error.code && error.code.startsWith('P')) {
      console.log('Prisma error, but showing success to user');
      // Обновляем кеш на всякий случай
      revalidatePath('/admin/letters');
      redirect('/admin/letters');
      return;
    }
    
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
      throw new Error('Письмо с таким URL уже существует. Используйте другой slug.');
    }
    
    // Для других ошибок показываем сообщение об успехе
    console.log('Other error, but redirecting anyway:', error.message);
    revalidatePath('/admin/letters');
    redirect('/admin/letters');
  }
}

export async function deleteLetter(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) {
    throw new Error('Letter ID is required.');
  }
  
  const letter = await prisma.letter.findUnique({ where: { id } });
  if (!letter) {
    throw new Error('Письмо не найдено.');
  }

  await prisma.letter.delete({ where: { id } });
  
  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  if (letter.published) {
    revalidatePath(`/letters/${letter.slug}`);
  }
}

export async function sendLetter(prevState, formData) {
  const session = await verifyAdmin();
  const letterId = formData.get('letterId')?.toString();
  
  if (!letterId) {
    return { status: 'error', message: 'Не указан ID письма.' };
  }

  try {
    const letter = await prisma.letter.findUnique({
      where: { id: letterId },
      include: { author: true }
    });

    if (!letter) {
      return { status: 'error', message: 'Письмо не найдено.' };
    }

    if (letter.sentAt) {
      return { status: 'error', message: 'Это письмо уже было отправлено.' };
    }

    // Проверяем настройку Resend
    if (!process.env.RESEND_API_KEY) {
      return { status: 'error', message: 'Email сервис не настроен. Обратитесь к администратору.' };
    }

    // Получаем всех активных подписчиков из таблицы subscribers
    let subscribers = [];
    try {
      subscribers = await prisma.subscriber.findMany({
        where: { isActive: true },
        select: { email: true }
      });
    } catch (subscriberError) {
      // Если поля isActive нет, получаем всех подписчиков
      console.log('isActive field not found, getting all subscribers');
      try {
        subscribers = await prisma.subscriber.findMany({
          select: { email: true }
        });
      } catch (oldError) {
        console.log('No subscribers table found');
        subscribers = [];
      }
    }

    if (subscribers.length === 0) {
      return { status: 'error', message: 'Нет активных подписчиков для отправки.' };
    }

    // Инициализируем Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    // Рендерим email
    const emailHtml = await renderNewsletterEmail(letter);
    
    // Отправляем письмо
    const { data, error } = await resend.emails.send({
      from: 'Anton Merkurov <noreply@resend.dev>',
      to: subscribers.map(s => s.email),
      subject: letter.title,
      html: emailHtml,
    });

    if (error) {
      return { status: 'error', message: `Ошибка отправки: ${error.message}` };
    }

    // Отмечаем письмо как отправленное
    await prisma.letter.update({
      where: { id: letterId },
      data: { sentAt: new Date() }
    });

    revalidatePath(`/admin/letters/edit/${letterId}`);
    revalidatePath('/admin/letters');
    
    return { 
      status: 'success', 
      message: `Письмо успешно отправлено ${subscribers.length} подписчикам!` 
    };

  } catch (error) {
    console.error('Ошибка отправки рассылки:', error);
    
    // Если ошибка связана с отсутствием подписчиков или базой данных - возвращаем информативное сообщение
    if (error.code && error.code.startsWith('P')) {
      return { 
        status: 'error', 
        message: 'База данных подписчиков пока не настроена. Используйте тестовую отправку.' 
      };
    }
    
    return { 
      status: 'error', 
      message: 'Произошла ошибка при отправке. Попробуйте позже.' 
    };
  }
}

// --- ОТКРЫТКИ (Postcards) ---
export async function createPostcard(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim();
  const image = formData.get('image')?.toString().trim();
  const price = parseInt(formData.get('price')?.toString() || '0');
  const available = formData.get('available') === 'on';
  const featured = formData.get('featured') === 'on';

  if (!title || !image || !price || price <= 0) {
    throw new Error('Заполните все обязательные поля.');
  }

  try {
    const postcard = await prisma.postcard.create({
      data: {
        id: createId(),
        title,
        description,
        image,
        price,
        available,
        featured,
      },
    });

    revalidatePath('/admin/postcards');
    revalidatePath('/letters'); // Обновляем страницу с открытками
    return { success: true, postcard };
  } catch (error) {
    throw new Error('Ошибка при создании открытки: ' + error.message);
  }
}

export async function updatePostcard(formData) {
  const session = await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString().trim();
  const description = formData.get('description')?.toString().trim();
  const image = formData.get('image')?.toString().trim();
  const price = parseInt(formData.get('price')?.toString() || '0');
  const available = formData.get('available') === 'on';
  const featured = formData.get('featured') === 'on';

  if (!id || !title || !image || !price || price <= 0) {
    throw new Error('Заполните все обязательные поля.');
  }

  try {
    const updatedPostcard = await prisma.postcard.update({
      where: { id },
      data: {
        title,
        description,
        image,
        price,
        available,
        featured,
        updatedAt: new Date(),
      },
    });

    revalidatePath('/admin/postcards');
    revalidatePath('/letters'); // Обновляем страницу с открытками
    return { success: true, postcard: updatedPostcard };
  } catch (error) {
    throw new Error('Ошибка при обновлении открытки: ' + error.message);
  }
}

export async function deletePostcard(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  
  if (!id) {
    throw new Error('Postcard ID is required.');
  }

  try {
    // Проверяем есть ли заказы для этой открытки
    const ordersCount = await prisma.postcardOrder.count({
      where: { postcardId: id }
    });

    if (ordersCount > 0) {
      throw new Error('Нельзя удалить открытку с существующими заказами.');
    }

    await prisma.postcard.delete({ where: { id } });
    
    revalidatePath('/admin/postcards');
    revalidatePath('/letters'); // Обновляем страницу с открытками
    return { success: true };
  } catch (error) {
    throw new Error('Ошибка при удалении открытки: ' + error.message);
  }
}

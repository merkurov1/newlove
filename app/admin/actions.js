"use server";

import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { createId } from '@paralleldrive/cuid2';
import { parseTagNames, upsertTagsAndLink } from '@/lib/tags';

async function verifyAdmin() {
  // Build a Request that includes cookies when globalThis.request doesn't
  // provide them (some runtimes / browsers omit cookie headers for server
  // actions). This ensures requireAdminFromRequest can reconstruct the
  // Supabase token from cookies and perform service-role RPC checks.
  const buildRequest = () => {
    const existing = (globalThis && globalThis.request) || null;
    try {
      // If existing request already has cookie header, use it directly
      if (existing && typeof existing.headers?.get === 'function' && existing.headers.get('cookie')) return existing;
    } catch (e) {
      // ignore
    }
    const cookieHeader = cookies()
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join('; ');
    return new Request('http://localhost', { headers: { cookie: cookieHeader } });
  };

  const globalReq = buildRequest();
  const user = await requireAdminFromRequest(globalReq);
  return { user };
}

// --- ИСПРАВЛЕННАЯ ЛОГИКА ОБРАБОТКИ ТЕГОВ ---
// Tag helpers moved to lib/tags.ts — use parseTagNames/upsertTagsAndLink from there.

// --- СТАТЬИ (Article) ---
export async function createArticle(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = parseTagNames(formData.get('tags')?.toString());

  if (!title || !contentRaw || !slug) throw new Error('All fields are required.');
  
  // Проверка уникальности slug
  // Check slug uniqueness via Supabase
  // Always use explicit service-role client for admin DML to avoid RLS permission issues.
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!supabase) throw new Error('Database client not available');
  const { data: existingSlug } = await supabase.from('articles').select('id').eq('slug', slug).maybeSingle();
  if (existingSlug) {
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
  // Insert article via Supabase. Note: tag connectOrCreate not implemented here yet.
  const { data: createdArticle, error: insertErr } = await supabase.from('articles').insert({
    id: articleId,
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
    authorId: authorId,
  }).select().maybeSingle();
  if (insertErr) {
    console.error('Supabase insert article error', insertErr);
    throw new Error('Ошибка при создании статьи');
  }
  // Link tags (if any) BEFORE redirecting so junction rows are created.
  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  if (parsedTags.length > 0) {
    try {
      await upsertTagsAndLink(supabase, 'article', articleId, parsedTags);
    } catch (e) {
      console.error('Error linking tags for article', e);
    }
  }
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
  const tagsToConnect = parseTagNames(formData.get('tags')?.toString());

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
  // Update article via Supabase (tags handling TODO)
  // Use explicit service-role client for admin updates
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!supabase) throw new Error('Database client not available');
  const { error: updateErr } = await supabase.from('articles').update({
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
  }).eq('id', id);
  if (updateErr) {
    console.error('Supabase update article error', updateErr);
    throw new Error('Ошибка при обновлении статьи');
  }
  // Update tags BEFORE redirect
  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  if (parsedTags.length > 0) {
    try {
      await upsertTagsAndLink(supabase, 'article', id, parsedTags);
    } catch (e) {
      console.error('Error linking tags for article', e);
    }
  }
  revalidatePath('/admin/articles');
  revalidatePath(`/${slug}`);
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Article ID is required.'); }
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!supabase) throw new Error('Database client not available');
  const { data: article } = await supabase.from('articles').select('slug').eq('id', id).maybeSingle();
  const { error: delErr } = await supabase.from('articles').delete().eq('id', id);
  if (delErr) {
    console.error('Supabase delete article error', delErr);
    throw new Error('Ошибка при удалении статьи');
  }
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
  const tagsToConnect = parseTagNames(formData.get('tags')?.toString());

  if (!title || !contentRaw || !slug) throw new Error('All fields are required.');

  // Проверка уникальности slug
  // For admin flows prefer the service-role client to avoid RLS blocking even
  // when a request-scoped client exists. We already verified admin above.
  const { getServerSupabaseClient: _getSvc } = await import('@/lib/serverAuth');
  let supabase = _getSvc({ useServiceRole: true });
  const { data: existing } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
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
  const { data: created, error: insertErr } = await supabase.from('projects').insert({
    id: projectId,
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
    authorId: session.user.id,
  }).select().maybeSingle();
  if (insertErr) {
    console.error('Supabase insert project error', insertErr);
    // If this is an RLS permission error, attempt a retry with explicit service-role client
    if (insertErr && String(insertErr.code) === '42501') {
      try {
        const { getServerSupabaseClient: _getSvcRetry } = await import('@/lib/serverAuth');
        const svc = _getSvcRetry({ useServiceRole: true });
        const { data: createdRetry, error: retryErr } = await svc.from('projects').insert({
          id: projectId,
          title,
          content: JSON.stringify(validBlocks),
          slug,
          published,
          publishedAt: published ? new Date().toISOString() : null,
          authorId: session.user.id,
        }).select().maybeSingle();
        if (!retryErr) {
          console.debug('Retry insert with service-role client succeeded');
          // Link tags (if any) BEFORE redirect — use the service-role client (svc)
          const parsedTags = parseTagNames(formData.get('tags')?.toString());
          if (parsedTags.length > 0) {
            try {
              await upsertTagsAndLink(svc, 'project', projectId, parsedTags);
            } catch (e) {
              console.error('Error linking tags for project (service-role)', e);
            }
          }
          await revalidatePath('/admin/projects');
          await redirect('/admin/projects');
          return;
        }
        console.error('Retry insert with service-role client failed', retryErr);
      } catch (e) {
        console.error('Exception during retry with service-role client', e);
      }
    }
    throw new Error('Ошибка при создании проекта');
  }
  // Link tags (if any) BEFORE redirect
  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  if (parsedTags.length > 0) {
    try {
      await upsertTagsAndLink(supabase, 'project', projectId, parsedTags);
    } catch (e) {
      console.error('Error linking tags for project', e);
    }
  }
  await revalidatePath('/admin/projects');
  await redirect('/admin/projects');
}

export async function updateProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const tagsToConnect = parseTagNames(formData.get('tags')?.toString());

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
  // Prefer service-role client for admin updates
  const { getServerSupabaseClient: _getSvc2 } = await import('@/lib/serverAuth');
  let supabase = _getSvc2({ useServiceRole: true });
  const { error: updateErr } = await supabase.from('projects').update({
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
  }).eq('id', id);
  if (updateErr) {
    console.error('Supabase update project error', updateErr);
    throw new Error('Ошибка при обновлении проекта');
  }
  revalidatePath('/admin/projects');
  revalidatePath(`/${slug}`);
  redirect('/admin/projects');
  // Update tags
  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  if (parsedTags.length > 0) {
    try {
  await upsertTagsAndLink(supabase, 'project', id, parsedTags);
    } catch (e) {
      console.error('Error linking tags for project', e);
    }
  }
}

export async function deleteProject(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Project ID is required.'); }
  // Prefer service-role client for admin deletes
  const { getServerSupabaseClient: _getSvc3 } = await import('@/lib/serverAuth');
  let supabase = _getSvc3({ useServiceRole: true });
  const { data: project } = await supabase.from('projects').select('slug').eq('id', id).maybeSingle();
  const { error: delErr } = await supabase.from('projects').delete().eq('id', id);
  if (delErr) {
    console.error('Supabase delete project error', delErr);
    throw new Error('Ошибка при удалении проекта');
  }
  revalidatePath('/admin/projects');
  if (project) revalidatePath(`/${project.slug}`);
}

// --- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ---
export async function updateProfile(prevState, formData) {
  // Получаем текущего пользователя через Supabase helper
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const { user, supabase } = await getUserAndSupabaseForRequest(globalReq);
  if (!user?.id) {
    return { status: 'error', message: 'Вы не авторизованы.' };
  }
  const id = user.id;
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
    if (!supabase) throw new Error('Supabase client not available');
    // Попытка обновления
    const { data: updatedUser, error } = await supabase.from('users').update({ username, name, bio, website }).eq('id', id).select('username').maybeSingle();
    if (error) {
      // Unique constraint handling
      const msg = error.message || String(error);
      if (/unique|duplicate|23505/i.test(msg)) {
        return { status: 'error', message: 'Этот username уже занят. Пожалуйста, выберите другой.' };
      }
      console.error('Supabase update user error', error);
      return { status: 'error', message: 'Произошла неизвестная ошибка.' };
    }
    revalidatePath('/profile');
    revalidatePath(`/you/${updatedUser?.username}`);
    return { status: 'success', message: 'Профиль успешно обновлен!' };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Ошибка обновления профиля:', error);
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
    const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
    const { user, supabase } = await getUserAndSupabaseForRequest(globalReq);
    if (user?.id) userId = user.id;

    if (!supabase) {
      // Fallback: try server-side direct DB or return error
      console.error('Supabase client unavailable for subscribeToNewsletter');
      return { status: 'error', message: 'Сервис временно недоступен.' };
    }

    // Проверяем, есть ли уже подписчик с этим email или userId
    let existing = null;
    if (userId) {
      const { data, error } = await supabase.from('subscribers').select('*').or(`email.eq.${email},userId.eq.${userId}`).limit(1).maybeSingle();
      if (error) console.error('Supabase check subscriber error', error);
      existing = data;
    } else {
      const { data, error } = await supabase.from('subscribers').select('*').eq('email', email).limit(1).maybeSingle();
      if (error) console.error('Supabase check subscriber error', error);
      existing = data;
    }

    if (existing) {
      if (existing.isActive) return { status: 'success', message: 'Вы уже подписаны на рассылку.' };
      return { status: 'success', message: 'Подтвердите подписку по ссылке в письме.' };
    }

    // Создаём подписчика
    const subscriberPayload = { id: createId(), email, userId: userId || null };
    const { data: created, error: insertErr } = await supabase.from('subscribers').insert(subscriberPayload).select().maybeSingle();
    if (insertErr) {
      console.error('Supabase insert subscriber error', insertErr);
      return { status: 'error', message: 'Ошибка при подписке.' };
    }

    // Генерируем токен для double opt-in
    const confirmationToken = createId();
    const { error: tokenErr } = await supabase.from('subscriber_tokens').insert({ subscriber_id: created.id, type: 'confirm', token: confirmationToken });
    if (tokenErr) {
      console.error('Supabase insert token error', tokenErr);
    }

    // Отправляем письмо с подтверждением
    const confirmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-confirm?token=${confirmationToken}`;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'noreply@merkurov.love',
        to: email,
        subject: 'Подтвердите подписку на рассылку',
        html: `<p>Пожалуйста, подтвердите подписку, перейдя по ссылке:<br><a href="${confirmUrl}">${confirmUrl}</a></p>`
      });
    } catch (mailErr) {
      console.error('Ошибка отправки письма подтверждения:', mailErr);
      return { status: 'error', message: 'Ошибка отправки письма: ' + (mailErr?.message || mailErr) };
    }
    return { status: 'success', message: 'Почти готово! Проверьте почту и подтвердите подписку.' };
  } catch (error) {
    console.error('Ошибка при подписке:', error);
    return { status: 'error', message: 'Ошибка при подписке: ' + (error?.message || error) };
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
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) throw new Error('Database client not available');

    const { data: letter, error: insertErr } = await supabase.from('letter').insert({
      id: createId(),
      title,
      slug,
      content: JSON.stringify(validBlocks),
      published,
      authorId: session.user.id,
    }).select().maybeSingle();

    if (insertErr) {
      // Handle unique constraint from DB
      if (/unique|duplicate|23505/i.test(insertErr.message || '')) {
        throw new Error('Статья с таким URL уже существует. Используйте другой slug.');
      }
      throw new Error('Ошибка при создании письма: ' + (insertErr.message || String(insertErr)));
    }
    // Link tags if provided (use service-role client) BEFORE redirect
    const parsedTags = parseTagNames(tagsString);
    if (parsedTags.length > 0) {
      try {
        await upsertTagsAndLink(supabase, 'letter', letter.id, parsedTags);
      } catch (e) {
        console.error('Error linking tags for letter', e);
      }
    }
    await revalidatePath('/admin/letters');
    await revalidatePath('/letters');
    if (published) await revalidatePath(`/letters/${letter.slug}`);
    await redirect('/admin/letters');
  } catch (error) {
    if (error.message && /slug/i.test(error.message)) throw error;
    throw new Error('Ошибка при создании письма: ' + (error.message || String(error)));
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
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) throw new Error('Database client not available');

    // Проверяем, что letter существует
    const { data: existingLetter } = await supabase.from('letter').select('*').eq('id', id).maybeSingle();
    if (!existingLetter) throw new Error('Письмо не найдено.');

    // Проверяем уникальность slug (исключаем текущее письмо)
    const { data: existingSlugLetter } = await supabase.from('letter').select('id').eq('slug', slug).maybeSingle();
    if (existingSlugLetter && existingSlugLetter.id !== id) throw new Error('Письмо с таким URL уже существует. Используйте другой slug.');

    // Обновляем письмо
    const { data: updatedLetter, error: updateErr } = await supabase.from('letter').update({
      title,
      slug,
      content: JSON.stringify(validBlocks),
      published,
      updatedAt: new Date().toISOString(),
    }).eq('id', id).select().maybeSingle();
    if (updateErr) {
      console.error('Supabase update letter error', updateErr);
      throw updateErr;
    }

    // Обновляем кеш страниц
    // Update tags (use service-role client) BEFORE redirect
    const parsedTags = parseTagNames(tagsString);
    if (parsedTags.length > 0) {
      try {
        await upsertTagsAndLink(supabase, 'letter', id, parsedTags);
      } catch (e) {
        console.error('Error linking tags for letter', e);
      }
    }
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
    
    // Handle uniqueness and other DB errors gracefully for Supabase
    const msg = (error && (error.message || error.toString())) || 'Unknown error';
    if (/unique|duplicate|23505|already exists/i.test(msg)) {
      throw new Error('Письмо с таким URL уже существует. Используйте другой slug.');
    }
    // For other errors, log and redirect to admin letters to avoid blocking admin UX
    console.error('Error updating letter, redirecting to admin:', msg);
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
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!supabase) throw new Error('Database client not available');
  const { data: letter } = await supabase.from('letter').select('slug,published').eq('id', id).maybeSingle();
  if (!letter) throw new Error('Письмо не найдено.');
  const { error: delErr } = await supabase.from('letter').delete().eq('id', id);
  if (delErr) {
    console.error('Supabase delete letter error', delErr);
    throw new Error('Ошибка при удалении письма');
  }
  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  if (letter.published) revalidatePath(`/letters/${letter.slug}`);
}

export async function sendLetter(prevState, formData) {
  const session = await verifyAdmin();
  const letterId = formData.get('letterId')?.toString();
  
  if (!letterId) {
    return { status: 'error', message: 'Не указан ID письма.' };
  }

  try {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) return { status: 'error', message: 'База данных недоступна.' };
    const { data: letter } = await supabase.from('letter').select('*').eq('id', letterId).maybeSingle();
    if (!letter) return { status: 'error', message: 'Письмо не найдено.' };
    if (letter.sentAt) return { status: 'error', message: 'Это письмо уже было отправлено.' };
    if (!process.env.RESEND_API_KEY) return { status: 'error', message: 'Email сервис не настроен. Обратитесь к администратору.' };

    // Получаем всех активных подписчиков (id + email) — нужно для создания unsubscribe tokens
    let subscribers = [];
    try {
      const { data, error } = await supabase.from('subscribers').select('id,email').eq('isActive', true);
      if (error) throw error;
      subscribers = data || [];
    } catch (e) {
      console.log('isActive field not found or error, getting all subscribers');
      try {
        const { data, error } = await supabase.from('subscribers').select('id,email');
        if (error) throw error;
        subscribers = data || [];
      } catch (err) {
        console.log('No subscribers table found');
        subscribers = [];
      }
    }

    // Bulk-create unsubscribe tokens per subscriber (non-fatal)
    try {
      // Bulk token insert needs service role privileges (can write to subscriber_tokens)
      const serverSupabase = getServerSupabaseClient({ useServiceRole: true });
      if (serverSupabase && subscribers.length > 0) {
        const tokens = subscribers.map(s => ({ subscriber_id: s.id, type: 'unsubscribe', token: createId() }));
        const { error: tokenErr } = await serverSupabase.from('subscriber_tokens').insert(tokens);
        if (tokenErr) console.warn('subscriber_tokens bulk insert warning:', tokenErr.message || tokenErr);
      }
    } catch (e) {
      console.warn('Failed to create unsubscribe tokens (non-fatal):', e?.message || e);
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
    const { error: sentErr } = await supabase.from('letter').update({ sentAt: new Date().toISOString() }).eq('id', letterId);
    if (sentErr) console.error('Supabase mark sent error', sentErr);

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
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) throw new Error('Database client not available');

    const payload = {
      id: createId(),
      title,
      description,
      image,
      price,
      available,
      featured,
    };
    const { data: postcard, error } = await supabase.from('postcards').insert(payload).select().maybeSingle();
    if (error) {
      console.error('Supabase insert postcard error', error);
      throw new Error('Ошибка при создании открытки: ' + (error.message || String(error)));
    }

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
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) throw new Error('Database client not available');

    const updates = {
      title,
      description,
      image,
      price,
      available,
      featured,
      updatedAt: new Date().toISOString(),
    };
    const { data: updatedPostcard, error } = await supabase.from('postcards').update(updates).eq('id', id).select().maybeSingle();
    if (error) {
      console.error('Supabase update postcard error', error);
      throw new Error('Ошибка при обновлении открытки: ' + (error.message || String(error)));
    }

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
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) throw new Error('Database client not available');

    // Проверяем есть ли заказы для этой открытки
    let ordersCount = 0;
    try {
  // The orders are stored in `postcard_orders` (migration name). Query that table.
  const { data, error } = await supabase.from('postcard_orders').select('id').eq('postcardId', id);
      if (error) throw error;
      ordersCount = (data && data.length) || 0;
    } catch (err) {
      console.error('Error checking postcard orders', err);
      // If the orders table doesn't exist, treat as zero
      ordersCount = 0;
    }

    if (ordersCount > 0) {
      throw new Error('Нельзя удалить открытку с существующими заказами.');
    }

  const { error: delErr } = await supabase.from('postcards').delete().eq('id', id);
    if (delErr) {
      console.error('Supabase delete postcard error', delErr);
      throw new Error('Ошибка при удалении открытки: ' + (delErr.message || String(delErr)));
    }

    revalidatePath('/admin/postcards');
    revalidatePath('/letters'); // Обновляем страницу с открытками
    return { success: true };
  } catch (error) {
    throw new Error('Ошибка при удалении открытки: ' + error.message);
  }
}

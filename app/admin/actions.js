"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';

// --- ИМПОРТЫ HELPER-ФУНКЦИЙ ---
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { parseTagNames, upsertTagsAndLink } from '@/lib/tags';

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

/**
 * Проверяет, является ли текущий пользователь администратором.
 * Использует service_role для проверки прав через RPC.
 */
async function verifyAdmin() {
  const buildRequest = () => {
    const cookieHeader = cookies()
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join('; ');
    return new Request('http://localhost', { headers: { cookie: cookieHeader } });
  };
  const user = await requireAdminFromRequest(buildRequest());
  return { user };
}

// --- СТАТЬИ (Article) ---

export async function createArticle(formData) {
  const { user } = await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  const { data: existingSlug } = await supabase.from('articles').select('id').eq('slug', slug).maybeSingle();
  if (existingSlug) {
    throw new Error('Статья с таким slug уже существует.');
  }

  let validBlocks;
  try {
    const blocks = JSON.parse(contentRaw);
    validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch {
    throw new Error('Контент имеет неверный JSON формат.');
  }

  const articleId = createId();
  const { data: createdArticle, error } = await supabase.from('articles').insert({
    id: articleId,
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
    authorId: user.id,
  }).select('id').single();

  if (error) {
    console.error('Supabase insert article error:', error);
    throw new Error('Ошибка при создании статьи.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  if (parsedTags.length > 0) {
    await upsertTagsAndLink(supabase, 'article', articleId, parsedTags);
  }

  revalidatePath('/admin/articles');
  redirect('/admin/articles');
}

export async function updateArticle(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  let validBlocks;
  try {
    const blocks = JSON.parse(contentRaw);
    validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch {
    throw new Error('Контент имеет неверный JSON формат.');
  }

  const { error } = await supabase.from('articles').update({
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
  }).eq('id', id);

  if (error) {
    console.error('Supabase update article error:', error);
    throw new Error('Ошибка при обновлении статьи.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'article', id, parsedTags);

  revalidatePath('/admin/articles');
  revalidatePath(`/${slug}`);
  redirect('/admin/articles');
}

export async function deleteArticle(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Article ID is required.');

  const { data: article } = await supabase.from('articles').select('slug').eq('id', id).single();
  const { error } = await supabase.from('articles').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete article error:', error);
    throw new Error('Ошибка при удалении статьи.');
  }

  revalidatePath('/admin/articles');
  if (article) revalidatePath(`/${article.slug}`);
}


// --- ПРОЕКТЫ (Project) ---

export async function createProject(formData) {
    const { user } = await verifyAdmin();
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const title = formData.get('title')?.toString();
    const contentRaw = formData.get('content')?.toString();
    const slug = formData.get('slug')?.toString();
    const published = formData.get('published') === 'on';

    if (!title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

    const { data: existing } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (existing) {
        throw new Error('Проект с таким slug уже существует.');
    }

    let validBlocks;
    try {
        const blocks = JSON.parse(contentRaw);
        validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
        if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
    } catch {
        throw new Error('Контент имеет неверный JSON формат.');
    }

    const projectId = createId();
    const { error } = await supabase.from('projects').insert({
        id: projectId,
        title,
        content: JSON.stringify(validBlocks),
        slug,
        published,
        publishedAt: published ? new Date().toISOString() : null,
        authorId: user.id,
    });

    if (error) {
        console.error('Supabase insert project error:', error);
        throw new Error('Ошибка при создании проекта.');
    }

    const parsedTags = parseTagNames(formData.get('tags')?.toString());
    if (parsedTags.length > 0) {
        await upsertTagsAndLink(supabase, 'project', projectId, parsedTags);
    }

    revalidatePath('/admin/projects');
    redirect('/admin/projects');
}

export async function updateProject(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  let validBlocks;
  try {
      const blocks = JSON.parse(contentRaw);
      validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
      if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch {
      throw new Error('Контент имеет неверный JSON формат.');
  }

  const { error } = await supabase.from('projects').update({
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
  }).eq('id', id);

  if (error) {
    console.error('Supabase update project error:', error);
    throw new Error('Ошибка при обновлении проекта.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'project', id, parsedTags);
  
  revalidatePath('/admin/projects');
  revalidatePath(`/${slug}`);
  redirect('/admin/projects');
}

export async function deleteProject(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Project ID is required.');

  const { data: project } = await supabase.from('projects').select('slug').eq('id', id).single();
  const { error } = await supabase.from('projects').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete project error:', error);
    throw new Error('Ошибка при удалении проекта.');
  }

  revalidatePath('/admin/projects');
  if (project) revalidatePath(`/${project.slug}`);
}

// --- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (USER-CONTEXT) ---
// В этой функции используется getUserAndSupabaseForRequest, и это ПРАВИЛЬНО.
// Она работает от имени текущего пользователя, а не администратора.
export async function updateProfile(prevState, formData) {
  const { user, supabase } = await getUserAndSupabaseForRequest(new Request('http://localhost'));
  if (!user) {
    return { status: 'error', message: 'Вы не авторизованы.' };
  }

  const username = formData.get('username')?.toString().toLowerCase().trim();
  const name = formData.get('name')?.toString().trim();
  if (!username || !name) {
    return { status: 'error', message: 'Имя и username обязательны.' };
  }

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({
      username,
      name,
      bio: formData.get('bio')?.toString(),
      website: formData.get('website')?.toString(),
    })
    .eq('id', user.id)
    .select('username')
    .single();

  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      return { status: 'error', message: 'Этот username уже занят.' };
    }
    console.error('Supabase update user error:', error);
    return { status: 'error', message: 'Произошла неизвестная ошибка.' };
  }

  revalidatePath('/profile');
  revalidatePath(`/you/${updatedUser.username}`);
  redirect(`/you/${updatedUser.username}`);
}

// --- АДМИНСКИЕ ДЕЙСТВИЯ С ПОЛЬЗОВАТЕЛЯМИ ---

export async function adminUpdateUserRole(userId, role) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!userId || !role) throw new Error('User ID и Role обязательны.');

  const { error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: { role } });
  if (error) {
    console.error('adminUpdateUserRole error:', error);
    return { status: 'error', message: error.message };
  }
  revalidatePath('/admin/users');
  return { status: 'success' };
}

export async function adminDeleteUser(userId) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!userId) throw new Error('User ID обязателен.');
  
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('adminDeleteUser error:', error);
    return { status: 'error', message: error.message };
  }
  revalidatePath('/admin/users');
  return { status: 'success' };
}


// --- РАССЫЛКИ И ПОДПИСКИ (USER-CONTEXT) ---
// Здесь также используется getUserAndSupabaseForRequest, чтобы связать подписку
// с залогиненным пользователем, если он есть.
export async function subscribeToNewsletter(prevState, formData) {
    const email = formData.get('email')?.toString().trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return { status: 'error', message: 'Введите корректный email адрес.' };
    }

    // Получаем клиент с правами пользователя, чтобы связать подписку с его ID
    const { user, supabase } = await getUserAndSupabaseForRequest(new Request('http://localhost'));

    // Upsert подписчика
    const { data: subscriber, error: upsertError } = await supabase
        .from('subscribers')
        .upsert({ email, userId: user?.id || null }, { onConflict: 'email' })
        .select()
        .single();
    
    if (upsertError) {
        console.error('Supabase upsert subscriber error:', upsertError);
        return { status: 'error', message: 'Ошибка при подписке.' };
    }

    if (subscriber.isActive) {
        return { status: 'success', message: 'Вы уже подписаны.' };
    }
    
    // Отправка письма для подтверждения
    // ... логика с Resend ...
    
    return { status: 'success', message: 'Проверьте почту для подтверждения подписки.' };
}

// ... Остальные функции (createLetter, updateLetter, deleteLetter, etc.) по аналогии с create/update/deleteArticle ...
// Просто замените вызов `getServerSupabaseClient` внутри них на `const supabase = getServerSupabaseClient({ useServiceRole: true });`
// и убедитесь, что `verifyAdmin()` вызывается в начале.

// --- ПРИМЕР ДЛЯ LETTERS ---
export async function deleteLetter(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Letter ID is required.');

  const { data: letter } = await supabase.from('letters').select('slug, published').eq('id', id).single();
  const { error } = await supabase.from('letters').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete letter error:', error);
    // Теперь, после выдачи прав в SQL, эта ошибка не должна появляться
    throw new Error('Ошибка при удалении письма: ' + error.message);
  }

  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  if (letter.published) revalidatePath(`/letters/${letter.slug}`);
}

// ... и так далее для всех остальных функций

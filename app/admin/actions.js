"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';

// --- Импорты Helper-функций ---
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { parseTagNames, upsertTagsAndLink } from '@/lib/tags';

// --- Вспомогательные функции ---

/**
 * Проверяет, является ли текущий пользователь администратором.
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

/**
 * Resolve a Supabase client suitable for server actions.
 * Prefer a request-aware client (supports cookies/session). If that
 * isn't available, fall back to the server client (service role when
 * requested).
 */
async function getSupabaseForAction(useServiceRole = false) {
  try {
    const { supabase } = await getUserAndSupabaseForRequest(new Request('http://localhost'));
    if (supabase) return supabase;
  } catch (e) {
    // ignore and fallback
  }
  return getServerSupabaseClient({ useServiceRole });
}


// --- Статьи (Article) ---

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
  const { error } = await supabase.from('articles').insert({
    id: articleId,
    title,
    content: JSON.stringify(validBlocks),
    slug,
    published,
    publishedAt: published ? new Date().toISOString() : null,
    authorId: user.id,
  });

  if (error) {
    console.error('Supabase insert article error:', error);
    throw new Error('Ошибка при создании статьи.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'article', articleId, parsedTags);

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

  const { data: article } = await supabase.from('articles').select('slug').eq('id', id).maybeSingle();
  const { error } = await supabase.from('articles').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete article error:', error);
    throw new Error('Ошибка при удалении статьи.');
  }

  revalidatePath('/admin/articles');
  if (article) revalidatePath(`/${article.slug}`);
}

// --- Проекты (Project) ---

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
  await upsertTagsAndLink(supabase, 'project', projectId, parsedTags);

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

  const { data: project } = await supabase.from('projects').select('slug').eq('id', id).maybeSingle();
  const { error } = await supabase.from('projects').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete project error:', error);
    throw new Error('Ошибка при удалении проекта.');
  }

  revalidatePath('/admin/projects');
  if (project) revalidatePath(`/${project.slug}`);
}

// --- Профиль пользователя (User-Context) ---
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
  if (!/^[a-z0-9_.]+$/.test(username)) {
      return { status: 'error', message: 'Username может содержать только строчные буквы, цифры, _ и .' };
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

// --- Админские действия с пользователями ---

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

// --- Рассылки и подписки (User-Context) ---

export async function subscribeToNewsletter(prevState, formData) {
    const email = formData.get('email')?.toString().trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return { status: 'error', message: 'Введите корректный email адрес.' };
    }

    const { user, supabase } = await getUserAndSupabaseForRequest(new Request('http://localhost'));

    // upsert subscriber; mark inactive until confirmed
    const { data: subscriber, error } = await supabase
        .from('subscribers')
        .upsert({ email, userId: user?.id || null, isActive: false }, { onConflict: 'email' })
        .select()
        .single();
    
    if (error) {
        console.error('Supabase upsert subscriber error:', error);
        return { status: 'error', message: 'Ошибка при подписке.' };
    }

    if (subscriber.isActive) {
        return { status: 'success', message: 'Вы уже подписаны.' };
    }
    
    // generate confirmation token and insert into subscriber_tokens
    try {
      const confirmToken = createId();
      const { error: tokenErr } = await supabase.from('subscriber_tokens').insert({ subscriber_id: subscriber.id, type: 'confirm', token: confirmToken, created_at: new Date().toISOString() });
      if (tokenErr) {
        console.warn('Failed to insert confirm token:', tokenErr.message || tokenErr);
      } else {
        const confirmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-confirm?token=${confirmToken}`;
        console.info('Created confirm token for subscriber', subscriber.email);
        // TODO: send confirmation email (dry-run if RESEND not configured)
        return { status: 'success', message: 'Проверьте почту для подтверждения подписки.', confirmUrl };
      }
    } catch (e) {
      console.warn('subscribeToNewsletter: token insert failed', e?.message || e);
    }

    return { status: 'success', message: 'Проверьте почту для подтверждения подписки.' };
}

// --- Письма (Letter) ---

export async function createLetter(formData) {
  const { user } = await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString().trim();
  const slug = formData.get('slug')?.toString().trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !slug || !rawContent) {
    throw new Error('Заполните все обязательные поля.');
  }

  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch (e) {
    throw new Error('Контент имеет неверный JSON формат: ' + e.message);
  }

  const letterId = createId();
  const { error } = await supabase.from('letters').insert({
    id: letterId,
    title,
    slug,
    content: JSON.stringify(validBlocks),
    published,
    authorId: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('Письмо с таким URL уже существует.');
    }
    console.error('Ошибка при создании письма:', error);
    throw new Error('Ошибка при создании письма: ' + error.message);
  }

  const parsedTags = parseTagNames(tagsString);
  await upsertTagsAndLink(supabase, 'letter', letterId, parsedTags);

  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  if (published) revalidatePath(`/letters/${slug}`);
  redirect('/admin/letters');
}

export async function updateLetter(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString()?.trim();
  const slug = formData.get('slug')?.toString()?.trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !slug || !rawContent) {
    throw new Error('Заполните все обязательные поля.');
  }

  const { data: existingLetter } = await supabase.from('letters').select('slug, published').eq('id', id).single();
  if (!existingLetter) throw new Error('Письмо не найдено.');

  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    validBlocks = blocks.filter(b => b && typeof b.type === 'string' && typeof b.data === 'object');
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch (e) {
    throw new Error('Контент имеет неверный JSON формат: ' + e.message);
  }
  
  const { error } = await supabase.from('letters').update({
    title,
    slug,
    content: JSON.stringify(validBlocks),
    published,
    updatedAt: new Date().toISOString(),
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
        throw new Error('Письмо с таким URL уже существует.');
    }
    console.error('Ошибка при обновлении письма:', error);
    throw new Error('Ошибка при обновлении письма: ' + error.message);
  }

  const parsedTags = parseTagNames(tagsString);
  await upsertTagsAndLink(supabase, 'letter', id, parsedTags);

  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  revalidatePath(`/admin/letters/edit/${id}`);
  if (published) revalidatePath(`/letters/${slug}`);
  if (existingLetter.slug !== slug && existingLetter.published) {
    revalidatePath(`/letters/${existingLetter.slug}`);
  }

  redirect('/admin/letters');
}

/**
 * Server action to delete a letter. Returns void on success and throws on error.
 * @param {FormData} formData
 * @returns {Promise<void>}
 */
export async function deleteLetter(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) return { status: 'error', message: 'Letter ID is required.' };

  try {
    const { data: letter } = await supabase.from('letters').select('slug, published').eq('id', id).maybeSingle();
    let { error } = await supabase.from('letters').delete().eq('id', id);

    // If permission denied, try to provide a clearer error or retry using explicit service role
    if (error && String(error.code) === '42501') {
      console.error('Supabase delete letter permission denied (42501). Attempting retry with service role client if available.');
      try { (await import('@sentry/nextjs')).captureException(error); } catch (e) {}

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Permission denied for table letters (42501). SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
      }

      try {
        const svc = getServerSupabaseClient({ useServiceRole: true });
        const retry = await svc.from('letters').delete().eq('id', id);
        if (retry.error) {
          console.error('Retry with service role failed:', retry.error);
          try { (await import('@sentry/nextjs')).captureException(retry.error); } catch (e) {}
          throw new Error('Ошибка при удалении письма: ' + (retry.error.message || String(retry.error)));
        }
        // success via retry
        error = null;
      } catch (e) {
        console.error('Retry with service role threw:', e);
        try { (await import('@sentry/nextjs')).captureException(e); } catch (e2) {}
        throw new Error('Не удалось удалить письмо: ' + (e?.message || String(e)));
      }
    }

    if (error) {
      console.error('Supabase delete letter error:', error);
      try { (await import('@sentry/nextjs')).captureException(error); } catch (e) {}
      throw new Error('Ошибка при удалении письма: ' + (error.message || String(error)));
    }

    revalidatePath('/admin/letters');
    revalidatePath('/letters');
    if (letter?.published) revalidatePath(`/letters/${letter.slug}`);
    // server action expects void return on success
    return;
  } catch (e) {
    console.error('deleteLetter exception:', e);
    try { (await import('@sentry/nextjs')).captureException(e); } catch (e2) {}
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function sendLetter(prevState, formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const letterId = formData.get('letterId')?.toString();
  const testEmail = formData.get('testEmail')?.toString()?.trim();

  if (!letterId) {
    return { status: 'error', message: 'Не указан ID письма.' };
  }

  const { data: letter, error: letterErr } = await supabase.from('letters').select('id,title,slug,content,published').eq('id', letterId).maybeSingle();
  if (letterErr || !letter) {
    console.error('sendLetter: failed to load letter', letterErr);
    return { status: 'error', message: 'Письмо не найдено.' };
  }

  // Normalize letter object for sendNewsletterToSubscriber
  const letterObj = {
    id: letter.id,
    title: letter.title,
    content: letter.content,
    html: (() => {
      try { return renderNewsletterEmail(letter, ''); } catch (e) { return ''; }
    })(),
  };

  // If a testEmail is provided, send a single test email and return result
  if (testEmail) {
    const testSubscriber = { id: createId(), email: testEmail };
    const res = await sendNewsletterToSubscriber(testSubscriber, letterObj, { skipTokenInsert: true });
    if (res.status === 'sent' || res.status === 'skipped') {
      return { status: 'success', message: `Тестовое письмо отправлено на ${testEmail}` , providerResponse: res.providerResponse };
    }
    return { status: 'error', message: res.error || 'Ошибка при отправке тестового письма', details: res };
  }

  // Try to enqueue the letter for background sending if a jobs table exists
  try {
    const { error: jobErr } = await supabase.from('newsletter_jobs').insert({ letter_id: letterId, status: 'pending', created_at: new Date().toISOString() });
    if (!jobErr) {
      return { status: 'success', message: 'Письмо поставлено в очередь на отправку.' };
    }
  } catch (e) {
    // table may not exist — fallthrough to limited send
  }

  // Safe fallback: send to a limited number of subscribers (avoid large sends in dev)
  try {
    const { data: subs, error: subsErr } = await supabase.from('subscribers').select('id,email').eq('isActive', true).limit(20);
    if (subsErr) {
      console.error('sendLetter: failed to load subscribers', subsErr);
      return { status: 'error', message: 'Не удалось получить список подписчиков.' };
    }

    let sent = 0;
    for (const s of subs || []) {
      try {
        const r = await sendNewsletterToSubscriber(s, letterObj);
        if (r.status === 'sent' || r.status === 'skipped') sent++;
      } catch (e) {
        console.warn('sendLetter: send to subscriber failed', e);
      }
    }
    return { status: 'success', message: `Отправлено ${sent} подписчикам (ограничено).` };
  } catch (e) {
    console.error('sendLetter fallback failed', e);
    return { status: 'error', message: 'Не удалось отправить рассылку.' };
  }
}

// --- Открытки (Postcards) ---

export async function createPostcard(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString().trim();
  const image = formData.get('image')?.toString().trim();
  const price = parseInt(formData.get('price')?.toString() || '0');

  if (!title || !image || price <= 0) {
    throw new Error('Заполните все обязательные поля.');
  }

  const { error } = await supabase.from('postcards').insert({
    id: createId(),
    title,
    description: formData.get('description')?.toString().trim(),
    image,
    price,
    available: formData.get('available') === 'on',
    featured: formData.get('featured') === 'on',
  });

  if (error) {
    console.error('Supabase insert postcard error:', error);
    throw new Error('Ошибка при создании открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters'); // Обновляем страницу с открытками
}

export async function updatePostcard(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString().trim();
  const image = formData.get('image')?.toString().trim();
  const price = parseInt(formData.get('price')?.toString() || '0');

  if (!id || !title || !image || price <= 0) {
    throw new Error('Заполните все обязательные поля.');
  }

  const { error } = await supabase
    .from('postcards')
    .update({
      title,
      description: formData.get('description')?.toString().trim(),
      image,
      price,
      available: formData.get('available') === 'on',
      featured: formData.get('featured') === 'on',
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Supabase update postcard error:', error);
    throw new Error('Ошибка при обновлении открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters');
}

export async function deletePostcard(formData) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Postcard ID is required.');

  // Проверка на связанные заказы
  const { count } = await supabase
    .from('postcard_orders')
    .select('*', { count: 'exact', head: true })
    .eq('postcardId', id);

  if (count > 0) {
    throw new Error('Нельзя удалить открытку с существующими заказами.');
  }

  const { error } = await supabase.from('postcards').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete postcard error:', error);
    throw new Error('Ошибка при удалении открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters');
}

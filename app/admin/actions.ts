// ===== ФАЙЛ: app/actions.ts =====
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createId } from '@paralleldrive/cuid2';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Импорты Helper-функций ---
import { createClient } from '@/lib/supabase/server';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { parseTagNames, upsertTagsAndLink } from '@/lib/tags';
import { getTrustedClientIp } from '@/lib/newsletter/clientIp';
import { checkNewsletterRateLimit } from '@/lib/newsletter/rateLimit';
import {
  NEWSLETTER_BOT_FIELD,
  NEWSLETTER_FORM_STARTED_FIELD,
  checkSignupTiming,
  honeypotWasFilled,
  verifyTurnstileToken,
} from '@/lib/newsletter/botProtection';
import { registerNewsletterSubscriber } from '@/lib/newsletter/signup';
import { recordSubscriptionEvent } from '@/lib/newsletter/subscriptionEvents';

// Local helper to produce tag slugs for revalidation paths
const slugifyTag = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');

// --- Types ---
type ActionResult = {
  status?: 'success' | 'error';
  message?: string;
  error?: string;
  data?: any;
};

// --- Revalidation audit helper ---
async function recordRevalidationAudit(
  supabase: SupabaseClient | null,
  userId: string | null,
  reason: string | null = null
): Promise<void> {
  try {
    if (!supabase || !supabase.from) return;
    await supabase.from('revalidation_audit').insert({
      id: createId(),
      user_id: userId || null,
      reason,
      created_at: new Date().toISOString(),
    });
  } catch (e: any) {
    // don't block the main flow on audit errors
    console.warn('recordRevalidationAudit failed:', e);
  }
}

// --- Вспомогательные функции ---

/**
 * Проверяет, является ли текущий пользователь администратором.
 * (Исправлено для совместимости с асинхронным cookies() в Next.js 15)
 */
async function verifyAdmin() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const req = new Request('http://localhost', { headers: { cookie: cookieHeader } });
  const user = await requireAdminFromRequest(req);
  return { user };
}

/**
 * Resolve a Supabase client suitable for server actions.
 */
async function getSupabaseForAction(useServiceRole = false) {
  try {
    const { supabase } = await getUserAndSupabaseForRequest(new Request('http://localhost'));
    if (supabase) return supabase;
  } catch (e: any) {
    // ignore and fallback
  }
  return getServerSupabaseClient({ useServiceRole });
}

// --- Статьи (Article) ---

export async function createArticle(formData: any) {
  const { user } = await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const artist = formData.get('artist')?.toString() || '';
  const previewImage = formData.get('preview_image')?.toString() || null;
  const curatorNote = formData.get('curatorNote')?.toString() || '';
  const quote = formData.get('quote')?.toString() || '';
  const specs = formData.get('specs')?.toString() || '';

  if (!title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  const { data: existingSlug } = await supabase
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existingSlug) {
    throw new Error('Статья с таким slug уже существует.');
  }

  let validBlocks;
  try {
    const blocks = JSON.parse(contentRaw);
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
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
    artist,
    curatorNote,
    quote,
    specs,
  });

  if (error) {
    console.error('Supabase insert article error:', error);
    throw new Error('Ошибка при создании статьи.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'article', articleId, parsedTags);

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/');
    revalidatePath('/admin/articles');
    revalidatePath(`/admin/articles/edit/${articleId}`);
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  redirect(`/admin/articles/edit/${articleId}`);
}

export async function updateArticle(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  const artist = formData.get('artist')?.toString() || '';
  const curatorNote = formData.get('curatorNote')?.toString() || '';
  const quote = formData.get('quote')?.toString() || '';
  const specs = formData.get('specs')?.toString() || '';

  if (!id || !title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  let validBlocks;
  try {
    const blocks = JSON.parse(contentRaw);
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch {
    throw new Error('Контент имеет неверный JSON формат.');
  }

  const { error } = await supabase
    .from('articles')
    .update({
      title,
      content: JSON.stringify(validBlocks),
      slug,
      published,
      publishedAt: published ? new Date().toISOString() : null,
      artist,
      curatorNote,
      quote,
      specs,
    })
    .eq('id', id);

  if (error) {
    console.error('Supabase update article error:', error);
    throw new Error('Ошибка при обновлении статьи.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'article', id, parsedTags);

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/');
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  revalidatePath('/admin/selection');
  revalidatePath(`/${slug}`);
  redirect('/admin/selection');
}

export async function deleteArticle(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Article ID is required.');

  const { data: article } = await supabase
    .from('articles')
    .select('slug')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.from('articles').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete article error:', error);
    throw new Error('Ошибка при удалении статьи.');
  }

  revalidatePath('/admin/selection');
  if (article) revalidatePath(`/${article.slug}`);
}

// --- Проекты (Project) ---

export async function createProject(formData: any) {
  const { user } = await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString();
  const contentRaw = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !contentRaw || !slug) throw new Error('Все поля обязательны.');

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    throw new Error('Проект с таким slug уже существует.');
  }

  let validBlocks;
  try {
    const blocks = JSON.parse(contentRaw);
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
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

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/', 'layout');
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  revalidatePath('/admin/projects');
  revalidatePath(`/admin/projects/edit/${projectId}`);
  if (published) {
    revalidatePath(`/${slug}`);
  }

  redirect(`/admin/projects/edit/${projectId}`);
}

export async function updateProject(formData: any) {
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
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) throw new Error('Контент не содержит валидных блоков.');
  } catch {
    throw new Error('Контент имеет неверный JSON формат.');
  }

  const { error } = await supabase
    .from('projects')
    .update({
      title,
      content: JSON.stringify(validBlocks),
      slug,
      published,
      publishedAt: published ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) {
    console.error('Supabase update project error:', error);
    throw new Error('Ошибка при обновлении проекта.');
  }

  const parsedTags = parseTagNames(formData.get('tags')?.toString());
  await upsertTagsAndLink(supabase, 'project', id, parsedTags);

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/', 'layout');
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  revalidatePath('/admin/projects');
  revalidatePath(`/admin/projects/edit/${id}`);
  if (published) {
    revalidatePath(`/${slug}`);
  }

  redirect('/admin/projects');
}

export async function deleteProject(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Project ID is required.');

  const { data: project } = await supabase
    .from('projects')
    .select('slug')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.from('projects').delete().eq('id', id);

  if (error) {
    console.error('Supabase delete project error:', error);
    throw new Error('Ошибка при удалении проекта.');
  }

  revalidatePath('/admin/projects');
  revalidatePath('/', 'layout');
  if (project) revalidatePath(`/${project.slug}`);
}

// --- Профиль пользователя (User-Context) ---

export async function updateProfile(prevState: any, formData: any) {
  const anonClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser();

  if (authError || !user?.id) {
    return { status: 'error', message: 'Вы не авторизованы.' };
  }

  const username = formData.get('username')?.toString().toLowerCase().trim();
  const name = formData.get('name')?.toString().trim();
  if (!username || !name) {
    return { status: 'error', message: 'Имя и username обязательны.' };
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    return {
      status: 'error',
      message: 'Username может содержать только строчные буквы, цифры, _ и .',
    };
  }

  const supabase = getServerSupabaseClient({ useServiceRole: true });
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
    if (error.code === '23505') {
      return { status: 'error', message: 'Этот username уже занят.' };
    }
    console.error('Supabase update user error:', error);
    return { status: 'error', message: 'Произошла неизвестная ошибка.' };
  }

  revalidatePath('/profile');
  revalidatePath(`/you/${updatedUser.username}`);
  return { status: 'success', message: 'Профиль обновлён.', username: updatedUser.username };
}

// --- Админские действия с пользователями ---

export async function adminUpdateUserRole(userId: any, role: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  if (typeof userId !== 'string' || !userId) throw new Error('User ID is required.');

  const normalizedRole = String(role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';

  // public.users.role is the authoritative application role. The auth
  // metadata is mirrored only for UI convenience and must never be trusted by
  // server authorization.
  const { error } = await supabase
    .from('users')
    .upsert(
      { id: userId, role: normalizedRole, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('adminUpdateUserRole error (users):', error);
    return { status: 'error', message: 'Role update failed.' };
  }

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const existingMeta =
      authUser?.user?.user_metadata && typeof authUser.user.user_metadata === 'object'
        ? authUser.user.user_metadata
        : {};

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...existingMeta, role: normalizedRole },
    });
  } catch {
    // The canonical role is already saved. Metadata mirroring is cosmetic.
    console.warn('adminUpdateUserRole: auth metadata mirror failed');
  }

  revalidatePath('/admin/users');
  return { status: 'success' };
}

export async function adminDeleteUser(userId: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!userId) throw new Error('User ID обязателен.');

  try {
    const { error: subError } = await supabase
      .from('subscribers')
      .update({ userId: null })
      .eq('userId', userId);

    if (subError) {
      console.warn('adminDeleteUser: failed to unlink subscribers', subError);
    }
  } catch (e: any) {
    console.warn('adminDeleteUser: error cleaning up subscribers', e);
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('adminDeleteUser error:', error);
    return { status: 'error', message: error.message };
  }
  revalidatePath('/admin/users');
  return { status: 'success' };
}

// --- Управление подпиской пользователя ---

export async function toggleUserSubscription(prevState: any, formData: any) {
  const anonClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser();

  if (authError || !user?.id) {
    return { status: 'error', message: 'Вы не авторизованы.' };
  }

  const action = formData.get('action')?.toString();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  try {
    const { data: userData } = await supabase
      .from('users')
      .select('email, is_subscribed')
      .eq('id', user.id)
      .single();

    if (!userData?.email) {
      return { status: 'error', message: 'У пользователя нет email адреса.' };
    }

    if (action === 'subscribe') {
      const { data: existingSub } = await supabase
        .from('subscribers')
        .select('*')
        .eq('email', userData.email)
        .maybeSingle();

      if (existingSub) {
        await supabase
          .from('subscribers')
          .update({ userId: user.id, isActive: true })
          .eq('id', existingSub.id);
      } else {
        await supabase.from('subscribers').insert({
          id: createId(),
          email: userData.email,
          userId: user.id,
          isActive: true,
        });
      }

      await supabase.from('users').update({ is_subscribed: true }).eq('id', user.id);

      revalidatePath('/profile');
      return { status: 'success', message: 'Вы успешно подписались на рассылку!' };
    } else if (action === 'unsubscribe') {
      await supabase.from('subscribers').update({ isActive: false }).eq('userId', user.id);
      await supabase.from('users').update({ is_subscribed: false }).eq('id', user.id);

      revalidatePath('/profile');
      return { status: 'success', message: 'Вы отписались от рассылки.' };
    }

    return { status: 'error', message: 'Неизвестное действие.' };
  } catch (error) {
    console.error('toggleUserSubscription error:', error);
    return { status: 'error', message: 'Произошла ошибка при изменении подписки.' };
  }
}

export async function adminToggleUserSubscription(userId: any, subscribe: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  try {
    let userData = await supabase.from('users').select('email').eq('id', userId).maybeSingle();

    if (!userData?.data?.email) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      if (!authUser?.user?.email) {
        return { status: 'error', message: 'У пользователя нет email.' };
      }

      const { error: insertError } = await supabase.from('users').insert({
        id: userId,
        email: authUser.user.email,
        name: authUser.user.user_metadata?.name || authUser.user.email.split('@')[0],
      });

      if (insertError && insertError.code !== '23505') {
        console.error('Error creating user in public.users:', insertError);
      }

      userData = { data: { email: authUser.user.email } } as any;
    }

    const email = userData.data?.email;
    if (!email) {
      return { status: 'error', message: 'У пользователя нет email.' };
    }

    if (subscribe) {
      const { data: existingSub } = await supabase
        .from('subscribers')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (existingSub) {
        await supabase
          .from('subscribers')
          .update({ userId, isActive: true })
          .eq('id', existingSub.id);
      } else {
        await supabase.from('subscribers').insert({
          id: createId(),
          email: email,
          userId,
          isActive: true,
        });
      }
    } else {
      await supabase.from('subscribers').update({ isActive: false }).eq('userId', userId);
    }

    await supabase.from('users').update({ is_subscribed: subscribe }).eq('id', userId);

    revalidatePath('/admin/users');
    return {
      status: 'success',
      message: subscribe ? 'Пользователь подписан.' : 'Пользователь отписан.',
    };
  } catch (error: any) {
    console.error('adminToggleUserSubscription error:', error);
    return { status: 'error', message: error.message };
  }
}

// --- Рассылки и подписки (User-Context) ---

export async function subscribeToNewsletter(prevState: any, formData: any) {
  const email = formData.get('email')?.toString().trim().toLowerCase() || '';
  const language = formData.get('language')?.toString().trim().toLowerCase() || 'ru';
  const locale = language === 'en' ? 'en' : 'ru';

  async function recordEvent(
    reason: string,
    payload: Record<string, unknown>,
    subscriberId?: string | number | null
  ) {
    try {
      const store = getServerSupabaseClient({ useServiceRole: true });
      await recordSubscriptionEvent(store, {
        eventName: 'subscription_failed',
        eventKey: `signup_action:${createId()}`,
        subscriberId: subscriberId ?? null,
        payload: { reason, ...payload },
      });
    } catch {
      // Telemetry must not break the user-facing response.
    }
  }

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return {
      status: 'error',
      message: locale === 'ru' ? 'Введите корректный email адрес.' : 'Enter a valid email address.',
    };
  }

  const requestHeaders = await headers();
  const clientIp = getTrustedClientIp(requestHeaders);

  if (
    honeypotWasFilled(
      formData.get(NEWSLETTER_BOT_FIELD),
      formData.get('company_website'),
      formData.get('_gotcha')
    )
  ) {
    await recordEvent('honeypot', {});
    return {
      status: 'error',
      message: locale === 'ru' ? 'Не удалось оформить подписку.' : 'Could not complete the subscription.',
    };
  }

  const timing = checkSignupTiming(formData.get(NEWSLETTER_FORM_STARTED_FIELD));
  if (!timing.ok) {
    await recordEvent(`timing_${timing.reason}`, {});
    return {
      status: 'error',
      message: locale === 'ru' ? 'Не удалось оформить подписку.' : 'Could not complete the subscription.',
    };
  }

  const rateLimit = await checkNewsletterRateLimit({ ip: clientIp, email });
  if (!rateLimit.allowed) {
    await recordEvent(`rate_limited_${rateLimit.layer}`, {});
    return {
      status: 'error',
      message:
        locale === 'ru'
          ? 'Слишком много попыток. Попробуйте позже.'
          : 'Too many attempts. Please try again later.',
    };
  }

  const turnstile = await verifyTurnstileToken({
    token: formData.get('turnstileToken'),
    remoteIp: clientIp,
  });
  if (!turnstile.ok) {
    await recordEvent(`turnstile_${turnstile.reason}`, {});
    return {
      status: 'error',
      message:
        turnstile.reason === 'provider_unavailable' || turnstile.reason === 'invalid_response'
          ? locale === 'ru'
            ? 'Проверка недоступна. Попробуйте позже.'
            : 'Verification is unavailable. Please try again later.'
          : locale === 'ru'
            ? 'Проверка не пройдена. Обновите страницу и попробуйте снова.'
            : 'Verification failed. Refresh the page and try again.',
    };
  }

  const { user } = await getUserAndSupabaseForRequest(new Request('http://localhost'));

  let svc;
  try {
    svc = getServerSupabaseClient({ useServiceRole: true });
  } catch (e: any) {
    console.error('subscribeToNewsletter: service role client not available', e);
    return {
      status: 'error',
      message:
        locale === 'ru'
          ? 'Сервер не настроен для обработки подписок.'
          : 'The server is not configured for subscriptions.',
    };
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://merkurov.love'
  ).replace(/\/$/, '');

  const result = await registerNewsletterSubscriber({
    store: svc,
    email,
    locale,
    userId: user?.id || null,
    baseUrl,
  });

  if (result.status === 'already_confirmed') {
    return {
      status: 'success',
      message: locale === 'ru' ? 'Вы уже подписаны.' : 'You are already subscribed.',
    };
  }

  if (result.status === 'pending_confirmation') {
    return {
      status: 'success',
      message:
        locale === 'ru'
          ? 'Проверьте почту для подтверждения подписки.'
          : 'Check your inbox to confirm the subscription.',
    };
  }

  await recordEvent(result.reason, { error_code: result.errorCode }, result.subscriberId);

  if (result.reason === 'email_send' || result.reason === 'email_not_configured') {
    return {
      status: 'error',
      message:
        locale === 'ru'
          ? 'Не удалось отправить письмо подтверждения. Подписка не оформлена.'
          : 'The confirmation email could not be sent. Your subscription is not active.',
    };
  }

  return {
    status: 'error',
    message:
      locale === 'ru'
        ? 'Не удалось оформить подписку. Попробуйте позже.'
        : 'Could not complete the subscription. Please try again.',
  };
}

// --- Письма (Letter) ---

export async function createLetter(formData: any) {
  const { user } = await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const title = formData.get('title')?.toString().trim();
  const slug = formData.get('slug')?.toString().trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!title || !slug || !rawContent) {
    throw new Error('Complete all required fields.');
  }

  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) throw new Error('Content does not contain valid blocks.');
  } catch (e: any) {
    throw new Error('Content has an invalid JSON format: ' + e.message);
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
      throw new Error('A letter with this URL already exists.');
    }
    console.error('Ошибка при создании письма:', error);
    throw new Error('Unable to create the letter: ' + error.message);
  }

  const parsedTags = parseTagNames(tagsString);
  await upsertTagsAndLink(supabase, 'letter', letterId, parsedTags);

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/');
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  await recordRevalidationAudit(
    supabase,
    user?.id,
    published ? 'create_published_letter' : 'create_letter'
  );
  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  revalidatePath(`/admin/letters/edit/${letterId}`);
  if (published) revalidatePath(`/letters/${slug}`);
  redirect(`/admin/letters/edit/${letterId}`);
}

export async function updateLetter(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString()?.trim();
  const slug = formData.get('slug')?.toString()?.trim();
  const rawContent = formData.get('content')?.toString();
  const tagsString = formData.get('tags')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !slug || !rawContent) {
    throw new Error('Complete all required fields.');
  }

  const { data: existingLetter } = await supabase
    .from('letters')
    .select('slug, published')
    .eq('id', id)
    .single();
  if (!existingLetter) throw new Error('Letter not found.');

  let validBlocks;
  try {
    const blocks = JSON.parse(rawContent);
    validBlocks = blocks.filter(
      (b: any) => b && typeof b.type === 'string' && typeof b.data === 'object'
    );
    if (validBlocks.length === 0) throw new Error('Content does not contain valid blocks.');
  } catch (e: any) {
    throw new Error('Content has an invalid JSON format: ' + e.message);
  }

  const { error } = await supabase
    .from('letters')
    .update({
      title,
      slug,
      content: JSON.stringify(validBlocks),
      published,
    })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      throw new Error('A letter with this URL already exists.');
    }
    console.error('Ошибка при обновлении письма:', error);
    throw new Error('Unable to update the letter: ' + error.message);
  }

  const parsedTags = parseTagNames(tagsString);
  await upsertTagsAndLink(supabase, 'letter', id, parsedTags);

  try {
    for (const t of parsedTags || []) {
      const slug = slugifyTag(t);
      if (slug) revalidatePath(`/tags/${slug}`);
    }
    revalidatePath('/');
  } catch (e) {
    console.warn('Tag revalidation failed:', e);
  }

  await recordRevalidationAudit(
    supabase,
    null,
    published ? 'update_published_letter' : 'update_letter'
  );
  revalidatePath('/admin/letters');
  revalidatePath('/letters');
  revalidatePath(`/admin/letters/edit/${id}`);
  if (published) revalidatePath(`/letters/${slug}`);
  if (existingLetter.slug !== slug && existingLetter.published) {
    revalidatePath(`/letters/${existingLetter.slug}`);
  }

  redirect('/admin/letters');
}

export async function deleteLetter(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Letter ID is required.');

  try {
    const { data: letter } = await supabase
      .from('letters')
      .select('slug, published')
      .eq('id', id)
      .maybeSingle();
    let { error } = await supabase.from('letters').delete().eq('id', id);

    if (error && String(error.code) === '42501') {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
          'Permission denied for table letters (42501). SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'
        );
      }

      try {
        const svc = getServerSupabaseClient({ useServiceRole: true });
        const retry = await svc.from('letters').delete().eq('id', id);
        if (retry.error) {
          throw new Error('Ошибка при удалении письма: permission denied for table letters.');
        }
        error = null;
      } catch (e: any) {
        throw new Error('Не удалось удалить письмо: ' + (e?.message || String(e)));
      }
    }

    if (error) {
      throw new Error('Ошибка при удалении письма: ' + (error.message || String(error)));
    }

    revalidatePath('/admin/letters');
    await recordRevalidationAudit(supabase, null, 'delete_letter');
    revalidatePath('/letters');
    if (letter?.published) revalidatePath(`/letters/${letter.slug}`);
    return;
  } catch (e: any) {
    console.error('deleteLetter exception:', e);
    throw e;
  }
}

export async function sendLetter(prevState: any, formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const letterId = formData.get('letterId')?.toString();
  const testEmail = formData.get('testEmail')?.toString()?.trim();

  if (!letterId) {
    return { status: 'error', message: 'Letter ID is required.' };
  }

  const { data: letter, error: letterErr } = await supabase
    .from('letters')
    .select('id,title,slug,content,published,sentAt,lang')
    .eq('id', letterId)
    .maybeSingle();
  if (letterErr || !letter) {
    return { status: 'error', message: 'Letter not found.' };
  }

  if (!testEmail && letter.sentAt) {
    return {
      status: 'error',
      message: `This letter was already sent on ${new Date(letter.sentAt).toLocaleString('en-US')}. Sending again is disabled.`,
    };
  }

  const letterObj = {
    id: letter.id,
    title: letter.title,
    content: letter.content,
    html: (() => {
      try {
        return renderNewsletterEmail(letter, '');
      } catch (e: any) {
        return '';
      }
    })(),
  };

  if (testEmail) {
    const testSubscriber = { id: createId(), email: testEmail };
    const res = await sendNewsletterToSubscriber(testSubscriber, letterObj, {
      skipTokenInsert: true,
    });
    if (res.status === 'sent' || res.status === 'skipped') {
      return {
        status: 'success',
        message: `Test email sent to ${testEmail}`,
        providerResponse: res.providerResponse,
      };
    }
    return {
      status: 'error',
      message: res.error || 'Test email could not be sent.',
      details: res,
    };
  }

  try {
    const jobId = createId();
    const { error: jobErr } = await supabase.from('newsletter_jobs').insert({
      id: jobId,
      letter_id: letterId,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (!jobErr) {
      return {
        status: 'success',
        message: 'Letter queued for delivery. Processing will begin shortly.',
        jobId,
      };
    }
  } catch (e: any) {
    // fallback
  }

  const SEND_LIMIT = parseInt(process.env.NEWSLETTER_SEND_LIMIT || '100');

  try {
    const { data: allSubs, error: subsErr } = await supabase
      .from('subscribers')
      .select('id,email,locale')
      .eq('isActive', true)
      .limit(SEND_LIMIT);

    if (subsErr || !allSubs || allSubs.length === 0) {
      return {
        status: 'error',
        message: 'There are no active subscribers to receive this letter.',
      };
    }

    const { filterSubscribersByLang } = await import('@/lib/newsletter/language');
    const subs = filterSubscribersByLang(allSubs, letter.lang);

    if (!subs || subs.length === 0) {
      const langLabel = letter.lang === 'en' ? 'English' : 'Russian';
      return {
        status: 'error',
        message: `There are no active ${langLabel} subscribers to receive this letter.`,
      };
    }

    let sent = 0;
    let failed = 0;

    for (const s of subs) {
      try {
        const r = await sendNewsletterToSubscriber(s, letterObj);
        if (r.status === 'sent' || r.status === 'skipped') {
          sent++;
        } else {
          failed++;
        }
      } catch (e: any) {
        failed++;
      }
    }

    await supabase.from('letters').update({ sentAt: new Date().toISOString() }).eq('id', letterId);

    const message =
      failed > 0
        ? `Sent to ${sent} of ${subs.length} subscribers. Failed: ${failed}.`
        : `Successfully sent to ${sent} subscribers.`;

    return { status: 'success', message };
  } catch (e: any) {
    return {
      status: 'error',
      message: 'The letter could not be sent: ' + (e?.message || String(e)),
    };
  }
}

export async function revalidateLetters() {
  await verifyAdmin();
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    try {
      const user = (await verifyAdmin()).user;
      await recordRevalidationAudit(supabase, user?.id, 'manual_revalidate');
    } catch (e: any) {}
    revalidatePath('/letters');
    redirect('/admin?revalidated=1');
  } catch (e: any) {
    throw e;
  }
}

// --- Открытки (Postcards) ---

export async function createPostcard(formData: any) {
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
    throw new Error('Ошибка при создании открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters');
}

export async function updatePostcard(formData: any) {
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
    })
    .eq('id', id);

  if (error) {
    throw new Error('Ошибка при обновлении открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters');
}

export async function deletePostcard(formData: any) {
  await verifyAdmin();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Postcard ID is required.');

  const { count } = await supabase
    .from('postcard_orders')
    .select('*', { count: 'exact', head: true })
    .eq('postcardId', id);

  if (count && count > 0) {
    throw new Error('Нельзя удалить открытку с существующими заказами.');
  }

  const { error } = await supabase.from('postcards').delete().eq('id', id);

  if (error) {
    throw new Error('Ошибка при удалении открытки: ' + error.message);
  }

  revalidatePath('/admin/postcards');
  revalidatePath('/letters');
}

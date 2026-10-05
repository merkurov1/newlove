// ===== ФАЙЛ: app/actions.ts =====
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Импорты Helper-функций ---
import { createClient } from '@/lib/supabase/server';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { parseTagNames, upsertTagsAndLink } from '@/lib/tags';

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
  const anonClient = createClient();
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
  if (!userId || !role) throw new Error('User ID и Role обязательны.');

  const { error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: { role } });
  if (error) {
    console.error('adminUpdateUserRole error (auth):', error);
    return { status: 'error', message: error.message };
  }

  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('user_metadata,email')
      .eq('id', userId)
      .maybeSingle();
    const existingMeta = (userRow && userRow.user_metadata) || {};
    const mergedMeta = { ...existingMeta, role };
    if (userRow) {
      await supabase.from('users').update({ user_metadata: mergedMeta }).eq('id', userId);
    }

    if (String(role).toUpperCase() === 'SUBSCRIBER') {
      const email = userRow?.email || null;
      if (email) {
        const { data: existingSub } = await supabase
          .from('subscribers')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingSub) {
          await supabase
            .from('subscribers')
            .update({ userId, isActive: true })
            .eq('id', existingSub.id);
        } else {
          const insertPayload = { id: createId(), email, userId, isActive: true };
          await supabase.from('subscribers').insert(insertPayload);
        }
      }
    }
  } catch (syncErr) {
    console.warn('adminUpdateUserRole: failed to sync users/subscribers tables', syncErr);
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
  const anonClient = createClient();
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
  const email = formData.get('email')?.toString().trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return { status: 'error', message: 'Введите корректный email адрес.' };
  }

  const { user } = await getUserAndSupabaseForRequest(new Request('http://localhost'));

  let svc;
  try {
    svc = getServerSupabaseClient({ useServiceRole: true });
  } catch (e: any) {
    console.error('subscribeToNewsletter: service role client not available', e);
    return {
      status: 'error',
      message: 'Сервер не настроен для обработки подписок (SUPABASE_SERVICE_ROLE_KEY отсутствует).',
      error: String(e),
    };
  }

  let subscriber;
  try {
    const { data: existingSub } = await svc
      .from('subscribers')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingSub) {
      subscriber = existingSub;
      if (user?.id && subscriber.userId !== user.id) {
        await svc.from('subscribers').update({ userId: user.id }).eq('id', subscriber.id);
        subscriber.userId = user.id;
      }
    } else {
      const payload = { id: createId(), email, userId: user?.id || null, isActive: false };
      const insertRes = await svc.from('subscribers').insert(payload).select().single();

      if (insertRes.error) {
        throw insertRes.error;
      }
      subscriber = insertRes.data;
    }
  } catch (error: any) {
    console.error('Supabase subscriber error:', error);
    const code = error?.code || null;
    const msg = error?.message || String(error) || 'Ошибка при подписке.';
    if (String(code) === '42501') {
      return {
        status: 'error',
        message: 'Права на запись в базу отсутствуют. Проверьте SUPABASE_SERVICE_ROLE_KEY и привилегии.',
        code,
        details: error,
      };
    }
    return { status: 'error', message: msg, code, details: error };
  }

  if (subscriber.isActive) {
    return { status: 'success', message: 'Вы уже подписаны.' };
  }

  try {
    const confirmToken = createId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { error: tokenErr } = await svc.from('subscriber_tokens').insert({
      subscriber_id: subscriber.id,
      type: 'confirm',
      token: confirmToken,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    if (tokenErr) {
      console.warn('Failed to insert confirm token:', tokenErr.message || tokenErr);
    } else {
      const confirmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-confirm?token=${confirmToken}`;

      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        try {
          const resend = new Resend(apiKey);
          const fromEmail = process.env.NOREPLY_EMAIL || 'noreply@merkurov.love';
          const fromDisplay = process.env.NOREPLY_DISPLAY || 'Anton Merkurov';

          await resend.emails.send({
            from: `${fromDisplay} <${fromEmail}>`,
            to: email,
            subject: 'Подтвердите подписку на рассылку',
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                  .button { display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
                </style>
              </head>
              <body>
                <h1>Подтвердите подписку</h1>
                <p>Привет!</p>
                <p>Спасибо за интерес к моим письмам о искусстве, инвестициях и культуре.</p>
                <p>Чтобы начать получать рассылку, подтвердите свой email:</p>
                <a href="${confirmUrl}" class="button">Подтвердить подписку</a>
                <p>Или скопируйте эту ссылку в браузер:</p>
                <p style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all;">${confirmUrl}</p>
                <div class="footer">
                  <p>Если вы не подписывались на рассылку, просто проигнорируйте это письмо.</p>
                  <p>С уважением,<br>Антон Меркуров<br><a href="https://merkurov.love">merkurov.love</a></p>
                </div>
              </body>
              </html>
            `,
          });
        } catch (emailErr) {
          console.error('Failed to send confirmation email:', emailErr);
        }
      }

      return {
        status: 'success',
        message: 'Проверьте почту для подтверждения подписки.',
        confirmUrl,
      };
    }
  } catch (e: any) {
    console.warn('subscribeToNewsletter: token insert failed', e?.message || e);
  }

  return { status: 'success', message: 'Проверьте почту для подтверждения подписки.' };
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
          throw new Error(
            'Ошибка при удалении письма: permission denied for table letters.'
          );
        }
        error = null;
      } catch (e: any) {
        throw new Error(
          'Не удалось удалить письмо: ' + (e?.message || String(e))
        );
      }
    }

    if (error) {
      throw new Error(
        'Ошибка при удалении письма: ' + (error.message || String(error))
      );
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
    .select('id,title,slug,content,published,sentAt')
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
    const { data: subs, error: subsErr } = await supabase
      .from('subscribers')
      .select('id,email')
      .eq('isActive', true)
      .limit(SEND_LIMIT);

    if (subsErr || !subs || subs.length === 0) {
      return { status: 'error', message: 'There are no active subscribers to receive this letter.' };
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

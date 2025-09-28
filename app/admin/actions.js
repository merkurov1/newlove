'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import NewsletterEmail from '@/emails/NewsletterEmail';
import { marked } from 'marked';

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
  if (!title || !content || !slug) throw new Error('All fields are required.');
  await prisma.article.create({
    data: { title, content, slug, published, publishedAt: published ? new Date() : null, authorId: session.user.id },
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
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');
  await prisma.article.update({
    where: { id: id },
    data: { title, content, slug, published, publishedAt: published ? new Date() : null },
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
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  if (!title || !content || !slug) throw new Error('All fields are required.');
  await prisma.project.create({
    data: { title, content, slug, published, publishedAt: published ? new Date() : null, authorId: session.user.id },
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
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');
  await prisma.project.update({
    where: { id: id },
    data: { title, content, slug, published, publishedAt: published ? new Date() : null },
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

// --- ПОДПИСКИ (Subscription) ---
export async function subscribeToNewsletter(prevState, formData) {
  const email = formData.get('email')?.toString().toLowerCase();
  if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
    return { status: 'error', message: 'Пожалуйста, введите корректный email.' };
  }
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    await prisma.subscriber.create({ data: { email: email, userId: existingUser?.id || null } });
    return { status: 'success', message: 'Спасибо за подписку!' };
  } catch (error) {
    if (error.code === 'P2002') {
      return { status: 'error', message: 'Этот email уже подписан на рассылку.' };
    }
    console.error('Ошибка подписки:', error);
    return { status: 'error', message: 'Произошла ошибка. Попробуйте снова.' };
  }
}

// --- РАССЫЛКИ (Letter) ---
export async function createLetter(formData) {
  const session = await verifyAdmin();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  if (!title || !content || !slug) throw new Error('All fields are required.');
  await prisma.letter.create({
    data: { title, content, slug, published, publishedAt: published ? new Date() : null, authorId: session.user.id },
  });
  revalidatePath('/admin/letters');
  redirect('/admin/letters');
}

export async function updateLetter(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';
  if (!id || !title || !content || !slug) throw new Error('All fields are required.');
  await prisma.letter.update({
    where: { id: id },
    data: { title, content, slug, published, publishedAt: published ? new Date() : null },
  });
  revalidatePath('/admin/letters');
  revalidatePath(`/${slug}`);
  redirect('/admin/letters');
}

export async function deleteLetter(formData) {
  await verifyAdmin();
  const id = formData.get('id')?.toString();
  if (!id) { throw new Error('Letter ID is required.'); }
  const letter = await prisma.letter.findUnique({ where: { id } });
  await prisma.letter.delete({ where: { id: id } });
  revalidatePath('/admin/letters');
  if (letter) revalidatePath(`/${letter.slug}`);
}

export async function sendLetter(prevState, formData) {
  const letterId = formData.get('letterId')?.toString();
  if (!letterId) return { status: 'error', message: 'ID письма не найден.' };
  
  try {
    const letter = await prisma.letter.findUnique({ where: { id: letterId } });
    if (!letter) return { status: 'error', message: 'Письмо не найдено в базе.' };
    if (letter.sentAt) return { status: 'error', message: 'Это письмо уже было отправлено.' };

    const subscribers = await prisma.subscriber.findMany({ select: { email: true } });
    if (subscribers.length === 0) return { status: 'warning', message: 'Нет подписчиков для отправки.' };

    const resend = new Resend(process.env.RESEND_API_KEY);
    const contentHtml = marked.parse(letter.content);
    const emailHtml = render(<NewsletterEmail title={letter.title} content={contentHtml} />);
    
    await resend.emails.send({
      from: 'Anton Merkurov <hello@merkurov.love>', // ВАЖНО: Замените на ваш верифицированный email в Resend
      to: subscribers.map(sub => sub.email),
      subject: letter.title,
      html: emailHtml,
    });

    await prisma.letter.update({
      where: { id: letterId },
      data: { sentAt: new Date() },
    });
    
    revalidatePath(`/admin/letters/edit/${letterId}`);
    return { status: 'success', message: `Рассылка успешно отправлена ${subscribers.length} подписчикам.` };
  } catch (error) {
    console.error('Ошибка отправки рассылки:', error);
    return { status: 'error', message: 'Произошла ошибка при отправке. Проверьте API-ключ и верифицированный домен в Resend.' };
  }
}



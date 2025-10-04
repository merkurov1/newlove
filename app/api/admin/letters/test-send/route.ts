import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { Resend } from 'resend';
import prisma from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, content } = await request.json();

    if (!title || !content) {
      return NextResponse.json({ error: 'Отсутствуют обязательные поля' }, { status: 400 });
    }

    // Проверяем наличие RESEND_API_KEY
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ 
        error: 'Email сервис не настроен. Обратитесь к администратору.' 
      }, { status: 500 });
    }

    // Получаем email админа из базы данных
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { email: true, name: true }
    });

    if (!adminUser?.email) {
      return NextResponse.json({ 
        error: 'Не найден email администратора в базе данных' 
      }, { status: 500 });
    }

    // Создаем временный объект письма для рендеринга
    const testLetter = {
      id: 'test',
      title,
      content,
      slug: 'test',
      published: false,
      createdAt: new Date(),
      author: { name: adminUser.name || 'Admin' }
    };

    // Рендерим email
    const emailHtml = await renderNewsletterEmail(testLetter);

    // Отправляем тестовое письмо
    const result = await resend.emails.send({
      from: 'Anton Merkurov <noreply@resend.dev>',
      to: [adminUser.email],
      subject: `[ТЕСТ] ${title}`,
      html: emailHtml,
    });

    if (result.error) {
      return NextResponse.json({ 
        error: `Ошибка Resend: ${result.error.message}` 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Тестовое письмо отправлено на ${adminUser.email}`,
      messageId: result.data?.id 
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json({ 
      error: 'Ошибка при отправке тестового письма' 
    }, { status: 500 });
  }
}
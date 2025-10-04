import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    // Проверка аутентификации - только администраторы
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, content, recipientEmail } = await request.json();

    if (!title || !content || !recipientEmail) {
      return NextResponse.json({ error: 'Отсутствуют обязательные поля' }, { status: 400 });
    }

    // Создаем временный объект письма для рендеринга
    const testLetter = {
      id: 'test',
      title,
      content,
      slug: 'test',
      published: false,
      createdAt: new Date(),
      author: session.user
    };

    // Рендерим email
    const emailHtml = await renderNewsletterEmail(testLetter);

    // Отправляем тестовое письмо
    const result = await resend.emails.send({
      from: 'Anton Merkurov <noreply@merkurov.love>',
      to: [recipientEmail],
      subject: `[ТЕСТ] ${title}`,
      html: emailHtml,
    });

    return NextResponse.json({ 
      success: true, 
      message: `Тестовое письмо отправлено на ${recipientEmail}`,
      messageId: result.data?.id 
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json({ 
      error: 'Ошибка при отправке тестового письма' 
    }, { status: 500 });
  }
}
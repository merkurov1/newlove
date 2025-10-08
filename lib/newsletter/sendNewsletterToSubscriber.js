import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';
import prisma from '@/lib/prisma';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';

/**
 * Отправляет письмо рассылки с уникальной ссылкой для отписки
 * @param {object} subscriber - объект подписчика (id, email)
 * @param {object} letter - объект письма (title, ...)
 */
export async function sendNewsletterToSubscriber(subscriber, letter) {
  // Генерируем токен для отписки
  const unsubscribeToken = createId();
  await prisma.subscriberToken.create({
    data: {
      subscriberId: subscriber.id,
      type: 'unsubscribe',
      token: unsubscribeToken
    }
  });
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-unsubscribe?token=${unsubscribeToken}`;
  // Рендерим письмо с ссылкой для отписки
  const emailHtml = renderNewsletterEmail(letter, unsubscribeUrl);
  // Отправляем письмо (Resend)
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'noreply@merkurov.love',
    to: subscriber.email,
    subject: letter.title,
    html: emailHtml
  });
}

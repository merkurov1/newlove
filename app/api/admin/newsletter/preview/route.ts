import { NextResponse } from 'next/server';

import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import {
  fetchConfirmedActiveSubscribers,
  maskNewsletterEmail,
  selectNewsletterRecipients,
  summarizeNewsletterAudience,
} from '@/lib/newsletter/recipients';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Read-only preview of the next newsletter audience.
 *
 * It never calls Resend, never queues a job and never writes to the database.
 * Emails are masked; the response is for the owner/admin only.
 */
export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);

    const url = new URL(request.url);
    const requestedLang = url.searchParams.get('lang');
    const language = requestedLang === 'en' ? 'en' : 'ru';

    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { subscribers, error } = await fetchConfirmedActiveSubscribers(supabase);

    if (error) {
      console.error('[newsletter-preview] audience lookup failed');
      return NextResponse.json(
        { error: 'Не удалось получить список получателей.' },
        { status: 500 }
      );
    }

    const audience = summarizeNewsletterAudience(subscribers);
    const recipients = selectNewsletterRecipients(subscribers, language);

    return NextResponse.json({
      ok: true,
      dryRun: true,
      emailsSent: 0,
      language,
      eligibleCount: recipients.length,
      confirmedActiveTotal: audience.total,
      byLanguage: { ru: audience.ru, en: audience.en },
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        email: maskNewsletterEmail(recipient.email),
        locale: recipient.locale ?? null,
      })),
      note:
        language === 'ru'
          ? 'Предпросмотр без отправки. В списке только активные подписчики с подтверждённым double opt-in.'
          : 'Preview only, nothing is sent. Only active subscribers with a confirmed double opt-in are listed.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка предпросмотра';
    const unauthorized = /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? 'Доступ запрещён' : message },
      { status: unauthorized ? 401 : 500 }
    );
  }
}

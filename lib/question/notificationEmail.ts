import { Resend } from 'resend';

export type QuestionEmailResult =
  | { status: 'sent'; providerId: string | null }
  | { status: 'skipped'; reason: 'missing_api_key' }
  | { status: 'error'; reason: 'provider_error' | 'exception' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fromAddress(): string {
  return `${process.env.NOREPLY_DISPLAY || 'Anton Merkurov'} <${
    process.env.NOREPLY_EMAIL || 'noreply@merkurov.love'
  }>`;
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<QuestionEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { status: 'skipped', reason: 'missing_api_key' };
  }

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
    });

    const result = response as {
      id?: string;
      data?: { id?: string };
      error?: { message?: string };
    };

    if (result.error) {
      return { status: 'error', reason: 'provider_error' };
    }

    return {
      status: 'sent',
      providerId: result.id || result.data?.id || null,
    };
  } catch {
    return { status: 'error', reason: 'exception' };
  }
}

function layout(input: {
  heading: string;
  body: string;
  button: string;
  url: string;
  footer: string;
  footerLinks?: Array<{ url: string; label: string }>;
}) {
  const footerLinks = (input.footerLinks || [])
    .map(
      (link) =>
        `<a href="${escapeHtml(link.url)}" style="color:#8a8176;">${escapeHtml(
          link.label
        )}</a>`
    )
    .join(' · ');

  return `<!doctype html>
<html>
  <body style="margin:0;background:#faf8f5;color:#141210;font-family:Georgia,serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="font:11px/1.5 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8a8176;margin:0 0 18px;">Question</p>
      <h1 style="font-size:28px;font-weight:400;margin:0 0 16px;">${escapeHtml(input.heading)}</h1>
      <p style="font:16px/1.7 Georgia,serif;color:#5b544c;margin:0 0 24px;">${escapeHtml(input.body)}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#141210;color:#faf8f5;text-decoration:none;padding:14px 22px;font:12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;">${escapeHtml(input.button)}</a>
      </p>
      <p style="font:12px/1.6 Arial,sans-serif;color:#8a8176;margin:0 0 8px;">Если кнопка не работает, откройте ссылку:</p>
      <p style="font:12px/1.6 Arial,sans-serif;word-break:break-all;margin:0 0 20px;">
        <a href="${escapeHtml(input.url)}" style="color:#8a8176;">${escapeHtml(input.url)}</a>
      </p>
      <p style="font:11px/1.6 Arial,sans-serif;color:#a49b8f;margin:0;">${escapeHtml(input.footer)}</p>
      ${
        footerLinks
          ? `<p style="font:11px/1.6 Arial,sans-serif;margin:10px 0 0;">${footerLinks}</p>`
          : ''
      }
    </div>
  </body>
</html>`;
}

/**
 * Double opt-in email. A subscription is not active until this link is opened.
 */
export async function sendQuestionSubscriptionConfirmation({
  email,
  questionText,
  confirmationUrl,
}: {
  email: string;
  questionText: string;
  confirmationUrl: string;
}): Promise<QuestionEmailResult> {
  const subject = 'Подтвердите подписку на новые ответы';

  return sendEmail({
    to: email,
    subject,
    html: layout({
      heading: 'Подтвердите подписку',
      body: `Вы попросили сообщать о новых ответах на вопрос: «${questionText}». Пока вы не подтвердите адрес, письма отправляться не будут.`,
      button: 'Подтвердить подписку',
      url: confirmationUrl,
      footer: 'Если вы не подписывались, просто проигнорируйте это письмо.',
    }),
    text: `Подтвердите подписку\n\nВы попросили сообщать о новых ответах на вопрос: «${questionText}». Пока вы не подтвердите адрес, письма отправляться не будут.\n\nПодтвердить: ${confirmationUrl}\n\nЕсли вы не подписывались, просто проигнорируйте это письмо.`,
  });
}

/**
 * One new-answer notification.
 *
 * The human answer text is deliberately never included: Question keeps human
 * answers private. The message identifies the question and links to the page,
 * where the subscriber can read the public synthesis.
 */
export async function sendQuestionAnswerNotificationEmail({
  email,
  questionText,
  questionUrl,
  unsubscribeUrl,
  unsubscribeAllUrl,
}: {
  email: string;
  questionText: string;
  questionUrl: string;
  unsubscribeUrl: string;
  unsubscribeAllUrl: string;
}): Promise<QuestionEmailResult> {
  const subject = 'Новый ответ на вопрос';

  return sendEmail({
    to: email,
    subject,
    html: layout({
      heading: 'Появился новый ответ',
      body: `На вопрос «${questionText}» ответил новый человек. Текст ответа остаётся приватным — откройте вопрос, чтобы прочитать обновлённый синтез Пьеро.`,
      button: 'Открыть вопрос',
      url: questionUrl,
      footer: 'Вы получаете это письмо, потому что подписались на новые ответы.',
      footerLinks: [
        { url: unsubscribeUrl, label: 'Отключить email' },
        { url: unsubscribeAllUrl, label: 'Отписаться от всех уведомлений' },
      ],
    }),
    text: `Появился новый ответ\n\nНа вопрос «${questionText}» ответил новый человек. Текст ответа остаётся приватным — откройте вопрос, чтобы прочитать обновлённый синтез Пьеро.\n\nОткрыть: ${questionUrl}\n\nОтключить email: ${unsubscribeUrl}\nОтписаться от всех уведомлений: ${unsubscribeAllUrl}`,
  });
}

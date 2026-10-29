import { Resend } from 'resend';

export type SubscriptionConfirmationResult =
  | { status: 'sent'; providerId: string | null }
  | { status: 'skipped'; reason: 'missing_api_key' }
  | { status: 'error'; reason: 'provider_error' | 'exception' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends the double opt-in link for Journal / Flow. The caller must not treat
 * the subscription as confirmed until the token is opened.
 */
export async function sendSubscriptionConfirmation({
  email,
  token,
  locale,
  baseUrl,
  pierrotAttribution,
  resendApiKey,
}: {
  email: string;
  token: string;
  locale: 'ru' | 'en';
  baseUrl: string;
  pierrotAttribution?: string | null;
  resendApiKey?: string;
}): Promise<SubscriptionConfirmationResult> {
  const apiKey = resendApiKey || process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { status: 'skipped', reason: 'missing_api_key' };
  }

  const ru = locale === 'ru';
  const confirmationUrl = new URL('/api/newsletter-confirm', baseUrl);
  confirmationUrl.searchParams.set('token', token);
  if (pierrotAttribution) {
    confirmationUrl.searchParams.set('pierrot', pierrotAttribution);
  }
  if (ru) confirmationUrl.searchParams.set('lang', 'ru');

  const subject = ru
    ? 'Подтвердите подписку на Journal / Flow'
    : 'Confirm your Journal / Flow subscription';

  const heading = ru ? 'Подтвердите подписку' : 'Confirm your subscription';
  const body = ru
    ? 'Нажмите кнопку ниже, чтобы подтвердить подписку. Пока вы этого не сделали, подписка не активна.'
    : 'Use the button below to confirm. Until you do, the subscription is not active.';
  const button = ru ? 'Подтвердить подписку' : 'Confirm subscription';
  const fallback = ru
    ? 'Если кнопка не работает, откройте ссылку:'
    : 'If the button does not work, open this link:';

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#faf8f5;color:#141210;font-family:Georgia,serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="font:11px/1.5 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8a8176;margin:0 0 18px;">Journal / Flow</p>
      <h1 style="font-size:28px;font-weight:400;margin:0 0 16px;">${escapeHtml(heading)}</h1>
      <p style="font:16px/1.7 Georgia,serif;color:#5b544c;margin:0 0 24px;">${escapeHtml(body)}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(confirmationUrl.toString())}" style="display:inline-block;background:#141210;color:#faf8f5;text-decoration:none;padding:14px 22px;font:12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;">${escapeHtml(button)}</a>
      </p>
      <p style="font:12px/1.6 Arial,sans-serif;color:#8a8176;margin:0 0 8px;">${escapeHtml(fallback)}</p>
      <p style="font:12px/1.6 Arial,sans-serif;word-break:break-all;margin:0;">
        <a href="${escapeHtml(confirmationUrl.toString())}" style="color:#8a8176;">${escapeHtml(confirmationUrl.toString())}</a>
      </p>
    </div>
  </body>
</html>`;

  const text = `${heading}\n\n${body}\n\n${button}: ${confirmationUrl.toString()}`;

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: `${process.env.NOREPLY_DISPLAY || 'Anton Merkurov'} <${
        process.env.NOREPLY_EMAIL || 'noreply@merkurov.love'
      }>`,
      to: email,
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

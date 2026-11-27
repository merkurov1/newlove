import { Resend } from 'resend';

/**
 * Delivers the finished Cast reading to the address the reader chose.
 *
 * The message contains the reading itself (archetype, interpretation and the
 * Agency Index), never the raw answers, the internal record id or any provider
 * metadata. A missing provider configuration is reported explicitly so the UI
 * cannot claim that a copy was sent when it was not.
 */

export type CastResultEmailResult =
  | { status: 'sent'; providerId: string | null }
  | { status: 'not_configured' }
  | { status: 'error'; reason: 'provider_error' | 'exception' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type CastResultEmailInput = {
  email: string;
  locale: 'en' | 'ru';
  archetype: string;
  agencyIndex: number | null;
  summary: string | null;
  directive: string | null;
  resendApiKey?: string;
  from?: string;
};

export async function sendCastResultEmail(
  input: CastResultEmailInput
): Promise<CastResultEmailResult> {
  const apiKey = input.resendApiKey || process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { status: 'not_configured' };
  }

  const ru = input.locale === 'ru';
  const subject = ru
    ? 'Ваше прочтение Каста'
    : 'Your Cast reading';

  const intro = ru
    ? 'Вы сохранили это прочтение в Касте. Это интерпретация, а не измерение личности и не клинический диагноз.'
    : 'You saved this Cast reading. It is an interpretation, not a measurement of your personality and not a clinical diagnosis.';

  const summaryLabel = ru ? 'Коротко' : 'Summary';
  const directiveLabel = ru ? 'Следующий шаг' : 'Next step';
  const agencyLabel = ru ? 'Индекс агентности' : 'Agency index';

  const blocks = [
    `<p style="font:11px/1.6 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#8a8176;margin:0 0 14px;">${escapeHtml(
      ru ? 'Каст' : 'The Cast'
    )}</p>`,
    `<h1 style="font-size:30px;font-weight:400;margin:0 0 8px;">${escapeHtml(
      input.archetype
    )}</h1>`,
    input.agencyIndex !== null
      ? `<p style="font:12px/1.6 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a8176;margin:0 0 24px;">${escapeHtml(
          agencyLabel
        )}: ${input.agencyIndex}/100</p>`
      : '',
    `<p style="font:16px/1.7 Georgia,serif;color:#5b544c;margin:0 0 20px;">${escapeHtml(
      intro
    )}</p>`,
    input.summary
      ? `<h2 style="font:12px/1.6 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8a8176;margin:24px 0 8px;">${escapeHtml(
          summaryLabel
        )}</h2><p style="font:16px/1.7 Georgia,serif;color:#3f3a35;margin:0;">${escapeHtml(
          input.summary
        )}</p>`
      : '',
    input.directive
      ? `<h2 style="font:12px/1.6 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8a8176;margin:24px 0 8px;">${escapeHtml(
          directiveLabel
        )}</h2><p style="font:16px/1.7 Georgia,serif;color:#3f3a35;margin:0;">${escapeHtml(
          input.directive
        )}</p>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#faf8f5;color:#141210;font-family:Georgia,serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      ${blocks}
    </div>
  </body>
</html>`;

  const text = [
    ru ? 'Каст' : 'The Cast',
    input.archetype,
    input.agencyIndex !== null ? `${agencyLabel}: ${input.agencyIndex}/100` : '',
    intro,
    input.summary ? `${summaryLabel}: ${input.summary}` : '',
    input.directive ? `${directiveLabel}: ${input.directive}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from:
        input.from ||
        process.env.CAST_EMAIL_FROM ||
        'Digital Temple <cast@merkurov.love>',
      to: input.email,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[cast-email] provider rejected the message', {
        code: error.name || 'provider_error',
      });

      return { status: 'error', reason: 'provider_error' };
    }

    return { status: 'sent', providerId: data?.id ?? null };
  } catch (error) {
    console.error('[cast-email] send failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return { status: 'error', reason: 'exception' };
  }
}

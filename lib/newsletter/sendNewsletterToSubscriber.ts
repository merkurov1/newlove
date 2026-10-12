
import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { getServerSupabaseClient } from '@/lib/serverAuth';

type Subscriber = {
  id: string;
  email: string;
};

type SendOptions = {
  token?: string;
  skipTokenInsert?: boolean;
  resendApiKey?: string;
};

type Letter = {
  id?: string;
  title: string;
  content?: unknown;
  html?: string;
  text?: string;
  kind?: string;
};

export async function sendNewsletterToSubscriber(
  subscriber: Subscriber,
  letter: Letter,
  opts: SendOptions = {},
) {
  if (!subscriber?.email || !subscriber?.id) {
    return { status: 'error', error: 'Invalid subscriber' };
  }

  if (!letter?.title) {
    return { status: 'error', error: 'Invalid letter' };
  }

  const unsubscribeToken = opts.token || createId();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.merkurov.love';

  const unsubscribeUrl =
    `${siteUrl}/api/newsletter-unsubscribe?token=` +
    encodeURIComponent(unsubscribeToken);

  if (!opts.skipTokenInsert) {
    try {
      const supabase = getServerSupabaseClient({
        useServiceRole: true,
      });

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      );

      const { error } = await supabase
        .from('subscriber_tokens')
        .insert({
          subscriber_id: subscriber.id,
          type: 'unsubscribe',
          token: unsubscribeToken,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        });

      if (error) {
        console.warn(
          '[Newsletter] Unsubscribe token insert warning:',
          error.message,
        );
      }
    } catch (error) {
      console.warn(
        '[Newsletter] Could not create unsubscribe token:',
        error,
      );
    }
  }

  let emailHtml = '';
  let emailText = letter.text || '';

  try {
    if (letter.html) {
      // Newspaper issues use the immutable HTML snapshot saved at build time.
      emailHtml = letter.html;

      const unsubscribeBlock = `
        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ded9da;font:11px/1.5 Arial,sans-serif;color:#6b6668;">
          <a href="${unsubscribeUrl}" style="color:#990f3d;">Unsubscribe</a>
        </div>`;

      if (/<\/body>/i.test(emailHtml)) {
        emailHtml = emailHtml.replace(
          /<\/body>/i,
          `${unsubscribeBlock}</body>`,
        );
      } else {
        emailHtml += unsubscribeBlock;
      }

      if (!emailText) {
        emailText = `${letter.title}\n\n${siteUrl}/letters`;
      }

      emailText += `\n\nUnsubscribe: ${unsubscribeUrl}`;
    } else {
      // Existing ordinary-letter pipeline remains unchanged.
      let safeContent: unknown = letter.content;

      try {
        safeContent =
          typeof letter.content === 'string'
            ? letter.content
            : JSON.parse(JSON.stringify(letter.content));
      } catch {
        safeContent = String(letter.content || '');
      }

      emailHtml =
        renderNewsletterEmail(
          {
            ...letter,
            content: safeContent,
          },
          unsubscribeUrl,
        ) || '';
    }
  } catch (error) {
    console.error('[Newsletter] Rendering failed:', error);

    const safeTitle = String(letter.title)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    emailHtml = `
      <!doctype html>
      <html>
        <body>
          <h1>${safeTitle}</h1>
          <p><a href="${unsubscribeUrl}">Unsubscribe</a></p>
        </body>
      </html>`;
  }

  const apiKey = opts.resendApiKey || process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.info(
      '[Newsletter] Dry run: RESEND_API_KEY is not configured.',
    );
    return {
      status: 'skipped',
      unsubscribeUrl,
      reason: 'missing_resend_api_key',
    };
  }

  const fromEmail =
    process.env.NOREPLY_EMAIL || 'noreply@merkurov.love';
  const fromDisplay =
    process.env.NOREPLY_DISPLAY || 'Anton Merkurov';
  const from = `${fromDisplay} <${fromEmail}>`;

  try {
    const resend = new Resend(apiKey);

    const response = await resend.emails.send({
      from,
      to: subscriber.email,
      subject: letter.title,
      html: emailHtml,
      ...(emailText ? { text: emailText } : {}),
    });

    const result = response as any;
    const providerId =
      result?.id ??
      result?.data?.id ??
      result?.raw?.data?.id ??
      result?.raw?.id ??
      null;

    if (result?.error) {
      return {
        status: 'error',
        error: result.error.message || 'Resend returned an error.',
        providerDetails: result.error,
      };
    }

    return {
      status: 'sent',
      unsubscribeUrl,
      providerResponse: {
        id: providerId,
        status: result?.status ?? 'unknown',
      },
    };
  } catch (error: any) {
    console.error(
      '[Newsletter] Send failed:',
      error?.message || String(error),
    );

    return {
      status: 'error',
      error: error?.message || 'Unknown send error',
      providerDetails: error?.response || error?.body || undefined,
    };
  }
}

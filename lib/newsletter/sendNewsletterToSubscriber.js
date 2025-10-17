import { Resend } from 'resend';
import { createId } from '@paralleldrive/cuid2';
// Note: getUserAndSupabaseFromRequest is not used here; avoid importing to prevent build errors
import { renderNewsletterEmail } from '@/emails/NewsletterEmail';
import { getServerSupabaseClient } from '@/lib/serverAuth';

/**
 * Отправляет письмо рассылки с уникальной ссылкой для отписки
 * @param {object} subscriber - объект подписчика (id, email)
 * @param {object} letter - объект письма (title, ...)
 */
/**
 * Send a newsletter email to a single subscriber.
 * This function is safe to call in a server action; it uses the server role Supabase client
 * to insert unsubscribe tokens. If RESEND API key is missing, it will perform a dry-run.
 *
 * @param {{id: string, email: string}} subscriber
 * @param {{id?: string, title: string, html?: string, content?: any}} letter
 * @returns {Promise<{status: string, unsubscribeUrl?: string, error?: string}>}
 */
export async function sendNewsletterToSubscriber(subscriber, letter, opts = {}) {
  if (!subscriber || !subscriber.email || !subscriber.id) {
    return { status: 'error', error: 'Invalid subscriber' };
  }
  if (!letter || !letter.title) {
    return { status: 'error', error: 'Invalid letter' };
  }

  // Allow caller to pass a pre-generated token to avoid duplicate inserts
  const unsubscribeToken = opts.token || createId();
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love'}/api/newsletter-unsubscribe?token=${unsubscribeToken}`;

  // Insert token via server client but don't fail send if token insert fails.
  // If opts.skipTokenInsert === true, caller provided and already inserted the token.
  if (!opts.skipTokenInsert) {
    try {
      const serverSupabase = getServerSupabaseClient({ useServiceRole: true });
      if (serverSupabase) {
        const tokenRow = { subscriber_id: subscriber.id, type: 'unsubscribe', token: unsubscribeToken, created_at: new Date().toISOString() };
        const { error: tokenErr } = await serverSupabase.from('subscriber_tokens').insert(tokenRow);
        if (tokenErr) {
          console.warn('subscriber_tokens insert warning:', tokenErr.message || String(tokenErr));
        } else {
          console.info('Inserted unsubscribe token for', subscriber.email);
        }
      }
    } catch (e) {
      console.warn('Failed to insert unsubscribe token (non-fatal):', (e && e.message) || String(e));
    }
  }

  // Render email HTML (if renderNewsletterEmail returns string or accepts unsubscribeUrl)
  let emailHtml = '';
  try {
    emailHtml = renderNewsletterEmail(letter, unsubscribeUrl) || '';
  } catch (e) {
    console.warn('Newsletter render failed, falling back to basic layout:', e?.message || e);
    emailHtml = `<p>${letter.title}</p><p>To unsubscribe click <a href="${unsubscribeUrl}">here</a></p>`;
  }

  // If RESEND key is missing, treat as dry-run
  if (!process.env.RESEND_API_KEY) {
    console.info('Dry-run: RESEND_API_KEY not configured. Email not sent.');
    return { status: 'skipped', unsubscribeUrl };
  }

  try {
    console.info('Sending newsletter', { to: subscriber.email, letterId: letter.id || null });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const resp = await resend.emails.send({
      from: process.env.NOREPLY_EMAIL || 'noreply@merkurov.love',
      to: subscriber.email,
      subject: letter.title,
      html: emailHtml,
    });
    // Return provider response for debugging (test route can surface this)
    return { status: 'sent', unsubscribeUrl, providerResponse: resp };
  } catch (sendErr) {
    console.error('Failed to send newsletter email:', (sendErr && sendErr.message) || String(sendErr), sendErr);
    // Provide as much useful info as possible for debugging
    const errMsg = (sendErr && (sendErr.message || sendErr.toString())) || 'Unknown send error';
    const errDetails = sendErr && sendErr.response ? sendErr.response : undefined;
    return { status: 'error', error: errMsg, details: errDetails };
  }
}

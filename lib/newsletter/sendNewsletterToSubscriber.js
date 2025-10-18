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
    // Allow overriding the API key for debugging (do not persist keys)
    const apiKey = opts.resendApiKey || process.env.RESEND_API_KEY;
    const resend = new Resend(apiKey);
    const resp = await resend.emails.send({
      from: process.env.NOREPLY_EMAIL || 'noreply@merkurov.love',
      to: subscriber.email,
      subject: letter.title,
      html: emailHtml,
    });
    // Return provider response for debugging (test route can surface this)
    // Normalize response to include common fields for easier logging in server actions
    const providerResponse = {
      id: resp?.id || null,
      status: resp?.status || null,
      raw: resp,
    };
    console.info('Resend provider response', { to: subscriber.email, providerResponse });
    return { status: 'sent', unsubscribeUrl, providerResponse };
  } catch (sendErr) {
    try { (await import('@sentry/nextjs')).captureException(sendErr); } catch (e) {}
    console.error('Failed to send newsletter email:', (sendErr && sendErr.message) || String(sendErr));
    // Attempt to extract provider response / HTTP body from common shapes
    let providerDetails = undefined;
    try {
      // axios-like
      if (sendErr && sendErr.response) providerDetails = sendErr.response;
      // fetch-like (node-fetch) may have .body
      else if (sendErr && sendErr.body) providerDetails = sendErr.body;
      // Resend SDK may attach rawError or data
      else if (sendErr && sendErr.rawError) providerDetails = sendErr.rawError;
    } catch (ex) {
      // ignore
    }

    const errMsg = (sendErr && (sendErr.message || sendErr.toString())) || 'Unknown send error';
    return { status: 'error', error: errMsg, providerDetails, raw: sendErr };
  }
}

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
    // Normalize letter content to plain JSON/string to avoid passing
    // objects with custom prototypes into the react-email renderer.
    const safeLetter = { ...letter };
    try {
      safeLetter.content = typeof letter.content === 'string' ? letter.content : JSON.parse(JSON.stringify(letter.content));
    } catch (e) {
      // fallback: coerce to string
      safeLetter.content = typeof letter.content === 'string' ? letter.content : String(letter.content || '');
    }
    emailHtml = renderNewsletterEmail(safeLetter, unsubscribeUrl) || '';
  } catch (e) {
    console.warn('Newsletter render failed, falling back to basic layout:', e?.message || e);
    emailHtml = `<p>${letter.title}</p><p>To unsubscribe click <a href="${unsubscribeUrl}">here</a></p>`;
  }

  // If RESEND key is missing, treat as dry-run
  // Determine API key (allow override via opts.resendApiKey)
  const apiKey = opts.resendApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info('Dry-run: RESEND API key not configured. Email not sent.');
    return { status: 'skipped', unsubscribeUrl };
  }

  // Build from header (display name + email) with safe defaults
  // so it's available when we call the provider below.
  const fromEmail = process.env.NOREPLY_EMAIL || 'noreply@merkurov.love';
  const fromDisplay = process.env.NOREPLY_DISPLAY || 'Anton Merkurov';
  const fromHeader = `${fromDisplay} <${fromEmail}>`;
  // Log presence of key (masked) for debugging; keep logging in try
  // to avoid crashing when e.g. apiKey is not a string-like value.
  try {
    const maskedKey = `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-4)}`;
    console.info('Resend send: using API key', maskedKey, 'from', fromHeader);
  } catch (e) { /* ignore logging errors */ }

  try {
    console.info('Sending newsletter', { to: subscriber.email, letterId: letter.id || null });
    const resend = new Resend(apiKey);
    const resp = await resend.emails.send({
      from: fromHeader,
      to: subscriber.email,
      subject: letter.title,
      html: emailHtml,
    });
    // The Resend SDK may return different shapes depending on version:
    // - { id, status, ... }
    // - { data: { id, ... }, error: ... }
    // Normalize common fields when present.
    const extractedId = resp?.id ?? resp?.data?.id ?? (resp && resp.raw && resp.raw.data && resp.raw.data.id) ?? null;
    const extractedStatus = resp?.status ?? resp?.data?.status ?? null;
    const providerResponse = { id: extractedId, status: extractedStatus, raw: resp };
    console.info('Resend provider response', { to: subscriber.email, providerResponse });
    return { status: 'sent', unsubscribeUrl, providerResponse };
  } catch (sendErr) {
    try { (await import('@sentry/nextjs')).captureException(sendErr); } catch (e) { }
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
      // Some libs attach status/code
      if (sendErr && sendErr.status) providerDetails = { ...(providerDetails || {}), status: sendErr.status };
      if (sendErr && sendErr.code) providerDetails = { ...(providerDetails || {}), code: sendErr.code };
    } catch (ex) {
      // ignore
    }

    const errMsg = (sendErr && (sendErr.message || sendErr.toString())) || 'Unknown send error';
    return { status: 'error', error: errMsg, providerDetails, raw: sendErr, apiKeyUsed: `${String(apiKey).slice(0, 4)}...${String(apiKey).slice(-4)}` };
  }
}

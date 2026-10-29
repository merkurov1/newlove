type ServiceInquiryNotification = {
  leadId: string;
  needType: string | null;
  stage: string | null;
  timeline: string | null;
  name: string;
  email: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Existing owner-notification mechanism (Telegram). It is called only after
 * the visitor explicitly consented in the request form.
 */
export async function notifyServiceInquiry(inquiry: ServiceInquiryNotification): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return false;

  const text = [
    '<b>New Advising / Art Engine service inquiry</b>',
    '',
    `<b>Need</b>: ${escapeHtml(inquiry.needType || 'not specified')}`,
    `<b>Stage</b>: ${escapeHtml(inquiry.stage || 'not specified')}`,
    `<b>Timeline</b>: ${escapeHtml(inquiry.timeline || 'not specified')}`,
    `<b>Name</b>: ${escapeHtml(inquiry.name || 'not provided')}`,
    `<b>Email</b>: ${escapeHtml(inquiry.email)}`,
    `<b>Lead</b>: ${escapeHtml(inquiry.leadId)}`,
    '',
    'Consent to contact was given in the request form.',
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    if (!response.ok) {
      console.error('Service inquiry notification failed');
      return false;
    }

    return true;
  } catch {
    console.error('Service inquiry notification failed');
    return false;
  }
}

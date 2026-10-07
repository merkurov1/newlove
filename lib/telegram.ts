export function verifyTelegramWebhookSecret(secret: string | undefined) {
  return secret && process.env.TELEGRAM_WEBHOOK_SECRET
    ? secret === process.env.TELEGRAM_WEBHOOK_SECRET
    : true;
}

export function parseTelegramMessage(raw: any) {
  const message = raw?.message ?? raw?.edited_message ?? null;
  if (!message) return null;

  const text = message.text ?? message.caption ?? '';
  const from = message.from ?? {};
  const chat = message.chat ?? {};

  return {
    id: String(message.message_id ?? crypto.randomUUID()),
    chatId: String(chat.id ?? ''),
    userId: String(from.id ?? ''),
    username: from.username ?? '',
    firstName: from.first_name ?? '',
    text,
    type: message.document ? 'document' : message.photo ? 'photo' : 'text',
    media: {
      document: message.document ?? null,
      photo: message.photo ?? null,
      fileName: message.document?.file_name ?? null,
      mimeType: message.document?.mime_type ?? null,
    },
  };
}

export function isAllowedTelegramUser(userId: string | undefined) {
  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!allowed.length) return true;

  return allowed.includes(String(userId ?? ''));
}

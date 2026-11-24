/**
 * Server-only bot-token lookup. Never import this from a client component and
 * never log or return the value.
 */
export function readTelegramBotToken(): string {
  return (
    process.env.PIERROT_BOT_TOKEN ||
    process.env.OSIRIS_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    ''
  ).trim();
}

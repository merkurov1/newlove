import vorobievayaJson from '@/data/telegram-research-public/vorobievaya.json';
import baartelloJson from '@/data/telegram-research-public/baartello.json';
import type { PublicTelegramCase } from './public-case';

/**
 * Ordered presentation list. Only sanitized public JSON is imported here:
 * no raw messages, Telegram IDs, media paths or DeepSeek source IDs.
 *
 * The reports are static imports so Next.js includes them in the server
 * bundle. The underlying raw corpora stay in data/telegram-research/, which
 * is excluded from Git.
 */
export const PUBLIC_TELEGRAM_CASES: PublicTelegramCase[] = [
  vorobievayaJson as PublicTelegramCase,
  baartelloJson as PublicTelegramCase,
];

export function getPublicTelegramCase(slug: string): PublicTelegramCase | null {
  return PUBLIC_TELEGRAM_CASES.find((item) => item.slug === slug) ?? null;
}

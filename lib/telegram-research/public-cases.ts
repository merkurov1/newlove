import vorobievayaJson from '@/data/telegram-research-public/vorobievaya.json';
import baartelloJson from '@/data/telegram-research-public/baartello.json';
import type { PublicTelegramCase } from './public-case';

/**
 * Ordered presentation list. Each local corpus is built independently and
 * only its sanitized public JSON is imported here; raw messages never reach
 * the web app.
 */
export const PUBLIC_TELEGRAM_CASES: PublicTelegramCase[] = [
  vorobievayaJson as PublicTelegramCase,
  baartelloJson as PublicTelegramCase,
];

export function getPublicTelegramCase(slug: string): PublicTelegramCase | null {
  return PUBLIC_TELEGRAM_CASES.find((item) => item.slug === slug) ?? null;
}

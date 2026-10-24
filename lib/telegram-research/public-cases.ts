import vorobievayaJson from '@/data/telegram-research-public/vorobievaya.json';
import type { PublicTelegramCase } from './public-case';

export const PUBLIC_TELEGRAM_CASES: PublicTelegramCase[] = [vorobievayaJson as PublicTelegramCase];

export function getPublicTelegramCase(slug: string): PublicTelegramCase | null {
  return PUBLIC_TELEGRAM_CASES.find((item) => item.slug === slug) ?? null;
}

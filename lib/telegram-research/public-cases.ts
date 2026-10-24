import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import vorobievayaJson from '@/data/telegram-research-public/vorobievaya.json';
import type { PublicTelegramCase } from './public-case';

/**
 * Public presentation cases.
 *
 * The existing Vorobievaya case is tracked and statically imported. Newer
 * cases are generated from private local corpora and deliberately stay out of
 * Git: their sanitized JSON is loaded from disk at runtime on the server only.
 * If the file is absent (for example in a clean clone or CI), the case is
 * simply not registered instead of breaking the whole research route.
 */
const LOCAL_PUBLIC_CASES_DIR = path.join(process.cwd(), 'data', 'telegram-research-public');

function readLocalPublicCase(slug: string): PublicTelegramCase | null {
  const file = path.join(LOCAL_PUBLIC_CASES_DIR, `${slug}.json`);

  if (!existsSync(file)) return null;

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PublicTelegramCase;

    // Refuse to register a file that claims to contain raw messages or whose
    // slug does not match the requested case.
    if (!parsed || parsed.slug !== slug || parsed.privacy?.containsRawMessages !== false) {
      return null;
    }

    return parsed;
  } catch {
    // A malformed local report must not crash the rest of the private route.
    return null;
  }
}

const localCases = ['baartello']
  .map(readLocalPublicCase)
  .filter((item): item is PublicTelegramCase => item !== null);

export const PUBLIC_TELEGRAM_CASES: PublicTelegramCase[] = [
  vorobievayaJson as PublicTelegramCase,
  ...localCases,
];

export function getPublicTelegramCase(slug: string): PublicTelegramCase | null {
  return PUBLIC_TELEGRAM_CASES.find((item) => item.slug === slug) ?? null;
}

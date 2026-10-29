/**
 * Turns bare public routes in assistant prose into markdown links.
 *
 * The model sometimes writes "Арт (/heartandangel)" instead of a markdown
 * link. Only routes from the verified internal catalogue are linked; code
 * blocks and existing markdown links are left untouched.
 */

import { PIERROT_VERIFIED_INTERNAL_ROUTES } from '@/lib/pierrot/offers';
import { normalizePathname } from '@/lib/pierrot/navigation';

const ROUTE_PATTERN = /^\/(?!\/)[a-z0-9][a-z0-9\-/]*(?:[?#][^\s)]*)?$/i;

function isKnownRoute(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0];

  return PIERROT_VERIFIED_INTERNAL_ROUTES.has(normalizePathname(path));
}

export function linkifyInternalRoutes(content: string): string {
  if (!content) return content;

  const tokens: string[] = [];
  const stash = (value: string) => `\u0000LINKIFY${tokens.push(value) - 1}\u0000`;

  let text = content;

  // Never touch code or an already formatted markdown link.
  text = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, stash);
  text = text.replace(/\[[^\]]+\]\([^)]+\)/g, stash);

  // "Арт (/heartandangel)" -> "[Арт](/heartandangel)".
  text = text.replace(
    /([^\s(\]]+)\s*\((\/(?!\/)[a-z0-9][a-z0-9\-/]*(?:[?#][^\s)]*)?)\)/gi,
    (match, label: string, path: string) => {
      if (!isKnownRoute(path)) return match;

      return stash(`[${label}](${path})`);
    }
  );

  // Bare "/lobby" -> "[/lobby](/lobby)".
  text = text.replace(
    /(^|[\s(])(\/(?!\/)[a-z0-9][a-z0-9\-/]*(?:[?#][^\s)]*)?)/gi,
    (match, prefix: string, path: string) => {
      if (!isKnownRoute(path)) return match;

      return `${prefix}${stash(`[${path}](${path})`)}`;
    }
  );

  return text.replace(/\u0000LINKIFY(\d+)\u0000/g, (_match, index: string) => {
    return tokens[Number(index)] ?? '';
  });
}

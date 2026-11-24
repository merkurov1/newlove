/**
 * Telegram native chrome palette.
 *
 * The Temple is always light. Only Temple-family and Flow routes receive the
 * light chrome; every other route keeps the existing shell colours.
 */

export const TEMPLE_LIGHT_CHROME = {
  header: '#f6f1e8',
  background: '#f6f1e8',
  bottomBar: '#efe7da',
} as const;

export const DEFAULT_DARK_CHROME = {
  header: '#141210',
  background: '#141210',
  bottomBar: '#141210',
} as const;

export type TelegramChrome = {
  header: string;
  background: string;
  bottomBar: string;
};

function normalize(pathname: string) {
  return pathname.replace(/\/$/, '') || '/';
}

export function isTempleFamilyRoute(pathname: string): boolean {
  const path = normalize(pathname);

  if (path === '/flow' || path.startsWith('/flow/')) return true;

  return [
    '/temple',
    '/vigil',
    '/cast',
    '/absolution',
    '/tribute',
    '/heartandangel',
  ].some((route) => path === route || path.startsWith(`${route}/`));
}

export function resolveTelegramChrome(pathname: string): {
  tone: 'temple' | 'default';
  colors: TelegramChrome;
} {
  return isTempleFamilyRoute(pathname)
    ? { tone: 'temple', colors: TEMPLE_LIGHT_CHROME }
    : { tone: 'default', colors: DEFAULT_DARK_CHROME };
}

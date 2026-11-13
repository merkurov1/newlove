/**
 * Shared route classification for the Temple / Heart & Angel shell.
 *
 * Keep this as the single source of truth for:
 * - routes that hide the global site Header/Footer;
 * - routes that need the immersive `ritual-route` body state;
 * - routes that already provide their own back navigation in Telegram.
 */
export const IMMERSIVE_ROUTES = [
  '/temple',
  '/cast',
  '/vigil',
  '/absolution',
  '/tribute',
  '/heartandangel/world',
  '/heartandangel/calm',
  '/heartandangel/letitgo',
] as const;

/**
 * These routes already have TempleTopBar (or equivalent) and therefore do not
 * need the floating Telegram World/Temple navigation.
 */
export const TELEGRAM_NAV_HIDDEN_ROUTES = [
  '/heartandangel/calm',
  '/heartandangel/letitgo',
  '/vigil',
  '/absolution',
  '/cast',
  '/tribute',
] as const;

/**
 * Pages that render their own artistic footer. The global site footer must not
 * be rendered underneath them in the regular browser.
 */
export const CUSTOM_FOOTER_ROUTES = [
  '/heartandangel',
  '/heartandangel/card',
  '/unframed',
  '/unframed/book',
  '/unframed/proposal',
  '/unframed/spectral-tiger',
  '/unframed/container',
  '/unframed/debug',
] as const;

export function normalizeRoute(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

export function isRouteOrChild(pathname: string, route: string): boolean {
  const normalized = normalizeRoute(pathname);
  const target = normalizeRoute(route);

  return normalized === target || normalized.startsWith(`${target}/`);
}

export function isImmersiveRoute(pathname: string): boolean {
  return IMMERSIVE_ROUTES.some((route) => isRouteOrChild(pathname, route));
}

/** The body class that hides the global header/footer for immersive pages. */
export function isRitualRoute(pathname: string): boolean {
  return isImmersiveRoute(pathname);
}

export function isTelegramNavigationHidden(pathname: string): boolean {
  return TELEGRAM_NAV_HIDDEN_ROUTES.some((route) => isRouteOrChild(pathname, route));
}

export function isCustomFooterRoute(pathname: string): boolean {
  const normalized = normalizeRoute(pathname);

  return CUSTOM_FOOTER_ROUTES.some((route) => normalized === normalizeRoute(route));
}

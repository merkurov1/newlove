/**
 * The Telegram Mini App navigation model.
 *
 * One route-aware system serves both products:
 *
 * - Temple / Heart & Angel keeps the sanctuary map: World, the Temple home and
 *   the four canonical rituals.
 * - Flow keeps the editorial index: the stream and its issues archive.
 *
 * The destinations below are canonical first-party routes. Temple rituals are
 * imported from the shared ritual menu so the Telegram sheet, the Temple home
 * and the ritual pages can never drift apart.
 */

import { TEMPLE_RITUAL_LINKS } from '@/lib/temple/ritualMenu';

export const TELEGRAM_NAV_WORLD_HREF = '/heartandangel/world';
export const TELEGRAM_NAV_TEMPLE_HREF = '/temple';
export const TELEGRAM_NAV_FLOW_HREF = '/flow';
export const TELEGRAM_NAV_FLOW_ISSUES_HREF = '/flow-issues';

export type TelegramNavigationContext = 'flow' | 'temple';

export type TelegramNavigationIcon =
  | 'world'
  | 'temple'
  | 'calm'
  | 'release'
  | 'absolution'
  | 'cast'
  | 'flow'
  | 'issues';

export type TelegramNavigationLink = {
  href: string;
  label: string;
  description: string;
  icon: TelegramNavigationIcon;
  /**
   * Extra canonical aliases for the same destination. `/en/flow-issues` is an
   * interface variant of the Russian archive, not a second page.
   */
  match?: readonly string[];
};

export type TelegramNavigationGroup = {
  id: string;
  label: string;
  links: readonly TelegramNavigationLink[];
};

export type TelegramNavigationModel = {
  context: TelegramNavigationContext;
  /** Short word used inside the compact trigger. */
  triggerLabel: string;
  triggerAriaLabel: string;
  eyebrow: string;
  title: string;
  note: string;
  groups: readonly TelegramNavigationGroup[];
  crossSpace?: TelegramNavigationLink;
  /** Resolved canonical href of the current destination, if any. */
  activeHref: string | null;
};

type NavigationDefinition = Omit<TelegramNavigationModel, 'activeHref'>;

const RITUAL_COPY: Record<string, { description: string; icon: TelegramNavigationIcon }> = {
  '/heartandangel/calm': {
    description: 'Stillness · Breathe',
    icon: 'calm',
  },
  '/heartandangel/letitgo': {
    description: 'Release · Ash',
    icon: 'release',
  },
  '/absolution': {
    description: 'Confession · Mercy',
    icon: 'absolution',
  },
  '/cast': {
    description: 'The question · Fate',
    icon: 'cast',
  },
};

const RITUAL_LINKS: TelegramNavigationLink[] = TEMPLE_RITUAL_LINKS.map((ritual) => ({
  href: ritual.href,
  label: ritual.label,
  description: RITUAL_COPY[ritual.href]?.description ?? 'Ritual',
  icon: RITUAL_COPY[ritual.href]?.icon ?? 'temple',
}));

const WORLD_LINK: TelegramNavigationLink = {
  href: TELEGRAM_NAV_WORLD_HREF,
  label: 'World',
  description: 'The living landscape',
  icon: 'world',
};

const TEMPLE_LINK: TelegramNavigationLink = {
  href: TELEGRAM_NAV_TEMPLE_HREF,
  label: 'Temple',
  description: 'The sanctuary',
  icon: 'temple',
};

const FLOW_LINK: TelegramNavigationLink = {
  href: TELEGRAM_NAV_FLOW_HREF,
  label: 'Flow',
  description: 'Stream of thoughts & media',
  icon: 'flow',
};

const FLOW_ISSUES_LINK: TelegramNavigationLink = {
  href: TELEGRAM_NAV_FLOW_ISSUES_HREF,
  label: 'Flow Issues',
  description: 'Editorial issues archive',
  icon: 'issues',
  match: ['/en/flow-issues'],
};

const TEMPLE_NAVIGATION: NavigationDefinition = {
  context: 'temple',
  triggerLabel: 'Temple',
  triggerAriaLabel: 'Open Temple navigation',
  eyebrow: 'Heart & Angel',
  title: 'Temple',
  note: 'The sanctuary, its rituals, and the World.',
  groups: [
    {
      id: 'place',
      label: 'Place',
      links: [WORLD_LINK, TEMPLE_LINK],
    },
    {
      id: 'rituals',
      label: 'Rituals',
      links: RITUAL_LINKS,
    },
  ],
};

const FLOW_NAVIGATION: NavigationDefinition = {
  context: 'flow',
  triggerLabel: 'Flow',
  triggerAriaLabel: 'Open Flow navigation',
  eyebrow: 'Index',
  title: 'Flow',
  note: 'The stream and its editorial issues.',
  groups: [
    {
      id: 'index',
      label: 'Index',
      links: [FLOW_LINK, FLOW_ISSUES_LINK],
    },
  ],
  crossSpace: {
    href: TELEGRAM_NAV_TEMPLE_HREF,
    label: 'Temple',
    description: 'Visit the sanctuary',
    icon: 'temple',
  },
};

const FLOW_ROUTE_PREFIXES = ['/flow', '/flow-issues', '/en/flow-issues'] as const;

export function normalizeTelegramNavigationPath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function isRouteOrChild(pathname: string, route: string): boolean {
  const current = normalizeTelegramNavigationPath(pathname);
  const target = normalizeTelegramNavigationPath(route);

  return current === target || current.startsWith(`${target}/`);
}

/**
 * Flow owns its editorial surfaces. `/flow-issues` and its English interface
 * variant are part of the same product even though they do not live under
 * `/flow/`.
 */
export function isTelegramFlowRoute(pathname: string): boolean {
  const current = normalizeTelegramNavigationPath(pathname);

  return FLOW_ROUTE_PREFIXES.some(
    (prefix) => current === prefix || current.startsWith(`${prefix}/`)
  );
}

export function isTelegramTempleRoute(pathname: string): boolean {
  const current = normalizeTelegramNavigationPath(pathname);

  return ['/temple', '/vigil', '/cast', '/absolution', '/tribute', '/heartandangel'].some(
    (route) => current === route || current.startsWith(`${route}/`)
  );
}

export function resolveTelegramNavigationContext(pathname: string): TelegramNavigationContext {
  return isTelegramFlowRoute(pathname) ? 'flow' : 'temple';
}

function matchesLink(pathname: string, link: TelegramNavigationLink): boolean {
  return [link.href, ...(link.match ?? [])].some((route) => isRouteOrChild(pathname, route));
}

export function findActiveTelegramNavigationHref(
  pathname: string,
  definition: NavigationDefinition
): string | null {
  for (const group of definition.groups) {
    for (const link of group.links) {
      if (matchesLink(pathname, link)) return link.href;
    }
  }

  return null;
}

export function resolveTelegramNavigation(pathname: string): TelegramNavigationModel {
  const context = resolveTelegramNavigationContext(pathname);
  const definition = context === 'flow' ? FLOW_NAVIGATION : TEMPLE_NAVIGATION;

  return {
    ...definition,
    activeHref: findActiveTelegramNavigationHref(pathname, definition),
  };
}

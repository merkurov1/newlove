import {
  TELEGRAM_NAV_FLOW_HREF,
  TELEGRAM_NAV_FLOW_ISSUES_HREF,
  TELEGRAM_NAV_TEMPLE_HREF,
  TELEGRAM_NAV_WORLD_HREF,
  isTelegramFlowRoute,
  isTelegramTempleRoute,
  pushTelegramNavigationRoute,
  replaceTelegramNavigationRoute,
  resolveTelegramNavigation,
  resolveTelegramNavigationContext,
  resolveTelegramSectionHome,
} from '@/lib/telegram/navigation';
import { TEMPLE_RITUAL_LINKS } from '@/lib/temple/ritualMenu';

function allHrefs(model: ReturnType<typeof resolveTelegramNavigation>) {
  return model.groups.flatMap((group) => group.links.map((link) => link.href));
}

describe('Telegram navigation route model', () => {
  it('classifies Flow and Flow Issues as the Flow product', () => {
    for (const pathname of [
      '/flow',
      '/flow/',
      '/flow/an-entry',
      '/flow-issues',
      '/flow-issues/issue-1',
      '/en/flow-issues/issue-1',
    ]) {
      expect(isTelegramFlowRoute(pathname)).toBe(true);
      expect(resolveTelegramNavigationContext(pathname)).toBe('flow');
    }
  });

  it('classifies Temple and Heart & Angel routes as the Temple product', () => {
    for (const pathname of [
      '/temple',
      '/temple/whispers',
      '/heartandangel',
      '/heartandangel/world',
      '/heartandangel/calm',
      '/heartandangel/letitgo',
      '/absolution',
      '/cast',
      '/vigil',
      '/tribute',
    ]) {
      expect(isTelegramTempleRoute(pathname)).toBe(true);
      expect(resolveTelegramNavigationContext(pathname)).toBe('temple');
    }
  });

  it('keeps the Temple menu canonical: World, Temple and all four rituals', () => {
    const model = resolveTelegramNavigation('/temple');

    expect(model.context).toBe('temple');
    expect(allHrefs(model)).toEqual([
      TELEGRAM_NAV_WORLD_HREF,
      TELEGRAM_NAV_TEMPLE_HREF,
      ...TEMPLE_RITUAL_LINKS.map((ritual) => ritual.href),
    ]);

    expect(model.groups.map((group) => group.label)).toEqual(['Place', 'Rituals']);
    expect(model.crossSpace).toBeUndefined();
  });

  it('does not present Temple rituals inside Flow', () => {
    const model = resolveTelegramNavigation('/flow');
    const hrefs = allHrefs(model);
    const labels = model.groups.flatMap((group) => group.links.map((link) => link.label));

    expect(model.context).toBe('flow');
    expect(hrefs).toEqual([TELEGRAM_NAV_FLOW_HREF, TELEGRAM_NAV_FLOW_ISSUES_HREF]);
    expect(labels).not.toContain('Calm');
    expect(labels).not.toContain('Let It Go');
    expect(labels).not.toContain('Absolution');
    expect(labels).not.toContain('Cast');
    expect(labels).not.toContain('World');
    expect(model.crossSpace?.href).toBe(TELEGRAM_NAV_TEMPLE_HREF);
  });

  it('marks the Flow stream active on nested entries', () => {
    expect(resolveTelegramNavigation('/flow').activeHref).toBe(TELEGRAM_NAV_FLOW_HREF);
    expect(resolveTelegramNavigation('/flow/an-entry').activeHref).toBe(TELEGRAM_NAV_FLOW_HREF);
  });

  it('marks the issues archive active on both interface variants', () => {
    expect(resolveTelegramNavigation('/flow-issues').activeHref).toBe(
      TELEGRAM_NAV_FLOW_ISSUES_HREF
    );
    expect(resolveTelegramNavigation('/flow-issues/issue-1').activeHref).toBe(
      TELEGRAM_NAV_FLOW_ISSUES_HREF
    );
    expect(resolveTelegramNavigation('/en/flow-issues/issue-1').activeHref).toBe(
      TELEGRAM_NAV_FLOW_ISSUES_HREF
    );
  });

  it('marks Temple home active on nested Temple routes', () => {
    expect(resolveTelegramNavigation('/temple').activeHref).toBe(TELEGRAM_NAV_TEMPLE_HREF);
    expect(resolveTelegramNavigation('/temple/whispers').activeHref).toBe(TELEGRAM_NAV_TEMPLE_HREF);
  });

  it('marks World active without confusing it with Temple', () => {
    expect(resolveTelegramNavigation('/heartandangel/world').activeHref).toBe(
      TELEGRAM_NAV_WORLD_HREF
    );
    expect(resolveTelegramNavigation('/heartandangel').activeHref).toBeNull();
  });

  it('marks each ritual active on exact and nested routes', () => {
    for (const ritual of TEMPLE_RITUAL_LINKS) {
      expect(resolveTelegramNavigation(ritual.href).activeHref).toBe(ritual.href);
      expect(resolveTelegramNavigation(`${ritual.href}/a-nested-step`).activeHref).toBe(
        ritual.href
      );
    }
  });

  it('falls back to Temple navigation outside Flow', () => {
    const model = resolveTelegramNavigation('/journal');

    expect(model.context).toBe('temple');
    expect(model.activeHref).toBeNull();
  });

  it('resolves a cold deep-linked Flow publication to the Flow index', () => {
    expect(resolveTelegramSectionHome('/flow/structural-integrity')).toBe('/flow');
    expect(resolveTelegramSectionHome('/flow/structural-integrity/')).toBe('/flow');
    expect(resolveTelegramSectionHome('/flow')).toBeNull();
    expect(resolveTelegramSectionHome('/flow-issues/issue-1')).toBe('/flow-issues');
    expect(resolveTelegramSectionHome('/en/flow-issues/issue-1')).toBe('/en/flow-issues');
    expect(resolveTelegramSectionHome('/flow-issues')).toBeNull();
    expect(resolveTelegramSectionHome('/en/flow-issues')).toBeNull();
    expect(resolveTelegramSectionHome('/temple')).toBeNull();
    expect(resolveTelegramSectionHome('/lobby')).toBeNull();
  });

  it('tracks in-app BackButton history without blank or duplicate entries', () => {
    let stack = ['/lobby'];

    stack = pushTelegramNavigationRoute(stack, '/flow');
    expect(stack).toEqual(['/lobby', '/flow']);

    stack = pushTelegramNavigationRoute(stack, '/flow/structural-integrity');
    expect(stack).toEqual(['/lobby', '/flow', '/flow/structural-integrity']);

    // Browser Back or a nested section return lands on an existing route.
    stack = pushTelegramNavigationRoute(stack, '/flow');
    expect(stack).toEqual(['/lobby', '/flow']);

    // router.replace (for example a start_param or the Flow section home)
    // must not add a duplicate entry.
    stack = replaceTelegramNavigationRoute(stack, '/flow');
    expect(stack).toEqual(['/lobby', '/flow']);

    stack = replaceTelegramNavigationRoute(stack, '/flow/structural-integrity');
    expect(stack).toEqual(['/lobby', '/flow/structural-integrity']);

    stack = replaceTelegramNavigationRoute(stack, '/flow');
    expect(stack).toEqual(['/lobby', '/flow']);

    // A cold launch has exactly one entry, so Back closes the Mini App rather
    // than navigating to an unrelated blank WebView page.
    expect(pushTelegramNavigationRoute(['/flow'], '/flow')).toEqual(['/flow']);
    expect(replaceTelegramNavigationRoute(['/flow'], '/flow')).toEqual(['/flow']);
  });
});

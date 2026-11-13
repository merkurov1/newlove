import {
  isCustomFooterRoute,
  isImmersiveRoute,
  isRitualRoute,
  isTelegramNavigationHidden,
} from '@/lib/temple/routes';

describe('Temple route classification', () => {
  it('treats World as an immersive ritual route', () => {
    expect(isImmersiveRoute('/heartandangel/world')).toBe(true);
    expect(isRitualRoute('/heartandangel/world')).toBe(true);
    expect(isImmersiveRoute('/heartandangel/world/')).toBe(true);
  });

  it('keeps the Heart & Angel hub and postcard as normal chrome routes', () => {
    expect(isImmersiveRoute('/heartandangel')).toBe(false);
    expect(isImmersiveRoute('/heartandangel/card')).toBe(false);
    expect(isImmersiveRoute('/heartandangel/about')).toBe(false);
  });

  it('shows the Telegram navigation on World and Temple, hides it on topbar rituals', () => {
    expect(isTelegramNavigationHidden('/heartandangel/world')).toBe(false);
    expect(isTelegramNavigationHidden('/temple')).toBe(false);
    expect(isTelegramNavigationHidden('/heartandangel/calm')).toBe(true);
    expect(isTelegramNavigationHidden('/heartandangel/letitgo')).toBe(true);
    expect(isTelegramNavigationHidden('/vigil')).toBe(true);
  });

  it('hides the global footer only on pages with their own footer', () => {
    expect(isCustomFooterRoute('/heartandangel')).toBe(true);
    expect(isCustomFooterRoute('/heartandangel/')).toBe(true);
    expect(isCustomFooterRoute('/heartandangel/card')).toBe(true);
    expect(isCustomFooterRoute('/heartandangel/card/success')).toBe(false);
    expect(isCustomFooterRoute('/heartandangel/world')).toBe(false);
    expect(isCustomFooterRoute('/heartandangel/about')).toBe(false);
  });

  it('suppresses the duplicate global footer across the UNFRAMED section', () => {
    expect(isCustomFooterRoute('/unframed')).toBe(true);
    expect(isCustomFooterRoute('/unframed/book')).toBe(true);
    expect(isCustomFooterRoute('/unframed/proposal')).toBe(true);
    expect(isCustomFooterRoute('/unframed/spectral-tiger')).toBe(true);
    expect(isCustomFooterRoute('/unframed/container')).toBe(true);
  });
});

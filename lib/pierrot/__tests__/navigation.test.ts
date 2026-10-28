import {
  PIERROT_SECTIONS,
  createNavigationProposal,
  createNavigationRecord,
  findSectionByPrompt,
  isNavigationConfirmation,
  parseNavigationRecord,
} from '../navigation';
import { PIERROT_COMPOSER_EXPAND_THRESHOLD, shouldExpandPierrotComposer } from '../config';

describe('Pierrot navigation metadata', () => {
  it('keeps the verified routes in one place', () => {
    expect(PIERROT_SECTIONS.art.route).toBe('/heartandangel');
    expect(PIERROT_SECTIONS.lobby.route).toBe('/lobby');
    expect(PIERROT_SECTIONS.art.arrival.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/heartandangel/world' }),
        expect.objectContaining({ href: '/temple' }),
        expect.objectContaining({ href: '/lobby' }),
      ])
    );
  });

  it('recognises only explicit confirmation phrases', () => {
    expect(isNavigationConfirmation('yes')).toBe(true);
    expect(isNavigationConfirmation('Yes!')).toBe(true);
    expect(isNavigationConfirmation('show me')).toBe(true);
    expect(isNavigationConfirmation('да')).toBe(true);
    expect(isNavigationConfirmation('войти')).toBe(true);
    expect(isNavigationConfirmation('yes, but what is the temple?')).toBe(false);
    expect(isNavigationConfirmation('tell me more')).toBe(false);
  });

  it('detects typed section names without hijacking questions', () => {
    expect(findSectionByPrompt('Art')?.id).toBe('art');
    expect(findSectionByPrompt(' lobby. ')?.id).toBe('lobby');
    expect(findSectionByPrompt('What is Art?')).toBeNull();
  });

  it('creates a pending proposal and an executed arrival record', () => {
    const proposal = createNavigationProposal('art', 'nav-1');

    expect(proposal).toMatchObject({
      id: 'nav-1',
      sectionId: 'art',
      route: '/heartandangel',
      pending: true,
      confirmed: false,
      executed: false,
      arrivalDelivered: false,
    });

    const record = createNavigationRecord(proposal);

    expect(record).toMatchObject({
      id: 'nav-1',
      sectionId: 'art',
      route: '/heartandangel',
      pending: false,
      confirmed: true,
      executed: true,
      arrivalDelivered: false,
    });
  });

  it('never trusts a persisted route from session storage', () => {
    const raw = JSON.stringify({
      id: 'nav-2',
      sectionId: 'lobby',
      route: '/admin',
      arrivalDelivered: false,
      createdAt: Date.now(),
    });

    expect(parseNavigationRecord(raw)?.route).toBe('/lobby');
    expect(
      parseNavigationRecord(
        JSON.stringify({
          id: 'nav-3',
          sectionId: 'unknown',
          arrivalDelivered: false,
        })
      )
    ).toBeNull();
  });
});

describe('Pierrot composer threshold', () => {
  it('does not expand at or below the threshold', () => {
    expect(shouldExpandPierrotComposer('a'.repeat(PIERROT_COMPOSER_EXPAND_THRESHOLD))).toBe(false);
  });

  it('expands above the threshold', () => {
    expect(shouldExpandPierrotComposer('a'.repeat(PIERROT_COMPOSER_EXPAND_THRESHOLD + 1))).toBe(
      true
    );
  });
});

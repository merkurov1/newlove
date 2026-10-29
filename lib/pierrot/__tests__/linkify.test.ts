import { linkifyInternalRoutes } from '../linkify';

describe('linkifyInternalRoutes', () => {
  it('turns a label followed by a known route into a markdown link', () => {
    expect(
      linkifyInternalRoutes(
        'Погрузитесь в Арт (/heartandangel), Лобби (/lobby) или Журнал (/journal).'
      )
    ).toBe('Погрузитесь в [Арт](/heartandangel), [Лобби](/lobby) или [Журнал](/journal).');
  });

  it('links a bare known route', () => {
    expect(linkifyInternalRoutes('Откройте /lobby.')).toBe('Откройте [/lobby](/lobby).');
  });

  it('leaves unknown routes, code and existing links untouched', () => {
    expect(linkifyInternalRoutes('Секрет: /admin')).toBe('Секрет: /admin');
    expect(linkifyInternalRoutes('`/lobby`')).toBe('`/lobby`');
    expect(linkifyInternalRoutes('[Lobby](/lobby)')).toBe('[Lobby](/lobby)');
  });

  it('does not link inside fenced code', () => {
    expect(linkifyInternalRoutes('```\n/lobby\n```')).toBe('```\n/lobby\n```');
  });
});

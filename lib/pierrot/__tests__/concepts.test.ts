import { buildPierrotContextPrompt, selectConceptsForContext } from '../concepts';

describe('Pierrot canonical concepts', () => {
  it('selects the concept for the current route', () => {
    const concepts = selectConceptsForContext({
      pathname: '/heritage',
      message: 'What am I looking at?',
    });

    expect(concepts[0]?.id).toBe('heritage');
  });

  it('selects concepts from the message', () => {
    const concepts = selectConceptsForContext({
      pathname: '/',
      message: 'Explain Heart & Angel and the Digital Temple',
      limit: 4,
    });

    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(['heart-and-angel', 'digital-temple'])
    );
  });

  it('falls back to conceptualism instead of returning an empty context', () => {
    expect(selectConceptsForContext({ pathname: '/unknown', message: 'hello' })[0]?.id).toBe(
      'conceptualism'
    );
  });

  it('builds a bounded canonical context for the model', () => {
    const prompt = buildPierrotContextPrompt({
      pathname: '/selection',
      sectionLabel: 'Selection',
      sectionRoute: '/selection',
      message: 'What is the vault?',
    });

    expect(prompt).toContain('Current route: /selection');
    expect(prompt).toContain('Current section: Selection (/selection)');
    expect(prompt).toContain('Selection: The vault');
    expect(prompt).toContain('Do not invent routes');
  });
});

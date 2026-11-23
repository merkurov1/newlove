import robots from '@/app/robots';

describe('robots policy', () => {
  const config = robots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const wildcard = rules[0];

  function disallowList(rule: (typeof rules)[number]): string[] {
    if (!rule || typeof rule === 'string') return [];
    const value = rule.disallow;
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  it('keeps the canonical sitemap advertised', () => {
    expect(config.sitemap).toBe('https://www.merkurov.love/sitemap.xml');
  });

  it('excludes internal debug and demo surfaces from crawling', () => {
    const disallowed = disallowList(wildcard);
    expect(disallowed).toEqual(expect.arrayContaining(['/debug-auth', '/roles-demo']));
    expect(disallowed).toEqual(expect.arrayContaining(['/admin', '/api', '/auth']));
  });

  it('does not block public editorial routes', () => {
    const disallowed = disallowList(wildcard);
    for (const path of ['/journal', '/flow', '/media', '/heritage', '/advising']) {
      expect(disallowed).not.toContain(path);
    }
  });
});

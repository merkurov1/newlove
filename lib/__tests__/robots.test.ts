import robots from '@/app/robots';

function rules() {
  const config = robots();
  return Array.isArray(config.rules) ? config.rules : [config.rules];
}

describe('robots policy', () => {
  it('excludes private application and diagnostic routes', () => {
    const disallowed = rules().flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]
    );

    for (const path of ['/admin', '/api', '/auth', '/draft', '/debug-auth', '/unframed/debug']) {
      expect(disallowed).toContain(path);
    }
  });

  it('does not disallow public editorial routes', () => {
    const disallowed = rules()
      .flatMap((rule) => (Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]))
      .filter(Boolean);

    for (const path of ['/journal', '/flow', '/media', '/heritage', '/advising']) {
      expect(disallowed).not.toContain(path);
    }
  });

  it('advertises the canonical sitemap host', () => {
    expect(robots().sitemap).toBe('https://www.merkurov.love/sitemap.xml');
  });
});

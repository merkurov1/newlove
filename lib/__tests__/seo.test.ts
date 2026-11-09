import { pageMetadata, SITE_URL, absoluteUrl } from '../seo';

describe('page metadata canonical and multilingual rules', () => {
  it('always emits a self-referencing canonical URL', () => {
    const metadata = pageMetadata({
      title: 'Journal',
      description: 'Description',
      path: '/journal',
    });
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/journal`);
    expect(metadata.openGraph?.url).toBe(`${SITE_URL}/journal`);
  });

  it('keeps language alternates absolute', () => {
    const metadata = pageMetadata({
      title: 'Journal',
      description: 'Description',
      path: '/journal',
      languages: {
        'x-default': '/journal',
        en: '/journal',
        ru: '/journal?lang=ru',
      },
    });
    expect(metadata.alternates?.languages).toEqual({
      'x-default': `${SITE_URL}/journal`,
      en: `${SITE_URL}/journal`,
      ru: `${SITE_URL}/journal?lang=ru`,
    });
  });

  it('respects noindex without dropping canonical ownership', () => {
    const metadata = pageMetadata({
      title: 'Missing',
      description: 'Description',
      path: '/journal/missing',
      noindex: true,
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/journal/missing`);
  });

  it('does not double-prefix absolute URLs', () => {
    expect(absoluteUrl('https://example.com/a')).toBe('https://example.com/a');
  });
});

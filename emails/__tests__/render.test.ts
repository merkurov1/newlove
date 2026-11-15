import { renderNewsletterEmail } from '../NewsletterEmail';

/**
 * Newsletter email rendering must keep working on React 19. The template still
 * uses @react-email/components 0.0.x, whose peer range is React 18: this test
 * is the runtime proof that the stack is compatible and guards future
 * dependency changes.
 */
describe('newsletter email rendering', () => {
  it('renders a complete HTML document', () => {
    const html = renderNewsletterEmail(
      {
        title: 'A letter from the studio',
        content: '<p>Hello, <strong>reader</strong>.</p>',
      },
      'https://www.merkurov.love/unsubscribe?token=test'
    );

    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('A letter from the studio');
    expect(html).toContain('<strong>reader</strong>');
    expect(html).toContain('https://www.merkurov.love/unsubscribe?token=test');
  });

  it('renders without an unsubscribe URL', () => {
    const html = renderNewsletterEmail(
      { title: 'No link', content: '<p>Body</p>' },
      ''
    );

    expect(typeof html).toBe('string');
    expect(html).not.toContain('Unsubscribe');
  });
});

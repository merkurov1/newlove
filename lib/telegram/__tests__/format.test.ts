import { toTelegramHtml } from '../format';

describe('toTelegramHtml', () => {
  it('converts GitHub-style bold and italic into Telegram HTML', () => {
    expect(toTelegramHtml('Read **this** and *that*.')).toBe('Read <b>this</b> and <i>that</i>.');
  });

  it('converts safe links and makes internal routes absolute', () => {
    expect(toTelegramHtml('[Lobby](/lobby)')).toBe(
      '<a href="https://www.merkurov.love/lobby">Lobby</a>'
    );
    expect(toTelegramHtml('[Site](https://merkurov.love)')).toBe(
      '<a href="https://merkurov.love">Site</a>'
    );
  });

  it('does not create a link for javascript: or raw HTML', () => {
    const unsafe = toTelegramHtml('[x](javascript:alert(1))');

    expect(unsafe).not.toContain('<a ');
    expect(unsafe).toContain('[x](javascript:alert(1))');
    expect(toTelegramHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('keeps markdown inside code blocks literal', () => {
    expect(toTelegramHtml('```\n**not bold**\n```')).toBe('<pre>**not bold**</pre>');
    expect(toTelegramHtml('`**not bold**`')).toBe('<code>**not bold**</code>');
  });

  it('turns markdown headings into bold lines', () => {
    expect(toTelegramHtml('## STRUCTURAL INTEGRITY')).toBe('<b>STRUCTURAL INTEGRITY</b>');
  });
});

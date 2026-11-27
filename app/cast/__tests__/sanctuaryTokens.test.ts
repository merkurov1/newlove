import fs from 'node:fs';
import path from 'node:path';

/**
 * The owner's blocking rule: /cast must read from the Sanctuary design system,
 * not a parallel palette. These assertions fail if a future edit reintroduces
 * a local Cast colour or drops the shared token composition.
 */
const repoRoot = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Cast Sanctuary tokens', () => {
  const castCss = read('app/cast/cast.module.css');
  const castClient = read('app/cast/CastClient.tsx');
  const templeCss = read('app/temple/temple.module.css');

  it('composes the shared daylight and lamplight Temple scopes', () => {
    expect(castCss).toMatch(
      /\.page\s*\{[^}]*composes:\s*tokens\s+from\s+'\.\.\/temple\/temple\.module\.css'/s
    );
    expect(castCss).toMatch(
      /\.pageModal\s*\{[^}]*composes:\s*tokensDark\s+from\s+'\.\.\/temple\/temple\.module\.css'/s
    );

    expect(templeCss).toContain('.tokens {');
    expect(templeCss).toContain('.tokensDark {');
  });

  it('keeps the Cast CSS free of a local colour palette', () => {
    expect(castCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(castCss).not.toMatch(
      /\b(?:bg|text|border)-(?:amber|stone|slate|gray|red|white|black)(?:-\d{2,3})?\b/
    );
  });

  it('keeps the Cast client free of legacy colours and Tailwind palette classes', () => {
    expect(castClient).not.toMatch(/#FAF8F5|#141210|#FAF8F5/i);
    expect(castClient).not.toMatch(
      /\b(?:bg|text|border|from|via|to)-(?:amber|stone|slate|gray|red|white|black)(?:-\d{2,3})?\b/
    );
    expect(castClient).toContain("data-temple-theme={isModal ? undefined : 'light'}");
  });
});

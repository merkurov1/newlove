/** @jest-environment node */

import { readFileSync } from 'fs';
import path from 'path';

const root = process.cwd();
const workspaceCss = readFileSync(
  path.join(root, 'app/admin/pierrot/(workspace)/workspace.css'),
  'utf8'
);
const artEngineCss = readFileSync(
  path.join(root, 'app/admin/pierrot/(workspace)/art-engine/art-engine.css'),
  'utf8'
);
const globalCss = readFileSync(path.join(root, 'app/main.css'), 'utf8');
const chromeSource = readFileSync(
  path.join(root, 'components/SiteChromeVisibility.tsx'),
  'utf8'
);

describe('Pierrot PWA viewport safety', () => {
  it('uses dynamic viewport height for the workspace shell', () => {
    expect(workspaceCss).toContain('height: 100dvh;');
    expect(workspaceCss).not.toMatch(/\b100vh\b/);
  });

  it('does not force the mobile shell into a hard-coded viewport subtraction', () => {
    expect(workspaceCss).not.toContain('height: calc(100dvh - 62px');
    expect(artEngineCss).not.toContain('calc(100dvh - 62px');
  });

  it('locks the scoped owner body without touching the public site body', () => {
    const start = globalCss.indexOf("body[data-pierrot-workspace='true']");
    const end = globalCss.indexOf('}', start);
    const rule = globalCss.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain('height: 100dvh');
    expect(rule).toContain('overflow: hidden');
    expect(rule).toContain('overscroll-behavior: none');
  });

  it('marks every /admin/pierrot route as the isolated owner workspace', () => {
    expect(chromeSource).toContain("pathname === '/admin/pierrot'");
    expect(chromeSource).toContain("pathname.startsWith('/admin/pierrot/')");
  });
});

/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(
  path.join(process.cwd(), 'app/admin/pierrot/(workspace)/workspace.css'),
  'utf8'
);

function rule(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('execution screen responsive layout contract', () => {
  it('uses a 12-column iPad-first grid and stacks panels below 900px', () => {
    expect(rule('.pw-exec-grid')).toMatch(/grid-template-columns:\s*repeat\(12/);
    expect(rule('.pw-exec-now,\n.pw-exec-landed')).toMatch(/grid-column:\s*span 7/);
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.pw-exec-next,\s*\.pw-exec-release\s*\{\s*grid-column:\s*span 12;/
    );
    expect(css).toMatch(
      /@media \(max-width: 1099px\)[\s\S]*?\.pw-exec-now,\s*\.pw-exec-landed\s*\{\s*grid-column:\s*span 12;/
    );
  });

  it('keeps metrics readable and drawers usable on mobile', () => {
    expect(rule('.pw-exec-metrics')).toMatch(
      /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.pw-exec-metrics\s*\{\s*grid-template-columns:\s*1fr;/
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.pw-exec-drawer\s*\{\s*width:\s*100vw;/
    );
  });

  it('renders landed and released as distinct states, never the same badge', () => {
    const landed = rule('.pw-exec-state.is-landed');
    const released = rule('.pw-exec-state.is-released');
    expect(landed).not.toBe(released);
    expect(landed).toMatch(/#2f5539/);
    expect(released).toMatch(/#274a66/);
  });
});

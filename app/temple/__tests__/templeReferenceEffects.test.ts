import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function flat(css: string) {
  return css.replace(/\s+/g, '');
}

function expectCss(css: string, declaration: string) {
  expect(flat(css)).toContain(flat(declaration));
}

describe('Temple reference effect contract', () => {
  const temple = read('app/temple/temple.module.css');
  const main = read('app/main.css');
  const vigil = read('app/vigil/vigil.module.css');

  it('keeps the exact body ambient gradients fixed behind the Temple', () => {
    expectCss(
      temple,
      'background-image: radial-gradient(40% 50% at 8% 45%, rgba(124, 84, 214, 0.16) 0%, rgba(124, 84, 214, 0) 70%), radial-gradient(40% 50% at 92% 45%, rgba(124, 84, 214, 0.16) 0%, rgba(124, 84, 214, 0) 70%), radial-gradient(30% 22% at 50% 12%, rgba(200, 32, 43, 0.12) 0%, rgba(200, 32, 43, 0) 70%) !important;'
    );
    expectCss(temple, 'background-attachment: fixed !important;');
  });

  it('uses only the specified img filter for the stained-glass glow', () => {
    expectCss(temple, '--lead: #2b2832;');
    expectCss(
      temple,
      'filter: drop-shadow(0 0 1px var(--lead)) drop-shadow(0 26px 50px rgba(110, 70, 210, 0.45));'
    );
    expect(temple).not.toContain('.railGlow');
  });

  it('keeps the home heart round, exact-sized and on the 5s heartbeat', () => {
    expectCss(temple, 'width: min(46%, 230px);');
    expectCss(temple, 'border-radius: 50%;');
    expectCss(temple, 'overflow: hidden;');
    expectCss(
      temple,
      'box-shadow: 0 0 0 1px var(--line), 0 0 90px 10px rgba(200, 32, 43, 0.35);'
    );
    expectCss(
      temple,
      'box-shadow: 0 0 120px 24px rgba(200, 32, 43, 0.5);'
    );
    expectCss(temple, 'animation: temple-heartbeat 5s ease-in-out infinite;');
    expectCss(temple, '@keyframes temple-heartbeat');
    expectCss(temple, '8% { transform: scale(1.035); }');
    expectCss(temple, '16% { transform: scale(1); }');
    expectCss(temple, '24% { transform: scale(1.025); }');
    expectCss(temple, '34% { transform: scale(1); }');
  });

  it('keeps ritual-card hover and focus-visible exactly as referenced', () => {
    expectCss(temple, 'transition: 0.25s;');
    expectCss(temple, 'border-color: var(--c);');
    expectCss(temple, 'box-shadow: 0 14px 34px -14px var(--c);');
    expectCss(temple, 'transform: translateY(-3px);');
  });

  it('uses the exact modal reveal states and transition', () => {
    expectCss(main, 'z-index: 10;');
    expectCss(
      main,
      'background: color-mix(in srgb, var(--c) 20%, var(--bg));'
    );
    expectCss(main, 'clip-path: circle(0 at var(--x) var(--y));');
    expectCss(main, 'clip-path: circle(150% at var(--x) var(--y));');
    expectCss(main, 'visibility: hidden;');
    expectCss(main, 'visibility: visible;');
    expectCss(
      main,
      'transition: clip-path .75s cubic-bezier(.7, 0, .2, 1), visibility 0s .75s;'
    );
    expectCss(main, 'transition-delay: 0s;');
    expectCss(main, '.temple-modal { transition: none; }');
    expectCss(main, '.absolution-modal { transition: none; }');
  });

  it('keeps the modal heart on the 10s breathing cycle', () => {
    expectCss(vigil, 'box-shadow: 0 0 120px 20px var(--c);');
    expectCss(
      vigil,
      'animation: temple-heart-breathing 10s ease-in-out infinite;'
    );
    expectCss(vigil, '@keyframes temple-heart-breathing');
    expectCss(vigil, '0% { transform: scale(0.9); }');
    expectCss(vigil, '40% { transform: scale(1.08); }');
    expectCss(vigil, '100% { transform: scale(0.9); }');
  });
});

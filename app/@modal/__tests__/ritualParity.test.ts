/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const PARITY = [
  {
    ritual: 'Vigil',
    modal: 'app/@modal/(.)vigil/page.tsx',
    standalone: 'app/vigil/page.tsx',
    experience: 'app/vigil/VigilExperience',
  },
  {
    ritual: 'Cast',
    modal: 'app/@modal/(.)cast/page.tsx',
    standalone: 'app/cast/page.tsx',
    experience: 'app/cast/CastClient',
  },
  {
    ritual: 'Tribute',
    modal: 'app/@modal/(.)tribute/page.tsx',
    standalone: 'app/tribute/page.tsx',
    experience: 'app/tribute/TributeExperience',
  },
  {
    ritual: 'Absolution',
    modal: 'app/@modal/(.)absolution/page.tsx',
    standalone: 'app/absolution/page.tsx',
    experience: 'app/absolution/AbsolutionClient',
  },
] as const;

describe('ritual modal and standalone route parity', () => {
  it.each(PARITY)(
    '$ritual uses one shared experience in modal and full page',
    ({ modal, standalone, experience }) => {
      const modalSource = read(modal);
      const pageSource = read(standalone);
      const moduleName = experience.split('/').pop() as string;

      expect(modalSource).toContain(moduleName);
      expect(pageSource).toContain(moduleName);
      expect(modalSource).toContain('RitualModal');
    }
  );

  it('renders immersive scenes in the modal scene slot', () => {
    expect(
      read('app/@modal/(.)heartandangel/calm/page.tsx')
    ).toContain('scene');
    expect(
      read('app/@modal/(.)heartandangel/letitgo/page.tsx')
    ).toContain('scene');
  });

  it('sizes Keep Calm and Let It Go from their scene container', () => {
    const heartPhysics = read('components/HeartPhysics.tsx');
    const letItGo = read('components/LetItGoAngel.tsx');

    expect(heartPhysics).not.toContain('100dvh');
    expect(heartPhysics).not.toContain('100vw');
    expect(heartPhysics).not.toContain('window.innerWidth');
    expect(letItGo).not.toContain('100dvh');
    expect(letItGo).not.toContain('100vw');
    expect(letItGo).toContain('useRitualModalTimer');
  });

  it('keeps an intercepting slot and a default for never-matched modals', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/@modal/default.tsx'))).toBe(
      true
    );
    expect(read('app/@modal/default.tsx')).toContain('return null');
  });
});

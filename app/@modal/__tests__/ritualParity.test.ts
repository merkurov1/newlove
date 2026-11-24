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
    shell: 'RitualModal',
  },
  {
    ritual: 'Cast',
    modal: 'app/@modal/(.)cast/page.tsx',
    standalone: 'app/cast/page.tsx',
    experience: 'app/cast/CastClient',
    shell: 'RitualModal',
  },
  {
    ritual: 'Tribute',
    modal: 'app/@modal/(.)tribute/page.tsx',
    standalone: 'app/tribute/page.tsx',
    experience: 'app/tribute/TributeExperience',
    shell: 'RitualModal',
  },
  {
    ritual: 'Absolution',
    modal: 'app/@modal/(.)absolution/page.tsx',
    standalone: 'app/absolution/page.tsx',
    experience: 'app/absolution/AbsolutionClient',
    shell: 'AbsolutionModal',
  },
] as const;

describe('ritual modal and standalone route parity', () => {
  it.each(PARITY)(
    '$ritual uses one shared experience in modal and full page',
    ({ modal, standalone, experience, shell }) => {
      const modalSource = read(modal);
      const pageSource = read(standalone);
      const moduleName = experience.split('/').pop() as string;

      expect(modalSource).toContain(moduleName);
      expect(pageSource).toContain(moduleName);
      expect(modalSource).toContain(shell);
    }
  );

  it('keeps Cast in the shared RitualModal with a modal-specific experience', () => {
    const modalSource = read('app/@modal/(.)cast/page.tsx');
    const castSource = read('app/cast/CastClient.tsx');

    expect(modalSource).toContain('RitualModal');
    expect(modalSource).toContain('variant="modal"');
    expect(castSource).toContain("variant = 'page'");
    expect(castSource).toContain('cast-page--modal');
    expect(castSource).toContain('!isModal && <TempleTopBar');
    expect(castSource).toContain("'min-h-[100dvh]'");
    expect(castSource).toContain('min-h-full');
  });

  it('keeps Absolution in a dedicated compact modal over the Temple', () => {
    const modalSource = read('app/@modal/(.)absolution/page.tsx');
    const shellSource = read('components/temple/AbsolutionModal.tsx');

    expect(modalSource).toContain('AbsolutionModal');
    expect(modalSource).not.toContain('RitualModal');
    expect(shellSource).toContain('absolution-modal');
    expect(shellSource).toContain('registerTelegramBackHandler');
    expect(shellSource).toContain('window.scrollTo');
    expect(shellSource).toContain('returnFocusRef.current?.focus');
  });

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

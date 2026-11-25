import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const CLIENT_RITUALS = [
  ['Keep Calm', 'components/HeartPhysics.tsx'],
  ['Let It Go', 'components/LetItGoAngel.tsx'],
  ['Vigil', 'app/vigil/useVigilController.ts'],
  ['Absolution', 'app/absolution/AbsolutionClient.tsx'],
  ['Cast', 'app/cast/CastClient.tsx'],
] as const;

describe('ritual identity policy', () => {
  it.each(CLIENT_RITUALS)(
    '%s uses the shared verified Temple identity and never initDataUnsafe',
    (_ritual, file) => {
      const source = read(file);

      expect(source).toContain('useTempleIdentity');
      // Match actual property access, not explanatory comments.
      expect(source).not.toMatch(/\.initDataUnsafe/);
    }
  );

  it('authorizes Vigil sparks with the shared server resolver', () => {
    const route = read('app/api/vigil/claim/route.ts');

    expect(route).toContain('resolveVigilIdentity');
    expect(route).toContain('claimVigilSpark');
  });

  it('resolves Cast identity server-side without making Cast registration-only', () => {
    const route = read('app/api/cast/route.ts');

    expect(route).toContain('resolveTempleIdentity');
    expect(route).toContain('userName: \'Visitor\'');
  });

  it('attributes public traces only from the verified resolver', () => {
    const route = read('app/api/temple_logs/route.ts');

    expect(route).toContain('resolveTempleIdentity');
    expect(route).toContain('identity?.displayName');
  });

  it('keeps Tribute on the guest payment flow without an identity resolver', () => {
    const checkout = read('app/api/tribute/checkout/route.ts');
    const verify = read('app/api/tribute/verify/route.ts');

    expect(checkout).not.toContain('resolveTempleIdentity');
    expect(verify).not.toContain('resolveTempleIdentity');
    expect(checkout).toContain("type: 'tribute_v1'");
  });
});

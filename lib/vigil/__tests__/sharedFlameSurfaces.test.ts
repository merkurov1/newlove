/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('shared Vigil flame surface contract', () => {
  const home = read('app/temple/TempleClient.tsx');
  const controller = read('app/vigil/useVigilController.ts');
  const experience = read('app/vigil/VigilExperience.tsx');
  const publicState = read('lib/vigil/publicState.ts');
  const stateRoute = read('app/api/vigil/state/route.ts');

  it('makes /api/vigil/state the shared authoritative source', () => {
    expect(stateRoute).toContain('getVigilPublicState');
    expect(publicState).toContain('globalFlameExpiresAt');
    expect(publicState).toContain('vigil_spark_claims');

    expect(home).toContain('useVigilSupporters');
    expect(controller).toContain('useVigilSupporters');
  });

  it('uses one shared flame calculation on both surfaces', () => {
    expect(home).toContain("from '@/lib/vigil/flame'");
    expect(home).toContain('resolveVigilFlame');
    expect(controller).toContain("from '@/lib/vigil/flame'");
    expect(controller).toContain('resolveVigilFlame');

    expect(home).toContain('heartVisuals.intensity');
    expect(experience).toContain('flameVisuals.intensity');
  });

  it('never derives brightness from guardian names or their display limit', () => {
    expect(home).not.toContain('vigilHeartVisuals');
    expect(home).not.toContain('guardians.length');
    expect(experience).not.toContain('vigilHeartHeat');
    expect(experience).not.toContain('heat');
    expect(controller).not.toContain('globalFlameRemainingMs');
  });

  it('exposes matching flame state markers for surface tests', () => {
    expect(home).toContain('data-vigil-flame-state');
    expect(home).toContain('data-vigil-intensity');
    expect(experience).toContain('data-vigil-flame-state');
    expect(experience).toContain('data-vigil-intensity');
  });

  it('drives real visual properties, not only data attributes', () => {
    expect(home).toContain('heartVisuals.brightness.toFixed(');
    expect(home).toContain('heartVisuals.saturate.toFixed(');
    expect(home).toContain('heartVisuals.grayscale.toFixed(');
    expect(home).toContain('heartVisuals.glowOpacity');
    expect(home).toContain('heartVisuals.glowBlurPx');
    expect(home).toContain('heartVisuals.scale.toFixed(');

    expect(experience).toContain('flameVisuals.brightness.toFixed(');
    expect(experience).toContain('flameVisuals.saturate.toFixed(');
    expect(experience).toContain('flameVisuals.grayscale.toFixed(');
    expect(experience).toContain('flameVisuals.glowOpacity');
    expect(experience).toContain('flameVisuals.glowBlurPx');
    expect(experience).toContain('flameVisuals.intensity');
  });

  it('feeds the same live supporter count through the one calculation', () => {
    expect(home).toContain('supporterCount: hasVigilState ? supporterCount : 0');
    expect(controller).toContain(
      'supporterCount: flameReady ? supporterCount : 0'
    );

    expect(home).not.toContain('Math.log10');
    expect(controller).not.toContain('Math.log10');
    expect(experience).not.toContain('Math.log10');
  });

  it('shows the lifetime total on both surfaces from the same state payload', () => {
    expect(publicState).toContain('METRICS_VIEW');
    expect(publicState).toContain('buildVigilMetrics');
    expect(home).toContain('lifetimeTotal');
    expect(home).toContain('formatVigilLifetimeLabel');
    expect(controller).toContain('lifetimeTotal');
    expect(experience).toContain('formatVigilLifetimeLabel');
  });

  it('confirms success only after the server response', () => {
    expect(home).toContain('added to the shared heart');
    expect(controller).toContain('added to the shared heart');
    expect(experience).toContain('vigil-success');
  });
});

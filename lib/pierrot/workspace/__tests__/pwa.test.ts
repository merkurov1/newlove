import { readFileSync } from 'fs';
import path from 'path';
import {
  PIERROT_PWA_SCOPE,
  PIERROT_PWA_START_URL,
  buildPierrotManifest,
} from '@/lib/pwa/pierrotManifest';

describe('Pierrot PWA manifest', () => {
  it('is isolated from the public site manifest', () => {
    const manifest = buildPierrotManifest();

    expect(manifest.name).toBe('Pierrot');
    expect(manifest.short_name).toBe('Pierrot');
    expect(manifest.start_url).toBe('/admin/pierrot');
    expect(manifest.scope).toBe('/admin/pierrot');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#F8F6F1');
    expect(manifest.background_color).toBe('#F8F6F1');
    expect(manifest.orientation).toBe('any');
    expect(PIERROT_PWA_SCOPE).toBe('/admin/pierrot');
    expect(PIERROT_PWA_START_URL).toBe('/admin/pierrot');
  });

  it('declares 192, 512 and maskable icons', () => {
    const manifest = buildPierrotManifest();
    const iconSizes = manifest.icons.map((icon) => icon.sizes);

    expect(iconSizes).toContain('192x192');
    expect(iconSizes).toContain('512x512');
    expect(
      manifest.icons.some(
        (icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'
      )
    ).toBe(true);
  });
});

describe('Pierrot service worker privacy boundary', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'public', 'pierrot-sw.js'),
    'utf8'
  );

  it('never caches API responses', () => {
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).toContain('if (isPrivateApi(url)) return;');
    expect(source).not.toMatch(/cache\.put\([^)]*\/api/);
    expect(source).not.toContain("'/api/pierrot-web'");
  });

  it('caches only the public offline shell and static assets', () => {
    expect(source).toContain("'/pierrot-offline.html'");
    expect(source).toContain("'/_next/static/'");
    expect(source).toContain("'/admin/pierrot-icon/'");
  });

  it('handles logout cache clearing', () => {
    expect(source).toContain('PIERROT_CLEAR_CACHES');
  });
});

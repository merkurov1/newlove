/** @jest-environment node */

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

  it('declares the generated Pierrot avatar icons', () => {
    const manifest = buildPierrotManifest();
    const iconSizes = manifest.icons.map((icon) => icon.sizes);

    expect(iconSizes).toContain('192x192');
    expect(iconSizes).toContain('512x512');
    expect(manifest.icons.map((icon) => icon.src)).toEqual(
      expect.arrayContaining([
        '/pierrot/icons/icon-192.png',
        '/pierrot/icons/icon-512.png',
      ])
    );
    expect(
      manifest.icons.some(
        (icon) =>
          icon.purpose === 'maskable' &&
          icon.sizes === '512x512' &&
          icon.src === '/pierrot/icons/icon-512.png'
      )
    ).toBe(true);
  });

  it('points Next metadata and Apple Touch Icon at the avatar PNGs', () => {
    const layout = readFileSync(
      path.join(process.cwd(), 'app/admin/pierrot/(workspace)/layout.tsx'),
      'utf8'
    );

    expect(layout).toContain('/pierrot/icons/icon-192.png');
    expect(layout).toContain('/pierrot/icons/icon-512.png');
    expect(layout).toContain('/pierrot/icons/apple-touch-icon.png');
    expect(layout).toContain('/pierrot/icons/favicon-32.png');
    expect(layout).not.toContain('/admin/pierrot-icon/192');
  });

  it('serves the manifest with the avatar icon URLs', async () => {
    const { GET } = await import('@/app/admin/pierrot/manifest.webmanifest/route');
    const response = GET();
    const manifest = (await response.json()) as ReturnType<typeof buildPierrotManifest>;

    expect(response.headers.get('content-type')).toContain('application/manifest+json');
    expect(manifest.icons.map((icon) => icon.src)).toEqual(
      expect.arrayContaining([
        '/pierrot/icons/icon-192.png',
        '/pierrot/icons/icon-512.png',
      ])
    );
  });

  it('keeps old icon URLs working through a redirect to the avatar PNGs', async () => {
    const { GET } = await import('@/app/admin/pierrot-icon/[size]/route');
    const response = await GET(
      new Request('https://example.test/admin/pierrot-icon/192'),
      { params: Promise.resolve({ size: '192' }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://example.test/pierrot/icons/icon-192.png'
    );

    const missing = await GET(
      new Request('https://example.test/admin/pierrot-icon/999'),
      { params: Promise.resolve({ size: '999' }) }
    );
    expect(missing.status).toBe(404);
  });

  it('ships every icon size referenced by the manifest and metadata', () => {
    const files: Array<[string, number]> = [
      ['public/pierrot/icons/favicon-16.png', 16],
      ['public/pierrot/icons/favicon-32.png', 32],
      ['public/pierrot/icons/apple-touch-icon.png', 180],
      ['public/pierrot/icons/icon-192.png', 192],
      ['public/pierrot/icons/icon-512.png', 512],
    ];

    for (const [file, size] of files) {
      const bytes = readFileSync(path.join(process.cwd(), file));
      expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
    }
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
    expect(source).toContain("'/pierrot/icons/icon-192.png'");
    expect(source).toContain("'/pierrot/icons/icon-512.png'");
    expect(source).toContain("'/pierrot/pierrot-avatar-512.jpg'");
  });

  it('handles logout cache clearing', () => {
    expect(source).toContain('PIERROT_CLEAR_CACHES');
  });
});

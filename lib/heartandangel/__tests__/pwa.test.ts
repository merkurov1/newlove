/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { GET as getHeartAndAngelManifest } from '@/app/heartandangel/manifest.webmanifest/route';
import { GET as getSiteManifest } from '@/app/manifest.webmanifest/route';

const root = process.cwd();
const publicRoot = path.join(root, 'public');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

async function readManifest(get: () => Response) {
  return (await get().json()) as {
    id?: string;
    name: string;
    start_url: string;
    scope?: string;
    display?: string;
    background_color?: string;
    theme_color?: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
}

describe('Heart & Angel PWA', () => {
  it('publishes a route-scoped manifest with real icons', async () => {
    const manifest = await readManifest(getHeartAndAngelManifest);

    expect(manifest.id).toBe('/heartandangel');
    expect(manifest.name).toBe('Heart & Angel');
    expect(manifest.start_url).toBe('/heartandangel');
    expect(manifest.scope).toBe('/heartandangel');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(publicRoot, icon.src))).toBe(true);
    }

    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(
      true
    );
  });

  it('keeps the site-wide manifest available and independent', async () => {
    const manifest = await readManifest(getSiteManifest);

    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBeUndefined();
    expect(manifest.name).toContain('Anton Merkurov');
  });

  it('serves the manifest with the right content type and explicit scope link', async () => {
    const response = getHeartAndAngelManifest();

    expect(response.headers.get('content-type')).toBe(
      'application/manifest+json; charset=utf-8'
    );
    expect(response.headers.get('cache-control')).toContain('max-age=3600');

    const layout = read('app/heartandangel/layout.tsx');
    expect(layout).toContain("manifest: '/heartandangel/manifest.webmanifest'");
  });

  it('provides the Apple touch icon and startup images referenced by the layout', () => {
    const layout = read('app/heartandangel/layout.tsx');

    expect(layout).toContain('/heartandangel/icons/apple-touch-icon.png');
    expect(layout).toContain('startupImage');

    const splashDir = path.join(publicRoot, 'heartandangel', 'splash');
    const splashFiles = fs
      .readdirSync(splashDir)
      .filter((file) => file.endsWith('.png'));

    expect(splashFiles.length).toBeGreaterThanOrEqual(8);

    for (const file of splashFiles) {
      expect(layout).toContain(`/heartandangel/splash/${file}`);
      expect(fs.statSync(path.join(splashDir, file)).size).toBeGreaterThan(
        10_000
      );
    }
  });

  it('keeps the service worker inside the Heart & Angel scope and out of APIs', () => {
    const sw = read('public/heartandangel-sw.js');

    expect(sw).toContain("const CACHE_PREFIX = 'heartandangel-'");
    expect(sw).toContain('key.startsWith(CACHE_PREFIX)');
    expect(sw).toContain("pathname.startsWith('/api/')");
    expect(sw).toContain('return;');
    expect(sw).toContain("cache: 'no-store'");
    expect(sw).toContain('isAllowedOptimizedImage');
    expect(sw).toContain('ensureCoreAssets');
    expect(sw).not.toContain('pierrot-owner-v1');
    expect(sw).not.toContain("caches.delete('pierrot");
  });

  it('provides a self-contained offline page with the Heart & Angel identity', () => {
    const offline = read('public/heartandangel/offline.html');

    expect(offline).toContain('Heart &amp; Angel');
    expect(offline).toContain('/heartandangel/icons/icon-192.png');
    expect(offline).toContain('Rituals and payments need a connection');
    expect(offline).toContain('name="theme-color"');
  });

  it('registers only in production, outside Telegram, with the HA scope', () => {
    const registration = read('components/heartandangel/HeartAndAngelPwa.tsx');

    expect(registration).toContain("process.env.NODE_ENV !== 'production'");
    expect(registration).toContain('isTelegramMiniApp');
    expect(registration).toContain('isLikelyTelegramWebView');
    expect(registration).toContain("scope: '/heartandangel'");
    expect(registration).toContain("'/heartandangel-sw.js'");
    expect(registration).toContain("updateViaCache: 'none'");
  });
});

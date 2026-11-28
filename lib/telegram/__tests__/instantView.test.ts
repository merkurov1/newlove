/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  buildTelegramInstantViewUrl,
  normalizeFlowInstantViewPageUrl,
  telegramInstantViewTemplateHash,
} from '../instantView';

const CANONICAL = 'https://www.merkurov.love/flow/test-slug';
// Fixture only. The production hash is server configuration and is never
// committed to the repository.
const HASH = '22e613409c3e034789';

describe('Telegram Instant View hash validation', () => {
  it('accepts a real hexadecimal hash from the server environment', () => {
    expect(telegramInstantViewTemplateHash({ TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH })).toBe(
      HASH
    );
  });

  it('accepts the legacy environment alias', () => {
    expect(telegramInstantViewTemplateHash({ TELEGRAM_INSTANT_VIEW_HASH: HASH })).toBe(HASH);
  });

  it('trims surrounding whitespace from configuration', () => {
    expect(
      telegramInstantViewTemplateHash({
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: `  ${HASH}  `,
      })
    ).toBe(HASH);
  });

  it('accepts the editor hash shape (14 lowercase hex characters)', () => {
    const editorHash = 'a1b2c3d4e5f607';
    expect(telegramInstantViewTemplateHash({ TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: editorHash })).toBe(
      editorHash
    );
  });

  it.each([
    undefined,
    '',
    '   ',
    'not-a-hash',
    'template-hash',
    '<real editor hash>',
    '1234567',
    `${HASH}?url=https://evil.example`,
    `${HASH}\nhttps://evil.example`,
    'a1b2c3d4e5f60g',
    'a'.repeat(65),
  ])('never invents a hash for %p', (value) => {
    expect(
      telegramInstantViewTemplateHash({
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: value as string | undefined,
      })
    ).toBeNull();
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: value as string | undefined,
      })
    ).toBeNull();
  });
});

describe('Telegram Instant View URL allowlist', () => {
  it('builds the supported t.me/iv wrapper only with a verified hash', () => {
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toBe(`https://t.me/iv?url=${encodeURIComponent(CANONICAL)}&rhash=${HASH}`);
  });

  it('uses the legacy alias when building the wrapper', () => {
    expect(
      buildTelegramInstantViewUrl(CANONICAL, {
        TELEGRAM_INSTANT_VIEW_HASH: HASH,
      })
    ).toBe(`https://t.me/iv?url=${encodeURIComponent(CANONICAL)}&rhash=${HASH}`);
  });

  it('normalizes a non-www canonical URL to the www origin', () => {
    expect(normalizeFlowInstantViewPageUrl('https://merkurov.love/flow/test-slug')).toBe(CANONICAL);
    expect(
      buildTelegramInstantViewUrl('https://merkurov.love/flow/test-slug', {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toBe(`https://t.me/iv?url=${encodeURIComponent(CANONICAL)}&rhash=${HASH}`);
  });

  it('removes a trailing slash from the canonical page', () => {
    expect(normalizeFlowInstantViewPageUrl(`${CANONICAL}/`)).toBe(CANONICAL);
  });

  it('preserves and re-encodes unicode slugs exactly once', () => {
    const unicode = 'https://www.merkurov.love/flow/%D1%84%D0%BE%D1%82%D0%BE-o43hd';
    const built = buildTelegramInstantViewUrl(unicode, {
      TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
    });

    expect(normalizeFlowInstantViewPageUrl(unicode)).toBe(unicode);
    expect(built).toBe(`https://t.me/iv?url=${encodeURIComponent(unicode)}&rhash=${HASH}`);

    const wrapper = new URL(built!);
    expect(wrapper.searchParams.get('url')).toBe(unicode);
    expect(wrapper.searchParams.get('rhash')).toBe(HASH);
  });

  it('encodes the canonical URL and hash as query parameters, not raw text', () => {
    const built = buildTelegramInstantViewUrl(CANONICAL, {
      TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
    })!;

    expect(built).toContain(`url=${encodeURIComponent(CANONICAL)}`);
    expect(built).toContain(`rhash=${encodeURIComponent(HASH)}`);
    expect(built).not.toContain('url=https://www.merkurov.love');
    expect(built).not.toContain('&url=https');
  });

  it.each([
    'https://www.merkurov.love/flow',
    'https://www.merkurov.love/flow/',
    'https://www.merkurov.love/flow/rss',
    'https://www.merkurov.love/flow/rss.xml',
    'https://www.merkurov.love/flow/feed.json',
    'https://www.merkurov.love/flow/i',
    'https://www.merkurov.love/flow/join',
    'https://www.merkurov.love/flow/test-slug/extra',
    'https://www.merkurov.love/journal/test-slug',
    'https://www.merkurov.love/admin/flow/test-slug',
    'https://www.merkurov.love/flow/test-slug?utm_source=tg',
    'https://www.merkurov.love/flow/test-slug#fragment',
    'https://www.merkurov.love/flow/test-slug?next=https://evil.example',
    'https://evil.example/flow/test-slug',
    'https://merkurov.love.evil.example/flow/test-slug',
    'https://www.merkurov.love.evil.example/flow/test-slug',
    'https://evil-merkurov.love/flow/test-slug',
    'https://www.merkurov.love./flow/test-slug',
    'https://user@www.merkurov.love/flow/test-slug',
    'https://user:pass@www.merkurov.love/flow/test-slug',
    'https://www.merkurov.love:8443/flow/test-slug',
    'http://www.merkurov.love/flow/test-slug',
    'ftp://www.merkurov.love/flow/test-slug',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '//evil.example/flow/test-slug',
    'not a url',
    '',
    '   ',
    'https://www.merkurov.love/flow/%2e%2e/admin',
    'https://www.merkurov.love/flow/%2E%2E%2Fadmin',
    'https://www.merkurov.love/flow/test%2Fslug',
    'https://www.merkurov.love/flow/test%5Cslug',
    'https://www.merkurov.love/flow/%00test',
    'https://www.merkurov.love/flow/%E0%A4%A',
  ])('rejects non-public or non-canonical page URL %p', (url) => {
    expect(normalizeFlowInstantViewPageUrl(url)).toBeNull();
    expect(
      buildTelegramInstantViewUrl(url, {
        TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH: HASH,
      })
    ).toBeNull();
  });

  it('keeps the real production post shape accepted', () => {
    const production = 'https://www.merkurov.love/flow/deepseek-merkurov-x-pierrot-bv2zi';
    expect(normalizeFlowInstantViewPageUrl(production)).toBe(production);
  });
});

describe('Telegram Instant View server-only boundary', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  function walk(directory: string, files: string[] = []): string[] {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
      const full = path.join(directory, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full, files);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry)) files.push(full);
    }
    return files;
  }

  const sourceFiles = ['app', 'components', 'lib'].flatMap((directory) =>
    walk(path.join(repoRoot, directory))
  );

  it('is never imported by a client component', () => {
    const clientImports = sourceFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      const isClient = /^\s*(?:'use client'|"use client")/m.test(source);
      const importsServerPublisher =
        /from\s+['"][^'"]*telegram\/instantView['"]/.test(source) ||
        /from\s+['"][^'"]*flow\/telegram['"]/.test(source) ||
        /from\s+['"][^'"]*flow\/crosspost['"]/.test(source);
      return isClient && importsServerPublisher;
    });

    expect(clientImports).toEqual([]);
  });

  it('never reads a NEXT_PUBLIC_ environment variable', () => {
    const source = readFileSync(path.resolve(__dirname, '../instantView.ts'), 'utf8');
    expect(source).not.toContain('NEXT_PUBLIC_');
    expect(source).not.toMatch(/console\./);
  });

  it('is wired into the server-side Telegram publisher', () => {
    const publisher = readFileSync(path.join(repoRoot, 'lib/flow/telegram.ts'), 'utf8');
    expect(publisher).toContain("from '@/lib/telegram/instantView'");
    expect(publisher).toMatch(/buildTelegramInstantViewUrl\(content\.canonicalUrl\)/);
  });
});

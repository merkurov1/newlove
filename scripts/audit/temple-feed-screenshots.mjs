#!/usr/bin/env node
/**
 * Captures the Temple Traces and Chronicles panels with a deterministic feed.
 *
 * Usage:
 *   node scripts/audit/temple-feed-screenshots.mjs
 *
 * The app must already be running at PIERROT_TEST_BASE_URL (default
 * http://localhost:3000). The script uses the system Chromium if Playwright's
 * bundled browser is not installed. `temple_log` is intercepted, so this never
 * touches a real database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const baseUrl = process.env.PIERROT_TEST_BASE_URL || 'http://localhost:3000';
const outDir = path.resolve(__dirname, '../../artifacts/temple-feed');
const now = Date.parse('2026-11-24T12:00:00.000Z');

function trace(index, type, label) {
  return {
    id: `trace-${index}`,
    event_type: type.toLowerCase(),
    canonical_type: type,
    category: 'ritual',
    author: index === 0 ? 'Alice' : index === 1 ? 'Pilgrim' : 'Mira',
    message: label,
    created_at: new Date(now - index * 7 * 60_000).toISOString(),
    audio_url: null,
  };
}

const payload = {
  ok: true,
  data: [
    trace(0, 'ASH', 'Released a burden into the sky'),
    trace(1, 'VIGIL_SPARK', 'Transmitted a spark'),
    trace(2, 'CAST', 'Perceptual archetype manifested: WANDERER'),
    trace(3, 'ABSOLUTION', 'Confessed: a quiet thing'),
    trace(4, 'TRIBUTE', 'Offered light to the Temple'),
    trace(5, 'MEDITATION', 'Held the heart in motion'),
    trace(6, 'WHISPER', 'A whisper left at the threshold'),
  ],
  stats: {
    completedRituals: 42,
    namedAuthors: 3,
    vigilSparks: 9,
    byType: {
      ASH: 7,
      VIGIL_SPARK: 9,
      CAST: 6,
      ABSOLUTION: 5,
      TRIBUTE: 4,
      MEDITATION: 6,
      WHISPER: 5,
    },
    windowDays: 30,
    windowStart: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date(now).toISOString(),
    excluded: { infrastructure: 11, incomplete: 4 },
    truncated: false,
  },
  meta: {
    generatedAt: new Date(now).toISOString(),
    cachedAt: new Date(now).toISOString(),
    ttlSeconds: 60,
    traceLimit: 7,
    windowDays: 30,
    stale: false,
    cache: 'miss',
    truncated: false,
    definitions: {},
  },
  error: null,
};

const vigilState = {
  supporterCount: 12,
  lastLitAt: new Date(now).toISOString(),
  flameLit: true,
  windowStartedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(now).toISOString(),
};

const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'iphone', viewport: { width: 390, height: 844 }, isMobile: true },
  { name: 'ipad', viewport: { width: 768, height: 1024 }, isMobile: true },
  {
    name: 'telegram',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    telegram: true,
  },
];

async function capture(browser, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    isMobile: Boolean(config.isMobile),
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  if (config.telegram) {
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: {
          initData: '',
          initDataUnsafe: {
            user: { id: 1, username: 'pilgrim', first_name: 'Pilgrim' },
          },
          ready() {},
          expand() {},
          close() {},
        },
      };
    });
  }

  await page.route('**/api/temple_logs', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  );
  await page.route('**/api/vigil/state', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vigilState),
    })
  );

  await page.goto(`${baseUrl}/temple`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Traces' }).click();
  await page.getByRole('dialog', { name: 'Sanctuary Traces' }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(outDir, `traces-${config.name}.png`),
    fullPage: false,
  });
  await page
    .getByRole('button', { name: 'Close Sanctuary Traces' })
    .click();

  await page.getByRole('button', { name: 'Chronicles' }).click();
  await page.getByRole('dialog', { name: 'Chronicles' }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(outDir, `chronicles-${config.name}.png`),
    fullPage: false,
  });

  await context.close();
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    for (const config of viewports) {
      await capture(browser, config);
      process.stdout.write(`captured ${config.name}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

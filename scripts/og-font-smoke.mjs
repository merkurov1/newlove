#!/usr/bin/env node
/**
 * Renders the OG card font with the same Satori/opentype stack used by next/og.
 * Run with: node scripts/og-font-smoke.mjs
 *
 * This catches font table regressions (for example the GSUB lookupType 5
 * parser failure) without starting Next.js.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { ImageResponse } from 'next/og.js';

const FONT_PATH = join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SIZE = { width: 1200, height: 630 };

function card(title, subtitle) {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 22,
        backgroundColor: '#FAF8F5',
        color: '#141210',
        padding: '64px 72px',
        fontFamily: "'Noto Sans', sans-serif",
      },
    },
    React.createElement('div', { style: { fontSize: 72, lineHeight: 1.05 } }, title),
    React.createElement('div', { style: { fontSize: 30, color: '#666666' } }, subtitle)
  );
}

async function render(label, { title, subtitle, font }) {
  const fonts = font ? [font] : undefined;
  const image = new ImageResponse(card(title, subtitle), {
    ...SIZE,
    ...(fonts ? { fonts } : {}),
  });
  const bytes = new Uint8Array(await image.arrayBuffer());
  const signature = Array.from(bytes.subarray(0, PNG_SIGNATURE.length));

  if (signature.join(',') !== PNG_SIGNATURE.join(',')) {
    throw new Error(`${label}: response is not a PNG`);
  }

  console.log(`ok ${label}: ${bytes.byteLength} bytes`);
}

const data = await readFile(FONT_PATH);
const font = {
  name: 'Noto Sans',
  data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  weight: 400,
  style: 'normal',
};

await render('cyrillic+latin title', {
  title: 'Искусство, наследие и деньги — Art, heritage & advising',
  subtitle: 'Кириллица и Latin в одной карточке',
  font,
});

await render('long cyrillic title', {
  title: 'Длинный заголовок о искусстве, наследии и деньгах '.repeat(4),
  subtitle: 'Подзаголовок с кириллицей и Latin',
  font,
});

await render('built-in font fallback', {
  title: 'Кириллица и Latin без font asset',
  subtitle: 'Fallback',
});

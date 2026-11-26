/** @jest-environment node */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const mockState = {
  failWithCustomFont: false,
  png: Uint8Array.from([...PNG_SIGNATURE, 0, 0, 0, 0]),
};

jest.mock('next/og', () => {
  class ImageResponse extends Response {
    constructor(_element: unknown, options?: { fonts?: unknown[] }) {
      if (options?.fonts?.length && mockState.failWithCustomFont) {
        throw new Error('GSUB lookupType 5 / substFormat 3 is not supported');
      }

      super(mockState.png, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
  }

  return { ImageResponse };
});

const FONT_PATH = join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
const originalFetch = globalThis.fetch;
const fetchMock = jest.fn();

async function loadGet() {
  jest.resetModules();
  const { GET } = await import('../route');
  return GET;
}

function requestFor(title: string, subtitle: string) {
  const url = new URL('http://localhost/og');
  url.searchParams.set('title', title);
  url.searchParams.set('subtitle', subtitle);
  return new Request(url);
}

async function expectPng(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('image/png');

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.subarray(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);
  return bytes;
}

beforeEach(() => {
  mockState.failWithCustomFont = false;
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

it('renders a Cyrillic and Latin title with the bundled font', async () => {
  const font = await readFile(FONT_PATH);
  fetchMock.mockResolvedValue(new Response(new Uint8Array(font), { status: 200 }));

  const GET = await loadGet();
  const response = await GET(
    requestFor(
      'Искусство, наследие и деньги — Art, heritage & advising',
      'Кириллица и Latin в одной карточке'
    )
  );

  await expectPng(response);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain('/fonts/NotoSans-Regular.ttf');
});

it('renders a long Cyrillic title without failing', async () => {
  const font = await readFile(FONT_PATH);
  fetchMock.mockResolvedValue(new Response(new Uint8Array(font), { status: 200 }));

  const GET = await loadGet();
  const longTitle = 'Длинный заголовок о искусстве, наследии и деньгах '.repeat(4);
  const response = await GET(requestFor(longTitle, 'Подзаголовок с кириллицей и Latin'));

  await expectPng(response);
});

it('falls back to the built-in font when the asset is missing', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

  const GET = await loadGet();
  const response = await GET(requestFor('Кириллица и Latin без font asset', 'Fallback'));

  await expectPng(response);
});

it('falls back when the asset is not a valid font', async () => {
  fetchMock.mockResolvedValue(
    new Response('<!doctype html><html>not a font</html>', { status: 200 })
  );

  const GET = await loadGet();
  const response = await GET(requestFor('Corrupt font asset', 'Fallback'));

  await expectPng(response);
});

it('retries without the custom font if the OpenType parser rejects it', async () => {
  const font = await readFile(FONT_PATH);
  fetchMock.mockResolvedValue(new Response(new Uint8Array(font), { status: 200 }));
  mockState.failWithCustomFont = true;

  const GET = await loadGet();
  const response = await GET(requestFor('Кириллица и Latin при ошибке парсера', 'Fallback'));

  await expectPng(response);
});

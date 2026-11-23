import { test, expect, type Page } from '@playwright/test';

/**
 * Real-browser regression suite for the structured presentation renderer and
 * the streaming transcript.
 *
 * The chart renderer is exercised by the component tests through a mocked
 * dynamic import. This suite instead runs the actual Recharts SVG and the
 * diagram SVG in Chromium, at desktop, iPad and mobile widths. The streaming
 * cases mock only the transport (fetch/route), never the renderer, and use
 * anonymised fixtures. No production chat is written.
 */

const STORAGE_KEY = 'pierrot_chat_history_v2';

const STRUCTURED_VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'ipad-portrait', width: 820, height: 1180 },
  { label: 'ipad-landscape', width: 1180, height: 820 },
  { label: 'mobile', width: 390, height: 844 },
] as const;

const STREAM_VIEWPORTS = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'ipad-portrait', width: 820, height: 1180 },
] as const;

type ShellSnapshot = {
  modal: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  footer: { top: number; bottom: number; height: number };
  messages: { clientHeight: number; scrollHeight: number };
  scrollY: number;
  pageOverflow: number;
};

type TranscriptSnapshot = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  pageOverflow: number;
};

async function openPierrot(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Pierrot', exact: true }).click();
  await expect(page.locator('[data-pierrot-modal]')).toBeVisible();
  await expect(page.locator('[data-pierrot-modal] > section')).toHaveCSS('opacity', '1');
}

async function readShell(page: Page): Promise<ShellSnapshot> {
  return page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>('[data-pierrot-modal]');
    const footer = document.querySelector<HTMLElement>('[data-pierrot-footer]');
    const messages = document.querySelector<HTMLElement>('[data-pierrot-messages]');
    if (!modal || !footer || !messages) throw new Error('missing Pierrot shell');

    const modalRect = modal.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();

    return {
      modal: {
        left: modalRect.left,
        top: modalRect.top,
        right: modalRect.right,
        bottom: modalRect.bottom,
        width: modalRect.width,
        height: modalRect.height,
      },
      footer: {
        top: footerRect.top,
        bottom: footerRect.bottom,
        height: footerRect.height,
      },
      messages: {
        clientHeight: messages.clientHeight,
        scrollHeight: messages.scrollHeight,
      },
      scrollY: window.scrollY,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function expectStableShell(before: ShellSnapshot, after: ShellSnapshot, label: string) {
  for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height'] as const) {
    expect(
      Math.abs(after.modal[key] - before.modal[key]),
      `${label}: modal ${key} must not jump`
    ).toBeLessThanOrEqual(1);
  }

  expect(
    Math.abs(after.footer.top - before.footer.top),
    `${label}: footer top`
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(after.footer.bottom - before.footer.bottom),
    `${label}: footer bottom`
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(after.footer.height - before.footer.height),
    `${label}: footer height`
  ).toBeLessThanOrEqual(1);
  expect(after.scrollY, `${label}: background document must not scroll`).toBe(0);
  expect(after.pageOverflow, `${label}: page must not overflow horizontally`).toBeLessThanOrEqual(
    1
  );
}

function historyFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-history-${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content:
      index % 9 === 0
        ? `Сообщение ${index + 1}. Обезличенная запись истории для проверки привязки прокрутки в реальном браузере.`
        : `Сообщение ${index + 1}. Короткая обезличенная запись истории.`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 10, 0, index)).toISOString(),
    author: index % 2 === 0 ? 'visitor' : 'pierrot',
    meta: { kind: 'chat' },
  }));
}

async function preloadTranscript(page: Page, messages: unknown[]) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: messages }
  );
}

async function readTranscript(page: Page): Promise<TranscriptSnapshot> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-pierrot-messages]');
    if (!element) throw new Error('missing transcript');
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function streamBody(input: { reply: string; chunks?: number }) {
  const chunks = input.chunks ?? 24;
  const piece = Math.max(1, Math.ceil(input.reply.length / chunks));
  const deltas = Array.from({ length: chunks }, (_, index) =>
    input.reply.slice(index * piece, (index + 1) * piece)
  ).filter(Boolean);

  const events: Array<Record<string, unknown>> = [
    {
      type: 'accepted',
      version: 1,
      conversationId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      userMessageId: '55555555-5555-4555-8555-555555555555',
      assistantMessageId: '66666666-6666-4666-8666-666666666666',
    },
    { type: 'status', version: 1, stage: 'generating' },
    ...deltas.map((text) => ({ type: 'delta', version: 1, text })),
    {
      type: 'completed',
      version: 1,
      payload: {
        reply: input.reply,
        conversationId: '33333333-3333-4333-8333-333333333333',
        sessionId: '44444444-4444-4444-8444-444444444444',
        assistantMessageId: '66666666-6666-4666-8666-666666666666',
        recorded: true,
      },
    },
  ];

  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

/**
 * Installs a deterministic transport double around `window.fetch`. It only
 * intercepts `/api/pierrot-web` in "stream"/"interrupt" mode; every other
 * request and the "off" mode go through the real browser fetch, so Playwright
 * routes can still fulfil the reconnect turn.
 */
async function installStreamHarness(page: Page) {
  await page.addInitScript(() => {
    type HarnessMode = 'off' | 'stream' | 'interrupt';

    const state = {
      mode: 'off' as HarnessMode,
      reply: '',
      chunks: 20,
      chunkDelayMs: 40,
      response: null as Record<string, unknown> | null,
    };

    const scope = window as unknown as {
      __pierrotStreamHarness: typeof state;
      __pierrotSetStreamHarness: (patch: Partial<typeof state>) => void;
    };

    scope.__pierrotStreamHarness = state;
    scope.__pierrotSetStreamHarness = (patch) => Object.assign(state, patch);

    const originalFetch = window.fetch.bind(window);
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const frame = (event: Record<string, unknown>) =>
      `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (!url.includes('/api/pierrot-web') || state.mode === 'off') {
        return originalFetch(input, init);
      }

      const encoder = new TextEncoder();
      const reply = state.reply;
      const chunkCount = Math.max(1, state.chunks);
      const size = Math.max(1, Math.ceil(reply.length / chunkCount));
      const deltas: string[] = [];
      for (let index = 0; index < reply.length; index += size) {
        deltas.push(reply.slice(index, index + size));
      }

      const interruptionAt =
        state.mode === 'interrupt' ? Math.min(3, Math.max(1, deltas.length - 1)) : -1;

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (event: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(frame(event)));
          };

          emit({
            type: 'accepted',
            version: 1,
            conversationId: '33333333-3333-4333-8333-333333333333',
            sessionId: '44444444-4444-4444-8444-444444444444',
            userMessageId: '55555555-5555-4555-8555-555555555555',
            assistantMessageId: '66666666-6666-4666-8666-666666666666',
          });
          emit({ type: 'status', version: 1, stage: 'generating' });

          try {
            for (let index = 0; index < deltas.length; index += 1) {
              if (index === interruptionAt) {
                await sleep(state.chunkDelayMs);
                controller.error(new TypeError('network connection lost'));
                return;
              }

              emit({ type: 'delta', version: 1, text: deltas[index] });
              await sleep(state.chunkDelayMs);
            }

            if (interruptionAt >= 0) {
              controller.error(new TypeError('network connection lost'));
              return;
            }

            emit({
              type: 'completed',
              version: 1,
              payload: {
                reply,
                conversationId: '33333333-3333-4333-8333-333333333333',
                sessionId: '44444444-4444-4444-8444-444444444444',
                assistantMessageId: '66666666-6666-4666-8666-666666666666',
                recorded: true,
                ...(state.response ? { response: state.response } : {}),
              },
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    };
  });
}

async function setStreamHarness(
  page: Page,
  patch: {
    mode?: 'off' | 'stream' | 'interrupt';
    reply?: string;
    chunks?: number;
    chunkDelayMs?: number;
    response?: Record<string, unknown> | null;
  }
) {
  await page.evaluate((value) => {
    const scope = window as unknown as {
      __pierrotSetStreamHarness?: (next: typeof value) => void;
    };
    scope.__pierrotSetStreamHarness?.(value);
  }, patch);
}

for (const viewport of STRUCTURED_VIEWPORTS) {
  test.describe(`structured browser rendering · ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('real chart and diagram expose SVG geometry and the invalid payload falls back to Markdown', async ({
      page,
    }) => {
      await page.goto('/dev/pierrot-rendering');
      await expect(page.locator('[data-pierrot-response]').first()).toBeVisible();

      // ---- Chart: the real Recharts SVG, not the mocked component. ----
      const chartSection = page.locator('#case-msi');
      await chartSection.scrollIntoViewIfNeeded();
      const chart = chartSection
        .locator('[data-pierrot-response="structured"] svg.recharts-surface')
        .first();
      await expect(chart).toBeVisible();
      await expect
        .poll(async () => chart.locator('path.recharts-line-curve, path.recharts-curve').count(), {
          message: 'chart must render a real line path',
        })
        .toBeGreaterThanOrEqual(1);

      const chartSurface = await chart.evaluate((svg) => {
        const rect = svg.getBoundingClientRect();
        const paths = Array.from(svg.querySelectorAll('path'))
          .map((path) => path.getAttribute('d') || '')
          .filter((d) => d.length > 8);
        const canvases = Array.from(
          svg.ownerDocument.querySelectorAll<HTMLCanvasElement>('#case-msi canvas')
        ).map((canvas) => ({ width: canvas.width, height: canvas.height }));

        return {
          width: rect.width,
          height: rect.height,
          pathCount: paths.length,
          labels: Array.from(svg.querySelectorAll('text'))
            .map((node) => node.textContent || '')
            .join(' '),
          canvases,
        };
      });

      expect(chartSurface.width, 'chart surface width').toBeGreaterThan(100);
      expect(chartSurface.height, 'chart surface height').toBeGreaterThan(80);
      expect(chartSurface.pathCount, 'chart path geometry').toBeGreaterThanOrEqual(1);
      expect(chartSurface.labels.trim().length, 'chart axis labels').toBeGreaterThan(0);
      for (const canvas of chartSurface.canvases) {
        expect(canvas.width, 'canvas width').toBeGreaterThan(0);
        expect(canvas.height, 'canvas height').toBeGreaterThan(0);
      }

      // ---- Diagram: node rects, labelled edges and the inference dash. ----
      const diagramSection = page.locator('#case-diagram');
      await diagramSection.scrollIntoViewIfNeeded();
      const diagram = diagramSection
        .locator('[data-pierrot-response="structured"] svg[role="img"]')
        .first();
      await expect(diagram).toBeVisible();

      const diagramSurface = await diagram.evaluate((svg) => {
        const rect = svg.getBoundingClientRect();
        const nodes = Array.from(svg.querySelectorAll('rect')).map((node) => ({
          width: Number(node.getAttribute('width')),
          height: Number(node.getAttribute('height')),
        }));
        const edges = Array.from(svg.querySelectorAll('line')).map((edge) => {
          const x1 = Number(edge.getAttribute('x1'));
          const y1 = Number(edge.getAttribute('y1'));
          const x2 = Number(edge.getAttribute('x2'));
          const y2 = Number(edge.getAttribute('y2'));
          return {
            length: Math.hypot(x2 - x1, y2 - y1),
            dash: edge.getAttribute('stroke-dasharray'),
            marker: edge.getAttribute('marker-end'),
          };
        });

        return {
          width: rect.width,
          height: rect.height,
          viewBox: svg.getAttribute('viewBox'),
          nodes,
          edges,
          text: svg.textContent || '',
        };
      });

      expect(diagramSurface.width, 'diagram width').toBeGreaterThan(100);
      expect(diagramSurface.height, 'diagram height').toBeGreaterThan(40);
      expect(diagramSurface.viewBox, 'diagram viewBox').toMatch(/^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
      expect(diagramSurface.nodes.length, 'diagram node rectangles').toBeGreaterThanOrEqual(6);
      for (const node of diagramSurface.nodes) {
        expect(node.width, 'node width').toBeGreaterThan(20);
        expect(node.height, 'node height').toBeGreaterThan(10);
      }
      expect(diagramSurface.edges.length, 'diagram edges').toBeGreaterThanOrEqual(5);
      for (const edge of diagramSurface.edges) {
        expect(edge.length, 'edge length').toBeGreaterThan(20);
        expect(edge.marker, 'edge marker').toContain('url(#');
      }
      expect(
        diagramSurface.edges.some((edge) => Boolean(edge.dash)),
        'inference edge must stay visually distinct'
      ).toBe(true);
      expect(diagramSurface.text, 'diagram labels').toContain('UNFRAMED');
      expect(diagramSurface.text, 'diagram labels').toContain('Digital Temple');

      // ---- Invalid payload: Markdown stays visible, no broken chart. ----
      const invalidSection = page.locator('#case-invalid');
      await invalidSection.scrollIntoViewIfNeeded();
      await expect(invalidSection.locator('[data-pierrot-response="markdown"]')).toBeVisible();
      await expect(invalidSection.getByText('Markdown fallback', { exact: false })).toBeVisible();
      await expect(invalidSection.locator('[data-pierrot-response="structured"]')).toHaveCount(0);
      await expect(invalidSection.locator('svg.recharts-surface')).toHaveCount(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, 'structured preview page overflow').toBeLessThanOrEqual(2);
    });
  });
}

for (const viewport of STREAM_VIEWPORTS) {
  test.describe(`live streaming anchoring · ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('manual scroll up during a long stream survives completion without a viewport jump', async ({
      page,
    }) => {
      await installStreamHarness(page);
      await preloadTranscript(page, historyFixture(520));
      await openPierrot(page);

      await expect
        .poll(async () => page.locator('[data-pierrot-messages] article').count(), {
          message: '500+ message history must render',
        })
        .toBeGreaterThanOrEqual(500);

      // Start in the middle of the history, then move the reader manually.
      const anchor = await page.evaluate(() => {
        const element = document.querySelector<HTMLElement>('[data-pierrot-messages]');
        if (!element) throw new Error('missing transcript');
        element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.45);
        element.dispatchEvent(new Event('scroll', { bubbles: true }));
        return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight };
      });
      expect(anchor.scrollTop, 'fixture must be scrollable').toBeGreaterThan(0);

      const shellBefore = await readShell(page);

      const reply = Array.from(
        { length: 50 },
        (_, index) => `Строка ${index + 1}. Обезличенный потоковый ответ.`
      ).join('\n\n');

      await setStreamHarness(page, {
        mode: 'stream',
        reply,
        chunks: 50,
        chunkDelayMs: 45,
      });

      const input = page.locator('[data-pierrot-input]');
      await input.fill('Продолжи разговор.');
      await input.press('Enter');

      await expect
        .poll(
          async () => {
            const text = await page.locator('[data-pierrot-messages]').innerText();
            return (text.match(/Обезличенный потоковый ответ/gu) || []).length;
          },
          { message: 'stream should deliver several chunks before scrolling' }
        )
        .toBeGreaterThanOrEqual(3);

      const messages = page.locator('[data-pierrot-messages]');
      const box = await messages.boundingBox();
      if (!box) throw new Error('missing message box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

      const beforeWheel = await readTranscript(page);
      await page.mouse.wheel(0, -320);
      await expect
        .poll(async () => (await readTranscript(page)).scrollTop, {
          message: 'wheel must move the reader up while the answer streams',
        })
        .toBeLessThan(beforeWheel.scrollTop);
      const afterWheel = await readTranscript(page);
      expect(
        afterWheel.scrollTop,
        'manual wheel must keep the reader above the bottom'
      ).toBeGreaterThan(0);

      await expect(page.getByText('Строка 50. Обезличенный потоковый ответ.')).toBeVisible();
      await expect(page.locator('[data-pierrot-send]')).toBeVisible();

      const after = await readTranscript(page);
      expect(
        Math.abs(after.scrollTop - afterWheel.scrollTop),
        'streaming completion must not yank a reader who scrolled up'
      ).toBeLessThanOrEqual(160);
      expect(
        after.scrollTop,
        'reader must stay away from the bottom after manual scroll up'
      ).toBeLessThan(after.scrollHeight - after.clientHeight - 100);
      expect(after.pageOverflow, 'page overflow during live stream').toBeLessThanOrEqual(1);

      expectStableShell(shellBefore, await readShell(page), 'live stream');
      await expect(page.locator('[data-pierrot-input]')).toBeVisible();
    });
  });
}

test.describe('stream interruption and reconnect', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the partial answer and the next turn reconnects without moving the shell', async ({
    page,
  }) => {
    await installStreamHarness(page);
    await preloadTranscript(page, historyFixture(24));
    await openPierrot(page);

    const shellBefore = await readShell(page);

    const interruptedReply = Array.from(
      { length: 24 },
      (_, index) => `Фрагмент ${index + 1} прерванного ответа.`
    ).join(' ');

    await setStreamHarness(page, {
      mode: 'interrupt',
      reply: interruptedReply,
      chunks: 24,
      chunkDelayMs: 30,
    });

    const input = page.locator('[data-pierrot-input]');
    await input.fill('Проверка обрыва соединения.');
    await input.press('Enter');

    await expect(
      page.getByText(/Ответ прерван|The answer was interrupted/),
      'interruption notice must be visible'
    ).toBeVisible();
    await expect(page.locator('[data-pierrot-messages]')).toContainText('Фрагмент 1');
    await expect(page.locator('[data-pierrot-send]')).toBeVisible();
    await expect(input).toHaveJSProperty('readOnly', false);

    expectStableShell(shellBefore, await readShell(page), 'interrupted stream');

    // The next turn is a normal, complete SSE response from the test route.
    await page.route('**/api/pierrot-web', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: streamBody({ reply: 'Соединение восстановлено. Ответ получен.' }),
      });
    });

    await setStreamHarness(page, { mode: 'off' });

    await input.fill('Повтори после обрыва.');
    await input.press('Enter');

    await expect(page.getByText('Соединение восстановлено. Ответ получен.')).toBeVisible();
    await expect(page.locator('[data-pierrot-send]')).toBeVisible();
    await expect(page.locator('[data-pierrot-messages]')).toContainText('Фрагмент 1');

    expectStableShell(shellBefore, await readShell(page), 'reconnected stream');
    await expect(page.locator('[data-pierrot-input]')).toBeVisible();
  });
});

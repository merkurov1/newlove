import { test, expect, type Page } from '@playwright/test';

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  scrollHeight: number;
  clientHeight: number;
};

type Boxes = {
  shell: Rect;
  header: Rect;
  messages: Rect;
  footer: Rect;
  input: Rect;
  send: Rect;
};

type VisibleViewport = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const PORTRAIT_VIEWPORTS = [
  { label: '320x568', width: 320, height: 568 },
  { label: '360x800', width: 360, height: 800 },
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '430x932', width: 430, height: 932 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '820x1180', width: 820, height: 1180 },
  { label: '1024x768', width: 1024, height: 768 },
];

const LANDSCAPE_VIEWPORTS = PORTRAIT_VIEWPORTS.map(({ label, width, height }) => ({
  label: `${label} landscape`,
  width: height,
  height: width,
})).filter(
  (viewport) =>
    !PORTRAIT_VIEWPORTS.some(
      (portrait) => portrait.width === viewport.width && portrait.height === viewport.height
    )
);

const ALL_VIEWPORTS = [...PORTRAIT_VIEWPORTS, ...LANDSCAPE_VIEWPORTS];

async function openPierrot(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Pierrot', exact: true }).click();
  await expect(page.locator('[data-pierrot-modal]')).toBeVisible();
  await expect(page.locator('[data-pierrot-modal] > section')).toHaveCSS('opacity', '1');
}

async function readBoxes(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const read = (selector: string): Rect => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    };

    return {
      shell: read('[data-pierrot-modal]'),
      header: read('[data-pierrot-header]'),
      messages: read('[data-pierrot-messages]'),
      footer: read('[data-pierrot-footer]'),
      input: read('[data-pierrot-input]'),
      send: read('[data-pierrot-send], [data-pierrot-stop]'),
    };
  });
}

async function readVisibleViewport(page: Page): Promise<VisibleViewport> {
  return page.evaluate(() => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;

    return { left, top, right: left + width, bottom: top + height };
  });
}

function expectInside(rect: Rect, bounds: VisibleViewport, label: string) {
  expect(rect, `${label} should be rendered`).toBeTruthy();
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(bounds.left - 1);
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(bounds.right + 1);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(bounds.bottom + 1);
}

async function expectStableComposerLayout(page: Page) {
  const boxes = await readBoxes(page);
  const bounds = await readVisibleViewport(page);

  expectInside(boxes.shell, bounds, 'modal shell');
  expectInside(boxes.header, bounds, 'header');
  expectInside(boxes.messages, bounds, 'message list');
  expectInside(boxes.footer, bounds, 'footer');
  expectInside(boxes.input, bounds, 'textarea');
  expectInside(boxes.send, bounds, 'send button');

  expect(boxes.header.top, 'header should start at the shell top').toBeGreaterThanOrEqual(
    boxes.shell.top - 1
  );
  expect(boxes.messages.top, 'message list should follow the header').toBeGreaterThanOrEqual(
    boxes.header.bottom - 1
  );
  expect(boxes.messages.bottom, 'message list should stop at the footer').toBeLessThanOrEqual(
    boxes.footer.top + 1
  );
  expect(boxes.footer.bottom, 'footer should end with the shell').toBeLessThanOrEqual(
    boxes.shell.bottom + 1
  );
  expect(boxes.input.bottom, 'textarea should stay inside the footer').toBeLessThanOrEqual(
    boxes.footer.bottom + 1
  );
  expect(boxes.send.bottom, 'send button should stay inside the footer').toBeLessThanOrEqual(
    boxes.footer.bottom + 1
  );

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    rootOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    scrollY: window.scrollY,
  }));

  expect(metrics.scrollWidth, 'document should not overflow horizontally').toBeLessThanOrEqual(
    metrics.clientWidth + 1
  );
  expect(metrics.rootOverflow).toBe('hidden');
  expect(metrics.bodyOverflow).toBe('hidden');

  return { boxes, bounds };
}

async function installMockVisualViewport(page: Page) {
  await page.addInitScript(() => {
    type Listener = (event: Event) => void;

    const listeners = new Map<string, Set<Listener>>();
    const state: {
      width: number | null;
      height: number | null;
      offsetTop: number;
      offsetLeft: number;
    } = {
      width: null,
      height: null,
      offsetTop: 0,
      offsetLeft: 0,
    };

    const viewport = {
      get width() {
        return state.width ?? window.innerWidth;
      },
      get height() {
        return state.height ?? window.innerHeight;
      },
      get offsetTop() {
        return state.offsetTop;
      },
      get offsetLeft() {
        return state.offsetLeft;
      },
      addEventListener(type: string, listener: Listener) {
        const bucket = listeners.get(type) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener(type: string, listener: Listener) {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent(event: Event) {
        listeners.get(event.type)?.forEach((listener) => listener(event));
        return true;
      },
    };

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });

    (
      window as Window & {
        __pierrotSetVisualViewport?: (next: {
          width?: number | null;
          height?: number | null;
          offsetTop?: number;
          offsetLeft?: number;
        }) => void;
      }
    ).__pierrotSetVisualViewport = (next) => {
      Object.assign(state, next);
      viewport.dispatchEvent(new Event('resize'));
    };

    (
      window as Window & {
        __pierrotResetVisualViewport?: () => void;
      }
    ).__pierrotResetVisualViewport = () => {
      state.width = null;
      state.height = null;
      state.offsetTop = 0;
      state.offsetLeft = 0;
      viewport.dispatchEvent(new Event('resize'));
    };
  });
}

async function setMockVisualViewport(
  page: Page,
  next: { height?: number | null; offsetTop?: number; offsetLeft?: number }
) {
  await page.evaluate((value) => {
    (
      window as Window & {
        __pierrotSetVisualViewport?: (next: typeof value) => void;
      }
    ).__pierrotSetVisualViewport?.(value);
  }, next);
}

test.describe('Pierrot modal geometry matrix', () => {
  for (const viewport of ALL_VIEWPORTS) {
    test(`${viewport.label} keeps every composer control visible`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openPierrot(page);

      const { boxes, bounds } = await expectStableComposerLayout(page);
      expect(Math.abs(boxes.shell.width - (bounds.right - bounds.left))).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes.shell.height - (bounds.bottom - bounds.top))).toBeLessThanOrEqual(1);

      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(5, 5);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(100);
      const scrollAfter = await page.evaluate(() => window.scrollY);
      expect(scrollAfter, 'background document must not scroll').toBe(scrollBefore);
    });
  }
});

test.describe('Pierrot modal mobile emulation', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('opening does not focus the composer or summon the keyboard', async ({ page }) => {
    await openPierrot(page);

    const active = await page.evaluate(() => ({
      tagName: document.activeElement?.tagName,
      isComposer: document.activeElement?.hasAttribute('data-pierrot-input') ?? false,
    }));

    expect(active.isComposer).toBe(false);
    expect(active.tagName).toBe('SECTION');
  });

  test('follows the visual viewport through keyboard open, offset and close', async ({ page }) => {
    await installMockVisualViewport(page);
    await openPierrot(page);

    const initial = await expectStableComposerLayout(page);
    expect(initial.bounds.bottom).toBe(844);
    expect(initial.boxes.footer.bottom).toBeLessThanOrEqual(initial.bounds.bottom + 1);

    await setMockVisualViewport(page, { height: 500, offsetTop: 0 });
    await expect
      .poll(async () => (await readBoxes(page)).shell.height, {
        message: 'shell should shrink to the visual viewport',
      })
      .toBe(500);

    const keyboardOpen = await expectStableComposerLayout(page);
    expect(keyboardOpen.boxes.footer.bottom).toBeLessThanOrEqual(keyboardOpen.bounds.bottom + 1);
    expect(keyboardOpen.boxes.messages.height).toBeLessThan(initial.boxes.messages.height);

    await setMockVisualViewport(page, { height: 500, offsetTop: 50 });
    await expect
      .poll(async () => (await readBoxes(page)).shell.top, {
        message: 'shell should follow visual viewport offsetTop',
      })
      .toBe(50);

    const keyboardScrolled = await expectStableComposerLayout(page);
    expect(keyboardScrolled.bounds.top).toBe(50);
    expect(keyboardScrolled.boxes.footer.bottom).toBeLessThanOrEqual(
      keyboardScrolled.bounds.bottom + 1
    );

    await page.evaluate(() => {
      (
        window as Window & {
          __pierrotResetVisualViewport?: () => void;
        }
      ).__pierrotResetVisualViewport?.();
    });
    await expect
      .poll(async () => (await readBoxes(page)).shell.height, {
        message: 'shell should return to the full visual viewport',
      })
      .toBe(844);

    const keyboardClosed = await expectStableComposerLayout(page);
    expect(keyboardClosed.boxes.footer.bottom).toBeLessThanOrEqual(
      keyboardClosed.bounds.bottom + 1
    );
    expect(keyboardClosed.boxes.shell.top).toBe(0);
  });

  test('long input scrolls internally without pushing the footer out', async ({ page }) => {
    await installMockVisualViewport(page);
    await openPierrot(page);

    await setMockVisualViewport(page, { height: 500, offsetTop: 0 });
    await expect.poll(async () => (await readBoxes(page)).shell.height).toBe(500);

    const input = page.locator('[data-pierrot-input]');
    await input.fill('a'.repeat(600));

    const { boxes } = await expectStableComposerLayout(page);
    expect(boxes.input.height).toBeLessThanOrEqual(168);
    expect(boxes.input.scrollHeight).toBeGreaterThan(boxes.input.clientHeight);
    expect(boxes.footer.bottom).toBeLessThanOrEqual(500 + 1);
    expect(boxes.send.bottom).toBeLessThanOrEqual(500 + 1);
  });

  test('loading and response transitions keep the composer in place', async ({ page }) => {
    await page.route('**/api/pierrot-web', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'A quiet answer.', provider: 'test' }),
      });
    });

    await openPierrot(page);

    const input = page.locator('[data-pierrot-input]');
    await input.fill('hello');
    await input.press('Enter');

    await expect(page.getByText('Thinking…')).toBeVisible();
    await expectStableComposerLayout(page);

    await expect(page.getByText('A quiet answer.')).toBeVisible();
    await expectStableComposerLayout(page);
    await expect(input).toHaveValue('');
  });

  test('repeated open and close cycles stay stable', async ({ page }) => {
    await page.goto('/');

    for (let cycle = 0; cycle < 4; cycle += 1) {
      await page.getByRole('button', { name: 'Open Pierrot', exact: true }).click();
      await expect(page.locator('[data-pierrot-modal]')).toBeVisible();
      await expectStableComposerLayout(page);

      await page.getByRole('button', { name: 'Close Pierrot' }).click();
      await expect(page.locator('[data-pierrot-modal]')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open Pierrot', exact: true })).toBeVisible();

      const state = await page.evaluate(() => ({
        scrollY: window.scrollY,
        rootOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(state.scrollY).toBe(0);
      expect(state.rootOverflow).toBe('');
      expect(state.bodyOverflow).toBe('');
      expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth + 1);
    }
  });
});

test.describe('Pierrot modal desktop', () => {
  test('keeps the desktop composer focus behavior and geometry', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openPierrot(page);

    await expect(page.locator('[data-pierrot-input]')).toBeFocused();
    await expectStableComposerLayout(page);
  });
});

/*
 * Chromium emulation cannot reproduce the iOS Safari keyboard. The tests above
 * validate the geometry contract and the VisualViewport event handling with a
 * mocked visual viewport; they are not a substitute for the real-device
 * checklist in docs/audits/pierrot-viewport-fix.md.
 */

const STREAM_MESSAGE_STORAGE_KEY = 'pierrot_chat_history_v2';

function historyFixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `history-${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content:
      index % 7 === 0
        ? `Сообщение ${index + 1}. Длинная запись истории с несколькими предложениями, чтобы высота списка была реалистичной и прокрутка проверялась на настоящем объёме.`
        : `Сообщение ${index + 1}. Краткая запись истории Pierrot.`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, index)).toISOString(),
    author: index % 2 === 0 ? 'visitor' : 'pierrot',
  }));
}

async function preloadTranscript(page: Page, messages: unknown[]) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STREAM_MESSAGE_STORAGE_KEY, value: messages }
  );
}

function streamBody(input: {
  reply: string;
  chunks?: number;
  response?: Record<string, unknown>;
}) {
  const chunks = input.chunks ?? 40;
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
        ...(input.response ? { response: input.response } : {}),
      },
    },
  ];

  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

async function sendAndHoldResponse(
  page: Page,
  body: string,
  options: { holdMs?: number } = {}
) {
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/pierrot-web', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    if (options.holdMs) await new Promise((resolve) => setTimeout(resolve, options.holdMs));
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });

  const input = page.locator('[data-pierrot-input]');
  await input.fill('Продолжи разговор.');
  await input.press('Enter');
  await expect(page.getByText('Thinking…')).toBeVisible();

  return () => release?.();
}

function transcriptPosition(page: Page, ratio = 0.45) {
  return page.evaluate((value) => {
    const element = document.querySelector<HTMLElement>('[data-pierrot-messages]');
    if (!element) throw new Error('missing transcript');
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * value);
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  }, ratio);
}

async function readTranscript(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-pierrot-messages]');
    if (!element) throw new Error('missing transcript');
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      pageOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.describe('Pierrot long transcript and streaming anchoring', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('long streaming response does not cut text or yank a reader who scrolled up', async ({
    page,
  }) => {
    const lines = Array.from(
      { length: 90 },
      (_, index) => `Строка ${index + 1}. Подробный ответ, который поступает постепенно.`
    );
    const reply = `${lines.join('\n\n')}\n\nФинальная строка ответа.`;

    await preloadTranscript(page, historyFixture(40));
    await openPierrot(page);
    const release = await sendAndHoldResponse(page, streamBody({ reply }), { holdMs: 150 });
    const before = await transcriptPosition(page, 0.4);

    release();
    await expect(page.getByText('Финальная строка ответа.')).toBeVisible();

    const after = await readTranscript(page);
    expect(after.pageOverflow).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.scrollTop - before.scrollTop),
      'reader position must survive streaming completion'
    ).toBeLessThanOrEqual(80);
    await expect(page.locator('[data-pierrot-input]')).toBeVisible();
  });

  test('500-message history keeps its position when a new turn is appended', async ({ page }) => {
    await preloadTranscript(page, historyFixture(500));
    await openPierrot(page);

    const listCount = await page.locator('[data-pierrot-messages] article').count();
    expect(listCount).toBeGreaterThanOrEqual(500);

    const before = await transcriptPosition(page, 0.5);
    expect(before.scrollTop).toBeGreaterThan(0);

    const release = await sendAndHoldResponse(
      page,
      streamBody({ reply: 'Новое сообщение после прокрутки.' }),
      { holdMs: 100 }
    );
    release();
    await expect(page.getByText('Новое сообщение после прокрутки.')).toBeVisible();

    const after = await readTranscript(page);
    expect(
      Math.abs(after.scrollTop - before.scrollTop),
      'new message must not reset a reader in the middle of history'
    ).toBeLessThanOrEqual(80);
  });

  test('Markdown stream transitions to structured table and real chart without a jump', async ({
    page,
  }) => {
    const response = {
      version: 1,
      language: 'ru',
      blocks: [
        { type: 'heading', level: 2, text: 'Итоги' },
        {
          type: 'table',
          columns: [
            { key: 'day', label: 'День' },
            { key: 'visits', label: 'Визиты' },
          ],
          rows: [
            { day: 'Пн', visits: 120 },
            { day: 'Вт', visits: 140 },
          ],
        },
        {
          type: 'chart',
          chart: 'line',
          title: 'Визиты',
          data: [
            { day: 'Пн', visits: 120 },
            { day: 'Вт', visits: 140 },
          ],
          xKey: 'day',
          series: [{ key: 'visits', label: 'Визиты' }],
        },
      ],
    };
    const reply = '## Итоги\n\n| День | Визиты |\n| --- | --- |\n| Пн | 120 |\n| Вт | 140 |';

    await preloadTranscript(page, historyFixture(60));
    await openPierrot(page);
    const release = await sendAndHoldResponse(
      page,
      streamBody({ reply, response }),
      { holdMs: 150 }
    );
    const before = await transcriptPosition(page, 0.35);
    release();

    await expect(page.locator('[data-pierrot-messages] table')).toBeVisible();
    const chart = page.locator('[data-pierrot-messages] svg.recharts-surface').first();
    await expect(chart).toBeVisible();
    await expect.poll(async () => chart.locator('path.recharts-line-curve, path.recharts-curve').count())
      .toBeGreaterThanOrEqual(1);

    const after = await readTranscript(page);
    expect(after.pageOverflow).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.scrollTop - before.scrollTop),
      'structured transition must preserve the reader position'
    ).toBeLessThanOrEqual(120);
  });

  test('mobile keyboard open and close keeps the composer and long answer usable', async ({
    page,
  }) => {
    await installMockVisualViewport(page);
    await preloadTranscript(page, historyFixture(30));
    await openPierrot(page);

    await setMockVisualViewport(page, { height: 500, offsetTop: 0 });
    await expect.poll(async () => (await readBoxes(page)).shell.height).toBe(500);

    const reply = Array.from({ length: 40 }, (_, index) => `Абзац ${index + 1} длинного ответа.`).join(
      '\n\n'
    );
    const release = await sendAndHoldResponse(page, streamBody({ reply }));
    release();
    await expect(page.getByText('Абзац 40 длинного ответа.')).toBeVisible();
    await expectStableComposerLayout(page);

    await page.evaluate(() => {
      (
        window as Window & {
          __pierrotResetVisualViewport?: () => void;
        }
      ).__pierrotResetVisualViewport?.();
    });
    await expect.poll(async () => (await readBoxes(page)).shell.height).toBe(844);
    await expectStableComposerLayout(page);
    await expect(page.locator('[data-pierrot-input]')).toBeVisible();
  });
});

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import FlowReaderShell from '../FlowReaderShell';
import { runTopTelegramBackHandler } from '@/lib/telegram/backHandler';
import {
  FLOW_READER_PREFS_KEY,
  FLOW_READER_STATE_KEY,
  readFlowReaderState,
  writeFlowLastRead,
} from '@/lib/flow/readerState';
import type { TocItem } from '@/lib/reader/headings';

const HEADINGS: TocItem[] = [
  { id: 'opening', title: 'Opening', level: 1, line: 1 },
  { id: 'the-quiet-index', title: 'The quiet index', level: 2, line: 3 },
];

function reader(headings: TocItem[] = []) {
  return (
    <div>
      <FlowReaderShell slug="the-quiet-index" title="The quiet index" headings={headings} />

      <article className="flow-item">
        <h2 id="opening" tabIndex={-1}>
          Opening
        </h2>
        <h2 id="the-quiet-index" tabIndex={-1}>
          The quiet index
        </h2>

        <p>Body copy.</p>

        <a
          href="https://images.example.com/one.jpg"
          data-flow-image
          data-flow-image-src="https://images.example.com/one.jpg"
          data-flow-image-alt="First room"
          data-flow-image-caption="The first room"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="First room" src="https://images.example.com/one.jpg" />
        </a>

        <a
          href="https://images.example.com/two.jpg"
          data-flow-image
          data-flow-image-src="https://images.example.com/two.jpg"
          data-flow-image-alt="Second room"
          data-flow-image-caption="The second room"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Second room" src="https://images.example.com/two.jpg" />
        </a>
      </article>
    </div>
  );
}

function mockArticleHeight(readHeight: () => number) {
  const article = document.querySelector<HTMLElement>('.flow-item');

  if (!article) throw new Error('Article missing');

  jest.spyOn(article, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top: -window.scrollY,
        bottom: -window.scrollY + readHeight(),
        left: 0,
        right: 320,
        width: 320,
        height: readHeight(),
        x: 0,
        y: -window.scrollY,
        toJSON: () => ({}),
      }) as DOMRect
  );

  return article;
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setScrollY(0);
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: 800,
  });
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.className = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  document.documentElement.removeAttribute('data-flow-reader-theme');
  document.documentElement.style.removeProperty('--flow-reader-font-scale');
  document.documentElement.style.removeProperty('--flow-reader-line-height');
});

describe('FlowReaderShell', () => {
  it('persists the last-read publication without identity data', async () => {
    render(reader());

    await waitFor(() => {
      expect(readFlowReaderState(window.localStorage).lastRead?.slug).toBe('the-quiet-index');
    });

    const raw = window.localStorage.getItem(FLOW_READER_STATE_KEY) ?? '';

    expect(raw).toContain('The quiet index');
    expect(raw).not.toMatch(/initData|telegram_user|user_id/);
    expect(document.body).toHaveClass('flow-reading');
  });

  it('adds exactly one reading progress indicator with accessible values', async () => {
    render(reader());

    const progress = screen.getByRole('progressbar', { name: 'Reading progress' });

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow');
    expect(progress).toHaveAttribute('aria-valuetext');
  });

  it('recomputes progress when content and viewport change', async () => {
    let height = 2_000;

    render(reader());
    mockArticleHeight(() => height);

    const progress = screen.getByRole('progressbar', { name: 'Reading progress' });

    setScrollY(500);
    fireEvent.scroll(window);

    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '42'));

    height = 3_000;
    fireEvent(window, new Event('resize'));

    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '23'));
  });

  it('resumes the stored position and recalculates it after content grows', async () => {
    let height = 3_000;

    writeFlowLastRead(window.localStorage, {
      slug: 'the-quiet-index',
      title: 'The quiet index',
      progress: 0.5,
    });
    render(reader());
    mockArticleHeight(() => height);

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 1_100, behavior: 'auto' })
    );

    height = 5_000;
    fireEvent(window, new Event('resize'));

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 2_100, behavior: 'auto' })
    );
  });

  it('does not resume when the URL points at an explicit heading', async () => {
    writeFlowLastRead(window.localStorage, {
      slug: 'the-quiet-index',
      title: 'The quiet index',
      progress: 0.5,
    });

    window.history.replaceState(null, '', '#opening');
    render(reader());
    mockArticleHeight(() => 3_000);

    await new Promise((resolve) => window.setTimeout(resolve, 250));

    expect(window.scrollTo).not.toHaveBeenCalled();

    window.history.replaceState(null, '', window.location.pathname);
  });

  it('keeps appearance and focus as icon-only controls with accessible names', () => {
    render(reader(HEADINGS));

    const appearance = screen.getByRole('button', { name: 'Appearance settings' });
    const focus = screen.getByRole('button', { name: 'Focus mode' });

    expect(appearance.textContent).toBe('');
    expect(focus.textContent).toBe('');
    expect(appearance).toHaveAttribute('aria-label', 'Appearance settings');
    expect(focus).toHaveAttribute('aria-label', 'Focus mode');
  });

  it('persists appearance preferences and applies them to the reader root', async () => {
    render(reader());

    const appearance = screen.getByRole('button', { name: 'Appearance settings' });

    appearance.focus();
    fireEvent.click(appearance);

    const dialog = screen.getByRole('dialog', { name: 'Appearance' });

    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Increase text size' }));

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--flow-reader-font-scale')).toBe(
        '1.10'
      )
    );
    expect(document.documentElement.dataset.flowReaderTheme).toBe('light');

    const stored = JSON.parse(window.localStorage.getItem(FLOW_READER_PREFS_KEY) ?? '{}');

    expect(stored).toMatchObject({ fontScale: 1.1, focusMode: false });
    expect(window.localStorage.getItem(FLOW_READER_PREFS_KEY)).not.toMatch(
      /initData|telegram|user_id|token/i
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sepia' }));

    await waitFor(() => expect(document.documentElement.dataset.flowReaderTheme).toBe('sepia'));

    fireEvent.change(within(dialog).getByRole('slider', { name: 'Line spacing' }), {
      target: { value: '2' },
    });

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(FLOW_READER_PREFS_KEY) ?? '{}');

      expect(saved).toMatchObject({ theme: 'sepia', lineHeight: 2 });
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog', { name: 'Appearance' })).not.toBeInTheDocument();
    expect(appearance).toHaveFocus();
  });

  it('restores persisted appearance and focus mode on the next visit', async () => {
    const first = render(reader());

    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));

    expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(document.body).toHaveClass('flow-reader-focus');

    first.unmount();

    render(reader());

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    expect(document.body).toHaveClass('flow-reader-focus');
  });

  it('only offers contents when the publication has headings', () => {
    const { unmount } = render(reader());

    expect(screen.queryByRole('button', { name: 'Contents' })).not.toBeInTheDocument();

    unmount();
    render(reader(HEADINGS));

    expect(screen.getByRole('button', { name: 'Contents' })).toBeInTheDocument();
  });

  it('supports keyboard navigation, focus and closing in the contents panel', async () => {
    render(reader(HEADINGS));

    fireEvent.click(screen.getByRole('button', { name: 'Contents' }));

    const dialog = screen.getByRole('dialog', { name: 'Contents' });
    const nav = within(dialog).getByRole('navigation', { name: 'Table of contents' });
    const first = within(nav).getByRole('button', { name: 'Opening' });
    const second = within(nav).getByRole('button', { name: 'The quiet index' });

    fireEvent.keyDown(nav, { key: 'ArrowDown' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(nav, { key: 'ArrowDown' });
    expect(second).toHaveFocus();

    fireEvent.keyDown(nav, { key: 'Home' });
    expect(first).toHaveFocus();

    fireEvent.click(first);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Contents' })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(document.getElementById('opening')).toHaveFocus());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(window.location.hash).toBe('#opening');
  });

  it('opens the server-rendered figures in the client gallery and closes with Telegram Back', async () => {
    const { unmount } = render(reader());

    fireEvent.click(screen.getAllByRole('link', { name: 'First room' })[0]);

    expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();
    expect(screen.getByText('The first room')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    act(() => {
      expect(runTopTelegramBackHandler()).toBe(true);
    });

    expect(screen.queryByRole('dialog', { name: 'Image viewer' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    unmount();
    expect(document.body).not.toHaveClass('flow-reading');
  });

  it('returns focus to the opening figure and preserves the reading position on close', async () => {
    render(reader());
    mockArticleHeight(() => 2_000);
    setScrollY(480);

    const link = screen.getAllByRole('link', { name: 'First room' })[0];

    link.focus();
    fireEvent.click(link);

    expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Image viewer' })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(link).toHaveFocus());
    expect(window.scrollY).toBe(480);
  });

  it('leaves modified clicks to the browser so images still open in a new tab', () => {
    render(reader());

    const link = screen.getAllByRole('link', { name: 'First room' })[0];

    fireEvent.click(link, { metaKey: true, button: 0 });

    expect(screen.queryByRole('dialog', { name: 'Image viewer' })).not.toBeInTheDocument();
  });
});

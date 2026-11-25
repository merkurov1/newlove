import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import FlowReaderShell from '../FlowReaderShell';
import { runTopTelegramBackHandler } from '@/lib/telegram/backHandler';
import { FLOW_READER_STATE_KEY, readFlowReaderState } from '@/lib/flow/readerState';

function reader() {
  return (
    <div>
      <FlowReaderShell slug="the-quiet-index" title="The quiet index" />

      <article className="flow-item">
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

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  document.body.className = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
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

  it('adds a reading progress indicator with accessible values', async () => {
    render(reader());

    const progress = screen.getByRole('progressbar', { name: 'Reading progress' });

    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow');
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

  it('leaves modified clicks to the browser so images still open in a new tab', () => {
    render(reader());

    const link = screen.getAllByRole('link', { name: 'First room' })[0];

    fireEvent.click(link, { metaKey: true, button: 0 });

    expect(screen.queryByRole('dialog', { name: 'Image viewer' })).not.toBeInTheDocument();
  });
});

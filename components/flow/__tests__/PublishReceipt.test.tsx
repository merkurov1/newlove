import { act, render, screen } from '@testing-library/react';

import PublishReceipt from '../PublishReceipt';

function publish(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new CustomEvent('flow:published', { detail }));
  });
}

describe('Flow publication receipt', () => {
  it('shows each channel state without promoting an unconfirmed delivery', () => {
    render(<PublishReceipt />);

    publish({
      item: { id: 'item-1' },
      pending: false,
      crosspost: {
        channels: {
          telegram: { status: 'published' },
          bluesky: { status: 'failed', uncertain: true, lastError: 'Timed out.' },
        },
      },
    });

    expect(screen.getByText('Flow · saved')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
    expect(screen.getByText('Bluesky')).toBeInTheDocument();
    expect(screen.getByText('unconfirmed')).toBeInTheDocument();
    expect(screen.queryAllByText('delivered')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Channel details/i })).toHaveAttribute(
      'href',
      '/admin/items/item-1'
    );
  });

  it('marks deferred channels as publishing rather than delivered', () => {
    jest.useFakeTimers();

    try {
      render(<PublishReceipt />);

      publish({
        item: { id: 'item-2' },
        pending: true,
        crosspost: null,
      });

      expect(screen.getAllByText('publishing…')).toHaveLength(2);
      expect(screen.queryByText('delivered')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

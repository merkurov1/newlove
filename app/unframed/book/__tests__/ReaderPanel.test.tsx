import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReaderPanel from '../ReaderPanel';

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open panel
      </button>
      <ReaderPanel open={open} onClose={() => setOpen(false)} side="left" labelledBy="panel-title">
        <h2 id="panel-title">Contents</h2>
        <button type="button">Close</button>
        <button type="button">Second action</button>
      </ReaderPanel>
    </div>
  );
}

describe('ReaderPanel accessibility', () => {
  it('moves focus inside, closes on Escape and restores the trigger', async () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open panel' });
    trigger.focus();
    fireEvent.click(trigger);

    const close = await screen.findByRole('button', { name: 'Close' });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('closes when the backdrop is clicked', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open panel' }));

    const dialog = await screen.findByRole('dialog');
    const backdrop = document.querySelector('[data-reader-backdrop]');
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as Element);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(dialog).not.toBeInTheDocument();
  });
});

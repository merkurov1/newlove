import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ArtEngineComposer from '../ArtEngineComposer';

afterEach(cleanup);

describe('ArtEngineComposer', () => {
  it('submits the auction URL with Enter', () => {
    const onSubmit = jest.fn();

    render(
      <ArtEngineComposer
        value="https://www.christies.com/en/lot/lot-1"
        onChange={() => {}}
        onSubmit={onSubmit}
        status="idle"
        processing={false}
        bottomOffset={0}
      />,
    );

    const input = screen.getByLabelText('Auction lot URL');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit while processing', () => {
    const onSubmit = jest.fn();

    render(
      <ArtEngineComposer
        value="https://www.christies.com/en/lot/lot-1"
        onChange={() => {}}
        onSubmit={onSubmit}
        status="extracting"
        processing
        bottomOffset={0}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('Auction lot URL'), {
      key: 'Enter',
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the current extraction status and keeps the composer at the bottom', () => {
    const { container } = render(
      <ArtEngineComposer
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        status="partial"
        processing={false}
        bottomOffset={240}
      />,
    );

    expect(screen.getByText('Partial extraction')).toBeInTheDocument();

    const shell = container.querySelector('[data-art-engine-composer]');
    expect(shell).toHaveStyle({ bottom: '240px' });
  });
});

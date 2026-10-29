import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PierrotChat from '@/components/PierrotChat';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

function OpenButton() {
  const { openChat } = usePierrot();

  return (
    <button type="button" onClick={openChat}>
      Open
    </button>
  );
}

describe('PierrotChat keyboard viewport', () => {
  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('anchors the window to the visual viewport while the keyboard is open', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 500,
        offsetTop: 50,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    render(
      <PierrotProvider>
        <PierrotChat />
        <OpenButton />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog');

    await waitFor(() => {
      expect(dialog).toHaveStyle({ height: '500px', maxHeight: '500px', top: '50px' });
    });

    expect(screen.getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
  });
});

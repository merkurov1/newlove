import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';
import PierrotChat from '@/components/PierrotChat';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1' },
    profile: { role: 'ADMIN' },
    roles: ['ADMIN'],
    isLoading: false,
  }),
}));

jest.mock('@/components/art-engine/ArtEngineWorkspace', () => {
  const ReactModule = require('react');

  return function MockArtEngineWorkspace({
    onModeCommand,
  }: {
    onModeCommand?: (text: string) => boolean;
  }) {
    return ReactModule.createElement(
      'div',
      { 'data-testid': 'art-engine-workspace' },
      ReactModule.createElement('span', null, 'Art Engine workspace'),
      ReactModule.createElement(
        'button',
        {
          type: 'button',
          onClick: () => onModeCommand?.('Обычный режим'),
        },
        'exit-art-engine'
      )
    );
  };
});

function OpenChatButton() {
  const { openChat } = usePierrot();

  return (
    <button type="button" onClick={openChat}>
      Open test chat
    </button>
  );
}

describe('Pierrot Art Engine mode UI', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem('pierrot_onboarding_v1', '1');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ reply: 'A quiet answer.', provider: 'test' }),
    }) as unknown as typeof fetch;
  });

  it('switches the chat body to Art Engine and returns to normal chat', async () => {
    render(
      <PierrotProvider>
        <PierrotChat />
        <OpenChatButton />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'Включи Art Engine' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(within(dialog).getByTestId('art-engine-workspace')).toBeInTheDocument();
    });
    expect(within(dialog).queryByRole('textbox', { name: 'Message Pierrot' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'exit-art-engine' }));

    await waitFor(() => {
      expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
    });
    expect(within(dialog).queryByTestId('art-engine-workspace')).toBeNull();
  });

  it('keeps the normal chat for a question about Art Engine', async () => {
    render(
      <PierrotProvider>
        <PierrotChat />
        <OpenChatButton />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open test chat' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: 'Message Pierrot' });

    fireEvent.change(input, { target: { value: 'Что такое Art Engine?' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(within(dialog).queryByTestId('art-engine-workspace')).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Message Pierrot' })).toBeInTheDocument();
  });
});

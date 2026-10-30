import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotMessageList } from '@/components/pierrot/PierrotConversation';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/unframed',
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1' },
    profile: { role: 'ADMIN' },
    roles: ['ADMIN'],
    isLoading: false,
  }),
}));

function Probe() {
  const { sendMessage } = usePierrot();

  return (
    <div>
      <button type="button" onClick={() => void sendMessage('What does UNFRAMED say?')}>
        send
      </button>
      <PierrotMessageList />
    </div>
  );
}

describe('Pierrot UNFRAMED evidence display', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'Grounded answer',
        admin: true,
        conversationId: '11111111-1111-4111-8111-111111111111',
        rag: {
          mode: 'unframed',
          outcome: 'relevant_results',
          sources: [
            {
              chunkId: 'chk_b03d6972f4cf898635f1cf65b58aaeb2',
              heading: 'CHAPTER 01: THE ARCHIVE',
              sectionPath: ['PART I', 'CHAPTER 01: THE ARCHIVE'],
              sectionIndex: 1,
              lineStart: 10,
              lineEnd: 12,
              similarity: 0.82,
              excerpt: 'Short excerpt from the manuscript.',
            },
          ],
        },
      }),
    }) as unknown as typeof fetch;
  });

  it('shows collapsed sources after an owner answer', async () => {
    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByText('Grounded answer')).toBeInTheDocument();
      expect(screen.getByText('Sources · 1')).toBeInTheDocument();
      expect(screen.getByText('CHAPTER 01: THE ARCHIVE')).toBeInTheDocument();
      expect(screen.getByText('Short excerpt from the manuscript.')).toBeInTheDocument();
      expect(screen.getByText('0.820')).toBeInTheDocument();
    });
  });
});
